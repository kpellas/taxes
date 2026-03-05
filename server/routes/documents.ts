import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { buildDocumentIndex, refreshIndex, searchDocuments, getDocumentsForProperty } from '../services/documentIndex.js';

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
  res.json({ success: true, newRelativePath, newFilename });
});

export { router as documentsRouter };
