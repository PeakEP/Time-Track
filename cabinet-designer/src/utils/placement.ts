import type { Item, ItemKind, Product } from "../types";

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

// These have no real footprint, so they only ever appear in the schedule.
const SCHEDULE_ONLY_CATEGORIES = new Set(["Accessories", "Hardware", "Glass"]);

const PANEL_THICKNESS = 0.75;

export function isWallMounted(product: Product): boolean {
  return WALL_CATEGORIES.has(product.cat);
}

export function isPanelOrFiller(product: Product): boolean {
  return product.cat === "Panels" || product.cat === "Fillers";
}

export function isScheduleOnly(product: Product): boolean {
  if (SCHEDULE_ONLY_CATEGORIES.has(product.cat)) return true;
  // Panels and fillers are placeable even though their catalog depth is null.
  if (isPanelOrFiller(product)) return false;
  return product.width_in == null || product.depth_in == null;
}

export function placedKind(product: Product): ItemKind {
  if (product.cat === "Panels") return "panel";
  if (product.cat === "Fillers") return "filler";
  return "cabinet";
}

export function placedDepth(product: Product): number {
  if (isPanelOrFiller(product)) return PANEL_THICKNESS;
  return product.depth_in ?? 24;
}

export function defaultMountZ(product: Product, wallCabinetAFF: number): number {
  if (isWallMounted(product)) return wallCabinetAFF;
  // Wall end panels / wall fillers ride up with the uppers.
  if (isPanelOrFiller(product) && /^wall/i.test(product.desc)) return wallCabinetAFF;
  return 0;
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

// A square corner cabinet (easy-reach / lazy-susan) is drawn as an L of two
// 24"-deep legs rather than a solid square.
export function isCornerCabinet(product: Product | null): boolean {
  return (
    !!product &&
    product.cat === "Corner" &&
    product.width_in != null &&
    product.depth_in != null &&
    product.width_in === product.depth_in
  );
}

export function isLazySusan(product: Product | null): boolean {
  return !!product && (/^BLS/i.test(product.sku) || /lazy susan/i.test(product.desc));
}

export function isWallDiagonal(product: Product | null): boolean {
  return !!product && product.cat === "Wall Diagonal";
}

/** Right-triangle footprint for a diagonal corner cabinet; door is the hypotenuse. */
export function diagonalPoints(legRun: number, rotation: number): [number, number][] {
  const base: [number, number][] = [
    [0, 0],
    [legRun, 0],
    [0, legRun],
  ];
  const c = legRun / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return base.map(([x, y]) => {
    const dx = x - c;
    const dy = y - c;
    return [c + dx * cos - dy * sin, c + dx * sin + dy * cos];
  });
}

const CORNER_LEG_DEPTH = 24;

/** L-shaped footprint points (local 0..size coords), notch rotated per item rotation. */
export function cornerLPoints(size: number, rotation: number): [number, number][] {
  const S = size;
  const L = Math.min(CORNER_LEG_DEPTH, size);
  const base: [number, number][] = [
    [0, 0],
    [S, 0],
    [S, L],
    [L, L],
    [L, S],
    [0, S],
  ];
  const c = S / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return base.map(([x, y]) => {
    const dx = x - c;
    const dy = y - c;
    return [c + dx * cos - dy * sin, c + dx * sin + dy * cos];
  });
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
