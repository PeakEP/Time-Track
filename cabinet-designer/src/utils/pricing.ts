import type { BoxMaterial, Catalog, Finish, Item, Product, TierKey } from "../types";

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
};

export function findFinish(catalog: Catalog, code: string): Finish | undefined {
  return catalog.finishes.find((f) => f.code === code);
}

export function getTierForFinish(catalog: Catalog, code: string): TierKey {
  return findFinish(catalog, code)?.tier ?? "essential";
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
    .filter((i) => i.kind !== "window" && i.kind !== "door")
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

export function computeTotals(
  lines: LineCost[],
  catalog: Catalog,
  markup: number,
  hstRate: number,
): PricingTotals {
  const subtotalList = lines.reduce((s, l) => s + (l.available ? l.lineList : 0), 0);
  const dealerDiscount = subtotalList * catalog._meta.dealer_discount;
  const jmrcCost = subtotalList - dealerDiscount;
  const clientSubtotal = jmrcCost * markup;
  const hst = clientSubtotal * hstRate;
  const clientTotal = clientSubtotal + hst;
  return {
    subtotalList,
    dealerDiscount,
    jmrcCost,
    markup,
    clientSubtotal,
    hstRate,
    hst,
    clientTotal,
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
