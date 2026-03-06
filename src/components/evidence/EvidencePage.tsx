import { Search, RefreshCw, Home, Landmark, Shield, Users, DollarSign, AlertTriangle, Clock } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useEvidenceStore } from '../../store/evidenceStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { api } from '../../api/client';
import { ChecklistTab } from './ChecklistTab';
import { PropertyExpensesTab } from './PropertyExpensesTab';
import { PropertyTimelineTab } from './PropertyTimelineTab';
import { EntityBadge } from '../common/EntityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/format';

type Tab = 'purchase' | 'finance' | 'insurance' | 'pm' | 'expenses' | 'timeline';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'purchase', label: 'Purchase', icon: Home },
  { id: 'finance', label: 'Finance', icon: Landmark },
  { id: 'insurance', label: 'Insurance', icon: Shield },
  { id: 'pm', label: 'Property Management', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: DollarSign },
  { id: 'timeline', label: 'Timeline', icon: Clock },
];

// Event filters for each tab — types are PropertyEventType, subTypes are RecurringType
const EVENT_FILTERS: Record<Tab, { types?: string[]; subTypes?: string[] } | undefined> = {
  purchase: { types: ['due_diligence', 'purchase'] },
  finance: { types: ['refinance'], subTypes: ['loan_statement', 'purchase_finance'] },
  insurance: { types: ['insurance_renewal'], subTypes: ['insurance', 'purchase_insurance'] },
  pm: { types: ['new_tenant', 'new_pm'], subTypes: ['lease', 'rental_statement', 'purchase_pm'] },
  expenses: undefined,
  timeline: undefined,
};

// ── Property header card (like PropertyDetail) ──────────────

function PropertyHeaderCard({ propertyId, compact, onSelect }: { propertyId: string; compact?: boolean; onSelect?: () => void }) {
  const { properties, loans } = usePortfolioStore();
  const property = properties.find(p => p.id === propertyId);
  if (!property) return null;

  const propLoans = loans.filter(l => l.propertyId === property.id);
  const activeLoans = propLoans.filter(l => l.status === 'active' && l.type !== 'offset');
  const totalDebt = activeLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);

  const hasIssues = !property.depreciationScheduleAvailable
    || property.ownershipNeedsConfirmation
    || (property.status === 'active_rental' && !property.weeklyRent);

  const assumedCount = [
    property.sourceInfo,
    ...propLoans.map(l => l.sourceInfo),
  ].filter(s => s.confidence === 'assumed').length;

  // Compact version for "All Properties" grid — same detail, clickable
  if (compact) {
    return (
      <div
        onClick={onSelect}
        className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
      >
        <div className="px-5 pt-4 pb-3 flex items-start justify-between">
          <div>
            <h4 className="text-base font-bold text-slate-900">{property.nickname}</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {property.address}, {property.suburb} {property.state} {property.postcode ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <EntityBadge entityId={property.entityId} />
            <StatusBadge status={property.status} />
          </div>
        </div>

        <div className="px-5 pb-4">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 text-slate-500 w-1/6 text-xs">Ownership</td>
                <td className="py-1.5 text-slate-800 font-medium text-xs">
                  {property.ownership.map(o => `${o.name.split(' ')[0]} ${o.percentage}%`).join(' / ')}
                  {property.ownershipNeedsConfirmation && <span className="ml-1 text-[10px] text-red-500">*</span>}
                </td>
                <td className="py-1.5 text-slate-500 w-1/6 text-xs">Est. Value</td>
                <td className="py-1.5 text-slate-800 font-semibold text-xs">{property.currentValue ? formatCurrency(property.currentValue) : '—'}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500 text-xs">Rent</td>
                <td className="py-1.5 text-slate-800 font-medium text-xs">
                  {property.weeklyRent ? `$${property.weeklyRent}/wk` : (
                    property.status === 'active_rental' ? <span className="text-red-500">TBD</span> : '—'
                  )}
                </td>
                <td className="py-1.5 text-slate-500 text-xs">Annual</td>
                <td className="py-1.5 text-slate-800 font-semibold text-xs">{property.annualRent > 0 ? formatCurrency(property.annualRent) : '—'}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500 text-xs">Total Debt</td>
                <td className="py-1.5 text-slate-800 font-semibold text-xs">{totalDebt > 0 ? formatCurrency(totalDebt) : 'None'}</td>
                <td className="py-1.5 text-slate-500 text-xs">Loans</td>
                <td className="py-1.5 text-slate-800 font-medium text-xs">{activeLoans.length}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500 text-xs">Purchase</td>
                <td className="py-1.5 text-slate-800 font-medium text-xs">{property.purchasePrice ? formatCurrency(property.purchasePrice) : '—'}</td>
                <td className="py-1.5 text-slate-500 text-xs">Date</td>
                <td className="py-1.5 text-slate-800 font-medium text-xs">{property.purchaseDate ? formatDate(property.purchaseDate) : '—'}</td>
              </tr>
              {(property.landCost || property.buildCost) && (
                <tr>
                  <td className="py-1.5 text-slate-500 text-xs">Land</td>
                  <td className="py-1.5 text-slate-800 font-medium text-xs">{property.landCost ? formatCurrency(property.landCost) : '—'}</td>
                  <td className="py-1.5 text-slate-500 text-xs">Build</td>
                  <td className="py-1.5 text-slate-800 font-medium text-xs">{property.buildCost ? formatCurrency(property.buildCost) : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>

          {(hasIssues || assumedCount > 0) && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
              {assumedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <AlertTriangle size={9} /> {assumedCount} assumed
                </span>
              )}
              {property.ownershipNeedsConfirmation && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-500"><AlertTriangle size={9} /> Ownership</span>
              )}
              {!property.depreciationScheduleAvailable && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-500"><AlertTriangle size={9} /> No depreciation</span>
              )}
              {property.status === 'active_rental' && !property.weeklyRent && (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-500"><AlertTriangle size={9} /> Rent missing</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full version for single property selected
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* Title row */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{property.nickname}</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {property.address}, {property.suburb} {property.state} {property.postcode ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EntityBadge entityId={property.entityId} size="md" />
          <StatusBadge status={property.status} size="md" />
        </div>
      </div>

      {/* Key metrics table */}
      <div className="px-5 pb-4">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 text-slate-500 w-1/6">Ownership</td>
              <td className="py-2 text-slate-800 font-medium">
                {property.ownership.map(o => `${o.name} (${o.percentage}%)`).join(', ')}
                {property.ownershipNeedsConfirmation && <span className="ml-2 text-xs text-red-500">*unconfirmed</span>}
              </td>
              <td className="py-2 text-slate-500 w-1/6">Est. Value</td>
              <td className="py-2 text-slate-800 font-semibold">{property.currentValue ? formatCurrency(property.currentValue) : '—'}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-500">Rent (Weekly)</td>
              <td className="py-2 text-slate-800 font-medium">
                {property.weeklyRent ? formatCurrency(property.weeklyRent) : (
                  property.status === 'active_rental' ? <span className="text-red-500">TBD</span> : '—'
                )}
              </td>
              <td className="py-2 text-slate-500">Rent (Annual)</td>
              <td className="py-2 text-slate-800 font-semibold">{property.annualRent > 0 ? formatCurrency(property.annualRent) : '—'}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-500">Total Debt</td>
              <td className="py-2 text-slate-800 font-semibold">{totalDebt > 0 ? formatCurrency(totalDebt) : 'None'}</td>
              <td className="py-2 text-slate-500">Active Loans</td>
              <td className="py-2 text-slate-800 font-medium">{activeLoans.length}</td>
            </tr>
            {property.purchasePrice && (
              <tr>
                <td className="py-2 text-slate-500">Purchase Price</td>
                <td className="py-2 text-slate-800 font-medium">{formatCurrency(property.purchasePrice)}</td>
                <td className="py-2 text-slate-500">Purchase Date</td>
                <td className="py-2 text-slate-800 font-medium">{property.purchaseDate ? formatDate(property.purchaseDate) : '—'}</td>
              </tr>
            )}
            {(property.landCost || property.buildCost) && (
              <tr>
                <td className="py-2 text-slate-500">Land</td>
                <td className="py-2 text-slate-800 font-medium">{property.landCost ? formatCurrency(property.landCost) : '—'}</td>
                <td className="py-2 text-slate-500">Build</td>
                <td className="py-2 text-slate-800 font-medium">{property.buildCost ? formatCurrency(property.buildCost) : '—'}</td>
              </tr>
            )}
          </tbody>
        </table>

        {(assumedCount > 0 || hasIssues) && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
            {assumedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <AlertTriangle size={11} className="text-slate-400" />
                {assumedCount} items assumed — see badges for details
              </span>
            )}
            {property.ownershipNeedsConfirmation && (
              <span className="inline-flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={11} /> Ownership needs confirmation
              </span>
            )}
            {!property.depreciationScheduleAvailable && (
              <span className="inline-flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={11} /> No depreciation schedule
              </span>
            )}
            {property.status === 'active_rental' && !property.weeklyRent && (
              <span className="inline-flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle size={11} /> Rent amount missing
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────

export function EvidencePage() {
  const [activeTab, setActiveTab] = useState<Tab>('purchase');
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const { documentIndex, documentIndexLoaded, setDocumentIndex } = useEvidenceStore();
  const { properties: rawProperties, loans } = usePortfolioStore();

  // Sort properties by purchase date (earliest first)
  const properties = useMemo(() =>
    [...rawProperties].sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || '')),
    [rawProperties]
  );

  useEffect(() => {
    if (!documentIndexLoaded) {
      loadDocumentIndex();
    }
  }, [documentIndexLoaded]);

  async function loadDocumentIndex() {
    setIndexLoading(true);
    try {
      const data = await api.documents.getIndex();
      setDocumentIndex(data.documents);
    } catch (err) {
      console.error('Failed to load document index:', err);
    } finally {
      setIndexLoading(false);
    }
  }

  // Stats for header
  const totalVerified = [...properties, ...loans].filter(x => x.sourceInfo?.confidence === 'verified').length;
  const totalItems = properties.length + loans.length;
  const pctVerified = totalItems > 0 ? Math.round((totalVerified / totalItems) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Full History</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {pctVerified}% verified.
            {documentIndexLoaded && ` ${documentIndex.length} source docs indexed.`}
          </p>
        </div>
        <button
          onClick={loadDocumentIndex}
          disabled={indexLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={12} className={indexLoading ? 'animate-spin' : ''} />
          {indexLoading ? 'Scanning...' : 'Rescan Docs'}
        </button>
      </div>

      {/* Property filter pills */}
      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActivePropertyId(null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
            activePropertyId === null
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All Properties
        </button>
        {properties.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePropertyId(p.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              activePropertyId === p.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.nickname}
          </button>
        ))}
      </div>

      {/* Property header card(s) */}
      {activePropertyId ? (
        <PropertyHeaderCard propertyId={activePropertyId} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {properties
            .filter(p => p.status !== 'deposit_paid' || p.id === 'lennox')
            .map(p => (
              <PropertyHeaderCard
                key={p.id}
                propertyId={p.id}
                compact
                onSelect={() => setActivePropertyId(p.id)}
              />
            ))}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
          />
        </div>
        {activeTab !== 'expenses' && activeTab !== 'timeline' && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={showGapsOnly}
              onChange={(e) => setShowGapsOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Gaps only
          </label>
        )}
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 flex overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-gray-700 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      {activeTab === 'timeline' ? (
        <PropertyTimelineTab propertyFilter={activePropertyId} />
      ) : activeTab === 'expenses' ? (
        <PropertyExpensesTab searchQuery={searchQuery} propertyFilter={activePropertyId} />
      ) : (
        <ChecklistTab
          searchQuery={searchQuery}
          propertyFilter={activePropertyId}
          eventFilter={EVENT_FILTERS[activeTab]}
          showGapsOnly={showGapsOnly}
          tab={activeTab}
        />
      )}
    </div>
  );
}
