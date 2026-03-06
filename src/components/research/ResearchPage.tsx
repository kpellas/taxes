import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, Mail, HardDrive, Bookmark, BookmarkCheck, ExternalLink, Paperclip, ChevronDown, ChevronUp, X, Trash2, Download, Sparkles, Eye, ArrowUpDown, Filter, Plus, Clock, MessageSquare, Pin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../../api/client';
import type { GmailResult, GmailDetail, DriveResult, SavedFinding, ResearchTurn } from '../../api/client';
import { usePortfolioStore } from '../../store/portfolioStore';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';
import { PinToEvidenceModal } from '../common/PinToEvidenceModal';

type ViewMode = 'research' | 'saved';

// Split answer into main content and sources section
function splitAnswer(answer: string): { main: string; sources: string | null } {
  // Look for a Sources header or "Source:" lines at the end
  const sourcesMatch = answer.match(/\n(?:#{1,3}\s*)?(?:\*\*)?Sources(?:\*\*)?:?\s*\n/i);
  if (sourcesMatch && sourcesMatch.index != null) {
    return {
      main: answer.substring(0, sourcesMatch.index).trim(),
      sources: answer.substring(sourcesMatch.index).trim(),
    };
  }
  return { main: answer, sources: null };
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function ResearchPage() {
  // View
  const [viewMode, setViewMode] = useState<ViewMode>('research');
  const [showHistory, setShowHistory] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    () => sessionStorage.getItem('research-active-session') || null
  );
  const [turns, setTurns] = useState<ResearchTurn[]>([]);

  // Current search state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded results per turn
  const [expandedTurn, setExpandedTurn] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [emailDetail, setEmailDetail] = useState<GmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Sort & filter (applies to expanded turn's results)
  const [sortBy, setSortBy] = useState<'relevance' | 'newest' | 'oldest'>('relevance');
  const [filterText, setFilterText] = useState('');
  const [filterAttachments, setFilterAttachments] = useState(false);

  // Google connection
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Saved findings
  const [findings, setFindings] = useState<SavedFinding[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Answer expansion
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());

  // Preview
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string } | null>(null);

  // Pin to evidence
  const [pinContext, setPinContext] = useState<{
    title: string;
    source_type: 'email' | 'note';
    source_ref: string;
    content?: string;
    date?: string;
    provider?: string;
  } | null>(null);

  const properties = usePortfolioStore((s) => s.properties);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load connection status + sessions + findings on mount
  useEffect(() => {
    api.google.status().then((s) => {
      setConnected(s.connected);
      setConfigured(s.configured);
      setCheckingStatus(false);
    }).catch(() => setCheckingStatus(false));

    if (window.location.search.includes('google=connected')) {
      setConnected(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    api.google.getSessions().then(d => setSessions(d.sessions)).catch(() => {});
    api.google.getFindings().then((data) => {
      setFindings(data.findings);
      setSavedIds(new Set(data.findings.map(f => f.id)));
    }).catch(() => {});
  }, []);

  // Track sessions that were just created locally (skip loading from server)
  const localSessionsRef = useRef(new Set<string>());

  // Persist active session to sessionStorage
  useEffect(() => {
    if (activeSessionId) {
      sessionStorage.setItem('research-active-session', activeSessionId);
    } else {
      sessionStorage.removeItem('research-active-session');
    }
  }, [activeSessionId]);

  // When switching sessions, load turns from server (unless we just created it)
  useEffect(() => {
    if (activeSessionId) {
      if (localSessionsRef.current.has(activeSessionId)) {
        // We created this session — don't fetch (no turns on server yet)
        console.log('[Research] Skipping fetch for locally created session', activeSessionId);
        return;
      }
      const sid = activeSessionId;
      console.log('[Research] Loading turns for session', sid);
      api.google.getSessionTurns(sid).then(d => {
        setTurns(d.turns);
        if (d.turns.length > 0) setExpandedTurn(d.turns[d.turns.length - 1].id);
      }).catch(() => setTurns([]));
    } else {
      setTurns([]);
    }
  }, [activeSessionId]);

  // Scroll to bottom when new turn added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length]);

  const handleConnect = async () => {
    try {
      const { url } = await api.google.getAuthUrl();
      window.location.href = url;
    } catch (err: any) { setError(err.message); }
  };

  const handleDisconnect = async () => {
    await api.google.disconnect();
    setConnected(false);
  };

  const startNewSession = useCallback(async () => {
    const id = genId();
    await api.google.createSession(id, 'New Research');
    const session: Session = { id, title: 'New Research', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setSessions(prev => [session, ...prev]);
    localSessionsRef.current.add(id);
    setActiveSessionId(id);
    setTurns([]);
    setExpandedTurn(null);
    setQuery('');
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setShowHistory(false);
    setQuery('');
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    await api.google.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setTurns([]);
    }
  }, [activeSessionId]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);

    // Create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = genId();
      await api.google.createSession(sessionId, query.substring(0, 100));
      const session: Session = { id: sessionId, title: query.substring(0, 100), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setSessions(prev => [session, ...prev]);
      localSessionsRef.current.add(sessionId);
      setActiveSessionId(sessionId);
    }

    const currentQuery = query;

    try {
      // Build conversation history for context
      const history = turns.map(t => ({ query: t.query, answer: t.answer }));

      console.log('[Research] Searching...', { sessionId, currentQuery, historyLen: history.length });
      const data = await api.google.smartSearch(currentQuery, history);
      console.log('[Research] Got response', { results: data.results.length, answer: !!data.answer });

      const turn: ResearchTurn = {
        id: genId(),
        sessionId: sessionId!,
        query: currentQuery,
        answer: data.answer || null,
        searchQueries: data.searchQueries,
        gmailResults: data.results,
        driveResults: data.driveResults || [],
        totalFetched: data.totalFetched,
      };

      // Save to backend (fire and forget)
      api.google.saveSessionTurn(sessionId!, turn).catch(e => console.warn('[Research] Failed to save turn', e));

      // Update local state
      setTurns(prev => {
        console.log('[Research] Adding turn, prev length:', prev.length);
        return [...prev, turn];
      });
      setExpandedTurn(turn.id);
      setQuery('');
      setSortBy('relevance');
      setFilterText('');
      setFilterAttachments(false);

      // Update session title if first turn
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, title: currentQuery.substring(0, 100), updated_at: new Date().toISOString() } : s
      ));
    } catch (err: any) {
      console.error('[Research] Error:', err);
      setError(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [query, activeSessionId, turns]);

  const handleExpandEmail = async (id: string) => {
    if (expandedEmail === id) { setExpandedEmail(null); return; }
    setExpandedEmail(id);
    setLoadingDetail(true);
    try {
      const detail = await api.google.getGmailMessage(id);
      setEmailDetail(detail);
    } catch (err: any) { setError(err.message); }
    finally { setLoadingDetail(false); }
  };

  const handleSaveGmail = async (result: GmailResult, detail?: GmailDetail) => {
    const finding: SavedFinding = {
      id: `gmail-${result.id}`, source: 'gmail', sourceId: result.id,
      title: result.subject || '(no subject)', snippet: result.snippet,
      content: detail?.bodyText, date: result.date, from: result.from,
    };
    await api.google.saveFinding(finding);
    setFindings(prev => [finding, ...prev.filter(f => f.id !== finding.id)]);
    setSavedIds(prev => new Set(prev).add(finding.id));
  };

  const handleSaveDrive = async (result: DriveResult) => {
    const finding: SavedFinding = {
      id: `drive-${result.id}`, source: 'drive', sourceId: result.id,
      title: result.name, snippet: `${result.mimeType} · ${result.size ? formatSize(result.size) : 'unknown size'}`,
      date: result.modifiedTime,
    };
    await api.google.saveFinding(finding);
    setFindings(prev => [finding, ...prev.filter(f => f.id !== finding.id)]);
    setSavedIds(prev => new Set(prev).add(finding.id));
  };

  const handleRemoveFinding = async (id: string) => {
    await api.google.deleteFinding(id);
    setFindings(prev => prev.filter(f => f.id !== id));
    setSavedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleTagFinding = async (id: string, propertyId: string | null) => {
    await api.google.updateFinding(id, { propertyId });
    setFindings(prev => prev.map(f => f.id === id ? { ...f, propertyId } : f));
  };

  // Filter gmail results for the expanded turn
  const getFilteredGmail = useCallback((results: GmailResult[]) => {
    let list = [...results];
    if (filterAttachments) list = list.filter(r => r.hasAttachments);
    if (filterText) {
      const q = filterText.toLowerCase();
      list = list.filter(r =>
        (r.subject || '').toLowerCase().includes(q) ||
        (r.from || '').toLowerCase().includes(q) ||
        (r.snippet || '').toLowerCase().includes(q)
      );
    }
    if (sortBy !== 'relevance') {
      list.sort((a, b) => {
        const da = new Date(a.date || 0).getTime();
        const db2 = new Date(b.date || 0).getTime();
        return sortBy === 'newest' ? db2 - da : da - db2;
      });
    }
    return list;
  }, [sortBy, filterText, filterAttachments]);

  if (checkingStatus) {
    return <div className="p-6 text-sm text-gray-400">Checking Google connection...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Research</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('research')}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${viewMode === 'research' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <MessageSquare size={12} className="inline mr-1" />Research
            </button>
            <button
              onClick={() => setViewMode('saved')}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${viewMode === 'saved' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <BookmarkCheck size={12} className="inline mr-1" />Saved ({findings.length})
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected && viewMode === 'research' && (
            <>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${showHistory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                <Clock size={12} />
                History
              </button>
              <button
                onClick={startNewSession}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <Plus size={12} />
                New
              </button>
            </>
          )}
          {connected && (
            <button onClick={handleDisconnect} className="text-[10px] text-gray-400 hover:text-red-500">
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Not connected */}
      {!connected && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {!configured ? (
            <>
              <p className="text-sm text-gray-600 mb-2">Google API not configured yet.</p>
              <p className="text-xs text-gray-400 mb-4">Add <code className="bg-gray-100 px-1.5 py-0.5 rounded">GOOGLE_CLIENT_ID</code> and <code className="bg-gray-100 px-1.5 py-0.5 rounded">GOOGLE_CLIENT_SECRET</code> to your .env file.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">Connect your Google account to search Gmail and Drive.</p>
              <button onClick={handleConnect} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
                Connect Google Account
              </button>
            </>
          )}
        </div>
      )}

      {/* Connected — Research Mode */}
      {connected && viewMode === 'research' && (
        <div className="flex-1 flex overflow-hidden">
          {/* History Panel */}
          {showHistory && (
            <div className="w-64 border-r border-gray-200 bg-gray-50/50 overflow-y-auto shrink-0">
              <div className="p-3 space-y-1">
                {sessions.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-4 text-center">No research history yet.</p>
                )}
                {sessions.map(s => (
                  <div
                    key={s.id}
                    className={`group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      activeSessionId === s.id ? 'bg-white border border-gray-200 shadow-sm' : 'hover:bg-white'
                    }`}
                    onClick={() => loadSession(s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{s.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(s.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main conversation area */}
          <div className="flex-1 flex flex-col min-w-0">
            {error && (
              <div className="mx-4 mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-center justify-between">
                {error}
                <button onClick={() => setError(null)}><X size={14} /></button>
              </div>
            )}

            {/* Conversation thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {turns.length === 0 && !searching && (
                <div className="text-center py-16">
                  <Sparkles size={24} className="mx-auto text-amber-400 mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Ask anything about your property portfolio</p>
                  <p className="text-xs text-gray-400 mt-1">Claude will search your Gmail and Google Drive to find answers with sources</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {['What was the deposit for Chisholm?', 'Find insurance certificates for all properties', 'When did we refinance Heddon Greta?'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setQuery(q); }}
                        className="px-3 py-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((turn) => {
                const isExpanded = expandedTurn === turn.id;
                const filtered = getFilteredGmail(turn.gmailResults);
                return (
                  <div key={turn.id} className="space-y-3">
                    {/* User query */}
                    <div className="flex justify-end">
                      <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl rounded-br-md max-w-[80%]">
                        <p className="text-sm">{turn.query}</p>
                      </div>
                    </div>

                    {/* AI answer */}
                    {turn.answer ? (() => {
                      const { main, sources } = splitAnswer(turn.answer!);
                      const isLong = main.length > 800;
                      const isAnswerExpanded = expandedAnswers.has(turn.id);
                      const displayText = isLong && !isAnswerExpanded ? main.substring(0, 800) + '...' : main;

                      return (
                        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                          <div className="flex items-start gap-2.5">
                            <Sparkles size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:text-sm prose-p:text-gray-900 prose-p:leading-relaxed prose-p:my-1 prose-li:text-sm prose-li:text-gray-900 prose-strong:text-gray-900 prose-table:text-xs">
                                <ReactMarkdown>{displayText}</ReactMarkdown>
                              </div>

                              {/* Show more / less */}
                              {isLong && (
                                <button
                                  onClick={() => setExpandedAnswers(prev => {
                                    const next = new Set(prev);
                                    if (next.has(turn.id)) next.delete(turn.id);
                                    else next.add(turn.id);
                                    return next;
                                  })}
                                  className="text-[11px] text-blue-500 hover:text-blue-700 mt-1 font-medium"
                                >
                                  {isAnswerExpanded ? 'Show less' : 'Show more'}
                                </button>
                              )}

                              {/* Sources — always collapsed separately */}
                              {sources && isAnswerExpanded && (
                                <details className="mt-2 border-t border-gray-100 pt-2">
                                  <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Sources</summary>
                                  <div className="mt-1 prose prose-sm max-w-none prose-p:text-[11px] prose-p:text-gray-500 prose-p:my-0.5 prose-li:text-[11px] prose-li:text-gray-500 prose-strong:text-gray-600">
                                    <ReactMarkdown>{sources}</ReactMarkdown>
                                  </div>
                                </details>
                              )}

                              {/* Meta info */}
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                <span>{turn.gmailResults.length} email{turn.gmailResults.length !== 1 ? 's' : ''}{turn.driveResults.length > 0 ? ` + ${turn.driveResults.length} file${turn.driveResults.length !== 1 ? 's' : ''}` : ''}</span>
                                {turn.searchQueries.length > 0 && (
                                  <span className="truncate">Searched: {turn.searchQueries.map(q => `"${q}"`).join(', ')}</span>
                                )}
                                <button
                                  onClick={() => setPinContext({
                                    title: turn.query,
                                    source_type: 'note',
                                    source_ref: `Research: ${turn.query}`,
                                    content: turn.answer || undefined,
                                    date: turn.createdAt?.slice(0, 10),
                                  })}
                                  className="ml-auto flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors"
                                  title="Pin to Evidence"
                                >
                                  <Pin size={10} />
                                  <span>Pin to Evidence</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })() : turn.gmailResults.length === 0 && turn.driveResults.length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                        <div className="flex items-start gap-2.5">
                          <Sparkles size={14} className="text-gray-300 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-500">No results found. Try rephrasing your question or using different keywords.</p>
                            {turn.searchQueries.length > 0 && (
                              <p className="text-[10px] text-gray-400 mt-1.5">Searched: {turn.searchQueries.map(q => `"${q}"`).join(', ')}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Sources toggle */}
                    {(turn.gmailResults.length > 0 || turn.driveResults.length > 0) && (
                      <button
                        onClick={() => {
                          setExpandedTurn(isExpanded ? null : turn.id);
                          setSortBy('relevance');
                          setFilterText('');
                          setFilterAttachments(false);
                        }}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors ml-1"
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Hide' : 'Show'} sources ({turn.gmailResults.length + turn.driveResults.length})
                      </button>
                    )}

                    {/* Expanded sources */}
                    {isExpanded && (
                      <div className="space-y-3 ml-1">
                        {/* Drive files */}
                        {turn.driveResults.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <HardDrive size={11} className="text-gray-400" />
                              <span className="text-[10px] font-medium text-gray-500">{turn.driveResults.length} Drive file{turn.driveResults.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                              {turn.driveResults.map((result) => {
                                const isSaved = savedIds.has(`drive-${result.id}`);
                                return (
                                  <div key={result.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-medium text-gray-900 truncate block">{result.name}</span>
                                      <p className="text-[10px] text-gray-400">{formatMimeType(result.mimeType)} · {formatDate(result.modifiedTime)}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {result.webViewLink && (
                                        <a href={result.webViewLink} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-gray-600">
                                          <ExternalLink size={12} />
                                        </a>
                                      )}
                                      <button onClick={() => handleSaveDrive(result)} className={`p-1 ${isSaved ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}>
                                        {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Sort/filter bar */}
                        {turn.gmailResults.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                              <ArrowUpDown size={10} />
                            </div>
                            {(['relevance', 'newest', 'oldest'] as const).map(s => (
                              <button
                                key={s}
                                onClick={() => setSortBy(s)}
                                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${sortBy === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                              >
                                {s === 'relevance' ? 'Relevance' : s === 'newest' ? 'Newest' : 'Oldest'}
                              </button>
                            ))}
                            <button
                              onClick={() => setFilterAttachments(!filterAttachments)}
                              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full transition-colors ${filterAttachments ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                              <Paperclip size={8} />
                            </button>
                            <div className="relative min-w-[100px] max-w-[180px]">
                              <Filter size={8} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
                                placeholder="Filter..."
                                className="w-full pl-5 pr-2 py-0.5 text-[10px] border border-gray-200 rounded-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                            {(filterText || filterAttachments || sortBy !== 'relevance') && (
                              <span className="text-[10px] text-gray-400">{filtered.length}/{turn.gmailResults.length}</span>
                            )}
                          </div>
                        )}

                        {/* Gmail results */}
                        {filtered.length > 0 && (
                          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                            {filtered.map((result) => {
                              const isSaved = savedIds.has(`gmail-${result.id}`);
                              const isEmailExpanded = expandedEmail === result.id;
                              return (
                                <div key={result.id}>
                                  <div
                                    className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                                    onClick={() => handleExpandEmail(result.id)}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-gray-900 truncate">{result.subject || '(no subject)'}</span>
                                        {result.hasAttachments && <Paperclip size={10} className="text-gray-400 shrink-0" />}
                                      </div>
                                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{result.from}</p>
                                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{result.snippet}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] text-gray-400">{formatDate(result.date)}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPinContext({
                                            title: result.subject || '(no subject)',
                                            source_type: 'email',
                                            source_ref: `Gmail: ${result.subject} (from ${result.from}, ${result.date})`,
                                            date: result.date?.slice(0, 10),
                                            content: result.snippet,
                                          });
                                        }}
                                        className="p-0.5 text-gray-300 hover:text-gray-500"
                                        title="Pin to Evidence"
                                      >
                                        <Pin size={12} />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleSaveGmail(result, isEmailExpanded ? emailDetail || undefined : undefined); }}
                                        className={`p-0.5 ${isSaved ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'}`}
                                      >
                                        {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                                      </button>
                                      {isEmailExpanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                                    </div>
                                  </div>
                                  {isEmailExpanded && (
                                    <div className="px-3 pb-2.5 bg-gray-50/50">
                                      {loadingDetail ? (
                                        <p className="text-[10px] text-gray-400 py-2">Loading...</p>
                                      ) : emailDetail && emailDetail.id === result.id ? (
                                        <div className="space-y-2">
                                          <div className="text-[10px] text-gray-500 space-y-0.5">
                                            <p><strong>From:</strong> {emailDetail.from}</p>
                                            <p><strong>To:</strong> {emailDetail.to}</p>
                                            <p><strong>Date:</strong> {emailDetail.date}</p>
                                          </div>
                                          {emailDetail.attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                              {emailDetail.attachments.map((att) => {
                                                const attUrl = api.google.getAttachmentUrl(result.id, att.id, att.filename, att.mimeType);
                                                const ext = att.filename.split('.').pop()?.toLowerCase() ?? '';
                                                const canPreview = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                                                return (
                                                  <button
                                                    key={att.id}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (canPreview) {
                                                        setPreviewDoc({ url: attUrl, filename: att.filename });
                                                      } else {
                                                        const a = document.createElement('a');
                                                        a.href = attUrl; a.download = att.filename; a.click();
                                                      }
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-[10px] text-gray-600 hover:bg-gray-100"
                                                  >
                                                    {canPreview ? <Eye size={8} /> : <Download size={8} />}
                                                    {att.filename}
                                                    <span className="text-gray-400">({formatSize(att.size)})</span>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                          <pre className="text-[10px] text-gray-700 whitespace-pre-wrap bg-white rounded border border-gray-200 p-2 max-h-60 overflow-auto">
                                            {emailDetail.bodyText || '(no text content)'}
                                          </pre>
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Searching indicator */}
              {searching && (
                <div className="flex items-start gap-3">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500 animate-pulse" />
                      <p className="text-sm text-gray-500">Searching Drive and Gmail...</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t border-gray-200 px-4 py-3 bg-white">
              <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={turns.length > 0 ? 'Ask a follow-up...' : 'Ask anything about your properties...'}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={searching}
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Saved Findings Mode */}
      {connected && viewMode === 'saved' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {findings.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No saved findings yet. Search and click the bookmark icon to save.
            </div>
          ) : (
            findings.map((f) => (
              <div key={f.id} className="flex items-start gap-3 px-4 py-3">
                <div className={`mt-0.5 shrink-0 ${f.source === 'gmail' ? 'text-gray-400' : 'text-gray-400'}`}>
                  {f.source === 'gmail' ? <Mail size={14} /> : <HardDrive size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{f.title}</p>
                  {f.from && <p className="text-xs text-gray-500 mt-0.5 truncate">{f.from}</p>}
                  {f.snippet && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{f.snippet}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <select
                      value={f.propertyId || ''}
                      onChange={(e) => handleTagFinding(f.id, e.target.value || null)}
                      className="text-[10px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 bg-white"
                    >
                      <option value="">No property</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.nickname}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-gray-300">{formatDate(f.date || f.saved_at || '')}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFinding(f.id)}
                  className="p-1 text-gray-300 hover:text-red-500 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Pin to Evidence Modal */}
      {pinContext && (
        <PinToEvidenceModal
          context={pinContext}
          onClose={() => setPinContext(null)}
        />
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeType(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
  };
  return map[mime] || mime.split('/').pop() || mime;
}
