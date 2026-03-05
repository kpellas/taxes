import { Receipt, Upload, Search, Filter } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { formatCurrency } from '../../utils/format';
import type { Transaction } from '../../types';
import Papa from 'papaparse';

export function TransactionsPage() {
  const { activeEntityId } = useUIStore();
  const { entities, properties, categories } = usePortfolioStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ total: number; imported: number } | null>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const imported: Transaction[] = results.data.map((row: any, idx: number) => ({
          id: `imported-${Date.now()}-${idx}`,
          date: row.date || row.Date || row.DATE || '',
          description: row.description || row.Description || row.DESCRIPTION || '',
          amount: parseFloat(row.amount || row.Amount || row.AMOUNT || '0'),
          balance: row.balance ? parseFloat(row.balance) : undefined,
          account: row.account || row.Account || 'imported',
          confirmed: false,
        }));

        setTransactions((prev) => [...prev, ...imported]);
        setImportStats({ total: results.data.length, imported: imported.length });
        setImporting(false);
      },
      error: () => setImporting(false),
    });
  }, []);

  const filtered = transactions.filter((t) => {
    if (searchTerm && !t.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterCategory && t.categoryId !== filterCategory) return false;
    if (activeEntityId && t.entityId && t.entityId !== activeEntityId) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt size={24} /> Transactions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {transactions.length > 0
              ? `${transactions.length} transactions loaded`
              : 'Import your CSV files to get started'}
          </p>
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium">
          <Upload size={16} />
          Import CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Import success message */}
      {importStats && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-emerald-800">
            Successfully imported {importStats.imported} transactions from CSV
          </p>
          <button
            onClick={() => setImportStats(null)}
            className="text-sm text-emerald-600 hover:text-emerald-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Upload size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions loaded</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Import your CSV transaction files to categorize expenses by entity and property.
            Your existing <code className="bg-gray-100 px-1 rounded">all_transactions_consolidated.csv</code> file
            should work directly.
          </p>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium">
            <Upload size={16} />
            Choose CSV File
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
          <div className="mt-6 text-xs text-gray-400">
            <p>Expected columns: date, description, amount (or debit/credit), balance, account</p>
            <p className="mt-1">Supports: Macquarie exports, Bankwest exports, generic CSV</p>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Account</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((txn) => (
                    <tr key={txn.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{txn.date}</td>
                      <td className="px-4 py-2.5 text-gray-900 max-w-xs truncate" title={txn.description}>
                        {txn.description}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${
                        txn.amount >= 0 ? 'text-emerald-600' : 'text-gray-900'
                      }`}>
                        {formatCurrency(txn.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{txn.account}</td>
                      <td className="px-4 py-2.5">
                        {txn.categoryId ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {categories.find((c) => c.id === txn.categoryId)?.name || txn.categoryId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Uncategorized</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {txn.entityId ? (
                          <span className="text-xs" style={{
                            color: entities.find((e) => e.id === txn.entityId)?.color
                          }}>
                            {entities.find((e) => e.id === txn.entityId)?.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 100 && (
              <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100 bg-gray-50">
                Showing first 100 of {filtered.length} transactions
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
