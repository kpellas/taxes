import { create } from 'zustand';
import type { Entity, Property, Loan, TaxDocument, TaxActionItem, TimelineEvent, PropertyDocument, SourceInfo, PurchaseBreakdown, PurchaseItem } from '../types';
import { entities as seedEntities, properties as seedProperties, loans as seedLoans, taxDocuments as seedDocs, taxActionItems as seedActions, timelineEvents as seedTimeline, propertyDocuments as seedPropDocs, purchaseBreakdowns as seedPurchaseBreakdowns } from '../data/seed';
import { portfolioApi } from '../api/portfolio';

interface PortfolioState {
  entities: Entity[];
  properties: Property[];
  loans: Loan[];
  taxDocuments: TaxDocument[];
  actionItems: TaxActionItem[];
  timelineEvents: TimelineEvent[];
  propertyDocuments: PropertyDocument[];
  purchaseBreakdowns: PurchaseBreakdown[];
  _loaded: boolean;
  loadFromServer: () => Promise<{ flowchart?: unknown } | void>;
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
  (set, get) => ({
    // Start with seed data so the UI renders immediately, then overwrite from server
    entities: seedEntities,
    properties: seedProperties,
    loans: seedLoans,
    taxDocuments: seedDocs,
    actionItems: seedActions,
    timelineEvents: seedTimeline,
    propertyDocuments: seedPropDocs,
    purchaseBreakdowns: seedPurchaseBreakdowns,
    _loaded: false,

    loadFromServer: async () => {
      try {
        const data = await portfolioApi.loadSnapshot();
        set({
          entities: data.entities,
          properties: data.properties,
          loans: data.loans,
          taxDocuments: data.taxDocuments,
          actionItems: data.actionItems,
          timelineEvents: data.timelineEvents,
          propertyDocuments: data.propertyDocuments,
          purchaseBreakdowns: data.purchaseBreakdowns,
          _loaded: true,
        });
        return { flowchart: data.flowchart };
      } catch (err) {
        console.error('Failed to load from server, using seed data:', err);
        set({ _loaded: true });
      }
    },

    toggleActionItem: (id) => {
      set((s) => {
        const updated = s.actionItems.map((a) =>
          a.id === id ? { ...a, completed: !a.completed } : a
        );
        const item = updated.find((a) => a.id === id);
        if (item) portfolioApi.saveActionItem(item);
        return { actionItems: updated };
      });
    },

    updateDocumentStatus: (id, status) => {
      set((s) => {
        const updated = s.taxDocuments.map((d) =>
          d.id === id ? { ...d, status } : d
        );
        const doc = updated.find((d) => d.id === id);
        if (doc) portfolioApi.saveTaxDocument(doc);
        return { taxDocuments: updated };
      });
    },

    updatePropertyDocStatus: (id, status) => {
      set((s) => {
        const updated = s.propertyDocuments.map((d) =>
          d.id === id ? { ...d, status } : d
        );
        const doc = updated.find((d) => d.id === id);
        if (doc) portfolioApi.savePropertyDocument(doc);
        return { propertyDocuments: updated };
      });
    },

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

    updateLoan: (id, updates) => {
      set((s) => {
        const updated = s.loans.map((l) =>
          l.id === id ? { ...l, ...updates } : l
        );
        const loan = updated.find((l) => l.id === id);
        if (loan) portfolioApi.saveLoan(loan);
        return { loans: updated };
      });
    },

    updateSourceInfo: (type, id, sourceUpdate) => {
      set((s) => {
        if (type === 'property') {
          const updated = s.properties.map((p) =>
            p.id === id ? { ...p, sourceInfo: { ...p.sourceInfo, ...sourceUpdate } } : p
          );
          const prop = updated.find((p) => p.id === id);
          if (prop) portfolioApi.saveProperty(prop);
          return { properties: updated };
        }
        const updated = s.loans.map((l) =>
          l.id === id ? { ...l, sourceInfo: { ...l.sourceInfo, ...sourceUpdate } } : l
        );
        const loan = updated.find((l) => l.id === id);
        if (loan) portfolioApi.saveLoan(loan);
        return { loans: updated };
      });
    },

    updatePurchaseItem: (propertyId, itemIndex, updates) => {
      set((s) => {
        const updated = s.purchaseBreakdowns.map((pb) =>
          pb.propertyId === propertyId
            ? {
                ...pb,
                items: pb.items.map((item, i) =>
                  i === itemIndex ? { ...item, ...updates } : item
                ),
              }
            : pb
        );
        const pb = updated.find((p) => p.propertyId === propertyId);
        if (pb) portfolioApi.savePurchaseBreakdown(pb);
        return { purchaseBreakdowns: updated };
      });
    },

    updatePurchaseBuffer: (propertyId, updates) => {
      set((s) => {
        const updated = s.purchaseBreakdowns.map((pb) =>
          pb.propertyId === propertyId && pb.buffer
            ? { ...pb, buffer: { ...pb.buffer, ...updates } }
            : pb
        );
        const pb = updated.find((p) => p.propertyId === propertyId);
        if (pb) portfolioApi.savePurchaseBreakdown(pb);
        return { purchaseBreakdowns: updated };
      });
    },

    updateProperty: (id, updates) => {
      set((s) => {
        const updated = s.properties.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        );
        const prop = updated.find((p) => p.id === id);
        if (prop) portfolioApi.saveProperty(prop);
        return { properties: updated };
      });
    },

    updatePurchaseBreakdown: (propertyId, updates) => {
      set((s) => {
        const updated = s.purchaseBreakdowns.map((pb) =>
          pb.propertyId === propertyId ? { ...pb, ...updates } : pb
        );
        const pb = updated.find((p) => p.propertyId === propertyId);
        if (pb) portfolioApi.savePurchaseBreakdown(pb);
        return { purchaseBreakdowns: updated };
      });
    },

    deleteLoan: (id) => {
      portfolioApi.deleteLoan(id);
      set((s) => ({
        loans: s.loans.filter((l) => l.id !== id),
      }));
    },

    addLoan: (loan) => {
      portfolioApi.addLoan(loan);
      set((s) => ({
        loans: [...s.loans, loan],
      }));
    },

    deletePurchaseItem: (propertyId, itemIndex) => {
      set((s) => {
        const updated = s.purchaseBreakdowns.map((pb) =>
          pb.propertyId === propertyId
            ? { ...pb, items: pb.items.filter((_, i) => i !== itemIndex) }
            : pb
        );
        const pb = updated.find((p) => p.propertyId === propertyId);
        if (pb) portfolioApi.savePurchaseBreakdown(pb);
        return { purchaseBreakdowns: updated };
      });
    },

    addPurchaseItem: (propertyId, item) => {
      set((s) => {
        const updated = s.purchaseBreakdowns.map((pb) =>
          pb.propertyId === propertyId
            ? { ...pb, items: [...pb.items, item] }
            : pb
        );
        const pb = updated.find((p) => p.propertyId === propertyId);
        if (pb) portfolioApi.savePurchaseBreakdown(pb);
        return { purchaseBreakdowns: updated };
      });
    },

    deletePurchaseBreakdown: (propertyId) => {
      portfolioApi.deletePurchaseBreakdown(propertyId);
      set((s) => ({
        purchaseBreakdowns: s.purchaseBreakdowns.filter((pb) => pb.propertyId !== propertyId),
      }));
    },

    addPurchaseBreakdown: (breakdown) => {
      portfolioApi.savePurchaseBreakdown(breakdown);
      set((s) => ({
        purchaseBreakdowns: [...s.purchaseBreakdowns, breakdown],
      }));
    },
  })
);
