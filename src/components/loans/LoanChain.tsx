import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { Property, Loan } from '../../types';
import { EntityBadge } from '../common/EntityBadge';
import { SourceBadge } from '../common/SourceBadge';
import { formatCurrency } from '../../utils/format';
import { usePortfolioStore } from '../../store/portfolioStore';

interface LoanChainProps {
  property: Property;
  loans: Loan[];
}

function LoanTable({ loans, property }: { loans: Loan[]; property: Property }) {
  const getProperty = usePortfolioStore((s) => s.getProperty);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Lender</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Acct</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Type</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Purpose</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">IO/P&I</th>
          <th className="text-right px-4 py-2 font-semibold text-gray-700">Balance</th>
          <th className="text-right px-4 py-2 font-semibold text-gray-700">Rate</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Period</th>
          <th className="text-left px-4 py-2 font-semibold text-gray-700">Source</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {loans.map((loan) => {
          const isActive = loan.status === 'active';
          const purposeProp = loan.purposePropertyId ? getProperty(loan.purposePropertyId) : null;
          const showCrossRef = loan.purposePropertyId && loan.purposePropertyId !== loan.propertyId;

          return (
            <tr key={loan.id} className={isActive ? '' : 'text-gray-500'}>
              <td className={`px-4 py-2.5 font-medium ${isActive ? 'text-gray-900' : ''}`}>
                {loan.lender}
                {loan.needsConfirmation && <AlertTriangle size={11} className="inline ml-1 text-red-600" />}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{loan.accountNumber}</td>
              <td className="px-4 py-2.5 text-xs">{loan.type === 'offset' ? 'offset' : loan.type === 'cash_out' ? 'cash out' : loan.type === 'construction' ? 'construction' : loan.type}</td>
              <td className="px-4 py-2.5">
                {loan.purpose}
                {showCrossRef && (
                  <span className="text-xs text-gray-400 ml-1">(secured: {property.nickname})</span>
                )}
              </td>
              <td className="px-4 py-2.5">{loan.type === 'offset' ? '—' : loan.isInterestOnly ? 'IO' : 'P&I'}</td>
              <td className={`px-4 py-2.5 text-right font-mono ${isActive ? 'font-semibold text-gray-900' : ''}`}>
                {loan.currentBalance ? formatCurrency(loan.currentBalance) : loan.originalAmount ? formatCurrency(loan.originalAmount) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right">{loan.interestRate ? `${loan.interestRate}%` : '—'}</td>
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                {loan.startDate ?? '?'}{loan.endDate ? ` → ${loan.endDate}` : isActive ? ' → now' : ''}
              </td>
              <td className="px-4 py-2.5"><SourceBadge sourceInfo={loan.sourceInfo} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LoanChain({ property, loans }: LoanChainProps) {
  const [showHistory, setShowHistory] = useState(false);

  const activeLoans = loans.filter(l => l.status === 'active');
  const historyLoans = loans.filter(l => l.status !== 'active');
  const chains = buildChains(loans);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">{property.nickname}</h4>
          <p className="text-xs text-gray-500">{property.address}, {property.suburb} {property.state}</p>
        </div>
        <EntityBadge entityId={property.entityId} size="md" />
      </div>

      {/* Refinance path — simple text */}
      {chains.some(c => c.length > 1) && (
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50">
          {chains.filter(c => c.length > 1).map((chain, i) => (
            <p key={i} className="text-xs text-gray-500">
              {chain.map((loan, j) => (
                <span key={loan.id}>
                  <span className={loan.status === 'active' ? 'font-semibold text-gray-800' : ''}>
                    {loan.lender} {loan.accountNumber}
                  </span>
                  {j < chain.length - 1 && <span className="mx-1.5">→</span>}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}

      {/* Active loans table */}
      <LoanTable loans={activeLoans} property={property} />

      {/* History — collapsible */}
      {historyLoans.length > 0 && (
        <div className="border-t border-gray-200">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-5 py-2 w-full text-left"
          >
            {showHistory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {historyLoans.length} previous {historyLoans.length === 1 ? 'loan' : 'loans'}
          </button>
          {showHistory && <LoanTable loans={historyLoans} property={property} />}
        </div>
      )}
    </div>
  );
}

function buildChains(loans: Loan[]): Loan[][] {
  const chains: Loan[][] = [];
  const visited = new Set<string>();
  const loanMap = new Map(loans.map((l) => [l.id, l]));

  for (const loan of loans) {
    if (visited.has(loan.id)) continue;
    if (loan.type === 'cash_out' || loan.type === 'offset') continue;

    let start = loan;
    while (start.refinancedFromId && loanMap.has(start.refinancedFromId)) {
      start = loanMap.get(start.refinancedFromId)!;
    }
    if (visited.has(start.id)) continue;

    const chain: Loan[] = [];
    let current: Loan | undefined = start;
    while (current) {
      if (visited.has(current.id)) break;
      chain.push(current);
      visited.add(current.id);
      current = current.refinancedToId ? loanMap.get(current.refinancedToId) : undefined;
    }
    if (chain.length > 0) chains.push(chain);
  }
  return chains;
}
