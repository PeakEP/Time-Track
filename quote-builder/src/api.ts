import type { CatalogItem, Quote, Settings } from "./types";

// Talks to /api/quote-builder (Netlify). Signed in by the suite cookie. When
// there's no server (plain `vite dev`), everything is kept in this browser
// instead so the app can still be tried out.

const API = `/api/quote-builder/`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) { super(message); }
}

async function api<T>(method: string, path: string, body?: unknown, raw?: BodyInit): Promise<T> {
  const r = await fetch(API + path, {
    method,
    credentials: "same-origin",
    headers: raw ? { "content-type": "application/octet-stream" } : body !== undefined ? { "content-type": "application/json" } : {},
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || `Request failed (${r.status})`, data);
  return data as T;
}

export interface Me { id: string; name: string; admin: boolean }
export interface QuoteSummary {
  id: string; number: string; version: number; type: Quote["type"]; title: string; status: Quote["status"];
  client: string; address: string; total: number | null; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface CatalogDoc {
  jmrc: { items: CatalogItem[]; importedAt: string; importedBy: string; fileName: string };
  square: { items: CatalogItem[]; syncedAt: string; syncedBy: string; note: string };
  custom: { items: CatalogItem[]; updatedAt: string; updatedBy: string };
}

/* ------------------------------ local mode ------------------------------ */

const LS = {
  settings: "jmrc.qb.local.settings",
  catalog: "jmrc.qb.local.catalog",
  quotes: "jmrc.qb.local.quotes",
  cabinets: "jmrc.qb.local.cabinets",
};
const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full */ } };

let live: boolean | null = null;
export async function isLive(): Promise<boolean> {
  if (live != null) return live;
  try {
    const r = await fetch(API + "config", { credentials: "same-origin" });
    const j = await r.json();
    live = !!j.live;
  } catch {
    live = false;
  }
  return live;
}

const emptyCatalog = (): CatalogDoc => ({
  jmrc: { items: [], importedAt: "", importedBy: "", fileName: "" },
  square: { items: [], syncedAt: "", syncedBy: "", note: "" },
  custom: { items: [], updatedAt: "", updatedBy: "" },
});

export const server = {
  async me(): Promise<Me> {
    if (!(await isLive())) return { id: "local", name: "Local user", admin: true };
    return (await api<{ me: Me }>("GET", "me")).me;
  },
  async login(name: string, pin: string): Promise<void> {
    await api("POST", "login", { name, pin });
  },
  async settings(): Promise<Settings | null> {
    if (!(await isLive())) return lsGet<Settings | null>(LS.settings, null);
    return (await api<{ settings: Settings | null }>("GET", "settings")).settings;
  },
  async saveSettings(s: Settings): Promise<Settings> {
    if (!(await isLive())) { const v = { ...s, updatedAt: new Date().toISOString(), updatedBy: "Local user" }; lsSet(LS.settings, v); return v; }
    return (await api<{ settings: Settings }>("PUT", "settings", { settings: s })).settings;
  },
  async catalog(): Promise<CatalogDoc> {
    if (!(await isLive())) return lsGet(LS.catalog, emptyCatalog());
    return api<CatalogDoc>("GET", "catalog");
  },
  async putJmrc(items: CatalogItem[], fileName: string): Promise<void> {
    if (!(await isLive())) {
      const c = lsGet(LS.catalog, emptyCatalog());
      c.jmrc = { items, importedAt: new Date().toISOString(), importedBy: "Local user", fileName };
      lsSet(LS.catalog, c);
      return;
    }
    await api("PUT", "catalog/jmrc", { items, fileName });
  },
  async addCustomProduct(item: Partial<CatalogItem>): Promise<CatalogItem> {
    if (!(await isLive())) {
      const c = lsGet(LS.catalog, emptyCatalog());
      c.custom = c.custom || { items: [], updatedAt: "", updatedBy: "" };
      const it: CatalogItem = {
        id: item.id || "cust_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
        source: "custom", name: item.name || "", description: item.description || "",
        unit: (item.unit || "EA").toUpperCase(), unitCost: item.unitCost ?? null, costCode: item.costCode || "",
      };
      const i = c.custom.items.findIndex((x) => x.id === it.id);
      if (i >= 0) c.custom.items[i] = it; else c.custom.items.push(it);
      lsSet(LS.catalog, c);
      return it;
    }
    return (await api<{ item: CatalogItem }>("POST", "catalog/custom", item)).item;
  },
  async deleteCustomProduct(id: string): Promise<void> {
    if (!(await isLive())) {
      const c = lsGet(LS.catalog, emptyCatalog());
      if (c.custom) c.custom.items = c.custom.items.filter((x) => x.id !== id);
      lsSet(LS.catalog, c);
      return;
    }
    await api("DELETE", `catalog/custom/${encodeURIComponent(id)}`);
  },
  async cabinets(): Promise<Record<string, any>> {
    if (!(await isLive())) return lsGet(LS.cabinets, {});
    return api("GET", "catalog/cabinets");
  },
  async putCabinets(files: any[]): Promise<void> {
    if (!(await isLive())) {
      const c = lsGet<Record<string, any>>(LS.cabinets, {});
      for (const f of files) { const k = String(f.supplier).toLowerCase(); c[k] = { ...f, loadedAt: new Date().toISOString(), loadedBy: "Local user" }; }
      lsSet(LS.cabinets, c);
      return;
    }
    await api("PUT", "catalog/cabinets", { files });
  },
  async squareSync(): Promise<{ count: number; skipped: number }> {
    if (!(await isLive())) throw new ApiError(400, "Square sync runs on the live site (it needs the Square token set in Netlify).");
    return api("POST", "catalog/square-sync");
  },
  async quotes(): Promise<QuoteSummary[]> {
    if (!(await isLive())) {
      const all = lsGet<Record<string, Quote & { totals?: { total: number } }>>(LS.quotes, {});
      return Object.values(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((q) => ({
        id: q.id, number: q.number, version: q.version, type: q.type, title: q.title, status: q.status,
        client: q.answers.clientName, address: q.answers.siteAddress, total: q.totals?.total ?? null,
        createdBy: q.createdBy, updatedAt: q.updatedAt, updatedBy: "",
      }));
    }
    return (await api<{ quotes: QuoteSummary[] }>("GET", "quotes")).quotes;
  },
  async quote(id: string): Promise<Quote> {
    if (!(await isLive())) {
      const q = lsGet<Record<string, Quote>>(LS.quotes, {})[id];
      if (!q) throw new ApiError(404, "Quote not found");
      return q;
    }
    return (await api<{ quote: Quote }>("GET", `quotes/${id}`)).quote;
  },
  async saveQuote(q: Quote & { totals?: unknown }, baseUpdatedAt: string, force = false): Promise<Quote> {
    if (!(await isLive())) {
      const all = lsGet<Record<string, Quote>>(LS.quotes, {});
      const v = { ...q, updatedAt: new Date().toISOString() };
      all[q.id] = v;
      lsSet(LS.quotes, all);
      return v;
    }
    return (await api<{ quote: Quote }>("PUT", `quotes/${q.id}`, { quote: q, baseUpdatedAt, force })).quote;
  },
  async deleteQuote(id: string): Promise<void> {
    if (!(await isLive())) {
      const all = lsGet<Record<string, Quote>>(LS.quotes, {});
      delete all[id];
      lsSet(LS.quotes, all);
      return;
    }
    await api("DELETE", `quotes/${id}`);
  },
  async approve(id: string, total: number, note: string, revoke = false): Promise<Quote> {
    if (!(await isLive())) {
      const all = lsGet<Record<string, Quote>>(LS.quotes, {});
      const q = all[id];
      if (!q) throw new ApiError(404, "Save the quote first");
      if (revoke) { delete q.approval; q.status = "needs-approval"; }
      else { q.approval = { by: "Local user", at: new Date().toISOString(), note, totalAtApproval: total }; q.status = "approved"; }
      lsSet(LS.quotes, all);
      return q;
    }
    return (await api<{ quote: Quote }>("POST", `quotes/${id}/approve`, { total, note, revoke })).quote;
  },
  async nextNumber(prefix: string): Promise<string> {
    if (!(await isLive())) {
      const s = lsGet<Settings | null>(LS.settings, null);
      const n = s?.nextNumbers?.[prefix] || 1;
      if (s) { s.nextNumbers = { ...(s.nextNumbers || {}), [prefix]: n + 1 }; lsSet(LS.settings, s); }
      return `${prefix}-${String(n).padStart(2, "0")}`;
    }
    return (await api<{ number: string }>("POST", "numbers", { prefix })).number;
  },
  async uploadChunk(jobId: string, fileId: string, n: number, data: Blob) {
    return api("PUT", `uploads/${jobId}/${fileId}/${n}`, undefined, data);
  },
  async startRead(body: unknown) {
    return api<{ jobId: string }>("POST", "read", body);
  },
  async readStatus(jobId: string) {
    return api<{ status: string; error: string; result: any }>("GET", `read/${jobId}`);
  },
};
