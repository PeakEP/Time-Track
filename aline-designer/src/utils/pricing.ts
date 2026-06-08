import type { BoxMaterial, Catalog, Finish, Item, Product, ProjectSettings, TierKey } from "../types";

export type LineCost = {
  item: Item;
  product: Product | null;
  unitListPrice: number | null;
  qty: number;
  lineList: number;
  available: boolean;
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

export function computeLines(
  items: Item[],
  catalog: Catalog,
  finishCode: string,
  boxMaterial: BoxMaterial,
): LineCost[] {
  const tier = getTierForFinish(catalog, finishCode);
  return items
    .filter((i) => i.kind !== "window" && i.kind !== "door" && i.kind !== "appliance")
    .map((item) => {
      const product = findProduct(catalog, item.sku);
      const unit = unitListPrice(product, tier, boxMaterial);
      const qty = item.qty ?? 1;
      const available = unit !== null;
      return {
        item,
        product,
        unitListPrice: unit,
        qty,
        lineList: (unit ?? 0) * qty,
        available,
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
