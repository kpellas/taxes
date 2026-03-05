import { ArrowLeft, AlertTriangle, DollarSign, ArrowLeftRight, Clock, FolderOpen } from 'lucide-react';
import { EntityBadge } from '../common/EntityBadge';
import { StatusBadge } from '../common/StatusBadge';
import { SourceBadge, SourceSummary } from '../common/SourceBadge';
import { LoanChain } from '../loans/LoanChain';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency, formatDate } from '../../utils/format';
import { useState } from 'react';
import type { DocumentCategory } from '../../types';

type Tab = 'financials' | 'loans' | 'timeline' | 'documents';

const docCategoryLabels: Record<DocumentCategory, string> = {
  loan: 'Loan Documents', insurance: 'Insurance', management: 'Property Management',
  rates: 'Rates & Tax', settlement: 'Settlement & Purchase', valuation: 'Valuations',
  tax: 'Tax Documents', correspondence: 'Correspondence', other: 'Other',
};

export function PropertyDetail() {
  const { properties, loans, entities, getTimelineForProperty, getDocumentsForProperty, updatePropertyDocStatus } = usePortfolioStore();
  const { activePropertyId, setActivePage } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('financials');

  const property = properties.find((p) => p.id === activePropertyId);
  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Property not found</p>
        <button onClick={() => setActivePage('properties')} className="text-slate-700 underline mt-2 text-sm">Back to properties</button>
      </div>
    );
  }

  const entity = entities.find((e) => e.id === property.entityId);
  const propLoans = loans.filter((l) => l.propertyId === property.id);
  const activeLoans = propLoans.filter((l) => l.status === 'active' && l.type !== 'offset');
  const totalDebt = activeLoans.reduce((sum, l) => sum + (l.currentBalance ?? l.originalAmount), 0);
  const timeline = getTimelineForProperty(property.id);
  const propDocs = getDocumentsForProperty(property.id);
  const missingDocs = propDocs.filter((d) => d.status === 'missing');
  const assumedCount = [
    property.sourceInfo,
    ...propLoans.map(l => l.sourceInfo),
    ...timeline.map(t => t.sourceInfo),
    ...propDocs.map(d => d.sourceInfo),
  ].filter(s => s.confidence === 'assumed').length;

  const tabs: { id: Tab; label: string; icon: typeof DollarSign; count?: number }[] = [
    { id: 'financials', label: 'Financials', icon: DollarSign },
    { id: 'loans', label: 'Loans', icon: ArrowLeftRight, count: propLoans.length },
    { id: 'timeline', label: 'Timeline', icon: Clock, count: timeline.length },
    { id: 'documents', label: 'Documents', icon: FolderOpen, count: propDocs.length },
  ];

  const docsByCategory = propDocs.reduce((acc, doc) => {
    if (!acc[doc.category]) acc[doc.category] = [];
    acc[doc.category].push(doc);
    return acc;
  }, {} as Record<string, typeof propDocs>);

  return (
    <div className="space-y-5">
      <button onClick={() => setActivePage('properties')} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600">
        <ArrowLeft size={14} /> Back
      </button>

      {/* Header */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{property.nickname}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{property.address}, {property.suburb} {property.state} {property.postcode ?? ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <EntityBadge entityId={property.entityId} size="md" />
            <StatusBadge status={property.status} size="md" />
          </div>
        </div>

        {/* Key metrics table */}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2 text-slate-500 w-1/6">Ownership</td>
              <td className="py-2 text-slate-800 font-medium">
                {property.ownership.map((o) => `${o.name} (${o.percentage}%)`).join(', ')}
                {property.ownershipNeedsConfirmation && <span className="ml-2 text-xs text-amber-600">*unconfirmed</span>}
              </td>
              <td className="py-2 text-slate-500 w-1/6">Est. Value</td>
              <td className="py-2 text-slate-800 font-semibold">{property.currentValue ? formatCurrency(property.currentValue) : '-'}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-500">Rent (Weekly)</td>
              <td className="py-2 text-slate-800 font-medium">{property.weeklyRent ? formatCurrency(property.weeklyRent) : '-'}</td>
              <td className="py-2 text-slate-500">Rent (Annual)</td>
              <td className="py-2 text-slate-800 font-semibold">{property.annualRent > 0 ? formatCurrency(property.annualRent) : '-'}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-500">Total Debt</td>
              <td className="py-2 text-slate-800 font-semibold">{formatCurrency(totalDebt)}</td>
              <td className="py-2 text-slate-500">Active Loans</td>
              <td className="py-2 text-slate-800 font-medium">{activeLoans.length}</td>
            </tr>
            {property.purchasePrice && (
              <tr>
                <td className="py-2 text-slate-500">Purchase Price</td>
                <td className="py-2 text-slate-800 font-medium">{formatCurrency(property.purchasePrice)}</td>
                <td className="py-2 text-slate-500">Purchase Date</td>
                <td className="py-2 text-slate-800 font-medium">{property.purchaseDate ? formatDate(property.purchaseDate) : '-'}</td>
              </tr>
            )}
            {(property.landCost || property.buildCost) && (
              <tr>
                <td className="py-2 text-slate-500">Land</td>
                <td className="py-2 text-slate-800 font-medium">{property.landCost ? formatCurrency(property.landCost) : '-'}</td>
                <td className="py-2 text-slate-500">Build</td>
                <td className="py-2 text-slate-800 font-medium">{property.buildCost ? formatCurrency(property.buildCost) : '-'}</td>
              </tr>
            )}
          </tbody>
        </table>

        {assumedCount > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <AlertTriangle size={13} className="text-slate-400" />
            <span className="text-xs text-slate-500">{assumedCount} items assumed — see badges for details</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.count !== undefined && <span className="text-xs text-slate-400 ml-0.5">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* FINANCIALS TAB */}
      {activeTab === 'financials' && (
        <div className="bg-white rounded-lg border border-slate-200">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Financial Summary</h3>
            <SourceBadge sourceInfo={property.sourceInfo} />
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-50">
              <Row label="Management Company" value={property.managementCompany ?? 'TBD'} />
              <Row label="Management Fee" value={property.managementFeePercent ? `${property.managementFeePercent}% + GST` : '-'} />
              <Row label="Insurance (Annual)" value={property.insuranceAnnual ? formatCurrency(property.insuranceAnnual) : 'MISSING'} warn={!property.insuranceAnnual} />
              <Row label="Council Rates" value={property.councilRatesAnnual ? formatCurrency(property.councilRatesAnnual) : '-'} />
              <Row label="Water Rates" value={property.waterRatesAnnual ? formatCurrency(property.waterRatesAnnual) : '-'} />
              <Row label="Depreciation Schedule" value={property.depreciationScheduleAvailable ? 'Available' : 'Not available'} />
            </tbody>
          </table>
          {property.notes && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400 font-medium mb-1">Notes</p>
              <p className="text-xs text-slate-600">{property.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* LOANS TAB */}
      {activeTab === 'loans' && (
        <div className="space-y-4">
          <SourceSummary items={propLoans} />
          <LoanChain property={property} loans={propLoans} />
        </div>
      )}

      {/* TIMELINE TAB — table format */}
      {activeTab === 'timeline' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Property Timeline</h3>
            <SourceSummary items={timeline} />
          </div>
          {timeline.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">No timeline events.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium w-24">Date</th>
                  <th className="text-left px-4 py-2 font-medium w-24">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Event</th>
                  <th className="text-right px-4 py-2 font-medium w-28">Amount</th>
                  <th className="text-left px-4 py-2 font-medium w-24">Lender</th>
                  <th className="text-left px-4 py-2 font-medium w-20">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {timeline.map((event) => {
                  const isFuture = event.date > new Date().toISOString().slice(0, 7);
                  return (
                    <tr key={event.id} className={`${isFuture ? 'opacity-40' : ''} hover:bg-slate-50`}>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{event.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{event.type}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-slate-800 font-medium">{event.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{event.description}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">{event.amount ? formatCurrency(event.amount) : '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{event.lender ?? '-'}</td>
                      <td className="px-4 py-2.5"><SourceBadge sourceInfo={event.sourceInfo} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DOCUMENTS TAB — table format */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>{propDocs.filter(d => d.status === 'provided').length} provided</span>
            <span>{propDocs.filter(d => d.status === 'partial').length} partial</span>
            <span className={missingDocs.length > 0 ? 'text-amber-700 font-medium' : ''}>{missingDocs.length} missing</span>
            <div className="ml-auto"><SourceSummary items={propDocs} /></div>
          </div>

          {Object.entries(docsByCategory).map(([category, docs]) => (
            <div key={category} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{docCategoryLabels[category as DocumentCategory] || category} ({docs.length})</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Document</th>
                    <th className="text-left px-4 py-2 font-medium w-28">Provider</th>
                    <th className="text-left px-4 py-2 font-medium w-24">Date</th>
                    <th className="text-left px-4 py-2 font-medium w-20">Source</th>
                    <th className="text-center px-4 py-2 font-medium w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {docs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="text-slate-800 font-medium">{doc.name}</p>
                        {doc.description && <p className="text-xs text-slate-400">{doc.description}</p>}
                        {doc.notes && <p className="text-xs text-amber-600 mt-0.5">{doc.notes}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{doc.provider ?? '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{doc.date ?? '-'}</td>
                      <td className="px-4 py-2.5"><SourceBadge sourceInfo={doc.sourceInfo} /></td>
                      <td className="px-4 py-2.5 text-center">
                        <select
                          value={doc.status}
                          onChange={(e) => updatePropertyDocStatus(doc.id, e.target.value as 'provided' | 'missing' | 'partial')}
                          className={`text-xs font-medium rounded px-2 py-1 border-0 cursor-pointer ${
                            doc.status === 'provided' ? 'bg-slate-100 text-slate-600' :
                            doc.status === 'missing' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}
                        >
                          <option value="provided">Provided</option>
                          <option value="partial">Partial</option>
                          <option value="missing">Missing</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <tr>
      <td className="px-5 py-2.5 text-slate-500 w-1/3">{label}</td>
      <td className={`px-5 py-2.5 font-medium ${warn ? 'text-amber-700' : 'text-slate-800'}`}>{value}</td>
    </tr>
  );
}
