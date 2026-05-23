import type { Item, Product } from "../types";

const WALL_CATEGORIES = new Set([
  "Wall 30",
  "Wall 36",
  "Wall 42",
  "Wall Short",
  "Wall Fridge",
  "Wall Corner",
  "Wall Diagonal",
  "Wall Lift",
  "Open",
]);

const SCHEDULE_ONLY_CATEGORIES = new Set([
  "Panels",
  "Fillers",
  "Accessories",
  "Hardware",
  "Glass",
]);

export function isWallMounted(product: Product): boolean {
  return WALL_CATEGORIES.has(product.cat);
}

export function isScheduleOnly(product: Product): boolean {
  if (SCHEDULE_ONLY_CATEGORIES.has(product.cat)) return true;
  // Also schedule-only when dimensions are missing
  return product.width_in == null || product.depth_in == null;
}

export function defaultMountZ(product: Product, wallCabinetAFF: number): number {
  return isWallMounted(product) ? wallCabinetAFF : 0;
}

export function makeItemFromProduct(
  product: Product,
  position: { x: number; y: number },
  wallCabinetAFF: number,
): Item {
  return {
    id: makeId(),
    kind: "cabinet",
    sku: product.sku,
    x: position.x,
    y: position.y,
    rotation: 0,
    width: product.width_in ?? 24,
    depth: product.depth_in ?? 24,
    height: product.height_in ?? 34.5,
    mountZ: defaultMountZ(product, wallCabinetAFF),
  };
}

export function makeScheduleItem(product: Product): Item {
  return {
    id: makeId(),
    kind: product.cat === "Panels" ? "panel" : product.cat === "Fillers" ? "filler" : "accessory",
    sku: product.sku,
    x: 0,
    y: 0,
    rotation: 0,
    width: product.width_in ?? 0,
    depth: product.depth_in ?? 0,
    height: product.height_in ?? 0,
    qty: 1,
    scheduleOnly: true,
  };
}

let counter = 0;
export function makeId(): string {
  counter += 1;
  return `i_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// item footprint accounting for rotation
export function footprint(item: Item): { w: number; d: number } {
  if (item.rotation === 90 || item.rotation === 270) {
    return { w: item.depth, d: item.width };
  }
  return { w: item.width, d: item.depth };
}

function fmtIn(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

// Fillers and panels get cut to fit on site, so show their current item
// dimensions rather than the fixed catalog string.
export function itemDimsLabel(item: Item, product: Product | null): string {
  if ((item.kind === "filler" || item.kind === "panel") && item.width) {
    const parts = [`${fmtIn(item.width)}"W`];
    if (item.height) parts.push(`${fmtIn(item.height)}"H`);
    return parts.join(" × ");
  }
  return product?.dims ?? "";
}
