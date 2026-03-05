import { Upload, Check, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { useEvidenceStore } from '../../store/evidenceStore';

interface UploadButtonProps {
  evidenceItemId: string;
  propertyId: string;
  onUploaded?: () => void;
}

export function UploadButton({ evidenceItemId, propertyId, onUploaded }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const addAttachment = useEvidenceStore((s) => s.addAttachment);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await api.upload.uploadFile(file, evidenceItemId, propertyId);
      addAttachment(evidenceItemId, {
        evidenceItemId,
        filename: result.filename,
        originalName: result.originalName,
        uploadedAt: result.uploadedAt,
        path: result.path,
        propertyId,
      });
      setUploaded(true);
      onUploaded?.();
      setTimeout(() => setUploaded(false), 3000);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv,.doc,.docx"
        className="hidden"
        onChange={handleUpload}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 hover:text-gray-700"
        title="Upload source document"
      >
        {uploading ? (
          <Loader2 size={10} className="animate-spin" />
        ) : uploaded ? (
          <Check size={10} />
        ) : (
          <Upload size={10} />
        )}
        {uploading ? '...' : uploaded ? 'Done' : 'Upload'}
      </button>
    </>
  );
}
