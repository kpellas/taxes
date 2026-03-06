"""
Bank Australia Scraper — PDF Statements (Sarcophilus)
=====================================================
Downloads all eStatements from Bank Australia online banking.

Usage:
    cd scrapers && python3 scraper_bankaustralia.py              # download all history
    cd scrapers && python3 scraper_bankaustralia.py --monthly    # last month only
    cd scrapers && python3 scraper_bankaustralia.py --from 01/01/2025 --to 31/01/2025
"""

import argparse
import asyncio
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

load_dotenv()

CUSTOMER_ID = os.getenv("BANKAUST_ID")
PASSWORD = os.getenv("BANKAUST_PASSWORD")
LOGIN_URL = "https://digital.bankaust.com.au/"
STATEMENTS_URL = "https://digital.bankaust.com.au/services/estatements2/"

RUN_DATE = datetime.now().strftime("%Y-%m-%d")
BASE_DIR = Path("downloads") / f"bankaustralia_{RUN_DATE}"
STATEMENTS_DIR = BASE_DIR / "statements"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"

for d in [STATEMENTS_DIR, SCREENSHOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

ENTITY_NAME = "Sarcophilus"


def safe_fn(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()[:200]


async def shot(page, name):
    p = SCREENSHOTS_DIR / f"{name}.png"
    await page.screenshot(path=str(p), full_page=True)
    print(f"    [screenshot: {p.name}]")


async def login(page):
    print(f"Opening {LOGIN_URL}")
    await page.goto(LOGIN_URL, wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Fill customer number — try multiple approaches
    filled_id = False
    for sel in [
        'input[placeholder="customer number"]',
        'input[placeholder*="customer"]',
        'input[placeholder*="Customer"]',
        'input[type="text"]',
        'input[type="number"]',
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"])',
    ]:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click()
                await loc.fill("")
                await loc.type(CUSTOMER_ID, delay=50)
                filled_id = True
                print(f"  Filled customer number ({sel})")
                break
        except Exception:
            continue

    if not filled_id:
        # JS fallback
        await page.evaluate("""(custId) => {
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                if (input.type === 'password' || input.type === 'hidden' || input.type === 'submit') continue;
                if (input.offsetParent) {
                    input.focus();
                    input.value = custId;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }""", CUSTOMER_ID)
        print(f"  Filled customer number (JS fallback)")

    await asyncio.sleep(0.5)

    # Fill password
    try:
        pw_field = page.locator('input[type="password"]').first
        await pw_field.click()
        await pw_field.type(PASSWORD, delay=50)
        print(f"  Filled password")
    except Exception as e:
        print(f"  Password fill failed: {e}")

    await asyncio.sleep(1)
    await shot(page, "01_credentials_filled")

    # Click login
    for sel in ['button:has-text("Log in")', 'button[type="submit"]', 'input[type="submit"]']:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click(timeout=5000)
                print(f"  Clicked login")
                break
        except Exception:
            continue

    # Wait for login — handle possible SMS/2FA step
    print(f"  Waiting for login (complete any verification if prompted)...")
    await asyncio.sleep(5)  # Let navigation settle
    for i in range(60):
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except Exception:
            pass
        try:
            body = await page.evaluate("() => document.body?.innerText?.substring(0, 2000) || ''")
            if any(x in body.lower() for x in ["welcome", "kelly", "accounts", "balances", "12321167"]):
                print(f"  Logged in!")
                await shot(page, "02_logged_in")
                return True
        except Exception:
            pass  # Page still navigating
        await asyncio.sleep(2)
        if i > 0 and i % 10 == 0:
            print(f"  Still waiting... ({i*2}s)")
            await shot(page, f"02_waiting_{i}")

    print(f"  Login timed out")
    await shot(page, "02_login_timeout")
    return False


async def extract_statements(page):
    """
    Extract all statement info from the eStatements page.
    Each estatement-item has:
      - date range in span.estate-period
      - statement number in .statement-details
      - PDF URL in hidden input.externalView
      - View link with data-documentid, data-statementid
    """
    return await page.evaluate(r"""() => {
        const items = document.querySelectorAll('.estatement-item');
        const results = [];

        for (const item of items) {
            const period = item.querySelector('.estate-period')?.innerText?.trim() || '';
            const numEl = item.querySelector('.estatenum');
            const num = numEl ? numEl.innerText.trim() : '';
            const viewLink = item.querySelector('a.estatementViewLink');
            const docId = viewLink?.getAttribute('data-documentid') || '';
            const stmtId = viewLink?.getAttribute('data-statementid') || '';
            const hiddenInput = item.querySelector('input.externalView');
            const pdfUrl = hiddenInput?.value || '';

            if (!period) continue;

            results.push({
                period,
                number: num,
                documentId: docId,
                statementId: stmtId,
                pdfUrl,
            });
        }

        return results;
    }""")


def parse_end_date(period):
    """Extract the end date from '01/02/2026 - 28/02/2026' and return YYYY.MM.DD."""
    m = re.search(r'-\s*(\d{2}/\d{2}/\d{4})', period)
    if m:
        try:
            dt = datetime.strptime(m.group(1), "%d/%m/%Y")
            return dt.strftime("%Y.%m.%d"), dt
        except Exception:
            pass
    return None, None


async def main():
    parser = argparse.ArgumentParser(description="Bank Australia statement scraper")
    parser.add_argument("--monthly", action="store_true",
                        help="Only download last month's statement")
    parser.add_argument("--from", dest="date_from",
                        help="Filter start date (DD/MM/YYYY)")
    parser.add_argument("--to", dest="date_to",
                        help="Filter end date (DD/MM/YYYY)")
    args = parser.parse_args()

    if not CUSTOMER_ID or not PASSWORD:
        print("Set BANKAUST_ID and BANKAUST_PASSWORD in .env")
        return

    # Date filter
    filter_from = None
    filter_to = None
    if args.monthly:
        today = datetime.now()
        first_of_month = today.replace(day=1)
        last_of_prev = first_of_month - timedelta(days=1)
        first_of_prev = last_of_prev.replace(day=1)
        filter_from = first_of_prev
        filter_to = last_of_prev
        print(f"MONTHLY MODE: {first_of_prev.strftime('%d/%m/%Y')} - {last_of_prev.strftime('%d/%m/%Y')}")
    elif args.date_from and args.date_to:
        filter_from = datetime.strptime(args.date_from, "%d/%m/%Y")
        filter_to = datetime.strptime(args.date_to, "%d/%m/%Y")
        print(f"CUSTOM MODE: {args.date_from} - {args.date_to}")

    print(f"Bank Australia Scraper ({ENTITY_NAME}) — {RUN_DATE}")
    print(f"Output: {BASE_DIR.resolve()}\n")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=100)
        ctx = await browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        try:
            if not await login(page):
                print("Login failed.")
                return

            # Navigate to eStatements
            print(f"\nNavigating to eStatements...")
            await page.goto(STATEMENTS_URL, wait_until="domcontentloaded")
            await asyncio.sleep(5)
            await shot(page, "02_statements_page")

            # Extract all statements
            statements = await extract_statements(page)
            print(f"Found {len(statements)} statements")

            # Group by statementId to identify accounts
            stmt_ids = sorted(set(s['statementId'] for s in statements))
            print(f"Statement series: {stmt_ids}")

            downloaded = 0
            skipped = 0

            for stmt in statements:
                date_str, dt = parse_end_date(stmt['period'])
                if not date_str:
                    print(f"  SKIP: can't parse date from '{stmt['period']}'")
                    continue

                # Apply date filter
                if filter_from and dt and dt < filter_from:
                    continue
                if filter_to and dt and dt > filter_to:
                    continue

                # Build filename: 2026.01.31 - Sarcophilus - Bank Australia - Bank Statement.pdf
                # Add statement number to differentiate the two account series
                filename = safe_fn(
                    f"{date_str} - {ENTITY_NAME} - Bank Australia - Bank Statement #{stmt['number']}.pdf"
                )
                save_path = STATEMENTS_DIR / filename

                if save_path.exists() and save_path.stat().st_size > 1000:
                    skipped += 1
                    continue

                # Download via the hidden PDF URL
                if stmt['pdfUrl']:
                    pdf_url = stmt['pdfUrl']
                    if not pdf_url.startswith('http'):
                        pdf_url = f"https://digital.bankaust.com.au{pdf_url}"

                    try:
                        resp = await ctx.request.get(pdf_url)
                        if resp.status == 200:
                            content = await resp.body()
                            if len(content) > 500:
                                save_path.write_bytes(content)
                                size = save_path.stat().st_size
                                print(f"  SAVED: {filename} ({size / 1024:.1f} KB)")
                                downloaded += 1
                                continue
                            else:
                                print(f"  Response too small ({len(content)} bytes): {stmt['period']} #{stmt['number']}")
                        else:
                            print(f"  HTTP {resp.status} for {stmt['period']} #{stmt['number']}")
                    except Exception as e:
                        print(f"  Direct download failed: {e}")

                # Fallback: click the View link
                try:
                    selector = f'a.estatementViewLink[data-documentid="{stmt["documentId"]}"]'
                    loc = page.locator(selector).first

                    if await loc.count() > 0:
                        # Clicking View opens a new tab with the PDF
                        async with page.context.expect_page(timeout=15000) as new_page_info:
                            await loc.click(timeout=5000)

                        new_page = await new_page_info.value
                        await asyncio.sleep(3)

                        # Try to get PDF content from new tab
                        try:
                            resp = await ctx.request.get(new_page.url)
                            content = await resp.body()
                            if len(content) > 500:
                                save_path.write_bytes(content)
                                size = save_path.stat().st_size
                                print(f"  SAVED (tab): {filename} ({size / 1024:.1f} KB)")
                                downloaded += 1
                        except Exception:
                            pass
                        await new_page.close()
                    else:
                        print(f"  View link not found for #{stmt['number']}")
                except Exception as e:
                    # Check for download event instead
                    pages = page.context.pages
                    if len(pages) > 1:
                        await pages[-1].close()
                    print(f"  Fallback failed for #{stmt['number']}: {e}")

                await asyncio.sleep(0.5)

            # Summary
            print(f"\n{'='*60}")
            print(f"  DONE — {downloaded} downloaded, {skipped} already existed")
            print('='*60)
            pdfs = sorted(STATEMENTS_DIR.glob("*.pdf"))
            for f in pdfs:
                print(f"  {f.name} ({f.stat().st_size / 1024:.1f} KB)")
            if not pdfs:
                print("  No PDFs. Check screenshots in:", SCREENSHOTS_DIR)

        except Exception as e:
            print(f"\nError: {e}")
            import traceback
            traceback.print_exc()
            await shot(page, "error")
        finally:
            print("\nBrowser open 30s for review...")
            await asyncio.sleep(30)
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
