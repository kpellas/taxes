import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const DIR = 'data/bankwest-statements';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const PANS = [
  { pan: '74114180', pass: 'CookieMonster1!' },
  { pan: '74114261', pass: 'CookieMonster1!' },
];

async function downloadStatementsForPan(panInfo) {
  const { pan, pass } = panInfo;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PAN: ${pan}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in...');
    await page.goto('https://ibs.bankwest.com.au/BWLogin', { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('input[type="text"]:visible').first().fill(pan);
    await page.locator('input[type="password"]:visible').first().fill(pass);
    await page.locator('button:visible').filter({ hasText: /log in/i }).first().click();
    await page.waitForURL('**ibs.bankwest.com.au/**', { timeout: 60000 });
    await page.waitForTimeout(3000);
    console.log('Logged in.');

    // Navigate to eStatements
    console.log('Going to eStatements...');
    await page.goto('https://ibs.bankwest.com.au/CMWeb/Statements/Statements.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    const stmtFrame = page.frames().find(f => f.url().includes('apps.statements'));
    if (!stmtFrame) {
      console.log('ERROR: eStatements frame not found');
      return;
    }

    // Get account list via API
    const accountList = await stmtFrame.evaluate(async () => {
      const r = await fetch('/api/accountstatements/EStatementAccountList?ReturnEligibleBusinessAccounts=true', {
        credentials: 'include',
      });
      return r.json();
    });

    const accounts = accountList.RegisteredAccounts || [];
    console.log(`Found ${accounts.length} registered accounts\n`);

    let totalDownloaded = 0;
    let totalSkipped = 0;

    for (const acct of accounts) {
      const nickname = acct.AccountNickName || 'Unknown';
      const acctNum = acct.AccountNumber || '';
      const acctKey = acct.AccountKey || '';
      const codeMatch = nickname.match(/\((\d{4,})\)/);
      const shortCode = codeMatch ? codeMatch[1] : acctNum.replace(/\D/g, '').slice(-4);

      console.log(`--- ${nickname} (${acctNum}) ---`);

      // Get statement list
      const stmtList = await stmtFrame.evaluate(async (key) => {
        const r = await fetch(`/api/accountstatements/EStatementList?AccountKey=${encodeURIComponent(key)}`, {
          credentials: 'include',
        });
        return r.json();
      }, acctKey);

      const statements = stmtList.EStatements || [];
      console.log(`  ${statements.length} statements`);

      for (const stmt of statements) {
        const stmtNum = stmt.StatementNumber;
        const stmtDate = stmt.StatementDate || '';
        const dateStr = stmtDate.split('T')[0];

        const safeName = nickname.replace(/\s*\(\d+\)\s*/, '').replace(/[^a-zA-Z0-9]/g, '');
        const filename = `bankwest_${safeName}-${shortCode}_stmt${stmtNum}_${dateStr}.pdf`;
        const savePath = path.join(DIR, filename);

        if (fs.existsSync(savePath)) {
          console.log(`  Skipping (exists): ${filename}`);
          totalSkipped++;
          continue;
        }

        const pdfUrl = `/api/accountstatements/EStatement?accountKey=${encodeURIComponent(acctKey)}&statementNumber=${stmtNum}&tabletCompat=/estatement.aspx/eStatementLoading.aspx`;

        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            stmtFrame.evaluate((url) => {
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
          console.log(`  Saved: ${filename} (${(size / 1024).toFixed(1)} KB)`);
          totalDownloaded++;
        } catch (err) {
          console.log(`  ERROR: ${filename} - ${err.message}`);
        }
      }
    }

    console.log(`\nPAN ${pan}: ${totalDownloaded} downloaded, ${totalSkipped} skipped`);
  } finally {
    await browser.close();
  }
}

// Run both PANs sequentially
for (const panInfo of PANS) {
  await downloadStatementsForPan(panInfo);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('COMPLETE — All downloaded PDFs:');
console.log('='.repeat(60));
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.pdf')).sort();
for (const f of files) {
  const size = fs.statSync(path.join(DIR, f)).size;
  console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
}
console.log(`\nTotal: ${files.length} PDF files`);
