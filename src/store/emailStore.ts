import { create } from 'zustand';
import { api } from '../api/client';
import type { IngestedEmailSummary } from '../api/client';

interface EmailState {
  emails: IngestedEmailSummary[];
  loading: boolean;
  checking: boolean;
  lastChecked: string | null;
  fetchEmails: () => Promise<void>;
  checkNow: () => Promise<{ processed: number; skipped: number; errors: number }>;
  updateProperty: (emailId: string, propertyId: string | null) => Promise<void>;
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  emails: [],
  loading: false,
  checking: false,
  lastChecked: null,

  fetchEmails: async () => {
    set({ loading: true });
    try {
      const { emails } = await api.email.list();
      set({ emails, loading: false });
    } catch (err) {
      console.error('Failed to fetch emails:', err);
      set({ loading: false });
    }
  },

  checkNow: async () => {
    set({ checking: true });
    try {
      const result = await api.email.check();
      set({ lastChecked: result.lastChecked, checking: false });
      // Refresh the list after check
      await get().fetchEmails();
      return result;
    } catch (err) {
      console.error('Email check failed:', err);
      set({ checking: false });
      return { processed: 0, skipped: 0, errors: 0 };
    }
  },

  updateProperty: async (emailId, propertyId) => {
    await api.email.updateProperty(emailId, propertyId);
    // Update local state
    set((s) => ({
      emails: s.emails.map((e) =>
        e.id === emailId
          ? { ...e, propertyId, matchConfidence: propertyId ? 'high' as const : 'none' as const, matchReason: propertyId ? 'Manually assigned' : 'Unassigned' }
          : e
      ),
    }));
  },
}));
