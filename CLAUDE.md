# Property Portfolio Dashboard

## What This Is
Tax and financial management app for Kelly and Mark Pellas. 5 investment properties held across 3 personal entities and 2 investment trusts, plus Mark's consulting business (M2K2 Trust — no properties). Built to replace the chaos of spreadsheets and email-trawling that makes tax time painful.

## How to Run
```bash
npm run dev   # Vite (3456) + Express (3001) via concurrently
```
**CRITICAL**: Both servers must bind to `127.0.0.1` (Node 23 IPv6 issue). Never remove the host bindings in `vite.config.ts` and `server/index.ts`.

User must clear browser localStorage when seed data changes (Zustand persists to localStorage).

## Stack
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + Zustand
- **Backend**: Express (port 3001) — document indexing, file uploads (50MB limit), Claude chat (SSE streaming)
- **Persistence**: Zustand stores → localStorage. Keys: `portfolio-store`, `expense-store`, `evidence-store`
- **Source docs**: `/Users/kellypellas/Desktop/2024-2025/PROPERTIES/` (335 files, organized by property)

## UI Rules (hard-won through 6 iterations)
- **Grey/black for all text and badges** — no pastel backgrounds
- **Red ONLY for things needing attention**: missing docs, assumed data, needs confirmation
- **No colored entity/status badges** for informational purposes — grey only
- **Column/table layouts** over card layouts for data display
- Strip visual noise ruthlessly — if color doesn't add meaning, remove it

## Domain Rules
- **Loan PURPOSE** = the property the money was used FOR (what the accountant needs)
- **Loan propertyId** = the security/collateral (what the bank sees)
- **Interest deductibility follows PURPOSE, not security** — a cash-out against Chisholm used for Lennox is deductible against Lennox
- Each Bankwest account number is a separate loan (no "linked accounts" except offset 6189)
- Account 5599 is a real loan (-$507K), NOT an offset account
- **Heddon Greta is 100% Mark** (verified: Bankwest mortgage doc, Mortgagor: MARK ANTHONY PELLAS, sole)
- **Lennox has NO debt** — deposit paid with cash, construction not started
- Source verification requires actual PDFs, not Gemini email summaries

## Entities
| ID | Name | Type | Properties |
|----|------|------|-----------|
| kelly-personal | Kelly (Personal) | personal | Chisholm (100% Kelly) |
| mark-personal | Mark (Personal) | personal | Heddon Greta (100% Mark) |
| joint-personal | Kelly & Mark (Joint) | personal | Bannerman (50/50) |
| m2k2-trust | M2K2 Trust | business_trust | None (consulting business) |
| schniggle-trust | M2K2 Investment Trust | trust | Old Bar |
| lennox-trust | Lennox Trust | trust | Lennox Heads |

## Key Concern: Tax Return Audit
Kelly wants to audit ALL previous tax returns — not just Heddon Greta. She suspects errors across the board and wants to compare what was lodged vs what should have been lodged for every property, every year. Heddon Greta ownership (50/50 vs 100% Mark) is the one with hard evidence of error, but the audit covers:
- Ownership percentages on every property
- Loan interest allocation (purpose vs security)
- Missing deductions (insurance, water rates, depreciation)
- Cross-collateral loan interest attribution
- Expense categorization
- A Tax Review page is being built to upload returns and flag discrepancies

## Elizabeth Transcript
Located at: `/Users/kellypellas/Desktop/2024-2025/03-03 Financial Reconciliation and Tax Planning for Multiple Entities-transcript.txt`
- Speaker 2 = Kelly, Speaker 3 = Elizabeth
- Elizabeth needs: full-year Bankwest statements, insurance docs, loan purpose mapping
- Returns due 31 March 2026

## File Structure
```
src/
  components/
    common/          # EntityBadge, StatusBadge, SourceBadge, MetricCard
    dashboard/       # DashboardPage (portfolio + business modes)
    entities/        # EntitiesPage
    properties/      # PropertiesPage, PropertyDetailPage
    loans/           # LoansPage, LoanChain
    expenses/        # ExpensesPage (Registers)
    tax/             # TaxPrepPage
    evidence/        # EvidencePage, UploadButton
    chat/            # ChatPanel
    layout/          # AppShell, Sidebar
  store/             # portfolioStore, uiStore, expenseStore, evidenceStore, chatStore
  data/seed.ts       # All seed data (entities, properties, loans, tax docs, etc.)
  types.ts           # All TypeScript interfaces
  utils/format.ts    # formatCurrency, getLenderColor
server/
  index.ts           # Express entry point
  routes/            # documents, upload, chat
  services/          # documentIndex, claudeContext
```

## Known Bugs
1. `from_gemini` confidence type in seed.ts — not valid, should be `assumed`
2. Dead `transactions` route in AppShell/Page type
3. Sidebar says "Registers" but page says "Expenses & Deductions"
4. NOI calculation missing management fees, water rates, land tax
5. Old Bar is `active_rental` with $0 rent (it IS tenanted, need actual rent amount)
