import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Search, RefreshCw, FileText, Loader2, Pencil, CheckCircle, XCircle, Circle, ArrowUp, ArrowDown, Plus, X, Filter, Download, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';
import type { GlobalDocument } from '../../api/client';
import { usePortfolioStore } from '../../store/portfolioStore';
import { formatDate } from '../../utils/format';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import type { Property } from '../../types';

export interface PurposeSplit { propertyId: string; portion: number; }

export function parsePurpose(raw: string | null): PurposeSplit[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) as PurposeSplit[]; } catch { return []; }
  }
  // Legacy single-id string — no amount known
  return [{ propertyId: trimmed, portion: 0 }];
}

export function serializePurpose(splits: PurposeSplit[]): string | null {
  if (splits.length === 0) return null;
  return JSON.stringify(splits);
}

function PropSelect({ value, properties, onChange }: {
  value: string | null;
  properties: Property[];
  onChange: (val: string | null) => void;
}) {
  const options = ['', ...properties.map(p => p.id)];
  const displayFn = (v: string) => {
    if (!v) return '—';
    return properties.find(p => p.id === v)?.nickname || v;
  };
  return (
    <CustomSelect
      value={value || ''}
      options={options}
      onChange={val => onChange(val || null)}
      displayFn={displayFn}
    />
  );
}

function formatDollar(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString()}`;
}

function PurposeEditor({ raw, properties, onChange }: {
  raw: string | null;
  properties: Property[];
  onChange: (serialized: string | null) => void;
}) {
  const splits = parsePurpose(raw);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PurposeSplit[]>(splits);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Position popup and close on outside click
  useEffect(() => {
    if (!editing) return;
    setDraft(parsePurpose(raw));
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + 4, left: rect.left });
    }
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing, raw]);

  const save = (next: PurposeSplit[]) => {
    onChange(serializePurpose(next));
    setEditing(false);
  };

  const addSplit = () => {
    const used = new Set(draft.map(s => s.propertyId));
    const available = properties.find(p => !used.has(p.id));
    if (!available) return;
    setDraft([...draft, { propertyId: available.id, portion: 0 }]);
  };

  const removeSplit = (i: number) => {
    setDraft(draft.filter((_, idx) => idx !== i));
  };

  const nickname = (id: string) => properties.find(p => p.id === id)?.nickname || id;

  if (!editing) {
    return (
      <div
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        className="cursor-pointer min-h-[20px] group"
        title="Click to edit purpose"
      >
        {splits.length === 0 ? (
          <span className="text-[11px] text-gray-300 group-hover:text-gray-500">—</span>
        ) : splits.length === 1 ? (
          <span className="text-[11px] text-gray-600">{nickname(splits[0].propertyId)}{splits[0].portion > 0 ? <span className="text-gray-400"> {formatDollar(splits[0].portion)}</span> : ''}</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {splits.map((s, i) => (
              <span key={i} className="text-[11px] text-gray-600">
                {nickname(s.propertyId)} <span className="text-gray-400">{formatDollar(s.portion)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const draftTotal = draft.reduce((s, d) => s + d.portion, 0);

  return ReactDOM.createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[280px]"
      style={{ top: popupPos.top, left: popupPos.left }}
      onClick={e => e.stopPropagation()}
    >
      {draft.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1.5">
          <select
            value={s.propertyId}
            onChange={e => { const next = [...draft]; next[i] = { ...s, propertyId: e.target.value }; setDraft(next); }}
            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 flex-1"
          >
            {properties.map(p => <option key={p.id} value={p.id}>{p.nickname}</option>)}
          </select>
          <span className="text-[11px] text-gray-400">$</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={s.portion}
            onChange={e => { const next = [...draft]; next[i] = { ...s, portion: Math.max(0, Number(e.target.value) || 0) }; setDraft(next); }}
            className="text-[11px] border border-gray-200 rounded px-1 py-0.5 w-24 text-right"
          />
          <button onClick={() => removeSplit(i)} className="text-gray-400 hover:text-red-500 p-0.5"><X size={10} /></button>
        </div>
      ))}
      {draft.length > 1 && (
        <div className="text-[10px] text-gray-400 text-right pr-7 mb-1">Total: {formatDollar(draftTotal)}</div>
      )}
      <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
        <button onClick={addSplit} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-0.5"><Plus size={10} /> Split</button>
        <div className="flex gap-1">
          <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 hover:text-gray-600 px-1">Cancel</button>
          <button onClick={() => save(draft)} className="text-[11px] text-white bg-gray-700 hover:bg-gray-800 rounded px-2 py-0.5">Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CustomSelect({ value, options, onChange, displayFn }: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  displayFn?: (v: string) => string;
}) {
  const display = displayFn || ((v: string) => v.replace(/_/g, ' '));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left });
    }
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll selected item into view when opening
  useEffect(() => {
    if (open && popupRef.current) {
      const active = popupRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className="text-xs text-gray-600 cursor-pointer hover:text-gray-800 truncate py-0.5"
      >
        {display(value)} <span className="text-gray-300 text-[10px]">▾</span>
      </div>
      {open && ReactDOM.createPortal(
        <div
          ref={popupRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[300px] overflow-y-auto min-w-[180px]"
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          {options.map(opt => (
            <div
              key={opt}
              data-active={opt === value}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 ${opt === value ? 'bg-gray-50 text-gray-900 font-medium' : 'text-gray-700'}`}
            >
              {display(opt)}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function EditableCell({ value, displayValue, onSave, type = 'text' }: {
  value: string;
  displayValue?: string;
  onSave: (val: string) => void;
  type?: 'text' | 'date';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setDraft(value); setTimeout(() => inputRef.current?.focus(), 30); } }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onClick={e => e.stopPropagation()}
        className="text-xs text-gray-700 border border-gray-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-gray-400"
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      className="text-xs text-gray-500 cursor-pointer hover:text-gray-800 hover:underline decoration-dotted"
      title="Click to edit"
    >
      {displayValue || value || '—'}
    </span>
  );
}

function ColumnFilter({ values, selected, onChange, label, displayFn }: {
  values: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  label: string;
  displayFn?: (v: string) => string;
}) {
  const display = displayFn || ((v: string) => v.replace(/_/g, ' ') || '(empty)');
  const [open, setOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const isFiltered = selected.size > 0 && selected.size < values.length;

  useEffect(() => {
    if (!open) return;
    setFilterSearch('');
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Checked items first so selections are always visible
  const sortedValues = [...values].sort((a, b) => {
    const ac = selected.has(a) ? 0 : 1;
    const bc = selected.has(b) ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return display(a).localeCompare(display(b));
  });
  const filtered = filterSearch
    ? sortedValues.filter(v => display(v).toLowerCase().includes(filterSearch.toLowerCase()))
    : sortedValues;

  const toggleValue = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };

  const selectAll = () => onChange(new Set());
  const selectNone = () => onChange(new Set());

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className={`p-0.5 rounded ${isFiltered ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}
        title={`Filter ${label}`}
      >
        <Filter size={9} />
      </button>
      {open && (
        <div className="absolute top-6 left-0 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] max-w-[240px]" onClick={e => e.stopPropagation()}>
          <div className="p-1.5 border-b border-gray-100">
            <input
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-100">
            <button onClick={selectAll} className="text-[10px] text-gray-500 hover:text-gray-700">All</button>
            <button onClick={selectNone} className="text-[10px] text-gray-500 hover:text-gray-700">None</button>
            {isFiltered && (
              <span className="text-[10px] text-blue-600 ml-auto">{selected.size}/{values.length}</span>
            )}
            {!isFiltered && selected.size === 0 && (
              <span className="text-[10px] text-gray-400 ml-auto">no filter</span>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.map(v => (
              <label key={v} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(v)}
                  onChange={() => toggleValue(v)}
                  className="rounded border-gray-300 text-gray-700 w-3 h-3"
                />
                <span className="text-[11px] text-gray-700 truncate">{display(v)}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-[10px] text-gray-400 px-2 py-1">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentIndexPage() {
  const [docs, setDocs] = useState<GlobalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterProperty, setFilterProperty] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<Set<string>>(new Set());
  const [filterProvider, setFilterProvider] = useState<Set<string>>(new Set());
  const [filterVerified, setFilterVerified] = useState<Set<string>>(new Set());
  const [filterAddedVia, setFilterAddedVia] = useState<Set<string>>(new Set());
  type SortField = 'canonical_name' | 'property_id' | 'purpose_property_id' | 'provider' | 'doc_date' | 'source_type' | 'added_via' | 'created_at' | 'verified';
  const [sortField, setSortField] = useState<SortField>('doc_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const properties = usePortfolioStore(s => s.properties);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string; relativePath: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await api.globalIndex.getAll();
      setDocs(data.documents);
    } catch (err) {
      console.error('Failed to load document index:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.globalIndex.sync();
      console.log('Sync result:', result);
      await loadDocs();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const startRename = useCallback((doc: GlobalDocument) => {
    if (!doc.file_path) return;
    const filename = doc.file_path.split('/').pop() || '';
    const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
    setRenamingId(doc.id);
    setRenameDraft(filename.replace(ext, ''));
    setTimeout(() => renameInputRef.current?.select(), 50);
  }, []);

  const confirmRename = useCallback(async (doc: GlobalDocument) => {
    if (!doc.file_path || !renameDraft.trim()) { setRenamingId(null); return; }
    const filename = doc.file_path.split('/').pop() || '';
    const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
    const newFilename = renameDraft.trim() + ext;
    if (newFilename === filename) { setRenamingId(null); return; }
    setRenameSaving(true);
    try {
      await api.documents.rename(doc.file_path, newFilename);
      await loadDocs();
    } catch (err) {
      console.error('Rename failed:', err);
    } finally {
      setRenameSaving(false);
      setRenamingId(null);
    }
  }, [renameDraft]);

  const handleSecurityChange = useCallback(async (docId: string, newVal: string | null) => {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;
    await api.globalIndex.updateProperties(docId, newVal, doc.purpose_property_id);
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, property_id: newVal } : d));
  }, [docs]);

  const handlePurposeChange = useCallback(async (docId: string, serialized: string | null) => {
    const doc = docs.find(d => d.id === docId);
    if (!doc) return;
    await api.globalIndex.updateProperties(docId, doc.property_id, serialized);
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, purpose_property_id: serialized } : d));
  }, [docs]);

  const handleFieldUpdate = useCallback(async (docId: string, field: string, value: string) => {
    const val = value.trim() || null;
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, [field]: val } as GlobalDocument : d));
    await api.globalIndex.updateField(docId, field, val);
  }, []);

  const handleCycleVerified = useCallback(async (docId: string, current: number) => {
    // 0 (none) → 1 (verified) → 2 (needs attention) → 0
    const newVal = current === 0 ? 1 : current === 1 ? 2 : 0;
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, verified: newVal } : d));
    await api.globalIndex.setVerified(docId, newVal);
  }, []);

  // Derive unique values for column filters
  const uniqueProperties = useMemo(() => {
    const ids = new Set<string>();
    for (const d of docs) {
      ids.add(d.property_id || '(unlinked)');
      for (const s of parsePurpose(d.purpose_property_id)) ids.add(s.propertyId);
    }
    return [...ids].sort();
  }, [docs]);
  const uniqueTypes = useMemo(() => [...new Set(docs.map(d => d.source_type))].sort(), [docs]);
  const uniqueProviders = useMemo(() => [...new Set(docs.map(d => d.provider || '(none)'))].sort(), [docs]);
  const uniqueVerified = useMemo(() => [...new Set(docs.map(d => String(d.verified)))].sort(), [docs]);
  const uniqueAddedVia = useMemo(() => [...new Set(docs.map(d => d.added_via || 'existing'))].sort(), [docs]);

  const activeFilterCount = (filterProperty.size > 0 && filterProperty.size < uniqueProperties.length ? 1 : 0)
    + (filterType.size > 0 && filterType.size < uniqueTypes.length ? 1 : 0)
    + (filterProvider.size > 0 && filterProvider.size < uniqueProviders.length ? 1 : 0)
    + (filterVerified.size > 0 && filterVerified.size < uniqueVerified.length ? 1 : 0)
    + (filterAddedVia.size > 0 && filterAddedVia.size < uniqueAddedVia.length ? 1 : 0);

  const clearAllFilters = () => {
    setFilterProperty(new Set());
    setFilterType(new Set());
    setFilterProvider(new Set());
    setFilterVerified(new Set());
    setFilterAddedVia(new Set());
  };

  // Filter + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const propActive = filterProperty.size > 0 && filterProperty.size < uniqueProperties.length;
    const typeActive = filterType.size > 0 && filterType.size < uniqueTypes.length;
    const provActive = filterProvider.size > 0 && filterProvider.size < uniqueProviders.length;
    const verActive = filterVerified.size > 0 && filterVerified.size < uniqueVerified.length;
    const addedActive = filterAddedVia.size > 0 && filterAddedVia.size < uniqueAddedVia.length;

    return docs.filter(d => {
      if (propActive) {
        const docProp = d.property_id || '(unlinked)';
        const purposeIds = parsePurpose(d.purpose_property_id).map(s => s.propertyId);
        if (!filterProperty.has(docProp) && !purposeIds.some(id => filterProperty.has(id))) return false;
      }
      if (typeActive && !filterType.has(d.source_type)) return false;
      if (provActive && !filterProvider.has(d.provider || '(none)')) return false;
      if (verActive && !filterVerified.has(String(d.verified))) return false;
      if (addedActive && !filterAddedVia.has(d.added_via || 'existing')) return false;
      if (q) {
        const haystack = `${d.canonical_name} ${d.file_path || ''} ${d.provider || ''} ${d.source_type}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [docs, search, filterProperty, filterType, filterProvider, filterVerified, filterAddedVia, uniqueProperties, uniqueTypes, uniqueProviders, uniqueVerified, uniqueAddedVia]);

  const sorted = useMemo(() => {
    const propNickname = (id: string | null) => properties.find(p => p.id === id)?.nickname || '';
    return [...filtered].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortField) {
        case 'canonical_name': av = a.canonical_name; bv = b.canonical_name; break;
        case 'property_id': av = propNickname(a.property_id); bv = propNickname(b.property_id); break;
        case 'purpose_property_id': {
          const ap = parsePurpose(a.purpose_property_id);
          const bp = parsePurpose(b.purpose_property_id);
          av = ap.length > 0 ? propNickname(ap[0].propertyId) : '';
          bv = bp.length > 0 ? propNickname(bp[0].propertyId) : '';
          break;
        }
        case 'provider': av = a.provider || ''; bv = b.provider || ''; break;
        case 'doc_date': av = a.doc_date || ''; bv = b.doc_date || ''; break;
        case 'source_type': av = a.source_type || ''; bv = b.source_type || ''; break;
        case 'added_via': av = a.added_via || ''; bv = b.added_via || ''; break;
        case 'created_at': av = a.created_at || ''; bv = b.created_at || ''; break;
        case 'verified': av = a.verified || 0; bv = b.verified || 0; break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortDir, properties]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'doc_date' ? 'desc' : 'asc');
    }
  }, [sortField]);

  // Group by property for counts
  const propCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of docs) {
      const key = d.property_id || 'unlinked';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [docs]);

  const propName = (id: string | null) => {
    if (!id) return 'Unlinked';
    return properties.find(p => p.id === id)?.nickname || id;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-400 ml-2">Loading document index...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Document Index</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {docs.length} documents indexed
            {Object.keys(propCounts).length > 0 && (
              <> · {Object.entries(propCounts).map(([k, v]) => `${propName(k === 'unlinked' ? null : k)} (${v})`).join(', ')}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Rescan Files'}
          </button>
        </div>
      </div>

      {/* Search + filter status */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
          >
            <X size={10} />
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400 mb-2">
        {filtered.length === docs.length ? `${docs.length} documents` : `${filtered.length} of ${docs.length} documents`}
      </p>

      {/* Document table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2.5 text-center" style={{width:'3%'}}>
                <span className="inline-flex items-center gap-0.5">
                  <span className="cursor-pointer" onClick={() => toggleSort('verified')}>
                    {sortField === 'verified' ? (sortDir === 'asc' ? <ArrowUp size={10} className="text-gray-500" /> : <ArrowDown size={10} className="text-gray-500" />) : <Circle size={9} className="text-gray-300" />}
                  </span>
                  <ColumnFilter
                    values={uniqueVerified}
                    selected={filterVerified}
                    onChange={setFilterVerified}
                    label="Verified"
                  />
                </span>
              </th>
              {([
                ['canonical_name', 'Document', '26%', null],
                ['property_id', 'Security', '9%', { values: uniqueProperties, selected: filterProperty, onChange: setFilterProperty, label: 'Security', displayFn: (v: string) => v === '(unlinked)' ? '(unlinked)' : (properties.find(p => p.id === v)?.nickname || v) }],
                ['purpose_property_id', 'Purpose', '9%', null],
                ['source_type', 'Type', '11%', { values: uniqueTypes, selected: filterType, onChange: setFilterType, label: 'Type' }],
                ['provider', 'Provider', '9%', { values: uniqueProviders, selected: filterProvider, onChange: setFilterProvider, label: 'Provider' }],
                ['doc_date', 'Doc Date', '9%', null],
                ['added_via', 'Source', '8%', { values: uniqueAddedVia, selected: filterAddedVia, onChange: setFilterAddedVia, label: 'Source' }],
                ['created_at', 'Added', '9%', null],
              ] as [SortField, string, string, { values: string[]; selected: Set<string>; onChange: (s: Set<string>) => void; label: string; displayFn?: (v: string) => string } | null][]).map(([field, label, width, filter]) => (
                <th
                  key={field}
                  className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase select-none"
                  style={{width}}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="cursor-pointer hover:text-gray-600" onClick={() => toggleSort(field)}>
                      {label}
                      {sortField === field && (
                        sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                      )}
                    </span>
                    {filter && (
                      <ColumnFilter values={filter.values} selected={filter.selected} onChange={filter.onChange} label={filter.label} displayFn={filter.displayFn} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map(doc => {
              const canPreview = doc.file_path && /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(doc.file_path);
              const isRenaming = renamingId === doc.id;
              const realFilename = doc.file_path ? doc.file_path.split('/').pop() || '' : '';
              const ext = realFilename.includes('.') ? '.' + realFilename.split('.').pop() : '';
              return (
                <tr
                  key={doc.id}
                  className="border-b border-gray-100 hover:bg-gray-50 group"
                >
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); handleCycleVerified(doc.id, doc.verified || 0); }}
                      className="p-0.5"
                      title={doc.verified === 1 ? 'Verified — click for needs attention' : doc.verified === 2 ? 'Needs attention — click to clear' : 'Click to mark verified'}
                    >
                      {doc.verified === 1 ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : doc.verified === 2 ? (
                        <XCircle size={14} className="text-red-500" />
                      ) : (
                        <Circle size={14} className="text-gray-200 hover:text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="text-gray-300 shrink-0" />
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              ref={renameInputRef}
                              value={renameDraft}
                              onChange={e => setRenameDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmRename(doc);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              disabled={renameSaving}
                              className="text-sm text-gray-800 border border-gray-300 rounded px-1.5 py-0.5 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-gray-400"
                            />
                            <span className="text-xs text-gray-400">{ext}</span>
                            <button
                              onClick={() => confirmRename(doc)}
                              disabled={renameSaving}
                              className="text-[10px] px-1.5 py-0.5 bg-gray-900 text-white rounded hover:bg-gray-700"
                            >
                              {renameSaving ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setRenamingId(null)}
                              className="text-[10px] px-1.5 py-0.5 text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              {canPreview ? (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (doc.file_path) setPreviewDoc({
                                      url: api.documents.getServeUrl(doc.file_path),
                                      filename: realFilename,
                                      relativePath: doc.file_path,
                                    });
                                  }}
                                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate text-left"
                                >
                                  {doc.canonical_name}
                                </button>
                              ) : doc.file_path ? (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    const a = document.createElement('a');
                                    a.href = api.documents.getServeUrl(doc.file_path!);
                                    a.download = realFilename;
                                    a.click();
                                  }}
                                  className="text-sm text-gray-700 hover:text-gray-900 hover:underline truncate text-left"
                                  title="Download file"
                                >
                                  {doc.canonical_name}
                                </button>
                              ) : (
                                <p className="text-sm text-gray-800 truncate">{doc.canonical_name}</p>
                              )}
                              {doc.file_path && (
                                <button
                                  onClick={e => { e.stopPropagation(); startRename(doc); }}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-700 transition-opacity"
                                  title="Rename file"
                                >
                                  <Pencil size={11} />
                                </button>
                              )}
                            </div>
                            {doc.file_path && (
                              <p className="text-[11px] text-gray-400 truncate">{doc.file_path}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PropSelect value={doc.property_id} properties={properties} onChange={val => handleSecurityChange(doc.id, val)} />
                  </td>
                  <td className="px-3 py-2 relative">
                    <PurposeEditor raw={doc.purpose_property_id} properties={properties} onChange={serialized => handlePurposeChange(doc.id, serialized)} />
                  </td>
                  <td className="px-3 py-2">
                    <CustomSelect
                      value={doc.source_type || 'other'}
                      options={uniqueTypes}
                      onChange={val => handleFieldUpdate(doc.id, 'source_type', val)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={doc.provider || ''} onSave={val => handleFieldUpdate(doc.id, 'provider', val)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={doc.doc_date || ''}
                      displayValue={doc.doc_date ? formatDate(doc.doc_date) : ''}
                      onSave={val => handleFieldUpdate(doc.id, 'doc_date', val)}
                      type="date"
                    />
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-400">
                    {doc.added_via || 'existing'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-400">
                    {doc.created_at ? formatDate(doc.created_at) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length > 200 && (
          <p className="text-xs text-gray-400 text-center py-3">Showing first 200 of {sorted.length} results</p>
        )}
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No documents match your filters.</p>
        )}
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          relativePath={previewDoc.relativePath}
          onClose={() => setPreviewDoc(null)}
          onRenamed={async (newFilename, newRelativePath) => {
            setPreviewDoc({ url: api.documents.getServeUrl(newRelativePath), filename: newFilename, relativePath: newRelativePath });
            await loadDocs();
          }}
        />
      )}
    </div>
  );
}
