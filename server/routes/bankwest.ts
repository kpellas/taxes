import { Router, Request, Response } from 'express';
import { scrapeBankwest, scrapeAllBankwest } from '../services/bankwestScraper.js';

const router = Router();

// POST /api/bankwest/scrape — scrape one PAN
router.post('/scrape', async (req: Request, res: Response) => {
  const { panIndex = 0, accountFilter } = req.body;

  const pans = [
    { pan: process.env.BANKWEST_PAN_1, pass: process.env.BANKWEST_PASS_1 },
    { pan: process.env.BANKWEST_PAN_2, pass: process.env.BANKWEST_PASS_2 },
  ];

  const cred = pans[panIndex];
  if (!cred?.pan || !cred?.pass) {
    return res.status(400).json({ error: `PAN ${panIndex + 1} not configured` });
  }

  // Run in background — scraping takes minutes
  res.json({ status: 'started', pan: cred.pan, message: 'Browser opening — complete 2FA if prompted' });

  try {
    const result = await scrapeBankwest({
      pan: cred.pan,
      password: cred.pass,
      accountFilter,
      headless: false,
    });
    console.log('[Bankwest] Scrape result:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('[Bankwest] Scrape error:', err);
  }
});

// POST /api/bankwest/scrape-all — scrape both PANs sequentially
router.post('/scrape-all', async (req: Request, res: Response) => {
  const { accountFilter } = req.body;

  res.json({ status: 'started', message: 'Scraping both PANs — complete 2FA if prompted' });

  try {
    const results = await scrapeAllBankwest({ accountFilter, headless: false });
    console.log('[Bankwest] All scrape results:', JSON.stringify(results, null, 2));
  } catch (err: any) {
    console.error('[Bankwest] Scrape-all error:', err);
  }
});

// GET /api/bankwest/downloads — list downloaded statement files
router.get('/downloads', async (_req: Request, res: Response) => {
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.resolve(import.meta.dirname, '../../data/bankwest-statements');

  if (!fs.existsSync(dir)) {
    return res.json({ files: [] });
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.pdf') || f.endsWith('.csv'))
    .map(f => ({
      name: f,
      path: path.join(dir, f),
      size: fs.statSync(path.join(dir, f)).size,
      modified: fs.statSync(path.join(dir, f)).mtime,
    }))
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());

  res.json({ files });
});

export { router as bankwestRouter };
