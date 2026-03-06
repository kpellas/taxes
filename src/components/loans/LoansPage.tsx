import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeftRight, AlertTriangle, Table, GitFork, ChevronUp, ChevronDown, Plus, X, Trash2, FileText, CheckCircle2, XCircle, Circle, MessageSquare } from 'lucide-react';
import { LoanFlowchart } from './LoanFlowchart';
import { StatusBadge } from '../common/StatusBadge';
import { EntityBadge } from '../common/EntityBadge';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useEvidenceStore } from '../../store/evidenceStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency, getLenderColor } from '../../utils/format';
import { api } from '../../api/client';
import { generatePropertyEvents } from '../../data/documentChecklist';
import type { Loan } from '../../types';
import type { IndexedDocument } from '../../api/client';
import type { DocRequirement, PropertyEvent } from '../../data/documentChecklist';

type LoansView = 'table' | 'structure';
type SortKey = 'date' | 'lender' | 'security' | 'purpose' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'closed';

const LENDERS = ['Bankwest', 'Macquarie', 'NAB', 'Beyond Bank', 'Personal', '—'];
const STATUSES: Loan['status'][] = ['active', 'refinanced', 'closed', 'paid_off'];

/** Reuse the same matching logic as the Document Checklist */
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
  }).slice(0, 10);
}

function getDocsForLoan(
  loan: Loan,
  allDocs: IndexedDocument[],
  events: PropertyEvent[],
  allLoans?: Loan[],
): IndexedDocument[] {
  // Use purpose property for doc matching (docs relate to purpose, not security)
  const docPropertyId = loan.purposePropertyId || loan.propertyId;
  // Also include security property docs when different (settlement docs filed under security)
  const securityPropertyId = loan.propertyId;
  const propDocs = allDocs.filter(d => d.propertyId === docPropertyId);
  const securityDocs = securityPropertyId !== docPropertyId
    ? allDocs.filter(d => d.propertyId === securityPropertyId)
    : [];
  const searchDocs = [...propDocs, ...securityDocs];
  const seen = new Set<string>();
  const matched: IndexedDocument[] = [];

  // 1. Account number match — prefer docs from this loan's property
  //    (same account number can be reused across draws for different properties)
  const acctMatches: IndexedDocument[] = [];
  for (const doc of allDocs) {
    if (doc.accountNumbers.length > 0 && doc.accountNumbers.includes(loan.accountNumber)) {
      acctMatches.push(doc);
    }
  }
  // If docs from this loan's property exist, only use those; otherwise use all
  const acctMatchesForProp = acctMatches.filter(d => d.propertyId === docPropertyId);
  const acctToUse = acctMatchesForProp.length > 0 ? acctMatchesForProp : acctMatches;
  for (const doc of acctToUse) {
    // When doc has a dollar amount in filename, skip if it doesn't match this loan's amount
    // (catches shared account numbers across draws with different amounts)
    if (doc.propertyId !== docPropertyId) {
      const amtMatch = doc.filename.match(/\$([0-9][0-9,_.]+)/);
      if (amtMatch && loan.originalAmount) {
        const docAmt = parseFloat(amtMatch[1].replace(/[,_]/g, ''));
        if (!isNaN(docAmt) && Math.abs(docAmt - loan.originalAmount) > 1000) continue;
      }
    }
    if (!seen.has(doc.id)) { seen.add(doc.id); matched.push(doc); }
  }

  // 2. Find the event that involves this loan and resolve its docs
  //    Filter by lender to avoid pulling docs from other lenders in same event
  const lenderLower = loan.lender.toLowerCase().replace(/\s+/g, '');
  const lenderMatchesDoc = (doc: IndexedDocument) => {
    if (loan.lender === 'Personal' || loan.lender === '—') return false;
    const p = doc.relativePath.toLowerCase().replace(/\s+/g, '');
    const f = doc.filename.toLowerCase().replace(/\s+/g, '');
    return p.includes(lenderLower) || f.includes(lenderLower);
  };

  for (const event of events) {
    const eventId = event.id;
    if (event.type === 'purchase' && eventId === `${docPropertyId}-purchase` && !loan.refinancedFromId && loan.type !== 'cash_out') {
      for (const docReq of event.docs) {
        for (const file of findMatchingFiles(docReq, searchDocs, event)) {
          if (!seen.has(file.id) && lenderMatchesDoc(file)) { seen.add(file.id); matched.push(file); }
        }
      }
    }
    if (event.type === 'refinance' && eventId.includes(loan.id)) {
      for (const docReq of event.docs) {
        for (const file of findMatchingFiles(docReq, searchDocs, event)) {
          if (!seen.has(file.id) && lenderMatchesDoc(file)) { seen.add(file.id); matched.push(file); }
        }
      }
    }
  }

  // 3. Fallback: match by property + lender in loan-related folders
  //    Catches Bankwest docs where facility numbers don't match account numbers
  if (matched.length === 0 && loan.lender !== 'Personal' && loan.lender !== '—') {
    const lenderKw = loan.lender.toLowerCase().replace(/\s+/g, '');
    // Extract dollar amount from doc filename for amount-based filtering
    const loanAmt = loan.originalAmount;
    for (const doc of searchDocs) {
      const pathLower = doc.relativePath.toLowerCase();
      const fnLower = doc.filename.toLowerCase();
      const isLoanFolder = pathLower.includes('/finance') || pathLower.includes('/loan_docs')
        || pathLower.includes('/refinance');
      const isLoanFile = fnLower.includes('loan') || fnLower.includes('contract')
        || fnLower.includes('mortgage') || fnLower.includes('settlement')
        || fnLower.includes('summary') || fnLower.includes('coversheet');
      const matchesLender = pathLower.replace(/\s+/g, '').includes(lenderKw) || fnLower.replace(/\s+/g, '').includes(lenderKw);
      if (matchesLender && (isLoanFolder || isLoanFile)) {
        // Skip docs whose filename contains a dollar amount that doesn't match this loan
        const amtMatch = doc.filename.match(/\$([0-9][0-9,_.]+)/);
        if (amtMatch && loanAmt) {
          const docAmt = parseFloat(amtMatch[1].replace(/[,_]/g, ''));
          if (!isNaN(docAmt) && Math.abs(docAmt - loanAmt) > 1000) continue;
        }
        if (!seen.has(doc.id)) { seen.add(doc.id); matched.push(doc); }
      }
    }
  }

  // Exclude docs that clearly belong to a different loan (contain another loan's account number)
  if (allLoans) {
    const otherAccts = allLoans
      .filter(l => l.id !== loan.id && l.accountNumber && l.accountNumber !== '—')
      .map(l => l.accountNumber);
    // Also build a map of other loans' long-form account numbers for Macquarie-style matching
    const otherLongAccts = allLoans
      .filter(l => l.id !== loan.id && l.accountNumber && l.accountNumber !== '—')
      .flatMap(l => {
        const accts = [l.accountNumber];
        // Add Macquarie long-form (007913XXX)
        if (/^\d{4}$/.test(l.accountNumber)) accts.push('0079' + l.accountNumber.padStart(5, '1') + l.accountNumber);
        return accts;
      });
    const filtered = matched.filter(doc => {
      const fn = doc.filename + ' ' + doc.relativePath;
      // If doc contains THIS loan's account number, always keep
      if (fn.includes(loan.accountNumber)) return true;
      // If doc contains a DIFFERENT loan's account number, exclude
      for (const acct of otherAccts) {
        if (fn.includes(acct)) return false;
      }
      return true;
    });
    matched.length = 0;
    matched.push(...filtered);
  }

  // Sort: contracts first, then summary/coversheet, then rest
  matched.sort((a, b) => {
    const priority = (fn: string) => {
      const f = fn.toLowerCase();
      if (f.includes('home loan contract') || f.includes('loan docs') || f.includes('loan offer')
        || f.includes('facility agreement')) return 0;
      if (f.includes('contract') || f.includes('offer package')) return 1;
      if (f.includes('summary') || f.includes('coversheet')) return 2;
      if (f.includes('mortgage form') || f.includes('settlement')) return 3;
      return 9;
    };
    const pa = priority(a.filename);
    const pb = priority(b.filename);
    if (pa !== pb) return pa - pb;
    // Within same priority, sort by date (from filename or lastModified)
    const dateA = a.dateFromFilename || a.lastModified || '';
    const dateB = b.dateFromFilename || b.lastModified || '';
    return dateA.localeCompare(dateB);
  });

  return matched;
}

function LoanDocDropdown({
  docs,
  onSelect,
}: {
  docs: IndexedDocument[];
  onSelect: (doc: IndexedDocument) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (docs.length === 0) return null;

  const primary = docs[0];
  const rest = docs.slice(1);
  const fnLower = primary.filename.toLowerCase();
  const hasContract = fnLower.includes('home loan contract') || fnLower.includes('loan docs')
    || fnLower.includes('loan offer') || fnLower.includes('facility agreement')
    || fnLower.includes('land contract') || fnLower.includes('settlement');
  const iconColor = hasContract
    ? 'text-green-600 hover:text-green-800'
    : 'text-blue-600 hover:text-blue-800';

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {/* Primary doc: direct click opens it */}
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(primary); }}
        className={`flex items-center gap-1 ${iconColor} transition-colors`}
        title={primary.filename}
      >
        <FileText size={14} />
      </button>
      {/* More docs dropdown */}
      {rest.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="text-[10px] text-gray-400 hover:text-gray-600"
          title={`+${rest.length} more`}
        >
          +{rest.length}
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-80 max-h-60 overflow-y-auto">
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={(e) => { e.stopPropagation(); onSelect(doc); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
            >
              <FileText size={12} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-700 truncate">{doc.filename}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoanEditor({
  loan,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  loan: Partial<Loan>;
  onSave: (loan: Partial<Loan>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isNew?: boolean;
}) {
  const { properties, entities } = usePortfolioStore();
  const [form, setForm] = useState({ ...loan });
  const set = (updates: Partial<Loan>) => setForm((f) => ({ ...f, ...updates }));

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const inputClass = 'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-500';

  return (
    <tr>
      <td colSpan={14} className="px-5 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-800">
            {isNew ? 'Add Loan' : `Edit: ${form.lender} ${form.accountNumber}`}
          </span>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Date</label>
            <input className={inputClass} value={form.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value })} placeholder="2024-11" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Lender</label>
            <select className={inputClass} value={form.lender ?? ''} onChange={(e) => set({ lender: e.target.value })}>
              <option value="">Select...</option>
              {LENDERS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Account #</label>
            <input className={inputClass} value={form.accountNumber ?? ''} onChange={(e) => set({ accountNumber: e.target.value })} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Amount</label>
            <input className={inputClass} type="number" value={form.originalAmount ?? ''} onChange={(e) => set({ originalAmount: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Current Balance</label>
            <input className={inputClass} type="number" value={form.currentBalance ?? ''} onChange={(e) => set({ currentBalance: e.target.value ? parseFloat(e.target.value) : undefined })} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Rate %</label>
            <input className={inputClass} type="number" step="0.01" value={form.interestRate ?? ''} onChange={(e) => set({ interestRate: e.target.value ? parseFloat(e.target.value) : undefined })} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Security (property)</label>
            <select className={inputClass} value={form.propertyId ?? ''} onChange={(e) => set({ propertyId: e.target.value })}>
              <option value="">Select...</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Purpose (for property)</label>
            <select className={inputClass} value={form.purposePropertyId ?? ''} onChange={(e) => set({ purposePropertyId: e.target.value || undefined })}>
              <option value="">Same as security</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Entity</label>
            <select className={inputClass} value={form.entityId ?? ''} onChange={(e) => set({ entityId: e.target.value })}>
              <option value="">Select...</option>
              {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Status</label>
            <select className={inputClass} value={form.status ?? 'active'} onChange={(e) => set({ status: e.target.value as Loan['status'] })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">IO / P&I</label>
            <select className={inputClass} value={form.isInterestOnly === undefined ? 'na' : form.isInterestOnly ? 'io' : 'pi'} onChange={(e) => set({ isInterestOnly: e.target.value === 'na' ? undefined : e.target.value === 'io' })}>
              <option value="io">Interest Only</option>
              <option value="pi">P&I</option>
              <option value="na">—</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">End Date</label>
            <input className={inputClass} value={form.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || undefined })} placeholder="2024-11" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Purpose text</label>
            <input className={inputClass} value={form.purpose ?? ''} onChange={(e) => set({ purpose: e.target.value })} />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-0.5 block">Notes</label>
            <input className={inputClass} value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
            <button
              onClick={() => onSave(form)}
              className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-700"
            >
              {isNew ? 'Add' : 'Save'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function LoansPage() {
  const [view, setViewRaw] = useState<LoansView>(() => (localStorage.getItem('loans-view') as LoansView) || 'table');
  const setView = (v: LoansView) => { setViewRaw(v); localStorage.setItem('loans-view', v); };
  const [sortKey, setSortKeyRaw] = useState<SortKey>(() => (localStorage.getItem('loans-sortKey') as SortKey) || 'date');
  const [sortDir, setSortDirRaw] = useState<SortDir>(() => (localStorage.getItem('loans-sortDir') as SortDir) || 'desc');
  const [statusFilter, setStatusFilterRaw] = useState<StatusFilter>(() => (localStorage.getItem('loans-statusFilter') as StatusFilter) || 'all');
  const setSortKey = (k: SortKey) => { setSortKeyRaw(k); localStorage.setItem('loans-sortKey', k); };
  const setSortDir = (d: SortDir) => { setSortDirRaw(d); localStorage.setItem('loans-sortDir', d); };
  const setStatusFilter = (f: StatusFilter) => { setStatusFilterRaw(f); localStorage.setItem('loans-statusFilter', f); };
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string; loanId?: string; relativePath?: string } | null>(null);
  const [lastPreviewedLoanId, setLastPreviewedLoanId] = useState<string | null>(null);
  const [notesOpenId, setNotesOpenId] = useState<string | null>(null);
  const { properties, loans, entities } = usePortfolioStore();
  const updateLoan = usePortfolioStore((s) => s.updateLoan);
  const addLoan = usePortfolioStore((s) => s.addLoan);
  const deleteLoan = usePortfolioStore((s) => s.deleteLoan);
  const { activeEntityId } = useUIStore();
  const { documentIndex, documentIndexLoaded, setDocumentIndex } = useEvidenceStore();

  useEffect(() => {
    api.documents.getIndex().then((data) => setDocumentIndex(data.documents)).catch(() => {});
  }, [setDocumentIndex]);

  // Generate checklist events for all properties (same logic as Evidence page)
  const allEvents = useMemo(() => {
    const events: PropertyEvent[] = [];
    for (const p of properties) {
      events.push(...generatePropertyEvents(p, loans, properties));
    }
    return events;
  }, [properties, loans]);

  const getPropertyName = (id: string) => properties.find((p) => p.id === id)?.nickname ?? '—';

  const getPurposeProperty = (loan: Loan) => {
    if (loan.purposePropertyId) return getPropertyName(loan.purposePropertyId);
    if (loan.propertyId) return getPropertyName(loan.propertyId);
    return '—';
  };

  const allLoans = useMemo(() => {
    let filtered = loans.filter(
      (l) => l.type !== 'offset' && (!activeEntityId || l.entityId === activeEntityId)
    );

    if (statusFilter === 'active') filtered = filtered.filter((l) => l.status === 'active');
    if (statusFilter === 'closed') filtered = filtered.filter((l) => l.status !== 'active');

    if (propertyFilter !== 'all') {
      filtered = filtered.filter((l) => {
        const purposeProp = l.purposePropertyId ?? l.propertyId;
        return purposeProp === propertyFilter;
      });
    }

    if (accountFilter) {
      const q = accountFilter.toLowerCase();
      filtered = filtered.filter((l) => l.accountNumber.toLowerCase().includes(q));
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date':
          cmp = (a.startDate ?? '').localeCompare(b.startDate ?? '');
          break;
        case 'lender':
          cmp = a.lender.localeCompare(b.lender);
          break;
        case 'security':
          cmp = getPropertyName(a.propertyId).localeCompare(getPropertyName(b.propertyId));
          break;
        case 'purpose':
          cmp = getPurposeProperty(a).localeCompare(getPurposeProperty(b));
          break;
        case 'amount':
          cmp = (a.currentBalance ?? a.originalAmount) - (b.currentBalance ?? b.originalAmount);
          break;
        case 'status': {
          const order = (s: string) => s === 'active' ? 0 : s === 'refinanced' ? 1 : 2;
          cmp = order(a.status) - order(b.status);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [loans, activeEntityId, statusFilter, propertyFilter, accountFilter, sortKey, sortDir, properties]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      const next = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(next);
    } else {
      setSortKey(key);
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc');
    }
  };

  const SortHeader = ({ label, sortId, className = '' }: { label: string; sortId: SortKey; className?: string }) => (
    <th
      className={`px-5 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 ${className}`}
      onClick={() => toggleSort(sortId)}
    >
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {sortKey === sortId && (
          sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        )}
      </div>
    </th>
  );

  const propertyOptions = useMemo(() => {
    const ids = new Set<string>();
    loans.forEach((l) => {
      ids.add(l.purposePropertyId ?? l.propertyId);
    });
    return [...ids].map((id) => ({ id, name: getPropertyName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [loans, properties]);

  const activeCt = loans.filter((l) => l.status === 'active' && l.type !== 'offset').length;
  const closedCt = loans.filter((l) => l.status !== 'active' && l.type !== 'offset').length;

  const handleSave = (id: string, updates: Partial<Loan>) => {
    updateLoan(id, updates);
    setEditingId(null);
  };

  const handleAdd = (form: Partial<Loan>) => {
    const id = `loan-${Date.now()}`;
    addLoan({
      id,
      entityId: form.entityId ?? '',
      propertyId: form.propertyId ?? '',
      lender: form.lender ?? '',
      accountNumber: form.accountNumber ?? '',
      type: form.purposePropertyId && form.purposePropertyId !== form.propertyId ? 'cash_out' : 'investment',
      status: form.status ?? 'active',
      originalAmount: form.originalAmount ?? 0,
      currentBalance: form.currentBalance,
      interestRate: form.interestRate,
      isInterestOnly: form.isInterestOnly ?? true,
      purpose: form.purpose ?? '',
      purposePropertyId: form.purposePropertyId,
      startDate: form.startDate,
      endDate: form.endDate,
      notes: form.notes,
      sourceInfo: { confidence: 'user_provided', source: 'Manual entry' },
    });
    setAddingNew(false);
  };

  const handleDelete = (id: string) => {
    deleteLoan(id);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight size={24} /> Loans & Refinancing
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {activeCt} active, {closedCt} closed/refinanced
          </p>
        </div>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'table'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table size={14} />
            Table View
          </button>
          <button
            onClick={() => setView('structure')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'structure'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <GitFork size={14} />
            Structure Map
          </button>
        </div>
      </div>

      {view === 'structure' ? (
        <LoanFlowchart />
      ) : (
        <>
          {/* Filters + Add */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {(['all', 'active', 'closed'] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      statusFilter === f
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Closed'}
                  </button>
                ))}
              </div>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white"
              >
                <option value="all">All properties</option>
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="text"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                placeholder="Account #"
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white w-28"
              />
            </div>
            <button
              onClick={() => { setAddingNew(true); setEditingId(null); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700"
            >
              <Plus size={14} /> Add Loan
            </button>
          </div>

          {/* Loan Register Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-center px-2 py-3 font-medium text-gray-400 w-8">#</th>
                    <SortHeader label="Date" sortId="date" className="text-left" />
                    <SortHeader label="Lender" sortId="lender" className="text-left" />
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Account #</th>
                    <SortHeader label="Security" sortId="security" className="text-left" />
                    <SortHeader label="Purpose (for)" sortId="purpose" className="text-left" />
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Entity</th>
                    <SortHeader label="Opening" sortId="amount" className="text-right" />
                    <th className="text-right px-5 py-3 font-medium text-gray-600">Current</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Type</th>
                    <SortHeader label="Status" sortId="status" className="text-left" />
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Docs</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600 w-8">Notes</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600 w-10">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {addingNew && (
                    <LoanEditor
                      loan={{ status: 'active', isInterestOnly: true }}
                      onSave={handleAdd}
                      onCancel={() => setAddingNew(false)}
                      isNew
                    />
                  )}
                  {allLoans.map((loan, idx) => {
                    if (editingId === loan.id) {
                      return (
                        <LoanEditor
                          key={loan.id}
                          loan={loan}
                          onSave={(updates) => handleSave(loan.id, updates)}
                          onCancel={() => setEditingId(null)}
                          onDelete={() => handleDelete(loan.id)}
                        />
                      );
                    }

                    const securityProp = getPropertyName(loan.propertyId);
                    const purposeProp = getPurposeProperty(loan);
                    const isActive = loan.status === 'active';
                    const isCross = loan.purposePropertyId && loan.purposePropertyId !== loan.propertyId;

                    return (
                      <React.Fragment key={loan.id}>
                        <tr
                          className={`border-b border-gray-50 hover:bg-gray-100 select-text ${lastPreviewedLoanId === loan.id ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : isActive ? '' : 'bg-black/[0.03]'}`}
                        >
                          <td className="px-2 py-3 text-center">
                            <button
                              onClick={() => { setEditingId(loan.id); setAddingNew(false); }}
                              className="font-mono text-[10px] text-gray-400 hover:text-blue-600 hover:underline cursor-pointer"
                              title="Edit loan"
                            >
                              {idx + 1}
                            </button>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">
                            {loan.startDate ?? '—'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: getLenderColor(loan.lender) }}
                              />
                              <span className={isActive ? 'font-medium' : ''}>{loan.lender}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs">{loan.accountNumber}</td>
                          <td className={`px-5 py-3 ${isActive ? 'text-gray-800' : ''}`}>
                            {securityProp}
                          </td>
                          <td className={`px-5 py-3 ${isActive ? 'text-gray-800' : ''}`}>
                            <span>{purposeProp}</span>
                            {isCross && (
                              <span className="ml-1 text-[10px] text-gray-400" title={`Secured against ${securityProp}, purpose: ${purposeProp}`}>
                                x-col
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <EntityBadge entityId={loan.entityId} />
                          </td>
                          <td className="px-5 py-3 text-right font-mono">
                            {formatCurrency(loan.originalAmount)}
                          </td>
                          <td className={`px-5 py-3 text-right font-mono ${isActive ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                            {loan.currentBalance != null ? formatCurrency(loan.currentBalance) : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs">
                              {loan.lender === 'Personal' || loan.isInterestOnly === undefined ? '—' : loan.isInterestOnly ? 'IO' : 'P&I'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1">
                              {loan.needsConfirmation && (
                                <AlertTriangle size={14} className="text-amber-500" />
                              )}
                              <StatusBadge status={loan.status} />
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <LoanDocDropdown
                              docs={getDocsForLoan(loan, documentIndex, allEvents, loans)}
                              onSelect={(doc) => {
                                setPreviewDoc({
                                  url: api.documents.getServeUrl(doc.relativePath),
                                  filename: doc.filename,
                                  loanId: loan.id,
                                  relativePath: doc.relativePath,
                                });
                                setLastPreviewedLoanId(loan.id);
                              }}
                            />
                          </td>
                          {/* Notes icon — expands loan.notes below */}
                          <td className="px-1 py-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setNotesOpenId(notesOpenId === loan.id ? null : loan.id);
                              }}
                              className="inline-flex items-center justify-center w-5 h-5"
                              title={loan.notes?.trim() ? loan.notes : 'Add a note'}
                            >
                              <MessageSquare
                                size={12}
                                className={loan.notes?.trim()
                                  ? 'text-blue-500'
                                  : 'text-gray-300 hover:text-gray-400'}
                              />
                            </button>
                          </td>
                          {/* Three-state review: unticked → verified → rejected → unticked */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const conf = loan.sourceInfo?.confidence;
                                const next = conf === 'verified' ? 'rejected'
                                  : conf === 'rejected' ? 'assumed'
                                  : 'verified';
                                updateLoan(loan.id, {
                                  sourceInfo: {
                                    ...loan.sourceInfo,
                                    confidence: next,
                                    ...(next === 'verified' ? { verifiedBy: 'Manual review', lastUpdated: new Date().toISOString().slice(0, 10) } : {}),
                                  },
                                  needsConfirmation: next !== 'verified',
                                });
                              }}
                              className="inline-flex items-center justify-center"
                              title={loan.sourceInfo?.confidence === 'verified' ? 'Verified — click to reject'
                                : loan.sourceInfo?.confidence === 'rejected' ? 'Rejected — click to clear'
                                : 'Click to verify'}
                            >
                              {loan.sourceInfo?.confidence === 'verified' ? (
                                <CheckCircle2 size={18} className="text-green-600" />
                              ) : loan.sourceInfo?.confidence === 'rejected' ? (
                                <XCircle size={18} className="text-red-500" />
                              ) : (
                                <Circle size={18} className="text-gray-300 hover:text-gray-400" />
                              )}
                            </button>
                          </td>
                        </tr>
                        {/* Expandable notes row */}
                        {notesOpenId === loan.id && (
                          <tr className="border-b border-gray-100 bg-gray-50/50">
                            <td colSpan={14} className="px-5 py-2">
                              <div className="flex items-start gap-2 max-w-2xl">
                                <span className="text-[10px] font-medium text-gray-400 mt-2 shrink-0">#{idx + 1} NOTE</span>
                                <textarea
                                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                                  rows={2}
                                  defaultValue={loan.notes ?? ''}
                                  placeholder="Loan notes..."
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={(e) => {
                                    const val = e.target.value.trim();
                                    if (val !== (loan.notes ?? '').trim()) {
                                      updateLoan(loan.id, { notes: val || undefined });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      (e.target as HTMLTextAreaElement).blur();
                                    }
                                  }}
                                  autoFocus
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unconfirmed Items */}
          {loans.some((l) => l.needsConfirmation) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3">
                <AlertTriangle size={16} /> Items Needing Confirmation
              </h3>
              <ul className="space-y-2">
                {loans.filter((l) => l.needsConfirmation).map((loan) => (
                  <li key={loan.id} className="text-sm text-amber-700 flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>
                      <span className="font-medium">{loan.lender} {loan.accountNumber}</span>
                      {' - '}{loan.notes}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          relativePath={previewDoc.relativePath}
          onClose={() => setPreviewDoc(null)}
          onRenamed={(newFilename, newRelativePath) => {
            setPreviewDoc({
              ...previewDoc,
              filename: newFilename,
              relativePath: newRelativePath,
              url: api.documents.getServeUrl(newRelativePath),
            });
            // Refresh doc index
            api.documents.getIndex().then((data) => setDocumentIndex(data.documents)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
