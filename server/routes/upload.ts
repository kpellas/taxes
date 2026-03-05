import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

function getUploadsPath(): string {
  return process.env.UPLOADS_PATH || path.resolve(__dirname, '../../uploads');
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const propertyId = req.body.propertyId || 'general';
    const uploadDir = path.join(getUploadsPath(), propertyId);
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// POST /api/upload — upload a file linked to an evidence item
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const { evidenceItemId, propertyId, category } = req.body;

  const result = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    evidenceItemId: evidenceItemId || null,
    propertyId: propertyId || 'general',
    category: category || 'other',
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: path.relative(getUploadsPath(), req.file.path),
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
  };

  res.json(result);
});

// GET /api/upload/list?propertyId=<id> — list uploads for a property
router.get('/list', (req: Request, res: Response) => {
  const propertyId = (req.query.propertyId as string) || 'general';
  const uploadDir = path.join(getUploadsPath(), propertyId);

  if (!fs.existsSync(uploadDir)) {
    res.json({ files: [] });
    return;
  }

  const files = fs.readdirSync(uploadDir).map(filename => {
    const filePath = path.join(uploadDir, filename);
    const stat = fs.statSync(filePath);
    return {
      filename,
      path: path.join(propertyId, filename),
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
    };
  });

  res.json({ files });
});

// GET /api/upload/serve?path=<relative-path> — serve uploaded file
router.get('/serve', (req: Request, res: Response) => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    res.status(400).json({ error: 'path query parameter required' });
    return;
  }

  const uploadsPath = getUploadsPath();
  const fullPath = path.resolve(uploadsPath, relativePath);

  if (!fullPath.startsWith(uploadsPath)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.sendFile(fullPath);
});

export { router as uploadRouter };
