import { create } from "zustand";
import type { Catalog, Item, Project, Rotation } from "./types";
import { rectangleRoom } from "./utils/roomPresets";
import { makeId } from "./utils/placement";

export type ViewMode = "split" | "plan" | "3d";

type GhostState = { product: import("./types").Product; mountZ: number } | null;

type State = {
  catalog: Catalog | null;
  catalogError: string | null;
  project: Project;
  selectedId: string | null;
  view: ViewMode;
  showInternalPricing: boolean;
  ghost: GhostState;
  pxPerInch: number; // zoom for 2D
  // setters
  setCatalog: (c: Catalog) => void;
  setCatalogError: (e: string) => void;
  setProject: (p: Project) => void;
  patchMeta: (m: Partial<Project["meta"]>) => void;
  patchSettings: (s: Partial<Project["settings"]>) => void;
  setRoom: (r: Project["room"]) => void;
  addItem: (i: Item) => void;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  rotateSelected: () => void;
  select: (id: string | null) => void;
  setView: (v: ViewMode) => void;
  toggleInternalPricing: () => void;
  setGhost: (g: GhostState) => void;
  setZoom: (px: number) => void;
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
    },
    room: rectangleRoom(144, 120),
    items: [],
  };
}

export const useStore = create<State>((set) => ({
  catalog: null,
  catalogError: null,
  project: defaultProject(),
  selectedId: null,
  view: "split",
  showInternalPricing: false,
  ghost: null,
  pxPerInch: 4, // 1/2" = 1' is 1/24, but for screen we use 4 px/in by default

  setCatalog: (c) => set({ catalog: c }),
  setCatalogError: (e) => set({ catalogError: e }),

  setProject: (p) => set({ project: p, selectedId: null, ghost: null }),

  patchMeta: (m) =>
    set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, ...m } } })),
  patchSettings: (st) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...st } } })),
  setRoom: (r) => set((s) => ({ project: { ...s.project, room: r } })),

  addItem: (i) =>
    set((s) => ({
      project: { ...s.project, items: [...s.project.items, i] },
      selectedId: i.scheduleOnly ? s.selectedId : i.id,
    })),
  updateItem: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        items: s.project.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    })),
  removeItem: (id) =>
    set((s) => ({
      project: { ...s.project, items: s.project.items.filter((it) => it.id !== id) },
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  duplicateItem: (id) =>
    set((s) => {
      const orig = s.project.items.find((it) => it.id === id);
      if (!orig) return s;
      const copy: Item = { ...orig, id: makeId(), x: orig.x + 6, y: orig.y + 6 };
      return {
        project: { ...s.project, items: [...s.project.items, copy] },
        selectedId: copy.id,
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
      };
    }),
  select: (id) => set({ selectedId: id }),
  setView: (v) => set({ view: v }),
  toggleInternalPricing: () => set((s) => ({ showInternalPricing: !s.showInternalPricing })),
  setGhost: (g) => set({ ghost: g }),
  setZoom: (px) => set({ pxPerInch: Math.max(1.5, Math.min(12, px)) }),
}));

export function loadCatalog(): Promise<Catalog> {
  // base path is /cabinet-designer/ in production; vite resolves with import.meta.env.BASE_URL
  const base = import.meta.env.BASE_URL || "/";
  return fetch(`${base}oppein-catalog.json`).then((r) => {
    if (!r.ok) throw new Error(`Failed to load catalog (${r.status})`);
    return r.json();
  });
}
