import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { refreshIndex } from './documentIndex.js';
import { syncFileIndex } from './documentIndexSync.js';
import db from '../db.js';

const SCRAPERS_DIR = path.resolve(import.meta.dirname, '../../scrapers');
const PROPERTIES_PATH = () => process.env.PROPERTIES_PATH || path.resolve(import.meta.dirname, '../../../PROPERTIES');

// ── Property folder mappings ──

const PROPERTY_FOLDERS: Record<string, string> = {
  'Chisholm':     '1 - CHISHOLM (WATERFORD)',
  'Heddon Greta': '2 - HEDDON GRETA (AVERY)',
  'Bannerman':    '3 - SOUTHWEST ROCKS (BANNERMAN)',
  'Old Bar':      '4 - OLD BAR (EMERALD FIELDS)',
  'Lennox':       '5 - LENNOX HEADS',
};

// Macquarie account labels → property name (for distribution)
const MACQUARIE_ACCOUNT_MAP: Record<string, string | null> = {
  'Main_Spending_3460':    null,            // personal, goes to STATEMENTS/Macquarie
  'Rental_Expenses_0535':  null,            // shared, goes to STATEMENTS/Macquarie
  'Second_Savings_8707':   null,            // savings, goes to STATEMENTS/Macquarie
  'Schniggle':             'Old Bar',       // Schniggle trust = Old Bar
  'Loan_Old_Bar_2214':     'Old Bar',
};

export interface ScraperStatus {
  scraper: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt?: string;
  completedAt?: string;
  pid?: number;
  output: string[];
  error?: string;
  distributed?: number;
  skipped?: number;
  downloaded?: number;
}

// In-memory status per scraper
const scraperStatuses: Record<string, ScraperStatus> = {};

export function getScraperStatus(scraper: string): ScraperStatus {
  return scraperStatuses[scraper] || { scraper, status: 'idle', output: [] };
}

export function getAllScraperStatuses(): ScraperStatus[] {
  return ['macquarie', 'propertyme', 'bankaustralia', 'bankwest'].map(s => getScraperStatus(s));
}

/**
 * Update scraper status externally (for non-Python scrapers like Bankwest).
 */
export function updateScraperStatus(scraper: string, update: Partial<ScraperStatus>) {
  const current = scraperStatuses[scraper] || { scraper, status: 'idle', output: [] };
  scraperStatuses[scraper] = { ...current, ...update, scraper };
}

export function appendScraperOutput(scraper: string, line: string) {
  const current = scraperStatuses[scraper] || { scraper, status: 'idle', output: [] };
  current.output.push(line);
  if (current.output.length > 200) current.output = current.output.slice(-200);
  scraperStatuses[scraper] = current;
}

/**
 * Run a Python scraper as a child process.
 * Returns immediately — check status via getScraperStatus().
 */
export function runPythonScraper(
  scraper: 'macquarie' | 'propertyme' | 'bankaustralia',
  args: string[] = [],
): ScraperStatus {
  const scriptMap: Record<string, string> = {
    macquarie: 'scraper_macquarie.py',
    propertyme: 'scraper.py',
    bankaustralia: 'scraper_bankaustralia.py',
  };

  const script = scriptMap[scraper];
  if (!script) throw new Error(`Unknown scraper: ${scraper}`);

  const scriptPath = path.join(SCRAPERS_DIR, script);
  if (!fs.existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`);

  // Don't start if already running
  const current = scraperStatuses[scraper];
  if (current?.status === 'running') {
    return current;
  }

  const status: ScraperStatus = {
    scraper,
    status: 'running',
    startedAt: new Date().toISOString(),
    output: [],
  };
  scraperStatuses[scraper] = status;

  console.log(`[Scraper] Starting ${scraper}: python3 ${script} ${args.join(' ')}`);

  const proc = spawn('python3', [scriptPath, ...args], {
    cwd: SCRAPERS_DIR,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  status.pid = proc.pid;

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      status.output.push(line);
      console.log(`[${scraper}] ${line}`);
    }
    // Keep last 200 lines
    if (status.output.length > 200) status.output = status.output.slice(-200);
  });

  proc.stderr.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      status.output.push(`[stderr] ${line}`);
    }
  });

  proc.on('close', (code) => {
    status.completedAt = new Date().toISOString();
    if (code === 0) {
      status.status = 'completed';
      console.log(`[Scraper] ${scraper} completed successfully`);
      // Distribute files after successful scrape
      try {
        const n = distributeScraperOutput(scraper);
        status.distributed = n;
        console.log(`[Scraper] ${scraper}: distributed ${n} files`);
      } catch (err: any) {
        console.error(`[Scraper] ${scraper} distribution error:`, err.message);
        status.error = `Distribution failed: ${err.message}`;
      }
    } else {
      status.status = 'error';
      status.error = `Process exited with code ${code}`;
      console.error(`[Scraper] ${scraper} failed with code ${code}`);
    }
  });

  proc.on('error', (err) => {
    status.status = 'error';
    status.error = err.message;
    status.completedAt = new Date().toISOString();
    console.error(`[Scraper] ${scraper} process error:`, err.message);
  });

  return status;
}

/**
 * After a scraper finishes, find its output files and copy them to PROPERTIES.
 * Then re-index and mark as 'scraper'.
 */
export function distributeScraperOutput(scraper: string): number {
  const propertiesPath = PROPERTIES_PATH();
  if (!fs.existsSync(propertiesPath)) return 0;

  const downloadsDir = path.join(SCRAPERS_DIR, 'downloads');
  if (!fs.existsSync(downloadsDir)) return 0;

  let copied = 0;
  const copiedFiles: string[] = [];

  if (scraper === 'macquarie') {
    copied = distributeMacquarie(downloadsDir, propertiesPath, copiedFiles);
  } else if (scraper === 'propertyme') {
    copied = distributePropertyMe(downloadsDir, propertiesPath, copiedFiles);
  } else if (scraper === 'bankaustralia') {
    copied = distributeBankAustralia(downloadsDir, propertiesPath, copiedFiles);
  }

  if (copied > 0) {
    console.log(`[Scraper] Copied ${copied} files to PROPERTIES — re-indexing...`);
    refreshIndex(propertiesPath);
    const result = syncFileIndex(propertiesPath);
    console.log(`[Scraper] Re-indexed: ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.total} total`);

    // Mark distributed files as 'scraper'
    for (const filename of copiedFiles) {
      db.prepare(`UPDATE document_index SET added_via = 'scraper' WHERE file_path LIKE ?`).run(`%${filename}`);
    }
  }

  return copied;
}

/**
 * Macquarie: downloads/macquarie_YYYY-MM-DD/statements/*.pdf
 * Filename: YYYY.MM.DD - Macquarie - Account Name - statement type.pdf
 * Distribution: extract property from account name, put in {property}/STATEMENTS/Macquarie/
 */
function distributeMacquarie(downloadsDir: string, propertiesPath: string, copiedFiles: string[]): number {
  let copied = 0;
  // Find the most recent macquarie download folder
  const macDirs = fs.readdirSync(downloadsDir)
    .filter(d => d.startsWith('macquarie_'))
    .sort()
    .reverse();

  for (const macDir of macDirs) {
    const stmtDir = path.join(downloadsDir, macDir, 'statements');
    if (!fs.existsSync(stmtDir)) continue;

    const pdfs = fs.readdirSync(stmtDir).filter(f => f.endsWith('.pdf'));
    for (const pdf of pdfs) {
      // Extract account name: "YYYY.MM.DD - Macquarie - Account Name - type.pdf"
      const match = pdf.match(/^\d{4}\.\d{2}\.\d{2} - Macquarie - (.+?) - /);
      const accountName = match?.[1] || '';

      // Find property for this account
      let propertyName: string | null = null;
      for (const [label, prop] of Object.entries(MACQUARIE_ACCOUNT_MAP)) {
        const displayName = label.replace(/_/g, ' ').replace(/\s+\d+$/, '');
        if (accountName.toLowerCase().includes(displayName.toLowerCase()) ||
            accountName.toLowerCase().includes(label.toLowerCase())) {
          propertyName = prop;
          break;
        }
      }
      // Also check for property names directly in account name
      if (!propertyName) {
        for (const [prop] of Object.entries(PROPERTY_FOLDERS)) {
          if (accountName.toLowerCase().includes(prop.toLowerCase())) {
            propertyName = prop;
            break;
          }
        }
      }

      const destFolder = propertyName && PROPERTY_FOLDERS[propertyName]
        ? path.join(propertiesPath, PROPERTY_FOLDERS[propertyName], 'STATEMENTS', 'Macquarie')
        : path.join(propertiesPath, 'STATEMENTS', 'Macquarie');

      fs.mkdirSync(destFolder, { recursive: true });
      const destPath = path.join(destFolder, pdf);
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(path.join(stmtDir, pdf), destPath);
        copiedFiles.push(pdf);
        copied++;
      }
    }
  }
  return copied;
}

/**
 * PropertyMe: downloads/YYYY-MM-DD/documents/PropertyName/*.pdf
 * Filename: YYYY.MM.DD - Property - PropertyMe - Doc Type.pdf
 * Distribution: extract property from filename, put in {property}/LEASING/ or {property}/
 */
function distributePropertyMe(downloadsDir: string, propertiesPath: string, copiedFiles: string[]): number {
  let copied = 0;
  // Find date-stamped download folders (not prefixed with a scraper name)
  const dateDirs = fs.readdirSync(downloadsDir)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();

  for (const dateDir of dateDirs) {
    const docsDir = path.join(downloadsDir, dateDir, 'documents');
    if (!fs.existsSync(docsDir)) continue;

    // Each subfolder is a property
    const propFolders = fs.readdirSync(docsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const propFolder of propFolders) {
      const propDir = path.join(docsDir, propFolder.name);
      const pdfs = fs.readdirSync(propDir).filter(f => f.endsWith('.pdf'));

      for (const pdf of pdfs) {
        // Extract property from filename: "YYYY.MM.DD - Property - PropertyMe - ..."
        const match = pdf.match(/^\d{4}\.\d{2}\.\d{2} - (.+?) - PropertyMe/);
        const propertyName = match?.[1] || '';

        const destPropertyFolder = PROPERTY_FOLDERS[propertyName];
        const destFolder = destPropertyFolder
          ? path.join(propertiesPath, destPropertyFolder, 'PropertyMe')
          : path.join(propertiesPath, 'PropertyMe');

        fs.mkdirSync(destFolder, { recursive: true });
        const destPath = path.join(destFolder, pdf);
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(path.join(propDir, pdf), destPath);
          copiedFiles.push(pdf);
          copied++;
        }
      }
    }
  }
  return copied;
}

/**
 * Bank Australia: downloads/bankaustralia_YYYY-MM-DD/statements/*.pdf
 * Filename: YYYY.MM.DD - Sarcophilus - Bank Australia - Bank Statement.pdf
 * Distribution: entity-level, goes to STATEMENTS/Bank Australia/
 */
function distributeBankAustralia(downloadsDir: string, propertiesPath: string, copiedFiles: string[]): number {
  let copied = 0;
  const baDirs = fs.readdirSync(downloadsDir)
    .filter(d => d.startsWith('bankaustralia_'))
    .sort()
    .reverse();

  for (const baDir of baDirs) {
    const stmtDir = path.join(downloadsDir, baDir, 'statements');
    if (!fs.existsSync(stmtDir)) continue;

    const pdfs = fs.readdirSync(stmtDir).filter(f => f.endsWith('.pdf'));
    const destFolder = path.join(propertiesPath, 'STATEMENTS', 'Bank Australia');
    fs.mkdirSync(destFolder, { recursive: true });

    for (const pdf of pdfs) {
      const destPath = path.join(destFolder, pdf);
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(path.join(stmtDir, pdf), destPath);
        copiedFiles.push(pdf);
        copied++;
      }
    }
  }
  return copied;
}
