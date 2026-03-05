import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Entity, Property, Loan, TaxDocument, TaxActionItem, TimelineEvent, PropertyDocument, SourceInfo, PurchaseBreakdown, PurchaseItem } from '../types';
import { entities as seedEntities, properties as seedProperties, loans as seedLoans, taxDocuments as seedDocs, taxActionItems as seedActions, timelineEvents as seedTimeline, propertyDocuments as seedPropDocs, purchaseBreakdowns as seedPurchaseBreakdowns } from '../data/seed';

interface PortfolioState {
  entities: Entity[];
  properties: Property[];
  loans: Loan[];
  taxDocuments: TaxDocument[];
  actionItems: TaxActionItem[];
  timelineEvents: TimelineEvent[];
  propertyDocuments: PropertyDocument[];
  purchaseBreakdowns: PurchaseBreakdown[];
  toggleActionItem: (id: string) => void;
  updateDocumentStatus: (id: string, status: TaxDocument['status']) => void;
  updatePropertyDocStatus: (id: string, status: PropertyDocument['status']) => void;
  getPropertiesByEntity: (entityId: string | null) => Property[];
  getLoansByProperty: (propertyId: string) => Loan[];
  getLoansByEntity: (entityId: string | null) => Loan[];
  getLoanChain: (loanId: string) => Loan[];
  getEntity: (id: string) => Entity | undefined;
  getProperty: (id: string) => Property | undefined;
  getTimelineForProperty: (propertyId: string) => TimelineEvent[];
  getDocumentsForProperty: (propertyId: string) => PropertyDocument[];
  updateSourceInfo: (type: 'property' | 'loan', id: string, sourceInfo: Partial<SourceInfo>) => void;
  updateLoan: (id: string, updates: Partial<Loan>) => void;
  updatePurchaseItem: (propertyId: string, itemIndex: number, updates: Partial<PurchaseItem>) => void;
  updatePurchaseBuffer: (propertyId: string, updates: Partial<{ label: string; amount: number; tooltip?: string }>) => void;
  updateProperty: (id: string, updates: Partial<Property>) => void;
  updatePurchaseBreakdown: (propertyId: string, updates: Partial<PurchaseBreakdown>) => void;
  deleteLoan: (id: string) => void;
  addLoan: (loan: Loan) => void;
  deletePurchaseItem: (propertyId: string, itemIndex: number) => void;
  addPurchaseItem: (propertyId: string, item: PurchaseItem) => void;
  deletePurchaseBreakdown: (propertyId: string) => void;
  addPurchaseBreakdown: (breakdown: PurchaseBreakdown) => void;
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      entities: seedEntities,
      properties: seedProperties,
      loans: seedLoans,
      taxDocuments: seedDocs,
      actionItems: seedActions,
      timelineEvents: seedTimeline,
      propertyDocuments: seedPropDocs,
      purchaseBreakdowns: seedPurchaseBreakdowns,

      toggleActionItem: (id) =>
        set((s) => ({
          actionItems: s.actionItems.map((a) =>
            a.id === id ? { ...a, completed: !a.completed } : a
          ),
        })),

      updateDocumentStatus: (id, status) =>
        set((s) => ({
          taxDocuments: s.taxDocuments.map((d) =>
            d.id === id ? { ...d, status } : d
          ),
        })),

      updatePropertyDocStatus: (id, status) =>
        set((s) => ({
          propertyDocuments: s.propertyDocuments.map((d) =>
            d.id === id ? { ...d, status } : d
          ),
        })),

      getPropertiesByEntity: (entityId) => {
        const { properties } = get();
        if (!entityId) return properties;
        return properties.filter((p) => p.entityId === entityId);
      },

      getLoansByProperty: (propertyId) => {
        return get().loans.filter((l) => l.propertyId === propertyId);
      },

      getLoansByEntity: (entityId) => {
        const { loans } = get();
        if (!entityId) return loans;
        return loans.filter((l) => l.entityId === entityId);
      },

      getLoanChain: (loanId) => {
        const { loans } = get();
        const chain: Loan[] = [];
        let current = loans.find((l) => l.id === loanId);
        while (current?.refinancedFromId) {
          current = loans.find((l) => l.id === current!.refinancedFromId);
        }
        while (current) {
          chain.push(current);
          current = loans.find((l) => l.id === current!.refinancedToId);
        }
        return chain;
      },

      getEntity: (id) => get().entities.find((e) => e.id === id),
      getProperty: (id) => get().properties.find((p) => p.id === id),
      getTimelineForProperty: (propertyId) =>
        get().timelineEvents
          .filter((e) => e.propertyId === propertyId)
          .sort((a, b) => a.date.localeCompare(b.date)),
      getDocumentsForProperty: (propertyId) =>
        get().propertyDocuments.filter((d) => d.propertyId === propertyId),

      updateLoan: (id, updates) =>
        set((s) => ({
          loans: s.loans.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
        })),

      updateSourceInfo: (type, id, sourceUpdate) =>
        set((s) => {
          if (type === 'property') {
            return {
              properties: s.properties.map((p) =>
                p.id === id ? { ...p, sourceInfo: { ...p.sourceInfo, ...sourceUpdate } } : p
              ),
            };
          }
          return {
            loans: s.loans.map((l) =>
              l.id === id ? { ...l, sourceInfo: { ...l.sourceInfo, ...sourceUpdate } } : l
            ),
          };
        }),

      updatePurchaseItem: (propertyId, itemIndex, updates) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.map((pb) =>
            pb.propertyId === propertyId
              ? {
                  ...pb,
                  items: pb.items.map((item, i) =>
                    i === itemIndex ? { ...item, ...updates } : item
                  ),
                }
              : pb
          ),
        })),

      updatePurchaseBuffer: (propertyId, updates) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.map((pb) =>
            pb.propertyId === propertyId && pb.buffer
              ? { ...pb, buffer: { ...pb.buffer, ...updates } }
              : pb
          ),
        })),

      updateProperty: (id, updates) =>
        set((s) => ({
          properties: s.properties.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      updatePurchaseBreakdown: (propertyId, updates) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.map((pb) =>
            pb.propertyId === propertyId ? { ...pb, ...updates } : pb
          ),
        })),

      deleteLoan: (id) =>
        set((s) => ({
          loans: s.loans.filter((l) => l.id !== id),
        })),

      addLoan: (loan) =>
        set((s) => ({
          loans: [...s.loans, loan],
        })),

      deletePurchaseItem: (propertyId, itemIndex) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.map((pb) =>
            pb.propertyId === propertyId
              ? { ...pb, items: pb.items.filter((_, i) => i !== itemIndex) }
              : pb
          ),
        })),

      addPurchaseItem: (propertyId, item) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.map((pb) =>
            pb.propertyId === propertyId
              ? { ...pb, items: [...pb.items, item] }
              : pb
          ),
        })),

      deletePurchaseBreakdown: (propertyId) =>
        set((s) => ({
          purchaseBreakdowns: s.purchaseBreakdowns.filter((pb) => pb.propertyId !== propertyId),
        })),

      addPurchaseBreakdown: (breakdown) =>
        set((s) => ({
          purchaseBreakdowns: [...s.purchaseBreakdowns, breakdown],
        })),
    }),
    {
      name: 'portfolio-store',
      version: 9,
      migrate: (persisted: unknown, version: number) => {
        const data = persisted as Record<string, unknown>;
        // v7: add purchaseBreakdowns if missing
        if (version < 7) {
          if (!data.purchaseBreakdowns) data.purchaseBreakdowns = seedPurchaseBreakdowns;
        }
        // v9: surgical fixes — NAB amount, HG purchase, Bannerman purchase
        if (version < 9) {
          // Fix NAB 718701068: 516000 → 515000
          const loans = data.loans as Array<Record<string, unknown>> | undefined;
          if (loans) {
            const nab = loans.find((l) => l.id === 'nab-chisholm');
            if (nab && nab.originalAmount === 516000) nab.originalAmount = 515000;
          }
          // Fix Heddon Greta purchase + add Bannerman purchase
          data.purchaseBreakdowns = seedPurchaseBreakdowns;
        }
        return data;
      },
    }
  )
);
