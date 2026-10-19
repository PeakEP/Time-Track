import type { CatalogItem, Line, MarginKey, PricedLine, Question, Quote, ReviewItem, Settings, Totals } from "../types";
import { MARGIN_LABEL } from "../types";
import { runTakeoff } from "./takeoff";
import { itemLabel } from "./catalog";
import { suggestSkus, type CabinetData } from "./cabinets";

const money = (n: number) => Math.round((n + Math.sign(n) * 1e-9) * 100) / 100;
export const isNewBuild = (q: Pick<Quote, "type">) => q.type === "shop" || q.type === "custom-home";

// Generated lines with the rep's per-line edits applied, plus manual lines.
export function buildLines(q: Quote, settings: Settings, items: CatalogItem[], cabinetData: CabinetData = {}): Line[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const gen = runTakeoff({
    type: q.type, answers: q.answers, settings, items, byId,
    cabinetSets: q.cabinetSets || [], cabinetData, quoteRates: q.rates || {},
  });
  const out: Line[] = [];
  for (const l of gen) {
    const o = q.overrides[l.id];
    if (o?.removed) continue;
    const line = { ...l, flags: [...l.flags] };
    if (o?.catalogItemId) {
      const it = byId.get(o.catalogItemId);
      if (it) {
        line.catalogItemId = it.id;
        line.costCode = it.costCode;
        line.description = `${line.description.split(" — ")[0]} — ${itemLabel(it)}`;
        line.unit = it.unit;
        line.unitCost = it.unitCost;
        line.source = it.unitCost == null ? "unpriced" : it.source === "square" ? "square" : "catalog";
        line.flags = line.flags.filter((f) => !["auto-matched", "no catalog match", "catalog item has no cost", "priced as per drawings"].includes(f));
        if (it.unitCost == null) line.flags.push("catalog item has no cost");
      }
    }
    if (o?.qty != null) { line.qty = o.qty; line.flags.push("qty edited"); }
    if (o && "unitCost" in o && o.unitCost !== undefined) {
      line.unitCost = o.unitCost;
      line.source = o.unitCost == null ? "unpriced" : "manual";
      line.flags = line.flags.filter((f) => !["rate not set", "catalog item has no cost", "priced as per drawings", "no catalog match", "cabinet SKU not found", "cabinet catalog not loaded"].includes(f));
      if (o.unitCost != null) line.flags.push("price entered on this quote");
    }
    out.push(line);
  }
  for (const m of q.manualLines) {
    const it = m.catalogItemId ? byId.get(m.catalogItemId) : undefined;
    out.push({
      id: m.id, section: m.section || "Additional Items", kind: m.kind, description: m.description,
      qty: m.qty, unit: m.unit, unitCost: m.unitCost,
      source: m.unitCost == null ? "unpriced" : it && it.unitCost === m.unitCost ? (it.source === "square" ? "square" : "catalog") : "manual",
      catalogItemId: m.catalogItemId, costCode: it?.costCode, basis: "added by hand", flags: ["manual line"],
      allowance: m.kind === "allowance",
    });
  }
  return out;
}

/* ------------------------------ margins ------------------------------ */

// Finish products (what the client picks at Robins Interiors) vs. building
// materials, by catalog cost code.
const FINISH_CODES = ["10", "11", "17", "18", "2201", "2203", "2204", "2301", "2302", "1502", "1903"];
const CABINET_CODES = ["19", "20"];

export const code4 = (costCode?: string) => (costCode || "").match(/^\d{4}/)?.[0] || "";

export function marginKeyOf(l: Pick<Line, "kind" | "costCode" | "marginKey">): MarginKey {
  if (l.marginKey) return l.marginKey;
  if (l.kind === "labour") return "labour";
  if (l.kind === "sub") return "sub";
  if (l.kind === "allowance") return "allowance";
  const c = code4(l.costCode);
  if (CABINET_CODES.some((p) => c.startsWith(p))) return "cabinets";
  if (FINISH_CODES.some((p) => c.startsWith(p))) return "finish";
  return "material";
}

const clampMargin = (m: number) => Math.min(0.95, Math.max(-1, m));

export function priceLines(q: Quote, lines: Line[], s: Settings, items?: Map<string, CatalogItem>): { lines: PricedLine[]; totals: Totals } {
  const p = s.pricing;
  const priced: PricedLine[] = lines.map((l) => {
    const extCost = l.unitCost == null ? 0 : money(l.qty * l.unitCost);
    const key = marginKeyOf(l);
    const over = q.overrides[l.id]?.margin;
    const quoteM = q.margins?.[key];
    const codeM = l.kind === "material" ? p.codeMargins?.[code4(l.costCode)] : undefined;
    const it = l.catalogItemId ? items?.get(l.catalogItemId) : undefined;
    let margin = 0;
    let marginFrom: PricedLine["marginFrom"] = "none";
    if (over != null) { margin = over; marginFrom = "line"; }
    else if (quoteM != null) { margin = quoteM; marginFrom = "quote"; }
    else if (p.useStoreRetail && it?.retail && l.unitCost && it.retail > l.unitCost && l.source !== "manual") {
      return { ...l, marginKey: key, extCost, margin: 1 - l.unitCost / it.retail, marginFrom: "retail", sell: money(l.qty * it.retail) };
    }
    else if (codeM != null) { margin = codeM; marginFrom = "code"; }
    else if (p.margins[key] != null) { margin = p.margins[key]!; marginFrom = "category"; }
    margin = clampMargin(margin);
    return { ...l, marginKey: key, extCost, margin, marginFrom, sell: money(extCost / (1 - margin)) };
  });
  const sum = (f: (l: PricedLine) => boolean, k: "extCost" | "sell") => money(priced.filter(f).reduce((a, l) => a + l[k], 0));
  const material = sum((l) => l.kind === "material", "extCost");
  const labour = sum((l) => l.kind === "labour", "extCost");
  const sub = sum((l) => l.kind === "sub", "extCost");
  const allowance = sum((l) => l.kind === "allowance", "extCost");
  const cost = money(material + labour + sub + allowance);
  const sellBeforeFees = sum(() => true, "sell");
  // Custom-home standard: 15% project management fee on the full subtotal
  // (fixed scope + allowances). Renovations carry margin only.
  const pmFee = isNewBuild(q) ? money(sellBeforeFees * p.pmFeeNewBuild) : 0;
  const contingency = money((sellBeforeFees + pmFee) * (p.contingency || 0));
  const subtotal = money(sellBeforeFees + pmFee + contingency);
  const hst = money(subtotal * p.hst);
  const total = money(subtotal + hst);
  const margin = subtotal > 0 ? (subtotal - cost) / subtotal : 0;
  return { lines: priced, totals: { material, labour, sub, allowance, cost, sellBeforeFees, pmFee, contingency, subtotal, hst, total, margin } };
}

// Margin by category, for the Review step.
export function marginBreakdown(priced: PricedLine[]) {
  const m = new Map<MarginKey, { cost: number; sell: number }>();
  for (const l of priced) {
    const k = l.marginKey || marginKeyOf(l);
    const v = m.get(k) || { cost: 0, sell: 0 };
    v.cost += l.extCost; v.sell += l.sell;
    m.set(k, v);
  }
  return [...m.entries()].map(([key, v]) => ({ key, label: MARGIN_LABEL[key], cost: money(v.cost), sell: money(v.sell), margin: v.sell > 0 ? (v.sell - v.cost) / v.sell : 0 }));
}

/* ------------------------------ questions ------------------------------ */

const STEP_OF: Record<string, string> = { clientName: "client", siteAddress: "client", length: "building", width: "building" };

// Everything the salesperson still has to answer, in the order to answer it.
export function questions(q: Quote, priced: PricedLine[], s: Settings, cabinetData: CabinetData = {}): Question[] {
  const out: Question[] = [];
  for (const [field, label] of [["clientName", "Client name"], ["siteAddress", "Site address"]] as const)
    if (!q.answers[field]) out.push({ kind: "field", step: STEP_OF[field], field, label: `${label}?` });
  if (isNewBuild(q) && (!q.answers.length || !q.answers.width)) out.push({ kind: "field", step: "building", field: "length", label: "Building length and width?" });
  if (!isNewBuild(q) && !q.answers.rooms.length) out.push({ kind: "field", step: "rooms", field: "rooms", label: "Which rooms are in the job? Add each room and tick what's being done." });

  // Cabinets: rooms with cabinets that aren't priced from a supplier yet.
  const covered = new Set((q.cabinetSets || []).filter((c) => c.lines.length).map((c) => c.roomId));
  if (!(q.answers.cabinetQuote > 0)) {
    if (isNewBuild(q) && q.type === "custom-home" && q.answers.kitchenCabinetLF > 0 && !covered.size)
      out.push({ kind: "cabinets", roomId: "", label: "Which cabinets? Price the kitchen and vanities from Aline, Oppein or Divine (Cabinets step), or enter the cabinet quote." });
    for (const r of q.answers.rooms) {
      const needs = r.cabinetLF > 0 || (r.vanity && !q.answers.vanityItemId);
      if (needs && !covered.has(r.id) && !covered.has(""))
        out.push({ kind: "cabinets", roomId: r.id, label: `Which ${r.cabinetLF > 0 ? "cabinets" : "vanity"} for the ${r.name}? Price them on the Cabinets step.` });
    }
  }

  // Rates not set (grouped), prices missing.
  const rates = new Map<string, Question & { kind: "rate" }>();
  for (const l of priced) {
    if (l.unitCost != null) continue;
    if (l.flags.includes("rate not set") && l.toolKey) {
      const r = s.rates.find((x) => x.key === l.toolKey);
      const cur = rates.get(l.toolKey) || { kind: "rate" as const, key: l.toolKey, label: r?.label || l.description, unit: l.unit, lineIds: [] as string[] };
      cur.lineIds.push(l.id);
      rates.set(l.toolKey, cur);
    } else if (l.flags.includes("cabinet SKU not found")) {
      const [, setId, lnId] = l.id.split(":");
      const set = q.cabinetSets.find((c) => c.id === setId);
      const sku = set?.lines.find((x) => x.id === lnId)?.sku || "";
      out.push({ kind: "cabinetSku", setId, lineId: l.id, sku, label: `${set?.name}: ${sku} isn't in the ${set?.supplier} catalog — correct the SKU or enter its price.`, suggestions: set ? suggestSkus(set.supplier, cabinetData[set.supplier], sku) : [] });
    } else {
      const why = l.flags.includes("priced as per drawings") ? "it's priced as per drawings — pick a priced product or enter the supplier's price"
        : l.flags.includes("no catalog match") ? "nothing in the catalog matches — pick the product or enter a price"
        : l.flags.includes("cabinet catalog not loaded") ? "the supplier's cabinet catalog isn't loaded — enter the price"
        : "it has no price — pick a product or enter a price";
      out.push({ kind: "price", lineId: l.id, label: l.description, unit: l.unit, why });
    }
  }
  out.push(...rates.values());

  const used = new Set(priced.filter((l) => l.marginFrom === "none" && l.extCost > 0).map((l) => l.marginKey!));
  for (const k of used) out.push({ kind: "margin", key: k as MarginKey, label: `What margin on ${MARGIN_LABEL[k as MarginKey].toLowerCase()}? (no company margin set yet)` });
  return out;
}

/* ------------------------------ review ------------------------------ */

// "block" items stop the client copy. Ones marked owner: true need the
// owner's approval (company policy); the rest the salesperson resolves.
export function review(q: Quote, priced: PricedLine[], totals: Totals, s: Settings, qs: Question[]): ReviewItem[] {
  const out: ReviewItem[] = [];
  const p = s.pricing;
  const open = qs.filter((x) => x.kind !== "cabinets").length;
  if (open) out.push({ level: "block", message: `${open} question${open > 1 ? "s" : ""} to answer before the quote can go out — see "To finish this quote".` });
  const cab = qs.filter((x) => x.kind === "cabinets").length;
  if (cab) out.push({ level: "warn", message: `${cab} cabinet area${cab > 1 ? "s are" : " is"} on an allowance instead of supplier pricing.` });
  const typed = priced.filter((l) => l.source === "manual" || l.source === "repRate");
  if (typed.length) out.push({ level: "info", message: `${typed.length} line(s) use a price or rate entered on this quote (shown on the cost breakdown).` });
  // One note per takeoff tool, not per line.
  const coverage = [...new Set(priced.filter((l) => l.flags.includes("verify coverage")).map((l) => s.components.find((c) => c.key === l.toolKey)?.label || l.description))];
  if (coverage.length) out.push({ level: "info", message: `Coverage per unit isn't confirmed yet for: ${coverage.join(", ")} (Settings → Takeoff tools).` });
  const auto = priced.filter((l) => l.flags.includes("auto-matched")).length;
  if (auto) out.push({ level: "info", message: `${auto} line(s) use a default catalog product — pick the exact product on the Products step if the client has chosen.` });
  const removed = Object.values(q.overrides).filter((o) => o.removed).length;
  if (removed) out.push({ level: "warn", message: `${removed} generated line(s) removed by hand.` });
  if (p.minMargin != null && totals.subtotal > 0 && totals.margin < p.minMargin)
    out.push({ level: "block", owner: true, message: `Margin ${(totals.margin * 100).toFixed(1)}% is below the ${(p.minMargin * 100).toFixed(1)}% minimum — raise the margins or get the owner's approval.` });
  if (p.autoApproveLimit != null && totals.subtotal > p.autoApproveLimit)
    out.push({ level: "block", owner: true, message: `Over $${p.autoApproveLimit.toLocaleString("en-CA")} — quotes this size need the owner's approval.` });
  const pending = q.ai.suggestions.filter((x) => x.status === "pending").length;
  if (pending) out.push({ level: "warn", message: `${pending} suggestion(s) read from the documents haven't been used or skipped.` });
  if (isNewBuild(q) && !s.terms?.paymentScheduleNewBuild?.trim())
    out.push({ level: "info", message: "No payment schedule in Settings → Terms; the proposal will say draws are agreed in writing." });
  if (!priced.length) out.push({ level: "block", message: "Nothing to price yet — answer the project questions first." });
  return out;
}

export function computeQuote(q: Quote, s: Settings, items: CatalogItem[], cabinetData: CabinetData = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = buildLines(q, s, items, cabinetData);
  const { lines: priced, totals } = priceLines(q, lines, s, byId);
  const qs = questions(q, priced, s, cabinetData);
  const issues = review(q, priced, totals, s, qs);
  const ownerOnly = issues.filter((i) => i.level === "block" && i.owner);
  const repBlocks = issues.filter((i) => i.level === "block" && !i.owner);
  return { lines: priced, totals, issues, questions: qs, blocked: issues.some((i) => i.level === "block"), needsOwner: ownerOnly.length > 0, repBlocks: repBlocks.length };
}

// An approval holds while the quote's total is unchanged (to the cent).
export function approvalValid(q: Quote, total: number) {
  return !!q.approval && Math.abs(q.approval.totalAtApproval - total) < 0.005;
}

// Can the client copy go out? Everything the rep must answer is answered, and
// any owner-policy item is covered by a current approval.
export function canSend(q: Quote, calc: ReturnType<typeof computeQuote>) {
  return calc.repBlocks === 0 && (!calc.needsOwner || approvalValid(q, calc.totals.total));
}
