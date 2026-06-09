import { useRef, useState } from "react";
import { RotateCw, Copy, Trash2, X, GripHorizontal } from "lucide-react";
import { useStore } from "../store";
import type { Item, Rotation } from "../types";

/**
 * Floating inspector for the selected item — draggable by its header,
 * resizable, and scrollable so no field gets clipped.
 */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const items = useStore((s) => s.project.items);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const select = useStore((s) => s.select);
  const settings = useStore((s) => s.project.settings);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent) {
    const el = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    setPos({
      left: Math.max(4, e.clientX - dragRef.current.dx),
      top: Math.max(56, e.clientY - dragRef.current.dy),
    });
  }
  function onHeaderPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  if (!selectedId) return null;
  const item = items.find((i) => i.id === selectedId);
  if (!item || item.scheduleOnly) return null;

  const isOpening = item.kind === "window" || item.kind === "door";
  const isAppliance = item.kind === "appliance";
  const isCabinet = item.kind === "cabinet";
  const isPanel = item.kind === "panel" || item.kind === "filler";

  function patch(p: Partial<Item>) {
    if (!item) return;
    updateItem(item.id, p);
  }

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : {};

  return (
    <div className="inspector" style={style}>
      <header
        className="inspector-head"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <div className="inspector-grab">
          <GripHorizontal size={13} />
          <div>
            <div className="inspector-title">
              {item.label ?? item.sku ?? item.kind.toUpperCase()}
            </div>
            <div className="inspector-sub">{kindLabel(item)}</div>
          </div>
        </div>
        <button className="inspector-close" onClick={() => select(null)} title="Deselect">
          <X size={14} />
        </button>
      </header>
      <div className="inspector-body">
        <div className="inspector-row">
          <Field label="X (in)">
            <input
              type="number"
              step={0.125}
              value={Math.round(item.x * 1000) / 1000}
              onChange={(e) => patch({ x: +e.target.value })}
            />
          </Field>
          <Field label="Y (in)">
            <input
              type="number"
              step={0.125}
              value={Math.round(item.y * 1000) / 1000}
              onChange={(e) => patch({ y: +e.target.value })}
            />
          </Field>
        </div>
        <div className="inspector-row">
          <Field label="Width (in)">
            <input
              type="number"
              step={0.125}
              value={item.width}
              onChange={(e) => patch({ width: +e.target.value })}
            />
          </Field>
          <Field label="Depth (in)">
            <input
              type="number"
              step={0.125}
              value={item.depth}
              onChange={(e) => patch({ depth: +e.target.value })}
            />
          </Field>
        </div>
        <div className="inspector-row">
          <Field label="Height (in)">
            <input
              type="number"
              step={0.125}
              value={item.height}
              onChange={(e) => patch({ height: +e.target.value })}
            />
          </Field>
          <Field label="Bottom AFF (in)">
            <input
              type="number"
              step={0.125}
              value={item.mountZ ?? 0}
              onChange={(e) => patch({ mountZ: +e.target.value })}
            />
          </Field>
        </div>
        {isCabinet && (item.mountZ ?? 0) > 0 && (
          <div className="inspector-row">
            <Field label="Gap above counter (in)">
              <input
                type="number"
                value={Math.round(((item.mountZ ?? 0) - settings.counterHeight) * 10) / 10}
                onChange={(e) => patch({ mountZ: settings.counterHeight + (+e.target.value || 0) })}
              />
            </Field>
            <span />
          </div>
        )}
        {isOpening && item.kind === "window" && (
          <div className="inspector-row">
            <Field label="Sill height (in)">
              <input
                type="number"
                value={item.sillHeight ?? settings.counterHeight}
                onChange={(e) => patch({ sillHeight: +e.target.value })}
              />
            </Field>
            <span />
          </div>
        )}
        {isOpening && item.kind === "door" && (
          <div className="inspector-row">
            <Field label="Hinge">
              <select
                value={item.hingeSide ?? "left"}
                onChange={(e) => patch({ hingeSide: e.target.value as "left" | "right" })}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Swing">
              <select
                value={item.swing ?? "in"}
                onChange={(e) => patch({ swing: e.target.value as "in" | "out" })}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </Field>
          </div>
        )}
        {isAppliance && (
          <div className="inspector-row full">
            <Field label="Label">
              <input
                value={item.label ?? ""}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </Field>
          </div>
        )}
        {isPanel && (
          <div className="inspector-row full">
            <button
              className="btn-soft"
              onClick={() => patch({ width: item.height, height: item.width })}
              title="Swap which dimension is the plan length vs. the vertical height"
            >
              {item.height >= item.width ? "Lay flat (horizontal)" : "Stand up (vertical)"}
            </button>
          </div>
        )}
      </div>
      <footer className="inspector-foot">
        <button
          className="btn-soft"
          onClick={() =>
            patch({ rotation: (((item.rotation + 90) % 360) as Rotation) })
          }
          title="Rotate 90°"
        >
          <RotateCw size={13} /> Rotate
        </button>
        <button className="btn-soft" onClick={() => duplicateItem(item.id)} title="Duplicate">
          <Copy size={13} /> Duplicate
        </button>
        <button
          className="btn-soft danger"
          onClick={() => removeItem(item.id)}
          title="Delete"
        >
          <Trash2 size={13} /> Delete
        </button>
      </footer>
    </div>
  );
}

function kindLabel(item: Item): string {
  switch (item.kind) {
    case "cabinet":
      return item.sku ? `Cabinet · ${item.sku}` : "Cabinet";
    case "appliance":
      return "Appliance";
    case "window":
      return "Window";
    case "door":
      return "Door";
    case "filler":
      return "Filler";
    case "panel":
      return "Panel";
    case "accessory":
      return "Accessory";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="inspector-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
