import { FileText, Eye } from 'lucide-react';
import { useState } from 'react';
import { useEvidenceStore } from '../../store/evidenceStore';
import { api } from '../../api/client';
import { DocumentPreviewModal } from '../common/DocumentPreviewModal';

interface DocumentLinksProps {
  propertyId: string;
  accountNumbers?: string[];
  lenderKeywords?: string[];
  category?: string;
}

export function DocumentLinks({ propertyId, accountNumbers, lenderKeywords, category }: DocumentLinksProps) {
  const documentIndex = useEvidenceStore((s) => s.documentIndex);
  const setDocumentIndex = useEvidenceStore((s) => s.setDocumentIndex);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; filename: string; relativePath?: string } | null>(null);

  // Find matching documents
  const matches = documentIndex.filter((doc) => {
    if (doc.propertyId !== propertyId) return false;

    // Try account number match first
    if (accountNumbers && accountNumbers.length > 0) {
      if (doc.accountNumbers.some((a) => accountNumbers.includes(a))) return true;
    }

    // Try lender keyword match in filename/path
    if (lenderKeywords && lenderKeywords.length > 0) {
      const lower = doc.relativePath.toLowerCase();
      if (lenderKeywords.some(kw => lower.includes(kw))) return true;
    }

    // If we had specific filters (account or lender) and nothing matched, skip
    if ((accountNumbers && accountNumbers.length > 0) || (lenderKeywords && lenderKeywords.length > 0)) {
      return false;
    }

    // Otherwise match by category
    if (category) {
      return doc.category === category || doc.subcategory === category;
    }

    return true;
  }).slice(0, 5);

  if (matches.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-1 mt-1">
        {matches.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setPreviewDoc({
              url: api.documents.getServeUrl(doc.relativePath),
              filename: doc.filename,
              relativePath: doc.relativePath,
            })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-xs hover:bg-gray-100 transition-colors border border-gray-200 cursor-pointer"
            title={doc.relativePath}
          >
            <FileText size={10} />
            <span className="max-w-[120px] truncate">{doc.filename}</span>
            <Eye size={8} />
          </button>
        ))}
      </div>
      {previewDoc && (
        <DocumentPreviewModal
          url={previewDoc.url}
          filename={previewDoc.filename}
          relativePath={previewDoc.relativePath}
          onClose={() => setPreviewDoc(null)}
          onRenamed={(newFilename, newRelativePath) => {
            setPreviewDoc({ ...previewDoc, filename: newFilename, relativePath: newRelativePath, url: api.documents.getServeUrl(newRelativePath) });
            api.documents.getIndex().then((data) => setDocumentIndex(data.documents)).catch(() => {});
          }}
        />
      )}
    </>
  );
}
