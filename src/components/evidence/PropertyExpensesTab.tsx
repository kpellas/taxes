import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

type ExpenseCategory = 'insurance' | 'council_rates' | 'water_rates' | 'pm_fees' | 'land_tax' | 'interest' | 'depreciation' | 'maintenance' | 'other';
type SortField = 'property' | 'category' | 'description' | 'amount';
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
  category: ExpenseCategory;
  description: string;
  amount: number;
  isRecurring: boolean;
  provider?: string;
}

function fmt(n: number): string {
  return '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface PropertyExpensesTabProps {
  searchQuery: string;
}

export function PropertyExpensesTab({ searchQuery }: PropertyExpensesTabProps) {
  const { properties, loans } = usePortfolioStore();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [recurringFilter, setRecurringFilter] = useState<'all' | 'recurring' | 'ad_hoc'>('all');
  const [sortField, setSortField] = useState<SortField>('property');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Generate expense rows from property data
  const allRows = useMemo(() => {
    const rows: ExpenseRow[] = [];

    for (const p of properties) {
      if (p.insuranceAnnual) {
        rows.push({
          id: `${p.id}-insurance`,
          propertyId: p.id,
          property: p.nickname,
          category: 'insurance',
          description: `${p.insuranceProvider ?? 'Provider TBD'} — Annual premium`,
          amount: p.insuranceAnnual,
          isRecurring: true,
          provider: p.insuranceProvider,
        });
      }

      if (p.councilRatesAnnual) {
        rows.push({
          id: `${p.id}-council`,
          propertyId: p.id,
          property: p.nickname,
          category: 'council_rates',
          description: 'Annual council rates',
          amount: p.councilRatesAnnual,
          isRecurring: true,
        });
      }

      if (p.waterRatesAnnual) {
        rows.push({
          id: `${p.id}-water`,
          propertyId: p.id,
          property: p.nickname,
          category: 'water_rates',
          description: 'Annual water rates',
          amount: p.waterRatesAnnual,
          isRecurring: true,
        });
      }

      if (p.managementFeePercent && p.annualRent) {
        const pmFee = p.annualRent * (p.managementFeePercent / 100);
        rows.push({
          id: `${p.id}-pm`,
          propertyId: p.id,
          property: p.nickname,
          category: 'pm_fees',
          description: `${p.managementCompany ?? 'PM'} — ${p.managementFeePercent}% of rent`,
          amount: Math.round(pmFee),
          isRecurring: true,
          provider: p.managementCompany,
        });
      }

      if (p.landTaxAnnual) {
        rows.push({
          id: `${p.id}-landtax`,
          propertyId: p.id,
          property: p.nickname,
          category: 'land_tax',
          description: 'Annual land tax',
          amount: p.landTaxAnnual,
          isRecurring: true,
        });
      }

      if (p.depreciationScheduleAvailable && p.capitalWorksDeduction) {
        rows.push({
          id: `${p.id}-depreciation`,
          propertyId: p.id,
          property: p.nickname,
          category: 'depreciation',
          description: 'Capital works deduction (per schedule)',
          amount: p.capitalWorksDeduction,
          isRecurring: true,
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
          category: 'interest',
          description: `${l.lender} #${l.accountNumber} — FY interest`,
          amount: l.interestPaidFY!,
          isRecurring: true,
          provider: l.lender,
        });
      }
    }

    return rows;
  }, [properties, loans]);

  // Apply filters
  let filtered = allRows;

  if (selectedPropertyId !== 'all') {
    filtered = filtered.filter(r => r.propertyId === selectedPropertyId);
  }
  if (selectedCategory !== 'all') {
    filtered = filtered.filter(r => r.category === selectedCategory);
  }
  if (recurringFilter === 'recurring') {
    filtered = filtered.filter(r => r.isRecurring);
  } else if (recurringFilter === 'ad_hoc') {
    filtered = filtered.filter(r => !r.isRecurring);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      r.description.toLowerCase().includes(q) ||
      r.property.toLowerCase().includes(q) ||
      CATEGORY_LABELS[r.category].toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'property': cmp = a.property.localeCompare(b.property); break;
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedPropertyId}
          onChange={(e) => setSelectedPropertyId(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          <option value="all">All Properties</option>
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.nickname}</option>
          ))}
        </select>

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

        <select
          value={recurringFilter}
          onChange={(e) => setRecurringFilter(e.target.value as 'all' | 'recurring' | 'ad_hoc')}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          <option value="all">All Types</option>
          <option value="recurring">Recurring</option>
          <option value="ad_hoc">Ad Hoc</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-400">Total Annual</p>
          <p className="text-lg font-bold text-gray-900 font-mono">{fmt(totalAmount)}</p>
        </div>
        {[...categoryTotals.entries()].slice(0, 3).map(([cat, total]) => (
          <div key={cat} className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-400">{CATEGORY_LABELS[cat]}</p>
            <p className="text-lg font-bold text-gray-900 font-mono">{fmt(total)}</p>
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
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('category')}>
                <span className="inline-flex items-center gap-1">Category <SortIcon field="category" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('description')}>
                <span className="inline-flex items-center gap-1">Description <SortIcon field="description" /></span>
              </th>
              <th className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700" onClick={() => handleSort('amount')}>
                <span className="inline-flex items-center gap-1 justify-end">Amount <SortIcon field="amount" /></span>
              </th>
              <th className="text-center px-4 py-2.5 font-medium w-20">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{row.property}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {CATEGORY_LABELS[row.category]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{row.description}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt(row.amount)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs ${row.isRecurring ? 'text-gray-400' : 'text-gray-600 font-medium'}`}>
                    {row.isRecurring ? 'Recurring' : 'Ad Hoc'}
                  </span>
                </td>
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
                <td className="px-4 py-2.5 text-gray-700" colSpan={3}>
                  Total ({filtered.length} items)
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-900">{fmt(totalAmount)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
