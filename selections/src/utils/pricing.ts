// Pricing domain core. Pure functions over the catalog + project, with local
// result types (LineCost / PricingTotals) defined next to the code that
// produces them — same pattern as cabinet-designer's utils/pricing.ts.

import type { Catalog, Category, FinishOption, PriceUnit, Project } from "../types";

// One selected upgrade/inclusion, resolved to unit price, quantity, and total.
export type LineCost = {
  category: Category;
  option: FinishOption;
  unit: PriceUnit;
  unitPrice: number; // effective per-unit price (0 for included items)
  quantity: number; // sq ft for "sqft" units, count for "each"
  lineTotal: number; // unitPrice * quantity
  slotLabel?: string; // room/slot this line belongs to (e.g. "Ensuite")
};

// Selection-map key for one slot of a slotted category. Non-slotted categories
// key their selections by the plain category id.
export function slotKey(categoryId: string, slotId: string): string {
  return `${categoryId}::${slotId}`;
}

// New Brunswick HST. The base package price already includes HST; HST is applied
// only to the (discounted) upgrade finishes.
export const HST_RATE = 0.15;

export type PricingTotals = {
  upgrades: number; // sum of upgrade line totals (pre-tax)
  discount: number; // dollar amount of the discount (applied to upgrades)
  hst: number; // HST on the net upgrades
  total: number; // basePrice + net upgrades + HST
};

// CAD money formatter, NaN-guarded (JMRC operates in New Brunswick).
export function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

// CAD with cents — used for unit prices like $2.29/sf.
export function formatUnitPrice(n: number, unit: PriceUnit): string {
  const money = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number.isFinite(n) ? n : 0);
  return unit === "sqft" ? `${money}/sf` : money;
}

// An option's pricing unit: its own override, else the category default, else "each".
export function resolveUnit(category: Category, option: FinishOption): PriceUnit {
  return option.unit ?? category.unit ?? "each";
}

// Fixed unit price from the catalog: included items are 0; upgrades use the
// catalog price (prices are not editable in the app).
export function unitPrice(option: FinishOption): number {
  return option.pricing === "included" ? 0 : option.price;
}

// Default quantity when none has been entered: 1 for counted items, 0 for
// area-based items (so the designer must enter the takeoff before it counts).
export function defaultQuantity(unit: PriceUnit): number {
  return unit === "sqft" ? 0 : 1;
}

// Resolve every selected optionId back to a priced line, in catalog order.
export function computeLines(project: Project, catalog: Catalog | null): LineCost[] {
  if (!catalog) return [];
  const lines: LineCost[] = [];
  for (const category of catalog.categories) {
    // Slotted categories: one single-select per named slot (each room picks its
    // own finish). Each filled slot is its own line, always quantity 1.
    if (category.slots?.length) {
      for (const slot of category.slots) {
        const ids = project.selections[slotKey(category.id, slot.id)] ?? [];
        const id = ids[0];
        if (!id) continue;
        const option = category.options.find((o) => o.id === id);
        if (!option) continue;
        const price = unitPrice(option);
        lines.push({
          category,
          option,
          unit: "each",
          unitPrice: price,
          quantity: 1,
          lineTotal: price,
          slotLabel: slot.label,
        });
      }
      continue;
    }

    const ids = project.selections[category.id] ?? [];
    for (const id of ids) {
      const option = category.options.find((o) => o.id === id);
      if (!option) continue;
      const unit = resolveUnit(category, option);
      const price = unitPrice(option);
      const quantity = project.quantities[id] ?? defaultQuantity(unit);
      lines.push({
        category,
        option,
        unit,
        unitPrice: price,
        quantity,
        lineTotal: Math.round(price * quantity * 100) / 100,
      });
    }
  }
  return lines;
}

export function computeTotals(lines: LineCost[], project: Project): PricingTotals {
  const upgrades = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const { discount } = project;
  // Discount applies to the upgrade finishes (the base package is a fixed,
  // tax-inclusive contract price).
  const amount =
    discount.type === "percent"
      ? Math.round(upgrades * (discount.value / 100))
      : Math.min(upgrades, discount.value || 0);
  const netUpgrades = Math.max(0, upgrades - amount);
  const hst = Math.round(netUpgrades * HST_RATE);
  const total = project.basePrice + netUpgrades + hst;
  return { upgrades, discount: amount, hst, total };
}
