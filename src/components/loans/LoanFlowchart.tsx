import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { AlertTriangle, RotateCcw, Trash2, Plus } from 'lucide-react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useFlowchartStore } from '../../store/flowchartStore';
import { useUIStore } from '../../store/uiStore';
import { formatCurrency } from '../../utils/format';
import { EntityBadge } from '../common/EntityBadge';
import type { Loan, Property, PurchaseItem as PurchaseItemType, PurchaseBreakdown } from '../../types';

// ── Color Picker ──

const BOX_COLORS = [
  null,         // none / clear
  '#fef3c7',   // amber-100
  '#dbeafe',   // blue-100
  '#dcfce7',   // green-100
  '#fce7f3',   // pink-100
  '#ede9fe',   // violet-100
  '#ffedd5',   // orange-100
  '#f0fdfa',   // teal-50
  '#fef9c3',   // yellow-100
  '#e0e7ff',   // indigo-100
  '#ffe4e6',   // rose-100
];

function ColorPicker({ boxId, x, y, onClose }: { boxId: string; x: number; y: number; onClose: () => void }) {
  const setBoxColor = useFlowchartStore((s) => s.setBoxColor);
  const currentColor = useFlowchartStore((s) => s.boxColors[boxId]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-color-picker]')) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      data-color-picker
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1 flex-wrap"
      style={{ left: x, top: y, width: 140 }}
    >
      {BOX_COLORS.map((color, i) => (
        <button
          key={i}
          className={`w-6 h-6 rounded border ${
            color === currentColor || (!color && !currentColor)
              ? 'ring-2 ring-gray-900 ring-offset-1'
              : 'border-gray-200 hover:border-gray-400'
          }`}
          style={{ backgroundColor: color ?? '#ffffff' }}
          title={color ?? 'None'}
          onClick={() => { setBoxColor(boxId, color); onClose(); }}
        >
          {!color && <span className="text-[9px] text-gray-400 leading-none">x</span>}
        </button>
      ))}
    </div>
  );
}

// ── Constants ──

const PROPERTY_ORDER = ['chisholm', 'heddon-greta', 'bannerman', 'old-bar', 'lennox'];

const LENDER_PREFIX: Record<string, string> = {
  'Beyond Bank': 'BB',
  'NAB': 'NAB',
  'Macquarie': 'MQ',
  'Bankwest': 'BW',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Timeline helpers ──

function toMonth(d: string): number {
  const [y, m] = d.split('-').map(Number);
  return y * 12 + (m ? m - 1 : 0);
}

function monthLabel(m: number): string {
  return `${SHORT_MONTHS[m % 12]} ${Math.floor(m / 12)}`;
}

interface TimePeriod {
  id: string;
  label: string;
  months: Set<number>;
}

function buildPeriods(loans: Loan[]): TimePeriod[] {
  const seen = new Set<number>();
  for (const l of loans) {
    if (l.startDate) seen.add(toMonth(l.startDate));
  }
  const sorted = [...seen].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = groups[groups.length - 1];
    if (sorted[i] - last[last.length - 1] <= 1) {
      last.push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }

  return groups.map((g, i) => {
    const min = Math.min(...g);
    const max = Math.max(...g);
    const hasActive = loans.some(
      (l) => l.status === 'active' && l.startDate && g.includes(toMonth(l.startDate)),
    );
    let label: string;
    if (hasActive) {
      label = `${monthLabel(min)} –`;
    } else if (min === max) {
      label = monthLabel(min);
    } else {
      label = `${monthLabel(min)} – ${monthLabel(max)}`;
    }
    return { id: `p${i}`, label, months: new Set(g) };
  });
}

function periodOf(loan: Loan, periods: TimePeriod[]): string | null {
  if (!loan.startDate) return periods.length ? periods[periods.length - 1].id : null;
  const m = toMonth(loan.startDate);
  for (const p of periods) if (p.months.has(m)) return p.id;
  let best = periods[0]?.id ?? null;
  let bestD = Infinity;
  for (const p of periods) {
    for (const pm of p.months) {
      const d = Math.abs(pm - m);
      if (d < bestD) { bestD = d; best = p.id; }
    }
  }
  return best;
}

// ── Arrow path utility ──

function computeArrowPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const dy = ty - sy;
  if (Math.abs(dx) > Math.abs(dy)) {
    const midX = sx + dx / 2;
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
  }
  const midY = sy + dy / 2;
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}

// ── DraggableBox — drag only, no arrow logic ──

function DraggableBox({
  boxId,
  children,
  className,
}: {
  boxId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const positions = useFlowchartStore((s) => s.positions);
  const setPosition = useFlowchartStore((s) => s.setPosition);
  const drawingArrowFrom = useFlowchartStore((s) => s.drawingArrowFrom);

  const stored = positions[boxId];
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startStored = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  // Capture phase — only block clicks after a drag
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      moved.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, textarea')) return;
    if (e.altKey || drawingArrowFrom) return;

    // Don't drag if event originated from a nested DraggableBox
    const closestBox = target.closest('[data-box-id]');
    if (closestBox && closestBox.getAttribute('data-box-id') !== boxId) return;

    startPos.current = { x: e.clientX, y: e.clientY };
    startStored.current = stored ?? { x: 0, y: 0 };
    moved.current = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (!moved.current && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      if (!moved.current) {
        moved.current = true;
        setDragging(true);
      }
      setDragOffset({
        x: startStored.current.x + dx,
        y: startStored.current.y + dy,
      });
    };

    const handleUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      if (moved.current) {
        const dx = ev.clientX - startPos.current.x;
        const dy = ev.clientY - startPos.current.y;
        setPosition(boxId, {
          x: startStored.current.x + dx,
          y: startStored.current.y + dy,
        });
        setDragOffset({ x: 0, y: 0 });
        setDragging(false);
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [boxId, stored, setPosition, drawingArrowFrom]);

  const transform = dragging && moved.current
    ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
    : stored
    ? `translate(${stored.x}px, ${stored.y}px)`
    : undefined;

  return (
    <div
      data-box-id={boxId}
      className={`${className ?? ''} ${dragging ? 'shadow-lg' : ''}`}
      style={{
        transform,
        position: 'relative',
        zIndex: dragging ? 50 : undefined,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onClickCapture={handleClickCapture}
      onPointerDown={handlePointerDown}
    >
      {children}
    </div>
  );
}

// ── ArrowTarget — wraps each individual small box for arrow drawing ──

function ArrowTarget({
  arrowId,
  children,
  className,
}: {
  arrowId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const drawingArrowFrom = useFlowchartStore((s) => s.drawingArrowFrom);
  const startDrawingArrow = useFlowchartStore((s) => s.startDrawingArrow);
  const addArrow = useFlowchartStore((s) => s.addArrow);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (drawingArrowFrom) {
      e.stopPropagation();
      e.preventDefault();
      if (drawingArrowFrom !== arrowId) {
        addArrow(drawingArrowFrom, arrowId);
      }
      return;
    }
    if (e.altKey) {
      e.stopPropagation();
      e.preventDefault();
      startDrawingArrow(arrowId);
      return;
    }
  }, [arrowId, drawingArrowFrom, startDrawingArrow, addArrow]);

  const isSource = drawingArrowFrom === arrowId;
  const isTarget = drawingArrowFrom && drawingArrowFrom !== arrowId;

  return (
    <div
      data-arrow-id={arrowId}
      className={`${className ?? ''} ${isSource ? 'ring-2 ring-blue-400' : ''}`}
      style={{ cursor: isTarget ? 'crosshair' : undefined }}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

// ── Editable Loan Box ──

function EditableLoanBox({
  loan, ghost, purposeLabel, refiFromLabel, colorBoxId,
}: {
  loan: Loan;
  ghost?: boolean;
  purposeLabel?: string;
  refiFromLabel?: string;
  colorBoxId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const updateLoan = usePortfolioStore((s) => s.updateLoan);
  const deleteLoan = usePortfolioStore((s) => s.deleteLoan);
  const boxColor = useFlowchartStore((s) => s.boxColors[colorBoxId]);
  const isOffset = loan.type === 'offset';
  const prefix = LENDER_PREFIX[loan.lender] || loan.lender;

  let borderClass: string;
  if (ghost) {
    borderClass = 'border-dashed border-gray-300 bg-gray-50 text-gray-500';
  } else if (isOffset) {
    borderClass = 'border-gray-200 bg-gray-50 text-gray-400';
  } else {
    borderClass = 'border-gray-300 bg-white text-gray-900';
  }

  if (editing) {
    return (
      <LoanBoxEditor
        loan={loan}
        onSave={(updates) => { updateLoan(loan.id, updates); setEditing(false); }}
        onCancel={() => setEditing(false)}
        onDelete={() => deleteLoan(loan.id)}
      />
    );
  }

  return (
    <div className="relative">
      <div
        className={`rounded border px-2.5 py-1.5 text-xs ${borderClass} cursor-pointer hover:border-gray-400`}
        style={boxColor ? { backgroundColor: boxColor } : undefined}
        onClick={() => setEditing(true)}
        onContextMenu={(e) => { e.preventDefault(); setPicker({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }); }}
      >
        {refiFromLabel && (
          <p className="text-gray-400 mb-0.5 text-[10px]">&larr; refi from {refiFromLabel}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-gray-500">{prefix} {loan.accountNumber}</span>
          <span className={ghost ? 'font-semibold text-gray-500' : 'font-semibold'}>
            {formatCurrency(loan.currentBalance ?? loan.originalAmount)}
          </span>
          {!isOffset && (
            <span className="text-gray-500">{loan.isInterestOnly ? 'IO' : 'P&I'}</span>
          )}
          {isOffset && <span className="text-gray-400">(offset)</span>}
          {loan.interestRate && !isOffset && (
            <span className="text-gray-400">{loan.interestRate}%</span>
          )}
          {loan.needsConfirmation && <AlertTriangle size={11} className="text-red-600" />}
        </div>
        {purposeLabel && (
          <p className="text-gray-400 mt-0.5 text-[10px]">{purposeLabel}</p>
        )}
      </div>
      {picker && (
        <ColorPicker boxId={colorBoxId} x={picker.x} y={picker.y} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function LoanBoxEditor({
  loan, onSave, onCancel, onDelete,
}: {
  loan: Loan;
  onSave: (updates: Partial<Loan>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [balance, setBalance] = useState(String(loan.currentBalance ?? loan.originalAmount));
  const [rate, setRate] = useState(String(loan.interestRate ?? ''));
  const [acct, setAcct] = useState(loan.accountNumber);
  const [purpose, setPurpose] = useState(loan.purpose);
  const [notes, setNotes] = useState(loan.notes ?? '');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const properties = usePortfolioStore((s) => s.properties);
  const [lender, setLender] = useState(loan.lender);
  const [purposePropId, setPurposePropId] = useState(loan.purposePropertyId ?? '');

  const handleSave = () => {
    const updates: Partial<Loan> = {
      accountNumber: acct,
      purpose,
      lender,
      purposePropertyId: purposePropId || undefined,
      notes: notes || undefined,
    };
    const bal = parseFloat(balance);
    if (!isNaN(bal)) updates.currentBalance = bal;
    const r = parseFloat(rate);
    if (!isNaN(r)) updates.interestRate = r;
    onSave(updates);
  };

  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  return (
    <div className="rounded border-2 border-blue-400 bg-white px-2 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-1 mb-1">
        <div>
          <label className="text-[10px] text-gray-400">Account</label>
          <input className={inputClass} value={acct} onChange={(e) => setAcct(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Balance</label>
          <input className={inputClass} type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Rate %</label>
          <input className={inputClass} type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Lender</label>
          <input className={inputClass} value={lender} onChange={(e) => setLender(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Purpose text</label>
          <input className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Purpose property</label>
          <select className={inputClass} value={purposePropId} onChange={(e) => setPurposePropId(e.target.value)}>
            <option value="">Same as security</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.nickname}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mb-1">
        <label className="text-[10px] text-gray-400">Notes</label>
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-1 justify-between">
        <button onClick={onDelete} className="px-2 py-0.5 text-[10px] text-red-500 hover:text-red-700">Delete</button>
        <div className="flex gap-1">
          <button onClick={onCancel} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={handleSave} className="px-2 py-0.5 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Editable Purchase Item ──

function EditablePurchaseItem({
  item, propertyId, itemIndex, colorBoxId,
}: {
  item: PurchaseItemType;
  propertyId: string;
  itemIndex: number;
  colorBoxId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const updatePurchaseItem = usePortfolioStore((s) => s.updatePurchaseItem);
  const deletePurchaseItem = usePortfolioStore((s) => s.deletePurchaseItem);
  const boxColor = useFlowchartStore((s) => s.boxColors[colorBoxId]);

  if (editing) {
    return (
      <PurchaseItemEditor
        item={item}
        onSave={(updates) => { updatePurchaseItem(propertyId, itemIndex, updates); setEditing(false); }}
        onCancel={() => setEditing(false)}
        onDelete={() => deletePurchaseItem(propertyId, itemIndex)}
      />
    );
  }

  const isCash = item.type === 'cash';
  return (
    <div className="relative">
      <div
        title={item.tooltip}
        className={`rounded border px-2 py-1 text-xs cursor-pointer hover:border-gray-400 ${
          isCash
            ? 'border-green-300 bg-green-50 text-green-800'
            : 'border-gray-300 bg-white text-gray-900'
        }`}
        style={boxColor ? { backgroundColor: boxColor } : undefined}
        onClick={() => setEditing(true)}
        onContextMenu={(e) => { e.preventDefault(); setPicker({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }); }}
      >
        <div className={isCash ? 'text-green-600' : 'text-gray-500'}>{item.label}</div>
        <div className="font-semibold">{formatCurrency(item.amount)}</div>
      </div>
      {picker && (
        <ColorPicker boxId={colorBoxId} x={picker.x} y={picker.y} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function PurchaseItemEditor({
  item, onSave, onCancel, onDelete,
}: {
  item: PurchaseItemType;
  onSave: (updates: Partial<PurchaseItemType>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState(String(item.amount));
  const [type, setType] = useState<'bank' | 'cash'>(item.type);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  return (
    <div className="rounded border-2 border-blue-400 bg-white px-2 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1">
        <label className="text-[10px] text-gray-400">Label</label>
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-1 mb-1">
        <div>
          <label className="text-[10px] text-gray-400">Amount</label>
          <input className={inputClass} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Type</label>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as 'bank' | 'cash')}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </div>
      </div>
      <div className="flex gap-1 justify-between">
        <button onClick={onDelete} className="px-2 py-0.5 text-[10px] text-red-500 hover:text-red-700">Delete</button>
        <div className="flex gap-1">
          <button onClick={onCancel} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => {
              const amt = parseFloat(amount);
              onSave({ label, type, ...(isNaN(amt) ? {} : { amount: amt }) });
            }}
            className="px-2 py-0.5 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700"
          >Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Editable Buffer ──

function EditableBuffer({
  buffer, propertyId, colorBoxId,
}: {
  buffer: { label: string; amount: number; tooltip?: string };
  propertyId: string;
  colorBoxId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const updatePurchaseBuffer = usePortfolioStore((s) => s.updatePurchaseBuffer);
  const updatePurchaseBreakdown = usePortfolioStore((s) => s.updatePurchaseBreakdown);
  const boxColor = useFlowchartStore((s) => s.boxColors[colorBoxId]);

  if (editing) {
    return (
      <BufferEditor
        buffer={buffer}
        onSave={(updates) => { updatePurchaseBuffer(propertyId, updates); setEditing(false); }}
        onCancel={() => setEditing(false)}
        onDelete={() => updatePurchaseBreakdown(propertyId, { buffer: undefined })}
      />
    );
  }

  return (
    <div className="relative">
      <div
        title={buffer.tooltip}
        className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-800 cursor-pointer hover:border-green-400"
        style={boxColor ? { backgroundColor: boxColor } : undefined}
        onClick={() => setEditing(true)}
        onContextMenu={(e) => { e.preventDefault(); setPicker({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }); }}
      >
        <div className="text-green-600">{buffer.label}</div>
        <div className="font-semibold">{formatCurrency(buffer.amount)}</div>
      </div>
      {picker && (
        <ColorPicker boxId={colorBoxId} x={picker.x} y={picker.y} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function BufferEditor({
  buffer, onSave, onCancel, onDelete,
}: {
  buffer: { label: string; amount: number };
  onSave: (updates: Partial<{ label: string; amount: number }>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(buffer.label);
  const [amount, setAmount] = useState(String(buffer.amount));

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  return (
    <div className="rounded border-2 border-blue-400 bg-white px-2 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1">
        <label className="text-[10px] text-gray-400">Label</label>
        <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="mb-1">
        <label className="text-[10px] text-gray-400">Amount</label>
        <input className={inputClass} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex gap-1 justify-between">
        <button onClick={onDelete} className="px-2 py-0.5 text-[10px] text-red-500 hover:text-red-700">Delete</button>
        <div className="flex gap-1">
          <button onClick={onCancel} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => {
              const amt = parseFloat(amount);
              onSave({ label, ...(isNaN(amt) ? {} : { amount: amt }) });
            }}
            className="px-2 py-0.5 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700"
          >Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Editable Property Label ──

function EditablePropertyLabel({ property }: { property: Property }) {
  const [editing, setEditing] = useState(false);
  const updateProperty = usePortfolioStore((s) => s.updateProperty);
  const entities = usePortfolioStore((s) => s.entities);
  const [nickname, setNickname] = useState(property.nickname);
  const [entityId, setEntityId] = useState(property.entityId);

  useEffect(() => {
    setNickname(property.nickname);
    setEntityId(property.entityId);
  }, [property.nickname, property.entityId]);

  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  if (editing) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <div>
          <label className="text-[10px] text-gray-400">Nickname</label>
          <input className={inputClass} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Entity</label>
          <select className={inputClass} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.displayName}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 justify-end">
          <button onClick={() => setEditing(false)} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
          <button
            onClick={() => { updateProperty(property.id, { nickname, entityId }); setEditing(false); }}
            className="px-2 py-0.5 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700"
          >Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1" onClick={() => setEditing(true)}>
      <span className="font-semibold text-gray-900 text-sm leading-tight">
        {property.nickname}
      </span>
      <EntityBadge entityId={property.entityId} size="sm" />
    </div>
  );
}

// ── Editable Period Header ──

function EditablePeriodHeader({ periodId, defaultLabel }: { periodId: string; defaultLabel: string }) {
  const overrides = useFlowchartStore((s) => s.periodLabelOverrides);
  const setPeriodLabel = useFlowchartStore((s) => s.setPeriodLabel);
  const [editing, setEditing] = useState(false);
  const label = overrides[periodId] ?? defaultLabel;
  const [value, setValue] = useState(label);

  useEffect(() => { setValue(overrides[periodId] ?? defaultLabel); }, [overrides, periodId, defaultLabel]);

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <input
          className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded text-center focus:outline-none"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setPeriodLabel(periodId, value); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => { setPeriodLabel(periodId, value); setEditing(false); }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="text-xs font-semibold text-gray-900 whitespace-nowrap cursor-pointer hover:bg-gray-100 rounded px-1"
      onClick={() => setEditing(true)}
    >
      {label}
    </div>
  );
}

// ── Editable Purchase Total ──

function EditablePurchaseTotal({ propertyId, totalCost }: { propertyId: string; totalCost: number }) {
  const [editing, setEditing] = useState(false);
  const updatePurchaseBreakdown = usePortfolioStore((s) => s.updatePurchaseBreakdown);
  const [value, setValue] = useState(String(totalCost));

  useEffect(() => { setValue(String(totalCost)); }, [totalCost]);

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1 mb-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] text-gray-500 font-semibold">Total</span>
        <input
          className="w-24 px-1 py-0 text-[10px] border border-blue-400 rounded focus:outline-none"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const amt = parseFloat(value);
              if (!isNaN(amt)) updatePurchaseBreakdown(propertyId, { totalCost: amt });
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => {
            const amt = parseFloat(value);
            if (!isNaN(amt)) updatePurchaseBreakdown(propertyId, { totalCost: amt });
            setEditing(false);
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="text-[10px] text-gray-500 font-semibold mb-1.5 px-1 cursor-pointer hover:bg-gray-100 rounded"
      onClick={() => setEditing(true)}
    >
      Total {formatCurrency(totalCost)}
    </div>
  );
}

// ── Purchase Wrapper ──

function PurchaseWrapper({ totalCost, propertyId, children }: { totalCost: number; propertyId: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-gray-300 bg-gray-50/50 p-1.5">
      <EditablePurchaseTotal propertyId={propertyId} totalCost={totalCost} />
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  );
}

// ── Add Buttons ──

function AddLoanButton({ propertyId, entityId, periodId, periods }: { propertyId: string; entityId: string; periodId: string; periods: TimePeriod[] }) {
  const [adding, setAdding] = useState(false);
  const addLoan = usePortfolioStore((s) => s.addLoan);

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
      >
        <Plus size={10} /> Loan
      </button>
    );
  }

  const period = periods.find((p) => p.id === periodId);
  const firstMonth = period ? Math.min(...period.months) : 0;
  const year = Math.floor(firstMonth / 12);
  const month = (firstMonth % 12) + 1;
  const defaultDate = `${year}-${String(month).padStart(2, '0')}`;

  const id = `loan-new-${Date.now()}`;
  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  return (
    <NewLoanForm
      defaultDate={defaultDate}
      onSave={(loan) => { addLoan({ ...loan, id, propertyId, entityId }); setAdding(false); }}
      onCancel={() => setAdding(false)}
    />
  );
}

function NewLoanForm({ defaultDate, onSave, onCancel }: {
  defaultDate: string;
  onSave: (loan: Loan) => void;
  onCancel: () => void;
}) {
  const properties = usePortfolioStore((s) => s.properties);
  const [acct, setAcct] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [lender, setLender] = useState('Bankwest');
  const [purpose, setPurpose] = useState('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const inputClass = 'w-full px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400';

  return (
    <div className="rounded border-2 border-blue-400 bg-white px-2 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
      <div className="text-[10px] text-gray-500 font-semibold mb-1">New Loan</div>
      <div className="grid grid-cols-2 gap-1 mb-1">
        <div>
          <label className="text-[10px] text-gray-400">Account #</label>
          <input className={inputClass} value={acct} onChange={(e) => setAcct(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Balance</label>
          <input className={inputClass} type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Rate %</label>
          <input className={inputClass} type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400">Lender</label>
          <input className={inputClass} value={lender} onChange={(e) => setLender(e.target.value)} />
        </div>
      </div>
      <div className="mb-1">
        <label className="text-[10px] text-gray-400">Purpose</label>
        <input className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </div>
      <div className="flex gap-1 justify-end">
        <button onClick={onCancel} className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
        <button
          onClick={() => {
            const bal = parseFloat(balance);
            const r = parseFloat(rate);
            onSave({
              id: '',
              propertyId: '',
              entityId: '',
              lender,
              accountNumber: acct || '0000',
              type: 'interest_only',
              status: 'active',
              originalAmount: isNaN(bal) ? 0 : bal,
              currentBalance: isNaN(bal) ? undefined : bal,
              interestRate: isNaN(r) ? undefined : r,
              isInterestOnly: true,
              purpose: purpose || 'TBD',
              startDate: defaultDate,
              sourceInfo: { confidence: 'user_provided', source: 'Manual entry' },
            });
          }}
          className="px-2 py-0.5 text-[10px] bg-gray-900 text-white rounded hover:bg-gray-700"
        >Add</button>
      </div>
    </div>
  );
}

function AddPurchaseItemButton({ propertyId }: { propertyId: string }) {
  const addPurchaseItem = usePortfolioStore((s) => s.addPurchaseItem);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        addPurchaseItem(propertyId, { label: 'New item', amount: 0, type: 'bank' });
      }}
      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
    >
      <Plus size={10} /> Item
    </button>
  );
}

function AddGroupButton({ propertyId, periodId, periods }: { propertyId: string; periodId: string; periods: TimePeriod[] }) {
  const addPurchaseBreakdown = usePortfolioStore((s) => s.addPurchaseBreakdown);

  const period = periods.find((p) => p.id === periodId);
  const firstMonth = period ? Math.min(...period.months) : 0;
  const year = Math.floor(firstMonth / 12);
  const month = (firstMonth % 12) + 1;
  const date = `${year}-${String(month).padStart(2, '0')}`;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        addPurchaseBreakdown({
          propertyId,
          date,
          totalCost: 0,
          loanId: '',
          items: [],
        });
      }}
      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
    >
      <Plus size={10} /> Group
    </button>
  );
}

// ── Toolbar ──

function FlowchartToolbar() {
  const clearPositions = useFlowchartStore((s) => s.clearPositions);
  const clearArrows = useFlowchartStore((s) => s.clearArrows);
  const drawingArrowFrom = useFlowchartStore((s) => s.drawingArrowFrom);
  const cancelDrawingArrow = useFlowchartStore((s) => s.cancelDrawingArrow);

  return (
    <div className="flex items-center gap-2 mb-2">
      <button
        onClick={clearPositions}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
      >
        <RotateCcw size={12} />
        Reset Layout
      </button>
      <button
        onClick={clearArrows}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
      >
        <Trash2 size={12} />
        Clear Arrows
      </button>
      {drawingArrowFrom && (
        <span className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-50 rounded">
          Drawing arrow... click a target box or
          <button onClick={cancelDrawingArrow} className="underline hover:text-blue-900">Esc</button>
        </span>
      )}
      <span className="text-[10px] text-gray-400 ml-auto">
        Alt+click to draw arrows &middot; Drag to reposition &middot; Click to edit &middot; Right-click to color
      </span>
    </div>
  );
}

// ── Main Component ──

export function LoanFlowchart() {
  const { properties, loans, purchaseBreakdowns } = usePortfolioStore();
  const { activeEntityId } = useUIStore();
  const getProperty = usePortfolioStore((s) => s.getProperty);

  const storeArrows = useFlowchartStore((s) => s.arrows);
  const storePositions = useFlowchartStore((s) => s.positions);
  const removeArrow = useFlowchartStore((s) => s.removeArrow);
  const drawingArrowFrom = useFlowchartStore((s) => s.drawingArrowFrom);
  const cancelDrawingArrow = useFlowchartStore((s) => s.cancelDrawingArrow);
  const undo = useFlowchartStore((s) => s.undo);

  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);
  const [renderedArrows, setRenderedArrows] = useState<{ id: string; path: string }[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const allLoans = loans;
  const orderedProperties = PROPERTY_ORDER
    .map((id) => properties.find((p) => p.id === id))
    .filter((p): p is Property => !!p);

  const periods = useMemo(() => buildPeriods(allLoans), [allLoans]);

  const loanPeriodMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of allLoans) {
      const pid = periodOf(l, periods);
      if (pid) m.set(l.id, pid);
    }
    return m;
  }, [allLoans, periods]);

  const purchaseByPropertyAndPeriod = useMemo(() => {
    const m = new Map<string, typeof purchaseBreakdowns[number]>();
    for (const pd of purchaseBreakdowns) {
      const cm = toMonth(pd.date);
      for (const p of periods) {
        if (p.months.has(cm)) {
          m.set(`${pd.propertyId}:${p.id}`, pd);
        }
      }
    }
    return m;
  }, [periods, purchaseBreakdowns]);

  const crossSecuredLoans = useMemo(() =>
    allLoans.filter((l) => l.purposePropertyId && l.purposePropertyId !== l.propertyId),
    [allLoans],
  );

  const isDimmed = (entityId: string) => activeEntityId ? entityId !== activeEntityId : false;

  const propertyHasLoans = (propertyId: string) =>
    allLoans.some((l) =>
      l.propertyId === propertyId ||
      (l.purposePropertyId && l.purposePropertyId === propertyId),
    );

  // ── Arrow recalculation ──

  const recalculateArrows = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const result: { id: string; path: string }[] = [];

    for (const arrow of storeArrows) {
      const sourceEl = container.querySelector(`[data-arrow-id="${arrow.sourceBoxId}"]`);
      const targetEl = container.querySelector(`[data-arrow-id="${arrow.targetBoxId}"]`);
      if (!sourceEl || !targetEl) continue;

      const sr = sourceEl.getBoundingClientRect();
      const tr = targetEl.getBoundingClientRect();

      // Use box centers to determine direction
      const scx = sr.left + sr.width / 2 - containerRect.left;
      const scy = sr.top + sr.height / 2 - containerRect.top;
      const tcx = tr.left + tr.width / 2 - containerRect.left;
      const tcy = tr.top + tr.height / 2 - containerRect.top;
      const dx = tcx - scx;
      const dy = tcy - scy;

      let sx: number, sy: number, tx: number, ty: number;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal: exit right/left edge
        if (dx > 0) {
          sx = sr.right - containerRect.left;
          sy = scy;
          tx = tr.left - containerRect.left;
          ty = tcy;
        } else {
          sx = sr.left - containerRect.left;
          sy = scy;
          tx = tr.right - containerRect.left;
          ty = tcy;
        }
      } else {
        // Vertical: exit bottom/top edge
        if (dy > 0) {
          sx = scx;
          sy = sr.bottom - containerRect.top;
          tx = tcx;
          ty = tr.top - containerRect.top;
        } else {
          sx = scx;
          sy = sr.top - containerRect.top;
          tx = tcx;
          ty = tr.bottom - containerRect.top;
        }
      }

      result.push({ id: arrow.id, path: computeArrowPath(sx, sy, tx, ty) });
    }

    setRenderedArrows(result);
  }, [storeArrows]);

  useEffect(() => {
    const frame = requestAnimationFrame(recalculateArrows);
    return () => cancelAnimationFrame(frame);
  }, [recalculateArrows, storePositions]);

  useEffect(() => {
    const ro = new ResizeObserver(() => recalculateArrows());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', recalculateArrows);
    return () => { ro.disconnect(); window.removeEventListener('resize', recalculateArrows); };
  }, [recalculateArrows]);

  // Delayed recalc after data changes
  useEffect(() => {
    const t = setTimeout(recalculateArrows, 150);
    return () => clearTimeout(t);
  }, [recalculateArrows, properties, loans, purchaseBreakdowns]);

  // ── Keyboard: Escape + Delete ──

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (drawingArrowFrom) cancelDrawingArrow();
        setSelectedArrowId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedArrowId) {
        if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
        removeArrow(selectedArrowId);
        setSelectedArrowId(null);
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
        e.preventDefault();
        undo();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawingArrowFrom, cancelDrawingArrow, selectedArrowId, removeArrow, undo]);

  // ── Mouse tracking for arrow drawing preview ──

  useEffect(() => {
    if (!drawingArrowFrom || !containerRef.current) {
      setCursorPos(null);
      return;
    }
    const container = containerRef.current;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    container.addEventListener('mousemove', handleMouseMove);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      setCursorPos(null);
    };
  }, [drawingArrowFrom]);

  // ── Render ──

  const visibleProperties = orderedProperties.filter((p) => propertyHasLoans(p.id));
  const periodIds = periods.map((p) => p.id);

  // Source box edge point for arrow drawing preview line
  let drawingSourceEdge: { x: number; y: number } | null = null;
  if (drawingArrowFrom && cursorPos && containerRef.current) {
    const sourceEl = containerRef.current.querySelector(`[data-arrow-id="${drawingArrowFrom}"]`);
    if (sourceEl) {
      const sr = sourceEl.getBoundingClientRect();
      const cr = containerRef.current.getBoundingClientRect();
      const scx = sr.left + sr.width / 2 - cr.left;
      const scy = sr.top + sr.height / 2 - cr.top;
      const dx = cursorPos.x - scx;
      const dy = cursorPos.y - scy;

      if (Math.abs(dx) > Math.abs(dy)) {
        drawingSourceEdge = {
          x: dx > 0 ? sr.right - cr.left : sr.left - cr.left,
          y: scy,
        };
      } else {
        drawingSourceEdge = {
          x: scx,
          y: dy > 0 ? sr.bottom - cr.top : sr.top - cr.top,
        };
      }
    }
  }

  return (
    <div>
      <FlowchartToolbar />
      <div
        ref={containerRef}
        className="relative overflow-x-auto border border-gray-200 rounded-lg bg-white"
        onClick={() => setSelectedArrowId(null)}
      >
        <div
          className="grid min-w-[700px]"
          style={{ gridTemplateColumns: `160px repeat(${periods.length}, 1fr)` }}
        >
          {/* Header row */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5" />
          {periods.map((period) => (
            <div
              key={period.id}
              className="bg-gray-50 border-b border-l border-gray-200 px-3 py-2.5 text-center"
            >
              <EditablePeriodHeader periodId={period.id} defaultLabel={period.label} />
            </div>
          ))}

          {/* Property rows */}
          {visibleProperties.map((property, propIdx) => {
            const securedLoans = allLoans.filter((l) => l.propertyId === property.id);
            const ghostLoans = crossSecuredLoans.filter((l) => l.purposePropertyId === property.id);
            const dimmed = isDimmed(property.entityId);
            const isLast = propIdx === visibleProperties.length - 1;
            const isLennox = property.id === 'lennox';

            return (
              <div key={property.id} className="contents">
                <div
                  className={`px-4 py-3 flex flex-col justify-center transition-opacity ${
                    !isLast ? 'border-b border-gray-200' : ''
                  } ${dimmed ? 'opacity-35' : ''}`}
                >
                  <EditablePropertyLabel property={property} />
                  {isLennox && ghostLoans.length > 0 && securedLoans.length === 0 && (
                    <span className="text-[10px] text-gray-400 mt-0.5">No direct loans</span>
                  )}
                </div>

                {periodIds.map((pid) => {
                  const cellSecured = securedLoans
                    .filter((l) => loanPeriodMap.get(l.id) === pid)
                    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

                  const cellGhosts = ghostLoans
                    .filter((l) => loanPeriodMap.get(l.id) === pid)
                    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

                  const purchase = purchaseByPropertyAndPeriod.get(`${property.id}:${pid}`);
                  const purchaseLoanIds = purchase ? new Set([purchase.loanId]) : new Set<string>();

                  const loanBoxes = cellSecured
                    .filter((l) => !purchase || !purchaseLoanIds.has(l.id))
                    .map((loan) => {
                      const hasPurposeElsewhere =
                        loan.purposePropertyId && loan.purposePropertyId !== loan.propertyId;
                      const purposeProp = hasPurposeElsewhere
                        ? getProperty(loan.purposePropertyId!)
                        : null;

                      // Show all refi-from labels (no auto-arrows to hide them)
                      const refiFromLabels: string[] = [];
                      if (loan.refinancedFromId) {
                        const fromLoan = allLoans.find((l) => l.id === loan.refinancedFromId);
                        if (fromLoan) {
                          const pre = LENDER_PREFIX[fromLoan.lender] || fromLoan.lender;
                          refiFromLabels.push(`${pre} $${Math.round((fromLoan.currentBalance ?? fromLoan.originalAmount) / 1000)}K`);
                        }
                      }
                      for (const src of allLoans) {
                        if (src.refinancedToId === loan.id && src.id !== loan.refinancedFromId) {
                          const pre = LENDER_PREFIX[src.lender] || src.lender;
                          refiFromLabels.push(`${pre} $${Math.round((src.currentBalance ?? src.originalAmount) / 1000)}K`);
                        }
                      }

                      return (
                        <DraggableBox key={loan.id} boxId={`loan-${loan.id}`}>
                          <ArrowTarget arrowId={`loan-${loan.id}`}>
                            <EditableLoanBox
                              loan={loan}
                              colorBoxId={`loan-${loan.id}`}
                              purposeLabel={purposeProp ? `purpose → ${purposeProp.nickname}` : undefined}
                              refiFromLabel={refiFromLabels.length > 0 ? refiFromLabels.join(' + ') : undefined}
                            />
                          </ArrowTarget>
                        </DraggableBox>
                      );
                    });

                  return (
                    <div
                      key={pid}
                      className={`border-l border-gray-200 px-3 py-2.5 flex flex-col gap-1.5 justify-center transition-opacity ${
                        !isLast ? 'border-b border-gray-200' : ''
                      } ${dimmed ? 'opacity-35' : ''}`}
                    >
                      {/* Ghost boxes */}
                      {cellGhosts.map((loan) => {
                        const securityProp = getProperty(loan.propertyId);
                        return (
                          <DraggableBox key={`${loan.id}-ghost`} boxId={`ghost-${loan.id}`}>
                            <ArrowTarget arrowId={`ghost-${loan.id}`}>
                              <EditableLoanBox
                                loan={loan}
                                ghost
                                colorBoxId={`ghost-${loan.id}`}
                                purposeLabel={`interest → ${property.nickname} (secured: ${securityProp?.nickname ?? '?'})`}
                              />
                            </ArrowTarget>
                          </DraggableBox>
                        );
                      })}

                      {/* Purchase breakdown group */}
                      {purchase ? (
                        <DraggableBox boxId={`group-${property.id}-${pid}`}>
                          <PurchaseWrapper totalCost={purchase.totalCost} propertyId={property.id}>
                            {purchase.items.map((item, i) => (
                              <ArrowTarget key={`pi-${property.id}-${i}`} arrowId={`pi-${property.id}-${i}`}>
                                <EditablePurchaseItem
                                  item={item}
                                  propertyId={property.id}
                                  itemIndex={i}
                                  colorBoxId={`pi-${property.id}-${i}`}
                                />
                              </ArrowTarget>
                            ))}
                            {loanBoxes}
                            <AddPurchaseItemButton propertyId={property.id} />
                          </PurchaseWrapper>
                        </DraggableBox>
                      ) : (
                        <>
                          {loanBoxes}
                          {/* Only show Add Group when there are loan boxes to group */}
                          {(cellSecured.length > 0 || cellGhosts.length > 0) && (
                            <AddGroupButton propertyId={property.id} periodId={pid} periods={periods} />
                          )}
                        </>
                      )}

                      {/* Buffer */}
                      {purchase?.buffer && (
                        <DraggableBox boxId={`buffer-${property.id}`}>
                          <ArrowTarget arrowId={`buffer-${property.id}`}>
                            <EditableBuffer
                              buffer={purchase.buffer}
                              propertyId={property.id}
                              colorBoxId={`buffer-${property.id}`}
                            />
                          </ArrowTarget>
                        </DraggableBox>
                      )}

                      {/* Add loan button */}
                      <AddLoanButton propertyId={property.id} entityId={property.entityId} periodId={pid} periods={periods} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* SVG overlay for manual arrows */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ zIndex: 10, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="fc-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#9ca3af" />
            </marker>
            <marker id="fc-arrow-selected" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#ef4444" />
            </marker>
          </defs>
          {renderedArrows.map((a) => {
            const isSelected = selectedArrowId === a.id;
            return (
              <g key={a.id}>
                {/* Invisible hit area */}
                <path
                  d={a.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedArrowId(isSelected ? null : a.id);
                  }}
                />
                {/* Visible arrow */}
                <path
                  d={a.path}
                  fill="none"
                  stroke={isSelected ? '#ef4444' : '#9ca3af'}
                  strokeWidth={isSelected ? 2 : 1.5}
                  strokeDasharray={isSelected ? undefined : '6 3'}
                  markerEnd={isSelected ? 'url(#fc-arrow-selected)' : 'url(#fc-arrow)'}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            );
          })}

          {/* Arrow drawing preview line */}
          {drawingSourceEdge && cursorPos && (
            <line
              x1={drawingSourceEdge.x}
              y1={drawingSourceEdge.y}
              x2={cursorPos.x}
              y2={cursorPos.y}
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
