import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Edges } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Eye, Box as BoxIcon, Square as SquareIcon } from "lucide-react";
import { useStore } from "../store";
import type { Item, Point } from "../types";
import { bounds, edges, visibleWallSet } from "../utils/roomPresets";
import { darken, finishColor } from "../utils/finishColors";
import { generateCountertops } from "../utils/snapping";
import { isCornerCabinet, isLazySusan, isWallDiagonal, diagonalPoints, snap } from "../utils/placement";

type OrbitRef = {
  object: THREE.Camera & { position: THREE.Vector3; up: THREE.Vector3; lookAt: (v: THREE.Vector3) => void };
  target: THREE.Vector3;
  update: () => void;
};

export type DragHandlers = {
  down: (item: Item, e: ThreeEvent<PointerEvent>) => void;
  move: (item: Item, e: ThreeEvent<PointerEvent>) => void;
  up: () => void;
};

const _dragPlane = new THREE.Plane();
const _dragHit = new THREE.Vector3();
function rayToGround(ray: THREE.Ray, y: number): THREE.Vector3 | null {
  _dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
  return ray.intersectPlane(_dragPlane, _dragHit) ? _dragHit.clone() : null;
}

// World units = inches. Convert to feet for camera distances feels too large; keep inches.
export function Scene3D() {
  const room = useStore((s) => s.project.room);
  const items = useStore((s) => s.project.items);
  const settings = useStore((s) => s.project.settings);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const catalog = useStore((s) => s.catalog);
  const updateItem = useStore((s) => s.updateItem);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const dragState = useRef<{ id: string; offX: number; offZ: number; y: number } | null>(null);

  const drag: DragHandlers = useMemo(
    () => ({
      down: (item, e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        select(item.id);
        const y = item.mountZ ?? 0;
        const p = rayToGround(e.ray, y);
        if (!p) return;
        dragState.current = { id: item.id, offX: p.x - item.x, offZ: p.z - item.y, y };
        setOrbitEnabled(false);
      },
      move: (item, e) => {
        const ds = dragState.current;
        if (!ds || ds.id !== item.id) return;
        const p = rayToGround(e.ray, ds.y);
        if (!p) return;
        updateItem(
          ds.id,
          { x: snap(p.x - ds.offX, 3), y: snap(p.z - ds.offZ, 3) },
          { snapshot: false },
        );
      },
      up: () => {
        const ds = dragState.current;
        if (ds) {
          const it = useStore.getState().project.items.find((i) => i.id === ds.id);
          if (it) updateItem(ds.id, { x: it.x, y: it.y }); // commit one history step
        }
        dragState.current = null;
        setOrbitEnabled(true);
      },
    }),
    [select, updateItem],
  );

  const b = useMemo(() => bounds(room.points), [room.points]);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const dim = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const cameraDistance = dim * 1.4 + 120;
  const cameraTarget: [number, number, number] = [cx, settings.wallHeight / 3, cy];

  const finishHex = finishColor(settings.finishCode);
  const counters = useMemo(
    () => generateCountertops(items, settings.counterHeight),
    [items, settings.counterHeight],
  );
  const orbitRef = useRef<OrbitRef | null>(null);

  function setView(kind: "iso" | "top" | "front") {
    const c = orbitRef.current;
    if (!c) return;
    const center = new THREE.Vector3(cx, settings.wallHeight / 3, cy);
    if (kind === "top") {
      c.object.position.set(cx, dim * 1.6 + 200, cy);
    } else if (kind === "front") {
      c.object.position.set(cx, settings.wallHeight * 0.6, cy + dim * 1.2 + 120);
    } else {
      c.object.position.set(cx + cameraDistance, cameraDistance * 0.7, cy + cameraDistance);
    }
    c.target.copy(center);
    c.object.lookAt(center);
    c.update();
  }

  return (
    <div className="three-wrap">
      <Canvas
        shadows={false}
        camera={{ position: [cx + cameraDistance, cameraDistance * 0.7, cy + cameraDistance], fov: 40, near: 1, far: 5000 }}
        onPointerMissed={() => select(null)}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#eef1f7"]} />
        <hemisphereLight args={["#ffffff", "#b8bfd0", 0.8]} />
        <directionalLight position={[cx + 200, 320, cy + 200]} intensity={0.8} />
        <directionalLight position={[cx - 150, 260, cy - 100]} intensity={0.3} />
        <ambientLight intensity={0.4} />

        <Floor room={room} />
        <Walls
          room={room}
          wallHeight={settings.wallHeight}
          items={items}
          wallMode={settings.wallMode ?? 4}
          wallViewAngle={settings.wallViewAngle ?? 45}
        />
        <Grid
          position={[cx, 0.01, cy]}
          args={[dim * 2, dim * 2]}
          cellSize={12}
          sectionSize={48}
          cellColor="#cdd4df"
          sectionColor="#9ba6b7"
          fadeDistance={dim * 3}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={false}
        />

        {items.map((it) => {
          const prod = catalog?.products.find((p) => p.sku === it.sku) ?? null;
          return (
            <CabinetMesh
              key={it.id}
              item={it}
              selected={it.id === selectedId}
              onSelect={() => select(it.id)}
              finishHex={finishHex}
              corner={isCornerCabinet(prod)}
              lazySusan={isLazySusan(prod)}
              diagonal={isWallDiagonal(prod)}
              drag={drag}
            />
          );
        })}

        {counters.map((c, i) => (
          <mesh
            key={`ct-${i}`}
            position={[c.x + c.width / 2, c.topZ + c.height / 2, c.y + c.depth / 2]}
          >
            <boxGeometry args={[c.width, c.height, c.depth]} />
            <meshStandardMaterial color="#2a2a30" roughness={0.35} metalness={0.05} />
          </mesh>
        ))}

        <OrbitControls
          ref={(r) => {
            orbitRef.current = r as unknown as OrbitRef | null;
          }}
          enableDamping
          dampingFactor={0.1}
          target={cameraTarget}
          enabled={orbitEnabled}
          minDistance={48}
          maxDistance={2400}
          maxPolarAngle={Math.PI * 0.495}
        />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={["#2C327C", "#3A7AA0", "#49C1C4"]} labelColor="white" />
        </GizmoHelper>
      </Canvas>
      <div className="cam-presets" role="toolbar" aria-label="Camera presets">
        <button onClick={() => setView("iso")} title="Iso view">
          <BoxIcon size={14} /> Iso
        </button>
        <button onClick={() => setView("top")} title="Top-down view">
          <SquareIcon size={14} /> Top
        </button>
        <button onClick={() => setView("front")} title="Front view">
          <Eye size={14} /> Front
        </button>
      </div>
    </div>
  );
}

function Floor({ room }: { room: { points: Point[] } }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    room.points.forEach((p, i) => {
      if (i === 0) s.moveTo(p.x, p.y);
      else s.lineTo(p.x, p.y);
    });
    s.closePath();
    return s;
  }, [room.points]);
  const geo = useMemo(() => new THREE.ShapeGeometry(shape), [shape]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geo} receiveShadow>
      <meshStandardMaterial color="#b9b0a0" roughness={0.95} />
    </mesh>
  );
}

function Walls({
  room,
  wallHeight,
  items,
  wallMode,
  wallViewAngle,
}: {
  room: { points: Point[]; wallThickness: number };
  wallHeight: number;
  items: Item[];
  wallMode: 1 | 2 | 3 | 4;
  wallViewAngle: number;
}) {
  const windows = items.filter((i) => i.kind === "window");
  const doors = items.filter((i) => i.kind === "door");
  const ee = edges(room.points);
  const thickness = room.wallThickness;
  const visible = visibleWallSet(room.points, wallMode, wallViewAngle);
  return (
    <group>
      {ee.map((e, i) =>
        visible.has(e.index) ? (
          <Wall
            key={i}
            a={e.a}
            b={e.b}
            height={wallHeight}
            thickness={thickness}
            windows={windows}
            doors={doors}
          />
        ) : null,
      )}
    </group>
  );
}

function Wall({
  a,
  b,
  height,
  thickness,
  windows,
  doors,
}: {
  a: Point;
  b: Point;
  height: number;
  thickness: number;
  windows: Item[];
  doors: Item[];
}) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const length = Math.hypot(dx, dz);
  const cx = (a.x + b.x) / 2;
  const cz = (a.y + b.y) / 2;
  const angle = -Math.atan2(dz, dx);
  // Determine cutouts attached to this wall (within thickness perpendicular)
  const tol = thickness + 6;
  const ax = a.x;
  const az = a.y;
  function projectAlong(p: Item): number | null {
    // project center of p (which lies on wall) along (a→b)
    const px = p.x + p.width / 2 - ax;
    const pz = p.y + p.depth / 2 - az;
    const along = (px * dx + pz * dz) / length;
    const perp = Math.abs((px * -dz + pz * dx) / length);
    if (perp > tol) return null;
    if (along < 0 || along > length) return null;
    return along;
  }
  const cuts = [
    ...windows.map((w) => ({ at: projectAlong(w), w: w.width, h: w.height, sill: w.sillHeight ?? 36, kind: "window" as const })),
    ...doors.map((d) => ({ at: projectAlong(d), w: d.width, h: d.height, sill: 0, kind: "door" as const })),
  ].filter((c): c is { at: number; w: number; h: number; sill: number; kind: "window" | "door" } => c.at !== null);

  // Build wall as horizontal stripe segments split around openings
  type Seg = { x0: number; x1: number; y0: number; y1: number };
  const segs: Seg[] = [{ x0: 0, x1: length, y0: 0, y1: height }];
  function splitSeg(segments: Seg[], cut: { x0: number; x1: number; y0: number; y1: number }): Seg[] {
    const out: Seg[] = [];
    for (const s of segments) {
      // Vertical (x) split
      const overlap = s.x0 < cut.x1 && s.x1 > cut.x0 && s.y0 < cut.y1 && s.y1 > cut.y0;
      if (!overlap) {
        out.push(s);
        continue;
      }
      // Up to 4 sub-segments around the cut
      if (s.x0 < cut.x0) out.push({ x0: s.x0, x1: cut.x0, y0: s.y0, y1: s.y1 });
      if (s.x1 > cut.x1) out.push({ x0: cut.x1, x1: s.x1, y0: s.y0, y1: s.y1 });
      const midX0 = Math.max(s.x0, cut.x0);
      const midX1 = Math.min(s.x1, cut.x1);
      if (s.y0 < cut.y0) out.push({ x0: midX0, x1: midX1, y0: s.y0, y1: cut.y0 });
      if (s.y1 > cut.y1) out.push({ x0: midX0, x1: midX1, y0: cut.y1, y1: s.y1 });
    }
    return out;
  }
  let working = segs;
  for (const c of cuts) {
    working = splitSeg(working, { x0: c.at - c.w / 2, x1: c.at + c.w / 2, y0: c.sill, y1: c.sill + c.h });
  }

  return (
    <group position={[cx, 0, cz]} rotation={[0, angle, 0]}>
      {working.map((s, i) => {
        const w = s.x1 - s.x0;
        const h = s.y1 - s.y0;
        const cxw = s.x0 + w / 2 - length / 2;
        const cyw = s.y0 + h / 2;
        return (
          <mesh key={i} position={[cxw, cyw, 0]}>
            <boxGeometry args={[w, h, thickness]} />
            <meshStandardMaterial color="#cdd3dc" roughness={0.97} />
          </mesh>
        );
      })}
      {cuts.map((c, i) =>
        c.kind === "window" ? (
          <mesh key={`gl-${i}`} position={[c.at - length / 2, c.sill + c.h / 2, 0]}>
            <boxGeometry args={[c.w, c.h, thickness * 0.2]} />
            <meshStandardMaterial color="#9ec5d8" transparent opacity={0.45} roughness={0.1} metalness={0} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}

function useDragProps(item: Item, onSelect: () => void, drag?: DragHandlers) {
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => drag?.down(item, e),
    onPointerMove: (e: ThreeEvent<PointerEvent>) => drag?.move(item, e),
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      drag?.up();
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect();
    },
  };
}

function CabinetMesh({
  item,
  selected,
  onSelect,
  finishHex,
  corner,
  lazySusan,
  diagonal,
  drag,
}: {
  item: Item;
  selected: boolean;
  onSelect: () => void;
  finishHex: string;
  corner?: boolean;
  lazySusan?: boolean;
  diagonal?: boolean;
  drag?: DragHandlers;
}) {
  const dragProps = useDragProps(item, onSelect, drag);
  if (item.scheduleOnly) return null;
  if (item.kind === "window" || item.kind === "door") return null;
  const w = item.rotation === 90 || item.rotation === 270 ? item.depth : item.width;
  const d = item.rotation === 90 || item.rotation === 270 ? item.width : item.depth;
  const h = item.height;
  const mountZ = item.mountZ ?? 0;
  const cx = item.x + w / 2;
  const cy = mountZ + h / 2;
  const cz = item.y + d / 2;
  const isAppliance = item.kind === "appliance";
  const isPanelPiece = item.kind === "panel" || item.kind === "filler";
  // OPPEIN carcasses are white; the door/panel/filler shows the finish colour.
  const WHITE_BOX = "#f4f3ef";
  const bodyColor = isAppliance ? "#aab2c0" : WHITE_BOX;
  const doorColor = isAppliance ? "#20242e" : finishHex;
  const panelColor = isAppliance ? "#2b2f3a" : darken(finishHex, 0.07);

  if (corner) {
    return (
      <CornerMesh
        item={item}
        selected={selected}
        bodyColor={bodyColor}
        doorColor={doorColor}
        lazySusan={lazySusan}
        dragProps={dragProps}
      />
    );
  }
  if (diagonal) {
    return (
      <DiagonalMesh
        item={item}
        selected={selected}
        bodyColor={bodyColor}
        doorColor={doorColor}
        dragProps={dragProps}
      />
    );
  }
  if (isPanelPiece) {
    // a finished panel/filler is the finish colour through-and-through
    return (
      <group position={[cx, cy, cz]} {...dragProps}>
        <mesh>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={finishHex} roughness={0.45} />
          <Edges threshold={15} color="#3a4150" />
        </mesh>
        {selected && (
          <mesh>
            <boxGeometry args={[w + 1, h + 1, d + 1]} />
            <meshBasicMaterial color="#2C327C" wireframe />
          </mesh>
        )}
      </group>
    );
  }
  // door faces: one slab for short cabinets, two stacked for tall (>60")
  const doorCount = !isAppliance && h > 60 ? 2 : 1;
  const reveal = 1; // gap between door and carcass edge
  const slabGap = 0.5; // gap between stacked doors
  const slabH = (h - reveal * 2 - slabGap * (doorCount - 1)) / doorCount;
  const doors = Array.from({ length: doorCount }, (_, i) => ({
    y: -(h / 2) + reveal + slabH / 2 + i * (slabH + slabGap),
    h: slabH,
  }));

  return (
    <group position={[cx, cy, cz]} {...dragProps}>
      {/* carcass (white box) */}
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={bodyColor} roughness={isAppliance ? 0.3 : 0.7} metalness={isAppliance ? 0.4 : 0} />
        <Edges threshold={15} color="#3a4150" />
      </mesh>
      {isAppliance ? (
        <mesh position={[0, 0, d / 2 - 0.05]}>
          <boxGeometry args={[w - 0.5, h - 0.5, 0.6]} />
          <meshStandardMaterial color={doorColor} roughness={0.25} metalness={0.5} />
          <Edges threshold={15} color="#3a4150" />
        </mesh>
      ) : (
        doors.map((dr, i) => (
          <group key={i} position={[0, dr.y, d / 2]}>
            {/* door slab, finish colour, proud of the carcass and inset (frame reveal) */}
            <mesh position={[0, 0, 0.25]}>
              <boxGeometry args={[w - reveal * 2, dr.h, 0.8]} />
              <meshStandardMaterial color={doorColor} roughness={0.45} />
              <Edges threshold={15} color="#3a4150" />
            </mesh>
            {/* recessed shaker centre panel (slightly darker + set back) */}
            {w > 9 && dr.h > 8 && (
              <mesh position={[0, 0, 0.15]}>
                <boxGeometry args={[w - reveal * 2 - 5, dr.h - 5, 0.7]} />
                <meshStandardMaterial color={darken(doorColor, 0.1)} roughness={0.55} />
                <Edges threshold={15} color="#3a4150" />
              </mesh>
            )}
          </group>
        ))
      )}
      {selected && (
        <mesh>
          <boxGeometry args={[w + 1.2, h + 1.2, d + 1.2]} />
          <meshBasicMaterial color="#2C327C" wireframe />
        </mesh>
      )}
    </group>
  );
}

function CornerMesh({
  item,
  selected,
  bodyColor,
  doorColor,
  lazySusan,
  dragProps,
}: {
  item: Item;
  selected: boolean;
  bodyColor: string;
  doorColor: string;
  lazySusan?: boolean;
  dragProps: ReturnType<typeof useDragProps>;
}) {
  const h = item.height;
  const mountZ = item.mountZ ?? 0;
  const S = item.width;
  const L = Math.min(24, S);
  const rad = (item.rotation * Math.PI) / 180;
  // two 24"-deep legs forming an L; box normals are always correct.
  const legs = [
    { w: S, d: L, cx: S / 2, cy: L / 2 }, // back leg (along width)
    { w: L, d: S, cx: L / 2, cy: S / 2 }, // side leg (along depth)
  ];
  // door faces sit on the two inner front edges of the L (facing the room)
  const doors = [
    { w: S - L, d: 0.6, cx: (S + L) / 2, cy: L - 0.3 }, // front of back leg, beyond the corner
    { w: 0.6, d: S - L, cx: L - 0.3, cy: (S + L) / 2 }, // front of side leg
  ];
  // rotate a local point about the footprint centre to match 2D
  const rot = (px: number, py: number) => {
    const dx = px - S / 2;
    const dy = py - S / 2;
    return [S / 2 + dx * Math.cos(rad) - dy * Math.sin(rad), S / 2 + dx * Math.sin(rad) + dy * Math.cos(rad)] as const;
  };
  return (
    <group position={[item.x, mountZ, item.y]} {...dragProps}>
      {legs.map((leg, i) => {
        const [rx, rz] = rot(leg.cx, leg.cy);
        return (
          <mesh key={i} position={[rx, h / 2, rz]} rotation={[0, -rad, 0]}>
            <boxGeometry args={[leg.w, h, leg.d]} />
            <meshStandardMaterial color={bodyColor} roughness={0.55} />
            <Edges threshold={15} color="#3a4150" />
          </mesh>
        );
      })}
      {/* door faces (bi-fold for lazy susan) on the inner front edges */}
      {doors.map((dr, i) => {
        const [rx, rz] = rot(dr.cx, dr.cy);
        return (
          <mesh key={`d${i}`} position={[rx, h / 2, rz]} rotation={[0, -rad, 0]}>
            <boxGeometry args={[dr.w, h - 0.5, dr.d]} />
            <meshStandardMaterial color={doorColor} roughness={0.4} />
          </mesh>
        );
      })}
      {lazySusan &&
        doors.map((dr, i) => {
          // hinge seam line down the middle of each door panel (bi-fold hint)
          const [rx, rz] = rot(dr.cx, dr.cy);
          return (
            <mesh key={`s${i}`} position={[rx, h / 2, rz]} rotation={[0, -rad, 0]}>
              <boxGeometry args={[dr.w > dr.d ? 0.3 : dr.w, h - 1, dr.d > dr.w ? 0.3 : dr.d]} />
              <meshStandardMaterial color={darken(doorColor, 0.18)} roughness={0.5} />
            </mesh>
          );
        })}
      {selected && (
        <mesh position={[S / 2, h / 2, S / 2]}>
          <boxGeometry args={[S + 1, h + 1, S + 1]} />
          <meshBasicMaterial color="#2C327C" wireframe />
        </mesh>
      )}
    </group>
  );
}

function DiagonalMesh({
  item,
  selected,
  bodyColor,
  doorColor,
  dragProps,
}: {
  item: Item;
  selected: boolean;
  bodyColor: string;
  doorColor: string;
  dragProps: ReturnType<typeof useDragProps>;
}) {
  const h = item.height;
  const mountZ = item.mountZ ?? 0;
  const legRun = item.width;
  const pts = diagonalPoints(legRun, item.rotation);
  const geo = useMemo(() => {
    // negate y + reverse to keep winding (normals) correct after laying flat
    const shp = pts.map(([x, y]) => [x, -y] as [number, number]).reverse();
    const shape = new THREE.Shape();
    shp.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legRun, item.rotation, h]);
  const [p1, p2] = [pts[1], pts[2]];
  const mx = (p1[0] + p2[0]) / 2;
  const mz = (p1[1] + p2[1]) / 2;
  const doorAng = -Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const doorLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) - 1;
  return (
    <group position={[item.x, mountZ, item.y]} {...dragProps}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={bodyColor} roughness={0.55} side={THREE.DoubleSide} />
        <Edges threshold={15} color="#3a4150" />
      </mesh>
      {/* door slab on the diagonal (hypotenuse) */}
      <mesh position={[mx, h / 2, mz]} rotation={[0, doorAng, 0]}>
        <boxGeometry args={[doorLen, h - 0.5, 0.6]} />
        <meshStandardMaterial color={doorColor} roughness={0.4} />
      </mesh>
      {selected && (
        <mesh geometry={geo}>
          <meshBasicMaterial color="#2C327C" wireframe />
        </mesh>
      )}
    </group>
  );
}
