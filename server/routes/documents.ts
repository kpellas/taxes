import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { buildDocumentIndex, refreshIndex, searchDocuments, getDocumentsForProperty } from '../services/documentIndex.js';
import { syncFileIndex, analyzeGaps } from '../services/documentIndexSync.js';
import {
  getAllDocuments, getDocumentsByProperty, upsertDocument, findDuplicateDocument,
  addDocumentLink, deleteDocument, renameDocumentByPath, updateDocumentProperties,
  setDocumentVerified, updateDocumentField, getAllTemplates, getTemplatesByEvent,
  upsertTemplate, type DbDocument,
} from '../db.js';

const router = Router();

function getPropertiesPath(): string {
  return process.env.PROPERTIES_PATH || path.resolve(__dirname, '../../../PROPERTIES');
}

// GET /api/documents/index — full document catalog
router.get('/index', (_req: Request, res: Response) => {
  const propertiesPath = getPropertiesPath();
  const propertyId = _req.query.property as string | undefined;

  if (!fs.existsSync(propertiesPath)) {
    res.status(404).json({ error: `PROPERTIES folder not found at ${propertiesPath}` });
    return;
  }

  const docs = propertyId
    ? getDocumentsForProperty(propertiesPath, propertyId)
    : buildDocumentIndex(propertiesPath);

  // Strip absolutePath from response for security
  const safeDocs = docs.map(({ absolutePath, ...rest }) => rest);
  res.json({ documents: safeDocs, total: safeDocs.length });
});

// GET /api/documents/refresh — force rescan
router.get('/refresh', (_req: Request, res: Response) => {
  const propertiesPath = getPropertiesPath();
  const docs = refreshIndex(propertiesPath);
  res.json({ documents: docs.length, message: 'Index refreshed' });
});

// GET /api/documents/serve?path=<relative-path> — serve actual file
router.get('/serve', (req: Request, res: Response) => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    res.status(400).json({ error: 'path query parameter required' });
    return;
  }

  const propertiesPath = getPropertiesPath();
  const fullPath = path.resolve(propertiesPath, relativePath);

  // Security: ensure the resolved path is within PROPERTIES folder
  if (!fullPath.startsWith(propertiesPath)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (ext === '.pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
  }
  res.sendFile(fullPath);
});

// GET /api/documents/search?q=<query> — search filenames
router.get('/search', (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query) {
    res.status(400).json({ error: 'q query parameter required' });
    return;
  }

  const propertiesPath = getPropertiesPath();
  const results = searchDocuments(propertiesPath, query);
  const safeResults = results.map(({ absolutePath, ...rest }) => rest);
  res.json({ results: safeResults, total: safeResults.length });
});

// POST /api/documents/rename — rename a file
router.post('/rename', (req: Request, res: Response) => {
  const { relativePath, newFilename } = req.body as { relativePath?: string; newFilename?: string };
  if (!relativePath || !newFilename) {
    res.status(400).json({ error: 'relativePath and newFilename required' });
    return;
  }

  // Prevent directory traversal — only block path separators
  const trimmed = newFilename.trim();
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.length === 0) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const propertiesPath = getPropertiesPath();
  const fullPath = path.resolve(propertiesPath, relativePath);

  if (!fullPath.startsWith(propertiesPath)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const dir = path.dirname(fullPath);
  const newPath = path.resolve(dir, trimmed);

  // Safety: ensure new path stays within PROPERTIES
  if (!newPath.startsWith(propertiesPath)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (fs.existsSync(newPath)) {
    res.status(409).json({ error: 'A file with that name already exists' });
    return;
  }

  fs.renameSync(fullPath, newPath);
  refreshIndex(propertiesPath);

  const newRelativePath = path.relative(propertiesPath, newPath);

  // Update global document index — canonical name is filename without extension
  const newCanonicalName = trimmed.replace(/\.[^.]+$/, '');
  renameDocumentByPath(relativePath, newRelativePath, newCanonicalName);

  res.json({ success: true, newRelativePath, newFilename });
});

// ══════════════════════════════════════════════════════════════
// Global Document Index API
// ══════════════════════════════════════════════════════════════

// GET /api/documents/global — all documents in the global index
router.get('/global', (req: Request, res: Response) => {
  const propertyId = req.query.property as string | undefined;
  const docs = propertyId ? getDocumentsByProperty(propertyId) : getAllDocuments();
  res.json({ documents: docs, total: docs.length });
});

// POST /api/documents/global — add a document to the global index (from chat, upload, email, etc.)
router.post('/global', (req: Request, res: Response) => {
  const {
    canonical_name, category, provider, doc_date,
    source_type, source_ref, file_path, property_id,
    entity_id, loan_id, metadata, links, added_via,
  } = req.body;

  if (!canonical_name || !category || !source_type) {
    res.status(400).json({ error: 'canonical_name, category, and source_type are required' });
    return;
  }

  // Check for duplicates (same file_path, or same name+category+property)
  const existing = findDuplicateDocument(file_path || null, canonical_name, category, property_id || null);
  if (existing) {
    res.status(409).json({ error: 'Document already exists', existingId: existing.id, existingName: existing.canonical_name });
    return;
  }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  upsertDocument({
    id,
    canonical_name,
    category,
    provider: provider || null,
    doc_date: doc_date || null,
    source_type,
    source_ref: source_ref || null,
    file_path: file_path || null,
    property_id: property_id || null,
    entity_id: entity_id || null,
    loan_id: loan_id || null,
    metadata: metadata || {},
    added_via: added_via || 'manual',
  });

  // Add links if provided
  if (links && Array.isArray(links)) {
    for (const link of links) {
      if (link.link_type && link.link_id) {
        addDocumentLink(id, link.link_type, link.link_id);
      }
    }
  }

  // Auto-link to property if specified
  if (property_id) {
    addDocumentLink(id, 'property', property_id);
  }

  res.json({ id, success: true });
});

// PATCH /api/documents/global/:id/field — update a single field
router.patch('/global/:id/field', (req: Request, res: Response) => {
  const { field, value } = req.body;
  if (!field) { res.status(400).json({ error: 'field required' }); return; }
  updateDocumentField(req.params.id, field, value ?? null);
  res.json({ success: true });
});

// PATCH /api/documents/global/:id/verified — set verified status (0=none, 1=verified, 2=needs attention)
router.patch('/global/:id/verified', (req: Request, res: Response) => {
  const { verified } = req.body;
  setDocumentVerified(req.params.id, Number(verified) || 0);
  res.json({ success: true });
});

// PATCH /api/documents/global/:id/properties — update security + purpose property links
router.patch('/global/:id/properties', (req: Request, res: Response) => {
  const { property_id, purpose_property_id } = req.body;
  updateDocumentProperties(req.params.id, property_id ?? null, purpose_property_id ?? null);
  res.json({ success: true });
});

// DELETE /api/documents/global/:id — remove a document from the index
router.delete('/global/:id', (req: Request, res: Response) => {
  deleteDocument(req.params.id);
  res.json({ success: true });
});

// POST /api/documents/global/:id/link — add a link to an existing document
router.post('/global/:id/link', (req: Request, res: Response) => {
  const { link_type, link_id } = req.body;
  if (!link_type || !link_id) {
    res.status(400).json({ error: 'link_type and link_id required' });
    return;
  }
  addDocumentLink(req.params.id, link_type, link_id);
  res.json({ success: true });
});

// POST /api/documents/global/sync — rescan files and sync to global index
router.post('/global/sync', (_req: Request, res: Response) => {
  const propertiesPath = getPropertiesPath();
  if (!fs.existsSync(propertiesPath)) {
    res.status(404).json({ error: 'PROPERTIES folder not found' });
    return;
  }
  refreshIndex(propertiesPath);
  const result = syncFileIndex(propertiesPath);
  res.json(result);
});

// POST /api/documents/gaps/batch — gap analysis for all events on a property at once
router.post('/gaps/batch', (req: Request, res: Response) => {
  const { propertyId, events } = req.body as {
    propertyId: string;
    events: { eventType: string; lenderFrom?: string; lenderTo?: string; loanId?: string; isHL?: boolean; purchaseLenders?: string[]; accountNumbers?: string[]; dateFrom?: string; dateTo?: string }[];
  };

  if (!propertyId || !events) {
    res.status(400).json({ error: 'propertyId and events array required' });
    return;
  }

  const results: Record<string, ReturnType<typeof analyzeGaps>> = {};
  for (const evt of events) {
    const key = evt.lenderFrom
      ? `${evt.eventType}-${evt.lenderFrom}-${evt.lenderTo}`
      : evt.eventType;
    results[key] = analyzeGaps(propertyId, evt.eventType, {
      lenderFrom: evt.lenderFrom,
      lenderTo: evt.lenderTo,
      loanId: evt.loanId,
      isHL: evt.isHL,
      purchaseLenders: evt.purchaseLenders,
      accountNumbers: evt.accountNumbers,
      dateFrom: evt.dateFrom,
      dateTo: evt.dateTo,
    });
  }

  res.json({ propertyId, results });
});

// GET /api/documents/gaps — gap analysis for a property + event type
router.get('/gaps', (req: Request, res: Response) => {
  const propertyId = req.query.property as string;
  const eventType = req.query.event as string;

  if (!propertyId || !eventType) {
    res.status(400).json({ error: 'property and event query params required' });
    return;
  }

  const lenderFrom = req.query.lenderFrom as string | undefined;
  const lenderTo = req.query.lenderTo as string | undefined;
  const loanId = req.query.loanId as string | undefined;
  const isHL = req.query.isHL === 'true';

  const gaps = analyzeGaps(propertyId, eventType, { lenderFrom, lenderTo, loanId, isHL });
  res.json({
    propertyId,
    eventType,
    results: gaps.map(g => ({
      template: g.template,
      matched: g.matched.length,
      matchedDocs: g.matched,
      missing: g.missing,
    })),
    totalRequired: gaps.filter(g => g.template.required).length,
    totalMissing: gaps.filter(g => g.missing && g.template.required).length,
  });
});

// ══════════════════════════════════════════════════════════════
// Templates API
// ══════════════════════════════════════════════════════════════

// GET /api/documents/templates — all templates
router.get('/templates', (_req: Request, res: Response) => {
  res.json({ templates: getAllTemplates() });
});

// GET /api/documents/templates/:eventType — templates for an event type
router.get('/templates/:eventType', (req: Request, res: Response) => {
  res.json({ templates: getTemplatesByEvent(req.params.eventType) });
});

// POST /api/documents/templates — create/update a template
router.post('/templates', (req: Request, res: Response) => {
  const { id, event_type, name, category, description, required, match_hints, applies_to } = req.body;
  if (!id || !event_type || !name || !category) {
    res.status(400).json({ error: 'id, event_type, name, and category are required' });
    return;
  }
  upsertTemplate({ id, event_type, name, category, description, required, match_hints, applies_to });
  res.json({ success: true });
});

export { router as documentsRouter };
