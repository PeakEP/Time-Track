import { useState } from "react";
import {
  FolderOpen,
  Save,
  FilePlus,
  FileText,
  FileSpreadsheet,
  Square,
  Layout,
  LayoutPanelLeft,
  PanelTop,
  Box,
  ChevronDown,
  Settings as SettingsIcon,
  DoorClosed,
  Square as Window,
  Undo2,
  Redo2,
  Edit3,
} from "lucide-react";
import { useStore, clearDraft } from "../store";
import { rectangleRoom, lShapeRoom, uShapeRoom, edges } from "../utils/roomPresets";
import { openProject, saveProject, exportScheduleCsv } from "../utils/persistence";
import { exportProjectPdf } from "../utils/pdf";
import { computeLines, formatCAD } from "../utils/pricing";
import { makeId, itemDimsLabel } from "../utils/placement";
import { renderFinishOptions } from "../utils/finishOptions";
import { APPLIANCES } from "../data/appliances";
import type { AppliancePreset } from "../data/appliances";
import type { Item } from "../types";

export function SettingsBar() {
  const project = useStore((s) => s.project);
  const catalog = useStore((s) => s.catalog);
  const patchMeta = useStore((s) => s.patchMeta);
  const patchSettings = useStore((s) => s.patchSettings);
  const setRoom = useStore((s) => s.setRoom);
  const setProject = useStore((s) => s.setProject);
  const newProject = useStore((s) => s.newProject);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const addItem = useStore((s) => s.addItem);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const pastLen = useStore((s) => s.past.length);
  const futureLen = useStore((s) => s.future.length);
  const vertexEdit = useStore((s) => s.vertexEdit);
  const setVertexEdit = useStore((s) => s.setVertexEdit);
  const showPricing = useStore((s) => s.showPricing);

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showRoomDlg, setShowRoomDlg] = useState(false);
  const [showSettingsDlg, setShowSettingsDlg] = useState(false);
  const [showWindowDlg, setShowWindowDlg] = useState(false);
  const [showDoorDlg, setShowDoorDlg] = useState(false);

  async function onOpen() {
    const p = await openProject();
    if (p) setProject(p);
  }
  function onSave() {
    saveProject(project);
  }
  function onNew() {
    if (
      project.items.length > 0 &&
      !confirm("Start a new project? Unsaved changes in the current project will be lost.")
    )
      return;
    newProject();
    clearDraft();
  }
  function onExportPdf(mode: "client" | "internal") {
    if (!catalog) return;
    exportProjectPdf(project, catalog, mode, showPricing);
  }
  function addAppliance(a: AppliancePreset) {
    addItem({
      id: makeId(),
      kind: "appliance",
      x: 12,
      y: 12,
      rotation: 0,
      width: a.width,
      depth: a.depth,
      height: a.height,
      mountZ: a.mountZ,
      label: a.label,
    });
  }

  function onExportCsv() {
    if (!catalog) return;
    const lines = computeLines(project.items, catalog, project.settings);
    const rows = lines.map((l, i) => {
      const base: Record<string, string | number> = {
        "#": i + 1,
        SKU: l.item.sku ?? "",
        Description: l.product?.desc ?? "",
        Category: l.product?.cat ?? "",
        Dims: itemDimsLabel(l.item, l.product),
        Qty: l.qty,
        Finish: project.settings.finishCode,
        Box: project.settings.boxMaterial,
      };
      if (!showPricing) return base;
      return {
        ...base,
        "Unit List (CAD)": l.unitListPrice ?? "",
        "Line List (CAD)": l.lineList,
        "Line Cost (CAD)": l.lineList * (1 - catalog._meta.dealer_discount),
        "Line Client (CAD)": l.lineList * (1 - catalog._meta.dealer_discount) * project.settings.markup,
      };
    });
    exportScheduleCsv(rows, `JMRC-${(project.meta.name || "Untitled").replace(/[^a-z0-9\-_ ]/gi, "_")}-Schedule.csv`);
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-text">
          <span className="brand-title">JMRC</span>
          <span className="brand-sub">Cabinet Designer</span>
        </span>
      </div>

      <div className="meta-inline">
        <input
          value={project.meta.name}
          onChange={(e) => patchMeta({ name: e.target.value })}
          placeholder="Project name"
          className="meta-input wide"
        />
        <input
          value={project.meta.client}
          onChange={(e) => patchMeta({ client: e.target.value })}
          placeholder="Client"
          className="meta-input"
        />
      </div>

      <nav className="actions">
        <Menu
          label="File"
          isOpen={openMenu === "file"}
          onToggle={() => setOpenMenu(openMenu === "file" ? null : "file")}
        >
          <button onClick={() => { onNew(); setOpenMenu(null); }}><FilePlus size={14} /> New project</button>
          <button onClick={() => { onOpen(); setOpenMenu(null); }}><FolderOpen size={14} /> Open…</button>
          <button onClick={() => { onSave(); setOpenMenu(null); }}><Save size={14} /> Save</button>
          <hr />
          {showPricing ? (
            <>
              <button onClick={() => onExportPdf("client")}><FileText size={14} /> Export Client PDF</button>
              <button onClick={() => onExportPdf("internal")}><FileText size={14} /> Export Internal PDF</button>
            </>
          ) : (
            <button onClick={() => onExportPdf("client")}><FileText size={14} /> Export PDF (plan + schedule)</button>
          )}
          <button onClick={onExportCsv}><FileSpreadsheet size={14} /> Export Schedule CSV</button>
        </Menu>

        <Menu
          label="Room"
          isOpen={openMenu === "room"}
          onToggle={() => setOpenMenu(openMenu === "room" ? null : "room")}
        >
          <button onClick={() => { setRoom(rectangleRoom(144, 120)); setOpenMenu(null); }}>
            <Square size={14}/> Rectangle 12'×10'
          </button>
          <button onClick={() => { setRoom(lShapeRoom(168, 144, 60, 60)); setOpenMenu(null); }}>
            <Square size={14}/> L-Shape default
          </button>
          <button onClick={() => { setRoom(uShapeRoom(180, 144, 72, 60)); setOpenMenu(null); }}>
            <Square size={14}/> U-Shape default
          </button>
          <hr />
          <button onClick={() => { setShowRoomDlg(true); setOpenMenu(null); }}>Custom dimensions…</button>
          <button onClick={() => { setVertexEdit(!vertexEdit); setOpenMenu(null); }}>
            <Edit3 size={14}/> {vertexEdit ? "Exit vertex edit" : "Edit vertices"}
          </button>
        </Menu>

        <Menu
          label="Add"
          isOpen={openMenu === "add"}
          onToggle={() => setOpenMenu(openMenu === "add" ? null : "add")}
        >
          <button onClick={() => { setShowWindowDlg(true); setOpenMenu(null); }}>
            <Window size={14}/> Window…
          </button>
          <button onClick={() => { setShowDoorDlg(true); setOpenMenu(null); }}>
            <DoorClosed size={14}/> Door…
          </button>
          <hr />
          {APPLIANCES.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                addAppliance(a);
                setOpenMenu(null);
              }}
            >
              <Box size={14}/> {a.label}
            </button>
          ))}
        </Menu>

        <button
          className="icon-btn"
          onClick={() => undo()}
          disabled={pastLen === 0}
          title="Undo (Cmd/Ctrl-Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => redo()}
          disabled={futureLen === 0}
          title="Redo (Shift-Cmd/Ctrl-Z)"
        >
          <Redo2 size={15} />
        </button>
        <button className="icon-btn" onClick={() => setShowSettingsDlg(true)} title="Project settings">
          <SettingsIcon size={16}/>
        </button>

        <div className="view-toggle">
          <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")} title="2D plan (top-down)">
            <Layout size={14}/> Plan
          </button>
          <button className={view === "front" ? "active" : ""} onClick={() => setView("front")} title="2D front elevation">
            <PanelTop size={14}/> Front
          </button>
          <button className={view === "split" ? "active" : ""} onClick={() => setView("split")} title="Split plan + 3D">
            <LayoutPanelLeft size={14}/> Split
          </button>
          <button className={view === "3d" ? "active" : ""} onClick={() => setView("3d")} title="3D only">
            <Box size={14}/> 3D
          </button>
        </div>
      </nav>

      {showRoomDlg && <RoomDialog onClose={() => setShowRoomDlg(false)} />}
      {showSettingsDlg && <SettingsDialog onClose={() => setShowSettingsDlg(false)} />}
      {showWindowDlg && (
        <OpeningDialog
          kind="window"
          onClose={() => setShowWindowDlg(false)}
          onAdd={(w, h, sill) => {
            const placed = placeOnLongestWall(project.room, { width: w, depth: 6, kind: "window", height: h, sillHeight: sill });
            addItem(placed);
            setShowWindowDlg(false);
          }}
        />
      )}
      {showDoorDlg && (
        <OpeningDialog
          kind="door"
          onClose={() => setShowDoorDlg(false)}
          onAdd={(w, h, _, hinge, swing) => {
            const placed = placeOnLongestWall(project.room, { width: w, depth: 6, kind: "door", height: h });
            placed.hingeSide = hinge;
            placed.swing = swing;
            addItem(placed);
            setShowDoorDlg(false);
          }}
        />
      )}

      {/* hidden helper to swallow lint */}
      {formatCAD(0).length === 0 && null}
    </header>
  );
}

function placeOnLongestWall(
  room: { points: { x: number; y: number }[] },
  opening: { width: number; depth: number; height: number; kind: "window" | "door"; sillHeight?: number },
): Item {
  const ee = edges(room.points);
  let best = ee[0];
  let bestLen = -1;
  for (const e of ee) {
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
    if (len > bestLen) {
      bestLen = len;
      best = e;
    }
  }
  const len = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y);
  const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
  const dx = (best.b.x - best.a.x) / len;
  const dy = (best.b.y - best.a.y) / len;
  // top-left of opening: midpoint minus half-width along wall, with depth centered on wall line
  const tlx = mid.x - dx * (opening.width / 2) - (-dy) * (opening.depth / 2);
  const tly = mid.y - dy * (opening.width / 2) - dx * (opening.depth / 2);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // pick nearest 90° rotation
  const opts: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
  let rot: 0 | 90 | 180 | 270 = 0;
  let bestDiff = Infinity;
  for (const r of opts) {
    const d = Math.min(
      Math.abs(angleDeg - r),
      Math.abs(angleDeg - r + 360),
      Math.abs(angleDeg - r - 360),
    );
    if (d < bestDiff) {
      bestDiff = d;
      rot = r;
    }
  }
  return {
    id: makeId(),
    kind: opening.kind,
    x: tlx,
    y: tly,
    rotation: rot,
    width: opening.width,
    depth: opening.depth,
    height: opening.height,
    sillHeight: opening.sillHeight,
  };
}

function Menu({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`menu ${isOpen ? "open" : ""}`}>
      <button className="menu-trigger" onClick={onToggle}>
        {label} <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div className="menu-popover" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

function RoomDialog({ onClose }: { onClose: () => void }) {
  const setRoom = useStore((s) => s.setRoom);
  const [shape, setShape] = useState<"rect" | "l" | "u">("rect");
  const [w, setW] = useState(144);
  const [d, setD] = useState(120);
  const [nw, setNw] = useState(60);
  const [nd, setNd] = useState(60);
  function apply() {
    if (shape === "rect") setRoom(rectangleRoom(w, d));
    else if (shape === "l") setRoom(lShapeRoom(w, d, nw, nd));
    else setRoom(uShapeRoom(w, d, nw, nd));
    onClose();
  }
  return (
    <Dialog title="Room dimensions" onClose={onClose} onApply={apply}>
      <Field label="Shape">
        <select value={shape} onChange={(e) => setShape(e.target.value as "rect" | "l" | "u")}>
          <option value="rect">Rectangle</option>
          <option value="l">L-Shape</option>
          <option value="u">U-Shape</option>
        </select>
      </Field>
      <Field label="Overall width (in)">
        <input type="number" value={w} onChange={(e) => setW(+e.target.value)} />
      </Field>
      <Field label="Overall depth (in)">
        <input type="number" value={d} onChange={(e) => setD(+e.target.value)} />
      </Field>
      {shape !== "rect" && (
        <>
          <Field label="Notch width (in)">
            <input type="number" value={nw} onChange={(e) => setNw(+e.target.value)} />
          </Field>
          <Field label="Notch depth (in)">
            <input type="number" value={nd} onChange={(e) => setNd(+e.target.value)} />
          </Field>
        </>
      )}
    </Dialog>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.project.settings);
  const meta = useStore((s) => s.project.meta);
  const patchSettings = useStore((s) => s.patchSettings);
  const patchMeta = useStore((s) => s.patchMeta);
  const catalog = useStore((s) => s.catalog);
  const showPricing = useStore((s) => s.showPricing);
  const setShowPricing = useStore((s) => s.setShowPricing);
  return (
    <Dialog title="Project settings" onClose={onClose}>
      <h4>Job</h4>
      <Field label="Project name">
        <input value={meta.name} onChange={(e) => patchMeta({ name: e.target.value })} />
      </Field>
      <Field label="Client">
        <input value={meta.client} onChange={(e) => patchMeta({ client: e.target.value })} />
      </Field>
      <Field label="Address">
        <input value={meta.address} onChange={(e) => patchMeta({ address: e.target.value })} />
      </Field>
      <Field label="Job #">
        <input value={meta.jobNumber ?? ""} onChange={(e) => patchMeta({ jobNumber: e.target.value })} />
      </Field>
      <Field label="Date">
        <input type="date" value={meta.date} onChange={(e) => patchMeta({ date: e.target.value })} />
      </Field>

      <h4>Finish & box</h4>
      <Field label="Finish (bases + default)">
        <select
          value={settings.finishCode}
          onChange={(e) => patchSettings({ finishCode: e.target.value })}
        >
          {renderFinishOptions(catalog?.finishes ?? [])}
        </select>
      </Field>
      <Field label="Upper finish (two-tone, optional)">
        <select
          value={settings.upperFinishCode ?? ""}
          onChange={(e) =>
            patchSettings({ upperFinishCode: e.target.value || undefined })
          }
          title="When set, every wall-mounted cabinet uses this finish instead of the project finish. Per-item overrides in the Inspector still win."
        >
          <option value="">(same as project finish)</option>
          {renderFinishOptions(catalog?.finishes ?? [])}
        </select>
      </Field>
      <Field label="Box material">
        <select
          value={settings.boxMaterial}
          onChange={(e) => patchSettings({ boxMaterial: e.target.value as "PB" | "PLY" })}
        >
          <option value="PB">Particle Board</option>
          <option value="PLY">Plywood</option>
        </select>
      </Field>

      <h4>Heights (in)</h4>
      <Field label="Wall height">
        <input
          type="number"
          value={settings.wallHeight}
          onChange={(e) => patchSettings({ wallHeight: +e.target.value })}
        />
      </Field>
      <Field label="Counter height">
        <input
          type="number"
          value={settings.counterHeight}
          onChange={(e) => patchSettings({ counterHeight: +e.target.value })}
        />
      </Field>
      <Field label="Wall cabinet AFF">
        <input
          type="number"
          value={settings.wallCabinetAFF}
          onChange={(e) => patchSettings({ wallCabinetAFF: +e.target.value })}
        />
      </Field>
      <Field label="Gap above counter">
        <input
          type="number"
          value={Math.round((settings.wallCabinetAFF - settings.counterHeight) * 10) / 10}
          onChange={(e) =>
            patchSettings({ wallCabinetAFF: settings.counterHeight + (+e.target.value || 0) })
          }
        />
      </Field>
      <div className="settings-note">
        Default 18" gap (uppers at 54" AFF over a 36" counter) is the standard backsplash
        height. Set 24" for taller clearances. You can also adjust the gap per-cabinet while
        placing it.
      </div>

      <h4>Pricing</h4>
      <Field label="Show pricing">
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={showPricing}
            onChange={(e) => setShowPricing(e.target.checked)}
          />
          <span>{showPricing ? "Prices shown in app & exports" : "Prices hidden everywhere"}</span>
        </label>
      </Field>
      <Field label="Markup multiplier">
        <input
          type="number"
          step="0.05"
          value={settings.markup}
          onChange={(e) => patchSettings({ markup: +e.target.value })}
        />
      </Field>
      <Field label="HST rate">
        <input
          type="number"
          step="0.01"
          value={settings.hstRate}
          onChange={(e) => patchSettings({ hstRate: +e.target.value })}
        />
      </Field>
    </Dialog>
  );
}

function OpeningDialog({
  kind,
  onClose,
  onAdd,
}: {
  kind: "window" | "door";
  onClose: () => void;
  onAdd: (w: number, h: number, sill: number, hinge?: "left" | "right", swing?: "in" | "out") => void;
}) {
  const [w, setW] = useState(kind === "door" ? 32 : 36);
  const [h, setH] = useState(kind === "door" ? 80 : 48);
  const [sill, setSill] = useState(36);
  const [hinge, setHinge] = useState<"left" | "right">("left");
  const [swing, setSwing] = useState<"in" | "out">("in");
  return (
    <Dialog
      title={`Add ${kind}`}
      onClose={onClose}
      onApply={() => onAdd(w, h, sill, hinge, swing)}
      applyLabel="Add"
    >
      <Field label="Width (in)">
        <input type="number" value={w} onChange={(e) => setW(+e.target.value)} />
      </Field>
      <Field label="Height (in)">
        <input type="number" value={h} onChange={(e) => setH(+e.target.value)} />
      </Field>
      {kind === "window" && (
        <Field label="Sill height AFF (in)">
          <input type="number" value={sill} onChange={(e) => setSill(+e.target.value)} />
        </Field>
      )}
      {kind === "door" && (
        <>
          <Field label="Hinge side">
            <select value={hinge} onChange={(e) => setHinge(e.target.value as "left" | "right")}>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </Field>
          <Field label="Swing">
            <select value={swing} onChange={(e) => setSwing(e.target.value as "in" | "out")}>
              <option value="in">In</option>
              <option value="out">Out</option>
            </select>
          </Field>
        </>
      )}
    </Dialog>
  );
}

function Dialog({
  title,
  children,
  onClose,
  onApply,
  applyLabel,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onApply?: () => void;
  applyLabel?: string;
}) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">{title}</div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {onApply && (
            <button className="btn-primary" onClick={onApply}>
              {applyLabel ?? "Apply"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
