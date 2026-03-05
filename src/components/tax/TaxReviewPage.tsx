import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useTaxReviewStore } from '../../store/taxReviewStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import type { TaxReturn, TaxReturnLineItem } from '../../types';

const FY_OPTIONS = ['2019-20', '2020-21', '2021-22', '2022-23', '2023-24'];

function fmt(n: number): string {
  const abs = Math.abs(n);
  const str = abs >= 1000
    ? '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '$' + abs;
  return n < 0 ? `(${str})` : str;
}

export function TaxReviewPage() {
  const { returns } = useTaxReviewStore();
  const properties = usePortfolioStore((s) => s.properties);
  const [activeFY, setActiveFY] = useState(FY_OPTIONS[FY_OPTIONS.length - 1]);

  const kellyReturn = returns.find((r) => r.financialYear === activeFY && r.personName === 'Kelly Pellas');
  const markReturn = returns.find((r) => r.financialYear === activeFY && r.personName === 'Mark Pellas');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Tax Return Review</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Actual figures from lodged returns. Pink rows = known discrepancy.
        </p>
      </div>

      {/* Year tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {FY_OPTIONS.map((fy) => {
            const hasData = returns.some((r) => r.financialYear === fy);
            const hasIssues = returns
              .filter(r => r.financialYear === fy)
              .flatMap(r => r.lineItems)
              .some(li => li.discrepancy != null && li.discrepancy !== 0);
            return (
              <button
                key={fy}
                onClick={() => setActiveFY(fy)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeFY === fy
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                FY {fy}
                {hasIssues && <span className="ml-1.5 w-2 h-2 rounded-full bg-pink-300 inline-block -mt-0.5" />}
                {hasData && !hasIssues && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard person="Kelly" ret={kellyReturn} />
        <SummaryCard person="Mark" ret={markReturn} />
      </div>

      {/* Rental Properties breakdown */}
      <RentalBreakdown
        kellyReturn={kellyReturn}
        markReturn={markReturn}
        properties={properties}
        activeFY={activeFY}
      />

      {/* Full line item detail */}
      <div className="grid grid-cols-2 gap-4">
        <ReturnDetail title="Kelly" ret={kellyReturn} properties={properties} />
        <ReturnDetail title="Mark" ret={markReturn} properties={properties} />
      </div>
    </div>
  );
}

// ─── Summary Card ───

function SummaryCard({ person, ret }: { person: string; ret?: TaxReturn }) {
  if (!ret) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-700">{person}</p>
        <p className="text-xs text-gray-400 mt-1">No return data for this year.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm font-semibold text-gray-700">{person}</p>
      <div className="grid grid-cols-3 gap-4 mt-3">
        <div>
          <p className="text-xs text-gray-400">Income</p>
          <p className="text-lg font-bold text-gray-900 font-mono">{fmt(ret.totalIncome ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Deductions</p>
          <p className="text-lg font-bold text-gray-900 font-mono">{fmt(ret.totalDeductions ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Taxable</p>
          <p className="text-lg font-bold text-gray-900 font-mono">{fmt(ret.taxableIncome ?? 0)}</p>
        </div>
      </div>
      {ret.refundOrPayable != null && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {ret.refundOrPayable >= 0 ? 'Refund' : 'Tax Payable'}
          </p>
          <p className={`text-sm font-bold font-mono ${ret.refundOrPayable >= 0 ? 'text-gray-700' : 'text-gray-700'}`}>
            {fmt(Math.abs(ret.refundOrPayable))}
          </p>
        </div>
      )}
      {ret.notes && (
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">{ret.notes}</p>
      )}
    </div>
  );
}

// ─── Rental Properties Breakdown ───

function RentalBreakdown({
  kellyReturn, markReturn, properties, activeFY,
}: {
  kellyReturn?: TaxReturn;
  markReturn?: TaxReturn;
  properties: { id: string; nickname: string }[];
  activeFY: string;
}) {
  const allItems = [
    ...(kellyReturn?.lineItems ?? []),
    ...(markReturn?.lineItems ?? []),
  ];
  const rentalItems = allItems.filter(li =>
    li.category === 'rental_income' || li.category === 'rental_interest' ||
    li.category === 'rental_depreciation' || li.category === 'rental_other'
  );

  const propertyIds = [...new Set(rentalItems.map(li => li.propertyId).filter(Boolean))] as string[];

  if (propertyIds.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-700">Rental Properties — FY {activeFY}</p>
        <p className="text-xs text-gray-400 mt-1">No rental properties on returns this year.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">Rental Properties — FY {activeFY}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
            <th className="text-left px-5 py-2 font-medium">Property</th>
            <th className="text-left px-3 py-2 font-medium">Item</th>
            <th className="text-right px-3 py-2 font-medium">Kelly</th>
            <th className="text-right px-3 py-2 font-medium">Mark</th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {propertyIds.map((propId) => {
            const prop = properties.find(p => p.id === propId);
            const name = prop?.nickname ?? propId;

            const kellyItems = kellyReturn?.lineItems.filter(li => li.propertyId === propId) ?? [];
            const markItems = markReturn?.lineItems.filter(li => li.propertyId === propId) ?? [];

            const kRent = kellyItems.find(li => li.category === 'rental_income');
            const mRent = markItems.find(li => li.category === 'rental_income');
            const kInterest = kellyItems.find(li => li.category === 'rental_interest');
            const mInterest = markItems.find(li => li.category === 'rental_interest');
            const kDeprec = kellyItems.find(li => li.category === 'rental_depreciation');
            const mDeprec = markItems.find(li => li.category === 'rental_depreciation');
            const kOther = kellyItems.find(li => li.category === 'rental_other');
            const mOther = markItems.find(li => li.category === 'rental_other');

            const kTotal = (kRent?.amountLodged ?? 0) - (kInterest?.amountLodged ?? 0) - (kDeprec?.amountLodged ?? 0) - (kOther?.amountLodged ?? 0);
            const mTotal = (mRent?.amountLodged ?? 0) - (mInterest?.amountLodged ?? 0) - (mDeprec?.amountLodged ?? 0) - (mOther?.amountLodged ?? 0);

            const hasDiscrepancy = kellyItems.some(li => li.discrepancy) || markItems.some(li => li.discrepancy);
            const rowTint = hasDiscrepancy ? 'bg-pink-50/60' : '';

            function renderRow(label: string, kItem?: TaxReturnLineItem, mItem?: TaxReturnLineItem, isIncome = false, showPropName = false) {
              const kVal = kItem?.amountLodged ?? 0;
              const mVal = mItem?.amountLodged ?? 0;
              const total = kVal + mVal;

              return (
                <tr key={`${propId}-${label}`} className={`${rowTint} border-b border-gray-50 hover:bg-gray-50/80`}>
                  {showPropName ? (
                    <td className="px-5 py-2 font-medium text-gray-900">{name}</td>
                  ) : (
                    <td className="px-5 py-2" />
                  )}
                  <td className="px-3 py-2 text-gray-600">{label}</td>
                  <td className={`px-3 py-2 text-right font-mono ${kVal === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                    {kVal === 0 ? '—' : isIncome ? fmt(kVal) : `(${fmt(kVal)})`}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${mVal === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                    {mVal === 0 ? '—' : isIncome ? fmt(mVal) : `(${fmt(mVal)})`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-500">
                    {total === 0 ? '—' : isIncome ? fmt(total) : `(${fmt(total)})`}
                  </td>
                </tr>
              );
            }

            return (
              <tbody key={propId}>
                {renderRow('Gross Rent', kRent, mRent, true, true)}
                {renderRow('Interest', kInterest, mInterest)}
                {renderRow('Depreciation', kDeprec, mDeprec)}
                {renderRow('Other Expenses', kOther, mOther)}
                <tr className={`${rowTint} border-b-2 border-gray-200 font-semibold`}>
                  <td className="px-5 py-2" />
                  <td className="px-3 py-2 text-gray-700">Net Result</td>
                  <td className={`px-3 py-2 text-right font-mono ${kTotal < 0 ? 'text-gray-700' : 'text-gray-700'}`}>
                    {kTotal === 0 ? '—' : fmt(kTotal)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${mTotal < 0 ? 'text-gray-700' : 'text-gray-700'}`}>
                    {mTotal === 0 ? '—' : fmt(mTotal)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-gray-700`}>
                    {fmt(kTotal + mTotal)}
                  </td>
                </tr>
              </tbody>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Return Detail (collapsible full line item list) ───

function ReturnDetail({ title, ret, properties }: {
  title: string;
  ret?: TaxReturn;
  properties: { id: string; nickname: string }[];
}) {
  const [expanded, setExpanded] = useState(true);

  if (!ret) return null;

  const incomeItems = ret.lineItems.filter(li => li.section === 'income');
  const deductionItems = ret.lineItems.filter(li => li.section === 'deduction');

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 border-b border-gray-100"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-sm font-semibold text-gray-700">{title} — All Line Items</span>
        </div>
        <span className="text-xs text-gray-400">{ret.lineItems.length} items</span>
      </button>

      {expanded && (
        <div>
          <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Income</p>
          </div>
          {incomeItems.map((li) => (
            <LineItem key={li.id} item={li} />
          ))}

          <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Deductions</p>
          </div>
          {deductionItems.map((li) => (
            <LineItem key={li.id} item={li} />
          ))}
        </div>
      )}
    </div>
  );
}

function LineItem({ item }: { item: TaxReturnLineItem }) {
  const hasDisc = item.discrepancy != null && item.discrepancy !== 0;

  return (
    <div className={`flex items-center gap-2 px-5 py-2 text-sm border-b border-gray-50 ${hasDisc ? 'bg-pink-50/60' : ''}`}>
      <div className="flex-1 min-w-0">
        <span className="text-gray-800">{item.label}</span>
      </div>
      <div className="w-24 text-right font-mono text-gray-700">
        {item.section === 'deduction' ? `(${fmt(item.amountLodged)})` : fmt(item.amountLodged)}
      </div>
    </div>
  );
}
