import type { Point, Room } from "../types";

export function rectangleRoom(widthIn: number, depthIn: number, wallThickness = 6): Room {
  return {
    points: [
      { x: 0, y: 0 },
      { x: widthIn, y: 0 },
      { x: widthIn, y: depthIn },
      { x: 0, y: depthIn },
    ],
    wallThickness,
  };
}

export function lShapeRoom(
  overallW: number,
  overallD: number,
  notchW: number,
  notchD: number,
  wallThickness = 6,
): Room {
  // Notch is removed from the bottom-right corner.
  return {
    points: [
      { x: 0, y: 0 },
      { x: overallW, y: 0 },
      { x: overallW, y: overallD - notchD },
      { x: overallW - notchW, y: overallD - notchD },
      { x: overallW - notchW, y: overallD },
      { x: 0, y: overallD },
    ],
    wallThickness,
  };
}

export function uShapeRoom(
  overallW: number,
  overallD: number,
  notchW: number,
  notchD: number,
  wallThickness = 6,
): Room {
  // Notch removed from the middle of the bottom edge.
  const x1 = (overallW - notchW) / 2;
  const x2 = x1 + notchW;
  return {
    points: [
      { x: 0, y: 0 },
      { x: overallW, y: 0 },
      { x: overallW, y: overallD },
      { x: x2, y: overallD },
      { x: x2, y: overallD - notchD },
      { x: x1, y: overallD - notchD },
      { x: x1, y: overallD },
      { x: 0, y: overallD },
    ],
    wallThickness,
  };
}

export function bounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function edges(points: Point[]): { a: Point; b: Point; index: number }[] {
  const out: { a: Point; b: Point; index: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    out.push({ a: points[i], b: points[(i + 1) % points.length], index: i });
  }
  return out;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
