import { create } from 'zustand';
import type { Page } from '../types';

interface UIState {
  activeEntityId: string | null;
  activePage: Page;
  activePropertyId: string | null;
  sidebarCollapsed: boolean;
  setActiveEntity: (id: string | null) => void;
  setActivePage: (page: Page) => void;
  setActiveProperty: (id: string | null) => void;
  navigateToProperty: (propertyId: string) => void;
  toggleSidebar: () => void;
}

// Restore last page from sessionStorage so hard-refresh stays on the same page
function loadSession(): { activePage: Page; activePropertyId: string | null } {
  try {
    const page = sessionStorage.getItem('ui-activePage') as Page | null;
    const propId = sessionStorage.getItem('ui-activePropertyId');
    return { activePage: page || 'dashboard', activePropertyId: propId || null };
  } catch {
    return { activePage: 'dashboard', activePropertyId: null };
  }
}

function saveSession(page: Page, propertyId: string | null) {
  try {
    sessionStorage.setItem('ui-activePage', page);
    if (propertyId) sessionStorage.setItem('ui-activePropertyId', propertyId);
    else sessionStorage.removeItem('ui-activePropertyId');
  } catch { /* ignore */ }
}

const initial = loadSession();

export const useUIStore = create<UIState>()((set) => ({
  activeEntityId: null,
  activePage: initial.activePage,
  activePropertyId: initial.activePropertyId,
  sidebarCollapsed: false,
  setActiveEntity: (id) => set({ activeEntityId: id }),
  setActivePage: (page) => {
    saveSession(page, null);
    set({ activePage: page, activePropertyId: null });
  },
  setActiveProperty: (id) => {
    saveSession('property-detail', id);
    set({ activePropertyId: id, activePage: 'property-detail' });
  },
  navigateToProperty: (propertyId) => {
    saveSession('property-detail', propertyId);
    set({ activePropertyId: propertyId, activePage: 'property-detail' });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
