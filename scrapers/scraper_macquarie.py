"""
Macquarie Bank Scraper — PDF Statements
========================================
Downloads all historical PDF statements for each account,
and optionally generates custom date-range reports.

Usage:
    cd scrapers && python3 scraper_macquarie.py                # download all history
    cd scrapers && python3 scraper_macquarie.py --monthly      # generate last month's report
    cd scrapers && python3 scraper_macquarie.py --from 01/01/2025 --to 30/06/2025  # custom range
"""

import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

load_dotenv()

USER_ID = os.getenv("MACQUARIE_ID")
PASSWORD = os.getenv("MACQUARIE_PASSWORD")
LOGIN_URL = "https://online.macquarie.com.au/personal/#/"

RUN_DATE = datetime.now().strftime("%Y-%m-%d")
BASE_DIR = Path("downloads") / f"macquarie_{RUN_DATE}"
STATEMENTS_DIR = BASE_DIR / "statements"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"

for d in [STATEMENTS_DIR, SCREENSHOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

TARGET_ACCOUNTS = [
    {"name": "1 Main Spending (3460)", "label": "Main_Spending_3460"},
    {"name": "2 - Rental Expenses (0535)", "label": "Rental_Expenses_0535"},
    {"name": "Second Savings - 8707", "label": "Second_Savings_8707"},
    {"name": "Schniggle", "label": "Schniggle"},
    {"name": "Loan - Old Bar (2214)", "label": "Loan_Old_Bar_2214"},
]


def safe_fn(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()[:150]


async def shot(page, name):
    p = SCREENSHOTS_DIR / f"{name}.png"
    await page.screenshot(path=str(p), full_page=True)
    print(f"    [screenshot: {p.name}]")


async def wait_for_login(page):
    print("\n  ** COMPLETE LOGIN — approve 2FA in browser **")
    for i in range(180):
        try:
            body = await page.evaluate("() => document.body?.innerText?.substring(0, 2000) || ''")
            if any(x in body.lower() for x in ["main spending", "schniggle", "available balance"]):
                print(f"  Logged in!")
                return True
        except Exception:
            pass
        await asyncio.sleep(1)
        if i > 0 and i % 15 == 0:
            print(f"  Waiting... ({i}s)")
    return False


async def login(page):
    print(f"Opening {LOGIN_URL}")
    await page.goto(LOGIN_URL, wait_until="domcontentloaded")
    await asyncio.sleep(3)

    for sel in ['input[id="username"]', 'input[type="text"]']:
        try:
            if await page.locator(sel).count() > 0:
                await page.locator(sel).first.fill(USER_ID)
                break
        except Exception:
            continue
    for sel in ['input[type="password"]']:
        try:
            if await page.locator(sel).count() > 0:
                await page.locator(sel).first.fill(PASSWORD)
                break
        except Exception:
            continue
    for sel in ['button[type="submit"]', 'button:has-text("Log in")']:
        try:
            if await page.locator(sel).count() > 0:
                await page.locator(sel).first.click()
                break
        except Exception:
            continue

    await asyncio.sleep(2)
    ok = await wait_for_login(page)
    await asyncio.sleep(3)
    return ok


async def go_home(page):
    """Back to accounts dashboard."""
    try:
        loc = page.locator('text="Accounts"').first
        if await loc.count() > 0 and await loc.is_visible():
            await loc.click(timeout=5000)
            await asyncio.sleep(3)
            return
    except Exception:
        pass
    await page.goto("https://online.macquarie.com.au/personal/#/accounts",
                     wait_until="domcontentloaded")
    await asyncio.sleep(3)


async def click_account(page, name):
    """Click account on dashboard. Handles sidebar overlay with force/JS click."""
    try:
        loc = page.locator(f'text="{name}"').first
        if await loc.count() > 0:
            await loc.scroll_into_view_if_needed()
            await asyncio.sleep(0.5)
            await loc.click(force=True, timeout=10000)
            await asyncio.sleep(3)
            return True
    except Exception:
        pass

    try:
        ok = await page.evaluate("""(target) => {
            const els = document.querySelectorAll('span, a, div, button');
            for (const el of els) {
                if (el.innerText?.trim() === target) {
                    el.click();
                    return true;
                }
            }
            return false;
        }""", name)
        if ok:
            await asyncio.sleep(3)
            return True
    except Exception:
        pass

    return False


async def open_statements(page, label):
    """On an account page, click 'I want to...' -> 'View account statements and reports'."""
    # Step 1: Click "I want to..."
    clicked_menu = False
    for sel in ['button:has-text("I want to")', 'button:has-text("I want to...")']:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click(timeout=5000)
                clicked_menu = True
                print(f"    Opened 'I want to...' menu")
                await asyncio.sleep(1)
                break
        except Exception:
            continue

    if not clicked_menu:
        print(f"    Could not find 'I want to...' button")
        await shot(page, f"{label}_no_menu")
        return False

    # Step 2: Click "View account statements and reports"
    target_text = "View account statements and reports"
    for sel in [
        f'text="{target_text}"',
        f'a:has-text("{target_text}")',
        f'button:has-text("{target_text}")',
        f'div:has-text("{target_text}")',
        f'li:has-text("{target_text}")',
        f'span:has-text("{target_text}")',
        'text="statements and reports"',
        'text="account statements"',
    ]:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0:
                try:
                    await loc.wait_for(state="visible", timeout=2000)
                except Exception:
                    continue
                await loc.click(timeout=5000)
                print(f"    Clicked: {target_text}")
                await asyncio.sleep(5)
                return True
        except Exception:
            continue

    # JS fallback
    try:
        ok = await page.evaluate("""(target) => {
            const els = document.querySelectorAll('*');
            for (const el of els) {
                const text = el.innerText?.trim() || '';
                if (text === target && el.children.length < 3) {
                    el.click();
                    return true;
                }
            }
            for (const el of els) {
                const text = el.innerText?.trim() || '';
                if (text.includes('statements and reports') && el.children.length < 5) {
                    el.click();
                    return true;
                }
            }
            return false;
        }""", target_text)
        if ok:
            print(f"    Clicked (JS): {target_text}")
            await asyncio.sleep(5)
            return True
    except Exception:
        pass

    print(f"    Could not find '{target_text}' in menu")
    await shot(page, f"{label}_menu_fail")
    return False


async def dismiss_chatbot(page):
    """Try to dismiss the Q chatbot overlay."""
    try:
        # Try clicking the chatbot close/minimize button
        for sel in [
            '[aria-label="Minimize"]',
            '[aria-label="Close"]',
            'button[aria-label="Dismiss"]',
        ]:
            loc = page.locator(sel)
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click(timeout=2000)
                await asyncio.sleep(0.5)
                return True
    except Exception:
        pass

    # If can't dismiss, try to hide it via JS
    try:
        await page.evaluate("""() => {
            // Hide any fixed/sticky overlays in the bottom-right corner
            const els = document.querySelectorAll('*');
            for (const el of els) {
                const style = getComputedStyle(el);
                if ((style.position === 'fixed' || style.position === 'sticky') &&
                    el.getBoundingClientRect().bottom > window.innerHeight - 100 &&
                    el.getBoundingClientRect().right > window.innerWidth - 100) {
                    if (el.offsetWidth < 200 && el.offsetHeight < 200) {
                        el.style.display = 'none';
                    }
                }
            }
        }""")
    except Exception:
        pass


async def get_statement_rows(page):
    """Get all statement rows with their PDF icon positions. Re-queries DOM each time."""
    return await page.evaluate(r"""() => {
        const results = [];
        const datePattern = /\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}/;

        // Find all elements matching the date range pattern
        const candidates = [];
        for (const el of document.querySelectorAll('*')) {
            const text = el.innerText?.trim() || '';
            if (!datePattern.test(text)) continue;
            if (text.length > 200 || el.children.length > 15) continue;
            const rect = el.getBoundingClientRect();
            if (rect.height < 20 || rect.height > 120) continue;
            if (rect.width < 200) continue;
            // Skip if not visible
            if (rect.width === 0 || rect.height === 0) continue;
            candidates.push({ el, text, rect });
        }

        // De-duplicate: if a child element is also in candidates, keep only the child
        const filtered = candidates.filter(c => {
            return !candidates.some(other =>
                other.el !== c.el && c.el.contains(other.el)
            );
        });

        for (const { el, text, rect } of filtered) {
            const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/);
            const monthMatch = text.match(/^(\w+)/);

            // Find PDF icon within this row or its parent row container
            let iconEl = null;
            let searchEl = el;
            // Walk up to find a row-like container
            for (let i = 0; i < 3; i++) {
                const icons = searchEl.querySelectorAll('mq-svg-icon, svg, [class*="icon"], [class*="pdf"]');
                if (icons.length > 0) {
                    iconEl = icons[icons.length - 1]; // last icon (rightmost = View column)
                    break;
                }
                if (searchEl.parentElement) {
                    searchEl = searchEl.parentElement;
                } else {
                    break;
                }
            }

            let clickX, clickY;
            if (iconEl) {
                const ir = iconEl.getBoundingClientRect();
                clickX = Math.round(ir.x + ir.width / 2);
                clickY = Math.round(ir.y + ir.height / 2);
            } else {
                // Click the right side of the row (where View column is)
                clickX = Math.round(rect.right - 40);
                clickY = Math.round(rect.y + rect.height / 2);
            }

            results.push({
                text: text.replace(/\n/g, ' ').substring(0, 120),
                dateFrom: dateMatch ? dateMatch[1] : '',
                dateTo: dateMatch ? dateMatch[2] : '',
                month: monthMatch ? monthMatch[1] : '',
                clickX,
                clickY,
                rowY: Math.round(rect.y + rect.height / 2),
                hasIcon: !!iconEl,
            });
        }

        // Sort by Y position (top to bottom)
        results.sort((a, b) => a.rowY - b.rowY);
        return results;
    }""")


def format_filename(label, row):
    """
    Format: 2024.12.31 - Macquarie - Main Spending (3460) - 6 month statement.pdf
    """
    # Parse the end date (DD/MM/YY) into YYYY.MM.DD
    date_to = row['dateTo']  # e.g. "31/12/25"
    try:
        dt = datetime.strptime(date_to, "%d/%m/%y")
        date_str = dt.strftime("%Y.%m.%d")
    except Exception:
        date_str = date_to.replace('/', '.')

    # Build account display name from label
    # "Main_Spending_3460" -> "Main Spending (3460)"
    LABEL_DISPLAY = {
        "Main_Spending_3460": "Main Spending (3460)",
        "Rental_Expenses_0535": "Rental Expenses (0535)",
        "Second_Savings_8707": "Second Savings (8707)",
        "Schniggle": "Schniggle",
        "Loan_Old_Bar_2214": "Loan - Driftwood (2214)",
    }
    acct_name = LABEL_DISPLAY.get(label, label.replace('_', ' '))

    # Statement type from the row text
    text = row['text'].lower()
    if 'half yearly' in text:
        stmt_type = "6 month statement"
    elif 'quarterly' in text:
        stmt_type = "quarterly statement"
    elif 'monthly' in text:
        stmt_type = "monthly statement"
    else:
        stmt_type = "statement"

    filename = f"{date_str} - Macquarie - {acct_name} - {stmt_type}.pdf"
    return safe_fn(filename)


async def download_single_pdf(page, row, label, index):
    """Download a single PDF by clicking the row/icon. Returns the saved path or None."""
    text = row['text']
    filename = format_filename(label, row)
    save_path = STATEMENTS_DIR / filename

    if save_path.exists() and save_path.stat().st_size > 1000:
        print(f"    [{index}] SKIP (exists): {filename}")
        return save_path

    # Scroll the row into view first
    try:
        await page.evaluate(f"() => window.scrollTo(0, {max(0, row['rowY'] - 300)})")
        await asyncio.sleep(0.3)
    except Exception:
        pass

    # Re-query DOM to get fresh coordinates after scroll
    fresh_rows = await get_statement_rows(page)
    # Find the matching row by date range
    target_row = None
    for fr in fresh_rows:
        if fr['dateFrom'] == row['dateFrom'] and fr['dateTo'] == row['dateTo']:
            target_row = fr
            break
    if not target_row:
        target_row = row  # Fall back to original coordinates

    try:
        # Try expect_download first (direct download)
        async with page.expect_download(timeout=10000) as dl_info:
            await page.mouse.click(target_row['clickX'], target_row['clickY'])

        download = await dl_info.value
        suggested = download.suggested_filename or ''
        if suggested.lower().endswith('.pdf') and not filename.endswith('.pdf'):
            filename += '.pdf'
        save_path = STATEMENTS_DIR / filename
        await download.save_as(str(save_path))
        size = save_path.stat().st_size
        print(f"    [{index}] SAVED: {filename} ({size / 1024:.1f} KB)")
        return save_path

    except PlaywrightTimeoutError:
        # Check if a new tab opened with the PDF
        pages = page.context.pages
        if len(pages) > 1:
            new_page = pages[-1]
            await asyncio.sleep(2)
            url = new_page.url
            print(f"    [{index}] New tab: {url[:60]}")
            # If it's a PDF URL, try to download it
            if '.pdf' in url.lower() or 'application/pdf' in url.lower():
                try:
                    resp = await new_page.context.request.get(url)
                    content = await resp.body()
                    save_path.write_bytes(content)
                    size = save_path.stat().st_size
                    print(f"    [{index}] SAVED (from tab): {filename} ({size / 1024:.1f} KB)")
                    await new_page.close()
                    return save_path
                except Exception as e:
                    print(f"    [{index}] Tab download failed: {e}")
            await new_page.close()
        else:
            print(f"    [{index}] No download event for: {text[:50]}")

    except Exception as e:
        print(f"    [{index}] Error: {e}")

    # Fallback: try clicking the row center instead of icon
    try:
        async with page.expect_download(timeout=8000) as dl_info:
            await page.mouse.click(target_row['clickX'] - 200, target_row['rowY'])

        download = await dl_info.value
        await download.save_as(str(save_path))
        size = save_path.stat().st_size
        print(f"    [{index}] SAVED (fallback): {filename} ({size / 1024:.1f} KB)")
        return save_path
    except Exception:
        pass

    return None


async def download_pdfs(page, label):
    """Download all PDF statements for an account."""
    downloaded = 0

    await dismiss_chatbot(page)

    # Click "All" tab to show all statements
    try:
        all_tab = page.locator('text="All"').first
        if await all_tab.count() > 0:
            await all_tab.click(timeout=3000)
            await asyncio.sleep(2)
            print(f"    Clicked 'All' tab")
    except Exception:
        pass

    # Scroll down to load all rows
    for _ in range(5):
        await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(0.5)
    # Scroll back to top
    await page.evaluate("() => window.scrollTo(0, 0)")
    await asyncio.sleep(0.5)

    # Get all statement rows
    rows = await get_statement_rows(page)
    print(f"    Found {len(rows)} statement rows")

    if not rows:
        await shot(page, f"{label}_no_rows")
        return 0

    for row in rows:
        print(f"      {row['month']} {row['dateFrom']}-{row['dateTo']} (icon={'yes' if row['hasIcon'] else 'no'})")

    # Download each row one at a time
    for i, row in enumerate(rows):
        result = await download_single_pdf(page, row, label, i + 1)
        if result:
            downloaded += 1
        await asyncio.sleep(1.5)  # Be polite between downloads

    return downloaded


async def generate_custom_report(page, label, date_from, date_to):
    """
    Generate a custom date range report using the Generate button.
    date_from and date_to should be in DD/MM/YYYY format.
    """
    print(f"    Generating report: {date_from} to {date_to}")

    await dismiss_chatbot(page)

    # Fill the "Date from" field
    try:
        from_input = page.locator('input').filter(has_text="").nth(0)
        # Find the date inputs by their labels
        from_inputs = await page.evaluate("""(dateFrom) => {
            const labels = document.querySelectorAll('*');
            let fromInput = null;
            let toInput = null;
            for (const el of labels) {
                const text = el.innerText?.trim() || '';
                if (text === 'Date from') {
                    // Find the next input element
                    const container = el.closest('div') || el.parentElement;
                    if (container) {
                        const input = container.querySelector('input') ||
                                      container.nextElementSibling?.querySelector('input');
                        if (input) {
                            fromInput = true;
                            input.value = '';
                            input.focus();
                            input.value = dateFrom;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            }
            return !!fromInput;
        }""", date_from)
    except Exception as e:
        print(f"    Could not set Date from: {e}")

    await asyncio.sleep(0.5)

    # Try a simpler approach: find all date inputs and fill them
    try:
        inputs = page.locator('input[type="text"], input[type="date"], input')
        count = await inputs.count()
        filled = 0
        for idx in range(count):
            inp = inputs.nth(idx)
            try:
                val = await inp.input_value()
                placeholder = await inp.get_attribute("placeholder") or ""
                # Look for date-like inputs near the Generate section
                if "date" in placeholder.lower() or re.match(r'\d{2}/\d{2}/\d{4}', val):
                    if filled == 0:
                        await inp.click()
                        await inp.fill(date_from)
                        filled += 1
                        print(f"    Set Date from: {date_from}")
                    elif filled == 1:
                        await inp.click()
                        await inp.fill(date_to)
                        filled += 1
                        print(f"    Set Date to: {date_to}")
                        break
            except Exception:
                continue

        if filled < 2:
            # Fallback: use evaluate to find and fill the inputs
            await page.evaluate("""([dateFrom, dateTo]) => {
                const inputs = document.querySelectorAll('input');
                const dateInputs = [];
                for (const input of inputs) {
                    const val = input.value || '';
                    if (/\\d{2}\\/\\d{2}\\/\\d{4}/.test(val) || input.closest('[class*="date"]')) {
                        dateInputs.push(input);
                    }
                }
                if (dateInputs.length >= 2) {
                    const setVal = (input, val) => {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, 'value').set;
                        nativeInputValueSetter.call(input, val);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    setVal(dateInputs[0], dateFrom);
                    setVal(dateInputs[1], dateTo);
                }
            }""", [date_from, date_to])
            print(f"    Set dates via JS fallback")

    except Exception as e:
        print(f"    Error setting dates: {e}")

    await asyncio.sleep(1)

    # Click Generate button
    try:
        gen_btn = page.locator('button:has-text("Generate")').first
        if await gen_btn.count() > 0:
            # Format: 2025.02.28 - Macquarie - Main Spending (3460) - custom report.pdf
            try:
                dt = datetime.strptime(date_to, "%d/%m/%Y")
                date_str = dt.strftime("%Y.%m.%d")
            except Exception:
                date_str = date_to.replace('/', '.')
            LABEL_DISPLAY = {
                "Main_Spending_3460": "Main Spending (3460)",
                "Rental_Expenses_0535": "Rental Expenses (0535)",
                "Second_Savings_8707": "Second Savings (8707)",
                "Schniggle": "Schniggle",
                "Loan_Old_Bar_2214": "Loan - Driftwood (2214)",
            }
            acct_name = LABEL_DISPLAY.get(label, label.replace('_', ' '))
            try:
                dt_from = datetime.strptime(date_from, "%d/%m/%Y")
                from_str = dt_from.strftime("%Y.%m.%d")
            except Exception:
                from_str = date_from.replace('/', '.')
            filename = safe_fn(f"{date_str} - Macquarie - {acct_name} - statement {from_str} to {date_str}.pdf")
            save_path = STATEMENTS_DIR / filename

            try:
                async with page.expect_download(timeout=30000) as dl_info:
                    await gen_btn.click(timeout=5000)
                    print(f"    Clicked Generate, waiting for download...")

                download = await dl_info.value
                await download.save_as(str(save_path))
                size = save_path.stat().st_size
                print(f"    SAVED: {filename} ({size / 1024:.1f} KB)")
                return save_path
            except PlaywrightTimeoutError:
                # Check for new tab
                pages = page.context.pages
                if len(pages) > 1:
                    new_page = pages[-1]
                    await asyncio.sleep(3)
                    print(f"    New tab opened, attempting download...")
                    try:
                        resp = await new_page.context.request.get(new_page.url)
                        content = await resp.body()
                        save_path.write_bytes(content)
                        size = save_path.stat().st_size
                        print(f"    SAVED (from tab): {filename} ({size / 1024:.1f} KB)")
                    except Exception as e:
                        print(f"    Tab download failed: {e}")
                    await new_page.close()
                    return save_path if save_path.exists() else None
                else:
                    print(f"    Generate timed out — no download detected")
                    await shot(page, f"{label}_generate_timeout")
        else:
            print(f"    Generate button not found")
    except Exception as e:
        print(f"    Error with Generate: {e}")

    return None


async def main():
    parser = argparse.ArgumentParser(description="Macquarie Bank statement scraper")
    parser.add_argument("--monthly", action="store_true",
                        help="Generate last month's custom report instead of downloading history")
    parser.add_argument("--from", dest="date_from",
                        help="Custom report start date (DD/MM/YYYY)")
    parser.add_argument("--to", dest="date_to",
                        help="Custom report end date (DD/MM/YYYY)")
    args = parser.parse_args()

    if not USER_ID or not PASSWORD:
        print("Set MACQUARIE_ID and MACQUARIE_PASSWORD in .env")
        return

    # Determine mode
    custom_mode = False
    custom_from = None
    custom_to = None

    if args.monthly:
        # Calculate last month's date range
        today = datetime.now()
        first_of_month = today.replace(day=1)
        last_of_prev = first_of_month - timedelta(days=1)
        first_of_prev = last_of_prev.replace(day=1)
        custom_from = first_of_prev.strftime("%d/%m/%Y")
        custom_to = last_of_prev.strftime("%d/%m/%Y")
        custom_mode = True
        print(f"MONTHLY MODE: {custom_from} - {custom_to}")
    elif args.date_from and args.date_to:
        custom_from = args.date_from
        custom_to = args.date_to
        custom_mode = True
        print(f"CUSTOM MODE: {custom_from} - {custom_to}")

    mode_label = "Custom report" if custom_mode else "Historical download"
    print(f"Macquarie Bank Scraper — {RUN_DATE} ({mode_label})")
    print(f"Accounts: {', '.join(a['name'] for a in TARGET_ACCOUNTS)}")
    print(f"Output: {BASE_DIR.resolve()}\n")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=100)
        ctx = await browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        try:
            if not await login(page):
                print("Login failed.")
                return
            await shot(page, "01_dashboard")

            total = 0

            for acct in TARGET_ACCOUNTS:
                name, label = acct["name"], acct["label"]
                print(f"\n{'='*60}")
                print(f"  {name}")
                print('='*60)

                # 1. From dashboard, click into the account
                if not await click_account(page, name):
                    print(f"    SKIP: couldn't click")
                    continue
                await shot(page, f"{label}_01_account")

                # 2. Click "I want to..." -> "View account statements and reports"
                if await open_statements(page, label):
                    await shot(page, f"{label}_statements_page")

                    if custom_mode:
                        # 3a. Generate custom date range report
                        result = await generate_custom_report(page, label, custom_from, custom_to)
                        if result:
                            total += 1
                            print(f"    Result: custom report generated")
                        else:
                            print(f"    Result: custom report FAILED")
                    else:
                        # 3b. Download all historical PDFs
                        n = await download_pdfs(page, label)
                        total += n
                        print(f"    Result: {n} PDFs downloaded")
                else:
                    print(f"    Could not reach statements page")

                # 4. Back to dashboard
                await go_home(page)
                await asyncio.sleep(2)

            # Summary
            print(f"\n{'='*60}")
            print(f"  DONE — {total} PDFs total")
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
            print("\nBrowser open 60s for review...")
            await asyncio.sleep(60)
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
