import { Router, Request, Response } from 'express';
import { runPythonScraper, getScraperStatus, getAllScraperStatuses, updateScraperStatus, appendScraperOutput, distributeScraperOutput } from '../services/scraperRunner.js';
import { scrapeAllBankwest } from '../services/bankwestScraper.js';
import db from '../db.js';
import fs from 'fs';
import path from 'path';

const router = Router();

const SCRAPERS_DIR = path.resolve(import.meta.dirname, '../../scrapers');

// GET /api/scrapers/status — status of all scrapers
router.get('/status', (_req: Request, res: Response) => {
  res.json({ scrapers: getAllScraperStatuses() });
});

/** Extract YYYY-MM-DD dates from filenames with YYYY.MM.DD prefix */
function extractDatesFromPdfs(dir: string): { count: number; dates: string[] } {
  const dates: string[] = [];
  let count = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.pdf'))) {
    count++;
    const m = f.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
    if (m) dates.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  return { count, dates };
}

/**
 * Scan a scraper's downloads folder for file counts and date ranges.
 */
function scanDownloads(scraper: string): { count: number; oldest: string | null; latest: string | null } {
  const downloadsDir = path.join(SCRAPERS_DIR, 'downloads');

  const dates: string[] = [];
  let count = 0;

  if (scraper === 'macquarie') {
    if (!fs.existsSync(downloadsDir)) return { count: 0, oldest: null, latest: null };
    const dirs = fs.readdirSync(downloadsDir).filter(d => d.startsWith('macquarie_')).sort().reverse();
    for (const dir of dirs) {
      const stmtDir = path.join(downloadsDir, dir, 'statements');
      if (!fs.existsSync(stmtDir)) continue;
      const r = extractDatesFromPdfs(stmtDir);
      count = r.count;
      dates.push(...r.dates);
      break; // only latest run
    }
  } else if (scraper === 'bankaustralia') {
    if (!fs.existsSync(downloadsDir)) return { count: 0, oldest: null, latest: null };
    const dirs = fs.readdirSync(downloadsDir).filter(d => d.startsWith('bankaustralia_')).sort().reverse();
    for (const dir of dirs) {
      const stmtDir = path.join(downloadsDir, dir, 'statements');
      if (!fs.existsSync(stmtDir)) continue;
      const r = extractDatesFromPdfs(stmtDir);
      count = r.count;
      dates.push(...r.dates);
      break;
    }
  } else if (scraper === 'propertyme') {
    if (!fs.existsSync(downloadsDir)) return { count: 0, oldest: null, latest: null };
    // PropertyMe filenames aren't standardised — count files and use folder date as the scrape date
    const dirs = fs.readdirSync(downloadsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const dir of dirs) {
      const docsDir = path.join(downloadsDir, dir, 'documents');
      if (!fs.existsSync(docsDir)) continue;
      for (const prop of fs.readdirSync(docsDir, { withFileTypes: true }).filter(d => d.isDirectory())) {
        const pdfs = fs.readdirSync(path.join(docsDir, prop.name)).filter(f => f.endsWith('.pdf'));
        count += pdfs.length;
      }
      // Use the folder date as the "latest" date (when the scrape ran)
      dates.push(dir);
      break;
    }
  } else if (scraper === 'bankwest') {
    // Bankwest stores downloads in data/bankwest-statements/
    const bwDir = path.resolve(SCRAPERS_DIR, '../data/bankwest-statements');
    if (!fs.existsSync(bwDir)) return { count: 0, oldest: null, latest: null };
    const r = extractDatesFromPdfs(bwDir);
    count = r.count;
    dates.push(...r.dates);
  }

  dates.sort();
  return {
    count,
    oldest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
  };
}

// GET /api/scrapers/summary — document counts and latest dates per scraper source
router.get('/summary', (_req: Request, res: Response) => {
  const scraperQueries: Record<string, { providers: string[]; pathPatterns: string[] }> = {
    bankwest: { providers: ['Bankwest'], pathPatterns: ['%/Bankwest/%', '%Bankwest%statement%'] },
    macquarie: { providers: ['Macquarie'], pathPatterns: ['%/Macquarie/%'] },
    propertyme: { providers: ['PropertyMe', 'SPG', 'NCL'], pathPatterns: ['%/PropertyMe/%'] },
    bankaustralia: { providers: ['Bank Australia'], pathPatterns: ['%/Bank Australia/%'] },
  };

  const summary: Record<string, {
    totalDocs: number; latestDate: string | null; oldestDate: string | null;
    downloaded: number; downloadedLatest: string | null; downloadedOldest: string | null;
  }> = {};

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

    const dl = scanDownloads(scraper);

    summary[scraper] = {
      totalDocs: row?.total || 0,
      latestDate: row?.latest || null,
      oldestDate: row?.oldest || null,
      downloaded: dl.count,
      downloadedLatest: dl.latest,
      downloadedOldest: dl.oldest,
    };
  }

  res.json({ summary });
});

// POST /api/scrapers/distribute — distribute downloaded files to PROPERTIES and re-index
router.post('/distribute', (_req: Request, res: Response) => {
  const results: Record<string, number> = {};
  for (const scraper of ['macquarie', 'propertyme', 'bankaustralia']) {
    try {
      results[scraper] = distributeScraperOutput(scraper);
    } catch (err: any) {
      results[scraper] = -1;
    }
  }
  const total = Object.values(results).filter(n => n > 0).reduce((a, b) => a + b, 0);
  res.json({ distributed: results, total });
});

// POST /api/scrapers/:scraper/distribute — distribute a single scraper's downloads
router.post('/:scraper/distribute', (req: Request, res: Response) => {
  const { scraper } = req.params;
  try {
    const count = distributeScraperOutput(scraper);
    res.json({ scraper, distributed: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
    // Bankwest distributes internally via bankwestScraper.ts — count what was copied
    const totalCopied = results.reduce((n, r) => n + (r.copied ?? 0), 0);
    updateScraperStatus('bankwest', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      downloaded: totalDownloads,
      distributed: totalCopied,
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
