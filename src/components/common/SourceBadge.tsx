import { AlertTriangle, CheckCircle, FileText, MessageSquare, HelpCircle } from 'lucide-react';
import type { SourceInfo, DataConfidence } from '../../types';
import { useState } from 'react';

interface SourceBadgeProps {
  sourceInfo: SourceInfo;
  compact?: boolean;
}

export function SourceBadge({ sourceInfo, compact = false }: SourceBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Compact mode: only show icon for assumed
  if (compact) {
    if (sourceInfo.confidence !== 'assumed') return null;
    return (
      <span className="inline-flex items-center gap-0.5 cursor-help" title={`Assumed: ${sourceInfo.assumptionReason ?? sourceInfo.source}`}>
        <AlertTriangle size={11} className="text-red-500" />
      </span>
    );
  }

  // Non-assumed: plain grey text — no color needed, it's just informational
  if (sourceInfo.confidence !== 'assumed') {
    const label = sourceInfo.confidence === 'verified' ? 'Verified' : sourceInfo.confidence === 'from_transcript' ? 'Transcript' : 'Provided';
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500 px-1" title={sourceInfo.source}>
        {sourceInfo.confidence === 'verified' ? <CheckCircle size={10} /> : sourceInfo.confidence === 'from_transcript' ? <FileText size={10} /> : <MessageSquare size={10} />}
        {label}
      </span>
    );
  }

  // Assumed: red — this needs attention
  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded text-red-700 hover:bg-red-50 transition-colors"
      >
        <AlertTriangle size={10} />
        Assumed
      </button>

      {expanded && (
        <div className="absolute z-50 mt-1 left-0 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs" onClick={(e) => e.stopPropagation()}>
          <p className="text-gray-700 mb-1"><span className="font-medium">Source:</span> {sourceInfo.source}</p>
          {sourceInfo.assumptionReason && (
            <div className="p-2 bg-red-50 border border-red-100 rounded mt-1">
              <p className="font-medium text-red-800 mb-0.5">Needs evidence:</p>
              <p className="text-red-700">{sourceInfo.assumptionReason}</p>
            </div>
          )}
          {sourceInfo.verifiedBy && (
            <p className="text-gray-600 mt-1.5"><span className="font-medium">Verified by:</span> {sourceInfo.verifiedBy}</p>
          )}
          <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} className="mt-2 text-gray-500 hover:text-gray-700 text-xs">Close</button>
        </div>
      )}
    </div>
  );
}

export function SourceSummary({ items }: { items: { sourceInfo: SourceInfo }[] }) {
  const assumedCount = items.filter(i => i.sourceInfo.confidence === 'assumed').length;
  if (assumedCount === 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-red-700">
      <AlertTriangle size={11} /> {assumedCount} assumed
    </span>
  );
}
