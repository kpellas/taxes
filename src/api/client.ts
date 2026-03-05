const API_BASE = '/api';

export interface IndexedDocument {
  id: string;
  relativePath: string;
  filename: string;
  extension: string;
  propertyId: string | null;
  category: string;
  subcategory: string | null;
  dateFromFilename: string | null;
  sizeBytes: number;
  lastModified: string;
  accountNumbers: string[];
}

export interface UploadResult {
  id: string;
  evidenceItemId: string | null;
  propertyId: string;
  category: string;
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  uploadedAt: string;
}

export interface EmailAttachmentInfo {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  savedPath: string;
}

export interface IngestedEmailSummary {
  id: string;
  messageId: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  date: string;
  bodyPreview: string;
  attachments: EmailAttachmentInfo[];
  propertyId: string | null;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  matchReason: string;
  processedAt: string;
  isForwarded: boolean;
  originalSender?: string;
}

export interface IngestedEmailDetail extends IngestedEmailSummary {
  bodyText: string;
}

export const api = {
  documents: {
    getIndex: async (propertyId?: string): Promise<{ documents: IndexedDocument[]; total: number }> => {
      const url = propertyId
        ? `${API_BASE}/documents/index?property=${propertyId}`
        : `${API_BASE}/documents/index`;
      const res = await fetch(url);
      return res.json();
    },

    getServeUrl: (relativePath: string): string =>
      `${API_BASE}/documents/serve?path=${encodeURIComponent(relativePath)}`,

    search: async (query: string): Promise<{ results: IndexedDocument[]; total: number }> => {
      const res = await fetch(`${API_BASE}/documents/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
  },

  upload: {
    uploadFile: async (file: File, evidenceItemId: string, propertyId: string, category?: string): Promise<UploadResult> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('evidenceItemId', evidenceItemId);
      fd.append('propertyId', propertyId);
      if (category) fd.append('category', category);
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
      return res.json();
    },

    getServeUrl: (relativePath: string): string =>
      `${API_BASE}/upload/serve?path=${encodeURIComponent(relativePath)}`,
  },

  chat: {
    send: async (
      message: string,
      context: {
        propertyId?: string;
        evidenceItemIds?: string[];
        history?: { role: 'user' | 'assistant'; content: string }[];
        documentPaths?: string[];
        storeSnapshot?: Record<string, unknown>;
      },
      onText: (text: string) => void,
      onDone: () => void,
      onError: (error: string) => void,
    ) => {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...context }),
      });

      if (!res.ok) {
        const err = await res.json();
        onError(err.error || 'Chat request failed');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError('No response stream');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') onText(data.text);
              else if (data.type === 'done') onDone();
              else if (data.type === 'error') onError(data.error);
            } catch { /* skip malformed */ }
          }
        }
      }
      onDone();
    },
  },

  email: {
    list: async (): Promise<{ emails: IngestedEmailSummary[]; total: number }> => {
      const res = await fetch(`${API_BASE}/email/list`);
      return res.json();
    },

    detail: async (id: string): Promise<IngestedEmailDetail> => {
      const res = await fetch(`${API_BASE}/email/${id}`);
      return res.json();
    },

    check: async (): Promise<{ processed: number; skipped: number; errors: number; lastChecked: string }> => {
      const res = await fetch(`${API_BASE}/email/check`, { method: 'POST' });
      return res.json();
    },

    updateProperty: async (id: string, propertyId: string | null): Promise<void> => {
      await fetch(`${API_BASE}/email/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
    },

    stats: async (): Promise<{ total: number; matched: number; unmatched: number; withAttachments: number; configured: boolean }> => {
      const res = await fetch(`${API_BASE}/email/stats`);
      return res.json();
    },
  },

  health: async () => {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },
};
