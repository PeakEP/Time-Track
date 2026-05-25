import type { Item, Point } from "../types";
import { edges } from "./roomPresets";
import { footprint } from "./placement";

export type WallGeom = {
  index: number;
  a: Point;
  b: Point;
  len: number;
  tx: number; // along-wall unit vector
  ty: number;
  nx: number; // interior (into-room) unit normal
  ny: number;
};

export type ElevBox = {
  item: Item;
  alongMin: number;
  alongMax: number;
  bottom: number;
  top: number;
};

const MAX_WALL_DIST_IN = 42; // a cabinet centre within this of a wall belongs to it

function centroid(points: Point[]): Point {
  const s = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / points.length, y: s.y / points.length };
}

export function wallGeoms(points: Point[]): WallGeom[] {
  const c = centroid(points);
  return edges(points).map((e) => {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    let nx = -ty;
    let ny = tx;
    // make the normal point into the room
    if ((c.x - e.a.x) * nx + (c.y - e.a.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { index: e.index, a: e.a, b: e.b, len, tx, ty, nx, ny };
  });
}

/**
 * Assign every placed item to the single wall its back sits against (the
 * nearest wall, on the interior side, within reach). This avoids the old
 * heuristic that double-counted corner cabinets and left walls looking empty.
 */
export function assignItemsToWalls(items: Item[], points: Point[]): Map<number, ElevBox[]> {
  const walls = wallGeoms(points);
  const map = new Map<number, ElevBox[]>();
  for (const it of items) {
    if (it.scheduleOnly) continue;
    const fp = footprint(it);
    const cx = it.x + fp.w / 2;
    const cy = it.y + fp.d / 2;
    let best: WallGeom | null = null;
    let bestPerp = Infinity;
    for (const w of walls) {
      const rx = cx - w.a.x;
      const ry = cy - w.a.y;
      const along = rx * w.tx + ry * w.ty;
      const perp = rx * w.nx + ry * w.ny;
      if (along < -6 || along > w.len + 6) continue; // not within this wall's run
      if (perp < -3) continue; // behind the wall (outside the room)
      if (perp < bestPerp) {
        bestPerp = perp;
        best = w;
      }
    }
    if (!best || bestPerp > MAX_WALL_DIST_IN) continue; // free-standing / island
    const corners: [number, number][] = [
      [it.x, it.y],
      [it.x + fp.w, it.y],
      [it.x + fp.w, it.y + fp.d],
      [it.x, it.y + fp.d],
    ];
    let alongMin = Infinity;
    let alongMax = -Infinity;
    for (const [px, py] of corners) {
      const a = (px - best.a.x) * best.tx + (py - best.a.y) * best.ty;
      alongMin = Math.min(alongMin, a);
      alongMax = Math.max(alongMax, a);
    }
    const bottom = it.mountZ ?? 0;
    const arr = map.get(best.index) ?? [];
    arr.push({ item: it, alongMin, alongMax, bottom, top: bottom + it.height });
    map.set(best.index, arr);
  }
  for (const arr of map.values()) arr.sort((p, q) => p.bottom - q.bottom || p.alongMin - q.alongMin);
  return map;
}
