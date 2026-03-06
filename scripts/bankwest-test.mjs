import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PAN = '74114180';
const PASS = 'CookieMonster1!';
const DIR = 'data/bankwest-statements';

const browser = await chromium.launch({ headless: false, slowMo: 50 });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

// Login
console.log('Logging in...');
await page.goto('https://ibs.bankwest.com.au/BWLogin', { waitUntil: 'networkidle', timeout: 30000 });
await page.locator('input[type="text"]:visible').first().fill(PAN);
await page.locator('input[type="password"]:visible').first().fill(PASS);
await page.locator('button:visible').filter({ hasText: /log in/i }).first().click();
await page.waitForURL('**ibs.bankwest.com.au/**', { timeout: 60000 });
await page.waitForTimeout(3000);

// Navigate to eStatements
console.log('Going to eStatements...');
await page.goto('https://ibs.bankwest.com.au/CMWeb/Statements/Statements.aspx', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

// Get the statements frame
const stmtFrame = page.frames().find(f => f.url().includes('apps.statements'));
if (!stmtFrame) { console.log('Statements frame not found'); process.exit(1); }

// Click on first loan account: Heddon Greta (5573)
console.log('\nClicking Heddon Greta (5573)...');
const row5573 = stmtFrame.locator('text=5573').first();
await row5573.click();
await page.waitForTimeout(3000);

await page.screenshot({ path: `${DIR}/statements-5573.png`, fullPage: true });
console.log('Statements list URL:', page.url());

// Check frames again
for (const f of page.frames()) {
  const url = f.url();
  if (url !== 'about:blank' && !url.includes('chatbot') && !url.includes('Statements.aspx')) {
    console.log('Frame:', url.substring(0, 150));
  }
}

// Look for statement list items and download links
const stmtElements = await stmtFrame.evaluate(() => {
  return Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]')).filter(e =>
    e.offsetParent !== null && e.textContent?.trim()
  ).map(e => ({
    tag: e.tagName,
    text: e.textContent?.trim().substring(0, 80) || '',
    href: e.getAttribute('href')?.substring(0, 100) || '',
    class: e.className?.toString()?.substring(0, 80) || '',
  })).slice(0, 30);
}).catch(() => []);
console.log('\nStatement elements:', JSON.stringify(stmtElements, null, 2));

// Also look for PDF links or download buttons
const pdfLinks = await stmtFrame.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href*="pdf"], a[href*="download"], a[href*="statement"], [class*="download"]')).map(e => ({
    tag: e.tagName,
    text: e.textContent?.trim().substring(0, 80) || '',
    href: e.getAttribute('href')?.substring(0, 200) || '',
  }));
}).catch(() => []);
console.log('\nPDF/Download links:', JSON.stringify(pdfLinks, null, 2));

console.log('\nBrowser open for 20s...');
await new Promise(r => setTimeout(r, 20000));
await browser.close();
