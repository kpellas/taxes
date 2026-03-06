import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronRight, FolderInput } from 'lucide-react';
import { api } from '../../api/client';
import type { ScraperStatus, ScraperSummary } from '../../api/client';
import { formatDate } from '../../utils/format';

const SCRAPERS = [
  { id: 'bankwest', label: 'Bankwest eStatements', desc: 'Loan and offset account statements (PDF) for both PANs. Requires 2FA.' },
  { id: 'macquarie', label: 'Macquarie Statements', desc: 'Account and loan statements. Requires 2FA approval in browser.' },
  { id: 'propertyme', label: 'PropertyMe Documents', desc: 'Rental statements, invoices, lease docs, and inspection reports.' },
  { id: 'bankaustralia', label: 'Bank Australia', desc: 'Sarcophilus (M2K2) bank statements.' },
];

export function BankFeedsPage() {
  const [statuses, setStatuses] = useState<Record<string, ScraperStatus>>({});
  const [summaries, setSummaries] = useState<Record<string, ScraperSummary>>({});
  const [distributing, setDistributing] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.scrapers.summary();
      setSummaries(data.summary);
    } catch { /* ignore */ }
  }, []);

  const fetchStatuses = useCallback(async () => {
    try {
      const data = await api.scrapers.status();
      const map: Record<string, ScraperStatus> = {};
      for (const s of data.scrapers) map[s.scraper] = s;
      setStatuses(map);

      const anyRunning = data.scrapers.some(s => s.status === 'running');
      if (!anyRunning && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        fetchSummary();
      }
    } catch { /* ignore */ }
  }, [fetchSummary]);

  useEffect(() => {
    fetchStatuses();
    fetchSummary();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatuses, fetchSummary]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statuses, expandedLog]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatuses, 2000);
  };

  const runScraper = async (id: string) => {
    try {
      await api.scrapers.run(id);
      setExpandedLog(id);
      startPolling();
      setTimeout(fetchStatuses, 500);
    } catch (err) {
      console.error(`Failed to start ${id}:`, err);
    }
  };

  const distributeScraper = async (id: string) => {
    setDistributing(id);
    try {
      await api.scrapers.distribute(id);
      await fetchSummary();
    } catch (err) {
      console.error(`Failed to distribute ${id}:`, err);
    } finally {
      setDistributing(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Document Scrapers</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Log into banking portals and property managers to fetch the latest statements.
          Only new files are downloaded — previously fetched documents are skipped. New files are automatically filed into PROPERTIES and added to the document index.
        </p>
      </div>

      <div className="space-y-3">
        {SCRAPERS.map(s => {
          const st = statuses[s.id];
          const sm = summaries[s.id];
          const isRunning = st?.status === 'running';
          const isCompleted = st?.status === 'completed';
          const isError = st?.status === 'error';
          const isExpanded = expandedLog === s.id;
          const hasOutput = st && st.output.length > 0;
          const isDistributing = distributing === s.id;
          // Show index button when there are downloaded files not yet in the index
          const hasUnindexed = sm && sm.downloaded > 0 && sm.downloaded > sm.totalDocs && s.id !== 'bankwest';

          return (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-800">{s.label}</h3>
                      {isCompleted && <CheckCircle2 size={14} className="text-green-500" />}
                      {isError && <AlertCircle size={14} className="text-red-500" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>

                    {/* Current status summary */}
                    {sm && !isRunning && (sm.downloaded > 0 || sm.totalDocs > 0) && (
                      <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                        {sm.downloaded > 0 && (
                          <p>
                            {sm.downloaded} statement{sm.downloaded === 1 ? '' : 's'} downloaded
                            {sm.downloadedOldest && sm.downloadedLatest && (
                              <span> · {formatDate(sm.downloadedOldest)} to {formatDate(sm.downloadedLatest)}</span>
                            )}
                          </p>
                        )}
                        <p>
                          {sm.totalDocs > 0 ? (
                            <>
                              {sm.totalDocs} in document index
                              {sm.oldestDate && sm.latestDate && (
                                <span> · {formatDate(sm.oldestDate)} to {formatDate(sm.latestDate)}</span>
                              )}
                            </>
                          ) : sm.downloaded > 0 ? (
                            <span className="text-amber-500">Not yet indexed — click Index to file into PROPERTIES</span>
                          ) : null}
                        </p>
                      </div>
                    )}

                    {/* Status line */}
                    {isRunning && (
                      <p className="text-xs text-blue-500 mt-1.5 truncate">
                        {hasOutput ? st.output[st.output.length - 1] : 'Starting...'}
                      </p>
                    )}
                    {isCompleted && (
                      <p className="text-xs text-green-600 mt-1.5">
                        {(() => {
                          const parts: string[] = [];
                          if (st.downloaded !== undefined) {
                            parts.push(st.downloaded === 0
                              ? 'No new statements found — already up to date'
                              : `${st.downloaded} new statement${st.downloaded === 1 ? '' : 's'} downloaded`);
                          }
                          if (st.distributed !== undefined && st.distributed > 0) {
                            parts.push(`${st.distributed} filed to PROPERTIES & indexed`);
                          }
                          return parts.length > 0 ? parts.join(' · ') : 'Completed';
                        })()}
                        {st.completedAt && <span className="text-gray-400 ml-2">({new Date(st.completedAt).toLocaleTimeString()})</span>}
                      </p>
                    )}
                    {isError && (
                      <p className="text-xs text-red-500 mt-1.5">{st.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasOutput && (
                      <button
                        onClick={() => setExpandedLog(isExpanded ? null : s.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Log
                      </button>
                    )}
                    {hasUnindexed && !isRunning && (
                      <button
                        onClick={() => distributeScraper(s.id)}
                        disabled={isDistributing}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isDistributing
                          ? <><Loader2 size={14} className="animate-spin" /> Indexing...</>
                          : <><FolderInput size={14} /> Index</>
                        }
                      </button>
                    )}
                    <button
                      onClick={() => runScraper(s.id)}
                      disabled={isRunning}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                      {isRunning
                        ? <><Loader2 size={14} className="animate-spin" /> Fetching...</>
                        : <><RefreshCw size={14} /> {isCompleted ? 'Fetch Again' : 'Fetch New Statements'}</>
                      }
                    </button>
                  </div>
                </div>
              </div>

              {/* Expandable log */}
              {isExpanded && hasOutput && (
                <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
                  <div className="bg-gray-900 text-gray-300 rounded text-[11px] font-mono p-3 max-h-64 overflow-y-auto leading-relaxed">
                    {st.output.map((line, i) => (
                      <div key={i} className={
                        line.includes('SKIP') || line.includes('Skipping') || line.includes('exists') ? 'text-gray-500' :
                        line.includes('SAVED') || line.includes('Saved') || line.includes('Copied') ? 'text-green-400' :
                        line.includes('Error') || line.includes('error') || line.includes('FAIL') ? 'text-red-400' :
                        line.includes('Done') || line.includes('completed') || line.includes('Re-indexed') ? 'text-green-300 font-semibold' :
                        line.includes('Processing') || line.includes('Logging') || line.includes('Starting') ? 'text-blue-300' :
                        ''
                      }>{line}</div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
