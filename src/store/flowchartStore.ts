import { create } from 'zustand';
import type { FlowchartBoxPosition, FlowchartArrow } from '../types';
import { portfolioApi } from '../api/portfolio';

interface FlowchartSnapshot {
  positions: Record<string, FlowchartBoxPosition>;
  arrows: FlowchartArrow[];
  periodLabelOverrides: Record<string, string>;
  boxColors: Record<string, string>;
}

interface FlowchartState extends FlowchartSnapshot {
  drawingArrowFrom: string | null;
  undoStack: FlowchartSnapshot[];

  loadFromServer: (data: { positions: Record<string, FlowchartBoxPosition>; arrows: FlowchartArrow[]; periodLabelOverrides: Record<string, string>; boxColors: Record<string, string> }) => void;
  setPosition: (boxId: string, pos: FlowchartBoxPosition) => void;
  clearPositions: () => void;

  addArrow: (sourceBoxId: string, targetBoxId: string) => void;
  removeArrow: (arrowId: string) => void;
  clearArrows: () => void;

  setPeriodLabel: (periodId: string, label: string) => void;

  setBoxColor: (boxId: string, color: string | null) => void;

  startDrawingArrow: (boxId: string) => void;
  cancelDrawingArrow: () => void;

  undo: () => void;
}

const MAX_UNDO = 50;

function snapshot(s: FlowchartState): FlowchartSnapshot {
  return {
    positions: { ...s.positions },
    arrows: [...s.arrows],
    periodLabelOverrides: { ...s.periodLabelOverrides },
    boxColors: { ...s.boxColors },
  };
}

// Sync all 4 keys to the server
function syncAll(s: FlowchartState) {
  portfolioApi.saveFlowchartKey('positions', s.positions);
  portfolioApi.saveFlowchartKey('arrows', s.arrows);
  portfolioApi.saveFlowchartKey('periodLabelOverrides', s.periodLabelOverrides);
  portfolioApi.saveFlowchartKey('boxColors', s.boxColors);
}

export const useFlowchartStore = create<FlowchartState>()(
  (set, get) => ({
    positions: {},
    arrows: [],
    periodLabelOverrides: {},
    boxColors: {},
    drawingArrowFrom: null,
    undoStack: [],

    loadFromServer: (data) => {
      set({
        positions: data.positions ?? {},
        arrows: data.arrows ?? [],
        periodLabelOverrides: data.periodLabelOverrides ?? {},
        boxColors: data.boxColors ?? {},
      });
    },

    setPosition: (boxId, pos) => {
      const s = get();
      const next = {
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        positions: { ...s.positions, [boxId]: pos },
      };
      set(next);
      portfolioApi.saveFlowchartKey('positions', next.positions);
    },

    clearPositions: () => {
      const s = get();
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        positions: {},
      });
      portfolioApi.saveFlowchartKey('positions', {});
    },

    addArrow: (sourceBoxId, targetBoxId) => {
      if (sourceBoxId === targetBoxId) return;
      const s = get();
      if (s.arrows.some((a) => a.sourceBoxId === sourceBoxId && a.targetBoxId === targetBoxId)) return;
      const id = `arrow-${sourceBoxId}-${targetBoxId}`;
      const nextArrows = [...s.arrows, { id, sourceBoxId, targetBoxId }];
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        arrows: nextArrows,
        drawingArrowFrom: null,
      });
      portfolioApi.saveFlowchartKey('arrows', nextArrows);
    },

    removeArrow: (arrowId) => {
      const s = get();
      const nextArrows = s.arrows.filter((a) => a.id !== arrowId);
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        arrows: nextArrows,
      });
      portfolioApi.saveFlowchartKey('arrows', nextArrows);
    },

    clearArrows: () => {
      const s = get();
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        arrows: [],
      });
      portfolioApi.saveFlowchartKey('arrows', []);
    },

    setPeriodLabel: (periodId, label) => {
      const s = get();
      const next = { ...s.periodLabelOverrides, [periodId]: label };
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        periodLabelOverrides: next,
      });
      portfolioApi.saveFlowchartKey('periodLabelOverrides', next);
    },

    setBoxColor: (boxId, color) => {
      const s = get();
      const next = { ...s.boxColors };
      if (color) {
        next[boxId] = color;
      } else {
        delete next[boxId];
      }
      set({
        undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), snapshot(s)],
        boxColors: next,
      });
      portfolioApi.saveFlowchartKey('boxColors', next);
    },

    startDrawingArrow: (boxId) => set({ drawingArrowFrom: boxId }),
    cancelDrawingArrow: () => set({ drawingArrowFrom: null }),

    undo: () => {
      const s = get();
      if (s.undoStack.length === 0) return;
      const prev = s.undoStack[s.undoStack.length - 1];
      set({
        undoStack: s.undoStack.slice(0, -1),
        positions: prev.positions,
        arrows: prev.arrows,
        periodLabelOverrides: prev.periodLabelOverrides,
        boxColors: prev.boxColors,
      });
      syncAll({ ...get(), ...prev });
    },
  })
);
