# Macquarie Bank Statement Scraper

Downloads PDF statements from Macquarie Online Banking for all 5 accounts.

## Prerequisites

1. Python 3 with `playwright` and `python-dotenv` installed
2. Chromium browser installed for Playwright (`python3 -m playwright install chromium`)
3. `.env` file in the `scrapers/` directory with your credentials:
   ```
   MACQUARIE_ID=your_client_id
   MACQUARIE_PASSWORD=your_password
   ```

## Accounts

| Account | Label | Type |
|---------|-------|------|
| 1 Main Spending (3460) | Main Spending (3460) | Transaction |
| 2 - Rental Expenses (0535) | Rental Expenses (0535) | Transaction |
| Second Savings - 8707 | Second Savings (8707) | Savings |
| Schniggle | Schniggle | Business (M2K2 Trust) |
| Loan - Old Bar (2214) | Loan - Driftwood (2214) | Home Loan |

## How to Run

Always run from the `scrapers/` directory:

```bash
cd scrapers
```

### 1. Download All Historical Statements

Downloads every available PDF statement for all 5 accounts. Safe to re-run — skips files already downloaded.

```bash
python3 scraper_macquarie.py
```

### 2. Monthly Statement (Last Month)

Generates a custom report for the previous calendar month for each account. Use this at the start of each month to pull the prior month's data.

```bash
python3 scraper_macquarie.py --monthly
```

Example: Running on 6 March 2026 generates reports for 1 Feb – 28 Feb 2026.

### 3. Custom Date Range

Generates a report for a specific date range. Dates must be in DD/MM/YYYY format.

```bash
python3 scraper_macquarie.py --from 01/07/2025 --to 31/12/2025
```

## What Happens When You Run It

1. A Chrome browser opens and navigates to Macquarie Online Banking
2. Your credentials are auto-filled
3. **You must complete 2FA** — approve the push notification on your phone (you have up to 3 minutes)
4. Once logged in, the scraper visits each account automatically:
   - Clicks the account on the dashboard
   - Opens "I want to..." > "View account statements and reports"
   - Downloads all PDFs (historical mode) or generates a custom report
   - Returns to the dashboard and moves to the next account
5. The browser stays open for 60 seconds after finishing so you can review

## Output

All files save to:

```
scrapers/downloads/macquarie_YYYY-MM-DD/statements/
```

### File Naming

**Historical statements:**
```
2024.12.31 - Macquarie - Main Spending (3460) - 6 month statement.pdf
2023.12.31 - Macquarie - Schniggle - quarterly statement.pdf
2025.06.30 - Macquarie - Loan - Driftwood (2214) - 6 month statement.pdf
```

Format: `{end date} - Macquarie - {account} - {type} statement.pdf`

**Custom/monthly reports:**
```
Macquarie - Main Spending (3460) - statement 2025.02.01 to 2025.02.28.pdf
```

Format: `Macquarie - {account} - statement {from date} to {to date}.pdf`

Screenshots are saved alongside in `screenshots/` for debugging if anything goes wrong.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Set MACQUARIE_ID and MACQUARIE_PASSWORD in .env" | Create/check your `.env` file in the `scrapers/` directory |
| Login times out after 3 minutes | Complete 2FA faster — approve the push notification on your phone |
| "SKIP: couldn't click" for an account | The account name may have changed in Macquarie's UI. Check the dashboard screenshot and update `TARGET_ACCOUNTS` in the script |
| 0 PDFs downloaded | Check the screenshots folder — the page layout may have changed |
| Browser doesn't open | Run `python3 -m playwright install chromium` |
