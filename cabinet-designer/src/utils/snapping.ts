import type { Point, Room, Item, Rotation } from "../types";
import { edges } from "./roomPresets";
import { footprint } from "./placement";

const WALL_SNAP_TOLERANCE_IN = 8;

export type WallSnap = {
  x: number;
  y: number;
  rotation: Rotation;
  edgeIndex: number;
};

/**
 * Given a candidate placement, find the nearest wall edge within tolerance
 * and return adjusted x/y/rotation so the item sits flush against that wall
 * with its back to the wall (depth perpendicular to the wall).
 */
export function snapToNearestWall(
  room: Room,
  candidate: { x: number; y: number; width: number; depth: number },
): WallSnap | null {
  const w = candidate.width;
  const d = candidate.depth;
  const cx = candidate.x + w / 2;
  const cy = candidate.y + d / 2;

  let best: { dist: number; snap: WallSnap } | null = null;

  for (const e of edges(room.points)) {
    const ax = e.a.x;
    const ay = e.a.y;
    const bx = e.b.x;
    const by = e.b.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len;
    const ty = dy / len;
    // outward normal: room is CCW in screen-y-down? Either way, pick the normal
    // that points from the wall into the room interior. We can detect by checking
    // which side the polygon centroid lies on. For our presets the items live
    // on the side of the line where the polygon area sits.
    const nx = -ty;
    const ny = tx;

    // signed distance from (cx,cy) to the wall line
    const perp = (cx - ax) * nx + (cy - ay) * ny;
    const absPerp = Math.abs(perp);
    // The cabinet "back" should sit flush; back is depth/2 from center.
    const distFromFlush = Math.abs(absPerp - d / 2);
    if (distFromFlush > WALL_SNAP_TOLERANCE_IN) continue;

    // Project candidate center along the wall
    const along = (cx - ax) * tx + (cy - ay) * ty;
    const clampedAlong = Math.max(w / 2, Math.min(len - w / 2, along));
    // Determine which side of the wall is the interior — use the polygon centroid
    const centroid = polygonCentroid(room.points);
    const centroidPerp = (centroid.x - ax) * nx + (centroid.y - ay) * ny;
    const interiorSign = Math.sign(centroidPerp) || 1;
    // place flush: center should be d/2 from wall, on interior side
    const flushPerp = (d / 2) * interiorSign;
    const newCx = ax + tx * clampedAlong + nx * flushPerp;
    const newCy = ay + ty * clampedAlong + ny * flushPerp;
    // Item rotation so width follows wall direction
    const angle = Math.atan2(dy, dx);
    const deg = (angle * 180) / Math.PI;
    const rotation = nearestRotation(deg);
    // After rotation, footprint may swap — recompute origin so item center is at newCx/newCy
    const fp = footprintForRotation(candidate.width, candidate.depth, rotation);
    const newX = newCx - fp.w / 2;
    const newY = newCy - fp.d / 2;

    const total = distFromFlush + Math.abs(along - clampedAlong) * 0.1;
    if (!best || total < best.dist) {
      best = {
        dist: total,
        snap: { x: newX, y: newY, rotation, edgeIndex: e.index },
      };
    }
  }

  return best?.snap ?? null;
}

function footprintForRotation(width: number, depth: number, rotation: Rotation) {
  if (rotation === 90 || rotation === 270) return { w: depth, d: width };
  return { w: width, d: depth };
}

function nearestRotation(deg: number): Rotation {
  // Wall direction angle deg; we want the back of the cabinet to face into the wall
  // i.e. rotation aligns the cabinet's "front" (positive y in local space) toward the room interior.
  // For a wall running horizontally (deg ≈ 0), rotation 0 (no spin) works because depth axis already faces +y.
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  // snap to nearest 90
  const opts: Rotation[] = [0, 90, 180, 270];
  let best: Rotation = 0;
  let bestDiff = Infinity;
  for (const r of opts) {
    const diff = Math.min(
      Math.abs(d - r),
      Math.abs(d - r + 360),
      Math.abs(d - r - 360),
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  return best;
}

function polygonCentroid(points: Point[]): Point {
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
    area += cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) {
    // fallback: average
    const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * For each contiguous run of base cabinets on a wall, return an axis-aligned
 * rectangle approximating the countertop slab over that run.
 * "Contiguous" here means base cabinets whose long edges touch within a small
 * tolerance and that share the same wall orientation (rotation).
 */
export type CountertopSlab = {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number; // counter thickness
  topZ: number; // top surface height (counterHeight)
};

export function generateCountertops(
  items: Item[],
  counterHeight: number,
  thickness = 1.5,
  overhangFront = 1.0,
): CountertopSlab[] {
  const bases = items.filter(
    (i) =>
      !i.scheduleOnly &&
      i.kind === "cabinet" &&
      (i.mountZ ?? 0) === 0 &&
      // exclude full-height pantries / ovens (no countertop above them)
      i.height < 60,
  );

  // group by rotation (so horizontal vs vertical runs stay separate)
  const groups = new Map<Rotation, Item[]>();
  for (const it of bases) {
    const arr = groups.get(it.rotation) ?? [];
    arr.push(it);
    groups.set(it.rotation, arr);
  }

  const slabs: CountertopSlab[] = [];
  for (const [rot, list] of groups) {
    const horizontal = rot === 0 || rot === 180;
    // sort by the axis along the wall
    list.sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    let run: Item[] = [];
    const flush = (a: Item, b: Item) => {
      const fa = footprint(a);
      if (horizontal) {
        const aEnd = a.x + fa.w;
        return Math.abs(aEnd - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5;
      }
      const aEnd = a.y + fa.d;
      return Math.abs(aEnd - b.y) <= 0.5 && Math.abs(a.x - b.x) <= 0.5;
    };
    const flushRun = (items: Item[]) => {
      if (items.length === 0) return;
      const minX = Math.min(...items.map((i) => i.x));
      const minY = Math.min(...items.map((i) => i.y));
      const maxX = Math.max(...items.map((i) => i.x + footprint(i).w));
      const maxY = Math.max(...items.map((i) => i.y + footprint(i).d));
      const w = maxX - minX;
      const d = maxY - minY;
      // overhang on the front edge — depends on rotation
      let x = minX;
      let y = minY;
      let ww = w;
      let dd = d;
      if (rot === 0) {
        dd += overhangFront;
      } else if (rot === 180) {
        y -= overhangFront;
        dd += overhangFront;
      } else if (rot === 90) {
        ww += overhangFront;
      } else if (rot === 270) {
        x -= overhangFront;
        ww += overhangFront;
      }
      slabs.push({
        x,
        y,
        width: ww,
        depth: dd,
        height: thickness,
        topZ: counterHeight,
      });
    };
    for (const it of list) {
      if (run.length === 0 || flush(run[run.length - 1], it)) {
        run.push(it);
      } else {
        flushRun(run);
        run = [it];
      }
    }
    flushRun(run);
  }
  return slabs;
}
