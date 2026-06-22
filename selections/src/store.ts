import { create } from "zustand";
import type {
  Category,
  Discount,
  FinishOption,
  ProjectDocument,
  ProjectInfo,
  UserMode,
} from "./types";
import { CATALOG, DEFAULT_BASE_PRICE } from "./data/catalog";

const AUTOSAVE_KEY = "rid-selections-autosave";

function emptyInfo(): ProjectInfo {
  return {
    clientName: "",
    projectName: "",
    address: "",
    date: new Date().toISOString().slice(0, 10),
    salesRep: "",
    notes: "",
  };
}

function noDiscount(): Discount {
  return { label: "Discount", type: "percent", value: 0 };
}

export interface SelectionState {
  mode: UserMode;
  info: ProjectInfo;
  basePrice: number;
  selections: Record<string, string[]>;
  priceOverrides: Record<string, number>;
  discount: Discount;

  setMode: (mode: UserMode) => void;
  setInfo: (patch: Partial<ProjectInfo>) => void;
  setBasePrice: (n: number) => void;
  toggleOption: (category: Category, optionId: string) => void;
  setOverride: (optionId: string, price: number | null) => void;
  setDiscount: (patch: Partial<Discount>) => void;
  loadDocument: (doc: ProjectDocument) => void;
  toDocument: () => ProjectDocument;
  reset: () => void;
}

export const useStore = create<SelectionState>((set, get) => ({
  mode: "designer",
  info: emptyInfo(),
  basePrice: DEFAULT_BASE_PRICE,
  selections: {},
  priceOverrides: {},
  discount: noDiscount(),

  setMode: (mode) => set({ mode }),
  setInfo: (patch) => set((s) => ({ info: { ...s.info, ...patch } })),
  setBasePrice: (n) => set({ basePrice: Math.max(0, n || 0) }),

  toggleOption: (category, optionId) =>
    set((s) => {
      const current = s.selections[category.id] ?? [];
      let next: string[];
      if (category.multi) {
        next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
      } else {
        next = current.includes(optionId) ? [] : [optionId];
      }
      return { selections: { ...s.selections, [category.id]: next } };
    }),

  setOverride: (optionId, price) =>
    set((s) => {
      const next = { ...s.priceOverrides };
      if (price === null || Number.isNaN(price)) delete next[optionId];
      else next[optionId] = Math.max(0, price);
      return { priceOverrides: next };
    }),

  setDiscount: (patch) => set((s) => ({ discount: { ...s.discount, ...patch } })),

  loadDocument: (doc) =>
    set({
      info: { ...emptyInfo(), ...doc.info },
      basePrice: doc.basePrice,
      selections: doc.selections ?? {},
      priceOverrides: doc.priceOverrides ?? {},
      discount: doc.discount ?? noDiscount(),
    }),

  toDocument: () => {
    const s = get();
    return {
      version: 1,
      info: s.info,
      basePrice: s.basePrice,
      selections: s.selections,
      priceOverrides: s.priceOverrides,
      discount: s.discount,
      savedAt: new Date().toISOString(),
    };
  },

  reset: () =>
    set({
      info: emptyInfo(),
      basePrice: DEFAULT_BASE_PRICE,
      selections: {},
      priceOverrides: {},
      discount: noDiscount(),
    }),
}));

// ---- Derived pricing helpers (pure functions over state) ----

export interface SelectedLine {
  category: Category;
  option: FinishOption;
  effectivePrice: number;
}

export function effectivePrice(
  option: FinishOption,
  overrides: Record<string, number>
): number {
  if (option.pricing === "included") return 0;
  return overrides[option.id] ?? option.price;
}

export function getSelectedLines(
  selections: Record<string, string[]>,
  overrides: Record<string, number>
): SelectedLine[] {
  const lines: SelectedLine[] = [];
  for (const category of CATALOG) {
    const ids = selections[category.id] ?? [];
    for (const id of ids) {
      const option = category.options.find((o) => o.id === id);
      if (option) {
        lines.push({ category, option, effectivePrice: effectivePrice(option, overrides) });
      }
    }
  }
  return lines;
}

export interface Totals {
  upgradesTotal: number;
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
}

export function computeTotals(state: {
  basePrice: number;
  selections: Record<string, string[]>;
  priceOverrides: Record<string, number>;
  discount: Discount;
}): Totals {
  const lines = getSelectedLines(state.selections, state.priceOverrides);
  const upgradesTotal = lines.reduce((sum, l) => sum + l.effectivePrice, 0);
  const subtotal = state.basePrice + upgradesTotal;
  const discountAmount =
    state.discount.type === "percent"
      ? Math.round(subtotal * (state.discount.value / 100))
      : Math.min(subtotal, state.discount.value || 0);
  const grandTotal = Math.max(0, subtotal - discountAmount);
  return { upgradesTotal, subtotal, discountAmount, grandTotal };
}

// ---- Autosave to localStorage ----

export function loadAutosave(): ProjectDocument | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? (JSON.parse(raw) as ProjectDocument) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(doc: ProjectDocument): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
  } catch {
    /* ignore quota errors */
  }
}
