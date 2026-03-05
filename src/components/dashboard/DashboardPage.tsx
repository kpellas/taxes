import { DollarSign, Home, TrendingUp, Percent, AlertTriangle, Upload, Receipt } from 'lucide-react';
import { useRef } from 'react';
import { MetricCard } from '../common/MetricCard';
import { EntityBadge } from '../common/EntityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { SourceBadge } from '../common/SourceBadge';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { useExpenseStore } from '../../store/expenseStore';
import { formatCurrency } from '../../utils/format';
import Papa from 'papaparse';

function getFinancialYear(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 6) return `${year}-${(year + 1).toString().slice(2)}`;
  return `${year - 1}-${year.toString().slice(2)}`;
}

function BusinessDashboard({ entityId }: { entityId: string }) {
  const entity = usePortfolioStore((s) => s.getEntity(entityId));
  const { expenses, addExpenses } = useExpenseStore();
  const { setActivePage } = useUIStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const entityExpenses = expenses.filter(e => e.entityId === entityId);
  const totalRevenue = entityExpenses.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalExpenses = entityExpenses.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const netPL = totalRevenue - totalExpenses;
  const totalDeductible = entityExpenses.filter(e => e.isTaxDeductible && e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

  const recentExpenses = [...entityExpenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Omit<typeof expenses[0], 'id'>[] = [];
        for (const row of results.data as Record<string, string>[]) {
          const date = row.Date || row.date || row['Transaction Date'] || row['Value Date'] || '';
          const description = row.Description || row.description || row.Narrative || row.Details || row.Memo || '';
          const debit = parseFloat(row.Debit || row.debit || '0') || 0;
          const credit = parseFloat(row.Credit || row.credit || '0') || 0;
          const amountStr = row.Amount || row.amount || '';
          let amount = parseFloat(amountStr) || 0;
          if (debit && !amount) amount = -Math.abs(debit);
          if (credit && !amount) amount = Math.abs(credit);
          if (!date || !description) continue;
          imported.push({
            date, description, amount,
            account: file.name.replace(/\.[^.]+$/, ''),
            categoryId: '',
            entityId,
            isTaxDeductible: amount < 0,
            financialYear: getFinancialYear(date),
          });
        }
        if (imported.length > 0) addExpenses(imported);
      },
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!entity) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-400 mt-0.5">Showing {entity.displayName}</p>
      </div>

      {/* Entity info banner */}
      <div className="rounded-lg border p-4" style={{ backgroundColor: entity.bgColor, borderColor: entity.color + '30' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold" style={{ color: entity.color }}>{entity.name}</p>
            <p className="text-xs mt-0.5" style={{ color: entity.color + 'cc' }}>
              {entity.abn ? `ABN: ${entity.abn}` : ''}
              {entity.notes ? ` — ${entity.notes}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">2024 Result</p>
            <p className="text-sm font-mono font-semibold text-red-600">-$2,321 loss</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Revenue" value={formatCurrency(totalRevenue)} subtitle={`${entityExpenses.filter(e => e.amount > 0).length} transactions`} icon={TrendingUp} />
        <MetricCard label="Expenses" value={formatCurrency(totalExpenses)} subtitle={`${entityExpenses.filter(e => e.amount < 0).length} transactions`} icon={Receipt} />
        <MetricCard label="Net P&L" value={formatCurrency(netPL)} subtitle={netPL >= 0 ? 'Profit' : 'Loss'} icon={DollarSign} />
        <MetricCard label="Tax Deductible" value={formatCurrency(totalDeductible)} subtitle="Claimable expenses" icon={Percent} />
      </div>

      {entityExpenses.length === 0 ? (
        /* Empty state — prompt CSV import */
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Upload size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Import a bank statement CSV for {entity.displayName} to track business income and expenses.
          </p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Upload size={16} />
            Import Bank CSV
          </button>
          <p className="mt-3 text-xs text-gray-400">
            Or go to{' '}
            <button onClick={() => setActivePage('expenses')} className="text-blue-500 hover:text-blue-700 underline">
              Expenses
            </button>{' '}
            for full register with categories.
          </p>
        </div>
      ) : (
        /* Recent transactions */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Recent Transactions</h3>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Upload size={12} /> Import CSV
              </button>
              <button
                onClick={() => setActivePage('expenses')}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                View all →
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-right px-4 py-2 font-medium">Amount</th>
                <th className="text-left px-4 py-2 font-medium">FY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{exp.date}</td>
                  <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{exp.description}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-medium ${exp.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(exp.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{exp.financialYear}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entityExpenses.length > 10 && (
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400 text-center border-t border-gray-100">
              Showing 10 of {entityExpenses.length} — <button onClick={() => setActivePage('expenses')} className="text-blue-500 hover:text-blue-700">View all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { properties, loans, taxDocuments, actionItems, entities, timelineEvents, propertyDocuments } = usePortfolioStore();
  const { activeEntityId, navigateToProperty } = useUIStore();

  // If a business entity is selected, show business dashboard
  const activeEntity = entities.find(e => e.id === activeEntityId);
  if (activeEntity?.type === 'business_trust') {
    return <BusinessDashboard entityId={activeEntityId!} />;
  }

  const filteredProps = activeEntityId ? properties.filter((p) => p.entityId === activeEntityId) : properties;
  const filteredLoans = activeEntityId ? loans.filter((l) => l.entityId === activeEntityId) : loans;

  const activeLoans = filteredLoans.filter((l) => l.status === 'active' && l.type !== 'offset');
  const totalDebt = activeLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
  const totalRent = filteredProps.reduce((sum, p) => sum + p.annualRent, 0);
  const totalValue = filteredProps.reduce((sum, p) => sum + (p.currentValue ?? 0), 0);
  const lvr = totalValue > 0 ? (totalDebt / totalValue) * 100 : 0;
  const totalInsurance = filteredProps.reduce((sum, p) => sum + (p.insuranceAnnual ?? 0), 0);
  const totalCouncil = filteredProps.reduce((sum, p) => sum + (p.councilRatesAnnual ?? 0), 0);
  const totalWater = filteredProps.reduce((sum, p) => sum + (p.waterRatesAnnual ?? 0), 0);
  const totalLandTax = filteredProps.reduce((sum, p) => sum + (p.landTaxAnnual ?? 0), 0);
  const totalMgmtFees = filteredProps.reduce((sum, p) => {
    if (!p.managementFeePercent || p.annualRent <= 0) return sum;
    return sum + (p.annualRent * p.managementFeePercent / 100);
  }, 0);
  const noi = totalRent - totalInsurance - totalCouncil - totalWater - totalLandTax - totalMgmtFees;

  const missingDocs = taxDocuments.filter((d) => d.status === 'missing').length;
  const openActions = actionItems.filter((a) => !a.completed).length;
  const confirmItems = actionItems.filter((a) => a.category === 'confirm' && !a.completed);

  const allSourceInfos = [
    ...properties.map(p => p.sourceInfo),
    ...loans.map(l => l.sourceInfo),
    ...timelineEvents.map(t => t.sourceInfo),
    ...propertyDocuments.map(d => d.sourceInfo),
    ...entities.map(e => e.sourceInfo),
  ];
  const totalAssumed = allSourceInfos.filter(s => s.confidence === 'assumed').length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          {activeEntityId
            ? `Showing ${entities.find((e) => e.id === activeEntityId)?.displayName}`
            : 'Portfolio overview across all entities'}
        </p>
      </div>

      {/* Alerts row */}
      {(totalAssumed > 0 || missingDocs > 0) && (
        <div className="flex items-center gap-4 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
          {totalAssumed > 0 && <span><AlertTriangle size={12} className="inline mr-1 text-gray-400" />{totalAssumed} assumptions</span>}
          {missingDocs > 0 && <span className="text-amber-700">{missingDocs} docs missing</span>}
          {openActions > 0 && <span>{openActions} action items</span>}
          {confirmItems.length > 0 && <span>{confirmItems.length} need confirmation</span>}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Debt" value={formatCurrency(totalDebt)} subtitle={`${activeLoans.length} active loans`} icon={DollarSign} />
        <MetricCard label="Annual Rent" value={formatCurrency(totalRent)} subtitle={`${filteredProps.filter((p) => p.annualRent > 0).length} income properties`} icon={Home} />
        <MetricCard label="NOI" value={formatCurrency(noi)} subtitle="Rent less expenses" icon={TrendingUp} />
        <MetricCard label="LVR" value={`${lvr.toFixed(1)}%`} subtitle={`Portfolio value: ${formatCurrency(totalValue)}`} icon={Percent} />
      </div>

      {/* Property table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Properties</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
              <th className="text-left px-4 py-2 font-medium">Property</th>
              <th className="text-left px-4 py-2 font-medium">Entity</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Rent p/a</th>
              <th className="text-right px-4 py-2 font-medium">Debt</th>
              <th className="text-right px-4 py-2 font-medium">Value</th>
              <th className="text-left px-4 py-2 font-medium">Lender</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredProps.map((property) => {
              const propLoans = loans.filter((l) => l.propertyId === property.id && l.status === 'active' && l.type !== 'offset');
              const propDebt = propLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
              return (
                <tr key={property.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigateToProperty(property.id)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium text-gray-800">{property.nickname}</p>
                        <p className="text-xs text-gray-400">{property.address}, {property.suburb}</p>
                      </div>
                      <SourceBadge sourceInfo={property.sourceInfo} compact />
                    </div>
                  </td>
                  <td className="px-4 py-3"><EntityBadge entityId={property.entityId} /></td>
                  <td className="px-4 py-3"><StatusBadge status={property.status} /></td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{property.annualRent > 0 ? formatCurrency(property.annualRent) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{propDebt > 0 ? formatCurrency(propDebt) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{property.currentValue ? formatCurrency(property.currentValue) : '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{propLoans.length > 0 ? propLoans[0].lender : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Debt by entity */}
      {!activeEntityId && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Debt by Entity</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Entity</th>
                <th className="text-right px-4 py-2 font-medium">Total Debt</th>
                <th className="text-right px-4 py-2 font-medium">% of Portfolio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entities.map((entity) => {
                const entityLoans = loans.filter((l) => l.entityId === entity.id && l.status === 'active' && l.type !== 'offset');
                const entityDebt = entityLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
                if (entityDebt === 0) return null;
                return (
                  <tr key={entity.id}>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{entity.displayName}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-800">{formatCurrency(entityDebt)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{totalDebt > 0 ? `${((entityDebt / totalDebt) * 100).toFixed(1)}%` : '-'}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-900">{formatCurrency(totalDebt)}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
