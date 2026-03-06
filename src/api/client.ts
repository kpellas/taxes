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

export interface GmailResult {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  hasAttachments: boolean;
}

export interface GmailDetail extends GmailResult {
  bodyText: string;
  attachments: { id: string; filename: string; mimeType: string; size: number }[];
}

export interface DriveResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: number | null;
  webViewLink: string;
}

export interface ResearchTurn {
  id: string;
  sessionId: string;
  query: string;
  answer: string | null;
  searchQueries: string[];
  gmailResults: GmailResult[];
  driveResults: DriveResult[];
  totalFetched: number;
  createdAt?: string;
}

export interface SavedFinding {
  id: string;
  source: 'gmail' | 'drive' | 'manual';
  sourceId?: string;
  title: string;
  snippet?: string;
  content?: string;
  date?: string;
  from?: string;
  propertyId?: string | null;
  entityId?: string | null;
  loanId?: string | null;
  tags?: string[];
  saved_at?: string;
}

// ── Global Document Index types ──

export interface GlobalDocument {
  id: string;
  canonical_name: string;
  category: string;
  provider: string | null;
  doc_date: string | null;
  source_type: string;
  source_ref: string | null;
  file_path: string | null;
  property_id: string | null;
  purpose_property_id: string | null;  // JSON array: [{"propertyId":"x","portion":100}] or legacy single id
  entity_id: string | null;
  loan_id: string | null;
  metadata: string;
  verified: number;
  file_created_at: string | null;
  added_via: string;          // existing, scraper, manual, ai
  created_at: string;
  updated_at: string;
}

export interface DocumentTemplate {
  id: string;
  event_type: string;
  name: string;
  category: string;
  description: string | null;
  required: number;
  match_hints: string;
  applies_to: string;
}

export interface GapResultItem {
  template: DocumentTemplate;
  matched: number;
  matchedDocs: GlobalDocument[];
  missing: boolean;
}

export interface GapAnalysis {
  propertyId: string;
  eventType: string;
  results: GapResultItem[];
  totalRequired: number;
  totalMissing: number;
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

    rename: async (relativePath: string, newFilename: string): Promise<{ success: boolean; newRelativePath: string; newFilename: string }> => {
      const res = await fetch(`${API_BASE}/documents/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath, newFilename }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
  },

  // ── Global Document Index ──
  globalIndex: {
    getAll: async (propertyId?: string): Promise<{ documents: GlobalDocument[]; total: number }> => {
      const url = propertyId
        ? `${API_BASE}/documents/global?property=${propertyId}`
        : `${API_BASE}/documents/global`;
      const res = await fetch(url);
      return res.json();
    },

    add: async (doc: {
      canonical_name: string;
      category: string;
      provider?: string;
      doc_date?: string;
      source_type: string;
      source_ref?: string;
      file_path?: string;
      property_id?: string;
      entity_id?: string;
      loan_id?: string;
      metadata?: Record<string, unknown>;
      links?: { link_type: string; link_id: string }[];
    }): Promise<{ id: string; success: boolean }> => {
      const res = await fetch(`${API_BASE}/documents/global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      return res.json();
    },

    remove: async (id: string): Promise<void> => {
      await fetch(`${API_BASE}/documents/global/${id}`, { method: 'DELETE' });
    },

    addLink: async (docId: string, linkType: string, linkId: string): Promise<void> => {
      await fetch(`${API_BASE}/documents/global/${docId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_type: linkType, link_id: linkId }),
      });
    },

    updateField: async (docId: string, field: string, value: string | null): Promise<void> => {
      await fetch(`${API_BASE}/documents/global/${docId}/field`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value }),
      });
    },

    setVerified: async (docId: string, verified: number): Promise<void> => {
      await fetch(`${API_BASE}/documents/global/${docId}/verified`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified }),
      });
    },

    updateProperties: async (docId: string, propertyId: string | null, purposePropertyId: string | null): Promise<void> => {
      await fetch(`${API_BASE}/documents/global/${docId}/properties`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, purpose_property_id: purposePropertyId }),
      });
    },

    sync: async (): Promise<{ added: number; updated: number; total: number }> => {
      const res = await fetch(`${API_BASE}/documents/global/sync`, { method: 'POST' });
      return res.json();
    },

    gaps: async (
      propertyId: string,
      eventType: string,
      context?: { lenderFrom?: string; lenderTo?: string; loanId?: string; isHL?: boolean }
    ): Promise<GapAnalysis> => {
      const params = new URLSearchParams({ property: propertyId, event: eventType });
      if (context?.lenderFrom) params.set('lenderFrom', context.lenderFrom);
      if (context?.lenderTo) params.set('lenderTo', context.lenderTo);
      if (context?.loanId) params.set('loanId', context.loanId);
      if (context?.isHL) params.set('isHL', 'true');
      const res = await fetch(`${API_BASE}/documents/gaps?${params}`);
      return res.json();
    },

    gapsBatch: async (
      propertyId: string,
      events: { eventType: string; lenderFrom?: string; lenderTo?: string; loanId?: string; isHL?: boolean; purchaseLenders?: string[]; accountNumbers?: string[]; dateFrom?: string; dateTo?: string }[]
    ): Promise<{ propertyId: string; results: Record<string, { template: DocumentTemplate; matched: GlobalDocument[]; missing: boolean }[]> }> => {
      const res = await fetch(`${API_BASE}/documents/gaps/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, events }),
      });
      return res.json();
    },

    getTemplates: async (eventType?: string): Promise<{ templates: DocumentTemplate[] }> => {
      const url = eventType
        ? `${API_BASE}/documents/templates/${eventType}`
        : `${API_BASE}/documents/templates`;
      const res = await fetch(url);
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

  google: {
    status: async (): Promise<{ configured: boolean; connected: boolean }> => {
      const res = await fetch(`${API_BASE}/google/status`);
      return res.json();
    },

    getAuthUrl: async (): Promise<{ url: string }> => {
      const res = await fetch(`${API_BASE}/google/auth`);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },

    disconnect: async (): Promise<void> => {
      await fetch(`${API_BASE}/google/disconnect`, { method: 'POST' });
    },

    searchGmail: async (q: string, pageToken?: string): Promise<{
      results: GmailResult[];
      nextPageToken: string | null;
      total: number;
    }> => {
      const params = new URLSearchParams({ q });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${API_BASE}/google/gmail/search?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },

    getGmailMessage: async (id: string): Promise<GmailDetail> => {
      const res = await fetch(`${API_BASE}/google/gmail/${id}`);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },

    getAttachmentUrl: (messageId: string, attachmentId: string, filename: string, mimeType: string): string =>
      `${API_BASE}/google/gmail/${messageId}/attachment/${attachmentId}?filename=${encodeURIComponent(filename)}&mimeType=${encodeURIComponent(mimeType)}`,

    searchDrive: async (q: string, pageToken?: string): Promise<{
      results: DriveResult[];
      nextPageToken: string | null;
    }> => {
      const params = new URLSearchParams({ q });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetch(`${API_BASE}/google/drive/search?${params}`);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },

    getFindings: async (): Promise<{ findings: SavedFinding[] }> => {
      const res = await fetch(`${API_BASE}/google/findings`);
      return res.json();
    },

    saveFinding: async (finding: SavedFinding): Promise<void> => {
      await fetch(`${API_BASE}/google/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding),
      });
    },

    updateFinding: async (id: string, updates: Partial<SavedFinding>): Promise<void> => {
      await fetch(`${API_BASE}/google/findings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    },

    deleteFinding: async (id: string): Promise<void> => {
      await fetch(`${API_BASE}/google/findings/${id}`, { method: 'DELETE' });
    },

    smartSearch: async (query: string, history?: { query: string; answer: string | null }[]): Promise<{
      results: GmailResult[];
      driveResults?: DriveResult[];
      searchQueries: string[];
      reasoning: string;
      answer?: string | null;
      totalFetched: number;
      totalRelevant: number;
    }> => {
      const res = await fetch(`${API_BASE}/google/smart-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, history }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },

    // Research sessions
    getSessions: async (): Promise<{ sessions: { id: string; title: string; created_at: string; updated_at: string }[] }> => {
      const res = await fetch(`${API_BASE}/google/research/sessions`);
      return res.json();
    },
    createSession: async (id: string, title?: string): Promise<void> => {
      await fetch(`${API_BASE}/google/research/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title }),
      });
    },
    deleteSession: async (id: string): Promise<void> => {
      await fetch(`${API_BASE}/google/research/sessions/${id}`, { method: 'DELETE' });
    },
    getSessionTurns: async (sessionId: string): Promise<{ turns: ResearchTurn[] }> => {
      const res = await fetch(`${API_BASE}/google/research/sessions/${sessionId}/turns`);
      return res.json();
    },
    saveSessionTurn: async (sessionId: string, turn: ResearchTurn): Promise<void> => {
      await fetch(`${API_BASE}/google/research/sessions/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(turn),
      });
    },
  },

  scrapers: {
    status: async (): Promise<{ scrapers: ScraperStatus[] }> => {
      const res = await fetch(`${API_BASE}/scrapers/status`);
      return res.json();
    },

    summary: async (): Promise<{ summary: Record<string, ScraperSummary> }> => {
      const res = await fetch(`${API_BASE}/scrapers/summary`);
      return res.json();
    },

    run: async (scraper: string, options?: Record<string, unknown>): Promise<{ status: string; message?: string }> => {
      const res = await fetch(`${API_BASE}/scrapers/${scraper}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      return res.json();
    },
  },

  health: async () => {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },
};

export interface ScraperSummary {
  totalDocs: number;
  latestDate: string | null;
  oldestDate: string | null;
  downloaded: number;
  downloadedLatest: string | null;
  downloadedOldest: string | null;
}

export interface ScraperStatus {
  scraper: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  startedAt?: string;
  completedAt?: string;
  pid?: number;
  output: string[];
  error?: string;
  distributed?: number;
  skipped?: number;
  downloaded?: number;
}
