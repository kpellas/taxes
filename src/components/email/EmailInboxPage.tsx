import { useEffect, useState } from 'react';
import { Mail, RefreshCw, Paperclip, ChevronDown, ChevronRight, AlertTriangle, FileText, ExternalLink } from 'lucide-react';
import { useEmailStore } from '../../store/emailStore';
import { usePortfolioStore } from '../../store/portfolioStore';
import { api } from '../../api/client';
import type { IngestedEmailSummary } from '../../api/client';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  if (confidence === 'high') return <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" title="High confidence" />;
  if (confidence === 'medium') return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="Medium confidence" />;
  if (confidence === 'low') return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" title="Low confidence" />;
  return <span className="w-2 h-2 rounded-full bg-red-400 inline-block" title="No match" />;
}

function PropertySelect({ emailId, currentPropertyId }: { emailId: string; currentPropertyId: string | null }) {
  const properties = usePortfolioStore((s) => s.properties);
  const updateProperty = useEmailStore((s) => s.updateProperty);

  return (
    <select
      value={currentPropertyId || ''}
      onChange={(e) => updateProperty(emailId, e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700"
    >
      <option value="">Unmatched</option>
      {properties.map((p) => (
        <option key={p.id} value={p.id}>{p.nickname}</option>
      ))}
    </select>
  );
}

function EmailRow({ email }: { email: IngestedEmailSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [bodyText, setBodyText] = useState<string | null>(null);
  const properties = usePortfolioStore((s) => s.properties);
  const property = properties.find((p) => p.id === email.propertyId);

  const toggleExpand = async () => {
    if (!expanded && !bodyText) {
      try {
        const detail = await api.email.detail(email.id);
        setBodyText(detail.bodyText);
      } catch {
        setBodyText('(failed to load email body)');
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        onClick={toggleExpand}
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm"
      >
        <button className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className="text-xs text-gray-400 w-20 shrink-0">{formatDate(email.date)}</span>

        <span className="text-gray-700 font-medium w-40 truncate shrink-0" title={email.from}>
          {email.fromName}
        </span>

        <span className="text-gray-900 flex-1 truncate">
          {email.subject}
          {email.isForwarded && <span className="text-gray-400 ml-1">(fwd)</span>}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {email.attachments.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
              <Paperclip size={11} /> {email.attachments.length}
            </span>
          )}

          <ConfidenceDot confidence={email.matchConfidence} />

          <span className="text-xs w-24 text-right">
            {property ? (
              <span className="text-gray-600">{property.nickname}</span>
            ) : (
              <span className="text-red-600">Unmatched</span>
            )}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-12 space-y-3">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            <div>From: <span className="text-gray-700">{email.fromName} &lt;{email.from}&gt;</span></div>
            <div>Date: <span className="text-gray-700">{formatDate(email.date)} {formatTime(email.date)}</span></div>
            {email.isForwarded && email.originalSender && (
              <div>Original sender: <span className="text-gray-700">{email.originalSender}</span></div>
            )}
            <div className="flex items-center gap-2">
              Property:
              <PropertySelect emailId={email.id} currentPropertyId={email.propertyId} />
              <span className="text-gray-400 text-xs">({email.matchReason})</span>
            </div>
          </div>

          {/* Body */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono text-xs">
            {bodyText || email.bodyPreview || '(no body)'}
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={api.upload.getServeUrl(att.savedPath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs hover:bg-gray-100 border border-gray-200"
                  >
                    <FileText size={11} />
                    <span className="max-w-[200px] truncate">{att.filename}</span>
                    <span className="text-gray-400">({Math.round(att.size / 1024)}KB)</span>
                    <ExternalLink size={9} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailInboxPage() {
  const { emails, loading, checking, lastChecked, fetchEmails, checkNow } = useEmailStore();
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleCheck = async () => {
    const result = await checkNow();
    if (result.processed > 0) {
      setCheckResult(`${result.processed} new email${result.processed > 1 ? 's' : ''} processed`);
    } else {
      setCheckResult('No new emails');
    }
    setTimeout(() => setCheckResult(null), 4000);
  };

  const unmatched = emails.filter((e) => !e.propertyId).length;
  const withAttachments = emails.filter((e) => e.attachments.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail size={24} /> Email Inbox
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            finances@kellypellas.com
            {lastChecked && ` — last checked ${formatDate(lastChecked)} ${formatTime(lastChecked)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {checkResult && (
            <span className="text-sm text-gray-600">{checkResult}</span>
          )}
          <button
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check Now'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-500">{emails.length} emails</span>
        {withAttachments > 0 && (
          <span className="text-gray-500">{withAttachments} with attachments</span>
        )}
        {unmatched > 0 && (
          <span className="text-red-600 flex items-center gap-1">
            <AlertTriangle size={12} /> {unmatched} unmatched
          </span>
        )}
      </div>

      {/* Email list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading && emails.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Loading emails...</div>
        ) : emails.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Mail size={32} className="mx-auto mb-2 opacity-50" />
            <p>No emails yet</p>
            <p className="text-xs mt-1">
              Send or forward emails to finances@kellypellas.com and click "Check Now"
            </p>
          </div>
        ) : (
          emails.map((email) => (
            <EmailRow key={email.id} email={email} />
          ))
        )}
      </div>
    </div>
  );
}
