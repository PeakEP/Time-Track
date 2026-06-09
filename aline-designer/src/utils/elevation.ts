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

// An item is considered "against" a wall (and shows on that wall's elevation) when
// the minimum perpendicular distance from any of its 4 footprint corners to the
// wall line is within this tolerance. 8" gives some slack so an item placed slightly
// off the wall by mouse imprecision still shows up.
const FLUSH_TOL_IN = 8;

/**
 * Assign every placed item to the wall(s) it sits against.
 * - Single-wall items (a B36 along the top wall): mapped to that one wall.
 * - Corner cabinets sitting at the intersection of two walls (e.g. ERB36 with
 *   one 36" leg on the top wall and another on the left wall): mapped to BOTH
 *   walls so the elevation view shows them on each. Detected when 2+ walls have
 *   a corner of the item within FLUSH_TOL_IN.
 * - Free-standing / island items beyond MAX_WALL_DIST_IN of any wall: skipped.
 */
export function assignItemsToWalls(items: Item[], points: Point[]): Map<number, ElevBox[]> {
  const walls = wallGeoms(points);
  const map = new Map<number, ElevBox[]>();
  for (const it of items) {
    if (it.scheduleOnly) continue;
    const fp = footprint(it);
    const corners: [number, number][] = [
      [it.x, it.y],
      [it.x + fp.w, it.y],
      [it.x + fp.w, it.y + fp.d],
      [it.x, it.y + fp.d],
    ];
    // For every wall, find the minimum perpendicular distance from any item
    // corner to the wall line (only counting corners within the wall's along-run
    // and on the interior side).
    const perpByWall = new Map<number, number>();
    for (const w of walls) {
      let minPerp = Infinity;
      for (const [px, py] of corners) {
        const rx = px - w.a.x;
        const ry = py - w.a.y;
        const along = rx * w.tx + ry * w.ty;
        const perp = rx * w.nx + ry * w.ny;
        if (along < -6 || along > w.len + 6) continue;
        if (perp < -3) continue;
        if (perp < minPerp) minPerp = perp;
      }
      if (Number.isFinite(minPerp)) perpByWall.set(w.index, minPerp);
    }
    // Walls the item is flush against (any corner within tolerance).
    const flushWalls = walls.filter((w) => (perpByWall.get(w.index) ?? Infinity) <= FLUSH_TOL_IN);
    let targets: WallGeom[];
    if (flushWalls.length >= 2) {
      // Sitting in/near a room corner — show on every wall it's flush against.
      // This is the corner-cabinet case (ERB / WER / DCW) the user wants to see
      // running down BOTH walls in the elevation view.
      targets = flushWalls;
    } else {
      // Single nearest wall within reach; nothing flush → fall back to the
      // closest wall up to MAX_WALL_DIST_IN, otherwise skip (island / free).
      let best: WallGeom | null = null;
      let bestPerp = Infinity;
      for (const w of walls) {
        const p = perpByWall.get(w.index);
        if (p === undefined) continue;
        if (p < bestPerp) {
          bestPerp = p;
          best = w;
        }
      }
      if (!best || bestPerp > MAX_WALL_DIST_IN) continue;
      targets = [best];
    }
    const bottom = it.mountZ ?? 0;
    for (const wall of targets) {
      let alongMin = Infinity;
      let alongMax = -Infinity;
      for (const [px, py] of corners) {
        const a = (px - wall.a.x) * wall.tx + (py - wall.a.y) * wall.ty;
        alongMin = Math.min(alongMin, a);
        alongMax = Math.max(alongMax, a);
      }
      // Clamp to the wall's range so off-the-end corners don't draw past the wall.
      alongMin = Math.max(0, alongMin);
      alongMax = Math.min(wall.len, alongMax);
      if (alongMax <= alongMin) continue;
      const arr = map.get(wall.index) ?? [];
      arr.push({ item: it, alongMin, alongMax, bottom, top: bottom + it.height });
      map.set(wall.index, arr);
    }
  }
  for (const arr of map.values()) arr.sort((p, q) => p.bottom - q.bottom || p.alongMin - q.alongMin);
  return map;
}
