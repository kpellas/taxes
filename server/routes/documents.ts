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

export { router as documentsRouter };
