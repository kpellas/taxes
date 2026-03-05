import { FileText, CheckCircle2, Circle, AlertTriangle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';
import { EntityBadge } from '../common/EntityBadge';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { useState } from 'react';

export function TaxPrepPage() {
  const { entities, properties, taxDocuments, actionItems, toggleActionItem, updateDocumentStatus } = usePortfolioStore();
  const { activeEntityId } = useUIStore();
  const [activeTab, setActiveTab] = useState<string>('actions');
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  const filteredActions = activeEntityId
    ? actionItems.filter((a) => a.entityId === activeEntityId || !a.entityId)
    : actionItems;

  const filteredDocs = activeEntityId
    ? taxDocuments.filter((d) => d.entityId === activeEntityId)
    : taxDocuments;

  const missingCount = taxDocuments.filter((d) => d.status === 'missing').length;
  const partialCount = taxDocuments.filter((d) => d.status === 'partial').length;
  const providedCount = taxDocuments.filter((d) => d.status === 'provided').length;
  const totalDocs = taxDocuments.length;
  const completionPct = totalDocs > 0 ? Math.round((providedCount / totalDocs) * 100) : 0;

  const openActions = filteredActions.filter((a) => !a.completed);
  const completedActions = filteredActions.filter((a) => a.completed);

  const tabs = [
    { id: 'actions', label: `Action Items (${openActions.length} open)` },
    { id: 'documents', label: `Documents (${missingCount} missing)` },
    { id: 'summary', label: 'Tax Summary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText size={24} /> Tax Preparation
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          FY 2024-2025 (1 Jul 2024 - 30 Jun 2025). Returns due 31 March 2026.
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Document Collection Progress</span>
          <span className="text-sm font-bold text-gray-900">{completionPct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-gradient-to-r from-blue-500 to-emerald-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {providedCount} provided</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {partialCount} partial</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {missingCount} missing</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Items */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {/* Priority groups */}
          {(['high', 'medium', 'low'] as const).map((priority) => {
            const items = openActions.filter((a) => a.priority === priority);
            if (items.length === 0) return null;
            const colors = { high: 'text-red-700 bg-red-50', medium: 'text-amber-700 bg-amber-50', low: 'text-gray-600 bg-gray-50' };
            return (
              <div key={priority} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className={`px-5 py-3 ${colors[priority]}`}>
                  <h3 className="text-sm font-semibold capitalize">{priority} Priority ({items.length})</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleActionItem(item.id)}
                    >
                      <Circle size={18} className="text-gray-300 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{item.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.entityId && <EntityBadge entityId={item.entityId} />}
                          <span className="text-xs text-gray-400">{item.source}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            item.category === 'confirm' ? 'bg-amber-50 text-amber-600' :
                            item.category === 'provide' ? 'bg-blue-50 text-blue-600' :
                            item.category === 'setup' ? 'bg-violet-50 text-violet-600' :
                            'bg-gray-50 text-gray-500'
                          }`}>
                            {item.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Completed */}
          {completedActions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50 text-emerald-700">
                <h3 className="text-sm font-semibold">Completed ({completedActions.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {completedActions.map((item) => (
                  <div
                    key={item.id}
                    className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 cursor-pointer opacity-60"
                    onClick={() => toggleActionItem(item.id)}
                  >
                    <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-gray-500 line-through">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {entities.map((entity) => {
            const entityDocs = filteredDocs.filter((d) => d.entityId === entity.id);
            if (entityDocs.length === 0) return null;
            const isExpanded = expandedEntity === entity.id || expandedEntity === null;
            const missing = entityDocs.filter((d) => d.status === 'missing').length;

            return (
              <div key={entity.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setExpandedEntity(isExpanded && expandedEntity !== null ? null : entity.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entity.color }} />
                    <h3 className="text-sm font-semibold text-gray-900">{entity.displayName}</h3>
                    {missing > 0 && (
                      <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {missing} missing
                      </span>
                    )}
                  </div>
                  {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                </button>
                {isExpanded && (
                  <div className="divide-y divide-gray-50 border-t border-gray-100">
                    {entityDocs.map((doc) => {
                      const property = doc.propertyId ? properties.find((p) => p.id === doc.propertyId) : null;
                      return (
                        <div key={doc.id} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">{doc.documentType}</p>
                              {property && (
                                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {property.nickname}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>
                            {doc.notes && (
                              <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                <AlertTriangle size={10} /> {doc.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={doc.status}
                              onChange={(e) => updateDocumentStatus(doc.id, e.target.value as 'provided' | 'missing' | 'partial')}
                              className={`text-xs font-medium rounded-full px-3 py-1 appearance-none cursor-pointer border-0 ${
                                doc.status === 'provided' ? 'bg-emerald-100 text-emerald-800' :
                                doc.status === 'missing' ? 'bg-red-100 text-red-800' :
                                'bg-amber-100 text-amber-800'
                              }`}
                            >
                              <option value="provided">Provided</option>
                              <option value="partial">Partial</option>
                              <option value="missing">Missing</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tax Summary */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Kelly's Return */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Kelly's Personal Return</h3>
            <div className="divide-y divide-gray-100">
              <SummaryRow label="Employment Income (MLC Wealth)" value="$147,788" type="income" />
              <SummaryRow label="Interest Income" value="$10" type="income" />
              <SummaryRow label="Superhero Dividends" value="$408" type="income" />
              <SummaryRow label="Superhero Capital Gains (AUD)" value="$2,078" type="income" />
              <SummaryRow label="Superhero Capital Gains (USD)" value="$213" type="income" />
              <SummaryRow label="Chisholm Rental (100%)" value="$37,233" type="income" />
              <SummaryRow label="Heddon Greta Rental (50%)" value="$16,815" type="income" note="Ownership % needs confirmation" />
              <SummaryRow label="Bannerman Rental (50%)" value="$15,700" type="income" />
              <SummaryRow label="Consultancy Fee (from M2K2 Trust)" value="~$20,000" type="income" note="To be confirmed by Elizabeth" />
              <div className="py-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</p>
              </div>
              <SummaryRow label="Property Expenses (rates, insurance, PM)" value="TBD" type="expense" />
              <SummaryRow label="Loan Interest (property)" value="TBD" type="expense" note="Waiting on Bankwest statements" />
              <SummaryRow label="Depreciation" value="TBD" type="expense" />
              <SummaryRow label="Home Office (75% WFH)" value="TBD" type="expense" />
              <SummaryRow label="Donations" value="$1,083" type="expense" />
              <SummaryRow label="Professional Development" value="TBD" type="expense" />
              <SummaryRow label="Superhero Fees" value="TBD" type="expense" />
              <div className="py-3 bg-blue-50 -mx-5 px-5 mt-2 rounded-b-xl">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-blue-800">Expected Position</span>
                  <span className="text-sm font-bold text-blue-800">~$9,000 refund</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mark's Return */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Mark's Personal Return</h3>
            <div className="divide-y divide-gray-100">
              <SummaryRow label="M2K2 Trust Distribution" value="~$519,000" type="income" note="Will reduce by ~$20K (Kelly consultancy fee)" />
              <SummaryRow label="MedLife Income" value="$7,109" type="income" />
              <SummaryRow label="Heddon Greta Rental (50%)" value="$16,815" type="income" note="Ownership % needs confirmation" />
              <SummaryRow label="Bannerman Rental (50%)" value="$15,700" type="income" />
              <div className="py-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deductions</p>
              </div>
              <SummaryRow label="Super Contributions" value="$25,000" type="expense" />
              <SummaryRow label="Property Expenses (50%)" value="TBD" type="expense" />
              <SummaryRow label="Loan Interest (50%)" value="TBD" type="expense" note="Waiting on Bankwest statements" />
              <SummaryRow label="Home Office" value="TBD" type="expense" />
              <SummaryRow label="Phone (partial business use)" value="TBD" type="expense" />
              <SummaryRow label="Legal Costs (debt recovery)" value="~$4,000" type="expense" />
              <div className="py-3 bg-red-50 -mx-5 px-5 mt-2 rounded-b-xl">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-red-800">Expected Position</span>
                  <span className="text-sm font-bold text-red-800">~$50,000 payable</span>
                </div>
                <p className="text-xs text-red-600 mt-1">Division 293 applies on super contributions</p>
              </div>
            </div>
          </div>

          {/* M2K2 Trust */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              M2K2 Trust (Business)
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">Business Trust</span>
            </h3>
            <div className="divide-y divide-gray-100">
              <SummaryRow label="Consultancy Income (cash basis)" value="$513,000" type="income" />
              <SummaryRow label="Consultancy Income (accrual basis)" value="$419,000" type="income" note="$120K debtors from prior year already counted" />
              <div className="py-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expenses</p>
              </div>
              <SummaryRow label="Accounting Fees" value="Picked up" type="expense" />
              <SummaryRow label="ASIC Charges (incl. late lodgement)" value="Picked up" type="expense" />
              <SummaryRow label="Printing & Stationery" value="Picked up" type="expense" />
              <SummaryRow label="Subscriptions" value="Picked up" type="expense" />
              <SummaryRow label="Telephone" value="Picked up" type="expense" />
              <SummaryRow label="Work Cover" value="Picked up" type="expense" />
              <SummaryRow label="Insurance" value="MISSING" type="expense" note="Need business insurance details" />
              <SummaryRow label="Kelly Consultancy Fee" value="~$20,000" type="expense" note="Reduces Mark's distribution" />
              <SummaryRow label="Legal Costs" value="~$4,000" type="expense" />
              <SummaryRow label="GST Claimable" value="~$900" type="expense" />
            </div>
          </div>

          {/* Schniggle Trust */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              Schniggle Trust
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Investment Trust</span>
            </h3>
            <div className="divide-y divide-gray-100">
              <SummaryRow label="Superhero Dividends" value="$408" type="income" />
              <SummaryRow label="Superhero Capital Gain (AUD)" value="$2,078" type="income" />
              <SummaryRow label="Superhero Capital Gain (USD)" value="$213" type="income" />
              <div className="py-2.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expenses</p>
              </div>
              <SummaryRow label="Interest (capitalised)" value="Picked up" type="expense" />
              <SummaryRow label="ASIC Fees" value="TBD" type="expense" />
              <SummaryRow label="Accounting Fees" value="Via M2K2 Trust" type="expense" />
              <div className="py-3 bg-gray-50 -mx-5 px-5 mt-2 rounded-b-xl">
                <p className="text-xs text-gray-600">Bank account closing balance: $3.40. No bank fees identified.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, type, note }: { label: string; value: string; type: 'income' | 'expense'; note?: string }) {
  return (
    <div className="py-2.5 flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm text-gray-700">{label}</p>
        {note && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
            <AlertTriangle size={10} /> {note}
          </p>
        )}
      </div>
      <span className={`text-sm font-semibold ml-4 ${
        value === 'TBD' || value === 'MISSING' ? 'text-red-500' :
        type === 'income' ? 'text-emerald-600' : 'text-gray-900'
      }`}>
        {value}
      </span>
    </div>
  );
}
