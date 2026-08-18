import { create } from "zustand";
import type {
  Catalog,
  Discount,
  Project,
  ProjectFile,
  ProjectMeta,
  UserMode,
} from "./types";

// Namespaced localStorage key (matches cabinet-designer's "jmrc.<app>.<thing>.v1").
const AUTOSAVE_KEY = "jmrc.selections.draft.v1";
const HISTORY_LIMIT = 60;

// ---- Factories ----

function defaultMeta(): ProjectMeta {
  return {
    client: "",
    project: "",
    address: "",
    date: new Date().toISOString().slice(0, 10),
    salesRep: "",
    notes: "",
  };
}

function defaultDiscount(): Discount {
  return { label: "Discount", type: "percent", value: 0 };
}

// A fresh, empty project. basePrice is seeded from the catalog once it loads.
export function defaultProject(basePrice = 0): Project {
  return {
    meta: defaultMeta(),
    basePrice,
    selections: {},
    overrides: {},
    discount: defaultDiscount(),
  };
}

// Push the current project onto the undo stack, capped at HISTORY_LIMIT.
function pushHistory(s: State): Project[] {
  const next = [...s.past, s.project];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

// ---- Store ----

type State = {
  catalog: Catalog | null;
  project: Project;
  mode: UserMode;
  activeCategory: string | null;
  past: Project[];
  future: Project[];
  // setters
  setCatalog: (c: Catalog) => void;
  setMode: (m: UserMode) => void;
  setActiveCategory: (id: string) => void;
  patchMeta: (m: Partial<ProjectMeta>) => void;
  setBasePrice: (n: number) => void;
  toggleOption: (categoryId: string, optionId: string, multi: boolean) => void;
  setOverride: (optionId: string, price: number | null, opts?: { snapshot?: boolean }) => void;
  patchDiscount: (d: Partial<Discount>, opts?: { snapshot?: boolean }) => void;
  loadProject: (p: Project) => void;
  resetProject: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const useStore = create<State>((set, get) => ({
  catalog: null,
  project: defaultProject(),
  mode: "designer",
  activeCategory: null,
  past: [],
  future: [],

  setCatalog: (c) =>
    set((s) => {
      // Seed a still-pristine project's base price from the catalog.
      const pristine =
        s.project.basePrice === 0 &&
        Object.keys(s.project.selections).length === 0;
      return {
        catalog: c,
        activeCategory: s.activeCategory ?? c.categories[0]?.id ?? null,
        project: pristine
          ? { ...s.project, basePrice: c._meta.base_price }
          : s.project,
      };
    }),

  setMode: (m) => set({ mode: m }),
  setActiveCategory: (id) => set({ activeCategory: id }),

  // Meta and base price are contract details, not design decisions — they stay
  // out of the undo history.
  patchMeta: (m) => set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, ...m } } })),
  setBasePrice: (n) =>
    set((s) => ({ project: { ...s.project, basePrice: Math.max(0, n || 0) } })),

  toggleOption: (categoryId, optionId, multi) =>
    set((s) => {
      const current = s.project.selections[categoryId] ?? [];
      let next: string[];
      if (multi) {
        next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
      } else {
        next = current.includes(optionId) ? [] : [optionId];
      }
      return {
        project: { ...s.project, selections: { ...s.project.selections, [categoryId]: next } },
        past: pushHistory(s),
        future: [],
      };
    }),

  setOverride: (optionId, price, opts) =>
    set((s) => {
      const overrides = { ...s.project.overrides };
      if (price === null || Number.isNaN(price)) delete overrides[optionId];
      else overrides[optionId] = Math.max(0, price);
      return {
        project: { ...s.project, overrides },
        past: opts?.snapshot === false ? s.past : pushHistory(s),
        future: opts?.snapshot === false ? s.future : [],
      };
    }),

  patchDiscount: (d, opts) =>
    set((s) => ({
      project: { ...s.project, discount: { ...s.project.discount, ...d } },
      past: opts?.snapshot === false ? s.past : pushHistory(s),
      future: opts?.snapshot === false ? s.future : [],
    })),

  loadProject: (p) => set({ project: p, past: [], future: [] }),

  resetProject: () =>
    set((s) => ({
      project: defaultProject(s.catalog?._meta.base_price ?? 0),
      past: [],
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      return {
        project: previous,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { project: next, past: [...s.past, s.project], future: rest };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

// ---- Free functions (catalog load + draft persistence) ----

// Fetch the catalog JSON from public/, resolving under the deploy sub-path.
export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}rid-catalog.json`);
  if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
  return (await res.json()) as Catalog;
}

// Autosave the project to localStorage, debounced. Attached once in App's mount
// effect; returns an unsubscribe cleanup. Guarded so a pristine project never
// clobbers a saved draft.
export function attachAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s) => {
    const pristine =
      Object.keys(s.project.selections).length === 0 &&
      Object.keys(s.project.overrides).length === 0 &&
      s.project.meta.client === "";
    if (pristine) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const file: ProjectFile = {
          app: "jmrc-finish-selections",
          version: 1,
          savedAt: new Date().toISOString(),
          project: s.project,
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file));
      } catch {
        // ignore quota / private-mode errors
      }
    }, 600);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}

export function restoreDraft(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as ProjectFile;
    return file.project ?? null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
