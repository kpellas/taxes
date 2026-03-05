export type EntityType = 'personal' | 'trust' | 'business_trust' | 'company';
export type PropertyStatus = 'active_rental' | 'construction' | 'deposit_paid' | 'sold';
export type LoanStatus = 'active' | 'refinanced' | 'closed';
export type LoanType = 'investment' | 'construction' | 'cash_out' | 'offset' | 'p_and_i' | 'interest_only';
export type DocumentStatus = 'provided' | 'missing' | 'partial';
export type Priority = 'high' | 'medium' | 'low';

// Source tracking - every piece of data must declare where it came from
export type DataConfidence = 'verified' | 'from_transcript' | 'assumed' | 'user_provided';

export interface SourceInfo {
  confidence: DataConfidence;
  source: string;            // e.g. "Elizabeth call 03/03/2026", "Bankwest statement", "Kelly input"
  assumptionReason?: string; // Required if confidence === 'assumed'. WHY was this assumed?
  verifiedBy?: string;       // Who/what verified this? e.g. "Loan statement 5638"
  lastUpdated?: string;      // When was this source info last reviewed?
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  abn?: string;
  displayName: string;
  color: string;
  bgColor: string;
  owners: Owner[];
  notes?: string;
  needsConfirmation?: boolean;
  sourceInfo: SourceInfo;
}

export interface Owner {
  name: string;
  percentage: number;
  role?: string;
}

export interface Property {
  id: string;
  entityId: string;
  address: string;
  suburb: string;
  state: string;
  nickname: string;
  aliases: string[];
  status: PropertyStatus;
  ownership: Owner[];
  ownershipNeedsConfirmation?: boolean;
  postcode?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  landCost?: number;
  buildCost?: number;
  currentValue?: number;
  managementCompany?: string;
  managementContact?: string;
  managementFeePercent?: number;
  weeklyRent?: number;
  annualRent: number;
  insuranceAnnual?: number;
  insuranceProvider?: string;
  insuranceRenewalDate?: string;
  councilRatesAnnual?: number;
  landTaxAnnual?: number;
  waterRatesAnnual?: number;
  leaseStart?: string;
  leaseEnd?: string;
  depreciationScheduleAvailable: boolean;
  capitalWorksDeduction?: number;
  loanIds: string[];
  notes?: string;
  sourceInfo: SourceInfo;
}

export interface Loan {
  id: string;
  entityId: string;
  propertyId: string;
  lender: string;
  accountNumber: string;
  type: LoanType;
  status: LoanStatus;
  originalAmount: number;
  currentBalance?: number;
  interestRate?: number;
  isInterestOnly: boolean;
  monthlyRepayment?: number;
  interestPaidFY?: number;
  purpose: string;
  purposePropertyId?: string;
  startDate?: string;
  endDate?: string;
  refinancedFromId?: string;
  refinancedToId?: string;
  needsConfirmation?: boolean;
  notes?: string;
  sourceInfo: SourceInfo;
}

export interface TaxDocument {
  id: string;
  entityId: string;
  propertyId?: string;
  documentType: string;
  description: string;
  status: DocumentStatus;
  provider?: string;
  accountReference?: string;
  notes?: string;
}

export interface TaxActionItem {
  id: string;
  entityId?: string;
  propertyId?: string;
  description: string;
  priority: Priority;
  completed: boolean;
  source: string;
  category: 'confirm' | 'provide' | 'organize' | 'setup';
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  account: string;
  categoryId?: string;
  propertyId?: string;
  entityId?: string;
  isTaxDeductible?: boolean;
  confirmed: boolean;
  notes?: string;
}

export type TimelineEventType = 'purchase' | 'refinance' | 'insurance' | 'management' | 'construction' | 'rental' | 'cash_out' | 'valuation' | 'settlement' | 'other';

export interface TimelineEvent {
  id: string;
  propertyId: string;
  date: string;
  type: TimelineEventType;
  title: string;
  description: string;
  lender?: string;
  amount?: number;
  linkedLoanId?: string;
  needsConfirmation?: boolean;
  sourceInfo: SourceInfo;
}

export type DocumentCategory = 'loan' | 'insurance' | 'management' | 'rates' | 'settlement' | 'valuation' | 'tax' | 'correspondence' | 'other';

export interface PropertyDocument {
  id: string;
  propertyId: string;
  category: DocumentCategory;
  name: string;
  description?: string;
  provider?: string;
  date?: string;
  status: DocumentStatus;
  notes?: string;
  sourceInfo: SourceInfo;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  isTaxDeductible: boolean;
}

export interface PortfolioMetrics {
  totalDebt: number;
  totalPropertyValue: number;
  lvr: number;
  totalAnnualRent: number;
  totalAnnualExpenses: number;
  netOperatingIncome: number;
  grossYield: number;
  netYield: number;
}

export type Page = 'dashboard' | 'entities' | 'properties' | 'property-detail' | 'loans' | 'tax' | 'tax-review' | 'evidence' | 'expenses' | 'email';

// ── Flowchart types ──

export interface PurchaseItem {
  label: string;
  amount: number;
  type: 'bank' | 'cash';
  tooltip?: string;
}

export interface PurchaseBreakdown {
  propertyId: string;
  date: string;
  totalCost: number;
  loanId: string;
  items: PurchaseItem[];
  buffer?: { label: string; amount: number; tooltip?: string };
}

export interface FlowchartBoxPosition {
  x: number;
  y: number;
}

export interface FlowchartArrow {
  id: string;
  sourceBoxId: string;
  targetBoxId: string;
}

// Document checklist — event-based model
export type PropertyEventType = 'purchase' | 'construction' | 'refinance' | 'new_tenant' | 'new_pm' | 'insurance_renewal' | 'sale' | 'annual';

// Tax Review — audit previous returns
export interface TaxReturn {
  id: string;
  entityId: string;
  financialYear: string;       // "2020-21", "2021-22", etc.
  personName: string;           // "Kelly Pellas", "Mark Pellas"
  type: 'individual' | 'trust';
  uploadedFile?: string;
  lineItems: TaxReturnLineItem[];
  totalIncome?: number;
  totalDeductions?: number;
  taxableIncome?: number;
  refundOrPayable?: number;
  notes?: string;
}

export interface TaxReturnLineItem {
  id: string;
  label: string;
  section: 'income' | 'deduction';
  category: string;
  propertyId?: string;
  amountLodged: number;
  amountCorrect?: number;
  ownershipUsed?: number;
  ownershipCorrect?: number;
  discrepancy?: number;
  notes?: string;
}
