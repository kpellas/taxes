import { X, Download, FileText, Pencil, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DocumentPreviewModalProps {
  url: string;
  filename: string;
  relativePath?: string;
  onClose: () => void;
  onRenamed?: (newFilename: string, newRelativePath: string) => void;
}

export function DocumentPreviewModal({ url, filename, relativePath, onClose, onRenamed }: DocumentPreviewModalProps) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isPdf = ext === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(filename);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Select just the name part, not the extension
      const dotIdx = editName.lastIndexOf('.');
      inputRef.current.setSelectionRange(0, dotIdx > 0 ? dotIdx : editName.length);
    }
  }, [editing]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, editing]);

  const handleRename = async () => {
    if (!relativePath || !onRenamed || editName === filename) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { api } = await import('../../api/client');
      const result = await api.documents.rename(relativePath, editName);
      onRenamed(result.newFilename, result.newRelativePath);
      setEditing(false);
    } catch (err: any) {
      alert(err.message || 'Rename failed');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText size={14} className="text-gray-400 shrink-0" />
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') { setEditName(filename); setEditing(false); }
                }}
                onBlur={handleRename}
                disabled={saving}
                className="flex-1 text-sm font-medium text-gray-700 border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <>
                <span className="text-sm font-medium text-gray-700 truncate">{filename}</span>
                {relativePath && onRenamed && (
                  <button
                    onClick={() => setEditing(true)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                    title="Rename file"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={url}
              download={filename}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
            >
              <Download size={12} />
              Download
            </a>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-1 min-h-0">
          {isPdf && (
            <object
              data={`${url}#toolbar=1&navpanes=0`}
              type="application/pdf"
              className="w-full h-[78vh] rounded border-0"
            >
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <AlertTriangle size={32} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-600 mb-1">PDF could not be displayed</p>
                <p className="text-xs mb-4">The file may have been moved, renamed, or is not accessible.</p>
                <a
                  href={url}
                  download={filename}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <Download size={14} />
                  Download Instead
                </a>
              </div>
            </object>
          )}
          {isImage && (
            <div className="flex items-center justify-center p-4">
              <img
                src={url}
                alt={filename}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          )}
          {!isPdf && !isImage && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText size={48} className="mb-4" />
              <p className="text-sm font-medium text-gray-600 mb-1">{filename}</p>
              <p className="text-xs mb-4">Preview not available for .{ext} files</p>
              <a
                href={url}
                download={filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <Download size={14} />
                Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
