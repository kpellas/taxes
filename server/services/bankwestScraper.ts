import { chromium, type Browser, type Page, type Frame } from 'playwright';
import path from 'path';
import fs from 'fs';
import { refreshIndex } from './documentIndex.js';
import { syncFileIndex } from './documentIndexSync.js';
import db from '../db.js';

const BANKWEST_LOGIN_URL = 'https://ibs.bankwest.com.au/BWLogin';
const ESTATEMENTS_URL = 'https://ibs.bankwest.com.au/CMWeb/Statements/Statements.aspx';
const DOWNLOAD_DIR = path.resolve(import.meta.dirname, '../../data/bankwest-statements');

// Map property key to PROPERTIES folder paths
const PROPERTY_FOLDER_MAP: Record<string, string> = {
  'Heddon Greta': '2 - HEDDON GRETA (AVERY)/STATEMENTS/Bankwest',
  'Chisholm': '1 - CHISHOLM (WATERFORD)/STATEMENTS/Bankwest',
  'Bannerman': '3 - SOUTHWEST ROCKS (BANNERMAN)/STATEMENTS/Bankwest',
  'Old Bar': '4 - OLD BAR (EMERALD FIELDS)/STATEMENTS/Bankwest',
  'Lennox': '5 - LENNOX HEADS/STATEMENTS/Bankwest',
  'Offset Account': 'STATEMENTS/Bankwest/Offset Accounts',
};

// Map nickname (sans code) to display name for filenames
const PROPERTY_DISPLAY_MAP: Record<string, string> = {
  'HeddonGreta': 'Heddon Greta',
  'Chisholm': 'Chisholm',
  'Bannerman': 'Bannerman',
  'OldBar': 'Old Bar',
  'Lennox': 'Lennox',
  'OffsetAccount': 'Offset Account',
};

export interface BankwestAccount {
  nickname: string;
  accountNumber: string;
  accountKey: string;
  statementCount: number;
}

export interface ScrapeResult {
  pan: string;
  accounts: BankwestAccount[];
  downloads: { account: string; file: string; date: string }[];
  errors: string[];
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function login(page: Page, pan: string, password: string): Promise<void> {
  await page.goto(BANKWEST_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.locator('input[type="text"]:visible').first().fill(pan);
  await page.locator('input[type="password"]:visible').first().fill(password);
  await page.locator('button:visible').filter({ hasText: /log in/i }).first().click();
  await page.waitForURL('**ibs.bankwest.com.au/**', { timeout: 180_000 });
  await page.waitForTimeout(2000);
}

/**
 * Download all eStatement PDFs for all registered accounts.
 * Uses Bankwest's internal APIs discovered from the Angular app:
 *   - /api/accountstatements/EStatementAccountList — list registered accounts
 *   - /api/accountstatements/EStatementList?AccountKey=X — list statements per account
 *   - /api/accountstatements/EStatement?accountKey=X&statementNumber=N — download PDF
 */
async function downloadAllStatements(
  page: Page,
  result: ScrapeResult,
  accountFilter?: string[],
): Promise<void> {
  // Navigate to eStatements page to establish session context
  await page.goto(ESTATEMENTS_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(5000);

  const stmtFrame = page.frames().find(f => f.url().includes('apps.statements'));
  if (!stmtFrame) {
    result.errors.push('eStatements frame not found');
    return;
  }

  // Get account list via API
  const accountList = await stmtFrame.evaluate(async () => {
    const r = await fetch('/api/accountstatements/EStatementAccountList?ReturnEligibleBusinessAccounts=true', {
      credentials: 'include',
    });
    return r.json();
  }).catch((e: Error) => ({ error: e.message }));

  if (accountList.error || !accountList.RegisteredAccounts) {
    result.errors.push(`Account list failed: ${accountList.error || 'no registered accounts'}`);
    return;
  }

  const registeredAccounts: any[] = accountList.RegisteredAccounts;
  console.log(`[Bankwest] Found ${registeredAccounts.length} registered accounts`);

  for (const acct of registeredAccounts) {
    const nickname = acct.AccountNickName || acct.AccountDescription || 'Unknown';
    const acctNum = acct.AccountNumber || '';
    const acctKey = acct.AccountKey || '';

    // Extract short code from nickname, e.g. "Heddon Greta (5573)" → "5573"
    const codeMatch = nickname.match(/\((\d{4,})\)/);
    const shortCode = codeMatch ? codeMatch[1] : acctNum.replace(/\D/g, '').slice(-4);

    // Apply account filter if specified
    if (accountFilter && accountFilter.length > 0) {
      const matchesFilter = accountFilter.some(f =>
        nickname.toLowerCase().includes(f.toLowerCase()) ||
        acctNum.includes(f) ||
        shortCode.includes(f)
      );
      if (!matchesFilter) continue;
    }

    console.log(`[Bankwest] Processing: ${nickname} (${acctNum})`);

    // Get statement list for this account
    const stmtList = await stmtFrame.evaluate(async (key: string) => {
      const r = await fetch(`/api/accountstatements/EStatementList?AccountKey=${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      return r.json();
    }, acctKey).catch((e: Error) => ({ error: e.message }));

    const statements: any[] = stmtList.EStatements || [];
    const isCredit = statements.length > 0 && statements[0].IsCredit;

    result.accounts.push({
      nickname,
      accountNumber: acctNum,
      accountKey: acctKey,
      statementCount: statements.length,
    });

    console.log(`[Bankwest]   ${statements.length} statements available`);

    // Download each statement PDF
    for (const stmt of statements) {
      const stmtNum = stmt.StatementNumber;
      const stmtDate = stmt.StatementDate || '';
      const fromDate = stmt.StatementFromDate || '';

      // Build the PDF URL
      let pdfUrl: string;
      if (isCredit) {
        pdfUrl = `/api/accountstatements/EStatementCreditCard?accountKey=${encodeURIComponent(acctKey)}&dateFrom=${encodeURIComponent(fromDate)}&dateTo=${encodeURIComponent(stmtDate)}&tabletCompat=/estatement.aspx/eStatementLoading.aspx`;
      } else {
        pdfUrl = `/api/accountstatements/EStatement?accountKey=${encodeURIComponent(acctKey)}&statementNumber=${stmtNum}&tabletCompat=/estatement.aspx/eStatementLoading.aspx`;
      }

      // Build filename: YYYY.MM.DD - Property - Bankwest - Loan Statement (ACCT).pdf
      const safeName = nickname.replace(/\s*\(\d+\)\s*/, '').replace(/[^a-zA-Z0-9]/g, '');
      const dateStr = stmtDate.split('T')[0]; // "2025-10-08T00:00:00" → "2025-10-08"
      const dotDate = dateStr.replace(/-/g, '.');
      const displayName = PROPERTY_DISPLAY_MAP[safeName] || safeName;
      const filename = `${dotDate} - ${displayName} - Bankwest - Loan Statement (${shortCode}).pdf`;
      const savePath = path.join(DOWNLOAD_DIR, filename);

      // Skip if already downloaded
      if (fs.existsSync(savePath)) {
        console.log(`[Bankwest]   Skipping (exists): ${filename}`);
        result.downloads.push({ account: shortCode, file: savePath, date: dateStr });
        continue;
      }

      try {
        // Download via anchor tag click to trigger browser download
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30_000 }),
          stmtFrame.evaluate((url: string) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, pdfUrl),
        ]);

        await download.saveAs(savePath);
        const size = fs.statSync(savePath).size;
        console.log(`[Bankwest]   Saved: ${filename} (${(size / 1024).toFixed(1)} KB)`);
        result.downloads.push({ account: shortCode, file: savePath, date: dateStr });
      } catch (err: any) {
        // Fallback: fetch as blob
        try {
          const pdfData = await stmtFrame.evaluate(async (url: string) => {
            const r = await fetch(url, { credentials: 'include' });
            const buf = await r.arrayBuffer();
            return Array.from(new Uint8Array(buf));
          }, pdfUrl);

          if (pdfData.length > 0) {
            fs.writeFileSync(savePath, Buffer.from(pdfData));
            console.log(`[Bankwest]   Saved (fetch): ${filename} (${(pdfData.length / 1024).toFixed(1)} KB)`);
            result.downloads.push({ account: shortCode, file: savePath, date: dateStr });
          } else {
            result.errors.push(`${nickname} stmt${stmtNum}: empty response`);
          }
        } catch (fetchErr: any) {
          result.errors.push(`${nickname} stmt${stmtNum}: ${err.message}`);
          console.error(`[Bankwest]   Error: ${err.message}`);
        }
      }
    }
  }
}

/**
 * Copy downloaded PDFs into the PROPERTIES folder tree so the document indexer picks them up.
 * Filename format: YYYY.MM.DD - Property - Bankwest - Loan Statement (ACCT).pdf
 */
function distributeToProperties(downloads: { account: string; file: string; date: string }[]): number {
  const propertiesPath = process.env.PROPERTIES_PATH;
  if (!propertiesPath) return 0;

  let copied = 0;
  for (const dl of downloads) {
    const filename = path.basename(dl.file);

    // Extract property name from filename: "YYYY.MM.DD - Property - Bankwest - ..."
    const match = filename.match(/^\d{4}\.\d{2}\.\d{2} - (.+?) - Bankwest/);
    const propName = match?.[1] || 'Offset Account';

    const subfolder = PROPERTY_FOLDER_MAP[propName] || PROPERTY_FOLDER_MAP['Offset Account'];
    const destDir = path.join(propertiesPath, subfolder);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destPath = path.join(destDir, filename);
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(dl.file, destPath);
      copied++;
    }
  }

  // Re-index so new files appear in the document index
  if (copied > 0) {
    console.log(`[Bankwest] Copied ${copied} PDFs into PROPERTIES — re-indexing...`);
    refreshIndex(propertiesPath);
    const result = syncFileIndex(propertiesPath);
    console.log(`[Bankwest] Re-indexed: ${result.added} added, ${result.updated} updated, ${result.total} total`);

    // Mark scraped files as 'scraper' source
    for (const dl of downloads) {
      const filename = path.basename(dl.file);
      db.prepare(`UPDATE document_index SET added_via = 'scraper' WHERE file_path LIKE ?`).run(`%${filename}`);
    }
  }

  return copied;
}

/**
 * Scrape Bankwest eStatements for a single PAN — downloads all statement PDFs.
 */
export async function scrapeBankwest(options: {
  pan: string;
  password: string;
  accountFilter?: string[];
  headless?: boolean;
  // fromDate/toDate not used for eStatements (all available statements are downloaded)
  fromDate?: string;
  toDate?: string;
}): Promise<ScrapeResult> {
  const { pan, password, accountFilter, headless = false } = options;

  ensureDir(DOWNLOAD_DIR);

  const result: ScrapeResult = { pan, accounts: [], downloads: [], errors: [] };
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless, slowMo: 50 });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    console.log(`[Bankwest] Logging in PAN ${pan}...`);
    await login(page, pan, password);
    console.log(`[Bankwest] Logged in`);

    await downloadAllStatements(page, result, accountFilter);

    // Copy PDFs into PROPERTIES folder and re-index
    const copied = distributeToProperties(result.downloads);

    console.log(`[Bankwest] PAN ${pan}: ${result.downloads.length} downloads, ${copied} copied to PROPERTIES, ${result.errors.length} errors`);
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
    console.error('[Bankwest] Fatal error:', err);
  } finally {
    if (browser) {
      await new Promise(r => setTimeout(r, 2000));
      await browser.close();
    }
  }

  return result;
}

/**
 * Scrape all configured PANs sequentially.
 */
export async function scrapeAllBankwest(options?: {
  accountFilter?: string[];
  headless?: boolean;
}): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  const pans = [
    { pan: process.env.BANKWEST_PAN_1, pass: process.env.BANKWEST_PASS_1 },
    { pan: process.env.BANKWEST_PAN_2, pass: process.env.BANKWEST_PASS_2 },
  ].filter(p => p.pan && p.pass);

  for (const { pan, pass } of pans) {
    const result = await scrapeBankwest({
      pan: pan!,
      password: pass!,
      accountFilter: options?.accountFilter,
      headless: options?.headless,
    });
    results.push(result);
  }

  return results;
}
