import { create } from "zustand";
import type { Catalog, Project, ProjectFile, ProjectMeta } from "./types";
import { pruneSelections } from "./utils/visibility";

// Namespaced localStorage key (matches the suite's "jmrc.<app>.<thing>.vN").
const AUTOSAVE_KEY = "jmrc.triangle.draft.v1";
const HISTORY_LIMIT = 60;

function defaultMeta(): ProjectMeta {
  return {
    client: "",
    contact: "",
    address: "",
    date: new Date().toISOString().slice(0, 10),
    designer: "Susan Parlee",
    employee: "",
    projectType: "",
    timeline: "",
  };
}

export function defaultProject(): Project {
  return { meta: defaultMeta(), selections: {}, notes: {}, requests: "" };
}

function pushHistory(s: State): Project[] {
  const next = [...s.past, s.project];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}

type State = {
  catalog: Catalog | null;
  project: Project;
  activeStep: string | null;
  past: Project[];
  future: Project[];
  setCatalog: (c: Catalog) => void;
  setActiveStep: (id: string) => void;
  patchMeta: (m: Partial<ProjectMeta>) => void;
  setRequests: (v: string) => void;
  setNote: (stepId: string, v: string) => void;
  toggleOption: (stepId: string, optionId: string, multi: boolean) => void;
  loadProject: (p: Project) => void;
  replaceProject: (p: Project) => void;
  resetProject: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

export const useStore = create<State>((set, get) => ({
  catalog: null,
  project: defaultProject(),
  activeStep: null,
  past: [],
  future: [],

  setCatalog: (c) =>
    set((s) => ({ catalog: c, activeStep: s.activeStep ?? c.steps[0]?.id ?? null })),

  setActiveStep: (id) => set({ activeStep: id }),

  // Meta, notes and requests are intake details, not design toggles — kept out
  // of the undo history.
  patchMeta: (m) => set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, ...m } } })),
  setRequests: (v) => set((s) => ({ project: { ...s.project, requests: v } })),
  setNote: (stepId, v) =>
    set((s) => ({ project: { ...s.project, notes: { ...s.project.notes, [stepId]: v } } })),

  toggleOption: (stepId, optionId, multi) =>
    set((s) => {
      const current = s.project.selections[stepId] ?? [];
      let next: string[];
      if (multi) {
        next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      } else {
        next = current.includes(optionId) ? [] : [optionId];
      }
      const selections = { ...s.project.selections, [stepId]: next };
      // Changing an upstream choice (construction, species, finish type…) can
      // make downstream picks unreachable — drop those so the summary stays true.
      const pruned = s.catalog ? pruneSelections(s.catalog, { ...s.project, selections }) : { ...s.project, selections };
      return { project: pruned, past: pushHistory(s), future: [] };
    }),

  loadProject: (p) =>
    set({
      project: { ...defaultProject(), ...p, meta: { ...defaultMeta(), ...p.meta }, notes: p.notes ?? {} },
      past: [],
      future: [],
    }),

  replaceProject: (p) => set({ project: p }),

  resetProject: () => set((s) => ({ project: defaultProject(), activeStep: s.catalog?.steps[0]?.id ?? null, past: [], future: [] })),

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const previous = s.past[s.past.length - 1];
      return { project: previous, past: s.past.slice(0, -1), future: [s.project, ...s.future] };
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

// ---- Catalog load + draft persistence ----

export async function loadCatalog(): Promise<Catalog> {
  const res = await fetch(`${import.meta.env.BASE_URL}triangle-catalog.json`);
  if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
  return (await res.json()) as Catalog;
}

// Off while a shared (cloud) project is open — that one saves to the server.
let localAutosave = true;
export function setLocalAutosave(on: boolean): void {
  localAutosave = on;
}

function isPristine(p: Project): boolean {
  return (
    Object.keys(p.selections).length === 0 &&
    Object.values(p.notes).every((v) => !v) &&
    p.meta.client === "" &&
    p.requests === ""
  );
}

export function attachAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s) => {
    if (!localAutosave) return;
    if (isPristine(s.project)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!localAutosave) return;
      try {
        const file: ProjectFile = {
          app: "jmrc-triangle-intake",
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
