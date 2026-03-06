import { CheckCircle, MinusCircle, ChevronDown, ChevronRight, FileText, Plus, Trash2, Search, ExternalLink, Pin, Pencil } from 'lucide-react';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useEvidenceStore } from '../../store/evidenceStore';
import { api } from '../../api/client';
import type { IndexedDocument, GlobalDocument, DocumentTemplate } from '../../api/client';
import { generatePropertyEvents, generateFileEvents } from '../../data/documentChecklist';
import type { DocRequirement, PropertyEvent } from '../../data/documentChecklist';
import { UploadButton } from './UploadButton';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { formatCurrency, formatDate } from '../../utils/format';
import type { Property, Loan } from '../../types';

// ── Renameable document chip ──
function RenameableDocChip({ doc, onPreview, onRenamed }: {
  doc: GlobalDocument;
  onPreview: (url: string, filename: string, relativePath?: string) => void;
  onRenamed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const realFilename = doc.file_path ? doc.file_path.split('/').pop() || doc.canonical_name : doc.canonical_name;
  const ext = realFilename.includes('.') ? '.' + realFilename.split('.').pop() : '';

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Pre-fill with the filename without extension
    setDraft(realFilename.replace(/\.[^.]+$/, ''));
    setEditing(true);
  };

  const commitRename = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !doc.file_path) { setEditing(false); return; }
    const newFilename = trimmed + ext;
    if (newFilename === realFilename) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.documents.rename(doc.file_path, newFilename);
      onRenamed?.();
    } catch (err: any) {
      alert(err.message || 'Rename failed');
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded text-xs border border-blue-400">
        <FileText size={9} className="shrink-0 text-gray-400" />
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={commitRename}
          disabled={saving}
          className="bg-transparent outline-none text-gray-700 min-w-[200px]"
        />
        <span className="text-gray-400">{ext}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 group/chip">
      <button
        onClick={() => doc.file_path && onPreview(
          api.documents.getServeUrl(doc.file_path),
          realFilename,
          doc.file_path,
        )}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-white text-gray-500 rounded-l text-xs hover:bg-gray-100 hover:text-gray-700 border border-gray-200 border-r-0 cursor-pointer transition-colors"
        title={doc.file_path || doc.source_ref || ''}
      >
        <FileText size={9} className="shrink-0" />
        <span className="truncate max-w-[250px]">{doc.canonical_name}</span>
      </button>
      {doc.file_path && (
        <button
          onClick={startRename}
          className="inline-flex items-center px-1 py-0.5 bg-white text-gray-300 rounded-r text-xs hover:bg-gray-100 hover:text-gray-700 border border-gray-200 cursor-pointer transition-colors"
          title="Rename file"
        >
          <Pencil size={9} />
        </button>
      )}
    </span>
  );
}

// ── Gap result from global index ──
interface GapItem {
  template: DocumentTemplate;
  matched: GlobalDocument[];
  missing: boolean;
}

/** Map a PropertyEvent to its gap analysis key (matches batch API key format) */
function getGapKey(event: PropertyEvent): string | null {
  if (event.fileGroup) return null;
  if (event.type === 'refinance' && event.lenderFrom && event.lenderTo) {
    return `refinance-${event.lenderFrom}-${event.lenderTo}`;
  }
  if (event.subType === 'purchase_finance') return 'purchase_finance';
  if (event.subType === 'purchase_insurance') return 'insurance_renewal';
  if (event.subType === 'purchase_pm') return 'new_pm';
  if (event.type === 'purchase' && !event.subType) return 'purchase';
  if (event.type === 'insurance_renewal') return 'insurance_renewal';
  if (event.type === 'new_tenant') return 'new_tenant';
  if (event.type === 'new_pm') return 'new_pm';
  if (event.type === 'annual') return 'annual';
  return null; // due_diligence and others fall back to old matching
}

// ── Editable cell ────────────────────────────────────────────

type CellType = 'text' | 'currency' | 'number' | 'date' | 'percent' | 'select';

function EditableCell({
  value,
  displayValue,
  type = 'text',
  onSave,
  className = '',
  options,
  warn,
}: {
  value: string | number | boolean | undefined | null;
  displayValue?: string;
  type?: CellType;
  onSave: (val: string) => void;
  className?: string;
  options?: { value: string; label: string }[];
  warn?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const startEdit = useCallback(() => {
    // For editing, show raw value without formatting
    if (type === 'currency') {
      setDraft(value != null && value !== '' ? String(value) : '');
    } else if (type === 'percent') {
      setDraft(value != null && value !== '' ? String(value) : '');
    } else if (type === 'date') {
      // Convert display date back to YYYY-MM-DD for input
      setDraft(value != null ? String(value) : '');
    } else {
      setDraft(value != null ? String(value) : '');
    }
    setEditing(true);
  }, [value, type]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current && type !== 'select') {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, [editing, type]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    // Don't save if nothing changed
    const rawOld = value != null ? String(value) : '';
    if (trimmed === rawOld) return;
    onSave(trimmed);
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }, [commit]);

  if (editing) {
    if (type === 'select' && options) {
      return (
        <td className={`px-1.5 py-1 ${className}`}>
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={e => { setDraft(e.target.value); }}
            onBlur={commit}
            className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </td>
      );
    }
    return (
      <td className={`px-1.5 py-1 ${className}`}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type === 'date' ? 'date' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          style={{ minWidth: type === 'date' ? 130 : type === 'currency' ? 90 : 60 }}
        />
      </td>
    );
  }

  const shown = displayValue ?? (value != null && value !== '' ? String(value) : '—');
  return (
    <td
      className={`px-4 py-3 text-xs cursor-pointer hover:bg-blue-50/50 transition-colors ${warn ? 'text-red-500' : 'text-gray-700'} ${className}`}
      onClick={startEdit}
      title="Click to edit"
    >
      {shown}
    </td>
  );
}

interface ChecklistTabProps {
  searchQuery: string;
  propertyFilter?: string | null;
  eventFilter?: { types?: string[]; subTypes?: string[] };
  showGapsOnly?: boolean;
  tab?: 'purchase' | 'finance' | 'insurance' | 'pm' | 'expenses';
}

// ── Matching logic ───────────────────────────────────────────

function findMatchingFiles(
  doc: DocRequirement,
  propDocs: IndexedDocument[],
  event: PropertyEvent,
): IndexedDocument[] {
  if (!doc.matchPattern) return [];
  const pat = new RegExp(doc.matchPattern, 'i');
  const folderPat = doc.folderScope ? new RegExp(doc.folderScope, 'i') : null;

  return propDocs.filter(d => {
    if (!pat.test(d.filename)) return false;
    if (folderPat && !folderPat.test(d.relativePath)) return false;
    if (event.type === 'refinance') {
      const pathLower = d.relativePath.toLowerCase();
      if (event.lenderTo && doc.name.includes(event.lenderTo)) {
        const kw = event.lenderTo.toLowerCase();
        return pathLower.includes(kw) || pathLower.includes(kw.replace(/\s+/g, ''));
      }
      if (event.lenderFrom && doc.name.includes(event.lenderFrom)) {
        const kw = event.lenderFrom.toLowerCase();
        return pathLower.includes(kw) || pathLower.includes(kw.replace(/\s+/g, ''));
      }
    }
    return true;
  }).slice(0, 5);
}

// ── Event data row: contextual columns per event type ────────

function EventDataCells({ event, property, loans, tab }: {
  event: PropertyEvent;
  property: Property;
  loans: Loan[];
  tab?: string;
}) {
  const updateProperty = usePortfolioStore(s => s.updateProperty);
  const updateLoan = usePortfolioStore(s => s.updateLoan);
  const propLoans = loans.filter(l => l.propertyId === property.id);

  const saveProp = useCallback((field: string, raw: string, type: 'string' | 'number' = 'string') => {
    if (type === 'number') {
      const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      updateProperty(property.id, { [field]: raw === '' ? undefined : (isNaN(num) ? undefined : num) });
    } else {
      updateProperty(property.id, { [field]: raw || undefined });
    }
  }, [property.id, updateProperty]);

  const saveLoan = useCallback((loanId: string, field: string, raw: string, type: 'string' | 'number' | 'boolean' = 'string') => {
    if (type === 'number') {
      const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      updateLoan(loanId, { [field]: raw === '' ? undefined : (isNaN(num) ? undefined : num) });
    } else if (type === 'boolean') {
      updateLoan(loanId, { [field]: raw === 'true' || raw === 'IO' });
    } else {
      updateLoan(loanId, { [field]: raw || undefined });
    }
  }, [updateLoan]);

  // Purchase tab — Due Diligence
  if (tab === 'purchase' && event.type === 'due_diligence') {
    return (
      <>
        <EditableCell value={property.development} className="text-slate-700" onSave={v => saveProp('development', v)} />
        <EditableCell value={property.propertyType} className="text-slate-700" onSave={v => saveProp('propertyType', v)} />
        <EditableCell value={property.suburb} className="text-slate-700" onSave={v => saveProp('suburb', v)} />
        <EditableCell value={property.council} className="text-slate-700" onSave={v => saveProp('council', v)} />
        <EditableCell value={property.landCost} type="currency" className="text-slate-700 font-medium" displayValue={property.landCost ? formatCurrency(property.landCost) : '—'} onSave={v => saveProp('landCost', v, 'number')} />
        <EditableCell value={property.buildCost} type="currency" className="text-slate-700 font-medium" displayValue={property.buildCost ? formatCurrency(property.buildCost) : '—'} onSave={v => saveProp('buildCost', v, 'number')} />
        <EditableCell value={property.purchasePrice} type="currency" className="text-slate-800 font-semibold" displayValue={property.purchasePrice ? formatCurrency(property.purchasePrice) : '—'} onSave={v => saveProp('purchasePrice', v, 'number')} />
        <EditableCell value={property.projectedRent} type="number" className="text-slate-700" displayValue={property.projectedRent ? `$${property.projectedRent}/wk` : '—'} onSave={v => saveProp('projectedRent', v, 'number')} />
        <EditableCell value={property.projectedValue} type="currency" className="text-slate-700" displayValue={property.projectedValue ? formatCurrency(property.projectedValue) : '—'} onSave={v => saveProp('projectedValue', v, 'number')} />
      </>
    );
  }

  // Purchase tab — Purchase event
  if (tab === 'purchase' && event.type === 'purchase' && !event.subType) {
    return (
      <>
        <EditableCell value={property.address} className="text-slate-700" onSave={v => saveProp('address', v)} />
        <EditableCell value={property.purchaseDate} type="date" className="text-slate-700" displayValue={property.purchaseDate ? formatDate(property.purchaseDate) : '—'} onSave={v => saveProp('purchaseDate', v)} />
        <EditableCell value={property.purchasePrice} type="currency" className="text-slate-800 font-semibold" displayValue={property.purchasePrice ? formatCurrency(property.purchasePrice) : '—'} onSave={v => saveProp('purchasePrice', v, 'number')} />
        <EditableCell value={property.landCost} type="currency" className="text-slate-700" displayValue={property.landCost ? formatCurrency(property.landCost) : '—'} onSave={v => saveProp('landCost', v, 'number')} />
        <EditableCell value={property.buildCost} type="currency" className="text-slate-700" displayValue={property.buildCost ? formatCurrency(property.buildCost) : '—'} onSave={v => saveProp('buildCost', v, 'number')} />
        <EditableCell value={property.deposit} type="currency" className="text-slate-700" displayValue={property.deposit ? formatCurrency(property.deposit) : '—'} onSave={v => saveProp('deposit', v, 'number')} />
        <EditableCell value={property.stampDuty} type="currency" className="text-slate-700" displayValue={property.stampDuty ? formatCurrency(property.stampDuty) : '—'} onSave={v => saveProp('stampDuty', v, 'number')} />
        <td className="px-3 py-2.5 text-xs text-slate-700">
          {property.ownership.map(o => `${o.name.split(' ')[0]} ${o.percentage}%`).join(', ')}
        </td>
        <EditableCell value={property.lot} className="text-slate-700" onSave={v => saveProp('lot', v)} />
        <EditableCell value={property.lotSize} className="text-slate-700" onSave={v => saveProp('lotSize', v)} />
      </>
    );
  }

  // Finance tab — handled separately (renders multiple rows)
  if (tab === 'finance') {
    return null;
  }

  // Insurance tab
  if (tab === 'insurance') {
    return (
      <>
        <EditableCell value={property.insuranceProvider} className="text-slate-700" warn={!property.insuranceProvider} onSave={v => saveProp('insuranceProvider', v)} />
        <EditableCell value={property.insuranceAnnual} type="currency" className="text-slate-800 font-semibold" displayValue={property.insuranceAnnual ? formatCurrency(property.insuranceAnnual) : '—'} warn={!property.insuranceAnnual} onSave={v => saveProp('insuranceAnnual', v, 'number')} />
        <EditableCell value={property.insuranceRenewalDate} type="date" className="text-slate-700" displayValue={property.insuranceRenewalDate ? formatDate(property.insuranceRenewalDate) : '—'} warn={!property.insuranceRenewalDate} onSave={v => saveProp('insuranceRenewalDate', v)} />
      </>
    );
  }

  // PM tab
  if (tab === 'pm') {
    return (
      <>
        <EditableCell value={property.managementCompany} className="text-slate-700" warn={!property.managementCompany} onSave={v => saveProp('managementCompany', v)} />
        <EditableCell value={property.managementFeePercent} type="percent" className="text-slate-700" displayValue={property.managementFeePercent ? `${property.managementFeePercent}%` : '—'} onSave={v => saveProp('managementFeePercent', v, 'number')} />
        <EditableCell value={property.weeklyRent} type="number" className="text-slate-700" displayValue={property.weeklyRent ? `$${property.weeklyRent}/wk` : '—'} onSave={v => saveProp('weeklyRent', v, 'number')} />
        <EditableCell value={property.leaseStart} type="date" className="text-slate-700" displayValue={property.leaseStart ? formatDate(property.leaseStart) : '—'} onSave={v => saveProp('leaseStart', v)} />
        <EditableCell value={property.leaseEnd} type="date" className="text-slate-700" displayValue={property.leaseEnd ? formatDate(property.leaseEnd) : '—'} warn={!property.leaseEnd} onSave={v => saveProp('leaseEnd', v)} />
      </>
    );
  }

  // Fallback: single summary cell
  return (
    <td className="px-3 py-2.5 text-xs text-slate-500" colSpan={99}>{event.summary ?? ''}</td>
  );
}

// ── Finance loan rows (multiple loans per event) ─────────────

function FinanceLoanRows({ event, property, loans, allProperties, onRenamed }: {
  event: PropertyEvent;
  property: Property;
  loans: Loan[];
  allProperties: Property[];
  onRenamed?: () => void;
}) {
  const updateLoan = usePortfolioStore(s => s.updateLoan);
  const addLoan = usePortfolioStore(s => s.addLoan);
  const deleteLoanStore = usePortfolioStore(s => s.deleteLoan);
  const propLoans = loans.filter(l => l.propertyId === property.id);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDocFinder, setShowDocFinder] = useState(false);
  const [finderDocs, setFinderDocs] = useState<GlobalDocument[]>([]);
  const [finderSearch, setFinderSearch] = useState('');
  const [finderPreview, setFinderPreview] = useState<{ url: string; filename: string; relativePath?: string } | null>(null);
  const [finderLoading, setFinderLoading] = useState(false);

  // Load property loan docs when finder opens
  useEffect(() => {
    if (showDocFinder && finderDocs.length === 0) {
      setFinderLoading(true);
      api.globalIndex.getAll().then(data => {
        const propDocs = data.documents.filter((d: GlobalDocument) =>
          d.property_id === property.id && d.category === 'loan'
        );
        setFinderDocs(propDocs);
      }).catch(() => {}).finally(() => setFinderLoading(false));
    }
  }, [showDocFinder, property.id, finderDocs.length]);

  const saveLoan = useCallback((loanId: string, field: string, raw: string, type: 'string' | 'number' | 'boolean' = 'string') => {
    if (type === 'number') {
      const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      updateLoan(loanId, { [field]: raw === '' ? undefined : (isNaN(num) ? undefined : num) });
    } else if (type === 'boolean') {
      updateLoan(loanId, { [field]: raw === 'true' || raw === 'IO' });
    } else {
      updateLoan(loanId, { [field]: raw || undefined });
    }
  }, [updateLoan]);

  const handleAdd = useCallback(() => {
    const id = `loan-${Date.now()}`;
    const base: Loan = {
      id,
      entityId: property.entityId,
      propertyId: property.id,
      lender: event.lenderTo || '',
      accountNumber: '',
      type: 'investment',
      status: 'active',
      originalAmount: 0,
      isInterestOnly: true,
      purpose: '',
      notes: `event:${event.id}`,
      sourceInfo: { confidence: 'user_provided', source: 'Manual entry' },
    };

    addLoan(base);
    return id;
  }, [addLoan, property, event]);

  /** Create a loan pre-filled from a GlobalDocument's metadata */
  const handleAddFromDoc = useCallback((doc: GlobalDocument) => {
    const id = `loan-${Date.now()}`;
    const meta = doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : {} as Record<string, unknown>;
    const accountNumbers: string[] = (meta.accountNumbers as string[]) || [];

    // Parse amount from canonical_name, e.g. "$515K" or "$515,000"
    let amount = 0;
    const amountMatch = doc.canonical_name.match(/\$([0-9,.]+)\s*[Kk]/);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, '')) * 1000;
    } else {
      const rawMatch = doc.canonical_name.match(/\$([0-9,]+)/);
      if (rawMatch) amount = parseFloat(rawMatch[1].replace(/,/g, ''));
    }

    const base: Loan = {
      id,
      entityId: property.entityId,
      propertyId: property.id,
      lender: doc.provider || '',
      accountNumber: accountNumbers[0] || '',
      type: 'investment',
      status: 'active',
      originalAmount: amount,
      isInterestOnly: true,
      startDate: doc.doc_date || undefined,
      purpose: '',
      notes: `event:${event.id}`,
      sourceInfo: { confidence: 'user_provided', source: `Extracted from: ${doc.canonical_name}` },
    };

    addLoan(base);
    // Also link the document to this loan
    api.globalIndex.addLink(doc.id, 'loan', id).catch(() => {});
    setShowDocFinder(false);
  }, [addLoan, property, event]);

  const handleDelete = useCallback((id: string) => {
    deleteLoanStore(id);
    setConfirmDeleteId(null);
  }, [deleteLoanStore]);

  // Determine which loans to show for this event
  // Loans tagged with `notes: "event:<id>"` always appear under that specific event
  const taggedLoans = propLoans.filter(l => l.notes === `event:${event.id}`);
  let relevantLoans: Loan[] = [];
  if (event.subType === 'purchase_finance') {
    relevantLoans = propLoans
      .filter(l =>
        !l.notes?.startsWith('event:') &&
        !l.refinancedFromId &&
        l.type !== 'offset' &&
        (!l.purposePropertyId || l.purposePropertyId === property.id)
      )
      .sort((a, b) => (b.originalAmount ?? 0) - (a.originalAmount ?? 0));
  } else if (event.type === 'refinance') {
    for (const old of propLoans) {
      if (!old.refinancedToId) continue;
      const expectedId = `${property.id}-refi-${old.id}-${old.refinancedToId}`;
      if (expectedId === event.id) {
        const newLoan = loans.find(l => l.id === old.refinancedToId);
        if (newLoan) relevantLoans = [newLoan];
        break;
      }
    }
  }
  // Append any manually-tagged loans for this event
  for (const tl of taggedLoans) {
    if (!relevantLoans.some(l => l.id === tl.id)) relevantLoans.push(tl);
  }

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'refinanced', label: 'Refinanced' },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <tbody className="divide-y divide-gray-100">
      {relevantLoans.length === 0 && (
        <tr><td className="px-4 py-3 text-xs text-gray-500" colSpan={16}>No loan data</td></tr>
      )}
      {relevantLoans.map(loan => {
        const isActive = loan.status === 'active';
        const securityProp = allProperties.find(p => p.id === loan.propertyId);
        const securityDisplay = loan.security || securityProp?.nickname || loan.propertyId;
        const purposeProp = loan.purposePropertyId ? allProperties.find(p => p.id === loan.purposePropertyId) : null;
        const purposeDisplay = purposeProp ? `${loan.purpose} (${purposeProp.nickname})` : loan.purpose;

        return (
          <tr key={loan.id} className={`hover:bg-gray-50 ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
            <EditableCell value={loan.lender} className={isActive ? 'font-medium text-gray-900' : ''} onSave={v => saveLoan(loan.id, 'lender', v)} />
            <EditableCell value={loan.accountNumber} className="font-mono text-gray-900" onSave={v => saveLoan(loan.id, 'accountNumber', v)} />
            <EditableCell value={purposeDisplay} className="text-gray-900" onSave={v => saveLoan(loan.id, 'purpose', v)} />
            <EditableCell
              value={loan.isInterestOnly ? 'IO' : 'P&I'}
              type="select"
              className="text-gray-900"
              options={[{ value: 'IO', label: 'IO' }, { value: 'P&I', label: 'P&I' }]}
              onSave={v => saveLoan(loan.id, 'isInterestOnly', v === 'IO' ? 'true' : 'false', 'boolean')}
            />
            <EditableCell value={loan.originalAmount} type="currency" className={`text-right ${isActive ? 'font-semibold text-gray-900' : ''}`} displayValue={formatCurrency(loan.originalAmount)} onSave={v => saveLoan(loan.id, 'originalAmount', v, 'number')} />
            <EditableCell value={loan.valuation} type="currency" className="text-right text-gray-800" displayValue={loan.valuation ? formatCurrency(loan.valuation) : '—'} onSave={v => saveLoan(loan.id, 'valuation', v, 'number')} />
            <EditableCell value={loan.lvr} type="percent" className="text-right text-gray-800" displayValue={loan.lvr ? `${loan.lvr.toFixed(0)}%` : (loan.valuation && loan.originalAmount ? `${((loan.originalAmount / loan.valuation) * 100).toFixed(0)}%` : '—')} onSave={v => saveLoan(loan.id, 'lvr', v, 'number')} />
            <EditableCell value={loan.interestRate} type="percent" className="text-right text-gray-800" displayValue={loan.interestRate ? `${loan.interestRate.toFixed(2)}%` : '—'} onSave={v => saveLoan(loan.id, 'interestRate', v, 'number')} />
            <EditableCell
              value={loan.status}
              type="select"
              className="text-gray-800"
              options={statusOptions}
              onSave={v => saveLoan(loan.id, 'status', v)}
            />
            <EditableCell value={loan.security || securityDisplay} className="text-gray-800" onSave={v => saveLoan(loan.id, 'security', v)} />
            <EditableCell value={loan.broker} className="text-gray-800" onSave={v => saveLoan(loan.id, 'broker', v)} />
            <EditableCell value={loan.startDate} type="date" className="font-mono text-gray-800" displayValue={loan.startDate ? formatDate(loan.startDate) : '—'} onSave={v => saveLoan(loan.id, 'startDate', v)} />
            <EditableCell value={loan.closedDate || loan.endDate} type="date" className="font-mono text-gray-800" displayValue={loan.closedDate ? formatDate(loan.closedDate) : loan.endDate ? formatDate(loan.endDate) : '—'} onSave={v => saveLoan(loan.id, 'closedDate', v)} />
            <EditableCell value={loan.lmi} type="currency" className="text-right text-gray-800" displayValue={loan.lmi ? formatCurrency(loan.lmi) : '—'} onSave={v => saveLoan(loan.id, 'lmi', v, 'number')} />
            <EditableCell value={loan.loanFees} type="currency" className="text-right text-gray-800" displayValue={loan.loanFees ? formatCurrency(loan.loanFees) : '—'} onSave={v => saveLoan(loan.id, 'loanFees', v, 'number')} />
            <td className="px-2 py-3 text-center whitespace-nowrap">
              {confirmDeleteId === loan.id ? (
                <span className="inline-flex items-center gap-1">
                  <button onClick={() => handleDelete(loan.id)} className="text-[10px] text-red-600 hover:text-red-800 font-medium">Yes</button>
                  <span className="text-gray-300">/</span>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-gray-500 hover:text-gray-700">No</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(loan.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  title="Delete loan"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </td>
          </tr>
        );
      })}
      {/* Add loan + Browse docs */}
      <tr>
        <td colSpan={16} className="px-4 py-2">
          <div className="flex items-center gap-4">
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus size={12} />
              Add blank loan
            </button>
            <button
              onClick={() => setShowDocFinder(!showDocFinder)}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Search size={12} />
              {showDocFinder ? 'Hide docs' : 'Add loan from document'}
            </button>
          </div>
        </td>
      </tr>
      {/* Inline document finder */}
      {showDocFinder && (
        <tr>
          <td colSpan={16} className="px-4 pb-3">
            <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  value={finderSearch}
                  onChange={e => setFinderSearch(e.target.value)}
                  placeholder={`Search loan docs for ${property.nickname}...`}
                  className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                  autoFocus
                />
                <span className="text-[10px] text-gray-400 shrink-0">
                  {finderDocs.length} docs
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {finderLoading && (
                  <p className="text-xs text-gray-400 px-3 py-4 text-center">Loading...</p>
                )}
                {!finderLoading && finderDocs.length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-4 text-center">No loan documents found for {property.nickname}</p>
                )}
                {finderDocs
                  .filter(d => {
                    if (!finderSearch) return true;
                    const q = finderSearch.toLowerCase();
                    return `${d.canonical_name} ${d.provider || ''} ${d.file_path || ''}`.toLowerCase().includes(q);
                  })
                  .map(doc => {
                    const realFilename = doc.file_path ? doc.file_path.split('/').pop() || doc.canonical_name : doc.canonical_name;
                    const meta = doc.metadata ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : {} as Record<string, unknown>;
                    const accts = ((meta.accountNumbers as string[]) || []).join(', ');
                    return (
                      <div key={doc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white transition-colors group">
                        <button
                          onClick={() => doc.file_path && setFinderPreview({
                            url: api.documents.getServeUrl(doc.file_path),
                            filename: realFilename,
                            relativePath: doc.file_path,
                          })}
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                        >
                          <FileText size={13} className="text-gray-300 shrink-0 group-hover:text-gray-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 truncate">{doc.canonical_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {doc.provider && <span className="text-[10px] text-gray-500 font-medium">{doc.provider}</span>}
                              {accts && <span className="text-[10px] text-gray-400 font-mono">{accts}</span>}
                              {doc.doc_date && <span className="text-[10px] text-gray-400">{doc.doc_date.split('T')[0]}</span>}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => handleAddFromDoc(doc)}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors"
                          title="Create a new loan pre-filled from this document"
                        >
                          <Plus size={10} />
                          Create loan
                        </button>
                        <button
                          onClick={() => doc.file_path && setFinderPreview({
                            url: api.documents.getServeUrl(doc.file_path),
                            filename: realFilename,
                            relativePath: doc.file_path,
                          })}
                          className="shrink-0 p-1"
                          title="Preview document"
                        >
                          <ExternalLink size={11} className="text-gray-300 group-hover:text-blue-500" />
                        </button>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </td>
        </tr>
      )}
      {finderPreview && (
        <DocumentPreviewModal
          url={finderPreview.url}
          filename={finderPreview.filename}
          relativePath={finderPreview.relativePath}
          onClose={() => setFinderPreview(null)}
          onRenamed={(newFilename, newRelativePath) => {
            setFinderPreview({ url: api.documents.getServeUrl(newRelativePath), filename: newFilename, relativePath: newRelativePath });
            onRenamed?.();
          }}
        />
      )}
    </tbody>
  );
}

// ── Editable header cell ──────────────────────────────────────

function EditableHeader({ defaultName, className }: { defaultName: string; className: string }) {
  const customHeaders = useEvidenceStore(s => s.customHeaders);
  const renameHeader = useEvidenceStore(s => s.renameHeader);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = customHeaders[defaultName] || defaultName;

  const startEdit = () => {
    setDraft(displayName);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const val = draft.trim();
    if (val && val !== defaultName) {
      renameHeader(defaultName, val);
    } else if (!val || val === defaultName) {
      // Reset to default
      renameHeader(defaultName, defaultName);
    }
  };

  if (editing) {
    return (
      <th className={className}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-full bg-white border border-blue-300 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
          style={{ minWidth: 40 }}
        />
      </th>
    );
  }

  return (
    <th className={`${className} cursor-pointer hover:text-blue-700`} onClick={startEdit} title="Click to rename">
      {displayName}
    </th>
  );
}

// ── Editable event label ──────────────────────────────────────

function EditableEventLabel({ eventId, defaultLabel, isExpanded, onToggle, counts, missingCount }: {
  eventId: string;
  defaultLabel: string;
  isExpanded: boolean;
  onToggle: () => void;
  counts: string;
  missingCount: number;
}) {
  const customHeaders = useEvidenceStore(s => s.customHeaders);
  const renameHeader = useEvidenceStore(s => s.renameHeader);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const labelKey = `event:${eventId}`;
  const displayLabel = customHeaders[labelKey] || defaultLabel;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(displayLabel);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const val = draft.trim();
    if (val && val !== defaultLabel) {
      renameHeader(labelKey, val);
    } else {
      renameHeader(labelKey, defaultLabel);
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-5 py-2 bg-gray-50 border-b border-gray-100 w-full">
      <button onClick={onToggle} className="shrink-0">
        {isExpanded
          ? <ChevronDown size={12} className="text-gray-400" />
          : <ChevronRight size={12} className="text-gray-400" />
        }
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          onClick={e => e.stopPropagation()}
          className="text-xs font-medium text-gray-900 bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          style={{ minWidth: 180 }}
        />
      ) : (
        <span
          className="text-xs font-medium text-gray-700 cursor-pointer hover:text-blue-700"
          onClick={startEdit}
          title="Click to rename"
        >
          {displayLabel}
        </span>
      )}
      <span className="text-xs text-gray-400">{counts}</span>
      {missingCount > 0 && (
        <span className="text-xs text-red-500">{missingCount} missing</span>
      )}
    </div>
  );
}

// ── Table headers per tab + event type ───────────────────────

function getTableHeaders(tab?: string, eventType?: string, eventSubType?: string): string[] {
  if (tab === 'purchase' && eventType === 'due_diligence') {
    return ['Development', 'Type', 'City', 'Council', 'Land From', 'Build From', 'Total From', 'Proj. Rent', 'Proj. Value'];
  }
  if (tab === 'purchase' && eventType === 'purchase' && !eventSubType) {
    return ['Address', 'Settlement', 'Price', 'Land', 'Build', 'Deposit', 'Stamp Duty', 'Ownership', 'Lot', 'Size'];
  }
  if (tab === 'finance') {
    return ['Lender', 'Acct', 'Purpose', 'IO/P&I', 'Amount', 'Valuation', 'LVR', 'Rate', 'Status', 'Security', 'Broker', 'Settlement', 'Closed', 'LMI', 'Fees'];
  }
  if (tab === 'insurance') {
    return ['Provider', 'Annual', 'Renewal'];
  }
  if (tab === 'pm') {
    return ['Manager', 'Fee', 'Rent', 'Lease Start', 'Lease End'];
  }
  return ['Details'];
}

// ── Component ────────────────────────────────────────────────

export function ChecklistTab({ searchQuery, propertyFilter, eventFilter, showGapsOnly = false, tab }: ChecklistTabProps) {
  const { properties, loans } = usePortfolioStore();
  const documentIndex = useEvidenceStore((s) => s.documentIndex);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string; relativePath?: string } | null>(null);

  // Global document index gap data
  const [propertyGaps, setPropertyGaps] = useState<Map<string, Map<string, GapItem[]>>>(new Map());
  const gapsLoadedRef = useRef<Set<string>>(new Set());

  const activeProperties = [...properties]
    .sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || ''))
    .filter(p => p.status !== 'deposit_paid' || p.id === 'lennox')
    .filter(p => !propertyFilter || p.id === propertyFilter);

  // Load gaps from global index for each property
  useEffect(() => {
    for (const p of activeProperties) {
      if (gapsLoadedRef.current.has(p.id)) continue;
      gapsLoadedRef.current.add(p.id);

      const isHL = !!(p.landCost && p.buildCost);
      const propLoans = loans.filter(l => l.propertyId === p.id);
      // Find original purchase loans (not refinance successors, not cash-out/offset)
      const purchaseLoans = propLoans
        .filter(l => !l.refinancedFromId && l.type !== 'cash_out' && l.type !== 'offset' && (!l.purposePropertyId || l.purposePropertyId === p.id));

      type GapEvent = { eventType: string; lenderFrom?: string; lenderTo?: string; loanId?: string; isHL?: boolean; purchaseLenders?: string[]; accountNumbers?: string[]; dateFrom?: string; dateTo?: string };

      const events: GapEvent[] = [
        { eventType: 'purchase', isHL },
        {
          eventType: 'purchase_finance',
          isHL,
          purchaseLenders: purchaseLoans.map(l => l.lender),
          accountNumbers: purchaseLoans.map(l => l.accountNumber).filter(Boolean),
          dateFrom: purchaseLoans[0]?.startDate,
          dateTo: purchaseLoans[0]?.closedDate || purchaseLoans[0]?.endDate,
        },
        { eventType: 'insurance_renewal' },
        { eventType: 'new_pm' },
        { eventType: 'new_tenant' },
        { eventType: 'annual' },
      ];

      // Add refinance events with loan context
      for (const old of propLoans) {
        if (!old.refinancedToId) continue;
        const newLoan = loans.find(l => l.id === old.refinancedToId);
        if (newLoan) {
          events.push({
            eventType: 'refinance',
            lenderFrom: old.lender,
            lenderTo: newLoan.lender,
            loanId: newLoan.id,
            accountNumbers: [old.accountNumber, newLoan.accountNumber].filter(Boolean),
            dateFrom: newLoan.startDate,
            dateTo: newLoan.closedDate || newLoan.endDate,
          });
        }
      }

      api.globalIndex.gapsBatch(p.id, events).then(data => {
        setPropertyGaps(prev => {
          const next = new Map(prev);
          const eventMap = new Map<string, GapItem[]>();
          for (const [key, gaps] of Object.entries(data.results)) {
            eventMap.set(key, gaps as GapItem[]);
          }
          next.set(p.id, eventMap);
          return next;
        });
      }).catch(err => console.error('Gap load failed for', p.id, err));
    }
  }, [activeProperties, loans]);

  const propertyTimelines = useMemo(() => {
    const map = new Map<string, PropertyEvent[]>();
    for (const p of activeProperties) {
      const structural = generatePropertyEvents(p, loans, properties);
      const fileEvents = generateFileEvents(p.id, documentIndex);
      let all = [...structural, ...fileEvents];
      if (eventFilter) {
        all = all.filter(e => {
          const matchSub = e.subType && eventFilter.subTypes?.includes(e.subType);
          const matchType = eventFilter.types?.includes(e.type) && !e.subType;
          return matchType || matchSub;
        });
      }
      all.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      map.set(p.id, all);
    }
    return map;
  }, [activeProperties, loans, documentIndex, properties, eventFilter]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {activeProperties.map(property => {
        const isExpanded = expandedProperty === property.id || expandedProperty === null;
        const events = propertyTimelines.get(property.id) ?? [];
        const propDocs = documentIndex.filter(d => d.propertyId === property.id);
        const propGapData = propertyGaps.get(property.id);

        let totalDocs = 0;
        let foundDocs = 0;
        for (const event of events) {
          if (event.fileGroup) {
            totalDocs += event.fileGroup.length;
            foundDocs += event.fileGroup.length;
          } else {
            const gapKey = getGapKey(event);
            const gaps = gapKey ? propGapData?.get(gapKey) : null;
            if (gaps) {
              totalDocs += gaps.length;
              foundDocs += gaps.filter(g => !g.missing).length;
            } else {
              for (const doc of event.docs) {
                totalDocs++;
                if (findMatchingFiles(doc, propDocs, event).length > 0) foundDocs++;
              }
            }
          }
        }
        const missingCount = totalDocs - foundDocs;

        return (
          <div key={property.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedProperty(expandedProperty === property.id ? null : property.id)}
              className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                <h3 className="text-sm font-semibold text-gray-700">{property.nickname}</h3>
                <span className="text-xs text-gray-400">{foundDocs}/{totalDocs}</span>
              </div>
              {missingCount > 0 && (
                <span className="text-xs text-red-600 font-medium">{missingCount} missing</span>
              )}
            </button>

            {isExpanded && (
              <div>
                {events.map((event) => {
                  const isFileEvent = !!event.fileGroup;
                  const isEventExpanded = expandedEvents.has(event.id);

                  let resolvedDocs: { doc: DocRequirement; files: IndexedDocument[] }[] = [];
                  let filteredDocs: typeof resolvedDocs = [];
                  let eventFound = 0;
                  let eventTotal = 0;
                  let eventMissing = 0;
                  let gapItems: GapItem[] | null = null;

                  if (!isFileEvent) {
                    const gapKey = getGapKey(event);
                    const eventGaps = gapKey ? propGapData?.get(gapKey) : null;

                    if (eventGaps) {
                      // Use global document index gap data
                      gapItems = [...eventGaps];

                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        gapItems = gapItems.filter(g =>
                          g.template.name.toLowerCase().includes(q) ||
                          g.matched.some(m => m.canonical_name.toLowerCase().includes(q))
                        );
                      }
                      if (showGapsOnly) {
                        gapItems = gapItems.filter(g => g.missing);
                      }
                      if (gapItems.length === 0) return null;

                      eventTotal = eventGaps.length;
                      eventFound = eventGaps.filter(g => !g.missing).length;
                      eventMissing = eventGaps.filter(g => g.missing).length;
                    } else {
                      // Fallback: old DocRequirement matching for events without gap templates
                      resolvedDocs = event.docs.map(doc => ({
                        doc,
                        files: findMatchingFiles(doc, propDocs, event),
                      }));
                      filteredDocs = resolvedDocs;

                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        filteredDocs = resolvedDocs.filter(r =>
                          r.doc.name.toLowerCase().includes(q) ||
                          r.files.some(f => f.filename.toLowerCase().includes(q))
                        );
                      }
                      if (showGapsOnly) {
                        filteredDocs = filteredDocs.filter(r => r.files.length === 0);
                      }
                      if (filteredDocs.length === 0) return null;

                      eventFound = resolvedDocs.filter(r => r.files.length > 0).length;
                      eventTotal = resolvedDocs.length;
                      eventMissing = eventTotal - eventFound;
                    }
                  } else {
                    if (showGapsOnly) return null;
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      const matches = event.fileGroup!.some(f =>
                        f.filename.toLowerCase().includes(q) ||
                        event.label.toLowerCase().includes(q)
                      );
                      if (!matches) return null;
                    }
                    eventTotal = event.fileGroup!.length;
                    eventFound = eventTotal;
                  }

                  const headers = getTableHeaders(tab, event.type, event.subType);

                  return (
                    <div key={event.id} className="border-t border-gray-100">
                      {/* Event label bar — above the table like LoanChain refinance path */}
                      <EditableEventLabel
                        eventId={event.id}
                        defaultLabel={event.label}
                        isExpanded={isEventExpanded}
                        onToggle={() => toggleEvent(event.id)}
                        counts={!isFileEvent ? `${eventFound}/${eventTotal}` : `${eventTotal} file${eventTotal !== 1 ? 's' : ''}`}
                        missingCount={eventMissing}
                      />

                      {/* Data table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              {headers.map(h => {
                                const isFinance = tab === 'finance';
                                const rightAlign = isFinance && ['Amount', 'Valuation', 'LVR', 'Rate', 'LMI', 'Fees'].includes(h);
                                const isPurpose = isFinance && h === 'Purpose';
                                const thClass = `${rightAlign ? 'text-right' : 'text-left'} px-4 py-2.5 ${isFinance ? 'font-semibold text-gray-900' : 'text-[10px] font-medium text-slate-400 uppercase tracking-wider'} ${isPurpose ? '' : 'whitespace-nowrap'}`;
                                if (isFinance) {
                                  return <EditableHeader key={h} defaultName={h} className={thClass} />;
                                }
                                return (
                                  <th key={h} className={thClass}>
                                    {h}
                                  </th>
                                );
                              })}
                              {tab === 'finance' && <th className="w-10" />}
                            </tr>
                          </thead>
                          {!isFileEvent && tab === 'finance' ? (
                            <FinanceLoanRows event={event} property={property} loans={loans} allProperties={properties} onRenamed={() => { gapsLoadedRef.current.clear(); setPropertyGaps(new Map()); }} />
                          ) : !isFileEvent ? (
                            <tbody>
                              <tr className="hover:bg-gray-50">
                                <EventDataCells event={event} property={property} loans={loans} tab={tab} />
                              </tr>
                            </tbody>
                          ) : null}
                        </table>
                      </div>

                      {/* Expanded documents */}
                      {isEventExpanded && (
                        <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100">
                          <div className="space-y-1.5">
                            {/* Gap-based rendering (global document index) */}
                            {!isFileEvent && gapItems && gapItems.map(gap => {
                              const hasMatch = !gap.missing;
                              return (
                                <div key={gap.template.id} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${hasMatch ? '' : 'bg-red-50/40'}`}>
                                  <div className="pt-0.5 shrink-0">
                                    {hasMatch
                                      ? <CheckCircle size={13} className="text-gray-300" />
                                      : <MinusCircle size={13} className="text-red-400" />
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${hasMatch ? 'text-gray-600' : 'text-gray-500'}`}>
                                      {gap.template.name}
                                    </p>
                                    {hasMatch ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {gap.matched.map(doc => (
                                          <RenameableDocChip
                                            key={doc.id}
                                            doc={doc}
                                            onPreview={(url, filename, relativePath) => setPreviewDoc({ url, filename, relativePath })}
                                            onRenamed={() => {
                                              gapsLoadedRef.current.delete(property.id);
                                              setPropertyGaps(prev => { const n = new Map(prev); n.delete(property.id); return n; });
                                            }}
                                          />
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 mt-0.5">{gap.template.description}</p>
                                    )}
                                  </div>
                                  {gap.missing && (
                                    <div className="shrink-0 flex items-center gap-2">
                                      <span className="text-xs text-red-500">Missing</span>
                                      <UploadButton
                                        evidenceItemId={`${event.id}-${gap.template.id}`}
                                        propertyId={property.id}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Fallback: old DocRequirement rendering (events without gap templates) */}
                            {!isFileEvent && !gapItems && filteredDocs.map(({ doc, files }) => {
                              const hasFiles = files.length > 0;
                              return (
                                <div key={doc.name} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${hasFiles ? '' : 'bg-red-50/40'}`}>
                                  <div className="pt-0.5 shrink-0">
                                    {hasFiles
                                      ? <CheckCircle size={13} className="text-gray-300" />
                                      : <MinusCircle size={13} className="text-red-400" />
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${hasFiles ? 'text-gray-600' : 'text-gray-500'}`}>
                                      {doc.name}
                                    </p>
                                    {hasFiles ? (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {files.map(file => (
                                          <button
                                            key={file.id}
                                            onClick={() => setPreviewDoc({
                                              url: api.documents.getServeUrl(file.relativePath),
                                              filename: file.filename,
                                            })}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-white text-gray-500 rounded text-xs hover:bg-gray-100 hover:text-gray-700 border border-gray-200 cursor-pointer transition-colors"
                                            title={file.relativePath}
                                          >
                                            <FileText size={9} className="shrink-0" />
                                            <span className="truncate max-w-[250px]">{file.filename}</span>
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>
                                    )}
                                  </div>
                                  {!hasFiles && (
                                    <div className="shrink-0 flex items-center gap-2">
                                      <span className="text-xs text-red-500">Missing</span>
                                      <UploadButton
                                        evidenceItemId={`${event.id}-${doc.name}`}
                                        propertyId={property.id}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {isFileEvent && event.fileGroup!.map(file => (
                              <button
                                key={file.id}
                                onClick={() => setPreviewDoc({
                                  url: api.documents.getServeUrl(file.relativePath),
                                  filename: file.filename,
                                })}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white w-full text-left transition-colors"
                              >
                                <FileText size={12} className="text-gray-400 shrink-0" />
                                <span className="text-sm text-gray-600 truncate">{file.filename}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          relativePath={previewDoc.relativePath}
          onClose={() => setPreviewDoc(null)}
          onRenamed={(newFilename, newRelativePath) => {
            setPreviewDoc({ url: api.documents.getServeUrl(newRelativePath), filename: newFilename, relativePath: newRelativePath });
            // Reload gaps for all properties after rename
            gapsLoadedRef.current.clear();
            setPropertyGaps(new Map());
          }}
        />
      )}
    </div>
  );
}
