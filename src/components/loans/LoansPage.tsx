import { useState } from 'react';
import { ArrowLeftRight, AlertTriangle, Table, GitFork } from 'lucide-react';
import { LoanChain } from './LoanChain';
import { LoanFlowchart } from './LoanFlowchart';
import { StatusBadge } from '../common/StatusBadge';
import { EntityBadge } from '../common/EntityBadge';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency, getLenderColor } from '../../utils/format';

type LoansView = 'table' | 'structure';

export function LoansPage() {
  const [view, setView] = useState<LoansView>('table');
  const { properties, loans, entities } = usePortfolioStore();
  const { activeEntityId } = useUIStore();

  const filteredProps = activeEntityId
    ? properties.filter((p) => p.entityId === activeEntityId)
    : properties;

  const activeLoans = loans.filter(
    (l) => l.status === 'active' && l.type !== 'offset' && (!activeEntityId || l.entityId === activeEntityId)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight size={24} /> Loans & Refinancing
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Track every loan from original lender through each refinance
          </p>
        </div>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'table'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table size={14} />
            Table View
          </button>
          <button
            onClick={() => setView('structure')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'structure'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <GitFork size={14} />
            Structure Map
          </button>
        </div>
      </div>

      {view === 'structure' ? (
        <LoanFlowchart />
      ) : (
        /* Loan Chain Diagrams */
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Refinancing History by Property</h3>
          {filteredProps.map((property) => {
            const propertyLoans = loans.filter((l) => l.propertyId === property.id);
            if (propertyLoans.length === 0) return null;
            return (
              <LoanChain
                key={property.id}
                property={property}
                loans={propertyLoans}
              />
            );
          })}
        </div>
      )}

      {/* Account Mapping Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Active Loan Accounts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-600">Lender</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Account #</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Property</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Entity</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Purpose</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Balance</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {activeLoans.map((loan) => {
                const property = properties.find((p) => p.id === loan.propertyId);
                return (
                  <tr key={loan.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getLenderColor(loan.lender) }}
                        />
                        <span className="font-medium">{loan.lender}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{loan.accountNumber}</td>
                    <td className="px-5 py-3 text-gray-800">{property?.nickname ?? '-'}</td>
                    <td className="px-5 py-3">
                      <EntityBadge entityId={loan.entityId} />
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-700 max-w-48 truncate" title={loan.purpose}>
                      {loan.purpose}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(loan.currentBalance ?? loan.originalAmount)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-600">
                        {loan.isInterestOnly ? 'IO' : 'P&I'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {loan.needsConfirmation && (
                          <AlertTriangle size={14} className="text-amber-500" />
                        )}
                        <StatusBadge status={loan.status} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unconfirmed Items */}
      {loans.some((l) => l.needsConfirmation) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> Items Needing Confirmation
          </h3>
          <ul className="space-y-2">
            {loans.filter((l) => l.needsConfirmation).map((loan) => (
              <li key={loan.id} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>
                  <span className="font-medium">{loan.lender} {loan.accountNumber}</span>
                  {' - '}{loan.notes}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
