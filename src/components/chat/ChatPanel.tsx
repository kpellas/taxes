import { MessageCircle, X, Send, Loader2, Trash2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useTaxReviewStore } from '../../store/taxReviewStore';
import { api } from '../../api/client';

export function ChatPanel() {
  const {
    messages, isLoading, isOpen, activePropertyContext,
    addMessage, appendToMessage, setLoading, setOpen, toggle, clearMessages,
  } = useChatStore();
  const properties = usePortfolioStore((s) => s.properties);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProperty = activePropertyContext
    ? properties.find(p => p.id === activePropertyContext)
    : null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    addMessage({ role: 'user', content: text, propertyId: activePropertyContext || undefined });

    setLoading(true);
    const assistantId = addMessage({ role: 'assistant', content: '' });

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      // Snapshot current store data so the chatbot sees everything the user sees
      const portfolio = usePortfolioStore.getState();
      const taxReview = useTaxReviewStore.getState();

      const storeSnapshot = {
        entities: portfolio.entities.map(e => ({ id: e.id, name: e.displayName, type: e.type, owners: e.owners })),
        properties: portfolio.properties.map(p => ({
          id: p.id, nickname: p.nickname, entityId: p.entityId, address: `${p.address}, ${p.suburb} ${p.state}`,
          status: p.status, ownership: p.ownership, purchaseDate: p.purchaseDate, purchasePrice: p.purchasePrice,
          weeklyRent: p.weeklyRent, annualRent: p.annualRent, managementCompany: p.managementCompany,
          insuranceAnnual: p.insuranceAnnual, councilRatesAnnual: p.councilRatesAnnual,
          leaseStart: p.leaseStart, leaseEnd: p.leaseEnd, depreciationScheduleAvailable: p.depreciationScheduleAvailable,
          currentValue: p.currentValue, loanIds: p.loanIds,
        })),
        loans: portfolio.loans.map(l => ({
          id: l.id, entityId: l.entityId, propertyId: l.propertyId, lender: l.lender,
          accountNumber: l.accountNumber, type: l.type, status: l.status,
          originalAmount: l.originalAmount, currentBalance: l.currentBalance,
          interestRate: l.interestRate, isInterestOnly: l.isInterestOnly,
          interestPaidFY: l.interestPaidFY, purpose: l.purpose, purposePropertyId: l.purposePropertyId,
        })),
        taxReturns: taxReview.returns.map(r => ({
          id: r.id, personName: r.personName, financialYear: r.financialYear,
          totalIncome: r.totalIncome, totalDeductions: r.totalDeductions,
          taxableIncome: r.taxableIncome, refundOrPayable: r.refundOrPayable,
          notes: r.notes,
          lineItems: r.lineItems.map(li => ({
            label: li.label, section: li.section, category: li.category,
            amountLodged: li.amountLodged, propertyId: li.propertyId,
            ownershipUsed: li.ownershipUsed, ownershipCorrect: li.ownershipCorrect,
            amountCorrect: li.amountCorrect, discrepancy: li.discrepancy,
          })),
        })),
      };

      await api.chat.send(
        text,
        {
          propertyId: activePropertyContext || undefined,
          history,
          storeSnapshot,
        },
        (chunk) => appendToMessage(assistantId, chunk),
        () => setLoading(false),
        (error) => {
          appendToMessage(assistantId, `\n\n[Error: ${error}]`);
          setLoading(false);
        },
      );
    } catch (err) {
      appendToMessage(assistantId, '\n\n[Connection error. Is the server running?]');
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={toggle}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center z-50"
        title="Ask AI about your portfolio"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Portfolio Assistant</h3>
          {activeProperty && (
            <p className="text-xs text-blue-500">Focused on: {activeProperty.nickname}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={clearMessages} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Clear chat">
            <Trash2 size={14} />
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Ask about your properties, loans, tax deductions...</p>
            <div className="mt-3 space-y-1.5">
              {[
                'What is the total debt on Chisholm?',
                'Which loans are deductible against Lennox?',
                'What documents am I missing?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="block w-full text-left text-xs text-blue-500 hover:text-blue-700 px-3 py-1.5 rounded hover:bg-blue-50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content || (isLoading ? '...' : '')}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-30 hover:bg-blue-700 transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
