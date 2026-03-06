import { CheckCircle, AlertTriangle, HelpCircle, FileText, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { useState } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useEvidenceStore } from '../../store/evidenceStore';
import { useChatStore } from '../../store/chatStore';
import { api } from '../../api/client';
import type { DataConfidence } from '../../types';
import { DocumentLinks } from './DocumentLinks';
import { UploadButton } from './UploadButton';
import { NotesPopover } from './NotesPopover';

type Filter = 'all' | 'verified' | 'from_transcript' | 'assumed' | 'missing_docs';

type EvidenceSection = 'purchase_settlement' | 'loans_finance' | 'insurance' | 'property_management' | 'rates_levies' | 'tax_depreciation';

const SECTION_CONFIG: { key: EvidenceSection; label: string; categories: string[] }[] = [
  { key: 'purchase_settlement', label: 'Purchase & Settlement', categories: ['Property'] },
  { key: 'loans_finance', label: 'Loans & Finance', categories: ['Loan'] },
  { key: 'insurance', label: 'Insurance', categories: ['Insurance'] },
  { key: 'property_management', label: 'Property Management', categories: ['Management'] },
  { key: 'rates_levies', label: 'Rates & Levies', categories: ['Rates'] },
  { key: 'tax_depreciation', label: 'Tax & Depreciation', categories: ['Tax'] },
];

function ConfidenceIcon({ confidence }: { confidence: DataConfidence }) {
  switch (confidence) {
    case 'verified': return <CheckCircle size={12} className="text-gray-400" />;
    case 'from_transcript': return <FileText size={12} className="text-gray-400" />;
    case 'assumed': return <AlertTriangle size={12} className="text-red-500" />;
    case 'user_provided': return <CheckCircle size={12} className="text-gray-400" />;
    default: return <HelpCircle size={12} className="text-red-500" />;
  }
}

function confidenceBadgeClass(confidence: DataConfidence): string {
  if (confidence === 'assumed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

interface EvidenceItem {
  id: string;
  property: string;
  propertyId: string;
  category: string;
  fact: string;
  confidence: DataConfidence;
  source: string;
  needsDoc?: string;
  assumptionReason?: string;
  accountNumbers?: string[];
  lenderKeywords?: string[];
}

interface EvidenceTabProps {
  searchQuery: string;
  propertyFilter?: string | null;
}

export function EvidenceTab({ searchQuery, propertyFilter }: EvidenceTabProps) {
  const { properties, loans, propertyDocuments } = usePortfolioStore();
  const attachments = useEvidenceStore((s) => s.attachments);
  const documentIndex = useEvidenceStore((s) => s.documentIndex);
  const { setOpen: setChatOpen, setPropertyContext } = useChatStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  // Build evidence items
  const items: EvidenceItem[] = [];

  const filteredProperties = propertyFilter ? properties.filter(p => p.id === propertyFilter) : properties;
  const filteredLoans = propertyFilter ? loans.filter(l => l.propertyId === propertyFilter) : loans;

  for (const p of filteredProperties) {
    items.push({
      id: `prop-${p.id}`,
      property: p.nickname,
      propertyId: p.id,
      category: 'Property',
      fact: `${p.nickname} — ${p.address}, ${p.suburb}. Ownership: ${p.ownership.map(o => `${o.name} ${o.percentage}%`).join(', ')}`,
      confidence: p.sourceInfo.confidence,
      source: p.sourceInfo.source,
      needsDoc: p.sourceInfo.assumptionReason,
      assumptionReason: p.sourceInfo.assumptionReason,
    });
  }

  for (const l of filteredLoans) {
    const prop = properties.find(p => p.id === l.propertyId);
    const lenderName = l.lender.toLowerCase();
    const lenderKeywords = [lenderName, lenderName.replace(/\s+/g, '')];
    items.push({
      id: `loan-${l.id}`,
      property: prop?.nickname ?? l.propertyId,
      propertyId: l.propertyId,
      category: 'Loan',
      fact: `${l.lender} #${l.accountNumber} — ${l.purpose}${l.currentBalance ? ` (bal: $${l.currentBalance.toLocaleString()})` : l.originalAmount ? ` ($${l.originalAmount.toLocaleString()})` : ''}`,
      confidence: l.sourceInfo.confidence,
      source: l.sourceInfo.source,
      needsDoc: l.sourceInfo.assumptionReason,
      assumptionReason: l.sourceInfo.assumptionReason,
      accountNumbers: [l.accountNumber],
      lenderKeywords,
    });
  }

  const missingDocs = propertyDocuments.filter(d => d.status === 'missing');

  const counts = {
    verified: items.filter(i => i.confidence === 'verified').length,
    from_transcript: items.filter(i => i.confidence === 'from_transcript').length,
    assumed: items.filter(i => i.confidence === 'assumed').length,
    user_provided: items.filter(i => i.confidence === 'user_provided').length,
    missing_docs: missingDocs.length,
  };
  const total = items.length;

  let filtered = filter === 'all' ? items
    : filter === 'missing_docs' ? items
    : items.filter(i => i.confidence === filter);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      i.fact.toLowerCase().includes(q) ||
      i.source.toLowerCase().includes(q) ||
      i.property.toLowerCase().includes(q)
    );
  }

  // Group by property
  const byProperty = new Map<string, EvidenceItem[]>();
  for (const item of filtered) {
    const list = byProperty.get(item.propertyId) || [];
    list.push(item);
    byProperty.set(item.propertyId, list);
  }

  function handleAskAbout(item: EvidenceItem) {
    setPropertyContext(item.propertyId);
    setChatOpen(true);
  }

  function renderItem(item: EvidenceItem) {
    const itemAttachments = attachments[item.id] || [];
    return (
      <tr key={item.id} className={`hover:bg-gray-50 ${item.confidence === 'assumed' ? 'bg-red-50/30' : ''}`}>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-medium ${confidenceBadgeClass(item.confidence)}`}>
            <ConfidenceIcon confidence={item.confidence} />
            {item.confidence === 'verified' ? 'OK' : item.confidence === 'assumed' ? '!' : '~'}
          </span>
        </td>
        <td className="px-4 py-2.5 text-gray-700">
          {item.fact}
          <DocumentLinks
            propertyId={item.propertyId}
            accountNumbers={item.accountNumbers}
            lenderKeywords={item.lenderKeywords}
          />
          {itemAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {itemAttachments.map(att => (
                <a
                  key={att.id}
                  href={api.upload.getServeUrl(att.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs border border-gray-200"
                >
                  <Upload size={8} />
                  <span className="max-w-[100px] truncate">{att.originalName}</span>
                </a>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-2.5">
          {item.confidence === 'assumed' && item.assumptionReason ? (
            <div className="rounded p-1.5 border border-red-100 bg-red-50/50">
              <p className="text-red-700 font-medium text-xs">Needs:</p>
              <p className="text-red-600 text-xs">{item.assumptionReason}</p>
            </div>
          ) : (
            <p className="text-gray-400 truncate text-xs" title={item.source}>{item.source}</p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1">
            {item.confidence === 'assumed' && (
              <UploadButton evidenceItemId={item.id} propertyId={item.propertyId} />
            )}
            <NotesPopover evidenceItemId={item.id} />
            <button
              onClick={() => handleAskAbout(item)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-gray-400 border border-gray-200 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              title="Ask AI about this"
            >
              ?
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['all', `All (${total})`],
          ['assumed', `Needs Evidence (${counts.assumed})`],
          ['from_transcript', `From Transcript (${counts.from_transcript})`],
          ['verified', `Verified (${counts.verified})`],
          ['missing_docs', `Missing Docs (${counts.missing_docs})`],
        ] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              filter === f ? 'border-gray-700 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Missing docs section */}
      {filter === 'missing_docs' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-red-700">Documents Still Needed</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Property</th>
                <th className="text-left px-4 py-2 font-medium">Document</th>
                <th className="text-left px-4 py-2 font-medium">Why</th>
                <th className="text-left px-4 py-2 font-medium">Provider</th>
                <th className="text-left px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {missingDocs.map((doc) => {
                const prop = properties.find(p => p.id === doc.propertyId);
                const docAttachments = attachments[`doc-${doc.id}`] || [];
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{prop?.nickname ?? 'General'}</td>
                    <td className="px-4 py-2.5">
                      <p className="text-gray-800 font-medium">{doc.name}</p>
                      {doc.description && <p className="text-xs text-gray-400">{doc.description}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{doc.notes ?? doc.description}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{doc.provider ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <UploadButton evidenceItemId={`doc-${doc.id}`} propertyId={doc.propertyId} />
                        {docAttachments.length > 0 && (
                          <span className="text-xs text-gray-600 font-medium">{docAttachments.length} uploaded</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Evidence items by property, grouped by section */}
      {filter !== 'missing_docs' && Array.from(byProperty.entries()).map(([propertyId, propItems]) => {
        const prop = properties.find(p => p.id === propertyId);
        const isExpanded = expandedProperty === propertyId || expandedProperty === null;
        const propAssumed = propItems.filter(i => i.confidence === 'assumed').length;
        const propDocs = documentIndex.filter(d => d.propertyId === propertyId);

        // Group items by section
        const sectionItems = new Map<EvidenceSection, EvidenceItem[]>();
        for (const item of propItems) {
          const section = SECTION_CONFIG.find(s => s.categories.includes(item.category));
          const key = section?.key ?? 'purchase_settlement';
          const list = sectionItems.get(key) || [];
          list.push(item);
          sectionItems.set(key, list);
        }

        return (
          <div key={propertyId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedProperty(expandedProperty === propertyId ? null : propertyId)}
              className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                <h3 className="text-sm font-semibold text-gray-700">{prop?.nickname ?? propertyId}</h3>
                <span className="text-xs text-gray-400">{propItems.length} items</span>
                {propDocs.length > 0 && (
                  <span className="text-xs text-gray-400">{propDocs.length} source docs</span>
                )}
              </div>
              {propAssumed > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle size={11} /> {propAssumed} need evidence
                </span>
              )}
            </button>

            {isExpanded && (
              <div>
                {SECTION_CONFIG.map(section => {
                  const sItems = sectionItems.get(section.key);
                  if (!sItems || sItems.length === 0) return null;
                  return (
                    <div key={section.key}>
                      <div className="px-5 py-1.5 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.label}</p>
                      </div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-50">
                          {sItems.map(item => renderItem(item))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
