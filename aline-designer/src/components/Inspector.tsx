import { RotateCw, Copy, Trash2, X, GripHorizontal } from "lucide-react";
import { useStore } from "../store";
import type { Item, Rotation } from "../types";
import { renderFinishOptions } from "../utils/finishOptions";

/**
 * Docked inspector for the selected item — pinned to the bottom-left of the
 * canvas, resizable, scrollable. Previously draggable by its header, but the
 * drag used viewport-relative pointer coords against an absolutely-positioned
 * panel and could fling it off-screen with no way back. Docking it removes the
 * whole class of bug.
 */
export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const items = useStore((s) => s.project.items);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const select = useStore((s) => s.select);
  const settings = useStore((s) => s.project.settings);
  const catalog = useStore((s) => s.catalog);

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

  return (
    <div className="inspector">
      <header className="inspector-head">
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
        {!isOpening && catalog && catalog.finishes.length > 1 && (
          <div className="inspector-row">
            <Field label="Finish (this item)">
              <select
                value={item.finishCode ?? ""}
                onChange={(e) => patch({ finishCode: e.target.value || undefined })}
                title="Override the project finish for this item only (two-tone designs)"
              >
                <option value="">(use project finish)</option>
                {renderFinishOptions(catalog.finishes)}
              </select>
            </Field>
            <span />
          </div>
        )}
        {!isOpening && (
          <div className="inspector-row">
            <Field label="Rotation">
              <select
                value={item.rotation}
                onChange={(e) => patch({ rotation: +e.target.value as Rotation })}
              >
                <option value={0}>0° (back to top wall)</option>
                <option value={90}>90° (back to left wall)</option>
                <option value={180}>180° (back to bottom wall)</option>
                <option value={270}>270° (back to right wall)</option>
              </select>
            </Field>
            <span />
          </div>
        )}
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
