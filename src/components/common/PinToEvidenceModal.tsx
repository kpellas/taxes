import { useState, useEffect } from 'react';
import { X, Pin, Check, Loader2 } from 'lucide-react';
import { api, type GapAnalysis, type GapResultItem } from '../../api/client';
import { usePortfolioStore } from '../../store/portfolioStore';

interface PinToEvidenceModalProps {
  onClose: () => void;
  /** Pre-fill context from the chat/research result */
  context: {
    title: string;
    source_type: 'email' | 'note' | 'upload';
    source_ref: string;
    content?: string;
    date?: string;
    provider?: string;
    property_id?: string;
  };
}

export function PinToEvidenceModal({ onClose, context }: PinToEvidenceModalProps) {
  const { properties, loans } = usePortfolioStore();
  const [gaps, setGaps] = useState<Map<string, GapAnalysis>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [selectedProperty, setSelectedProperty] = useState<string>(context.property_id || '');

  const activeProperties = properties
    .filter(p => p.status !== 'deposit_paid' || p.id === 'lennox')
    .sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || ''));

  // Load gaps for the selected property
  useEffect(() => {
    if (!selectedProperty) {
      setLoading(false);
      return;
    }

    const loadGaps = async () => {
      setLoading(true);
      const property = properties.find(p => p.id === selectedProperty);
      const isHL = !!(property?.landCost && property?.buildCost);
      const propLoans = loans.filter(l => l.propertyId === selectedProperty);

      // Fetch gaps for each event type
      const eventTypes = ['purchase', 'purchase_finance', 'insurance_renewal', 'new_pm', 'new_tenant', 'annual'];

      // Add refinance events
      const refinanced = propLoans.filter(l => l.refinancedToId);
      const refiContexts = refinanced.map(old => {
        const newLoan = loans.find(l => l.id === old.refinancedToId);
        return {
          eventType: 'refinance',
          lenderFrom: old.lender,
          lenderTo: newLoan?.lender,
          loanId: newLoan?.id,
        };
      });

      const results = new Map<string, GapAnalysis>();

      const promises = eventTypes.map(async (et) => {
        const gap = await api.globalIndex.gaps(selectedProperty, et, { isHL });
        if (gap.results.some(r => r.missing)) {
          results.set(et, gap);
        }
      });

      // Add refinance gaps
      for (const rc of refiContexts) {
        promises.push(
          api.globalIndex.gaps(selectedProperty, 'refinance', {
            lenderFrom: rc.lenderFrom,
            lenderTo: rc.lenderTo,
            loanId: rc.loanId,
          }).then(gap => {
            if (gap.results.some(r => r.missing)) {
              const key = `refinance-${rc.lenderFrom}-${rc.lenderTo}`;
              results.set(key, gap);
            }
          })
        );
      }

      await Promise.all(promises);
      setGaps(results);
      setLoading(false);
    };

    loadGaps();
  }, [selectedProperty, properties, loans]);

  const handlePin = async (template: GapResultItem['template']) => {
    setSaving(template.id);
    try {
      await api.globalIndex.add({
        canonical_name: context.title,
        category: template.category,
        provider: context.provider,
        doc_date: context.date,
        source_type: context.source_type,
        source_ref: context.source_ref,
        property_id: selectedProperty,
        metadata: {
          content: context.content,
          pinned_from: 'chat',
          satisfies_template: template.id,
        },
        links: [
          { link_type: 'property', link_id: selectedProperty },
          { link_type: 'template', link_id: template.id },
        ],
      });
      setSaved(prev => new Set(prev).add(template.id));
    } catch (err) {
      console.error('Failed to pin:', err);
    } finally {
      setSaving(null);
    }
  };

  const EVENT_LABELS: Record<string, string> = {
    purchase: 'Purchase',
    purchase_finance: 'Purchase Finance',
    refinance: 'Refinance',
    insurance_renewal: 'Insurance',
    new_pm: 'Property Management',
    new_tenant: 'Tenant / Lease',
    annual: 'Annual',
  };

  const missingCount = Array.from(gaps.values()).reduce(
    (sum, g) => sum + g.results.filter(r => r.missing).length, 0
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pin size={14} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-800">Pin to Evidence</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Source preview */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Source</p>
          <p className="text-sm text-gray-800 font-medium truncate">{context.title}</p>
          <p className="text-xs text-gray-400 truncate">{context.source_ref}</p>
        </div>

        {/* Property selector */}
        <div className="px-5 py-3 border-b border-gray-100">
          <select
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="">Select property...</option>
            {activeProperties.map(p => (
              <option key={p.id} value={p.id}>{p.nickname} — {p.address}</option>
            ))}
          </select>
        </div>

        {/* Missing docs list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-gray-400" />
              <span className="text-xs text-gray-400 ml-2">Loading gaps...</span>
            </div>
          ) : !selectedProperty ? (
            <p className="text-xs text-gray-400 text-center py-8">Select a property to see missing documents</p>
          ) : missingCount === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No missing documents for this property</p>
          ) : (
            <div className="space-y-4">
              {Array.from(gaps.entries()).map(([key, gap]) => {
                const missingResults = gap.results.filter(r => r.missing);
                if (missingResults.length === 0) return null;

                const label = key.startsWith('refinance-')
                  ? `Refinance: ${key.replace('refinance-', '').replace('-', ' → ')}`
                  : EVENT_LABELS[key] || key;

                return (
                  <div key={key}>
                    <h3 className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-1.5">
                      {label}
                    </h3>
                    <div className="space-y-1">
                      {missingResults.map(r => (
                        <div
                          key={r.template.id}
                          className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 border border-gray-100"
                        >
                          <div>
                            <p className="text-sm text-gray-700">{r.template.name}</p>
                            {r.template.description && (
                              <p className="text-xs text-gray-400">{r.template.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handlePin(r.template)}
                            disabled={saving === r.template.id || saved.has(r.template.id)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              saved.has(r.template.id)
                                ? 'bg-gray-100 text-gray-400'
                                : 'bg-gray-800 text-white hover:bg-gray-700'
                            }`}
                          >
                            {saving === r.template.id ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : saved.has(r.template.id) ? (
                              <span className="flex items-center gap-1"><Check size={10} /> Pinned</span>
                            ) : (
                              'Pin here'
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
