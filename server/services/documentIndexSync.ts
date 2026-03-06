import { buildDocumentIndex, type IndexedDocument } from './documentIndex.js';
import {
  upsertDocument, addDocumentLink, getAllDocuments,
  getAllTemplates, getDocumentsByProperty, getLinkedDocuments,
  type DbDocument, type DbTemplate,
} from '../db.js';
import db from '../db.js';

/**
 * Ingest files from the PROPERTIES folder scanner into the global document_index table.
 * This is ONE ingestion source — chat pins, uploads, and email refs are others.
 */
export function syncFileIndex(propertiesPath: string): { added: number; updated: number; removed: number; total: number } {
  const fileIndex = buildDocumentIndex(propertiesPath);
  let added = 0;
  let updated = 0;
  let removed = 0;

  // Build set of current file IDs for ghost detection
  const currentIds = new Set(fileIndex.map(d => d.id));

  const insertOrUpdate = db.transaction(() => {
    for (const doc of fileIndex) {
      const existing = db.prepare('SELECT id FROM document_index WHERE id = ?').get(doc.id) as { id: string } | undefined;

      upsertDocument({
        id: doc.id,
        canonical_name: buildCanonicalName(doc),
        category: mapCategory(doc.category, doc.subcategory),
        provider: extractProvider(doc),
        doc_date: doc.dateFromFilename,
        source_type: deriveSourceType(doc),
        source_ref: doc.relativePath,
        file_path: doc.relativePath,
        property_id: doc.propertyId,
        file_created_at: doc.fileCreated,
        added_via: 'existing',
        metadata: {
          extension: doc.extension,
          sizeBytes: doc.sizeBytes,
          lastModified: doc.lastModified,
          accountNumbers: doc.accountNumbers,
          originalFilename: doc.filename,
          subcategory: doc.subcategory,
        },
      });

      // Auto-link to property
      if (doc.propertyId) {
        addDocumentLink(doc.id, 'property', doc.propertyId);
      }

      // Auto-link to loans via account numbers
      for (const acct of doc.accountNumbers) {
        addDocumentLink(doc.id, 'account', acct);
      }

      if (existing) updated++;
      else added++;
    }

    // Remove ghost entries: file-sourced docs whose files no longer exist
    const allFileDocs = db.prepare(
      "SELECT id FROM document_index WHERE file_path IS NOT NULL AND source_type != 'email' AND source_type != 'upload' AND source_type != 'note'"
    ).all() as { id: string }[];
    for (const row of allFileDocs) {
      if (!currentIds.has(row.id)) {
        db.prepare('DELETE FROM document_index WHERE id = ?').run(row.id);
        db.prepare('DELETE FROM document_links WHERE document_id = ?').run(row.id);
        removed++;
      }
    }
  });

  insertOrUpdate();

  // After sync, populate security/purpose mappings
  populatePropertyMappings();

  return { added, updated, removed, total: fileIndex.length };
}

// ── Bankwest account number → loan mapping ──
// Account number (short code from filename) → { security: propertyId, purpose: purposePropertyId }
interface LoanMapping { security: string; purpose: string; }

function buildLoanMappings(): Map<string, LoanMapping> {
  const map = new Map<string, LoanMapping>();
  const loans = db.prepare('SELECT id, property_id, data FROM loans').all() as
    { id: string; property_id: string; data: string }[];

  for (const loan of loans) {
    try {
      const d = JSON.parse(loan.data);
      const acct = d.accountNumber as string;
      if (!acct || acct === '—') continue;

      const security = loan.property_id;
      const purpose = (d.purposePropertyId as string) || security;

      // Store by short code (last 4 digits) and full number
      map.set(acct, { security, purpose });
      if (acct.length > 4) {
        const short = acct.slice(-4);
        // Only set short code if not already claimed by another loan
        if (!map.has(short)) map.set(short, { security, purpose });
      }
    } catch { /* skip */ }
  }
  return map;
}

// Macquarie account name patterns → property (same as scraperRunner)
const MACQUARIE_PROPERTY_MAP: Record<string, string | null> = {
  'main spending':    null,
  'rental expenses':  null,
  'second savings':   null,
  'schniggle':        'old-bar',
  'driftwood':        'old-bar',
  'bannerman':        'bannerman',
};

/**
 * Populate property_id (security) and purpose_property_id for all documents.
 * Uses file path, account numbers in filenames, and loan mappings.
 */
export function populatePropertyMappings(): { updated: number } {
  const loanMap = buildLoanMappings();
  let updated = 0;

  // Folder prefix → property_id (security)
  const folderMap: Record<string, string> = {
    '1 - chisholm': 'chisholm',
    '2 - heddon greta': 'heddon-greta',
    '3 - southwest rocks': 'bannerman',
    '4 - old bar': 'old-bar',
    '5 - lennox heads': 'lennox',
  };

  const docs = db.prepare('SELECT id, file_path, property_id, purpose_property_id, provider, canonical_name FROM document_index').all() as
    { id: string; file_path: string | null; property_id: string | null; purpose_property_id: string | null; provider: string | null; canonical_name: string }[];

  const update = db.prepare('UPDATE document_index SET property_id = ?, purpose_property_id = ? WHERE id = ?');

  const batchUpdate = db.transaction(() => {
    for (const doc of docs) {
      const fp = doc.file_path || '';
      const fpLower = fp.toLowerCase();
      const filename = fp.split('/').pop() || '';

      let security = doc.property_id || null;
      let purpose = doc.purpose_property_id || null;

      // ── Step 1: Derive security (property_id) from file path ──
      if (!security) {
        // Check property folder prefix
        for (const [prefix, propId] of Object.entries(folderMap)) {
          if (fpLower.startsWith(prefix)) {
            security = propId;
            break;
          }
        }
      }

      // Extract account number from filename for Bankwest statements
      // Formats: "Loan Statement (5599)" or "bankwest_HeddonGreta-5573_..."
      let acctMatch: string | null = null;
      const parenMatch = filename.match(/\((\d{4})\)/);
      if (parenMatch) acctMatch = parenMatch[1];
      if (!acctMatch) {
        const bwMatch = filename.match(/bankwest_\w+-(\d{4})_/);
        if (bwMatch) acctMatch = bwMatch[1];
      }

      if (!security && acctMatch && loanMap.has(acctMatch)) {
        security = loanMap.get(acctMatch)!.security;
      }

      // Macquarie statements: extract account name from "Macquarie - Account Name - type"
      if (!security && (doc.provider === 'Macquarie' || fpLower.includes('macquarie'))) {
        const macMatch = filename.match(/Macquarie - (.+?) -/i);
        if (macMatch) {
          const acctName = macMatch[1].toLowerCase();
          for (const [pattern, propId] of Object.entries(MACQUARIE_PROPERTY_MAP)) {
            if (acctName.includes(pattern)) {
              if (propId) security = propId;
              break;
            }
          }
        }
      }

      // Bank Australia → no specific property (entity-level: M2K2)
      // Leave security null for entity-level statements

      // ── Step 2: Derive purpose_property_id ──
      if (acctMatch && loanMap.has(acctMatch)) {
        // Loan statement → purpose from loan mapping
        purpose = loanMap.get(acctMatch)!.purpose;
      } else if (security && !purpose) {
        // Non-loan docs (leasing, purchase, insurance) → purpose = security
        purpose = security;
      }

      // Macquarie purpose: same logic
      if (!purpose && (doc.provider === 'Macquarie' || fpLower.includes('macquarie'))) {
        const macMatch = filename.match(/Macquarie - (.+?) -/i);
        if (macMatch) {
          const acctName = macMatch[1].toLowerCase();
          // Check if this matches a loan account for purpose
          for (const [acct, mapping] of loanMap.entries()) {
            if (acctName.includes(acct.toLowerCase())) {
              purpose = mapping.purpose;
              break;
            }
          }
          // Fallback to property name matching
          if (!purpose) {
            for (const [pattern, propId] of Object.entries(MACQUARIE_PROPERTY_MAP)) {
              if (acctName.includes(pattern) && propId) {
                purpose = propId;
                break;
              }
            }
          }
        }
      }

      // Only update if something changed
      if (security !== doc.property_id || purpose !== doc.purpose_property_id) {
        update.run(security, purpose, doc.id);
        updated++;
      }
    }
  });

  batchUpdate();
  return { updated };
}

/**
 * Gap analysis: compare templates against the document index for a specific property/event.
 * Returns which template requirements are met and which are missing.
 */
export interface GapResult {
  template: DbTemplate;
  matched: DbDocument[];
  missing: boolean;
}

export function analyzeGaps(
  propertyId: string,
  eventType: string,
  context?: { lenderFrom?: string; lenderTo?: string; loanId?: string; isHL?: boolean; purchaseLenders?: string[]; accountNumbers?: string[]; dateFrom?: string; dateTo?: string }
): GapResult[] {
  const templates = getAllTemplates().filter(t => t.event_type === eventType);
  const propDocs = getDocumentsByProperty(propertyId);
  const results: GapResult[] = [];

  for (const tmpl of templates) {
    // Skip H&L-only templates if not H&L
    if (tmpl.applies_to === 'h_and_l' && context?.isHL === false) continue;

    const hints = JSON.parse(tmpl.match_hints || '{}') as {
      keywords?: string[];
      folder?: string[];
      exclude?: string[];
      provider?: string;
    };

    const matched = propDocs.filter(doc => matchesTemplate(doc, tmpl, hints, context));

    // Also check linked documents (from other properties secured against this one)
    if (context?.loanId) {
      const loanDocs = getLinkedDocuments('account', context.loanId);
      for (const ld of loanDocs) {
        if (!matched.some(m => m.id === ld.id) && matchesTemplate(ld, tmpl, hints, context)) {
          matched.push(ld);
        }
      }
    }

    results.push({
      template: tmpl,
      matched,
      missing: matched.length === 0,
    });
  }

  return results;
}

/**
 * Check if a document matches a template based on hints and context.
 */
function matchesTemplate(
  doc: DbDocument,
  tmpl: DbTemplate,
  hints: { keywords?: string[]; folder?: string[]; exclude?: string[]; provider?: string },
  context?: { lenderFrom?: string; lenderTo?: string; purchaseLenders?: string[]; accountNumbers?: string[]; dateFrom?: string; dateTo?: string }
): boolean {
  const name = doc.canonical_name.toLowerCase();
  const ref = (doc.source_ref || '').toLowerCase();
  const filePath = (doc.file_path || '').toLowerCase();
  const searchText = `${name} ${ref} ${filePath}`;
  const docProvider = (doc.provider || '').toLowerCase();
  const docMeta = doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : {};
  const docAccountNumbers: string[] = docMeta.accountNumbers || [];

  // Category must match
  if (doc.category !== tmpl.category) return false;

  // Check exclude words
  if (hints.exclude?.some(ex => searchText.includes(ex.toLowerCase()))) return false;

  // Check keywords (at least one must match)
  if (hints.keywords && hints.keywords.length > 0) {
    const hasKeyword = hints.keywords.some(kw => searchText.includes(kw.toLowerCase()));
    if (!hasKeyword) return false;
  }

  // Check folder scope
  if (hints.folder && hints.folder.length > 0) {
    const inFolder = hints.folder.some(f => filePath.includes(f.toLowerCase()));
    if (!inFolder && doc.source_type === 'file') return false; // only enforce folder for files
  }

  // ── Loan-specific context matching ──
  // For finance events (purchase_finance, refinance), use loan context to narrow matches.
  // Account numbers are the strongest signal — if the doc or the event has them, use them.
  const isFinanceEvent = tmpl.event_type === 'purchase_finance' || tmpl.event_type === 'refinance';

  if (isFinanceEvent && context?.accountNumbers && context.accountNumbers.length > 0) {
    // Strong match: doc contains one of the event's account numbers
    const hasAccountMatch = context.accountNumbers.some(acct => {
      const acctLower = acct.toLowerCase();
      return searchText.includes(acctLower) || docAccountNumbers.some(da => da.includes(acct) || acct.includes(da));
    });
    // If the doc has its own account numbers, require overlap with event accounts
    if (docAccountNumbers.length > 0 && !hasAccountMatch) return false;
  }

  // For purchase_finance: require doc matches one of the original purchase lenders
  if (tmpl.event_type === 'purchase_finance' && context?.purchaseLenders && context.purchaseLenders.length > 0) {
    const lendersLower = context.purchaseLenders.map(l => l.toLowerCase());
    const matchesLender = lendersLower.some(l => searchText.includes(l) || docProvider.includes(l));
    if (!matchesLender) return false;
  }

  // For refinance: require doc matches new lender (for loan docs) or old lender (for discharge)
  if (context?.lenderTo && tmpl.event_type === 'refinance') {
    const lenderLower = context.lenderTo.toLowerCase();
    if (tmpl.id === 'refinance-new-loan-docs' && !searchText.includes(lenderLower)) return false;
  }
  if (context?.lenderFrom && tmpl.id === 'refinance-discharge') {
    const lenderLower = context.lenderFrom.toLowerCase();
    if (!searchText.includes(lenderLower)) return false;
  }

  // Date proximity: if the event has a date range and the doc has a date, check rough relevance
  if (isFinanceEvent && doc.doc_date && context?.dateFrom) {
    const docYear = new Date(doc.doc_date).getFullYear();
    const eventYear = new Date(context.dateFrom).getFullYear();
    const endYear = context.dateTo ? new Date(context.dateTo).getFullYear() : eventYear + 2;
    // Allow docs from 1 year before event start to 1 year after event end
    if (docYear < eventYear - 1 || docYear > endYear + 1) return false;
  }

  return true;
}

// ── Helpers ──

function buildCanonicalName(doc: IndexedDocument): string {
  // Strip extension and common prefixes/timestamps
  let name = doc.filename.replace(/\.[^.]+$/, '');
  // If filename follows the date pattern, that's already canonical
  return name;
}

function mapCategory(category: string, subcategory: string | null): string {
  const map: Record<string, string> = {
    purchase: 'settlement',
    contracts: 'settlement',
    finance: 'loan',
    finance_beyond: 'loan',
    finance_macquarie: 'loan',
    finance_bankwest: 'loan',
    loan_docs: 'loan',
    loan_prep: 'loan',
    old_loans: 'loan',
    solicitor: 'settlement',
    settlement: 'settlement',
    insurance: 'insurance',
    handover: 'other',
    depreciation: 'tax',
    leasing: 'lease',
    agreements: 'lease',
    income_statements: 'management',
    maintenance: 'other',
    expenses: 'rates',
    reports: 'other',
    refinance: 'loan',
    valuations: 'valuation',
    statements: 'loan',
    correspondence: 'correspondence',
    data: 'other',
    general: 'other',
  };
  return map[subcategory || ''] || map[category] || 'other';
}

function deriveSourceType(doc: IndexedDocument): string {
  const cat = doc.category;
  const sub = doc.subcategory || '';
  const name = doc.filename.toLowerCase();
  const pathLower = doc.relativePath.toLowerCase();

  // ── 1. Highest-priority filename matches (most specific first) ──

  // Tax/ATO docs — must check BEFORE generic "statement"/"return" patterns
  if (name.includes('depreciation') || name.includes('capital allowance')) return 'depreciation_schedule';
  if (name.includes('notice of assessment') || /\bnoa\b/.test(name)) return 'notice_of_assessment';
  if (name.includes('bas') || name.includes('business activity')) return 'bas';
  if (/returns?[\s_]/i.test(name + ' ') && (name.includes('m2k2') || name.includes('trust') || name.includes('personal') || name.includes('redacted') || name.includes('tax'))) return 'tax_return';
  // ATO income statements (Kelly/Mark) — NOT rental income statements
  if (name.includes('income statement') && (name.includes('ato') || name.includes('kelly') || name.includes('mark'))) return 'notice_of_assessment';

  // Rental/PM income statements — "rental statement" or "spg" income statements
  if (name.includes('rental statement') || name.includes('rental income')) return 'rental_statement';
  if (name.includes('income statement') && (name.includes('spg') || pathLower.includes('income statement'))) return 'rental_statement';

  // Construction certificates and inspections
  if (name.includes('certificate') && !name.includes('insurance') && !name.includes('currency')) return 'construction_cert';
  if (name.includes('inspection') || name.includes('setout')) return 'construction_cert';

  // Handover
  if (name.includes('handover')) return 'handover';

  // Trust/entity docs
  if (name.includes('trust') && (name.includes('incorporation') || name.includes('trustee'))) return 'trust_docs';

  // Variation/upgrade
  if (name.includes('variation') || name.includes('upgrade')) return 'contract_variation';

  // Insurance (before generic "certificate")
  if (name.includes('insurance') || name.includes('certificate of currency') || name.includes('coc')) return 'insurance';

  // Discharge
  if (name.includes('discharge') || name.includes('payout')) return 'discharge';

  // Valuation
  if (name.includes('valuation') || name.includes('appraisal')) return 'valuation';

  // Lease/tenancy
  if (name.includes('lease') || name.includes('tenancy') || name.includes('tenant') || /\brta\b/.test(name)) return 'lease';

  // Settlement
  if (name.includes('settlement')) return 'settlement';

  // Contracts (after more specific matches)
  if (name.includes('contract') || name.includes('sale agreement')) return 'contract';
  if (name.includes('complying development') || name.includes('cdc')) return 'construction_cert';

  // Loan application
  if (name.includes('application') || name.includes('pre-approval') || name.includes('serviceability')) return 'loan_application';

  // Rates
  if (name.includes('rates') || name.includes('council') || name.includes('water') || name.includes('land tax')) return 'rates';

  // Bank statements — check for known bank name patterns in data/ or statements/ folders
  if ((name.includes('beyond') || name.includes('ubank') || name.includes('bofa') || /^mac\s/.test(name)) && !pathLower.includes('finance')) return 'bank_statement';

  // Loan statements (generic "statement" or "balance" — but NOT rental)
  if ((name.includes('statement') || name.includes('balance') || name.includes('interest')) && !name.includes('rental')) return 'loan_statement';

  // ── 2. Folder/category-based fallbacks ──

  // Income statements folder → rental statements (PM reports)
  if (cat === 'income_statements' || sub === 'income_statements') return 'rental_statement';

  // Statements folder → loan statements
  if (sub === 'statements' || cat === 'statements') return 'loan_statement';

  // Finance/loan folders
  if (sub === 'loan_docs' || sub === 'loan_prep') return 'loan_docs';
  if (sub === 'refinance' || cat === 'refinance') return 'loan_docs';
  if (sub === 'finance_beyond' || sub === 'finance_macquarie' || sub === 'finance_bankwest' || cat === 'finance') return 'loan_docs';
  if (sub === 'old_loans') return 'loan_docs';

  // Purchase/contract folders
  if (cat === 'purchase' || cat === 'contracts' || sub === 'contracts') return 'contract';

  // Solicitor/settlement
  if (cat === 'solicitor' || cat === 'settlement' || sub === 'settlement') return 'settlement';

  // Other folder-based
  if (cat === 'insurance' || sub === 'insurance') return 'insurance';
  if (cat === 'depreciation' || sub === 'depreciation') return 'depreciation_schedule';
  if (cat === 'leasing' || cat === 'agreements' || sub === 'leasing' || sub === 'agreements') return 'lease';
  if (cat === 'expenses' || sub === 'expenses') return 'rates';
  if (cat === 'valuations' || sub === 'valuations') return 'valuation';
  if (cat === 'correspondence' || sub === 'correspondence' || pathLower.includes('correspondance')) return 'correspondence';

  // Data folder bank statements
  if (pathLower.includes('/data/') && (pathLower.includes('beyond') || pathLower.includes('ubank') || pathLower.includes('mac') || pathLower.includes('bofa'))) return 'bank_statement';

  return 'other';
}

function extractProvider(doc: IndexedDocument): string | null {
  const lower = doc.relativePath.toLowerCase();
  const name = doc.filename.toLowerCase();

  if (lower.includes('beyond') || name.includes('beyond')) return 'Beyond Bank';
  if (lower.includes('macquarie') || name.includes('macquarie')) return 'Macquarie';
  if (lower.includes('bankwest') || name.includes('bankwest')) return 'Bankwest';
  if (lower.includes('nab') || name.includes('nab')) return 'NAB';
  if (lower.includes('cba') || name.includes('cba') || name.includes('commonwealth')) return 'CBA';
  if (lower.includes('cgu') || name.includes('cgu')) return 'CGU';
  if (lower.includes('spg') || name.includes('spg')) return 'SPG';
  if (lower.includes('ncl') || name.includes('ncl')) return 'NCL';
  if (lower.includes('mcg') || name.includes('mcg')) return 'MCG';

  return null;
}
