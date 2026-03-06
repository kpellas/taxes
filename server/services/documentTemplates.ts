import { upsertTemplate, getAllTemplates } from '../db.js';

// Seed document templates — defines what documents SHOULD exist for each event type.
// These are universal: every property purchase needs the same set of docs, every refinance, etc.

const TEMPLATES = [
  // ── Purchase ──
  { id: 'purchase-contract-land', event_type: 'purchase', name: 'Land Contract', category: 'settlement', description: 'Contract of sale for land', match_hints: { keywords: ['contract', 'land contract', 'sale'], folder: ['purchase', 'contract'] } },
  { id: 'purchase-contract-build', event_type: 'purchase', name: 'Building Contract', category: 'settlement', description: 'Construction contract with builder', applies_to: 'h_and_l', match_hints: { keywords: ['build contract', 'construction', 'ncl'], folder: ['purchase', 'contract'] } },
  { id: 'purchase-settlement', event_type: 'purchase', name: 'Settlement Statement', category: 'settlement', description: 'Final settlement documents from solicitor', match_hints: { keywords: ['settlement'], folder: ['solicitor', 'settlement'] } },
  { id: 'purchase-solicitor', event_type: 'purchase', name: 'Solicitor Correspondence', category: 'correspondence', description: 'Legal correspondence for purchase', required: false, match_hints: { keywords: ['solicitor', 'rhett'], folder: ['solicitor'] } },
  { id: 'purchase-property-report', event_type: 'purchase', name: 'Property Report', category: 'correspondence', description: 'Property investment report or sales advice', required: false, match_hints: { keywords: ['property report', 'sales advice'], folder: ['correspondance', 'caifu', 'ncl'] } },
  { id: 'purchase-handover', event_type: 'purchase', name: 'Handover / Building Report', category: 'other', description: 'Handover inspection or building report', applies_to: 'h_and_l', match_hints: { keywords: ['handover', 'inspection'], folder: ['handover'] } },
  { id: 'purchase-occupancy-cert', event_type: 'purchase', name: 'Occupancy Certificate', category: 'other', description: 'Certificate of occupancy or completion', applies_to: 'h_and_l', match_hints: { keywords: ['occup', 'completion', 'compliance'], folder: ['handover', 'certificate'] } },
  { id: 'purchase-depreciation', event_type: 'purchase', name: 'Depreciation Schedule', category: 'tax', description: 'From quantity surveyor — required for tax deductions', match_hints: { keywords: ['depreciation', 'mcg', 'quantity surveyor'], folder: ['depreciation'] } },

  // ── Purchase Finance ──
  { id: 'purchase-finance-loan-docs', event_type: 'purchase_finance', name: 'Original Loan Documents', category: 'loan', description: 'Loan offer/contract from purchase lender', match_hints: { keywords: ['loan docs', 'loan offer', 'offer package', 'facility agreement'], folder: ['purchase', 'finance'] } },
  { id: 'purchase-finance-valuation', event_type: 'purchase_finance', name: 'Purchase Valuation', category: 'valuation', description: 'Bank or independent valuation at purchase', match_hints: { keywords: ['valuation', 'property report'], folder: ['purchase', 'valuation'] } },

  // ── Refinance ──
  { id: 'refinance-new-loan-docs', event_type: 'refinance', name: 'New Loan Documents', category: 'loan', description: 'Loan docs from new lender', match_hints: { keywords: ['loan docs', 'loan offer', 'settlement', 'facility agreement'], folder: ['refinance'] } },
  { id: 'refinance-discharge', event_type: 'refinance', name: 'Discharge Statement', category: 'loan', description: 'Discharge/payout from old lender', match_hints: { keywords: ['discharge', 'payout', 'closing', 'last statement'], folder: ['refinance', 'old loan'] } },
  { id: 'refinance-valuation', event_type: 'refinance', name: 'Refinance Valuation', category: 'valuation', description: 'Valuation obtained for refinance', required: false, match_hints: { keywords: ['valuation'], folder: ['refinance', 'valuation'] } },

  // ── Insurance ──
  { id: 'insurance-certificate', event_type: 'insurance_renewal', name: 'Insurance Certificate', category: 'insurance', description: 'Certificate of currency from insurer', match_hints: { keywords: ['insurance', 'certificate of currency', 'policy'], folder: ['insurance'] } },

  // ── Property Management ──
  { id: 'pm-agreement', event_type: 'new_pm', name: 'PM Agreement', category: 'management', description: 'Property management agreement', match_hints: { keywords: ['management agreement', 'pm agreement'], folder: ['agreement', 'leasing'] } },

  // ── Tenant ──
  { id: 'tenant-lease', event_type: 'new_tenant', name: 'Lease Agreement', category: 'lease', description: 'Signed lease agreement', match_hints: { keywords: ['lease'], folder: ['leasing', 'agreement'] } },

  // ── Annual (per FY) ──
  { id: 'annual-council-rates', event_type: 'annual', name: 'Council Rates Notice', category: 'rates', description: 'Annual council rates notice', match_hints: { keywords: ['council', 'rate', 'notice'], exclude: ['water', 'maintenance'] } },
  { id: 'annual-water-rates', event_type: 'annual', name: 'Water Rates Notice', category: 'rates', description: 'Annual water rates notice', match_hints: { keywords: ['water rate', 'water bill', 'hunter water'], exclude: ['waterford'] } },
  { id: 'annual-rental-summary', event_type: 'annual', name: 'Rental Summary', category: 'management', description: 'End of year rental income summary from PM', match_hints: { keywords: ['rental statement', 'income statement', 'annual summary'], folder: ['income_statements'] } },
  { id: 'annual-loan-statement', event_type: 'annual', name: 'Loan Interest Statement', category: 'loan', description: 'Annual interest summary from lender (for tax)', match_hints: { keywords: ['interest statement', 'loan statement', 'annual statement'], folder: ['statements'] } },
  { id: 'annual-insurance-renewal', event_type: 'annual', name: 'Insurance Renewal', category: 'insurance', description: 'Annual insurance renewal certificate', match_hints: { keywords: ['insurance', 'renewal', 'certificate of currency'], folder: ['insurance'] } },
];

export function seedDocumentTemplates() {
  const existing = getAllTemplates();
  if (existing.length > 0) return; // already seeded

  console.log('Seeding document templates...');
  for (const t of TEMPLATES) {
    upsertTemplate(t);
  }
  console.log(`Seeded ${TEMPLATES.length} document templates`);
}
