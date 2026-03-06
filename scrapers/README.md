# PropertyMe Owner Access Scraper

Automatically logs into `my.propertyme.com` and downloads all your landlord data:

- 📄 Financial statements (PDF)
- 💰 Transaction history (CSV)
- 🏡 Property & tenancy details (JSON)
- 🔍 Inspection reports (PDF)
- 🔧 Jobs / maintenance summaries (JSON)

Data is saved to a `downloads/YYYY-MM-DD/` folder each time you run it.

---

## Setup (one-time)

### 1. Install Python dependencies

Open Terminal and run:

```bash
pip3 install playwright python-dotenv
playwright install chromium
```

### 2. Add your credentials

Copy the example env file and fill in your details:

```bash
cp .env.example .env
```

Open `.env` in any text editor and set:

```
PROPERTYME_EMAIL=your@email.com
PROPERTYME_PASSWORD=yourpassword
```

---

## Running the scraper

```bash
python3 scraper.py
```

A browser window will open (so you can see what it's doing). It will log in, find all your properties, and save everything to the `downloads/` folder.

To run it invisibly (no browser window), open `scraper.py` and change:

```python
browser = await pw.chromium.launch(headless=False)
# change to:
browser = await pw.chromium.launch(headless=True)
```

---

## Automating monthly runs (Mac)

To run automatically on the 1st of every month, add a cron job:

```bash
crontab -e
```

Add this line (update the path to wherever you saved the script):

```
0 9 1 * * cd /path/to/propertyme_scraper && python3 scraper.py >> downloads/log.txt 2>&1
```

This runs at 9am on the 1st of every month and logs output to `downloads/log.txt`.

---

## Output folder structure

```
downloads/
└── 2025-06-01/
    ├── statements/
    │   └── 123 Main St/
    │       ├── May 2025.pdf
    │       └── April 2025.pdf
    ├── transactions/
    │   └── 123 Main St_transactions.csv
    ├── inspections/
    │   └── 123 Main St/
    │       └── Routine Inspection March 2025.pdf
    └── details/
        ├── 123 Main St_details.json
        └── 123 Main St_jobs.json
```

---

## Troubleshooting

**"No properties found"** — The portal layout may have changed. Run with `headless=False` 
(the default) so you can see the browser and check what's on screen.

**Login fails** — Double-check your `.env` credentials match what you use at `my.propertyme.com`.

**Some data missing** — PropertyMe's Owner Access portal only shows what your property manager 
has made visible to you. If something isn't in the portal, the scraper can't download it.
