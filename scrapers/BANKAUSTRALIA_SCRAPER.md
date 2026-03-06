# Bank Australia Statement Scraper (Sarcophilus)

Downloads all eStatements from Bank Australia online banking.

## Prerequisites

1. Python 3 with `playwright` and `python-dotenv` installed
2. Chromium browser installed for Playwright (`python3 -m playwright install chromium`)
3. `.env` file in the `scrapers/` directory with credentials:
   ```
   BANKAUST_ID=your_customer_number
   BANKAUST_PASSWORD=your_password
   ```

## Accounts

Two accounts under customer number 1910194:

| Account | Number | Statement Series |
|---------|--------|-----------------|
| Kelly and Mark | 12321167 | #1–41 (from Oct 2022) |
| Commercial Saver | 12320348 | #1–19 (Mar 2021–Sep 2022), then #20–60 |

## How to Run

Always run from the `scrapers/` directory:

```bash
cd scrapers
```

### 1. Download All Historical Statements

Downloads every available eStatement for both accounts. Safe to re-run — skips files already downloaded.

```bash
python3 scraper_bankaustralia.py
```

### 2. Monthly Statement (Last Month)

Downloads only last month's statements.

```bash
python3 scraper_bankaustralia.py --monthly
```

### 3. Custom Date Range

Downloads statements within a specific date range. Dates in DD/MM/YYYY format.

```bash
python3 scraper_bankaustralia.py --from 01/07/2025 --to 31/12/2025
```

## What Happens When You Run It

1. A Chrome browser opens and navigates to Bank Australia online banking
2. Credentials are typed in automatically (no 2FA normally, but if prompted for SMS verification, enter the code manually)
3. Once logged in, navigates directly to the eStatements page
4. Extracts PDF URLs from the page and downloads each one
5. Browser stays open 30 seconds after finishing

## Output

Files save to:

```
scrapers/downloads/bankaustralia_YYYY-MM-DD/statements/
```

### File Naming

```
2026.01.31 - Sarcophilus - Bank Australia - Bank Statement #40.pdf
2025.12.31 - Sarcophilus - Bank Australia - Bank Statement #58.pdf
```

Format: `{end date} - Sarcophilus - Bank Australia - Bank Statement #{number}.pdf`

The statement number differentiates the two accounts for the same period.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Customer number not filling | The scraper types it character by character. If it still fails, log in manually and check if the page layout changed |
| SMS verification prompt | Enter the code manually in the browser — the scraper waits up to 2 minutes |
| 0 PDFs downloaded | Check `page_text.txt` and screenshots in the output directory |
| "Login timed out" | May be locked out from too many attempts. Wait and try again, or log in via the website first |
