import { Router, Request, Response } from 'express';
import { runPythonScraper, getScraperStatus, getAllScraperStatuses, updateScraperStatus, appendScraperOutput } from '../services/scraperRunner.js';
import { scrapeAllBankwest } from '../services/bankwestScraper.js';
import db from '../db.js';

const router = Router();

// GET /api/scrapers/status — status of all scrapers
router.get('/status', (_req: Request, res: Response) => {
  res.json({ scrapers: getAllScraperStatuses() });
});

// GET /api/scrapers/summary — document counts and latest dates per scraper source
router.get('/summary', (_req: Request, res: Response) => {
  // Match by provider name OR by file path containing the source folder
  const scraperQueries: Record<string, { providers: string[]; pathPatterns: string[] }> = {
    bankwest: { providers: ['Bankwest'], pathPatterns: ['%/Bankwest/%', '%Bankwest%statement%'] },
    macquarie: { providers: ['Macquarie'], pathPatterns: ['%/Macquarie/%'] },
    propertyme: { providers: ['PropertyMe', 'SPG', 'NCL'], pathPatterns: ['%/PropertyMe/%'] },
    bankaustralia: { providers: ['Bank Australia'], pathPatterns: ['%/Bank Australia/%'] },
  };

  const summary: Record<string, { totalDocs: number; latestDate: string | null; oldestDate: string | null }> = {};

  for (const [scraper, { providers, pathPatterns }] of Object.entries(scraperQueries)) {
    const providerPlaceholders = providers.map(() => 'provider = ?').join(' OR ');
    const pathPlaceholders = pathPatterns.map(() => 'file_path LIKE ?').join(' OR ');
    const where = `(${providerPlaceholders} OR ${pathPlaceholders})`;
    const params = [...providers, ...pathPatterns];

    const row = db.prepare(`
      SELECT COUNT(*) as total,
             MAX(doc_date) as latest,
             MIN(doc_date) as oldest
      FROM document_index
      WHERE ${where}
    `).get(...params) as { total: number; latest: string | null; oldest: string | null } | undefined;

    summary[scraper] = {
      totalDocs: row?.total || 0,
      latestDate: row?.latest || null,
      oldestDate: row?.oldest || null,
    };
  }

  res.json({ summary });
});

// GET /api/scrapers/status/:scraper — status of a specific scraper
router.get('/status/:scraper', (req: Request, res: Response) => {
  res.json(getScraperStatus(req.params.scraper));
});

// POST /api/scrapers/macquarie — run Macquarie scraper
router.post('/macquarie', (req: Request, res: Response) => {
  const { monthly, dateFrom, dateTo } = req.body || {};
  const args: string[] = [];
  if (monthly) args.push('--monthly');
  if (dateFrom) args.push('--from', dateFrom);
  if (dateTo) args.push('--to', dateTo);

  try {
    const status = runPythonScraper('macquarie', args);
    if (status.status === 'running' && status.startedAt !== new Date().toISOString().slice(0, 16)) {
      // Already running from a previous call
      res.json({ status: 'already_running', ...status });
    } else {
      res.json({ status: 'started', message: 'Macquarie scraper started — complete 2FA in the browser window', ...status });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scrapers/propertyme — run PropertyMe scraper
router.post('/propertyme', (_req: Request, res: Response) => {
  try {
    const status = runPythonScraper('propertyme');
    res.json({ status: 'started', message: 'PropertyMe scraper started — browser will open', ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scrapers/bankaustralia — run Bank Australia scraper
router.post('/bankaustralia', (req: Request, res: Response) => {
  const { monthly, dateFrom, dateTo } = req.body || {};
  const args: string[] = [];
  if (monthly) args.push('--monthly');
  if (dateFrom) args.push('--from', dateFrom);
  if (dateTo) args.push('--to', dateTo);

  try {
    const status = runPythonScraper('bankaustralia', args);
    res.json({ status: 'started', message: 'Bank Australia scraper started — browser will open', ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scrapers/bankwest — run Bankwest scraper (TypeScript, built-in)
router.post('/bankwest', async (req: Request, res: Response) => {
  const current = getScraperStatus('bankwest');
  if (current.status === 'running') {
    return res.json({ status: 'already_running', ...current });
  }

  const { accountFilter } = req.body || {};

  updateScraperStatus('bankwest', {
    status: 'running',
    startedAt: new Date().toISOString(),
    output: ['Starting Bankwest scraper...'],
    completedAt: undefined,
    error: undefined,
    distributed: undefined,
    downloaded: undefined,
    skipped: undefined,
  });

  res.json({ status: 'started', scraper: 'bankwest', message: 'Browser opening — complete 2FA if prompted' });

  // Intercept console.log to capture output
  const origLog = console.log;
  const origErr = console.error;
  const capture = (prefix: string) => (...args: unknown[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    if (msg.includes('[Bankwest]')) {
      appendScraperOutput('bankwest', msg.replace('[Bankwest] ', ''));
    }
    (prefix === 'log' ? origLog : origErr)(...args);
  };
  console.log = capture('log') as typeof console.log;
  console.error = capture('err') as typeof console.error;

  try {
    const results = await scrapeAllBankwest({ accountFilter, headless: false });
    const totalDownloads = results.reduce((n, r) => n + r.downloads.length, 0);
    const totalErrors = results.reduce((n, r) => n + r.errors.length, 0);
    appendScraperOutput('bankwest', `Done: ${totalDownloads} statements, ${totalErrors} errors`);
    updateScraperStatus('bankwest', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      downloaded: totalDownloads,
    });
  } catch (err: any) {
    updateScraperStatus('bankwest', {
      status: 'error',
      completedAt: new Date().toISOString(),
      error: err.message,
    });
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
});

export { router as scrapersRouter };
