import { Router, Request, Response } from 'express';
import {
  checkForNewEmails,
  loadEmailLog,
  updateEmailProperty,
  isImapConfigured,
} from '../services/emailIngestion.js';

const router = Router();

// GET /api/email/list — all emails, newest first
router.get('/list', (_req: Request, res: Response) => {
  const emails = loadEmailLog();
  emails.sort((a, b) => b.date.localeCompare(a.date));
  // Return without full bodyText to keep payload small
  const summaries = emails.map(({ bodyText, ...rest }) => rest);
  res.json({ emails: summaries, total: emails.length });
});

// GET /api/email/stats — quick counts
router.get('/stats', (_req: Request, res: Response) => {
  const emails = loadEmailLog();
  const matched = emails.filter((e) => e.propertyId !== null).length;
  const unmatched = emails.filter((e) => e.propertyId === null).length;
  const withAttachments = emails.filter((e) => e.attachments.length > 0).length;
  res.json({
    total: emails.length,
    matched,
    unmatched,
    withAttachments,
    configured: isImapConfigured(),
  });
});

// GET /api/email/:id — full email detail including body
router.get('/:id', (req: Request, res: Response) => {
  const emails = loadEmailLog();
  const email = emails.find((e) => e.id === req.params.id);
  if (!email) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }
  res.json(email);
});

// PATCH /api/email/:id — update property assignment
router.patch('/:id', (req: Request, res: Response) => {
  const { propertyId } = req.body;
  const updated = updateEmailProperty(req.params.id, propertyId ?? null);
  if (!updated) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }
  res.json(updated);
});

// POST /api/email/check — trigger manual check
router.post('/check', async (_req: Request, res: Response) => {
  if (!isImapConfigured()) {
    res.status(400).json({ error: 'IMAP not configured. Set IMAP_SERVER, IMAP_USERNAME, IMAP_PASSWORD in .env' });
    return;
  }

  try {
    const result = await checkForNewEmails();
    res.json(result);
  } catch (err) {
    console.error('Manual email check failed:', err);
    res.status(500).json({ error: 'Email check failed' });
  }
});

export { router as emailRouter };
