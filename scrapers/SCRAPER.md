# PropertyMe Owner Portal Scraper

Automated scraper for [my.propertyme.com](https://my.propertyme.com) that downloads all owner portal data for investment properties managed through PropertyMe.

## What It Does

Logs into the PropertyMe owner portal and downloads, for each owned property:

| Data Type | Format | Location |
|-----------|--------|----------|
| Documents (statements, leases, invoices) | PDF | `downloads/<date>/documents/<property>/` |
| Transaction history | CSV | `downloads/<date>/transactions/` |
| Property & tenancy details | JSON | `downloads/<date>/details/` |
| Inspection reports | PNG screenshots + TXT | `downloads/<date>/inspections/<property>/` |
| Maintenance summaries | JSON | `downloads/<date>/details/` |
| Page screenshots (debug) | PNG | `downloads/<date>/screenshots/` |

## Properties Scraped

The scraper discovers all properties on the portal and filters to **owned investment properties only**, skipping tenancy accounts (where you were the tenant):

| Property | Status |
|----------|--------|
| 25 Driftwood Boulevard, Old Bar | Active rental (Schniggle Trust) |
| 3 Bannerman Pl, South West Rocks | Active rental (Joint) |
| 19 Goldring St, Chisholm | Active rental (Kelly Personal) |
| 27 Calmwater Crescent, Helensvale | **Skipped** — tenancy account |
| 2 Pathfinder Way, Coomera Waters | **Skipped** — tenancy account |

The skip list is configured via `SKIP_PROPERTIES` in `scraper.py`. Heddon Greta and Lennox Heads are not on PropertyMe (managed separately).

## Setup

### Prerequisites

- Python 3.8+
- Playwright (Chromium)

### Install

```bash
pip install playwright python-dotenv
playwright install chromium
```

### Credentials

Create a `.env` file (see `.env.example`):

```
PROPERTYME_EMAIL=your@email.com
PROPERTYME_PASSWORD=yourpassword
```

## Usage

```bash
cd "files (1)"
python3 scraper.py
```

Runs in **headed mode** (visible browser) so you can watch progress and intervene if needed. The browser stays open for 15 seconds after completion.

Output goes to `downloads/YYYY-MM-DD/` with subdirectories per data type.

## Technical Notes

### Why Playwright (not requests/Selenium)

PropertyMe is a Vue.js SPA using PrimeVue components. Key challenges:

- **SPA routing**: Properties are selected via a dropdown picker, not URL parameters. Navigating by URL resets the selected property.
- **Vue event system**: JavaScript `el.click()` does NOT trigger Vue `@click` handlers. Playwright's native `.click()` dispatches real browser events that Vue responds to.
- **PrimeVue modals**: YouTube help videos and app promo modals use `p-dialog-mask` overlays that intercept all clicks. The scraper removes these via DOM manipulation.
- **Inline PDFs**: Document API endpoints return `Content-Type: application/pdf` without `Content-Disposition: attachment`, so `page.goto()` renders them inline. The scraper uses `fetch()` + blob + `<a download>` to trigger actual downloads.

### Key Implementation Details

**Property switching**: Opens the navbar dropdown button, then clicks `.property-picker-content` items using Playwright's native locator (not JS eval) to trigger Vue handlers.

**Document downloads**: Uses in-browser `fetch()` (which carries session cookies) to get PDFs as blobs, creates a temporary `<a download>` link, and clicks it to trigger Playwright's download event.

**Section navigation**: Clicks sidebar nav links instead of using URL navigation, which preserves the currently selected property in the SPA.

**Modal removal** (`nuke_modals`): Removes `.p-dialog-mask`, `.p-overlay-mask`, and YouTube iframes from the DOM before any click actions.

### Known Limitations

- **Financials table**: Transaction scraping works reliably via URL navigation but can miss the table when navigating via sidebar click (the table may need scrolling or additional load time). Existing CSVs from successful runs are kept.
- **Archived properties**: Helensvale and Coomera Waters are archived tenancy accounts with no documents, transactions, or inspections — only historical maintenance items. These are skipped by default.
- **Rate limiting**: No explicit rate limiting, but has `asyncio.sleep()` pauses between actions. PropertyMe hasn't shown rate-limiting behavior.

## Output Structure

```
downloads/2026-03-06/
  documents/
    25 Driftwood Boulevard, Old Bar/
      Statement - February 2026.pdf
      Statement - January 2026.pdf
      ...
    3 Bannerman Pl, South West Rocks/
      ...
    19 Goldring St, Chisholm/
      ...
  transactions/
    25 Driftwood Boulevard, Old Bar_transactions.csv
    3 Bannerman Pl, South West Rocks_transactions.csv
    19 Goldring St, Chisholm_transactions.csv
  details/
    <property>_details.json      # Home page text + tenancy info
    <property>_financials.txt    # Full financials page text
    <property>_maintenance.json  # Maintenance items
  inspections/
    <property>/
      <inspection_label>.png
      <inspection_label>.txt
  screenshots/
    <property>_home.png
    <property>_documents.png
    <property>_financials.png
    <property>_inspections.png
    dropdown_attempt_*.png
```

## Integration with Property Dashboard

The scraped data feeds into the property portfolio dashboard app (`property-dashboard/`). Key uses:

- **Documents tab**: PDFs from `documents/` are indexed and viewable in the evidence/document system
- **Transaction history**: CSVs from `transactions/` provide rental income and expense records for tax preparation
- **Tax audit**: Statements and financial data support the ongoing audit of previous tax returns across all entities
- **Elizabeth (accountant) prep**: Full-year Bankwest statements, insurance docs, and loan purpose mapping needed for returns due 31 March 2026
