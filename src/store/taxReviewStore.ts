import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TaxReturn, TaxReturnLineItem } from '../types';
import { SEED_RETURNS } from '../data/taxReviewSeed';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

interface TaxReviewState {
  returns: TaxReturn[];
  _version: number;
  addReturn: (r: Omit<TaxReturn, 'id' | 'lineItems'>) => string;
  updateReturn: (id: string, updates: Partial<TaxReturn>) => void;
  deleteReturn: (id: string) => void;
  addLineItem: (returnId: string, item: Omit<TaxReturnLineItem, 'id'>) => void;
  updateLineItem: (returnId: string, itemId: string, updates: Partial<TaxReturnLineItem>) => void;
  deleteLineItem: (returnId: string, itemId: string) => void;
  getReturnsByYear: (fy: string) => TaxReturn[];
  getReturnsByPerson: (name: string) => TaxReturn[];
}

export const useTaxReviewStore = create<TaxReviewState>()(
  persist(
    (set, get) => ({
      returns: SEED_RETURNS,
      _version: 2,

      addReturn: (r) => {
        const id = genId();
        set((s) => ({
          returns: [...s.returns, { ...r, id, lineItems: [] }],
        }));
        return id;
      },

      updateReturn: (id, updates) =>
        set((s) => ({
          returns: s.returns.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      deleteReturn: (id) =>
        set((s) => ({ returns: s.returns.filter((r) => r.id !== id) })),

      addLineItem: (returnId, item) =>
        set((s) => ({
          returns: s.returns.map((r) =>
            r.id === returnId
              ? { ...r, lineItems: [...r.lineItems, { ...item, id: genId() }] }
              : r
          ),
        })),

      updateLineItem: (returnId, itemId, updates) =>
        set((s) => ({
          returns: s.returns.map((r) =>
            r.id === returnId
              ? {
                  ...r,
                  lineItems: r.lineItems.map((li) =>
                    li.id === itemId ? { ...li, ...updates } : li
                  ),
                }
              : r
          ),
        })),

      deleteLineItem: (returnId, itemId) =>
        set((s) => ({
          returns: s.returns.map((r) =>
            r.id === returnId
              ? { ...r, lineItems: r.lineItems.filter((li) => li.id !== itemId) }
              : r
          ),
        })),

      getReturnsByYear: (fy) => get().returns.filter((r) => r.financialYear === fy),
      getReturnsByPerson: (name) => get().returns.filter((r) => r.personName === name),
    }),
    {
      name: 'tax-review-store',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        // If coming from an older version, replace with seed data
        if (version < 2) {
          return { ...(persisted as Record<string, unknown>), returns: SEED_RETURNS, _version: 2 };
        }
        return persisted;
      },
    }
  )
);
