import type { CatalogItem, Line, PricedLine, Quote, ReviewItem, Settings, Totals } from "../types";
import { runTakeoff } from "./takeoff";
import { itemLabel } from "./catalog";

const money = (n: number) => Math.round((n + Math.sign(n) * 1e-9) * 100) / 100;
export const isNewBuild = (q: Pick<Quote, "type">) => q.type === "shop" || q.type === "custom-home";

// Generated lines with the rep's per-line edits applied, plus manual lines.
export function buildLines(q: Quote, settings: Settings, items: CatalogItem[]): Line[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const gen = runTakeoff({ type: q.type, answers: q.answers, settings, items, byId });
  const out: Line[] = [];
  for (const l of gen) {
    const o = q.overrides[l.id];
    if (o?.removed) continue;
    const line = { ...l, flags: [...l.flags] };
    if (o?.catalogItemId) {
      const it = byId.get(o.catalogItemId);
      if (it) {
        line.catalogItemId = it.id;
        line.description = `${line.description.split(" — ")[0]} — ${itemLabel(it)}`;
        line.unit = it.unit;
        line.unitCost = it.unitCost;
        line.source = it.unitCost == null ? "unpriced" : it.source === "square" ? "square" : "catalog";
        line.flags = line.flags.filter((f) => f !== "auto-matched" && f !== "no catalog match" && f !== "catalog item has no cost");
        if (it.unitCost == null) line.flags.push("catalog item has no cost");
      }
    }
    if (o?.qty != null) { line.qty = o.qty; line.flags.push("qty edited"); }
    if (o && "unitCost" in o && o.unitCost !== undefined) {
      line.unitCost = o.unitCost;
      line.source = o.unitCost == null ? "unpriced" : "manual";
      line.flags = line.flags.filter((f) => f !== "rate not set" && f !== "catalog item has no cost" && f !== "priced as per drawings" && f !== "no catalog match");
      line.flags.push("price edited");
    }
    out.push(line);
  }
  for (const m of q.manualLines) {
    const it = m.catalogItemId ? byId.get(m.catalogItemId) : undefined;
    out.push({
      id: m.id, section: m.section || "Additional Items", kind: m.kind, description: m.description,
      qty: m.qty, unit: m.unit, unitCost: m.unitCost,
      source: m.unitCost == null ? "unpriced" : it && it.unitCost === m.unitCost ? (it.source === "square" ? "square" : "catalog") : "manual",
      catalogItemId: m.catalogItemId, basis: "added by hand", flags: ["manual line"],
      allowance: m.kind === "allowance",
    });
  }
  return out;
}

function markupFor(l: Line, s: Settings): number {
  const p = s.pricing;
  if (l.kind === "material") return p.materialMarkup ?? 0;
  if (l.kind === "labour") return p.labourMarkup ?? 0;
  // Sub-trades and allowances carry the sub markup (supplier quotes too).
  return p.subMarkup ?? 0;
}

export function priceLines(q: Quote, lines: Line[], s: Settings): { lines: PricedLine[]; totals: Totals } {
  const priced = lines.map((l) => {
    const extCost = l.unitCost == null ? 0 : money(l.qty * l.unitCost);
    const markup = markupFor(l, s);
    return { ...l, extCost, markup, sell: money(extCost * (1 + markup)) };
  });
  const sum = (f: (l: PricedLine) => boolean, k: "extCost" | "sell") => money(priced.filter(f).reduce((a, l) => a + l[k], 0));
  const material = sum((l) => l.kind === "material", "extCost");
  const labour = sum((l) => l.kind === "labour", "extCost");
  const sub = sum((l) => l.kind === "sub", "extCost");
  const allowance = sum((l) => l.kind === "allowance", "extCost");
  const cost = money(material + labour + sub + allowance);
  const sellBeforeFees = sum(() => true, "sell");
  // Custom-home standard: 15% project management fee on the full subtotal
  // (fixed scope + allowances). Renovations carry markup only.
  const pmFee = isNewBuild(q) ? money(sellBeforeFees * s.pricing.pmFeeNewBuild) : 0;
  const contingency = money((sellBeforeFees + pmFee) * (s.pricing.contingency || 0));
  const subtotal = money(sellBeforeFees + pmFee + contingency);
  const hst = money(subtotal * s.pricing.hst);
  const total = money(subtotal + hst);
  const margin = subtotal > 0 ? (subtotal - cost) / subtotal : 0;
  return { lines: priced, totals: { material, labour, sub, allowance, cost, sellBeforeFees, pmFee, contingency, subtotal, hst, total, margin } };
}

// What stops this quote going out without the owner. "block" items must be
// fixed (or approved by the owner); "warn" items are worth a look.
export function review(q: Quote, priced: PricedLine[], totals: Totals, s: Settings): ReviewItem[] {
  const out: ReviewItem[] = [];
  const p = s.pricing;
  if (p.materialMarkup == null || p.labourMarkup == null || p.subMarkup == null)
    out.push({ level: "block", message: "Markups aren't set yet — the owner sets them in Settings → Pricing." });
  for (const l of priced) {
    if (l.unitCost == null) {
      const why = l.flags.includes("rate not set") ? "owner rate not set"
        : l.flags.includes("priced as per drawings") ? "priced as per drawings — enter the cabinet/vanity quote"
        : l.flags.includes("no catalog match") ? "no catalog item found" : "no price";
      out.push({ level: "block", message: `${l.description}: ${why}.`, lineId: l.id });
    }
    if (l.source === "manual") out.push({ level: "block", message: `${l.description}: price typed by hand ($${l.unitCost?.toFixed(2)}/${l.unit}).`, lineId: l.id });
  }
  // One note per takeoff tool, not per line.
  const coverage = [...new Set(priced.filter((l) => l.flags.includes("verify coverage")).map((l) => s.components.find((c) => c.key === l.toolKey)?.label || l.description))];
  if (coverage.length) out.push({ level: "warn", message: `Coverage per unit isn't confirmed for: ${coverage.join(", ")} — the owner confirms these once in Settings → Takeoff tools.` });
  const auto = priced.filter((l) => l.flags.includes("auto-matched")).length;
  if (auto) out.push({ level: "info", message: `${auto} line(s) use a catalog item picked automatically — choose the exact product on the Products step, or the owner pins defaults in Settings.` });
  const removed = Object.values(q.overrides).filter((o) => o.removed).length;
  if (removed) out.push({ level: "warn", message: `${removed} generated line(s) removed by hand.` });
  if (p.minMargin != null && totals.subtotal > 0 && totals.margin < p.minMargin)
    out.push({ level: "block", message: `Margin ${(totals.margin * 100).toFixed(1)}% is below the ${(p.minMargin * 100).toFixed(1)}% minimum.` });
  if (p.autoApproveLimit != null && totals.subtotal > p.autoApproveLimit)
    out.push({ level: "block", message: `Over $${p.autoApproveLimit.toLocaleString("en-CA")} — quotes this size need the owner's approval.` });
  const pending = q.ai.suggestions.filter((x) => x.status === "pending").length;
  if (pending) out.push({ level: "warn", message: `${pending} suggestion(s) read from the documents haven't been accepted or rejected.` });
  if (isNewBuild(q) && !s.terms?.paymentScheduleNewBuild?.trim())
    out.push({ level: "warn", message: "No payment schedule in Settings → Terms; the proposal will say draws are agreed in writing." });
  if (!q.answers.clientName) out.push({ level: "warn", message: "Client name is missing." });
  if (!q.answers.siteAddress) out.push({ level: "warn", message: "Site address is missing." });
  if (!priced.length) out.push({ level: "block", message: "Nothing to price yet — answer the project questions first." });
  return out;
}

export const needsApproval = (items: ReviewItem[]) => items.some((i) => i.level === "block");

export function computeQuote(q: Quote, s: Settings, items: CatalogItem[]) {
  const lines = buildLines(q, s, items);
  const { lines: priced, totals } = priceLines(q, lines, s);
  const issues = review(q, priced, totals, s);
  return { lines: priced, totals, issues, blocked: needsApproval(issues) };
}

// An approval holds while the quote's total is unchanged (to the cent).
export function approvalValid(q: Quote, total: number) {
  return !!q.approval && Math.abs(q.approval.totalAtApproval - total) < 0.005;
}
