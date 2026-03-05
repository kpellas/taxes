import { useState, useRef, useMemo } from 'react';
import { Upload, Search, ArrowUpDown, ChevronDown } from 'lucide-react';
import { useExpenseStore, type Expense } from '../../store/expenseStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { Trash2 } from 'lucide-react';
import Papa from 'papaparse';

type SortField = 'date' | 'amount' | 'description';
type SortDir = 'asc' | 'desc';

function getFinancialYear(date: string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month >= 6) return `${year}-${(year + 1).toString().slice(2)}`;
  return `${year - 1}-${year.toString().slice(2)}`;
}

export function ExpensesPage() {
  const { expenses, categories, addExpenses, updateExpense, deleteExpense } = useExpenseStore();
  const entities = usePortfolioStore((s) => s.entities);
  const [activeEntityId, setActiveEntityId] = useState(entities[0]?.id ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFY, setSelectedFY] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const entity = entities.find(e => e.id === activeEntityId);

  // Get unique financial years for this entity
  const financialYears = useMemo(() => {
    const fys = new Set<string>();
    expenses.filter(e => e.entityId === activeEntityId).forEach(e => {
      if (e.financialYear) fys.add(e.financialYear);
    });
    return Array.from(fys).sort().reverse();
  }, [expenses, activeEntityId]);

  // Filter, search, sort
  const filteredExpenses = useMemo(() => {
    let result = expenses.filter(e => e.entityId === activeEntityId);

    if (selectedFY) {
      result = result.filter(e => e.financialYear === selectedFY);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q) || e.account.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'amount') cmp = a.amount - b.amount;
      else if (sortField === 'description') cmp = a.description.localeCompare(b.description);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [expenses, activeEntityId, selectedFY, searchQuery, sortField, sortDir]);

  const businessCategories = categories.filter(c => c.type === 'business_income' || c.type === 'business_expense');
  const personalCategories = categories.filter(c => c.type === 'personal_deduction');
  const activeCategories = entity?.type === 'business_trust' ? businessCategories : personalCategories;

  // Totals (filtered)
  const totalIncome = filteredExpenses.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalExpenses_ = filteredExpenses.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
  const totalDeductible = filteredExpenses.filter(e => e.isTaxDeductible && e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  // CSV Import
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Omit<Expense, 'id'>[] = [];
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
            entityId: activeEntityId,
            isTaxDeductible: entity?.type !== 'business_trust' ? true : amount < 0,
            financialYear: getFinancialYear(date),
          });
        }
        if (imported.length > 0) addExpenses(imported);
      },
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  const visibleExpenses = filteredExpenses.slice(0, visibleCount);
  const hasMore = filteredExpenses.length > visibleCount;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Registers</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Transaction register by entity. Import bank CSVs, categorize, and track tax deductions.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {entities.map((ent) => (
          <button
            key={ent.id}
            onClick={() => { setActiveEntityId(ent.id); setVisibleCount(50); setSelectedFY(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeEntityId === ent.id
                ? 'border-gray-700 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {ent.displayName}
          </button>
        ))}
      </div>

      {/* Entity info banner — show for business trust */}
      {entity?.type === 'business_trust' && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">{entity.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {entity.abn ? `ABN: ${entity.abn}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Income {selectedFY ? `(${selectedFY})` : ''}
          </p>
          <p className="text-lg font-bold text-emerald-600 font-mono">
            ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Expenses {selectedFY ? `(${selectedFY})` : ''}
          </p>
          <p className="text-lg font-bold text-red-600 font-mono">
            ${totalExpenses_.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Tax Deductible {selectedFY ? `(${selectedFY})` : ''}
          </p>
          <p className="text-lg font-bold text-blue-600 font-mono">
            ${totalDeductible.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Actions bar: search + FY filter + sort + import */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Financial year filter */}
        <div className="relative">
          <select
            value={selectedFY}
            onChange={(e) => { setSelectedFY(e.target.value); setVisibleCount(50); }}
            className="appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All Years</option>
            {financialYears.map(fy => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        {/* Sort */}
        <button
          onClick={() => toggleSort(sortField === 'date' ? 'amount' : sortField === 'amount' ? 'description' : 'date')}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50"
        >
          <ArrowUpDown size={14} />
          {sortField === 'date' ? 'Date' : sortField === 'amount' ? 'Amount' : 'Name'}
          {sortDir === 'desc' ? ' ↓' : ' ↑'}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleImport}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload size={14} />
          Import CSV
        </button>
      </div>

      {/* Transaction count */}
      <p className="text-xs text-gray-400">
        {filteredExpenses.length} transactions
        {selectedFY ? ` in FY ${selectedFY}` : ''}
        {searchQuery ? ` matching "${searchQuery}"` : ''}
      </p>

      {/* Expense table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="text-center py-12">
            <Upload size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">No expenses yet. Import a bank statement CSV to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-gray-800" onClick={() => toggleSort('date')}>
                  Date {sortField === 'date' && (sortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-gray-800" onClick={() => toggleSort('description')}>
                  Description {sortField === 'description' && (sortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-gray-800" onClick={() => toggleSort('amount')}>
                  Amount {sortField === 'amount' && (sortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="text-left px-4 py-2 font-medium">FY</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Tax?</th>
                <th className="text-left px-4 py-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibleExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs whitespace-nowrap">{expense.date}</td>
                  <td className="px-4 py-2 text-gray-800 max-w-xs">
                    <p className="truncate">{expense.description}</p>
                    {expense.notes && <p className="text-xs text-gray-400 truncate">{expense.notes}</p>}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-medium ${expense.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ${Math.abs(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{expense.financialYear}</td>
                  <td className="px-4 py-2">
                    <select
                      value={expense.categoryId}
                      onChange={(e) => updateExpense(expense.id, { categoryId: e.target.value })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[140px]"
                    >
                      <option value="">Uncategorised</option>
                      {activeCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={expense.isTaxDeductible}
                      onChange={(e) => updateExpense(expense.id, { isTaxDeductible: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => deleteExpense(expense.id)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {hasMore && (
          <div className="px-4 py-3 bg-gray-50 text-center border-t border-gray-100">
            <button
              onClick={() => setVisibleCount(c => c + 50)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Load more ({filteredExpenses.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
