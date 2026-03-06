import { useMemo } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { Property, Loan, Entity } from '../../types';

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function fmtPct(n?: number): string {
  if (n == null) return '—';
  return n.toFixed(2) + '%';
}

// ── Metric ───────────────────────────────────────────────────

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm font-semibold tracking-tight ${warn ? 'text-red-500' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

// ── Purchase Card ────────────────────────────────────────────

function PurchaseCard({ property, entity, firstLoan }: { property: Property; entity?: Entity; firstLoan?: Loan }) {
  const isHL = !!(property.landCost && property.buildCost);
  const gain = property.currentValue && property.purchasePrice
    ? property.currentValue - property.purchasePrice
    : null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900">{property.nickname}</h4>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{property.address}, {property.suburb} {property.state} {property.postcode}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{entity?.displayName}</p>
          </div>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded shrink-0">
            {property.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-900 tracking-tight">{fmt(property.purchasePrice)}</span>
          {gain !== null && (
            <span className={`text-xs font-medium ${gain >= 0 ? 'text-slate-400' : 'text-red-500'}`}>
              {gain >= 0 ? '+' : ''}{fmt(gain)} equity
            </span>
          )}
        </div>
      </div>
      {isHL && (
        <div className="px-4 py-2.5 border-b border-slate-100 grid grid-cols-2 gap-x-4">
          <Metric label="Land" value={fmt(property.landCost)} />
          <Metric label="Build" value={fmt(property.buildCost)} />
        </div>
      )}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Metric label="Settlement" value={fmtDate(property.purchaseDate)} />
        <Metric label="Current Value" value={fmt(property.currentValue)} />
        <Metric
          label="Ownership"
          value={property.ownership.map(o => `${o.name.split(' ')[0]} ${o.percentage}%`).join(' / ')}
          warn={property.ownershipNeedsConfirmation}
        />
        {firstLoan ? (
          <Metric label="Original Lender" value={firstLoan.lender} />
        ) : (
          <Metric label="Financing" value="No debt" />
        )}
      </div>
    </div>
  );
}

// ── Loan Card ────────────────────────────────────────────────

function LoanCard({ loan, properties }: { loan: Loan; properties: Property[] }) {
  const purposeProp = properties.find(p => p.id === loan.purposePropertyId);
  const securityProp = properties.find(p => p.id === loan.propertyId);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-900">{loan.lender}</h4>
            <p className="text-xs text-slate-400 mt-0.5">#{loan.accountNumber}</p>
          </div>
          <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded shrink-0">
            {loan.isInterestOnly ? 'Interest Only' : 'P&I'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900 tracking-tight">{fmt(loan.currentBalance)}</span>
          <span className="text-sm font-semibold text-slate-400">{fmtPct(loan.interestRate)}</span>
        </div>
      </div>
      <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
        <Metric label="FY Interest" value={fmt(loan.interestPaidFY)} />
        <Metric label="Repayment" value={fmt(loan.monthlyRepayment)} />
        <Metric label="Purpose" value={loan.purpose} />
        {purposeProp && purposeProp.id !== loan.propertyId && (
          <Metric label="Purpose Property" value={purposeProp.nickname} />
        )}
        {securityProp && (
          <Metric label="Security" value={securityProp.nickname} />
        )}
        <Metric label="Start" value={fmtDate(loan.startDate)} />
      </div>
      {loan.needsConfirmation && (
        <div className="px-4 pb-2.5">
          <span className="text-[10px] text-red-500 font-medium">Needs confirmation</span>
        </div>
      )}
    </div>
  );
}

// ── Insurance Card ───────────────────────────────────────────

function InsuranceCard({ property }: { property: Property }) {
  const hasMissing = !property.insuranceProvider || !property.insuranceAnnual || !property.insuranceRenewalDate;

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3 pb-2.5 border-b border-slate-100">
        <h4 className="text-sm font-bold text-slate-900">{property.nickname}</h4>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{property.address}, {property.suburb}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-900 tracking-tight">{fmt(property.insuranceAnnual)}</span>
          <span className="text-xs text-slate-400">per year</span>
        </div>
      </div>
      <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
        <Metric label="Provider" value={property.insuranceProvider ?? '—'} warn={!property.insuranceProvider} />
        <Metric label="Renewal" value={fmtDate(property.insuranceRenewalDate)} warn={!property.insuranceRenewalDate} />
      </div>
      {hasMissing && (
        <div className="px-4 pb-2.5">
          <span className="text-[10px] text-red-500 font-medium">Missing details</span>
        </div>
      )}
    </div>
  );
}

// ── PM Card ──────────────────────────────────────────────────

function PMCard({ property }: { property: Property }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-4 pt-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900">{property.nickname}</h4>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{property.address}, {property.suburb}</p>
          </div>
          {property.managementFeePercent && (
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded shrink-0">
              {property.managementFeePercent}% fee
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          {property.weeklyRent ? (
            <>
              <span className="text-lg font-bold text-slate-900 tracking-tight">${property.weeklyRent}/wk</span>
              <span className="text-xs text-slate-400">({fmt(property.annualRent)}/yr)</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-slate-900 tracking-tight">{fmt(property.annualRent)}</span>
              <span className="text-xs text-slate-400">per year</span>
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
        <Metric label="Manager" value={property.managementCompany ?? '—'} warn={!property.managementCompany} />
        <Metric label="Contact" value={property.managementContact ?? '—'} />
        <Metric label="Lease Start" value={fmtDate(property.leaseStart)} />
        <Metric label="Lease End" value={fmtDate(property.leaseEnd)} warn={!property.leaseEnd} />
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────

interface TabSummaryCardsProps {
  tab: 'purchase' | 'finance' | 'insurance' | 'pm' | 'expenses';
  propertyFilter: string | null;
}

export function TabSummaryCards({ tab, propertyFilter }: TabSummaryCardsProps) {
  const { properties, loans, entities } = usePortfolioStore();

  const activeProperties = useMemo(() => {
    const filtered = properties.filter(p => p.status !== 'deposit_paid' || p.id === 'lennox');
    return propertyFilter ? filtered.filter(p => p.id === propertyFilter) : filtered;
  }, [properties, propertyFilter]);

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  }, [entities]);

  if (tab === 'expenses') return null;

  if (tab === 'purchase') {
    return (
      <div className="space-y-3">
        {activeProperties.map(p => {
          const firstLoan = loans
            .filter(l => l.propertyId === p.id && !l.refinancedFromId)
            .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))[0];
          return (
            <PurchaseCard
              key={p.id}
              property={p}
              entity={entityMap.get(p.entityId)}
              firstLoan={firstLoan}
            />
          );
        })}
      </div>
    );
  }

  if (tab === 'finance') {
    const filteredLoans = loans
      .filter(l => l.status === 'active')
      .filter(l => !propertyFilter || l.propertyId === propertyFilter)
      .sort((a, b) => a.lender.localeCompare(b.lender) || a.accountNumber.localeCompare(b.accountNumber));

    return (
      <div className="space-y-3">
        {filteredLoans.map(l => (
          <LoanCard key={l.id} loan={l} properties={properties} />
        ))}
        {filteredLoans.length === 0 && (
          <p className="text-sm text-slate-400">No active loans.</p>
        )}
      </div>
    );
  }

  if (tab === 'insurance') {
    return (
      <div className="space-y-3">
        {activeProperties.map(p => (
          <InsuranceCard key={p.id} property={p} />
        ))}
      </div>
    );
  }

  if (tab === 'pm') {
    const rentalProperties = activeProperties.filter(p => p.status === 'active_rental');
    return (
      <div className="space-y-3">
        {rentalProperties.map(p => (
          <PMCard key={p.id} property={p} />
        ))}
      </div>
    );
  }

  return null;
}
