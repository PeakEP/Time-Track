import type { BoxMaterial, Catalog, Finish, Item, Product, ProjectSettings, TierKey } from "../types";
import { isWallMounted } from "./placement";

/**
 * Resolve which finish code applies to a given item — used everywhere a
 * cabinet's colour / price tier needs to be known. Honours, in order:
 *   1. item-level override (set in the Inspector for two-tone accents),
 *   2. project-level upper finish (for the classic base-vs-upper two-tone),
 *   3. project-level primary finish.
 *
 * For items without an SKU (free appliances, openings) just returns the
 * primary — they're not priced from the catalog anyway.
 */
export function effectiveFinishCode(
  item: Item,
  catalog: Catalog | null,
  settings: { finishCode: string; upperFinishCode?: string },
): string {
  if (item.finishCode) return item.finishCode;
  if (settings.upperFinishCode && catalog) {
    const product = item.sku ? findProduct(catalog, item.sku) : null;
    if (product && isWallMounted(product)) return settings.upperFinishCode;
  }
  return settings.finishCode;
}

export type LineCost = {
  item: Item;
  product: Product | null;
  unitListPrice: number | null;
  qty: number;
  lineList: number;
  available: boolean;
  // Finish actually used for this line — honours per-item override and the
  // project's upper finish. CSV/PDF exports show this rather than the project
  // default so two-tone designs read correctly.
  finishCode: string;
  // Box material actually priced. Usually settings.boxMaterial, but for SKUs
  // the catalog only sells in one box (e.g. OPPEIN 2DB drawer bases are
  // PLY-only) this falls back to the available box so the line still has a
  // price instead of showing NA.
  boxMaterial: BoxMaterial;
  // True when the box above is a forced fallback (caller can flag the line).
  boxFallback: boolean;
};

export type PricingTotals = {
  subtotalList: number;
  dealerDiscount: number;
  jmrcCost: number;
  markup: number;
  clientSubtotal: number;
  hstRate: number;
  hst: number;
  clientTotal: number;
  achievedMarginPct: number; // (price - cost) / price
  achievedDiscountPct: number; // off MSRP/list
};

export function findFinish(catalog: Catalog, code: string): Finish | undefined {
  return catalog.finishes.find((f) => f.code === code);
}

export function getTierForFinish(catalog: Catalog, code: string): TierKey {
  // Fall back to the first tier in the catalog if the chosen finish isn't found —
  // catalog-agnostic so this works whether tiers are OPPEIN's or Aline's door styles.
  return findFinish(catalog, code)?.tier ?? Object.keys(catalog.tiers)[0] ?? "";
}

export function findProduct(catalog: Catalog, sku: string | undefined): Product | null {
  if (!sku) return null;
  return catalog.products.find((p) => p.sku === sku) ?? null;
}

export function unitListPrice(
  product: Product | null,
  tier: TierKey,
  boxMaterial: BoxMaterial,
): number | null {
  if (!product) return null;
  if (product.flat) return product.flat[tier] ?? null;
  if (boxMaterial === "PLY") return product.ply?.[tier] ?? null;
  return product.pb?.[tier] ?? null;
}

/**
 * Like unitListPrice but, when the requested box has no price for this tier
 * (catalog convention: "null tier/box = not offered in that combo"), tries
 * the other box and reports the swap. Used by computeLines so PLY-only SKUs
 * like OPPEIN 2DBxx drawer bases still price when the project default box is
 * PB — otherwise the schedule shows N/A for items the catalog actually sells.
 */
function unitListPriceWithFallback(
  product: Product | null,
  tier: TierKey,
  requestedBox: BoxMaterial,
): { unit: number | null; usedBox: BoxMaterial; fallback: boolean } {
  const first = unitListPrice(product, tier, requestedBox);
  if (first != null) return { unit: first, usedBox: requestedBox, fallback: false };
  const other: BoxMaterial = requestedBox === "PLY" ? "PB" : "PLY";
  const second = unitListPrice(product, tier, other);
  if (second != null) return { unit: second, usedBox: other, fallback: true };
  return { unit: null, usedBox: requestedBox, fallback: false };
}

export function computeLines(
  items: Item[],
  catalog: Catalog,
  settings: { finishCode: string; upperFinishCode?: string; boxMaterial: BoxMaterial },
): LineCost[] {
  return items
    .filter((i) => i.kind !== "window" && i.kind !== "door" && i.kind !== "appliance")
    .map((item) => {
      const product = findProduct(catalog, item.sku);
      // Per-item tier so two-tone designs (item override or per-mount-class
      // upper finish) price each cabinet against its OWN finish, not just the
      // project default.
      const finishForItem = effectiveFinishCode(item, catalog, settings);
      const tier = getTierForFinish(catalog, finishForItem);
      const { unit, usedBox, fallback } = unitListPriceWithFallback(
        product,
        tier,
        settings.boxMaterial,
      );
      const qty = item.qty ?? 1;
      const available = unit !== null;
      return {
        item,
        product,
        unitListPrice: unit,
        qty,
        lineList: (unit ?? 0) * qty,
        available,
        finishCode: finishForItem,
        boxMaterial: usedBox,
        boxFallback: fallback,
      };
    });
}

export function computeTotals(lines: LineCost[], catalog: Catalog, settings: ProjectSettings): PricingTotals {
  const { markup, hstRate, pricingMode, discountPct, marginPct } = settings;
  const subtotalList = lines.reduce((s, l) => s + (l.available ? l.lineList : 0), 0);
  const dealerDiscount = subtotalList * catalog._meta.dealer_discount;
  const jmrcCost = subtotalList - dealerDiscount;

  let clientSubtotal: number;
  if (pricingMode === "discount") {
    // sell at a discount off MSRP (list)
    clientSubtotal = subtotalList * (1 - (discountPct ?? 0) / 100);
  } else if (pricingMode === "margin") {
    // price to hit a target gross margin on cost
    const m = Math.min(Math.max(marginPct ?? 0, 0), 99) / 100;
    clientSubtotal = jmrcCost / (1 - m);
  } else {
    clientSubtotal = jmrcCost * markup;
  }

  const hst = clientSubtotal * hstRate;
  const clientTotal = clientSubtotal + hst;
  const achievedMarginPct = clientSubtotal > 0 ? ((clientSubtotal - jmrcCost) / clientSubtotal) * 100 : 0;
  const achievedDiscountPct = subtotalList > 0 ? ((subtotalList - clientSubtotal) / subtotalList) * 100 : 0;
  return {
    subtotalList,
    dealerDiscount,
    jmrcCost,
    markup,
    clientSubtotal,
    hstRate,
    hst,
    clientTotal,
    achievedMarginPct,
    achievedDiscountPct,
  };
}

export function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}
