import type { Item } from "../types";
import { footprint } from "./placement";

const OVERLAP_TOL_IN = 0.5;
const VERTICAL_OVERLAP_TOL_IN = 2;

/**
 * Return the set of item ids that overlap one or more siblings in plan,
 * accounting for vertical stacking (a wall cab above a base cab is fine).
 */
export function findOverlappingIds(items: Item[]): Set<string> {
  const bad = new Set<string>();
  const candidates = items.filter(
    (i) =>
      !i.scheduleOnly &&
      i.kind !== "window" &&
      i.kind !== "door" &&
      // panels/fillers are meant to sit flush against cabinets
      i.kind !== "panel" &&
      i.kind !== "filler",
  );
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (verticallyDisjoint(a, b)) continue;
      if (planRectsOverlap(a, b)) {
        bad.add(a.id);
        bad.add(b.id);
      }
    }
  }
  return bad;
}

function verticallyDisjoint(a: Item, b: Item): boolean {
  const aBottom = a.mountZ ?? 0;
  const aTop = aBottom + a.height;
  const bBottom = b.mountZ ?? 0;
  const bTop = bBottom + b.height;
  // Disjoint if separated by more than a tolerance in Z.
  return aTop <= bBottom + VERTICAL_OVERLAP_TOL_IN || bTop <= aBottom + VERTICAL_OVERLAP_TOL_IN;
}

function planRectsOverlap(a: Item, b: Item): boolean {
  const fa = footprint(a);
  const fb = footprint(b);
  const ax2 = a.x + fa.w;
  const ay2 = a.y + fa.d;
  const bx2 = b.x + fb.w;
  const by2 = b.y + fb.d;
  return (
    a.x < bx2 - OVERLAP_TOL_IN &&
    ax2 > b.x + OVERLAP_TOL_IN &&
    a.y < by2 - OVERLAP_TOL_IN &&
    ay2 > b.y + OVERLAP_TOL_IN
  );
}
