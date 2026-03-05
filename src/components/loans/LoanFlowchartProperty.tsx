import { AlertTriangle } from 'lucide-react';
import type { Property, Loan } from '../../types';
import { EntityBadge } from '../common/EntityBadge';
import { usePortfolioStore } from '../../store/portfolioStore';
import { formatCurrency } from '../../utils/format';
import { forwardRef } from 'react';

interface LoanFlowchartPropertyProps {
  property: Property;
  loans: Loan[];
  /** Loans from other properties whose purpose is this property */
  fundedByLoans?: Loan[];
  dimmed?: boolean;
  /** Refs map so parent can get bounding rects for SVG arrows */
  loanRefs?: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
}

export const LoanFlowchartProperty = forwardRef<HTMLDivElement, LoanFlowchartPropertyProps>(
  function LoanFlowchartProperty({ property, loans, fundedByLoans, dimmed, loanRefs }, ref) {
    const getProperty = usePortfolioStore((s) => s.getProperty);

    const activeLoans = loans.filter((l) => l.status === 'active');
    const isCrossCollateral = (loan: Loan) =>
      loan.purposePropertyId && loan.purposePropertyId !== loan.propertyId;

    return (
      <div
        ref={ref}
        className={`bg-white border border-gray-300 rounded-lg overflow-hidden transition-opacity ${
          dimmed ? 'opacity-40' : ''
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 text-sm">{property.nickname}</h4>
            <p className="text-xs text-gray-500">{property.suburb}, {property.state}</p>
          </div>
          <EntityBadge entityId={property.entityId} size="sm" />
        </div>

        {/* Loans */}
        <div className="divide-y divide-gray-100">
          {activeLoans.map((loan) => {
            const cross = isCrossCollateral(loan);
            const purposeProp = cross ? getProperty(loan.purposePropertyId!) : null;

            return (
              <div
                key={loan.id}
                ref={(el) => loanRefs?.current.set(loan.id, el)}
                className={`px-4 py-2.5 text-sm ${
                  cross ? 'border-l-2 border-l-gray-400 bg-gray-50' : ''
                } ${loan.type === 'offset' ? 'text-gray-400' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-gray-600 shrink-0">
                      {loan.lender === 'Bankwest' ? 'BW' : 'MQ'} {loan.accountNumber}
                    </span>
                    <span className="font-semibold text-gray-900 shrink-0">
                      {formatCurrency(loan.currentBalance ?? loan.originalAmount)}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0">
                      {loan.type === 'offset' ? 'offset' : loan.isInterestOnly ? 'IO' : 'P&I'}
                    </span>
                    {loan.interestRate && loan.type !== 'offset' && (
                      <span className="text-xs text-gray-400 shrink-0">
                        {loan.interestRate}%
                      </span>
                    )}
                    {loan.needsConfirmation && (
                      <AlertTriangle size={12} className="text-red-600 shrink-0" />
                    )}
                  </div>
                </div>
                {cross && purposeProp && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    cash-out → {purposeProp.nickname}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Funded-by section for purpose-only properties (e.g. Lennox) */}
        {fundedByLoans && fundedByLoans.length > 0 && (
          <div className="border-t border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Funded by:</p>
            {fundedByLoans.map((loan) => {
              const securityProp = getProperty(loan.propertyId);
              return (
                <div
                  key={loan.id}
                  ref={(el) => loanRefs?.current.set(`target-${loan.id}`, el)}
                  className="text-xs text-gray-600 flex items-center gap-1 mb-1"
                >
                  <span className="text-gray-400">←</span>
                  <span className="font-mono">
                    {loan.lender === 'Bankwest' ? 'BW' : 'MQ'} {loan.accountNumber}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(loan.currentBalance ?? loan.originalAmount)}
                  </span>
                  {securityProp && (
                    <span className="text-gray-400">(secured: {securityProp.nickname})</span>
                  )}
                </div>
              );
            })}
            <div className="text-xs font-semibold text-gray-700 mt-2 pt-1 border-t border-gray-100">
              Total: {formatCurrency(
                fundedByLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0)
              )}
            </div>
          </div>
        )}

        {/* No loans and no funded-by — show "No direct loans" */}
        {activeLoans.length === 0 && (!fundedByLoans || fundedByLoans.length === 0) && (
          <div className="px-4 py-3 text-xs text-gray-400">No active loans</div>
        )}
      </div>
    );
  }
);
