import { CheckCircle, MinusCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useState, useMemo } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useEvidenceStore } from '../../store/evidenceStore';
import { api } from '../../api/client';
import type { IndexedDocument } from '../../api/client';
import { generatePropertyEvents, generateFileEvents } from '../../data/documentChecklist';
import type { DocRequirement, PropertyEvent } from '../../data/documentChecklist';
import { UploadButton } from './UploadButton';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';

interface ChecklistTabProps {
  searchQuery: string;
}

// ── Matching logic (structural events) ──────────────────────

function findMatchingFiles(
  doc: DocRequirement,
  propDocs: IndexedDocument[],
  event: PropertyEvent,
): IndexedDocument[] {
  if (!doc.matchPattern) return [];
  const pat = new RegExp(doc.matchPattern, 'i');
  const folderPat = doc.folderScope ? new RegExp(doc.folderScope, 'i') : null;

  return propDocs.filter(d => {
    // Match pattern against filename only (not path — path matching is via folderScope)
    if (!pat.test(d.filename)) return false;

    // Folder scoping — if set, the file's path must match
    if (folderPat && !folderPat.test(d.relativePath)) return false;

    // Refinance-specific: scope to correct lender folder
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

// ── Year from date string ───────────────────────────────────

function getYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

// ── Event dot colors ────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  purchase: 'bg-gray-700',
  refinance: 'bg-gray-500',
  insurance_renewal: 'bg-blue-300',
  new_tenant: 'bg-gray-400',
  annual: 'bg-gray-300',
};

// ── Component ───────────────────────────────────────────────

export function ChecklistTab({ searchQuery }: ChecklistTabProps) {
  const { properties, loans } = usePortfolioStore();
  const documentIndex = useEvidenceStore((s) => s.documentIndex);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string } | null>(null);

  const activeProperties = properties.filter(p => p.status !== 'deposit_paid' || p.id === 'lennox');

  // Merge structural + file events per property
  const propertyTimelines = useMemo(() => {
    const map = new Map<string, PropertyEvent[]>();
    for (const p of activeProperties) {
      const structural = generatePropertyEvents(p, loans, properties);
      const fileEvents = generateFileEvents(p.id, documentIndex);
      const all = [...structural, ...fileEvents];
      // Sort chronologically
      all.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      map.set(p.id, all);
    }
    return map;
  }, [activeProperties, loans, documentIndex, properties]);

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
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showGapsOnly}
            onChange={(e) => setShowGapsOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show gaps only
        </label>
      </div>

      {activeProperties.map(property => {
        const isExpanded = expandedProperty === property.id || expandedProperty === null;
        const events = propertyTimelines.get(property.id) ?? [];
        const propDocs = documentIndex.filter(d => d.propertyId === property.id);

        // Count totals across structural events only (file events are pre-resolved)
        let totalDocs = 0;
        let foundDocs = 0;
        for (const event of events) {
          if (event.fileGroup) {
            // File events always count as found
            totalDocs += event.fileGroup.length;
            foundDocs += event.fileGroup.length;
          } else {
            for (const doc of event.docs) {
              totalDocs++;
              if (findMatchingFiles(doc, propDocs, event).length > 0) foundDocs++;
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
              <div className="px-5 py-4">
                <div className="relative">
                  {(() => {
                    let lastYear: number | null = null;

                    return events.map((event, eventIdx) => {
                      const isLast = eventIdx === events.length - 1;
                      const dotColor = EVENT_COLORS[event.type] ?? 'bg-gray-300';
                      const isFileEvent = !!event.fileGroup;
                      const isEventExpanded = expandedEvents.has(event.id);

                      // For structural events: resolve docs against index
                      let resolvedDocs: { doc: DocRequirement; files: IndexedDocument[] }[] = [];
                      let filteredDocs: typeof resolvedDocs = [];
                      let eventFound = 0;
                      let eventTotal = 0;
                      let eventMissing = 0;

                      if (!isFileEvent) {
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
                      } else {
                        // File events — filter by search
                        if (showGapsOnly) return null; // file events are never "missing"
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

                      // Year marker
                      const eventYear = getYear(event.date);
                      let yearMarker: number | null = null;
                      if (eventYear && eventYear !== lastYear) {
                        yearMarker = eventYear;
                        lastYear = eventYear;
                      }

                      return (
                        <div key={event.id}>
                          {/* Year marker */}
                          {yearMarker && (
                            <div className="relative flex gap-4 items-center mb-2 mt-1">
                              <div className="shrink-0 w-5" />
                              <span className="text-[11px] font-semibold text-gray-300 tracking-wider uppercase">
                                {yearMarker}
                              </span>
                              <div className="flex-1 h-px bg-gray-100" />
                            </div>
                          )}

                          {/* Event row */}
                          <div className="relative flex gap-4">
                            {/* Timeline dot + line */}
                            <div className="flex flex-col items-center shrink-0 w-5">
                              <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0 mt-1.5 ring-2 ring-white`} />
                              {!isLast && <div className="w-px flex-1 bg-gray-200 min-h-4" />}
                            </div>

                            {/* Event content */}
                            <div className="flex-1 min-w-0 pb-4">
                              <button
                                onClick={() => toggleEvent(event.id)}
                                className="w-full text-left"
                              >
                                <div className="flex items-center gap-2 mb-0.5">
                                  {isEventExpanded
                                    ? <ChevronDown size={12} className="text-gray-400 shrink-0" />
                                    : <ChevronRight size={12} className="text-gray-400 shrink-0" />
                                  }
                                  <h4 className={`text-sm font-semibold ${isFileEvent ? 'text-gray-600' : 'text-gray-800'}`}>
                                    {event.label}
                                  </h4>
                                  {!isFileEvent && (
                                    <span className="text-xs text-gray-400">{eventFound}/{eventTotal}</span>
                                  )}
                                  {isFileEvent && (
                                    <span className="text-xs text-gray-400">{eventTotal} file{eventTotal !== 1 ? 's' : ''}</span>
                                  )}
                                  {eventMissing > 0 && (
                                    <span className="text-xs text-red-500">{eventMissing} missing</span>
                                  )}
                                </div>
                                {event.summary && (
                                  <p className="text-xs text-gray-400 ml-5">{event.summary}</p>
                                )}
                              </button>

                              {/* Expanded content */}
                              {isEventExpanded && (
                                <div className="space-y-1.5 mt-2 ml-5">
                                  {/* Structural event: requirement rows */}
                                  {!isFileEvent && filteredDocs.map(({ doc, files }) => {
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
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-xs hover:bg-gray-100 hover:text-gray-700 border border-gray-200 cursor-pointer transition-colors"
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

                                  {/* File event: simple file list */}
                                  {isFileEvent && event.fileGroup!.map(file => (
                                    <button
                                      key={file.id}
                                      onClick={() => setPreviewDoc({
                                        url: api.documents.getServeUrl(file.relativePath),
                                        filename: file.filename,
                                      })}
                                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 w-full text-left transition-colors"
                                    >
                                      <FileText size={12} className="text-gray-400 shrink-0" />
                                      <span className="text-sm text-gray-600 truncate">{file.filename}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
