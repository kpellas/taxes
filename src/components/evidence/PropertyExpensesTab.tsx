import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useState, useMemo } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

type ExpenseCategory = 'insurance' | 'council_rates' | 'water_rates' | 'pm_fees' | 'land_tax' | 'interest' | 'depreciation' | 'maintenance' | 'other';
type SortField = 'property' | 'entity' | 'category' | 'description' | 'amount';
type SortDir = 'asc' | 'desc';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  insurance: 'Insurance',
  council_rates: 'Council Rates',
  water_rates: 'Water Rates',
  pm_fees: 'PM Fees',
  land_tax: 'Land Tax',
  interest: 'Loan Interest',
  depreciation: 'Depreciation',
  maintenance: 'Maintenance',
  other: 'Other',
};

interface ExpenseRow {
  id: string;
  propertyId: string;
  property: string;
  entity: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  isRecurring: boolean;
  deductible: boolean;
  provider?: string;
}

function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface PropertyExpensesTabProps {
  searchQuery: string;
  propertyFilter?: string | null;
}

export function PropertyExpensesTab({ searchQuery, propertyFilter }: PropertyExpensesTabProps) {
  const { properties, loans, entities } = usePortfolioStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('property');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const entityMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entities) m.set(e.id, e.name);
    return m;
  }, [entities]);

  // Generate expense rows from property data
  const allRows = useMemo(() => {
    const rows: ExpenseRow[] = [];

    for (const p of properties) {
      const eName = entityMap.get(p.entityId) ?? p.entityId;

      if (p.insuranceAnnual) {
        rows.push({
          id: `${p.id}-insurance`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'insurance',
          description: `${p.insuranceProvider ?? 'Provider TBD'} — Annual premium`,
          amount: p.insuranceAnnual,
          isRecurring: true,
          deductible: true,
          provider: p.insuranceProvider,
        });
      }

      if (p.councilRatesAnnual) {
        rows.push({
          id: `${p.id}-council`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'council_rates',
          description: 'Annual council rates',
          amount: p.councilRatesAnnual,
          isRecurring: true,
          deductible: true,
        });
      }

      if (p.waterRatesAnnual) {
        rows.push({
          id: `${p.id}-water`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'water_rates',
          description: 'Annual water rates',
          amount: p.waterRatesAnnual,
          isRecurring: true,
          deductible: true,
        });
      }

      if (p.managementFeePercent && p.annualRent) {
        const pmFee = p.annualRent * (p.managementFeePercent / 100);
        rows.push({
          id: `${p.id}-pm`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'pm_fees',
          description: `${p.managementCompany ?? 'PM'} — ${p.managementFeePercent}% of rent`,
          amount: Math.round(pmFee),
          isRecurring: true,
          deductible: true,
          provider: p.managementCompany,
        });
      }

      if (p.landTaxAnnual) {
        rows.push({
          id: `${p.id}-landtax`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'land_tax',
          description: 'Annual land tax',
          amount: p.landTaxAnnual,
          isRecurring: true,
          deductible: true,
        });
      }

      if (p.depreciationScheduleAvailable && p.capitalWorksDeduction) {
        rows.push({
          id: `${p.id}-depreciation`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'depreciation',
          description: 'Capital works deduction (per schedule)',
          amount: p.capitalWorksDeduction,
          isRecurring: true,
          deductible: true,
        });
      }

      // Loan interest for this property
      const propLoans = loans.filter(l =>
        l.propertyId === p.id && l.status === 'active' && l.interestPaidFY
      );
      for (const l of propLoans) {
        rows.push({
          id: `${p.id}-interest-${l.id}`,
          propertyId: p.id,
          property: p.nickname,
          entity: eName,
          category: 'interest',
          description: `${l.lender} #${l.accountNumber} — FY interest`,
          amount: l.interestPaidFY!,
          isRecurring: true,
          deductible: true,
          provider: l.lender,
        });
      }
    }

    return rows;
  }, [properties, loans, entityMap]);

  // Apply filters
  let filtered = allRows;

  if (propertyFilter) {
    filtered = filtered.filter(r => r.propertyId === propertyFilter);
  }
  if (selectedCategory !== 'all') {
    filtered = filtered.filter(r => r.category === selectedCategory);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      r.description.toLowerCase().includes(q) ||
      r.property.toLowerCase().includes(q) ||
      r.entity.toLowerCase().includes(q) ||
      CATEGORY_LABELS[r.category].toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'property': cmp = a.property.localeCompare(b.property); break;
      case 'entity': cmp = a.entity.localeCompare(b.entity); break;
      case 'category': cmp = CATEGORY_LABELS[a.category].localeCompare(CATEGORY_LABELS[b.category]); break;
      case 'description': cmp = a.description.localeCompare(b.description); break;
      case 'amount': cmp = a.amount - b.amount; break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Summary totals
  const totalAmount = filtered.reduce((sum, r) => sum + r.amount, 0);
  const categoryTotals = new Map<ExpenseCategory, number>();
  for (const r of filtered) {
    categoryTotals.set(r.category, (categoryTotals.get(r.category) ?? 0) + r.amount);
  }

  // Available categories in data
  const activeCategories = [...new Set(allRows.map(r => r.category))].sort();

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown size={10} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ArrowUp size={10} className="text-gray-600" />
      : <ArrowDown size={10} className="text-gray-600" />;
  }

  function exportCsv() {
    const headers = ['Property', 'Entity', 'Category', 'Description', 'Amount', 'Type', 'Deductible'];
    const csvRows = [headers.join(',')];
    for (const row of filtered) {
      csvRows.push([
        `"${row.property}"`,
        `"${row.entity}"`,
        `"${CATEGORY_LABELS[row.category]}"`,
        `"${row.description.replace(/"/g, '""')}"`,
        row.amount,
        row.isRecurring ? 'Recurring' : 'Ad Hoc',
        row.deductible ? 'Yes' : 'No',
      ].join(','));
    }
    csvRows.push(['', '', '', 'TOTAL', totalAmount, '', ''].join(','));

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses${propertyFilter ? `-${propertyFilter}` : ''}${selectedCategory !== 'all' ? `-${selectedCategory}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="all">All Categories</option>
            {activeCategories.map(cat => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>

          <span className="text-xs text-gray-400">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-3">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-2.5">
          <p className="text-xs text-gray-400">Total Annual</p>
          <p className="text-lg font-bold text-gray-900 font-mono">{fmt(totalAmount)}</p>
        </div>
        {[...categoryTotals.entries()].map(([cat, total]) => (
          <div
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
            className={`rounded-lg border px-4 py-2.5 cursor-pointer transition-colors ${
              selectedCategory === cat
                ? 'bg-gray-900 border-gray-900'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className={`text-xs ${selectedCategory === cat ? 'text-gray-400' : 'text-gray-400'}`}>
              {CATEGORY_LABELS[cat]}
            </p>
            <p className={`text-lg font-bold font-mono ${selectedCategory === cat ? 'text-white' : 'text-gray-900'}`}>
              {fmt(total)}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('property')}>
                <span className="inline-flex items-center gap-1">Property <SortIcon field="property" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('entity')}>
                <span className="inline-flex items-center gap-1">Entity <SortIcon field="entity" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('category')}>
                <span className="inline-flex items-center gap-1">Category <SortIcon field="category" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('description')}>
                <span className="inline-flex items-center gap-1">Description <SortIcon field="description" /></span>
              </th>
              <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('amount')}>
                <span className="inline-flex items-center gap-1 justify-end">Annual Amount <SortIcon field="amount" /></span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{row.property}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{row.entity}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {CATEGORY_LABELS[row.category]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{row.description}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(row.amount)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No expenses match the current filters.
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className="px-4 py-2.5 text-gray-700" colSpan={4}>
                  Total ({filtered.length} items)
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-900">{fmt(totalAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
