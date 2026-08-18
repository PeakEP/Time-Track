// Pricing domain core. Pure functions over the catalog + project, with local
// result types (LineCost / PricingTotals) defined next to the code that
// produces them — same pattern as cabinet-designer's utils/pricing.ts.

import type { Catalog, Category, FinishOption, Project } from "../types";

// One selected upgrade/inclusion, resolved to its effective price.
export type LineCost = {
  category: Category;
  option: FinishOption;
  price: number; // effective upgrade price (0 for included items)
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

// Effective price for an option: included items are always 0; upgrades use the
// designer override when present, otherwise the catalog price.
export function effectivePrice(
  option: FinishOption,
  overrides: Record<string, number>
): number {
  if (option.pricing === "included") return 0;
  const override = overrides[option.id];
  return override ?? option.price;
}

// Resolve every selected optionId back to its catalog option, in catalog order.
export function computeLines(project: Project, catalog: Catalog | null): LineCost[] {
  if (!catalog) return [];
  const lines: LineCost[] = [];
  for (const category of catalog.categories) {
    const ids = project.selections[category.id] ?? [];
    for (const id of ids) {
      const option = category.options.find((o) => o.id === id);
      if (option) {
        lines.push({ category, option, price: effectivePrice(option, project.overrides) });
      }
    }
  }
  return lines;
}

export function computeTotals(lines: LineCost[], project: Project): PricingTotals {
  const upgrades = lines.reduce((sum, l) => sum + l.price, 0);
  const subtotal = project.basePrice + upgrades;
  const { discount } = project;
  const amount =
    discount.type === "percent"
      ? Math.round(subtotal * (discount.value / 100))
      : Math.min(subtotal, discount.value || 0);
  const total = Math.max(0, subtotal - amount);
  return { upgrades, subtotal, discount: amount, total };
}
