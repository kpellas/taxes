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

export const useUIStore = create<UIState>()((set) => ({
  activeEntityId: null,
  activePage: 'dashboard',
  activePropertyId: null,
  sidebarCollapsed: false,
  setActiveEntity: (id) => set({ activeEntityId: id }),
  setActivePage: (page) => set({ activePage: page, activePropertyId: null }),
  setActiveProperty: (id) => set({ activePropertyId: id, activePage: 'property-detail' }),
  navigateToProperty: (propertyId) => set({ activePropertyId: propertyId, activePage: 'property-detail' }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
