import { create } from "zustand";
import type { Catalog, Item, Project, Rotation } from "./types";
import { rectangleRoom } from "./utils/roomPresets";
import { makeId } from "./utils/placement";

export type ViewMode = "split" | "plan" | "3d";

type GhostState = { product: import("./types").Product; mountZ: number } | null;

const HISTORY_LIMIT = 60;
const AUTOSAVE_KEY = "jmrc.cabinet.draft.v1";
const AUTOSAVE_DEBOUNCE_MS = 600;
const SHOW_PRICING_KEY = "jmrc.cabinet.showPricing.v1";
const SHOW_DIMS_KEY = "jmrc.cabinet.showDimensions.v1";

function initialShowPricing(): boolean {
  try {
    return localStorage.getItem(SHOW_PRICING_KEY) === "1";
  } catch {
    return false;
  }
}
function initialShowDimensions(): boolean {
  try {
    return localStorage.getItem(SHOW_DIMS_KEY) === "1";
  } catch {
    return false;
  }
}

type State = {
  catalog: Catalog | null;
  catalogError: string | null;
  project: Project;
  selectedId: string | null;
  view: ViewMode;
  showPricing: boolean;
  showInternalPricing: boolean;
  scheduleCollapsed: boolean;
  showDimensions: boolean;
  ghost: GhostState;
  pxPerInch: number;
  past: Project[];
  future: Project[];
  vertexEdit: boolean;
  // setters
  setCatalog: (c: Catalog) => void;
  setCatalogError: (e: string) => void;
  setProject: (p: Project, opts?: { resetHistory?: boolean }) => void;
  newProject: () => void;
  patchMeta: (m: Partial<Project["meta"]>) => void;
  patchSettings: (s: Partial<Project["settings"]>, opts?: { snapshot?: boolean }) => void;
  setRoom: (r: Project["room"]) => void;
  addItem: (i: Item) => void;
  updateItem: (id: string, patch: Partial<Item>, opts?: { snapshot?: boolean }) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  rotateSelected: () => void;
  select: (id: string | null) => void;
  setView: (v: ViewMode) => void;
  setShowPricing: (on: boolean) => void;
  setScheduleCollapsed: (on: boolean) => void;
  setShowDimensions: (on: boolean) => void;
  toggleInternalPricing: () => void;
  setGhost: (g: GhostState) => void;
  setZoom: (px: number) => void;
  setVertexEdit: (on: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

function defaultProject(): Project {
  const today = new Date().toISOString().slice(0, 10);
  return {
    meta: {
      name: "Untitled Kitchen",
      client: "",
      address: "",
      jobNumber: "",
      date: today,
    },
    settings: {
      finishCode: "SPW",
      boxMaterial: "PLY",
      wallHeight: 96,
      wallCabinetAFF: 54,
      counterHeight: 36,
      markup: 1.2,
      hstRate: 0.15,
      wallMode: 4,
    },
    room: rectangleRoom(144, 120),
    items: [],
  };
}

function pushHistory(s: { past: Project[]; project: Project }): Project[] {
  const next = [...s.past, s.project];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export const useStore = create<State>((set, get) => ({
  catalog: null,
  catalogError: null,
  project: defaultProject(),
  selectedId: null,
  view: "split",
  showPricing: initialShowPricing(),
  showInternalPricing: false,
  scheduleCollapsed: false,
  showDimensions: initialShowDimensions(),
  ghost: null,
  pxPerInch: 4,
  past: [],
  future: [],
  vertexEdit: false,

  setCatalog: (c) => set({ catalog: c }),
  setCatalogError: (e) => set({ catalogError: e }),

  setProject: (p, opts) =>
    set((s) => ({
      project: p,
      selectedId: null,
      ghost: null,
      past: opts?.resetHistory === false ? s.past : [],
      future: opts?.resetHistory === false ? s.future : [],
    })),

  newProject: () =>
    set({
      project: defaultProject(),
      selectedId: null,
      ghost: null,
      past: [],
      future: [],
    }),

  patchMeta: (m) =>
    set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, ...m } } })),

  // patchSettings snapshots history by default; pass {snapshot:false} for live number-input updates
  patchSettings: (st, opts) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, ...st } },
      past: opts?.snapshot === false ? s.past : pushHistory(s),
      future: opts?.snapshot === false ? s.future : [],
    })),

  setRoom: (r) =>
    set((s) => ({
      project: { ...s.project, room: r },
      past: pushHistory(s),
      future: [],
    })),

  addItem: (i) =>
    set((s) => ({
      project: { ...s.project, items: [...s.project.items, i] },
      selectedId: i.scheduleOnly ? s.selectedId : i.id,
      past: pushHistory(s),
      future: [],
    })),

  // updateItem during drag fires many times — caller passes {snapshot:false} for live drag,
  // then a single snapshot:true at drag end (or just once on click).
  updateItem: (id, patch, opts) =>
    set((s) => ({
      project: {
        ...s.project,
        items: s.project.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
      past: opts?.snapshot === false ? s.past : pushHistory(s),
      future: opts?.snapshot === false ? s.future : [],
    })),

  removeItem: (id) =>
    set((s) => ({
      project: { ...s.project, items: s.project.items.filter((it) => it.id !== id) },
      selectedId: s.selectedId === id ? null : s.selectedId,
      past: pushHistory(s),
      future: [],
    })),

  duplicateItem: (id) =>
    set((s) => {
      const orig = s.project.items.find((it) => it.id === id);
      if (!orig) return s;
      const copy: Item = { ...orig, id: makeId(), x: orig.x + 6, y: orig.y + 6 };
      return {
        project: { ...s.project, items: [...s.project.items, copy] },
        selectedId: copy.id,
        past: pushHistory(s),
        future: [],
      };
    }),

  rotateSelected: () =>
    set((s) => {
      if (!s.selectedId) return s;
      return {
        project: {
          ...s.project,
          items: s.project.items.map((it) =>
            it.id === s.selectedId
              ? { ...it, rotation: (((it.rotation + 90) % 360) as Rotation) }
              : it,
          ),
        },
        past: pushHistory(s),
        future: [],
      };
    }),

  select: (id) => set({ selectedId: id }),
  setView: (v) => set({ view: v }),
  setShowPricing: (on) => {
    try {
      localStorage.setItem(SHOW_PRICING_KEY, on ? "1" : "0");
    } catch {
      // ignore
    }
    set({ showPricing: on });
  },
  setScheduleCollapsed: (on) => set({ scheduleCollapsed: on }),
  setShowDimensions: (on) => {
    try {
      localStorage.setItem(SHOW_DIMS_KEY, on ? "1" : "0");
    } catch {
      // ignore
    }
    set({ showDimensions: on });
  },
  toggleInternalPricing: () => set((s) => ({ showInternalPricing: !s.showInternalPricing })),
  setGhost: (g) => set({ ghost: g }),
  setZoom: (px) => set({ pxPerInch: Math.max(1.5, Math.min(24, px)) }),
  setVertexEdit: (on) => set({ vertexEdit: on }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        project: prev,
        past: s.past.slice(0, -1),
        future: [...s.future, s.project],
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[s.future.length - 1];
      return {
        project: next,
        past: [...s.past, s.project],
        future: s.future.slice(0, -1),
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

export function loadCatalog(): Promise<Catalog> {
  const base = import.meta.env.BASE_URL || "/";
  return fetch(`${base}oppein-catalog.json`).then((r) => {
    if (!r.ok) throw new Error(`Failed to load catalog (${r.status})`);
    return r.json();
  });
}

// ===== Autosave (localStorage) =====
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
export function attachAutosave(): () => void {
  // Initial restore is handled separately via restoreDraft(); this only persists.
  const unsub = useStore.subscribe((s) => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: Date.now(), project: s.project }));
      } catch {
        // quota or privacy mode — ignore
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  });
  return unsub;
}

export function restoreDraft(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.project ?? null;
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
