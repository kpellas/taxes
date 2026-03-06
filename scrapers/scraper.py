"""
PropertyMe Owner Portal Scraper
================================
Downloads all owner data from my.propertyme.com:
  - Documents & statements (PDF)
  - Transaction history (CSV)
  - Property & tenancy details (JSON)
  - Inspection screenshots
  - Maintenance summaries (JSON)

Usage:
    python3 scraper.py
"""

import asyncio
import csv
import json
import os
import re
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

load_dotenv()

EMAIL    = os.getenv("PROPERTYME_EMAIL")
PASSWORD = os.getenv("PROPERTYME_PASSWORD")
BASE_URL = "https://my.propertyme.com"

RUN_DATE = datetime.now().strftime("%Y-%m-%d")
BASE_DIR = Path("downloads") / RUN_DATE

# Only scrape properties you OWN (investment properties).
# Skips tenancy accounts where you were the tenant (e.g. Helensvale, Coomera Waters).
SKIP_PROPERTIES = [
    "Calmwater",   # 27 Calmwater Crescent, Helensvale (tenancy)
    "Pathfinder",  # 2 Pathfinder Way, Coomera Waters (tenancy)
]

DOCUMENTS_DIR    = BASE_DIR / "documents"
TRANSACTIONS_DIR = BASE_DIR / "transactions"
DETAILS_DIR      = BASE_DIR / "details"
INSPECTIONS_DIR  = BASE_DIR / "inspections"
SCREENSHOTS_DIR  = BASE_DIR / "screenshots"

for d in [DOCUMENTS_DIR, TRANSACTIONS_DIR, DETAILS_DIR, INSPECTIONS_DIR, SCREENSHOTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def safe_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip()


# Map address keywords to standard property display names
PROPERTY_NAME_MAP = {
    'driftwood': 'Old Bar',
    'old bar': 'Old Bar',
    'emerald': 'Old Bar',
    'bannerman': 'Bannerman',
    'southwest rocks': 'Bannerman',
    'south west rocks': 'Bannerman',
    'goldring': 'Chisholm',
    'chisholm': 'Chisholm',
    'waterford': 'Chisholm',
    'avery': 'Heddon Greta',
    'heddon greta': 'Heddon Greta',
    'heddon': 'Heddon Greta',
    'lennox': 'Lennox',
}

import calendar
MONTH_MAP = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}
MONTH_MAP.update({m.lower(): i for i, m in enumerate(calendar.month_abbr) if m})


def get_property_name(prop_name):
    """Extract standard property name from address string."""
    lower = prop_name.lower()
    for key, name in PROPERTY_NAME_MAP.items():
        if key in lower:
            return name
    # Fallback: first part of address before comma
    return prop_name.split(',')[0].strip()


def extract_date_from_text(text):
    """Try to extract a date from document text like 'Owner Statement - January 2025'."""
    # Match "Month YYYY" pattern
    match = re.search(r'(\w+)\s+(\d{4})', text)
    if match:
        month_str, year_str = match.group(1).lower(), match.group(2)
        if month_str in MONTH_MAP:
            month_num = MONTH_MAP[month_str]
            last_day = calendar.monthrange(int(year_str), month_num)[1]
            return f"{year_str}.{month_num:02d}.{last_day:02d}"

    # Match DD/MM/YYYY or DD-MM-YYYY
    match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', text)
    if match:
        d, m, y = match.groups()
        return f"{y}.{int(m):02d}.{int(d):02d}"

    # Match YYYY-MM-DD
    match = re.search(r'(\d{4})-(\d{2})-(\d{2})', text)
    if match:
        y, m, d = match.groups()
        return f"{y}.{m}.{d}"

    return None


def format_standard_filename(prop, doc_text):
    """Build standard filename: YYYY.MM.DD - Property - PropertyMe - Doc Type.pdf"""
    property_name = get_property_name(prop["original"])

    date_str = extract_date_from_text(doc_text)
    if not date_str:
        date_str = datetime.now().strftime("%Y.%m.%d")

    # Clean doc type — remove extension and sanitize
    doc_type = re.sub(r'\.(pdf|PDF)$', '', doc_text.strip())
    doc_type = safe_filename(doc_type)

    return f"{date_str} - {property_name} - PropertyMe - {doc_type}.pdf"


async def nuke_modals(page):
    await page.evaluate("""() => {
        document.querySelectorAll('.p-dialog-mask, .p-overlay-mask').forEach(el => el.remove());
        document.querySelectorAll('iframe[src*="youtube"]').forEach(el => {
            const p = el.closest('[class*="dialog"], [class*="modal"]');
            if (p) p.remove(); else el.remove();
        });
        // Also remove any fixed/absolute overlays
        document.querySelectorAll('div').forEach(el => {
            const s = getComputedStyle(el);
            if (s.position === 'fixed' && s.zIndex > 100 && el.querySelector('iframe, video')) {
                el.remove();
            }
        });
    }""")


async def dismiss_and_nuke(page):
    for sel in ['button:has-text("Don\'t show again")', 'button:has-text("Close")',
                'button:has-text("Not now")', '.p-dialog-close-button']:
        try:
            await page.click(sel, timeout=1_500)
            await asyncio.sleep(0.5)
        except PlaywrightTimeoutError:
            continue
    await nuke_modals(page)


async def login(page):
    print("Logging in...")
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.wait_for_selector('input[type="email"], input[name="email"]', timeout=15_000)
    await page.fill('input[type="email"], input[name="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Log In")')

    try:
        await page.wait_for_selector('text=Home', timeout=30_000)
    except PlaywrightTimeoutError:
        pass
    await asyncio.sleep(3)
    await dismiss_and_nuke(page)
    await asyncio.sleep(1)
    await dismiss_and_nuke(page)
    print(f"  OK. URL: {page.url}")


async def goto_section(page, section):
    """Navigate to a section. Uses sidebar clicks to preserve the selected property."""
    if not section:
        # Home — click sidebar "Home" link
        try:
            await nuke_modals(page)
            await page.locator('nav a:has-text("Home"), a:has-text("Home")').first.click(timeout=5_000)
            await asyncio.sleep(3)
            await nuke_modals(page)
            return
        except Exception:
            pass
    else:
        # Try sidebar click first (preserves selected property)
        label = section.capitalize()  # "financials" -> "Financials", "documents" -> "Documents"
        try:
            await nuke_modals(page)
            await page.locator(f'nav a:has-text("{label}"), a:has-text("{label}")').first.click(timeout=5_000)
            await asyncio.sleep(3)
            await nuke_modals(page)
            return
        except Exception:
            pass

    # Fallback: URL navigation (may reset property selection)
    url = f"{BASE_URL}/owner/{section}" if section else f"{BASE_URL}/owner"
    await page.goto(url, wait_until="domcontentloaded")
    await asyncio.sleep(3)
    await nuke_modals(page)


# -- Property Discovery & Switching ------------------------------------------

async def open_property_dropdown(page) -> bool:
    """Click the specific <button> in the navbar that contains the property name + chevron."""
    await nuke_modals(page)
    # Target: <button class="flex gap-items rounded-hero ..."> with address text + SVG chevron
    opened = await page.evaluate("""() => {
        const re = /\\d+\\s+\\w+.*(Blvd|Boulevard|St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Pl|Place|Cres|Crescent|Way|Ln|Lane|Ct|Court)/i;
        // Strategy 1: find the specific <button> with the address
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.innerText?.trim();
            if (text && re.test(text) && text.length < 80) {
                btn.click();
                return 'clicked-button: ' + text;
            }
        }
        return null;
    }""")
    if opened:
        print(f"      {opened}")
        await asyncio.sleep(3)  # extra wait for dropdown animation
    return opened is not None


async def get_properties(page) -> list:
    """Open the property dropdown and collect all addresses."""
    print("\nDiscovering properties...")
    await goto_section(page, "")

    # First, dump the HTML structure around the property name to understand the dropdown
    dropdown_info = await page.evaluate("""() => {
        const re = /^\\d+\\s+\\w+.*(Blvd|Boulevard|St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Pl|Place|Cres|Crescent|Way|Ln|Lane|Ct|Court)/i;
        const allEls = document.querySelectorAll('*');
        for (const el of allEls) {
            const text = el.innerText?.trim();
            if (text && re.test(text) && text.length < 80 && el.children.length < 10) {
                // Walk up the tree to find the dropdown container
                let node = el;
                const chain = [];
                for (let i = 0; i < 5 && node; i++) {
                    chain.push({
                        tag: node.tagName,
                        classes: node.className || '',
                        id: node.id || '',
                        role: node.getAttribute('role') || '',
                        onclick: node.onclick ? 'has-handler' : '',
                        childCount: node.children.length,
                        outerHTML: node.outerHTML?.slice(0, 300)
                    });
                    node = node.parentElement;
                }
                return { text: text, chain: chain };
            }
        }
        return null;
    }""")
    print(f"    Dropdown element structure:")
    if dropdown_info:
        print(f"      Text: {dropdown_info['text']}")
        for i, c in enumerate(dropdown_info['chain']):
            print(f"      {'  '*i}[{c['tag']}] class=\"{c['classes'][:80]}\" role=\"{c['role']}\" children={c['childCount']}")

    # Diagnostic: dump the HTML structure of elements containing property addresses
    diag = await page.evaluate("""() => {
        const re = /Driftwood|Bannerman|Goldring|Calmwater|Pathfinder/i;
        const allEls = document.querySelectorAll('*');
        const results = [];
        for (const el of allEls) {
            const text = el.innerText?.trim();
            if (text && re.test(text) && el.children.length < 8 && text.length < 120) {
                results.push({
                    tag: el.tagName,
                    cls: (el.className || '').slice(0, 120),
                    role: el.getAttribute('role') || '',
                    ariaExpanded: el.getAttribute('aria-expanded') || '',
                    ariaHaspopup: el.getAttribute('aria-haspopup') || '',
                    text: text.slice(0, 80),
                    children: el.children.length,
                    html: el.outerHTML?.slice(0, 300) || ''
                });
            }
        }
        return results;
    }""")
    print(f"    Elements containing property addresses ({len(diag)}):")
    for d in diag[:15]:
        print(f"      <{d['tag']} class=\"{d['cls'][:60]}\" role=\"{d['role']}\" aria-expanded=\"{d['ariaExpanded']}\" children={d['children']}> {d['text'][:50]}")

    for attempt in range(5):
        result = await open_property_dropdown(page)
        print(f"    Dropdown attempt {attempt+1}: {result}")

        await page.screenshot(path=str(SCREENSHOTS_DIR / f"dropdown_attempt_{attempt+1}.png"), full_page=True)

        # Check for PrimeVue dropdown panels
        panels = await page.evaluate("""() => {
            const panels = document.querySelectorAll('[class*="dropdown-panel"], [class*="p-dropdown"], [class*="listbox"], [class*="overlay-panel"], [role="listbox"]');
            return Array.from(panels).map(p => ({
                tag: p.tagName,
                classes: p.className?.slice(0, 100) || '',
                text: p.innerText?.slice(0, 500) || '',
                visible: p.offsetParent !== null
            }));
        }""")
        if panels:
            print(f"    Found {len(panels)} dropdown panel(s):")
            for p in panels:
                print(f"      [{p['tag']}] visible={p['visible']} text={p['text'][:100]}")

        # Scan for addresses
        addresses = await page.evaluate("""() => {
            const re = /^\\d+\\s+\\w+.*(street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|place|pl|crescent|cres|way|lane|ln|court|ct)/i;
            const els = document.querySelectorAll('*');
            const found = new Set();
            els.forEach(el => {
                if (el.children.length > 3) return;
                const text = el.innerText?.trim().split('\\n')[0];
                if (text && re.test(text) && text.length < 100) found.add(text);
            });
            return Array.from(found);
        }""")

        print(f"    Addresses found: {len(addresses)}: {addresses}")
        if len(addresses) > 1:
            break
        await asyncio.sleep(1)

    all_properties = [{"name": safe_filename(a[:80]), "original": a} for a in addresses]

    if not all_properties:
        await page.screenshot(path=str(SCREENSHOTS_DIR / "no_properties.png"), full_page=True)
        print("  No properties found!")
        return []

    # Filter out tenancy accounts (properties you rented, not owned)
    properties = [
        p for p in all_properties
        if not any(skip.lower() in p["original"].lower() for skip in SKIP_PROPERTIES)
    ]
    skipped = len(all_properties) - len(properties)

    print(f"  Found {len(all_properties)} propert{'y' if len(all_properties)==1 else 'ies'} ({skipped} tenancy accounts skipped):")
    for p in all_properties:
        is_skipped = any(skip.lower() in p["original"].lower() for skip in SKIP_PROPERTIES)
        print(f"    {'[SKIP] ' if is_skipped else ''}{p['original']}")
    return properties


async def switch_to_property(page, prop) -> bool:
    """Open dropdown via the navbar button, click target property."""
    print(f"  Switching to: {prop['original']}...")
    await goto_section(page, "")

    for attempt in range(3):
        # Step 1: Click the navbar button to open dropdown
        await open_property_dropdown(page)

        # Step 2: Dump what's visible in the dropdown for debugging
        dropdown_items = await page.evaluate("""() => {
            const re = /\\d+\\s+\\w+.*(Blvd|Boulevard|St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Pl|Place|Cres|Crescent|Way|Ln|Lane|Ct|Court)/i;
            const els = document.querySelectorAll('*');
            const items = [];
            for (const el of els) {
                if (el.children.length > 3) continue;
                const text = el.innerText?.trim().split('\\n')[0];
                if (text && re.test(text) && text.length < 100) {
                    items.push({ text, tag: el.tagName, cls: (el.className || '').slice(0, 80) });
                }
            }
            return items;
        }""")
        if attempt == 0:
            print(f"    Dropdown items visible:")
            for item in dropdown_items:
                print(f"      <{item['tag']} class=\"{item['cls'][:50]}\"> {item['text']}")

        # Step 3: Click the target property using Playwright native click (not JS eval)
        # JS eval .click() doesn't trigger Vue event handlers — need real browser events
        target = prop["original"]
        target_prefix = target.split(",")[0].strip()

        clicked = None
        # Try Playwright locator click on .property-picker-content
        try:
            pickers = page.locator('.property-picker-content')
            count = await pickers.count()
            for j in range(count):
                picker = pickers.nth(j)
                text = (await picker.inner_text()).strip().split("\n")[0]
                if text.startswith(target_prefix):
                    await picker.click(timeout=5_000)
                    clicked = f"Playwright clicked picker: {text}"
                    break
        except Exception as e:
            # Fallback: keyboard navigation
            try:
                # The dropdown should be focused — press ArrowDown to navigate
                pickers_text = await page.evaluate("""() => {
                    return Array.from(document.querySelectorAll('.property-picker-content'))
                        .map(el => el.innerText?.trim().split('\\n')[0]);
                }""")
                if target_prefix in str(pickers_text):
                    # Find how many ArrowDown presses needed
                    idx = next(i for i, t in enumerate(pickers_text) if t.startswith(target_prefix))
                    for _ in range(idx):
                        await page.keyboard.press("ArrowDown")
                        await asyncio.sleep(0.2)
                    await page.keyboard.press("Enter")
                    clicked = f"Keyboard selected: index {idx}"
            except Exception:
                pass

        if not clicked:
            print(f"    Attempt {attempt+1}: target not found in dropdown")
            continue

        print(f"    {clicked}")
        await asyncio.sleep(3)
        await nuke_modals(page)

        # Verify we switched
        body_start = await page.evaluate("() => document.body.innerText.slice(0, 300)")
        if target_prefix in body_start:
            print(f"    Switched OK")
            return True
        else:
            print(f"    Attempt {attempt+1}: clicked but page didn't change")

    print(f"    Switch FAILED after 3 attempts")
    return False


# -- Documents: Download PDFs via goto() ------------------------------------

async def scrape_documents(page, prop):
    """
    Navigate to Documents page, collect all API download hrefs,
    then download each by navigating to the URL (triggers download).
    """
    print(f"\n  [Documents]")
    await goto_section(page, "documents")

    prop_doc_dir = DOCUMENTS_DIR / prop["name"]
    prop_doc_dir.mkdir(exist_ok=True)

    # Scroll to load all documents
    for _ in range(10):
        prev_h = await page.evaluate("() => document.body.scrollHeight")
        await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1)
        if await page.evaluate("() => document.body.scrollHeight") == prev_h:
            break

    # Collect unique document links (href -> filename)
    doc_links = await page.evaluate("""() => {
        const links = document.querySelectorAll('a[href*="/api/portal/"]');
        const seen = new Map();
        links.forEach(el => {
            const href = el.href;
            const text = el.innerText?.trim();
            if (href && text && !seen.has(href)) {
                seen.set(href, text);
            }
        });
        return Array.from(seen.entries()).map(([href, text]) => ({ href, text }));
    }""")

    print(f"    Found {len(doc_links)} unique documents")

    # Download each document using JS fetch (PDFs render inline, not as downloads)
    downloaded = 0
    for doc in doc_links:
        filename = format_standard_filename(prop, doc["text"])
        save_path = prop_doc_dir / filename
        if save_path.exists():
            print(f"    Skip: {filename}")
            downloaded += 1
            continue

        try:
            # Use JS fetch() in the browser context (carries session cookies)
            # then create a blob URL and trigger download via <a download> click
            async with page.expect_download(timeout=30_000) as dl_info:
                await page.evaluate("""async (args) => {
                    const [url, name] = args;
                    const resp = await fetch(url);
                    const blob = await resp.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                }""", [doc["href"], filename])

            download = await dl_info.value
            await download.save_as(str(save_path))
            print(f"    OK: {filename}")
            downloaded += 1

        except PlaywrightTimeoutError:
            print(f"    Timeout: {filename}")
        except Exception as e:
            print(f"    Error: {filename} - {e}")

        await asyncio.sleep(0.5)

    await page.screenshot(path=str(SCREENSHOTS_DIR / f"{prop['name']}_documents.png"), full_page=True)
    print(f"    Total: {downloaded}/{len(doc_links)}")

    with open(prop_doc_dir / "_index.json", "w") as f:
        json.dump({"property": prop["name"], "scraped_at": datetime.now().isoformat(),
                    "documents": [d["text"] for d in doc_links]}, f, indent=2)


# -- Financials --------------------------------------------------------------

async def scrape_financials(page, prop):
    print(f"\n  [Financials]")
    await goto_section(page, "financials")

    headers = await page.eval_on_selector_all(
        'table thead th, table thead td',
        'els => els.map(el => el.innerText.trim())'
    )
    rows = await page.eval_on_selector_all(
        'table tbody tr',
        'rows => rows.map(r => Array.from(r.querySelectorAll("td")).map(c => c.innerText.trim()))'
    )

    if rows:
        save_path = TRANSACTIONS_DIR / f"{prop['name']}_transactions.csv"
        with open(save_path, "w", newline="") as f:
            writer = csv.writer(f)
            if headers:
                writer.writerow(headers)
            writer.writerows(rows)
        print(f"    Saved: {save_path.name} ({len(rows)} rows)")
    else:
        print("    No transaction table found")

    page_text = await page.evaluate("() => document.body.innerText")
    with open(DETAILS_DIR / f"{prop['name']}_financials.txt", "w") as f:
        f.write(page_text)
    await page.screenshot(path=str(SCREENSHOTS_DIR / f"{prop['name']}_financials.png"), full_page=True)


# -- Details -----------------------------------------------------------------

async def scrape_details(page, prop):
    print(f"\n  [Details]")
    await goto_section(page, "")

    page_text = await page.evaluate("() => document.body.innerText")
    save_path = DETAILS_DIR / f"{prop['name']}_details.json"
    with open(save_path, "w") as f:
        json.dump({"property_name": prop["name"], "scraped_at": datetime.now().isoformat(),
                    "page_text": page_text}, f, indent=2)
    print(f"    Saved: {save_path.name}")
    await page.screenshot(path=str(SCREENSHOTS_DIR / f"{prop['name']}_home.png"), full_page=True)


# -- Inspections -------------------------------------------------------------

async def scrape_inspections(page, prop):
    print(f"\n  [Inspections]")
    await goto_section(page, "")
    await nuke_modals(page)

    await page.evaluate("""() => {
        const els = document.querySelectorAll('button, a, [role="tab"]');
        for (const el of els) {
            if (el.innerText?.trim() === 'Inspections') { el.click(); return; }
        }
    }""")
    await asyncio.sleep(2)

    prop_insp_dir = INSPECTIONS_DIR / prop["name"]
    prop_insp_dir.mkdir(exist_ok=True)

    # Get inspection link hrefs
    insp_urls = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(el => el.href?.includes('/inspection/'))
            .map(el => ({ text: el.innerText.trim(), href: el.href }));
    }""")

    if insp_urls:
        print(f"    Found {len(insp_urls)} inspection link(s)")
        for insp in insp_urls:
            label = safe_filename(insp["text"].replace("\n", " ")[:60]) or "inspection"
            # Navigate directly to the inspection URL
            try:
                await page.goto(insp["href"], wait_until="domcontentloaded")
                await asyncio.sleep(3)
                await nuke_modals(page)
                await page.screenshot(path=str(prop_insp_dir / f"{label}.png"), full_page=True)
                print(f"      Screenshot: {label}.png")

                # Save page text
                text = await page.evaluate("() => document.body.innerText")
                with open(prop_insp_dir / f"{label}.txt", "w") as f:
                    f.write(text)
            except Exception as e:
                print(f"      Error: {label} - {e}")
    else:
        print("    No inspection links found")

    await page.screenshot(path=str(SCREENSHOTS_DIR / f"{prop['name']}_inspections.png"), full_page=True)


# -- Maintenance -------------------------------------------------------------

async def scrape_maintenance(page, prop):
    print(f"\n  [Maintenance]")
    await goto_section(page, "")

    await page.evaluate("""() => {
        const els = document.querySelectorAll('button, a, [role="tab"]');
        for (const el of els) {
            if (el.innerText?.trim() === 'Maintenance') { el.click(); return; }
        }
    }""")
    await asyncio.sleep(2)

    items = await page.evaluate("""() => {
        const els = document.querySelectorAll('[class*="activity"], li, tr');
        return Array.from(els)
            .map(el => el.innerText?.trim().replace(/\\s+/g, ' '))
            .filter(t => t && t.length > 5 && t.length < 300);
    }""")

    if items:
        save_path = DETAILS_DIR / f"{prop['name']}_maintenance.json"
        with open(save_path, "w") as f:
            json.dump({"property": prop["name"], "scraped_at": datetime.now().isoformat(), "items": items}, f, indent=2)
        print(f"    Saved: {save_path.name} ({len(items)} items)")


# -- Main --------------------------------------------------------------------

async def main():
    if not EMAIL or not PASSWORD:
        print("Missing credentials. Set PROPERTYME_EMAIL and PROPERTYME_PASSWORD in .env")
        return

    print(f"PropertyMe Scraper - {RUN_DATE}")
    print(f"Saving to: {BASE_DIR.resolve()}\n")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context(accept_downloads=True)
        page    = await context.new_page()

        try:
            await login(page)
            properties = await get_properties(page)

            if not properties:
                return

            for i, prop in enumerate(properties):
                print(f"\n{'='*60}")
                print(f"Property {i+1}/{len(properties)}: {prop['original']}")
                print('='*60)

                if i > 0:
                    if not await switch_to_property(page, prop):
                        print(f"  SKIPPING")
                        continue

                await scrape_details(page, prop)
                await scrape_documents(page, prop)
                await scrape_financials(page, prop)
                await scrape_inspections(page, prop)
                await scrape_maintenance(page, prop)

        except Exception as e:
            print(f"\nError: {e}")
            import traceback
            traceback.print_exc()
            await page.screenshot(path="error_screenshot.png", full_page=True)
        finally:
            print("\nBrowser stays open 15s...")
            await asyncio.sleep(15)
            await browser.close()

    print(f"\nDone! Files in: {BASE_DIR.resolve()}")


if __name__ == "__main__":
    asyncio.run(main())
