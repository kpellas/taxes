import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  propertyId?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isOpen: boolean;
  activePropertyContext: string | null;

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string) => void;
  appendToMessage: (id: string, text: string) => void;
  setLoading: (loading: boolean) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setPropertyContext: (propertyId: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isLoading: false,
  isOpen: false,
  activePropertyContext: null,

  addMessage: (msg) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id, timestamp: new Date().toISOString() },
      ],
    }));
    return id;
  },

  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    })),

  appendToMessage: (id, text) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setPropertyContext: (propertyId) => set({ activePropertyContext: propertyId }),
  clearMessages: () => set({ messages: [] }),
}));
