import type { CabinetSet, CabinetSupplier } from "../types";

// Cabinet pricing for Aline, Oppein and Divine — the same data and rules as
// the jmrc-cabinet-quoting skill (scripts/quote.py). The supplier files
// (aline.json, oppein.json, divine.json) are uploaded by an Admin in Settings.
//
//   Aline   list = box (PB/PLY) + door (per door style)     dealer = list × (1 − 0.66)
//   Oppein  list = all-in price by box × colour tier         dealer = list × (1 − 0.58)
//   Divine  list = price by code (E9 small premium)          dealer = list × (1 − 0.55)
//
// The discount is read from each file, never hard-coded here.

export interface CabinetData {
  aline?: any;
  oppein?: any;
  divine?: any;
}

export const SUPPLIER_LABEL: Record<CabinetSupplier, string> = { aline: "Aline", oppein: "Oppein", divine: "Divine" };

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;

export function identifySupplier(json: any): CabinetSupplier | null {
  const s = String(json?.supplier || "").toLowerCase();
  if (s.includes("aline")) return "aline";
  if (s.includes("oppein")) return "oppein";
  if (s.includes("divine")) return "divine";
  return null;
}

export function validateCabinetFile(json: any): string | null {
  const sup = identifySupplier(json);
  if (!sup) return "This isn't an Aline, Oppein or Divine catalog file (no \"supplier\" field).";
  if (typeof json.discount !== "number" || !(json.discount > 0 && json.discount < 1)) return `${SUPPLIER_LABEL[sup]}: the file has no dealer discount.`;
  if (!Array.isArray(json.products) || !json.products.length) return `${SUPPLIER_LABEL[sup]}: the file has no products.`;
  return null;
}

type Found = { kind: "cabinet" | "shared" | "product"; prod: any } | null;

export function findProduct(supplier: CabinetSupplier, data: any, sku: string): Found {
  if (!data) return null;
  const raw = String(sku).trim();
  if (supplier === "divine") {
    const m = raw.match(/^(A5|H2|H3|H8|S6|S7|D1|E9)-(.+)$/i);
    const code = m ? m[2] : raw;
    const p = data.products.find((x: any) => norm(x.code) === norm(code));
    if (p) return { kind: "cabinet", prod: p };
    const sh = (data.shared || []).find((x: any) => norm(x.sku) === norm(raw) || norm(x.sku) === norm(code));
    return sh ? { kind: "shared", prod: sh } : null;
  }
  const p = data.products.find((x: any) => norm(x.sku) === norm(raw));
  return p ? { kind: "product", prod: p } : null;
}

export function suggestSkus(supplier: CabinetSupplier, data: any, sku: string, n = 6): string[] {
  if (!data) return [];
  const key = norm(sku).slice(0, 3);
  const pool: string[] = supplier === "divine"
    ? [...data.products.map((p: any) => p.code), ...(data.shared || []).map((p: any) => p.sku)]
    : data.products.map((p: any) => p.sku);
  return key ? pool.filter((s) => norm(s).startsWith(key)).slice(0, n) : [];
}

export interface CabinetPrice {
  sku: string;
  desc: string;
  dims: string;
  list: number;
  discount: number;
  dealer: number;
  finish: string; // what the price was based on
  assemblyEach: number;
}

export function priceCabinet(set: Pick<CabinetSet, "supplier" | "box" | "color" | "style">, data: any, sku: string): CabinetPrice | null {
  const f = findProduct(set.supplier, data, sku);
  if (!f) return null;
  const { prod, kind } = f;
  const disc: number = data.discount;
  let list = 0, finish = "", desc = prod.desc || "", dims = prod.dims || "", code = prod.sku || prod.code, assemblyEach = 0;

  if (set.supplier === "aline") {
    const styles = data.door_styles || {};
    let style = (set.style || "").toLowerCase();
    if (!style && set.color) {
      for (const [st, info] of Object.entries<any>(styles)) if (info.colors?.some((c: any) => norm(c.code) === norm(set.color))) { style = st; break; }
    }
    style = style || "shaker";
    const p = prod.prices?.[style];
    if (!p) return null;
    let box = set.box.toLowerCase();
    let bp = p[box];
    if (bp == null) { box = box === "pb" ? "ply" : "pb"; bp = p[box]; }
    list = r2((bp || 0) + (p.door || 0));
    finish = `${styles[style]?.name || style}${set.color ? ` ${set.color}` : ""}, ${box.toUpperCase()} box`;
  } else if (set.supplier === "oppein") {
    let tier = data.colors?.find((c: any) => norm(c.code) === norm(set.color))?.tier || "essential";
    const table = prod[set.box === "PLY" ? "ply" : "pb"] || {};
    if (!(tier in table)) {
      const avail = (data.tiers || []).filter((t: string) => t in table);
      tier = avail[avail.length - 1] || Object.keys(table)[0];
    }
    if (table[tier] == null) return null;
    list = r2(Number(table[tier]));
    finish = `${data.tier_names?.[tier] || tier} tier${set.color ? ` (${set.color})` : ""}, ${set.box} box`;
  } else {
    const style = (set.style || "A5").toUpperCase();
    if (kind === "shared") {
      list = r2(Number(prod.price));
      finish = "shared item";
      code = prod.sku;
    } else {
      list = r2(Number(prod.prices?.[style] ?? prod.base_price));
      const fm = data.style_finish_map?.[style];
      finish = `${style}${fm ? ` ${fm.finish} (${fm.profile})` : ""}${set.color ? `, ${set.color}` : ""}`;
      code = `${style}-${prod.code}`;
      assemblyEach = data.assembly_per_unit?.[prod.cat] || 0;
    }
  }
  if (!(list > 0)) return null;
  return { sku: code, desc, dims, list, discount: disc, dealer: r2(list * (1 - disc)), finish, assemblyEach };
}

// "B24:2, W3030 x3, SB36" or one per line, or CSV "sku,qty".
export function parseSkuList(text: string): { sku: string; qty: number }[] {
  const out: { sku: string; qty: number }[] = [];
  for (const tok of text.split(/[,\n;]+/)) {
    const t = tok.trim();
    if (!t || /^sku\b/i.test(t)) continue;
    const m = t.match(/^([A-Za-z0-9\-/.]+)\s*(?:[:x*×]\s*|\s+)?(\d+)?$/);
    if (m) out.push({ sku: m[1], qty: Number(m[2] || 1) });
  }
  return out;
}

// Finish options to show in the Cabinets step.
export interface FinishOptions { colors: { code: string; name: string; group?: string }[]; styles: { code: string; name: string }[] }
export function finishOptions(supplier: CabinetSupplier, data: any): FinishOptions {
  if (!data) return { colors: [] as { code: string; name: string; group?: string }[], styles: [] as { code: string; name: string }[] };
  if (supplier === "oppein")
    return { colors: (data.colors || []).map((c: any) => ({ code: c.code, name: c.name, group: data.tier_names?.[c.tier] || c.tier })), styles: [] };
  if (supplier === "aline")
    return {
      styles: Object.entries<any>(data.door_styles || {}).map(([code, v]) => ({ code, name: v.name })),
      colors: Object.entries<any>(data.door_styles || {}).flatMap(([st, v]) => (v.colors || []).map((c: any) => ({ code: c.code, name: c.name, group: st }))),
    };
  return {
    styles: (data.style_groups || []).filter((s: string) => !["D1", "H2"].includes(s)).map((s: string) => ({ code: s, name: data.style_finish_map?.[s] ? `${s} ${data.style_finish_map[s].finish}` : s })),
    colors: (data.finishing_colors || []).map((c: string) => ({ code: c, name: c })),
  };
}

export function searchSkus(supplier: CabinetSupplier, data: any, q: string, limit = 60) {
  if (!data) return [];
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = supplier === "divine"
    ? [...data.products.map((p: any) => ({ sku: p.code, desc: p.desc, cat: p.cat || "" })), ...(data.shared || []).map((p: any) => ({ sku: p.sku, desc: p.desc, cat: p.group || p.cat || "" }))]
    : data.products.map((p: any) => ({ sku: p.sku, desc: `${p.desc} ${p.dims || ""}`, cat: p.cat || "" }));
  return pool.filter((p: any) => terms.every((t) => `${p.sku} ${p.desc} ${p.cat}`.toLowerCase().includes(t))).slice(0, limit);
}
