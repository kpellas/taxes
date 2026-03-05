#!/usr/bin/env python3
"""Rename property documents to follow the standard naming convention:
   YYYY.MM.DD - Property - Creator - Description.pdf
"""

import os
import re
import json
import urllib.request

BASE = "/Users/kellypellas/Desktop/2024-2025/PROPERTIES"

# Fetch document index for metadata
def load_index():
    try:
        with urllib.request.urlopen("http://127.0.0.1:3001/api/documents/index") as r:
            return json.loads(r.read())["documents"]
    except:
        return []

docs_index = load_index()
docs_by_path = {d["relativePath"]: d for d in docs_index}

def clean_desc(name):
    """Convert Bankwest-style filenames to readable descriptions"""
    # Strip extension
    name = re.sub(r'\.\w+$', '', name)
    # Replace underscores with spaces
    name = name.replace('_', ' ')
    # Fix possessives: "Borrower s" -> "Borrowers"
    name = re.sub(r'(\w)\s+s\b', r"\1's", name)
    # Clean up extra spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name

renames = []

# ============================================================
# 1. BANKWEST EXTRACTED LOAN DOCS
# These are in folders named "Property - AccountNum" under refinance/purchase dirs
# ============================================================

bankwest_folders = {
    # (folder_path, property, account, date)
    "1 - CHISHOLM (WATERFORD)/3 - REFINANCE/1 - BANKWEST/Chisholm - 13605113":
        ("Chisholm", "13605113", "2024.11"),
    "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/2 - FINANCE/Heddon Greta - 13605122":
        ("Heddon Greta", "13605122", "2024.10"),
    "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/2 - FINANCE/Bannerman - 13605125":
        ("Bannerman", "13605125", "2024.11"),
    "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/2 - FINANCE/Bannerman - 13634421":
        ("Bannerman", "13634421", "2024.11"),
}

for folder_rel, (prop, acct, date) in bankwest_folders.items():
    folder_abs = os.path.join(BASE, folder_rel)
    if not os.path.isdir(folder_abs):
        continue
    for fn in sorted(os.listdir(folder_abs)):
        if fn.startswith('.'):
            continue
        old = os.path.join(folder_abs, fn)
        if not os.path.isfile(old):
            continue
        ext = os.path.splitext(fn)[1]
        desc = clean_desc(fn)
        new_name = f"{date} - {prop} - Bankwest - {desc} ({acct}){ext}"
        new = os.path.join(folder_abs, new_name)
        if old != new:
            renames.append((old, new))

# ============================================================
# 2. MACQUARIE LOAN DOCS - Old Bar
# ============================================================

# PIA-22964 folder (Macquarie application ~2022)
mac_oldbar_folders = {
    "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/2 - FINANCE/1 - MACQUARIE/1 - APPLICATION PREP/2 - APPLICATION SUBMISSION/PIA-22964":
        ("Old Bar", "Macquarie", "2022"),
    "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/2 - FINANCE/1 - MACQUARIE/1 - APPLICATION PREP/2 - APPLICATION SUBMISSION/PIA-23273":
        ("Old Bar", "Macquarie", "2023"),
}

for folder_rel, (prop, creator, date) in mac_oldbar_folders.items():
    folder_abs = os.path.join(BASE, folder_rel)
    if not os.path.isdir(folder_abs):
        continue
    for fn in sorted(os.listdir(folder_abs)):
        if fn.startswith('.'):
            continue
        old = os.path.join(folder_abs, fn)
        if not os.path.isfile(old):
            continue
        ext = os.path.splitext(fn)[1]
        desc = clean_desc(fn)
        new_name = f"{date} - {prop} - {creator} - {desc}{ext}"
        new = os.path.join(folder_abs, new_name)
        if old != new:
            renames.append((old, new))

# Macquarie loan offer folder for Old Bar
mac_offer_folder = "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/2 - FINANCE/1 - MACQUARIE/1 - APPLICATION PREP/4 - LOAN DOCS/Loan_Offer__APP-2427727_Schniggle_Co_Pty_Ltd_ 2"
mac_offer_abs = os.path.join(BASE, mac_offer_folder)
if os.path.isdir(mac_offer_abs):
    for fn in sorted(os.listdir(mac_offer_abs)):
        if fn.startswith('.'):
            continue
        old = os.path.join(mac_offer_abs, fn)
        if not os.path.isfile(old):
            continue
        ext = os.path.splitext(fn)[1]
        desc = clean_desc(fn)
        new_name = f"2022 - Old Bar - Macquarie - {desc}{ext}"
        new = os.path.join(mac_offer_abs, new_name)
        if old != new:
            renames.append((old, new))

# Other Old Bar Macquarie loan docs
mac_loandocs = "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/2 - FINANCE/1 - MACQUARIE/1 - APPLICATION PREP/4 - LOAN DOCS"
mac_loandocs_abs = os.path.join(BASE, mac_loandocs)
if os.path.isdir(mac_loandocs_abs):
    specific_renames = {
        "1Statutory Declaration - Pellas completed by Jeff.pdf":
            "2022 - Old Bar - Macquarie - Statutory Declaration (Jeff).pdf",
        "Statutory Declaration - Pellas completed by Jeff.pdf":
            "2022 - Old Bar - Macquarie - Statutory Declaration (Jeff) copy.pdf",
        "EnvelopePDF.aspx.pdf":
            "2022 - Old Bar - Macquarie - Envelope Document.pdf",
    }
    for old_fn, new_fn in specific_renames.items():
        old = os.path.join(mac_loandocs_abs, old_fn)
        if os.path.isfile(old):
            renames.append((old, os.path.join(mac_loandocs_abs, new_fn)))

# Old Bar solicitor docs
oldbar_solicitor = "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE"
oldbar_sol_abs = os.path.join(BASE, oldbar_solicitor)
if os.path.isdir(oldbar_sol_abs):
    specific = {
        "15.2.2022 - JHM - Client Services Agreement.pdf":
            "2022.02.15 - Old Bar - JMH - Client Services Agreement.pdf",
        "7.2.2022 - Emerald Fields - JMH - Engagement Letter .pdf":
            "2022.02.07 - Old Bar - JMH - Engagement Letter.pdf",
        "Client Service Agreement - CSA.pdf":
            "2022 - Old Bar - JMH - Client Service Agreement.pdf",
    }
    for old_fn, new_fn in specific.items():
        old = os.path.join(oldbar_sol_abs, old_fn)
        if os.path.isfile(old):
            renames.append((old, os.path.join(oldbar_sol_abs, new_fn)))

# Old Bar contracts
oldbar_contracts = "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/1 - CAIFU_NCL/1 - CONTRACTS"
oldbar_con_abs = os.path.join(BASE, oldbar_contracts)
if os.path.isdir(oldbar_con_abs):
    specific = {
        "DOC140222-14022022143818.pdf":
            "2022.02.14 - Old Bar - Build Contract Scan.pdf",
        "N56NEWR~-1 (VARIATION - VO.2 - Lot 56 Emerald Fields - Pellas) 20230123092312988v02.pdf":
            "2023.01.23 - Old Bar - Contract Variation VO2 (Lot 56).pdf",
    }
    for old_fn, new_fn in specific.items():
        old = os.path.join(oldbar_con_abs, old_fn)
        if os.path.isfile(old):
            renames.append((old, os.path.join(oldbar_con_abs, new_fn)))

# ============================================================
# 3. BANNERMAN MISC
# ============================================================

bannerman_base = "3 - SOUTHWEST ROCKS (BANNERMAN)"

# Old loan docs
specific_bannerman = {
    f"{bannerman_base}/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/Macquarie ELodge Form - Knight-Pellas.pdf":
        f"{bannerman_base}/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/2021 - Bannerman - Macquarie - ELodge Form.pdf",
    f"{bannerman_base}/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - NAB/Settlement Letter Lender ID 17290885 K Knight Pellas.pdf":
        f"{bannerman_base}/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - NAB/2021 - Bannerman - NAB - Settlement Letter (17290885).pdf",
    f"{bannerman_base}/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/HANDOVER COMPLETED Lot 23 Bannerman PlaceSOUTH WEST ROCKS NSW 2431.pdf":
        f"{bannerman_base}/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/2022 - Bannerman - NCL - Handover Completed (Lot 23).pdf",
    f"{bannerman_base}/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/ReHouse Land Projects.pdf":
        f"{bannerman_base}/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/2022 - Bannerman - ReHouse - Land Projects.pdf",
    f"{bannerman_base}/Deposit - Lot 2 Bannerman.pdf":
        f"{bannerman_base}/2021 - Bannerman - Deposit Receipt (Lot 2).pdf",
}

for old_rel, new_rel in specific_bannerman.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# 4. CHISHOLM MISC
# ============================================================

chisholm_specific = {
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/4 - INSURANCE/1 - POLICIES/Updated Certificate of Currency - Pellas.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/4 - INSURANCE/1 - POLICIES/2020 - Chisholm - Insurance - Certificate of Currency.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/5 - HANDOVER/3 - CERTIFICATES/Chisholm - NCL - Flick Warranty Docs.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/5 - HANDOVER/3 - CERTIFICATES/2020 - Chisholm - NCL - Flick Warranty Docs.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/5 - HANDOVER/3 - CERTIFICATES/Chisholm - NCL - Flickguard Warranty Conditions.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/5 - HANDOVER/3 - CERTIFICATES/2020 - Chisholm - NCL - Flickguard Warranty Conditions.pdf",
    "1 - CHISHOLM (WATERFORD)/2 - LEASING/1 - AGREEMENTS/ac8d00f8-31fc-4d2a-9c24-4945ed5f5149.pdf":
        "1 - CHISHOLM (WATERFORD)/2 - LEASING/1 - AGREEMENTS/2021 - Chisholm - Lease Agreement.pdf",
    "1 - CHISHOLM (WATERFORD)/2 - LEASING/3 - MAINTENANCE/My Four Sons Cleaning Maintenance - Long lawn whipper snip lawn rake an bag excess grass.pdf":
        "1 - CHISHOLM (WATERFORD)/2 - LEASING/3 - MAINTENANCE/2021 - Chisholm - My Four Sons - Lawn Maintenance.pdf",
    "1 - CHISHOLM (WATERFORD)/4 - VALUATIONS - ON GOING/26.3.2021 - CHISHOLM - VALUATION - 670K.pdf":
        "1 - CHISHOLM (WATERFORD)/4 - VALUATIONS - ON GOING/2021.03.26 - Chisholm - Valuation ($670K).pdf",
}

# Beyond Bank supporting docs (only the key finance ones, not all the tax returns)
chisholm_beyond = "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/1 - BEYOND (PURCHASE)/1 - APPLICATION PREP/1 - SUPPORTING DOCS"
beyond_renames = {
    "Contract and Loan Terms.pdf": "2020 - Chisholm - Beyond Bank - Contract and Loan Terms.pdf",
    "Disclosure statement.pdf": "2020 - Chisholm - Beyond Bank - Disclosure Statement.pdf",
    "Guarantor letter.pdf": "2020 - Chisholm - Beyond Bank - Guarantor Letter.pdf",
    "LMI calculations.png": "2020 - Chisholm - Beyond Bank - LMI Calculations.png",
    "Offer package Kelly.pdf": "2020 - Chisholm - Beyond Bank - Offer Package (Kelly).pdf",
    "Offer package.pdf": "2020 - Chisholm - Beyond Bank - Offer Package.pdf",
    "loanexperthub.com.au Mail - Beyond Bank Australia - Valuation Received_ Mrs Kelly Knight-Pellas _ 7505695.pdf":
        "2020 - Chisholm - Beyond Bank - Valuation Received Email.pdf",
    "Waterford County H&L - Property Report (2).pdf": "2020 - Chisholm - Property Report (Waterford County HL).pdf",
}

for old_fn, new_fn in beyond_renames.items():
    old = os.path.join(BASE, chisholm_beyond, old_fn)
    if os.path.isfile(old):
        renames.append((old, os.path.join(BASE, chisholm_beyond, new_fn)))

for old_rel, new_rel in chisholm_specific.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# 5. HEDDON GRETA - Convert DD.MM.YYYY → YYYY.MM.DD and Avery → Heddon Greta
# ============================================================

hg_solicitor = "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/3 - SOLICITOR"
hg_solicitor_renames = {
    "1 - RECEIPTS/15.10.2020 - Avery - Stamp Duty Receipt 137419 ($5000).pdf":
        "1 - RECEIPTS/2020.10.15 - Heddon Greta - Stamp Duty Receipt 137419 ($5,000).pdf",
    "1 - RECEIPTS/16.10.2020 - Avery - Stamp Duty Receipt 137442 ($280).pdf":
        "1 - RECEIPTS/2020.10.16 - Heddon Greta - Stamp Duty Receipt 137442 ($280).pdf",
    "2 - CORRESPONDANCE/13.10.2020 - Avery - Stamp Duty ($5,280).pdf":
        "2 - CORRESPONDANCE/2020.10.13 - Heddon Greta - Stamp Duty ($5,280).pdf",
    "2 - CORRESPONDANCE/14.10.2021 - Stage 2A - Avery - Confirmation of Registration.pdf":
        "2 - CORRESPONDANCE/2021.10.14 - Heddon Greta - Confirmation of Registration (Stage 2A).pdf",
    "2 - CORRESPONDANCE/25.11.2021 - Avery - Macquarie - Funds to Complete.pdf":
        "2 - CORRESPONDANCE/2021.11.25 - Heddon Greta - Macquarie - Funds to Complete.pdf",
    "2 - CORRESPONDANCE/29.11.2021 - Avery - Macquarie - Shortfall ($1587).pdf":
        "2 - CORRESPONDANCE/2021.11.29 - Heddon Greta - Macquarie - Shortfall ($1,587).pdf",
    "2 - CORRESPONDANCE/9.07.2020 - Avery - JMH -  Client Services Agreement .pdf":
        "2 - CORRESPONDANCE/2020.07.09 - Heddon Greta - JMH - Client Services Agreement.pdf",
}

for old_rel, new_rel in hg_solicitor_renames.items():
    old = os.path.join(BASE, hg_solicitor, old_rel)
    new = os.path.join(BASE, hg_solicitor, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# Heddon Greta other
hg_other = {
    "2 - HEDDON GRETA (AVERY)/2 - ONGOING/2 - INCOME STATEMENTS/OWN00924 - Financial Summary 4 Jul 2023.pdf":
        "2 - HEDDON GRETA (AVERY)/2 - ONGOING/2 - INCOME STATEMENTS/2023.07.04 - Heddon Greta - Financial Summary (OWN00924).pdf",
    "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/2 - CORRESPONDANCE/29.11.2021 - Kelston Capital - Returning Docs Correspondance.pdf":
        "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/2 - CORRESPONDANCE/2021.11.29 - Heddon Greta - Kelston Capital - Returning Docs.pdf",
    "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/1 - APPLICATION PREP/3 - APPROVALS/24.11.2021 - Avery - Macquarie - Unconditional Approval.pdf":
        "2 - HEDDON GRETA (AVERY)/1 - PURCHASE/2 - FINANCE/OLD LOANS/1 - MACQUARIE/1 - APPLICATION PREP/3 - APPROVALS/2021.11.24 - Heddon Greta - Macquarie - Unconditional Approval.pdf",
}

for old_rel, new_rel in hg_other.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# 6. 2024 REFINANCE FOLDER
# ============================================================

refi_base = "2024 Refinance"

refi_specific = {
    f"{refi_base}/Bankwest Application Pack - Pellas - signed.pdf":
        f"{refi_base}/2024.10 - All Properties - Bankwest - Application Pack (signed).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/ Chisholm - full statement - 3296.pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Chisholm - Macquarie - Full Statement (3296).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/Bannerman - full statement - 8590.pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Bannerman - Macquarie - Full Statement (8590).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/Bannerman full statement - 5557.pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Bannerman - Macquarie - Full Statement (5557).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/Chisholm Full statement 3338 .pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Chisholm - Macquarie - Full Statement (3338).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/Chisholm full statement 5168.pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Chisholm - Macquarie - Full Statement (5168).pdf",
    f"{refi_base}/Loan Docs/Macquarie Full loan statements/Heddon Greta - Full statement - 3288.pdf":
        f"{refi_base}/Loan Docs/Macquarie Full loan statements/2024 - Heddon Greta - Macquarie - Full Statement (3288).pdf",
    f"{refi_base}/Loan Docs/Updated mac/old bar todate.pdf":
        f"{refi_base}/Loan Docs/Updated mac/2024 - Old Bar - Macquarie - Statement to Date.pdf",
    f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/3131672974904.pdf":
        f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/2024 - Bannerman - Macquarie - Statement (3131672974904).pdf",
    f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/3131672976926.pdf":
        f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/2024 - Bannerman - Macquarie - Statement (3131672976926).pdf",
    f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/get_payslip (3).pdf":
        f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/2024 - Supporting - Payslip 3.pdf",
    f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/get_payslip (4).pdf":
        f"{refi_base}/Loan Docs/Updated mac/Bannerman cashout/2024 - Supporting - Payslip 4.pdf",
}

refi_prep = {
    "3_Bannerman_Pl,_South_West_Rocks_NSW_2431_owner.pdf":
        "2024 - Bannerman - Property Owner Report.pdf",
    "682222053921361.pdf":
        "2024 - Supporting - Document (682222053921361).pdf",
    "Bannerman Aug.pdf":
        "2024.08 - Bannerman - Rental Statement (Aug).pdf",
    "Bannerman July .pdf":
        "2024.07 - Bannerman - Rental Statement (Jul).pdf",
    "FLK-lease-signed-Sep-2024-LLIS (1).pdf":
        "2024.09 - Lennox - Lease Agreement (signed) copy.pdf",
    "FLK-lease-signed-Sep-2024-LLIS.pdf":
        "2024.09 - Lennox - Lease Agreement (signed).pdf",
    "Goldring Aug .pdf":
        "2024.08 - Chisholm - Rental Statement (Aug).pdf",
    "Goldring Sep.pdf":
        "2024.09 - Chisholm - Rental Statement (Sep).pdf",
    "GoldringRENEWAL - 19.10.23 - 30.10.24 - 19 Goldring St.pdf":
        "2023.10.19 - Chisholm - Lease Renewal (19 Goldring St).pdf",
    "Kellys 2023 NOA.pdf":
        "2023 - Kelly - ATO - Notice of Assessment.pdf",
    "Kellys 2024 Income statement.pdf":
        "2024 - Kelly - ATO - Income Statement.pdf",
    "Kellys Income Statement 2024-2025.pdf":
        "2024 - Kelly - ATO - Income Statement 2024-2025.pdf",
    "Marks 2023 NOA.pdf":
        "2023 - Mark - ATO - Notice of Assessment.pdf",
    "Quintero - Aug.pdf":
        "2024.08 - Heddon Greta - Rental Statement (Aug).pdf",
    "Quintero - Sep.pdf":
        "2024.09 - Heddon Greta - Rental Statement (Sep).pdf",
    "Quintero -[FM00401] RTA New -Jul21 - Kylie Gregory & rebekah Gregory & Nathan Gregory (TEN01241).pdf":
        "2021.07 - Heddon Greta - RTA - New Tenancy (Gregory).pdf",
    "Residential Rental Agreement [2024-07-20] 50B The Corso  Parkdale VIC 3195.pdf":
        "2024.07.20 - Personal - Rental Agreement (50B The Corso Parkdale).pdf",
    "superhero-Portfolio Valuation Report (AUS)-kelly-knight-pellas-1727316237.pdf":
        "2024.09 - Kelly - Superhero - Portfolio Valuation.pdf",
    "superhero-Portfolio Valuation Report (AUS)-m2k2-investment-trust-1727316161.pdf":
        "2024.09 - M2K2 Trust - Superhero - Portfolio Valuation.pdf",
}

for old_rel, new_rel in refi_specific.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

refi_prep_dir = os.path.join(BASE, refi_base, "Loan Prep 2024")
for old_fn, new_fn in refi_prep.items():
    old = os.path.join(refi_prep_dir, old_fn)
    if os.path.isfile(old):
        renames.append((old, os.path.join(refi_prep_dir, new_fn)))

# Bankwest interim statements
bw_interim = {
    f"{refi_base}/Other/Interim statements from BW/Bankwest_Loans_open_to_08_04_2025.csv":
        f"{refi_base}/Other/Interim statements from BW/2025.04.08 - All Properties - Bankwest - Loans Open Balance.csv",
    f"{refi_base}/Other/Interim statements from BW/Transactions_08_04_2025.xls":
        f"{refi_base}/Other/Interim statements from BW/2025.04.08 - All Properties - Bankwest - Transactions.xls",
}

for old_rel, new_rel in bw_interim.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# 7. LENNOX
# ============================================================

lennox = {
    "5 - LENNOX HEADS/ENTITY/Trust with Trustee Company.pdf":
        "5 - LENNOX HEADS/ENTITY/2024 - Lennox - Trust with Trustee Company.pdf",
}

for old_rel, new_rel in lennox.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# 8. CHISHOLM - Convert DD.MM.YYYY Avery/CBA files
# ============================================================

chisholm_dead_apps = {
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/25.11.2021 - Avery - CBA - Funds to Complete.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/2021.11.25 - Chisholm - CBA - Funds to Complete.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/9.11.2021 - Avery - CBA - Pexa invite.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/2021.11.09 - Chisholm - CBA - Pexa Invite.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/EMAILATTACHMENT.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/2021 - Chisholm - CBA - Email Attachment.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/Knight Pellas - CBA APP TO SIGN.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/2021 - Chisholm - CBA - Application to Sign.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/Knight Pellas - CBA NCCP TO SIGN.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/2021 - Chisholm - CBA - NCCP to Sign.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/Kosh Sothilingam  - Credit Guide and Privacy Statement v01032021.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/2021.03.01 - Chisholm - CBA - Credit Guide and Privacy Statement.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/cba docs.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/1 - CBA APPLICATION/2021 - Chisholm - CBA - Loan Documents.pdf",
    "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/Z - ANDREW/20210430 Pellas & Knight Pellas BOM Land&Const $447.1k - SC.pdf":
        "1 - CHISHOLM (WATERFORD)/1 - PURCHASE/2 - FINANCE/Z - DEAD APPS/Z - ANDREW/2021.04.30 - Chisholm - BOM - Land and Construct ($447K).pdf",
    "1 - CHISHOLM (WATERFORD)/3 - REFINANCE/OLD LOANS/1 - NAB ($516k)/1 - 2021.09.13 - NAB Refi - Chisholm - notes.pdf":
        "1 - CHISHOLM (WATERFORD)/3 - REFINANCE/OLD LOANS/1 - NAB ($516k)/2021.09.13 - Chisholm - NAB - Refinance Notes.pdf",
}

for old_rel, new_rel in chisholm_dead_apps.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# Bannerman solicitor (DD.MM.YYYY → YYYY.MM.DD already correct format, just property name)
bannerman_solicitor = {
    "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/22.6.2022 - Bannerman - JMH - Final Funds Notice.pdf":
        "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/2022.06.22 - Bannerman - JMH - Final Funds Notice.pdf",
    "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/22.6.2022 - Bannerman - JMH - Final Funds.pdf":
        "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/2022.06.22 - Bannerman - JMH - Final Funds.pdf",
    "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/22.6.2022 - Bannerman - JMH - Settlement Confirmation.pdf":
        "3 - SOUTHWEST ROCKS (BANNERMAN)/1 - PURCHASE/3 - SOLICITOR/2 - CORRESPONDANCE/2022.06.22 - Bannerman - JMH - Settlement Confirmation.pdf",
}

for old_rel, new_rel in bannerman_solicitor.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# Old Bar correspondence
oldbar_corr = {
    "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/1.2.2022 - Emerald Fields - Property Report Update.pdf":
        "4 - OLD BAR (EMERALD FIELDS)/1 - PURCHASE/1 - CAIFU_NCL/2 - CORRESPONDANCE/2022.02.01 - Old Bar - Property Report Update.pdf",
}

for old_rel, new_rel in oldbar_corr.items():
    old = os.path.join(BASE, old_rel)
    new = os.path.join(BASE, new_rel)
    if os.path.isfile(old):
        renames.append((old, new))

# ============================================================
# EXECUTE
# ============================================================

# Check for conflicts
new_paths = [n for _, n in renames]
dupes = [p for p in new_paths if new_paths.count(p) > 1]
if dupes:
    print("DUPLICATE TARGET NAMES FOUND:")
    for d in set(dupes):
        print(f"  {d}")
    print("\nAborting.")
    exit(1)

print(f"=== {len(renames)} files to rename ===\n")

for old, new in renames:
    old_fn = os.path.basename(old)
    new_fn = os.path.basename(new)
    # Show relative path for context
    folder = os.path.dirname(old).replace(BASE + "/", "")
    print(f"  [{folder}]")
    print(f"    {old_fn}")
    print(f"    → {new_fn}\n")

if "--dry-run" in __import__('sys').argv:
    print("(dry run — no files changed)")
else:
    success = 0
    errors = 0
    for old, new in renames:
        try:
            os.rename(old, new)
            success += 1
        except Exception as e:
            print(f"  ERROR renaming {os.path.basename(old)}: {e}")
            errors += 1
    print(f"\nDone. {success}/{len(renames)} renamed, {errors} errors.")
