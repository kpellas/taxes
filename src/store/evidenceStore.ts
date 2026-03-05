import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IndexedDocument } from '../api/client';

export interface EvidenceNote {
  id: string;
  evidenceItemId: string;
  text: string;
  createdAt: string;
}

export interface EvidenceAttachment {
  id: string;
  evidenceItemId: string;
  filename: string;
  originalName: string;
  uploadedAt: string;
  path: string;
  propertyId: string;
}

interface EvidenceState {
  notes: Record<string, EvidenceNote[]>;
  attachments: Record<string, EvidenceAttachment[]>;
  documentIndex: IndexedDocument[];
  documentIndexLoaded: boolean;

  addNote: (evidenceItemId: string, text: string) => void;
  removeNote: (evidenceItemId: string, noteId: string) => void;
  addAttachment: (evidenceItemId: string, attachment: Omit<EvidenceAttachment, 'id'>) => void;
  setDocumentIndex: (docs: IndexedDocument[]) => void;
}

export const useEvidenceStore = create<EvidenceState>()(
  persist(
    (set) => ({
      notes: {},
      attachments: {},
      documentIndex: [],
      documentIndexLoaded: false,

      addNote: (evidenceItemId, text) =>
        set((state) => {
          const existing = state.notes[evidenceItemId] || [];
          const note: EvidenceNote = {
            id: Date.now().toString(36),
            evidenceItemId,
            text,
            createdAt: new Date().toISOString(),
          };
          return { notes: { ...state.notes, [evidenceItemId]: [...existing, note] } };
        }),

      removeNote: (evidenceItemId, noteId) =>
        set((state) => {
          const existing = state.notes[evidenceItemId] || [];
          return {
            notes: {
              ...state.notes,
              [evidenceItemId]: existing.filter((n) => n.id !== noteId),
            },
          };
        }),

      addAttachment: (evidenceItemId, attachment) =>
        set((state) => {
          const existing = state.attachments[evidenceItemId] || [];
          const full: EvidenceAttachment = {
            ...attachment,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          };
          return {
            attachments: { ...state.attachments, [evidenceItemId]: [...existing, full] },
          };
        }),

      setDocumentIndex: (docs) =>
        set({ documentIndex: docs, documentIndexLoaded: true }),
    }),
    {
      name: 'evidence-store',
      partialize: (state) => ({
        notes: state.notes,
        attachments: state.attachments,
        // Don't persist documentIndex — it's loaded from server each session
      }),
    }
  )
);
