import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FlowchartBoxPosition, FlowchartArrow } from '../types';

interface FlowchartState {
  positions: Record<string, FlowchartBoxPosition>;
  arrows: FlowchartArrow[];
  periodLabelOverrides: Record<string, string>;
  drawingArrowFrom: string | null;

  setPosition: (boxId: string, pos: FlowchartBoxPosition) => void;
  clearPositions: () => void;

  addArrow: (sourceBoxId: string, targetBoxId: string) => void;
  removeArrow: (arrowId: string) => void;
  clearArrows: () => void;

  setPeriodLabel: (periodId: string, label: string) => void;

  startDrawingArrow: (boxId: string) => void;
  cancelDrawingArrow: () => void;
}

export const useFlowchartStore = create<FlowchartState>()(
  persist(
    (set, get) => ({
      positions: {},
      arrows: [],
      periodLabelOverrides: {},
      drawingArrowFrom: null,

      setPosition: (boxId, pos) =>
        set((s) => ({
          positions: { ...s.positions, [boxId]: pos },
        })),

      clearPositions: () => set({ positions: {} }),

      addArrow: (sourceBoxId, targetBoxId) => {
        if (sourceBoxId === targetBoxId) return;
        const { arrows } = get();
        // Don't add duplicate
        if (arrows.some((a) => a.sourceBoxId === sourceBoxId && a.targetBoxId === targetBoxId)) return;
        const id = `arrow-${sourceBoxId}-${targetBoxId}`;
        set({
          arrows: [...arrows, { id, sourceBoxId, targetBoxId }],
          drawingArrowFrom: null,
        });
      },

      removeArrow: (arrowId) =>
        set((s) => ({
          arrows: s.arrows.filter((a) => a.id !== arrowId),
        })),

      clearArrows: () => set({ arrows: [] }),

      setPeriodLabel: (periodId, label) =>
        set((s) => ({
          periodLabelOverrides: { ...s.periodLabelOverrides, [periodId]: label },
        })),

      startDrawingArrow: (boxId) => set({ drawingArrowFrom: boxId }),
      cancelDrawingArrow: () => set({ drawingArrowFrom: null }),
    }),
    {
      name: 'flowchart-store',
      version: 1,
      partialize: (state) => ({
        positions: state.positions,
        arrows: state.arrows,
        periodLabelOverrides: state.periodLabelOverrides,
      }),
    }
  )
);
