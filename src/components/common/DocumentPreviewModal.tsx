import { X, Download, FileText } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DocumentPreviewModalProps {
  url: string;
  filename: string;
  onClose: () => void;
}

export function DocumentPreviewModal({ url, filename, onClose }: DocumentPreviewModalProps) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isPdf = ext === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

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
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-gray-400 shrink-0" />
            <span className="text-sm font-medium text-gray-700 truncate">{filename}</span>
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
            <iframe
              src={url}
              className="w-full h-[78vh] rounded"
              title={filename}
            />
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
