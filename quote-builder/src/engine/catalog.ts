import type { CatalogItem, ToolComponent } from "../types";

// Cost catalog: the JMRC master cost catalog (CSV export, uploaded by the
// owner in Settings) merged with the Robins Interiors Square catalog (synced
// from Square: each variation's Default Unit Cost, never the retail price).

/* ----------------------------- CSV ----------------------------- */

// RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// Small stable hash for catalog ids (so a re-imported catalog keeps the ids
// that quotes and Settings pins refer to, as long as the row is the same item).
export function hashId(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

const REQUIRED = ["Cost Item Name", "Description", "Unit", "Unit Cost", "Cost Code"];

// Parse the JMRC master export (columns: Cost Item Name, Description, Unit,
// Unit Cost, Cost Code, Cost Type). Blank and $0.00 costs stay unpriced.
export function parseJmrcCatalog(text: string): { items: CatalogItem[]; warnings: string[] } {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (!rows.length) throw new Error("The file is empty.");
  const head = rows[0].map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !head.includes(h));
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}. Use the master catalog export.`);
  const col = (r: string[], h: string) => (r[head.indexOf(h)] ?? "").trim();
  const items: CatalogItem[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const name = col(r, "Cost Item Name");
    const description = col(r, "Description");
    if (!name && !description) return;
    const raw = col(r, "Unit Cost").replace(/[$,\s]/g, "");
    const cost = raw === "" ? null : Number(raw);
    if (raw !== "" && !Number.isFinite(cost)) warnings.push(`Row ${i + 2}: unit cost "${col(r, "Unit Cost")}" isn't a number — left unpriced.`);
    const unit = col(r, "Unit").toUpperCase();
    const costCode = col(r, "Cost Code");
    const base = `${name}|${description}|${unit}|${costCode}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const sku = description.match(/Square SKU ([^)]+)\)/i)?.[1]?.trim();
    items.push({
      id: "jmrc:" + hashId(n > 1 ? `${base}#${n}` : base),
      source: "jmrc",
      name,
      description: description.replace(/\s+/g, " "),
      unit,
      unitCost: cost != null && Number.isFinite(cost) && cost > 0 ? cost : null,
      costCode,
      ...(sku ? { sku } : {}),
    });
  });
  return { items, warnings };
}

/* ----------------------------- search ----------------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'").replace(/\s+/g, " ");

export function haystack(it: CatalogItem): string {
  return norm(`${it.name} ${it.description} ${it.sku || ""} ${it.costCode}`);
}

// Every term must match (like the catalog skill's search). Ranked: priced
// before unpriced, then shorter descriptions (more specific) first.
export function searchCatalog(
  items: CatalogItem[],
  query: string | string[],
  opts: { codes?: string[]; unit?: string; limit?: number; source?: "jmrc" | "square" } = {},
): CatalogItem[] {
  const terms = (Array.isArray(query) ? query : query.split(/\s+/)).map(norm).map((t) => t.trim()).filter(Boolean);
  const out = items.filter((it) => {
    if (opts.source && it.source !== opts.source) return false;
    if (opts.codes?.length && !opts.codes.some((c) => it.costCode.startsWith(c) || norm(it.costCode).includes(norm(c)))) return false;
    if (opts.unit && it.unit !== opts.unit) return false;
    const h = haystack(it);
    return terms.every((t) => h.includes(t));
  });
  out.sort((a, b) => Number(b.unitCost != null) - Number(a.unitCost != null) || a.description.length - b.description.length);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

// How an item reads on screen and on the proposal: the product name plus the
// spec, without repeating the name when the description already holds it.
export function itemLabel(it: CatalogItem): string {
  const n = it.name.trim(), d = it.description.trim();
  const s = !d || d === n ? n : !n || d.toLowerCase().includes(n.toLowerCase()) ? d : `${n} — ${d}`;
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

export interface Resolved {
  item: CatalogItem | null;
  how: "pinned" | "selected" | "matched" | "none";
  alternatives: number; // other candidates the match terms also hit
}

// Find the catalog item for a takeoff component: the owner's pin wins, then
// the first match for the component's terms.
export function resolveComponent(comp: ToolComponent, byId: Map<string, CatalogItem>, items: CatalogItem[]): Resolved {
  if (comp.pinnedItemId) {
    const it = byId.get(comp.pinnedItemId);
    if (it) return { item: it, how: "pinned", alternatives: 0 };
  }
  const hits = searchCatalog(items, comp.match, { codes: comp.codes });
  const preferred = comp.unit ? hits.filter((h) => h.unit === comp.unit) : hits;
  const list = preferred.length ? preferred : hits;
  return { item: list[0] || null, how: list[0] ? "matched" : "none", alternatives: Math.max(0, list.length - 1) };
}

// Square + JMRC: a JMRC row that names a Square SKU takes the live Square cost
// when one is synced (the catalog skill: Square Default Unit Cost is JMRC's
// cost for Robins Interiors products).
export function mergeCatalogs(jmrc: CatalogItem[], square: CatalogItem[]): CatalogItem[] {
  const bySku = new Map(square.filter((s) => s.sku).map((s) => [norm(s.sku!), s]));
  const linked = new Set<string>();
  const merged = jmrc.map((it) => {
    const sq = it.sku ? bySku.get(norm(it.sku)) : undefined;
    if (sq && sq.unitCost != null) {
      linked.add(sq.id);
      return { ...it, unitCost: sq.unitCost, retail: sq.retail ?? null };
    }
    return it;
  });
  return [...merged, ...square.filter((s) => !linked.has(s.id))];
}
