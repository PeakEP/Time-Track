import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { RotateCw } from "lucide-react";
import { useStore } from "../store";
import type { Item, Point } from "../types";
import { bounds, edges, visibleWallSet } from "../utils/roomPresets";
import {
  isScheduleOnly,
  makeId,
  snap,
  isCornerCabinet,
  cornerLPoints,
  placedDepth,
  placedKind,
  isLazySusan,
  isWallDiagonal,
  diagonalPoints,
} from "../utils/placement";
import { snapToNearestWall, snapToAdjacent } from "../utils/snapping";
import { findOverlappingIds } from "../utils/overlaps";
import { finishColor } from "../utils/finishColors";

const SNAP_IN = 3;
const ATTACH_IN = 8; // auto-attach when an edge is within this of a neighbour

export function Plan2D() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingZoom = useRef<{ px: number; py: number; ox: number; oy: number; ratio: number } | null>(null);
  const room = useStore((s) => s.project.room);
  const items = useStore((s) => s.project.items);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const ghost = useStore((s) => s.ghost);
  const setGhost = useStore((s) => s.setGhost);
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const rotateSelected = useStore((s) => s.rotateSelected);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const settings = useStore((s) => s.project.settings);
  const pxPerInch = useStore((s) => s.pxPerInch);
  const setZoom = useStore((s) => s.setZoom);
  const vertexEdit = useStore((s) => s.vertexEdit);
  const showDimensions = useStore((s) => s.showDimensions);
  const setShowDimensions = useStore((s) => s.setShowDimensions);

  const b = useMemo(() => bounds(room.points), [room.points]);
  const overlapping = useMemo(() => findOverlappingIds(items), [items]);
  const padIn = 24;
  const viewWidthIn = b.maxX - b.minX + padIn * 2;
  const viewHeightIn = b.maxY - b.minY + padIn * 2;
  const svgWidth = viewWidthIn * pxPerInch;
  const svgHeight = viewHeightIn * pxPerInch;
  const originX = padIn - b.minX;
  const originY = padIn - b.minY;

  const [cursor, setCursor] = useState<Point | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const screenToWorldIn = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left) / pxPerInch - originX;
      const y = (clientY - rect.top) / pxPerInch - originY;
      return { x, y };
    },
    [pxPerInch, originX, originY],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const NUDGE = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (!selectedId && e.key !== "Escape") return;
      if (e.key === "r" || e.key === "R") {
        rotateSelected();
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) removeItem(selectedId);
        e.preventDefault();
      } else if (e.key === "d" && (e.metaKey || e.ctrlKey)) {
        if (selectedId) duplicateItem(selectedId);
        e.preventDefault();
      } else if (NUDGE.includes(e.key)) {
        // arrow keys nudge the selected item; Shift = fine (1/8"), else 1"
        if (!selectedId) return;
        const it = items.find((i) => i.id === selectedId);
        if (!it) return;
        const step = e.shiftKey ? 0.125 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateItem(selectedId, {
          x: Math.round((it.x + dx) * 1000) / 1000,
          y: Math.round((it.y + dy) * 1000) / 1000,
        });
        e.preventDefault();
      } else if (e.key === "Escape") {
        select(null);
        setGhost(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, items, updateItem, rotateSelected, removeItem, duplicateItem, select, setGhost]);

  function onMouseMove(e: React.MouseEvent) {
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    setCursor(pos);
    if (dragging) {
      const item = items.find((i) => i.id === dragging.id);
      if (!item) return;
      const free = e.altKey; // hold Alt to move freely (no snapping)
      // fine grid for panels/fillers and for any Alt-drag; coarse for cabinets
      const grid = free || item.kind === "panel" || item.kind === "filler" ? 0.25 : SNAP_IN;
      let newX = snap(pos.x - dragging.offsetX, grid);
      let newY = snap(pos.y - dragging.offsetY, grid);
      let rotation = item.rotation;
      const snapsToWall = !free && !item.scheduleOnly && item.kind !== "panel" && item.kind !== "filler";
      if (snapsToWall) {
        const wallSnap = snapToNearestWall(room, {
          x: newX,
          y: newY,
          width: item.width,
          depth: item.depth,
        });
        if (wallSnap) {
          newX = wallSnap.x;
          newY = wallSnap.y;
          rotation = wallSnap.rotation;
        }
      }
      // auto-attach: snap edges flush to nearby objects (unless Alt held)
      if (!free) {
        const fw = rotation === 90 || rotation === 270 ? item.depth : item.width;
        const fd = rotation === 90 || rotation === 270 ? item.width : item.depth;
        const others = items
          .filter(
            (o) =>
              o.id !== item.id &&
              !o.scheduleOnly &&
              o.kind !== "window" &&
              o.kind !== "door",
          )
          .map((o) => {
            const ofw = o.rotation === 90 || o.rotation === 270 ? o.depth : o.width;
            const ofd = o.rotation === 90 || o.rotation === 270 ? o.width : o.depth;
            return { x: o.x, y: o.y, w: ofw, d: ofd };
          });
        const adj = snapToAdjacent({ x: newX, y: newY, w: fw, d: fd }, others, ATTACH_IN);
        newX = adj.x;
        newY = adj.y;
      }
      updateItem(dragging.id, { x: newX, y: newY, rotation }, { snapshot: false });
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (ghost) return; // placement click is handled in onClick
    // background click clears selection (only if hitting bg rect)
    const target = e.target as SVGElement;
    if (target.tagName === "svg" || target.dataset.bg === "1") {
      select(null);
    }
  }

  function onMouseUp() {
    if (dragging) {
      // commit a single history snapshot at end of drag
      const item = items.find((i) => i.id === dragging.id);
      if (item) updateItem(dragging.id, { x: item.x, y: item.y });
    }
    setDragging(null);
  }

  function onClick(e: React.MouseEvent) {
    // read the live ghost from the store so a click right after picking a
    // catalog item still places (avoids a render-timing race)
    const activeGhost = useStore.getState().ghost;
    if (!activeGhost) return;
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    const sku = activeGhost.product;
    if (isScheduleOnly(sku)) return; // ignore; user should use Add-to-schedule
    const w = sku.width_in ?? 24;
    const d = placedDepth(sku);
    const kind = placedKind(sku);
    const isPF = kind === "panel" || kind === "filler";
    const grid = isPF ? 0.25 : SNAP_IN;
    let x = snap(pos.x - w / 2, grid);
    let y = snap(pos.y - d / 2, grid);
    let rotation: Item["rotation"] = 0;
    // panels/fillers are positioned and rotated by hand; don't wall-snap them
    if (!isPF) {
      const ws = snapToNearestWall(room, { x, y, width: w, depth: d });
      if (ws) {
        x = snap(ws.x, SNAP_IN);
        y = snap(ws.y, SNAP_IN);
        rotation = ws.rotation;
      }
    }
    // auto-attach flush to nearby objects
    if (!e.altKey) {
      const fw = rotation === 90 || rotation === 270 ? d : w;
      const fd = rotation === 90 || rotation === 270 ? w : d;
      const others = items
        .filter((o) => !o.scheduleOnly && o.kind !== "window" && o.kind !== "door")
        .map((o) => {
          const ofw = o.rotation === 90 || o.rotation === 270 ? o.depth : o.width;
          const ofd = o.rotation === 90 || o.rotation === 270 ? o.width : o.depth;
          return { x: o.x, y: o.y, w: ofw, d: ofd };
        });
      const adj = snapToAdjacent({ x, y, w: fw, d: fd }, others, ATTACH_IN);
      x = adj.x;
      y = adj.y;
    }
    const item: Item = {
      id: makeId(),
      kind,
      sku: sku.sku,
      x,
      y,
      rotation,
      width: w,
      depth: d,
      height: sku.height_in ?? 34.5,
      mountZ: activeGhost.mountZ,
    };
    addItem(item);
    if (!e.shiftKey) setGhost(null);
  }

  function onItemMouseDown(e: React.MouseEvent, it: Item) {
    // While placing (ghost active), let the click fall through to placement so
    // uppers can be dropped directly over base cabinets.
    if (ghost) return;
    e.stopPropagation();
    select(it.id);
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    setDragging({ id: it.id, offsetX: pos.x - it.x, offsetY: pos.y - it.y });
  }

  function fitToView() {
    const el = scrollRef.current;
    if (!el) return;
    const z = Math.min(el.clientWidth / viewWidthIn, el.clientHeight / viewHeightIn);
    pendingZoom.current = null;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
  }

  // Native, non-passive wheel listener so we can zoom toward the cursor.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheelNative(e: WheelEvent) {
      e.preventDefault();
      const { pxPerInch: oldZoom, setZoom: setZ } = useStore.getState();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(1.5, Math.min(24, oldZoom * factor));
      if (newZoom === oldZoom) return;
      const rect = el!.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      pendingZoom.current = {
        px: ox + el!.scrollLeft,
        py: oy + el!.scrollTop,
        ox,
        oy,
        ratio: newZoom / oldZoom,
      };
      setZ(newZoom);
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  // After a wheel zoom re-renders the SVG, re-anchor scroll so the point
  // under the cursor stays put.
  useLayoutEffect(() => {
    const p = pendingZoom.current;
    const el = scrollRef.current;
    if (!p || !el) return;
    el.scrollLeft = p.px * p.ratio - p.ox;
    el.scrollTop = p.py * p.ratio - p.oy;
    pendingZoom.current = null;
  }, [pxPerInch]);

  return (
    <div className="plan-wrap">
      <div className="plan-toolbar">
        <div className="zoom-controls">
          <button onClick={() => setZoom(pxPerInch / 1.2)} title="Zoom out">−</button>
          <span className="zoom-readout">{Math.round((pxPerInch / 4) * 100)}%</span>
          <button onClick={() => setZoom(pxPerInch * 1.2)} title="Zoom in">+</button>
          <button className="fit-btn" onClick={fitToView} title="Fit room to view">Fit</button>
        </div>
        <WallModeControl />
        <button
          className={`blueprint-btn ${showDimensions ? "active" : ""}`}
          onClick={() => setShowDimensions(!showDimensions)}
          title="Show measurements for the install team"
        >
          Blueprint {showDimensions ? "on" : "off"}
        </button>
        <div className="cursor-readout">
          {cursor ? `${cursor.x.toFixed(1)}", ${cursor.y.toFixed(1)}"` : "scroll to zoom"}
        </div>
      </div>
      <div className="plan-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${viewWidthIn} ${viewHeightIn}`}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onClick={onClick}
          className="plan-svg"
        >
          <defs>
            <pattern id="grid-minor" width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#dfe4ec" strokeWidth="0.1" />
            </pattern>
            <pattern id="grid-major" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#c4ccd9" strokeWidth="0.18" />
            </pattern>
            <pattern id="grid-bold" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#9aa6b8" strokeWidth="0.32" />
            </pattern>
            <clipPath id="room-clip">
              <polygon points={room.points.map((p) => `${p.x},${p.y}`).join(" ")} />
            </clipPath>
          </defs>
          <g transform={`translate(${originX} ${originY})`}>
            {/* faint grid outside the room */}
            <rect
              data-bg="1"
              x={b.minX - padIn}
              y={b.minY - padIn}
              width={viewWidthIn}
              height={viewHeightIn}
              fill="#eef1f6"
            />
            {/* room floor */}
            <polygon
              data-bg="1"
              points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#ffffff"
            />
            {/* scaled grid clipped to the room interior */}
            <g clipPath="url(#room-clip)" pointerEvents="none">
              <rect x={b.minX - padIn} y={b.minY - padIn} width={viewWidthIn} height={viewHeightIn} fill="url(#grid-minor)" />
              <rect x={b.minX - padIn} y={b.minY - padIn} width={viewWidthIn} height={viewHeightIn} fill="url(#grid-major)" />
              <rect x={b.minX - padIn} y={b.minY - padIn} width={viewWidthIn} height={viewHeightIn} fill="url(#grid-bold)" />
            </g>
            <RoomPolygon />
            {[...items]
              .sort((a, b) => (a.mountZ ?? 0) - (b.mountZ ?? 0))
              .map((it) => (
              <ItemNode
                key={it.id}
                item={it}
                selected={it.id === selectedId}
                overlap={overlapping.has(it.id)}
                onMouseDown={onItemMouseDown}
              />
            ))}
            <DimensionLines />
            {showDimensions && <BlueprintDimensions items={items} />}
            {ghost && cursor && <GhostPreview cursor={cursor} />}
            <VertexEditor screenToWorldIn={screenToWorldIn} />
          </g>
        </svg>
      </div>
      {vertexEdit && (
        <div className="vertex-edit-banner">
          Vertex edit mode · drag dots to reshape walls · click + on midpoints to add a vertex · right-click a dot to remove
        </div>
      )}
    </div>
  );
}

function VertexEditor({
  screenToWorldIn,
}: {
  screenToWorldIn: (x: number, y: number) => { x: number; y: number } | null;
}) {
  const vertexEdit = useStore((s) => s.vertexEdit);
  const room = useStore((s) => s.project.room);
  const setRoom = useStore((s) => s.setRoom);
  if (!vertexEdit) return null;

  function moveVertex(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    const start = screenToWorldIn(e.clientX, e.clientY);
    if (!start) return;
    const original = room.points[i];
    function onMove(ev: MouseEvent) {
      const pos = screenToWorldIn(ev.clientX, ev.clientY);
      if (!pos) return;
      const dx = pos.x - start!.x;
      const dy = pos.y - start!.y;
      const next = room.points.map((p, idx) =>
        idx === i ? { x: snap(original.x + dx, 3), y: snap(original.y + dy, 3) } : p,
      );
      setRoom({ ...room, points: next });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function removeVertex(i: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (room.points.length <= 3) return;
    setRoom({ ...room, points: room.points.filter((_, idx) => idx !== i) });
  }
  function insertVertex(edgeIndex: number) {
    const a = room.points[edgeIndex];
    const b = room.points[(edgeIndex + 1) % room.points.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const next = [...room.points];
    next.splice(edgeIndex + 1, 0, mid);
    setRoom({ ...room, points: next });
  }

  return (
    <g className="vertex-handles">
      {edges(room.points).map((e, i) => {
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2;
        return (
          <g key={`edge-${i}`} onClick={() => insertVertex(i)} style={{ cursor: "copy" }}>
            <circle cx={mx} cy={my} r={1.8} fill="#fff" stroke="#49C1C4" strokeWidth={0.4} />
            <text x={mx} y={my + 0.7} textAnchor="middle" fontSize={2.2} fill="#3A7AA0" fontFamily="Inter" fontWeight={700}>
              +
            </text>
          </g>
        );
      })}
      {room.points.map((p, i) => (
        <circle
          key={`v-${i}`}
          cx={p.x}
          cy={p.y}
          r={2.4}
          fill="#2C327C"
          stroke="#fff"
          strokeWidth={0.6}
          style={{ cursor: "grab" }}
          onMouseDown={(e) => moveVertex(i, e)}
          onContextMenu={(e) => removeVertex(i, e)}
        />
      ))}
    </g>
  );
}

function RoomPolygon() {
  const room = useStore((s) => s.project.room);
  const wallMode = useStore((s) => s.project.settings.wallMode ?? 4);
  const wallViewAngle = useStore((s) => s.project.settings.wallViewAngle ?? 45);
  const visible = useMemo(
    () => visibleWallSet(room.points, wallMode, wallViewAngle),
    [room.points, wallMode, wallViewAngle],
  );
  return (
    <>
      {edges(room.points).map((e, i) => {
        const shown = visible.has(e.index);
        return (
          <line
            key={i}
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke={shown ? "#1f2532" : "#c4ccd9"}
            strokeWidth={shown ? room.wallThickness * 0.25 : 0.4}
            strokeLinecap="square"
            strokeDasharray={shown ? undefined : "2 2"}
          />
        );
      })}
    </>
  );
}

function WallModeControl() {
  const wallMode = useStore((s) => s.project.settings.wallMode ?? 4);
  const wallViewAngle = useStore((s) => s.project.settings.wallViewAngle ?? 45);
  const patchSettings = useStore((s) => s.patchSettings);
  const opts: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
  return (
    <div className="wall-mode" title="How many walls to show (hides front walls for a clearer 3D view)">
      <span className="wall-mode-label">Walls</span>
      {opts.map((n) => (
        <button
          key={n}
          className={wallMode === n ? "active" : ""}
          onClick={() => patchSettings({ wallMode: n })}
        >
          {n === 4 ? "All" : n}
        </button>
      ))}
      <button
        className="wall-rotate"
        title="Rotate which walls are shown"
        disabled={wallMode >= 4}
        onClick={() => patchSettings({ wallViewAngle: (wallViewAngle + 90) % 360 })}
      >
        <RotateCw size={13} />
      </button>
    </div>
  );
}

function BlueprintDimensions({ items }: { items: Item[] }) {
  return (
    <g pointerEvents="none" className="blueprint-dims">
      {items
        .filter((it) => !it.scheduleOnly && it.kind !== "window" && it.kind !== "door")
        .map((it) => {
          const fpw = it.rotation === 90 || it.rotation === 270 ? it.depth : it.width;
          const fph = it.rotation === 90 || it.rotation === 270 ? it.width : it.depth;
          const x = it.x;
          const y = it.y;
          const off = 2.5; // dim line offset above/left, inches
          return (
            <g key={it.id}>
              {/* width dimension above the item */}
              <line x1={x} y1={y - off} x2={x + fpw} y2={y - off} stroke="#c0392b" strokeWidth={0.18} />
              <line x1={x} y1={y - off - 1} x2={x} y2={y - off + 1} stroke="#c0392b" strokeWidth={0.18} />
              <line x1={x + fpw} y1={y - off - 1} x2={x + fpw} y2={y - off + 1} stroke="#c0392b" strokeWidth={0.18} />
              <rect x={x + fpw / 2 - 5} y={y - off - 3.2} width={10} height={3} fill="#fff" opacity={0.85} />
              <text x={x + fpw / 2} y={y - off - 1} textAnchor="middle" fontSize={2.6} fill="#c0392b" fontFamily="Inter" fontWeight={700}>
                {fmtInch(it.width)}
              </text>
              {/* depth dimension on the left */}
              <line x1={x - off} y1={y} x2={x - off} y2={y + fph} stroke="#c0392b" strokeWidth={0.18} />
              <line x1={x - off - 1} y1={y} x2={x - off + 1} y2={y} stroke="#c0392b" strokeWidth={0.18} />
              <line x1={x - off - 1} y1={y + fph} x2={x - off + 1} y2={y + fph} stroke="#c0392b" strokeWidth={0.18} />
              <text
                x={x - off - 1}
                y={y + fph / 2}
                textAnchor="middle"
                fontSize={2.6}
                fill="#c0392b"
                fontFamily="Inter"
                fontWeight={700}
                transform={`rotate(-90 ${x - off - 1} ${y + fph / 2})`}
              >
                {fmtInch(it.depth)}
              </text>
            </g>
          );
        })}
    </g>
  );
}

function fmtInch(n: number): string {
  return Number.isInteger(n) ? `${n}"` : `${n.toFixed(2).replace(/\.?0+$/, "")}"`;
}

function DimensionLines() {
  const room = useStore((s) => s.project.room);
  const ee = edges(room.points);
  return (
    <g pointerEvents="none">
      {ee.map((e, i) => {
        const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
        const mx = (e.a.x + e.b.x) / 2;
        const my = (e.a.y + e.b.y) / 2;
        const angle = (Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) * 180) / Math.PI;
        const inches = Math.round(len);
        const feet = Math.floor(inches / 12);
        const rem = inches % 12;
        const label = feet > 0 ? `${feet}'${rem ? ` ${rem}"` : ""}` : `${inches}"`;
        return (
          <g key={i} transform={`translate(${mx} ${my}) rotate(${angle})`}>
            <text
              x={0}
              y={-3}
              textAnchor="middle"
              fontSize={3}
              fill="#3A7AA0"
              fontFamily="Inter, system-ui"
              fontWeight={600}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ItemNode({
  item,
  selected,
  overlap,
  onMouseDown,
}: {
  item: Item;
  selected: boolean;
  overlap?: boolean;
  onMouseDown: (e: React.MouseEvent, it: Item) => void;
}) {
  const settings = useStore((s) => s.project.settings);
  const catalog = useStore((s) => s.catalog);
  if (item.scheduleOnly) return null;
  const w = item.rotation === 90 || item.rotation === 270 ? item.depth : item.width;
  const h = item.rotation === 90 || item.rotation === 270 ? item.width : item.depth;
  const isWall = (item.mountZ ?? 0) > 0;
  const isWindow = item.kind === "window";
  const isDoor = item.kind === "door";
  const product = catalog && item.sku ? catalog.products.find((p) => p.sku === item.sku) ?? null : null;
  const isCorner = isCornerCabinet(product);
  const lazySusan = isLazySusan(product);
  const diagonal = isWallDiagonal(product);

  if (isWindow) {
    return (
      <g
        transform={`translate(${item.x} ${item.y})`}
        onMouseDown={(e) => onMouseDown(e, item)}
        style={{ cursor: "grab" }}
      >
        <rect x={0} y={0} width={w} height={h} fill="#cfe6f1" stroke={selected ? "#2C327C" : "#3A7AA0"} strokeWidth={selected ? 0.6 : 0.4} />
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#3A7AA0" strokeWidth={0.25} />
        <text x={w / 2} y={h / 2 + 1.2} textAnchor="middle" fontSize={2.6} fill="#2C327C" fontFamily="Inter">
          WIN {Math.round(item.width)}"
        </text>
      </g>
    );
  }
  if (isDoor) {
    const swingPath = doorSwingPath(item.width, item.hingeSide ?? "left", item.swing ?? "in");
    return (
      <g
        transform={`translate(${item.x} ${item.y})`}
        onMouseDown={(e) => onMouseDown(e, item)}
        style={{ cursor: "grab" }}
      >
        <rect x={0} y={0} width={w} height={h} fill="#fff" stroke={selected ? "#2C327C" : "#333"} strokeWidth={selected ? 0.6 : 0.4} />
        <path d={swingPath} fill="none" stroke="#666" strokeWidth={0.25} strokeDasharray="0.6 0.6" />
        <text x={w / 2} y={h / 2} textAnchor="middle" fontSize={2.6} fill="#333" fontFamily="Inter">
          DR {Math.round(item.width)}"
        </text>
      </g>
    );
  }

  const isAppliance = item.kind === "appliance";
  const isPanelPiece = item.kind === "panel" || item.kind === "filler";
  const doorHex = finishColor(settings.finishCode);
  const fill = overlap
    ? "#fde8e6"
    : isAppliance
      ? "#e6ecf3"
      : isPanelPiece
        ? doorHex // panels/fillers are finished surfaces -> finish colour
        : isWall
          ? "#f7f5f0"
          : "#f6f4ef";
  const stroke = overlap
    ? "#c0392b"
    : selected
      ? "#2C327C"
      : isAppliance
        ? "#5a6478"
        : isWall
          ? "#9aa4b6"
          : "#1f2532";

  if (isCorner) {
    const pts = cornerLPoints(item.width, item.rotation);
    const ptsStr = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
    const cxL = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cyL = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    // inner front edges of the L (door faces): pts[2]->pts[3] and pts[3]->pts[4]
    const doorEdges: [number, number, number, number][] = [
      [pts[2][0], pts[2][1], pts[3][0], pts[3][1]],
      [pts[3][0], pts[3][1], pts[4][0], pts[4][1]],
    ];
    return (
      <g
        transform={`translate(${item.x} ${item.y})`}
        onMouseDown={(e) => onMouseDown(e, item)}
        style={{ cursor: "grab" }}
      >
        <polygon
          points={ptsStr}
          fill={fill}
          stroke={stroke}
          strokeWidth={overlap ? 0.7 : selected ? 0.7 : 0.4}
          strokeDasharray={overlap ? "1.5 0.6" : isWall ? "1.2 0.6" : undefined}
        />
        {doorEdges.map(([x1, y1, x2, y2], i) => (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#b0651f" strokeWidth={0.9} />
            {lazySusan && (
              <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={0.8} fill="#fff" stroke="#b0651f" strokeWidth={0.3} />
            )}
          </g>
        ))}
        <rect x={cxL - 5} y={cyL - 2.6} width={10} height={5.4} rx={0.6} fill="#ffffff" opacity={0.82} />
        <text x={cxL} y={cyL} textAnchor="middle" fontSize={2.5} fill="#1f2532" fontFamily="Inter" fontWeight={600}>
          {item.sku ?? ""}
        </text>
        <text x={cxL} y={cyL + 2.5} textAnchor="middle" fontSize={1.9} fill="#4a5364" fontFamily="Inter">
          {lazySusan ? "lazy susan" : "corner"}
        </text>
        {overlap && (
          <text x={item.width / 2} y={-2.5} textAnchor="middle" fontSize={2.6} fill="#c0392b" fontFamily="Inter" fontWeight={700}>
            ⚠ overlap
          </text>
        )}
      </g>
    );
  }

  if (diagonal) {
    const pts = diagonalPoints(item.width, item.rotation);
    const ptsStr = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
    const cxL = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cyL = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const [p1, p2] = [pts[1], pts[2]];
    return (
      <g
        transform={`translate(${item.x} ${item.y})`}
        onMouseDown={(e) => onMouseDown(e, item)}
        style={{ cursor: "grab" }}
      >
        <polygon
          points={ptsStr}
          fill={fill}
          stroke={stroke}
          strokeWidth={selected ? 0.7 : 0.4}
          strokeDasharray={isWall ? "1.2 0.6" : undefined}
        />
        {/* diagonal door face on the hypotenuse */}
        <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#b0651f" strokeWidth={1} />
        <text x={cxL} y={cyL + 1} textAnchor="middle" fontSize={2.2} fill="#1f2532" fontFamily="Inter" fontWeight={600}>
          {item.sku ?? ""}
        </text>
      </g>
    );
  }

  return (
    <g
      transform={`translate(${item.x} ${item.y})`}
      onMouseDown={(e) => onMouseDown(e, item)}
      style={{ cursor: "grab" }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={overlap ? 0.7 : selected ? 0.7 : 0.4}
        strokeDasharray={overlap ? "1.5 0.6" : isWall ? "1.2 0.6" : undefined}
      />
      {overlap && (
        <text
          x={w / 2}
          y={-2.5}
          textAnchor="middle"
          fontSize={2.6}
          fill="#c0392b"
          fontFamily="Inter"
          fontWeight={700}
        >
          ⚠ overlap
        </text>
      )}
      {/* Door face hint at front: a thin band in the finish colour */}
      {!isPanelPiece && (
        <rect x={0} y={h - 1.2} width={w} height={1.2} fill={doorHex} stroke="#00000022" strokeWidth={0.1} />
      )}
      {(() => {
        // Offset labels vertically by mount type so an upper over a base
        // doesn't collide: wall labels sit near the wall (back), base near front.
        const label = item.sku ?? item.label ?? "";
        const labelY = isWall ? Math.min(4.6, h / 2) : Math.max(h - 5.5, h / 2);
        const chipW = Math.max(label.length * 1.45 + 2, 8);
        return (
          <g>
            <rect
              x={w / 2 - chipW / 2}
              y={labelY - 2.5}
              width={chipW}
              height={5.4}
              rx={0.6}
              fill={isWall ? "#fbf6ea" : "#ffffff"}
              opacity={0.82}
            />
            <text x={w / 2} y={labelY} textAnchor="middle" fontSize={2.5} fill="#1f2532" fontFamily="Inter" fontWeight={600}>
              {label}
            </text>
            <text x={w / 2} y={labelY + 2.5} textAnchor="middle" fontSize={1.9} fill="#4a5364" fontFamily="Inter">
              {Math.round(item.width)}"{isAppliance ? " appl" : isWall ? " up" : ""}
            </text>
          </g>
        );
      })()}
      {selected && (
        <>
          {/* width dim */}
          <text x={w / 2} y={-1.5} textAnchor="middle" fontSize={2.4} fill="#2C327C" fontFamily="Inter" fontWeight={600}>
            {Math.round(item.width)}"
          </text>
          <text
            x={-1.5}
            y={h / 2}
            textAnchor="end"
            fontSize={2.4}
            fill="#2C327C"
            fontFamily="Inter"
            fontWeight={600}
          >
            {Math.round(item.depth)}"
          </text>
        </>
      )}
      {/* Suppress unused settings */}
      {settings.wallCabinetAFF < 0 && null}
    </g>
  );
}

function GhostPreview({ cursor }: { cursor: Point }) {
  const ghost = useStore((s) => s.ghost);
  if (!ghost) return null;
  const p = ghost.product;
  const w = p.width_in ?? 24;
  const d = placedDepth(p);
  const x = snap(cursor.x - w / 2, SNAP_IN);
  const y = snap(cursor.y - d / 2, SNAP_IN);
  return (
    <g pointerEvents="none" opacity={0.7}>
      <rect x={x} y={y} width={w} height={d} fill="#c7e0ed" stroke="#2C327C" strokeWidth={0.6} strokeDasharray="1 0.6" />
      <text x={x + w / 2} y={y + d / 2} textAnchor="middle" fontSize={2.5} fill="#2C327C" fontFamily="Inter" fontWeight={600}>
        {p.sku}
      </text>
    </g>
  );
}

function doorSwingPath(w: number, hinge: "left" | "right", swing: "in" | "out"): string {
  // Door is drawn from (0,0) to (w, w) sweep — swing arc inside or outside the wall.
  // wall axis is along x; arc sweeps into ±y depending on swing.
  const r = w;
  const yDir = swing === "in" ? r : -r;
  if (hinge === "left") {
    return `M ${w} 0 A ${r} ${r} 0 0 ${swing === "in" ? 1 : 0} 0 ${yDir} L 0 0`;
  }
  return `M 0 0 A ${r} ${r} 0 0 ${swing === "in" ? 0 : 1} ${w} ${yDir} L ${w} 0`;
}
