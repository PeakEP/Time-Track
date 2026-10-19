import { create } from "zustand";
import type { CatalogItem, ProjectType, Quote, Settings } from "./types";
import { ApiError, isLive, server, type CatalogDoc, type Me, type QuoteSummary } from "./api";
import { mergeSettings } from "./data/defaultSettings";
import { mergeCatalogs } from "./engine/catalog";
import { computeQuote } from "./engine/pricing";
import { newQuote, normalizeQuote, numberPrefix } from "./data/questions";
import type { CabinetData } from "./engine/cabinets";

type View = "list" | "quote" | "settings";

interface State {
  status: "loading" | "signin" | "ready" | "error";
  error: string;
  live: boolean;
  me: Me | null;
  view: View;
  settings: Settings;
  settingsSaved: boolean;
  catalog: CatalogDoc;
  items: CatalogItem[];
  byId: Map<string, CatalogItem>;
  cabinetData: CabinetData;
  quotes: QuoteSummary[];
  quote: Quote | null;
  baseUpdatedAt: string;
  dirty: boolean;
  saving: boolean;
  saveError: string;
  conflict: Quote | null;
  step: number;
  toast: { text: string; bad?: boolean } | null;

  boot(): Promise<void>;
  signIn(name: string, pin: string): Promise<void>;
  go(view: View): void;
  notify(text: string, bad?: boolean): void;
  loadQuotes(): Promise<void>;
  loadCatalog(): Promise<void>;
  addCustomProduct(item: Partial<CatalogItem>): Promise<CatalogItem>;
  deleteCustomProduct(id: string): Promise<void>;
  loadCabinets(): Promise<void>;
  openQuote(id: string): Promise<void>;
  startQuote(type: ProjectType): void;
  duplicateQuote(): void;
  update(fn: (q: Quote) => void): void;
  save(force?: boolean): Promise<void>;
  takeTheirs(): void;
  setStep(n: number): void;
  saveSettings(s: Settings): Promise<void>;
  approve(note: string, revoke?: boolean): Promise<void>;
  assignNumber(): Promise<string>;
}

const emptyCatalog: CatalogDoc = {
  jmrc: { items: [], importedAt: "", importedBy: "", fileName: "" },
  square: { items: [], syncedAt: "", syncedBy: "", note: "" },
  custom: { items: [], updatedAt: "", updatedBy: "" },
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const DRAFT = "jmrc.qb.draft.v1";

function withTotals(q: Quote, s: Settings, items: CatalogItem[], cab: CabinetData) {
  const { totals } = computeQuote(q, s, items, cab);
  return { ...q, totals: { total: totals.total, subtotal: totals.subtotal } };
}

export const useApp = create<State>((set, get) => ({
  status: "loading",
  error: "",
  live: false,
  me: null,
  view: "list",
  settings: mergeSettings(null),
  settingsSaved: false,
  catalog: emptyCatalog,
  items: [],
  byId: new Map(),
  cabinetData: {},
  quotes: [],
  quote: null,
  baseUpdatedAt: "",
  dirty: false,
  saving: false,
  saveError: "",
  conflict: null,
  step: 0,
  toast: null,

  async boot() {
    try {
      const live = await isLive();
      set({ live });
      let me: Me;
      try {
        me = await server.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { set({ status: "signin" }); return; }
        throw e;
      }
      const [settings] = await Promise.all([server.settings(), get().loadCatalog(), get().loadQuotes(), get().loadCabinets()]);
      set({ me, settings: mergeSettings(settings), settingsSaved: !!settings, status: "ready" });
      // Pick up an unsaved local draft (e.g. the tab closed before it saved).
      try {
        const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
        if (d?.quote && d.dirty) set({ quote: normalizeQuote(d.quote), baseUpdatedAt: d.base || "", dirty: true, view: "quote" });
      } catch { /* ignore */ }
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  async signIn(name, pin) {
    await server.login(name, pin);
    set({ status: "loading" });
    await get().boot();
  },

  go(view) {
    if (view !== "quote" && get().dirty) void get().save();
    set({ view });
    if (view === "list") void get().loadQuotes();
  },

  notify(text, bad) {
    set({ toast: { text, bad } });
    setTimeout(() => { if (get().toast?.text === text) set({ toast: null }); }, bad ? 6000 : 3000);
  },

  async loadQuotes() {
    try { set({ quotes: await server.quotes() }); } catch (e) { get().notify((e as Error).message, true); }
  },

  async loadCatalog() {
    const catalog = await server.catalog();
    const items = [...mergeCatalogs(catalog.jmrc.items, catalog.square.items), ...(catalog.custom?.items || [])];
    set({ catalog, items, byId: new Map(items.map((i) => [i.id, i])) });
  },

  async addCustomProduct(item) {
    const it = await server.addCustomProduct(item);
    await get().loadCatalog();
    return it;
  },

  async deleteCustomProduct(id) {
    await server.deleteCustomProduct(id);
    await get().loadCatalog();
  },

  async loadCabinets() {
    try { set({ cabinetData: (await server.cabinets()) as CabinetData }); } catch { /* not loaded yet */ }
  },

  async openQuote(id) {
    if (get().dirty) await get().save();
    const q = normalizeQuote(await server.quote(id));
    set({ quote: q, baseUpdatedAt: q.updatedAt, dirty: false, conflict: null, saveError: "", step: 0, view: "quote" });
  },

  startQuote(type) {
    const q = newQuote(type, get().me?.name || "");
    set({ quote: q, baseUpdatedAt: "", dirty: true, conflict: null, saveError: "", step: 0, view: "quote" });
  },

  duplicateQuote() {
    const cur = get().quote;
    if (!cur) return;
    const q = newQuote(cur.type, get().me?.name || "");
    q.answers = JSON.parse(JSON.stringify(cur.answers));
    q.manualLines = JSON.parse(JSON.stringify(cur.manualLines));
    q.overrides = JSON.parse(JSON.stringify(cur.overrides));
    q.cabinetSets = JSON.parse(JSON.stringify(cur.cabinetSets));
    q.rates = { ...cur.rates };
    q.margins = { ...cur.margins };
    q.title = `${cur.title || cur.answers.clientName} (copy)`;
    set({ quote: q, baseUpdatedAt: "", dirty: true, conflict: null, step: 0 });
    get().notify("Copied — this is a new quote.");
  },

  update(fn) {
    const cur = get().quote;
    if (!cur) return;
    const q: Quote = JSON.parse(JSON.stringify(cur));
    fn(q);
    q.title = q.title || [q.answers.clientName, q.answers.scopeSummary].filter(Boolean).join(" — ");
    set({ quote: q, dirty: true });
    try { localStorage.setItem(DRAFT, JSON.stringify({ quote: q, base: get().baseUpdatedAt, dirty: true })); } catch { /* full */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().save(), 1500);
  },

  async save(force = false) {
    const { quote, settings, items, baseUpdatedAt, saving, cabinetData } = get();
    if (!quote || saving) return;
    set({ saving: true, saveError: "" });
    try {
      const saved = await server.saveQuote(withTotals(quote, settings, items, cabinetData), baseUpdatedAt, force);
      // Keep edits made while the save was in flight.
      const now = get().quote;
      const changed = now && JSON.stringify(now) !== JSON.stringify(quote);
      set({
        quote: changed ? { ...now!, approval: saved.approval, number: saved.number || now!.number, updatedAt: saved.updatedAt } : saved,
        baseUpdatedAt: saved.updatedAt,
        dirty: !!changed,
        conflict: null,
      });
      if (!changed) try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
      if (changed) { clearTimeout(saveTimer); saveTimer = setTimeout(() => void get().save(), 800); }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) set({ conflict: e.body.current as Quote, saveError: e.message });
      else set({ saveError: (e as Error).message });
    } finally {
      set({ saving: false });
    }
  },

  takeTheirs() {
    const c = get().conflict;
    if (!c) return;
    set({ quote: normalizeQuote(c), baseUpdatedAt: c.updatedAt, dirty: false, conflict: null, saveError: "" });
    try { localStorage.removeItem(DRAFT); } catch { /* ignore */ }
  },

  setStep(n) { set({ step: n }); window.scrollTo({ top: 0 }); },

  async saveSettings(s) {
    const saved = await server.saveSettings(s);
    set({ settings: mergeSettings(saved), settingsSaved: true });
  },

  async approve(note, revoke = false) {
    const { quote, settings, items, cabinetData } = get();
    if (!quote) return;
    if (get().dirty) await get().save();
    const { totals } = computeQuote(quote, settings, items, cabinetData);
    const q = await server.approve(quote.id, totals.total, note, revoke);
    set({ quote: q, baseUpdatedAt: q.updatedAt, dirty: false });
  },

  async assignNumber() {
    const q = get().quote;
    if (!q) return "";
    if (q.number) return q.number;
    const n = await server.nextNumber(numberPrefix(q.type));
    get().update((x) => { x.number = n; });
    return n;
  },
}));
