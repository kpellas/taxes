import { Search, RefreshCw, ClipboardList, Shield, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useEvidenceStore } from '../../store/evidenceStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { api } from '../../api/client';
import { EvidenceTab } from './EvidenceTab';
import { ChecklistTab } from './ChecklistTab';
import { PropertyExpensesTab } from './PropertyExpensesTab';

type Tab = 'checklist' | 'evidence' | 'expenses';

const TABS: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'checklist', label: 'Document Checklist', icon: ClipboardList },
  { id: 'evidence', label: 'Evidence', icon: Shield },
  { id: 'expenses', label: 'Property Expenses', icon: DollarSign },
];

export function EvidencePage() {
  const [activeTab, setActiveTab] = useState<Tab>('checklist');
  const [searchQuery, setSearchQuery] = useState('');
  const [indexLoading, setIndexLoading] = useState(false);
  const { documentIndex, documentIndexLoaded, setDocumentIndex } = useEvidenceStore();
  const { properties, loans } = usePortfolioStore();

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
  const totalVerified = [...properties, ...loans].filter(x => x.sourceInfo.confidence === 'verified').length;
  const totalItems = properties.length + loans.length;
  const pctVerified = totalItems > 0 ? Math.round((totalVerified / totalItems) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Evidence & Documents</h2>
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

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search documents, properties, facts..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
        />
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 flex">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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

      {/* Active tab */}
      {activeTab === 'checklist' && <ChecklistTab searchQuery={searchQuery} />}
      {activeTab === 'evidence' && <EvidenceTab searchQuery={searchQuery} />}
      {activeTab === 'expenses' && <PropertyExpensesTab searchQuery={searchQuery} />}
    </div>
  );
}
