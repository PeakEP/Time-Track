import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../store";
import type { Item, Point } from "../types";
import { edges } from "../utils/roomPresets";
import { footprint } from "../utils/placement";
import { finishColor } from "../utils/finishColors";

const NEAR_WALL_IN = 30; // an item counts as "on" a wall if within this of it

function centroid(points: Point[]): Point {
  const s = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / points.length, y: s.y / points.length };
}

type Proj = {
  item: Item;
  alongMin: number;
  alongMax: number;
  perpMin: number;
  bottom: number;
  top: number;
};

export function Elevation() {
  const room = useStore((s) => s.project.room);
  const items = useStore((s) => s.project.items);
  const settings = useStore((s) => s.project.settings);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const catalog = useStore((s) => s.catalog);
  const frontWall = useStore((s) => s.frontWall);
  const setFrontWall = useStore((s) => s.setFrontWall);

  const ee = edges(room.points);
  const wallCount = ee.length;
  const wallIndex = ((frontWall % wallCount) + wallCount) % wallCount;
  const wall = ee[wallIndex];

  const doorHex = finishColor(settings.finishCode);
  const wallHeight = settings.wallHeight;

  const { len, projected } = useMemo(() => {
    const a = wall.a;
    const b = wall.b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const tx = dx / length;
    const ty = dy / length;
    let nx = -ty;
    let ny = tx;
    const c = centroid(room.points);
    if ((c.x - a.x) * nx + (c.y - a.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const out: Proj[] = [];
    for (const it of items) {
      if (it.scheduleOnly) continue;
      const fp = footprint(it);
      const corners: [number, number][] = [
        [it.x, it.y],
        [it.x + fp.w, it.y],
        [it.x + fp.w, it.y + fp.d],
        [it.x, it.y + fp.d],
      ];
      let alongMin = Infinity;
      let alongMax = -Infinity;
      let perpMin = Infinity;
      for (const [px, py] of corners) {
        const rx = px - a.x;
        const ry = py - a.y;
        const along = rx * tx + ry * ty;
        const perp = rx * nx + ry * ny;
        alongMin = Math.min(alongMin, along);
        alongMax = Math.max(alongMax, along);
        perpMin = Math.min(perpMin, perp);
      }
      // must be close to this wall, on the interior side, and overlap its run
      if (perpMin > NEAR_WALL_IN || perpMin < -3) continue;
      if (alongMax < -2 || alongMin > length + 2) continue;
      const bottom = it.mountZ ?? 0;
      out.push({ item: it, alongMin, alongMax, perpMin, bottom, top: bottom + it.height });
    }
    // draw far-from-wall (uppers behind) first, near last; and base before wall
    out.sort((p, q) => p.perpMin - q.perpMin || p.bottom - q.bottom);
    return { len: length, projected: out };
  }, [wall, room.points, items]);

  return (
    <div className="elev-wrap">
      <div className="elev-toolbar">
        <div className="wall-flip">
          <button onClick={() => setFrontWall(wallIndex - 1)} title="Previous wall">
            <ChevronLeft size={15} />
          </button>
          <span>
            Wall {wallIndex + 1} / {wallCount} · {fmtFt(len)}
          </span>
          <button onClick={() => setFrontWall(wallIndex + 1)} title="Next wall">
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="elev-hint">Front elevation — flip walls for L-shapes & peninsulas</div>
      </div>
      <ElevCanvas
        len={len}
        wallHeight={wallHeight}
        projected={projected}
        doorHex={doorHex}
        counterHeight={settings.counterHeight}
        wallCabinetAFF={settings.wallCabinetAFF}
        selectedId={selectedId}
        onSelect={select}
        catalog={catalog}
      />
    </div>
  );
}

function ElevCanvas({
  len,
  wallHeight,
  projected,
  doorHex,
  counterHeight,
  wallCabinetAFF,
  selectedId,
  onSelect,
  catalog,
}: {
  len: number;
  wallHeight: number;
  projected: Proj[];
  doorHex: string;
  counterHeight: number;
  wallCabinetAFF: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  catalog: import("../types").Catalog | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 24; // inches of margin around the drawing
  const viewW = len + pad * 2;
  const viewH = wallHeight + pad * 2;
  const scale = Math.min(size.w / viewW, size.h / viewH);
  const svgW = viewW * scale;
  const svgH = viewH * scale;

  const Y = (z: number) => wallHeight - z; // floor at bottom

  return (
    <div className="elev-canvas" ref={wrapRef} onClick={() => onSelect(null)}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${viewW} ${viewH}`}>
        <g transform={`translate(${pad} ${pad})`}>
          {/* wall background */}
          <rect x={0} y={0} width={len} height={wallHeight} fill="#eef1f6" stroke="#9aa6b8" strokeWidth={0.5} />
          {/* reference lines */}
          <ElevRefLine y={Y(counterHeight)} len={len} label={`Counter ${counterHeight}"`} />
          <ElevRefLine y={Y(wallCabinetAFF)} len={len} label={`Uppers ${wallCabinetAFF}" AFF`} dashed />
          {/* floor line */}
          <line x1={-4} y1={wallHeight} x2={len + 4} y2={wallHeight} stroke="#1f2532" strokeWidth={1} />
          {projected.length === 0 && (
            <text x={len / 2} y={wallHeight / 2} textAnchor="middle" fontSize={6} fill="#9aa6b8" fontFamily="Inter">
              No cabinets on this wall — use ‹ › to flip walls
            </text>
          )}
          {projected.map((p) => {
            const x = p.alongMin;
            const w = Math.max(p.alongMax - p.alongMin, 0.5);
            const y = Y(p.top);
            const h = p.top - p.bottom;
            const it = p.item;
            const isPanel = it.kind === "panel" || it.kind === "filler";
            const isAppliance = it.kind === "appliance";
            const isOpening = it.kind === "window" || it.kind === "door";
            const selected = it.id === selectedId;
            const product = catalog && it.sku ? catalog.products.find((pr) => pr.sku === it.sku) : null;
            const fill = isOpening
              ? it.kind === "window"
                ? "#cfe6f1"
                : "#ffffff"
              : isAppliance
                ? "#cfd6e0"
                : doorHex;
            return (
              <g
                key={it.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(it.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke={selected ? "#2C327C" : "#1f2532"}
                  strokeWidth={selected ? 1 : 0.4}
                  fillOpacity={isOpening ? 0.7 : 1}
                />
                {/* shaker frame hint for cabinet/panel doors */}
                {!isOpening && !isAppliance && w > 6 && h > 6 && (
                  <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} fill="none" stroke="#00000033" strokeWidth={0.4} />
                )}
                {w > 8 && (
                  <text x={x + w / 2} y={y + Math.min(h / 2, 10)} textAnchor="middle" fontSize={3} fill="#1f2532" fontFamily="Inter" fontWeight={600}>
                    {it.sku ?? it.label ?? (it.kind === "window" ? "WIN" : it.kind === "door" ? "DR" : "")}
                  </text>
                )}
                {w > 8 && (
                  <text x={x + w / 2} y={y + Math.min(h / 2, 10) + 3.5} textAnchor="middle" fontSize={2.4} fill="#4a5364" fontFamily="Inter">
                    {Math.round(w)}"w × {Math.round(h)}"h{product ? "" : ""}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function ElevRefLine({ y, len, label, dashed }: { y: number; len: number; label: string; dashed?: boolean }) {
  return (
    <g pointerEvents="none">
      <line x1={0} y1={y} x2={len} y2={y} stroke="#3A7AA0" strokeWidth={0.3} strokeDasharray={dashed ? "2 1.5" : "1 1"} opacity={0.7} />
      <text x={1} y={y - 1} fontSize={2.6} fill="#3A7AA0" fontFamily="Inter">
        {label}
      </text>
    </g>
  );
}

function fmtFt(inches: number): string {
  const n = Math.round(inches);
  const ft = Math.floor(n / 12);
  const rem = n % 12;
  return ft > 0 ? `${ft}'${rem ? ` ${rem}"` : ""}` : `${n}"`;
}
