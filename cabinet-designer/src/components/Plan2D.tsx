import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useStore } from "../store";
import type { Item, Point } from "../types";
import { bounds, edges } from "../utils/roomPresets";
import { isScheduleOnly, isWallMounted, makeId, snap } from "../utils/placement";
import { snapToNearestWall } from "../utils/snapping";
import { findOverlappingIds } from "../utils/overlaps";

const SNAP_IN = 3;

export function Plan2D() {
  const svgRef = useRef<SVGSVGElement | null>(null);
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
      } else if (e.key === "Escape") {
        select(null);
        setGhost(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, rotateSelected, removeItem, duplicateItem, select, setGhost]);

  function onMouseMove(e: React.MouseEvent) {
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    setCursor(pos);
    if (dragging) {
      let newX = snap(pos.x - dragging.offsetX, SNAP_IN);
      let newY = snap(pos.y - dragging.offsetY, SNAP_IN);
      const item = items.find((i) => i.id === dragging.id);
      if (item && !item.scheduleOnly) {
        const wallSnap = snapToNearestWall(room, {
          x: newX,
          y: newY,
          width: item.width,
          depth: item.depth,
        });
        if (wallSnap) {
          newX = snap(wallSnap.x, SNAP_IN);
          newY = snap(wallSnap.y, SNAP_IN);
          updateItem(
            dragging.id,
            { x: newX, y: newY, rotation: wallSnap.rotation },
            { snapshot: false },
          );
          return;
        }
      }
      updateItem(dragging.id, { x: newX, y: newY }, { snapshot: false });
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
    if (!ghost) return;
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    const sku = ghost.product;
    if (isScheduleOnly(sku)) return; // ignore; user should use Add-to-schedule
    const w = sku.width_in ?? 24;
    const d = sku.depth_in ?? 24;
    let x = snap(pos.x - w / 2, SNAP_IN);
    let y = snap(pos.y - d / 2, SNAP_IN);
    let rotation: Item["rotation"] = 0;
    const ws = snapToNearestWall(room, { x, y, width: w, depth: d });
    if (ws) {
      x = snap(ws.x, SNAP_IN);
      y = snap(ws.y, SNAP_IN);
      rotation = ws.rotation;
    }
    const item: Item = {
      id: makeId(),
      kind: "cabinet",
      sku: sku.sku,
      x,
      y,
      rotation,
      width: w,
      depth: d,
      height: sku.height_in ?? 34.5,
      mountZ: isWallMounted(sku) ? settings.wallCabinetAFF : 0,
    };
    addItem(item);
    if (!e.shiftKey) setGhost(null);
  }

  function onItemMouseDown(e: React.MouseEvent, it: Item) {
    e.stopPropagation();
    select(it.id);
    const pos = screenToWorldIn(e.clientX, e.clientY);
    if (!pos) return;
    setDragging({ id: it.id, offsetX: pos.x - it.x, offsetY: pos.y - it.y });
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.5;
    setZoom(pxPerInch + delta);
  }

  return (
    <div className="plan-wrap" onWheel={onWheel}>
      <div className="plan-toolbar">
        <div className="zoom-controls">
          <button onClick={() => setZoom(pxPerInch - 0.5)} title="Zoom out">−</button>
          <span>{Math.round(pxPerInch * 12)} px/ft</span>
          <button onClick={() => setZoom(pxPerInch + 0.5)} title="Zoom in">+</button>
        </div>
        <div className="cursor-readout">
          {cursor ? `${cursor.x.toFixed(1)}", ${cursor.y.toFixed(1)}"` : ""}
        </div>
      </div>
      <div className="plan-scroll">
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
              <path d="M 6 0 L 0 0 0 6" fill="none" stroke="#e6e9ef" strokeWidth="0.05" />
            </pattern>
            <pattern id="grid-major" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#d4dae3" strokeWidth="0.1" />
            </pattern>
            <pattern id="grid-bold" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#aeb6c2" strokeWidth="0.15" />
            </pattern>
          </defs>
          <g transform={`translate(${originX} ${originY})`}>
            <rect
              data-bg="1"
              x={b.minX - padIn}
              y={b.minY - padIn}
              width={viewWidthIn}
              height={viewHeightIn}
              fill="url(#grid-minor)"
            />
            <rect
              data-bg="1"
              x={b.minX - padIn}
              y={b.minY - padIn}
              width={viewWidthIn}
              height={viewHeightIn}
              fill="url(#grid-major)"
            />
            <rect
              data-bg="1"
              x={b.minX - padIn}
              y={b.minY - padIn}
              width={viewWidthIn}
              height={viewHeightIn}
              fill="url(#grid-bold)"
            />
            <RoomPolygon />
            {items.map((it) => (
              <ItemNode
                key={it.id}
                item={it}
                selected={it.id === selectedId}
                overlap={overlapping.has(it.id)}
                onMouseDown={onItemMouseDown}
              />
            ))}
            <DimensionLines />
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
  const points = room.points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <>
      <polygon points={points} fill="#fafbfd" stroke="none" />
      {edges(room.points).map((e, i) => (
        <line
          key={i}
          x1={e.a.x}
          y1={e.a.y}
          x2={e.b.x}
          y2={e.b.y}
          stroke="#1f2532"
          strokeWidth={room.wallThickness * 0.25}
          strokeLinecap="square"
        />
      ))}
    </>
  );
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
  if (item.scheduleOnly) return null;
  const w = item.rotation === 90 || item.rotation === 270 ? item.depth : item.width;
  const h = item.rotation === 90 || item.rotation === 270 ? item.width : item.depth;
  const isWall = (item.mountZ ?? 0) > 0;
  const isWindow = item.kind === "window";
  const isDoor = item.kind === "door";

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
  const fill = overlap
    ? "#fde8e6"
    : isAppliance
      ? "#e6ecf3"
      : isWall
        ? "#f7f4ec"
        : "#f1ece1";
  const stroke = overlap
    ? "#c0392b"
    : selected
      ? "#2C327C"
      : isAppliance
        ? "#5a6478"
        : isWall
          ? "#9aa4b6"
          : "#1f2532";
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
      {/* Door face hint at front: a thin band */}
      {!isWall && (
        <rect x={0} y={h - 0.7} width={w} height={0.7} fill="#d4cab3" />
      )}
      <text x={w / 2} y={h / 2 - 0.5} textAnchor="middle" fontSize={2.5} fill="#1f2532" fontFamily="Inter" fontWeight={600}>
        {item.sku ?? item.label ?? ""}
      </text>
      <text x={w / 2} y={h / 2 + 2.5} textAnchor="middle" fontSize={2} fill="#4a5364" fontFamily="Inter">
        {Math.round(item.width)}" {isAppliance ? "(appl.)" : isWall ? "(wall)" : ""}
      </text>
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
  const d = p.depth_in ?? 24;
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
