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
};

export type PricingTotals = {
  upgrades: number;
  subtotal: number; // basePrice + upgrades
  discount: number; // dollar amount of the discount
  total: number;
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

// Effective unit price: included items are 0; upgrades use the designer override
// when present, otherwise the catalog price.
export function unitPrice(option: FinishOption, overrides: Record<string, number>): number {
  if (option.pricing === "included") return 0;
  return overrides[option.id] ?? option.price;
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
    const ids = project.selections[category.id] ?? [];
    for (const id of ids) {
      const option = category.options.find((o) => o.id === id);
      if (!option) continue;
      const unit = resolveUnit(category, option);
      const price = unitPrice(option, project.overrides);
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
  const subtotal = project.basePrice + upgrades;
  const { discount } = project;
  const amount =
    discount.type === "percent"
      ? Math.round(subtotal * (discount.value / 100))
      : Math.min(subtotal, discount.value || 0);
  const total = Math.max(0, subtotal - amount);
  return { upgrades, subtotal, discount: amount, total };
}
