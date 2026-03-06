import { usePortfolioStore } from '../../store/portfolioStore';
import { formatCurrency, formatDate } from '../../utils/format';
import type { Property, Loan, Entity, TimelineEvent } from '../../types';

type MilestoneCategory = 'purchase' | 'finance' | 'construction' | 'insurance' | 'management' | 'rental' | 'other';

const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  purchase: 'PURCHASE',
  finance: 'FINANCE',
  construction: 'CONSTRUCTION',
  insurance: 'INSURANCE',
  management: 'PROPERTY MANAGEMENT',
  rental: 'RENTAL',
  other: 'OTHER',
};

const CATEGORY_ORDER: MilestoneCategory[] = ['purchase', 'finance', 'construction', 'rental', 'management', 'insurance', 'other'];

interface Milestone {
  date: string;
  description: string;
  category: MilestoneCategory;
}

function buildMilestones(property: Property, allLoans: Loan[], allProperties: Property[], entities: Entity[], timelineEvents: TimelineEvent[]): Milestone[] {
  const ms: Milestone[] = [];
  const propLoans = allLoans.filter(l => l.propertyId === property.id);
  const entity = entities.find(e => e.id === property.entityId);
  const isHL = !!(property.landCost && property.buildCost);

  // Purchase
  if (property.purchaseDate) {
    const price = property.purchasePrice ? ` — ${formatCurrency(property.purchasePrice)}` : '';
    const hl = isHL ? ` (Land ${formatCurrency(property.landCost!)} + Build ${formatCurrency(property.buildCost!)})` : '';
    ms.push({ date: property.purchaseDate, description: `Purchase${price}${hl}`, category: 'purchase' });
  }

  if (property.deposit) {
    ms.push({ date: property.purchaseDate || '', description: `Deposit paid — ${formatCurrency(property.deposit)}`, category: 'purchase' });
  }

  // Original loans (purchase finance)
  const purchaseLoans = propLoans
    .filter(l => !l.refinancedFromId && l.type !== 'cash_out' && l.type !== 'offset'
      && (!l.purposePropertyId || l.purposePropertyId === property.id))
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

  for (const loan of purchaseLoans) {
    const type = loan.isInterestOnly ? 'IO' : 'P&I';
    const rate = loan.interestRate ? ` @ ${loan.interestRate.toFixed(2)}%` : '';
    const lmi = loan.lmi ? ` (incl. LMI ${formatCurrency(loan.lmi)})` : '';
    ms.push({
      date: loan.startDate || property.purchaseDate || '',
      description: `${loan.lender} loan — ${formatCurrency(loan.originalAmount)} ${type}${rate}${lmi}`,
      category: 'finance',
    });
    if (loan.valuation) {
      ms.push({ date: loan.startDate || '', description: `Bank valuation — ${formatCurrency(loan.valuation)}`, category: 'finance' });
    }
  }

  // Construction milestones (for H&L)
  if (isHL && property.status !== 'construction') {
    // If there's a construction loan, completion is roughly when status changed
    // We don't have exact construction dates, but we can infer from loan notes
    // Just show a generic milestone if H&L
    const completionDate = propLoans.find(l => l.notes?.toLowerCase().includes('complet'))?.startDate;
    if (completionDate) {
      ms.push({ date: completionDate, description: 'Construction completed', category: 'construction' });
    }
  }

  // Cash-out loans
  const cashOuts = propLoans
    .filter(l => l.type === 'cash_out' && !l.refinancedFromId)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  for (const loan of cashOuts) {
    const purposeProp = loan.purposePropertyId ? allProperties.find(p => p.id === loan.purposePropertyId) : null;
    const forProp = purposeProp ? ` for ${purposeProp.nickname}` : '';
    ms.push({
      date: loan.startDate || '',
      description: `Cash out via ${loan.lender} — ${formatCurrency(loan.originalAmount)}${forProp}`,
      category: 'finance',
    });
  }

  // Refinances
  const seen = new Set<string>();
  const refinancedLoans = propLoans.filter(l => l.refinancedToId);
  for (const oldLoan of refinancedLoans) {
    const newLoan = allLoans.find(l => l.id === oldLoan.refinancedToId);
    if (!newLoan || seen.has(newLoan.id)) continue;
    seen.add(newLoan.id);
    const type = newLoan.isInterestOnly ? 'IO' : 'P&I';
    const rate = newLoan.interestRate ? ` @ ${newLoan.interestRate.toFixed(2)}%` : '';
    ms.push({
      date: newLoan.startDate || oldLoan.endDate || '',
      description: `Refinance ${oldLoan.lender} → ${newLoan.lender} — ${formatCurrency(newLoan.originalAmount)} ${type}${rate}`,
      category: 'finance',
    });
  }

  // Closed loans
  for (const loan of propLoans) {
    if (loan.status === 'closed' && (loan.closedDate || loan.endDate)) {
      ms.push({
        date: loan.closedDate || loan.endDate!,
        description: `${loan.lender} #${loan.accountNumber} closed`,
        category: 'finance',
      });
    }
  }

  // Insurance
  if (property.insuranceProvider) {
    const cost = property.insuranceAnnual ? ` — ${formatCurrency(property.insuranceAnnual)}/yr` : '';
    ms.push({
      date: property.insuranceRenewalDate || '',
      description: `Insurance with ${property.insuranceProvider}${cost}`,
      category: 'insurance',
    });
  }

  // Property management
  if (property.managementCompany) {
    const fee = property.managementFeePercent ? ` (${property.managementFeePercent}% fee)` : '';
    const rent = property.weeklyRent ? ` — $${property.weeklyRent}/wk` : '';
    ms.push({
      date: property.leaseStart || '',
      description: `PM: ${property.managementCompany}${fee}${rent}`,
      category: 'management',
    });
  }

  // Lease
  if (property.leaseStart) {
    const rent = property.weeklyRent ? ` — $${property.weeklyRent}/wk` : '';
    ms.push({ date: property.leaseStart, description: `Lease started${rent}`, category: 'rental' });
  }
  if (property.leaseEnd) {
    ms.push({ date: property.leaseEnd, description: 'Lease expires', category: 'rental' });
  }

  // Merge stored timeline events
  const eventTypeToCategory: Record<string, MilestoneCategory> = {
    purchase: 'purchase', settlement: 'purchase', valuation: 'finance',
    refinance: 'finance', cash_out: 'finance',
    construction: 'construction', insurance: 'insurance',
    management: 'management', rental: 'rental', other: 'other',
  };
  const propEvents = timelineEvents.filter(e => e.propertyId === property.id);
  for (const evt of propEvents) {
    const amount = evt.amount ? ` — ${formatCurrency(evt.amount)}` : '';
    ms.push({
      date: evt.date,
      description: `${evt.title}${amount}${evt.description ? ': ' + evt.description : ''}`,
      category: eventTypeToCategory[evt.type] || 'other',
    });
  }

  // Sort: category order first, then chronologically within each category
  // Items without dates go to the end of their category
  ms.sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category);
    const catB = CATEGORY_ORDER.indexOf(b.category);
    if (catA !== catB) return catA - catB;
    // Within same category, sort by date (empty dates last)
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return ms;
}

export function PropertyTimelineTab({ propertyFilter }: { propertyFilter?: string | null }) {
  const { properties, loans, entities, timelineEvents } = usePortfolioStore();

  const activeProperties = [...properties]
    .sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || ''))
    .filter(p => p.status !== 'deposit_paid' || p.id === 'lennox')
    .filter(p => !propertyFilter || p.id === propertyFilter);

  return (
    <div className="space-y-4">
      {activeProperties.map(property => {
        const milestones = buildMilestones(property, loans, properties, entities, timelineEvents);

        return (
          <div key={property.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">{property.nickname}</h3>
                <p className="text-xs text-gray-400">{property.address}, {property.suburb} {property.state}</p>
              </div>
              <span className="text-xs text-gray-400">{milestones.length} events</span>
            </div>

            <div className="px-5 py-4">
              {milestones.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No milestones yet.</p>
              ) : (
                <div className="relative ml-2">
                  <div className="absolute left-0 top-1 bottom-1 w-px bg-gray-200" />
                  <div className="space-y-0">
                    {milestones.map((m, idx) => {
                      const prevCat = idx > 0 ? milestones[idx - 1].category : null;
                      const showHeader = m.category !== prevCat;
                      return (
                        <div key={idx}>
                          {showHeader && (
                            <div className={`pl-5 text-[10px] font-bold text-gray-400 tracking-widest uppercase ${idx > 0 ? 'pt-4 pb-1' : 'pb-1'}`}>
                              {CATEGORY_LABELS[m.category]}
                            </div>
                          )}
                          <div className="relative flex items-start gap-4 py-2">
                            <div className="absolute left-[-4px] top-[11px] w-[9px] h-[9px] rounded-full bg-gray-300 border-2 border-white ring-1 ring-gray-200 z-10" />
                            <div className="pl-5 w-24 shrink-0 text-[11px] text-gray-400 pt-0.5 whitespace-nowrap">
                              {m.date ? formatDate(m.date) : ''}
                            </div>
                            <div className="text-xs text-gray-800 pt-0.5">{m.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
