import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  FileDown,
  FolderOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import { CATALOG } from "./data/catalog";
import {
  computeTotals,
  getSelectedLines,
  loadAutosave,
  saveAutosave,
  useStore,
} from "./store";
import type { Category, FinishOption } from "./types";
import { exportPdf } from "./utils/pdf";
import {
  deleteNamed,
  downloadProject,
  listSaved,
  readProjectFile,
  saveNamed,
} from "./utils/persistence";

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function App() {
  const store = useStore();
  const [activeCat, setActiveCat] = useState<string>(CATALOG[0].id);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const hydrated = useRef(false);

  // Load autosave once on mount.
  useEffect(() => {
    const doc = loadAutosave();
    if (doc) store.loadDocument(doc);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave whenever relevant state changes.
  useEffect(() => {
    if (!hydrated.current) return;
    saveAutosave(store.toDocument());
  }, [store.info, store.basePrice, store.selections, store.priceOverrides, store.discount]);

  const lines = useMemo(
    () => getSelectedLines(store.selections, store.priceOverrides),
    [store.selections, store.priceOverrides]
  );
  const totals = useMemo(
    () =>
      computeTotals({
        basePrice: store.basePrice,
        selections: store.selections,
        priceOverrides: store.priceOverrides,
        discount: store.discount,
      }),
    [store.basePrice, store.selections, store.priceOverrides, store.discount]
  );

  const category = CATALOG.find((c) => c.id === activeCat) ?? CATALOG[0];
  const isDesigner = store.mode === "designer";

  async function handleExport() {
    try {
      await exportPdf({
        info: store.info,
        basePrice: store.basePrice,
        lines,
        totals,
        discount: store.discount,
        mode: store.mode,
      });
    } catch (e) {
      alert("PDF export failed: " + (e as Error).message);
    }
  }

  return (
    <div className="app">
      <Header
        mode={store.mode}
        onMode={store.setMode}
        onExport={handleExport}
        onOpenLibrary={() => setLibraryOpen(true)}
      />

      <div className="layout">
        <CategoryNav
          active={activeCat}
          onSelect={setActiveCat}
          selections={store.selections}
        />

        <main className="options">
          <div className="cat-head">
            <h2>{category.name}</h2>
            {category.description && <p>{category.description}</p>}
            {category.multi && <span className="pill">Select any that apply</span>}
          </div>

          <div className="card-grid">
            {category.options.map((opt) => (
              <OptionCard
                key={opt.id}
                category={category}
                option={opt}
                selected={(store.selections[category.id] ?? []).includes(opt.id)}
                designer={isDesigner}
                override={store.priceOverrides[opt.id]}
                onToggle={() => store.toggleOption(category, opt.id)}
                onOverride={(p) => store.setOverride(opt.id, p)}
              />
            ))}
          </div>
        </main>

        <SummaryPanel totals={totals} lines={lines} designer={isDesigner} />
      </div>

      {libraryOpen && <LibraryModal onClose={() => setLibraryOpen(false)} />}
    </div>
  );
}

function Header(props: {
  mode: "designer" | "client";
  onMode: (m: "designer" | "client") => void;
  onExport: () => void;
  onOpenLibrary: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">R</span>
        <div>
          <strong>Robins Interiors &amp; Designs</strong>
          <span className="sub">Custom Home Finish Selections</span>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="mode-toggle" role="tablist" aria-label="Mode">
          <button
            className={props.mode === "designer" ? "on" : ""}
            onClick={() => props.onMode("designer")}
          >
            <UserCog size={15} /> Designer
          </button>
          <button
            className={props.mode === "client" ? "on" : ""}
            onClick={() => props.onMode("client")}
          >
            <Users size={15} /> Client
          </button>
        </div>
        <button className="btn ghost" onClick={props.onOpenLibrary}>
          <FolderOpen size={15} /> Projects
        </button>
        <button className="btn primary" onClick={props.onExport}>
          <FileDown size={15} /> Export PDF
        </button>
      </div>
    </header>
  );
}

function CategoryNav(props: {
  active: string;
  onSelect: (id: string) => void;
  selections: Record<string, string[]>;
}) {
  return (
    <nav className="catnav">
      {CATALOG.map((c) => {
        const count = (props.selections[c.id] ?? []).length;
        return (
          <button
            key={c.id}
            className={`catnav-item ${props.active === c.id ? "active" : ""}`}
            onClick={() => props.onSelect(c.id)}
          >
            <span>{c.name}</span>
            {count > 0 ? (
              <span className="check">
                <Check size={13} />
              </span>
            ) : (
              <span className="dot" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function OptionCard(props: {
  category: Category;
  option: FinishOption;
  selected: boolean;
  designer: boolean;
  override?: number;
  onToggle: () => void;
  onOverride: (price: number | null) => void;
}) {
  const { option } = props;
  const shownPrice = props.override ?? option.price;
  return (
    <div className={`card ${props.selected ? "selected" : ""}`}>
      <button className="card-img" onClick={props.onToggle} aria-pressed={props.selected}>
        <img src={option.image} alt={option.name} />
        {props.selected && (
          <span className="badge-check">
            <Check size={16} />
          </span>
        )}
        {option.pricing === "included" ? (
          <span className="price-tag included">Included</span>
        ) : (
          <span className="price-tag upgrade">+{money(shownPrice)}</span>
        )}
      </button>
      <div className="card-body">
        <strong>{option.name}</strong>
        {option.description && <p>{option.description}</p>}
        {props.designer && option.pricing === "upgrade" && (
          <label className="override">
            Override $
            <input
              type="number"
              value={shownPrice}
              min={0}
              onChange={(e) =>
                props.onOverride(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </label>
        )}
      </div>
    </div>
  );
}

function SummaryPanel(props: {
  totals: ReturnType<typeof computeTotals>;
  lines: ReturnType<typeof getSelectedLines>;
  designer: boolean;
}) {
  const store = useStore();
  const { totals } = props;
  return (
    <aside className="summary">
      <h3>Project</h3>
      <div className="fields">
        <Field label="Client" value={store.info.clientName} onChange={(v) => store.setInfo({ clientName: v })} />
        <Field label="Project" value={store.info.projectName} onChange={(v) => store.setInfo({ projectName: v })} />
        <Field label="Address" value={store.info.address} onChange={(v) => store.setInfo({ address: v })} />
        <Field label="Date" type="date" value={store.info.date} onChange={(v) => store.setInfo({ date: v })} />
        {props.designer && (
          <Field label="Sales Rep" value={store.info.salesRep} onChange={(v) => store.setInfo({ salesRep: v })} />
        )}
      </div>

      <h3>Selections ({props.lines.length})</h3>
      <ul className="line-list">
        {props.lines.length === 0 && <li className="muted">No selections yet.</li>}
        {props.lines.map((l) => (
          <li key={l.option.id}>
            <span>{l.option.name}</span>
            <span>{l.effectivePrice > 0 ? money(l.effectivePrice) : "—"}</span>
          </li>
        ))}
      </ul>

      <h3>Pricing</h3>
      <div className="totals">
        <div className="trow">
          <span>Base Package</span>
          {props.designer ? (
            <input
              className="inline-num"
              type="number"
              value={store.basePrice}
              min={0}
              onChange={(e) => store.setBasePrice(Number(e.target.value))}
            />
          ) : (
            <span>{money(store.basePrice)}</span>
          )}
        </div>
        <div className="trow">
          <span>Upgrades</span>
          <span>{money(totals.upgradesTotal)}</span>
        </div>
        <div className="trow">
          <span>Subtotal</span>
          <span>{money(totals.subtotal)}</span>
        </div>

        {props.designer && (
          <div className="discount-row">
            <input
              type="text"
              value={store.discount.label}
              onChange={(e) => store.setDiscount({ label: e.target.value })}
              aria-label="Discount label"
            />
            <select
              value={store.discount.type}
              onChange={(e) => store.setDiscount({ type: e.target.value as "percent" | "flat" })}
            >
              <option value="percent">%</option>
              <option value="flat">$</option>
            </select>
            <input
              type="number"
              value={store.discount.value}
              min={0}
              onChange={(e) => store.setDiscount({ value: Number(e.target.value) })}
              aria-label="Discount value"
            />
          </div>
        )}

        {totals.discountAmount > 0 && (
          <div className="trow discount">
            <span>
              {store.discount.label}
              {store.discount.type === "percent" ? ` (${store.discount.value}%)` : ""}
            </span>
            <span>- {money(totals.discountAmount)}</span>
          </div>
        )}

        <div className="trow grand">
          <span>Total</span>
          <span>{money(totals.grandTotal)}</span>
        </div>
      </div>
    </aside>
  );
}

function Field(props: {
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function LibraryModal(props: { onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState(store.info.projectName || store.info.clientName || "");
  const [, force] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = listSaved();

  function save() {
    const n = name.trim();
    if (!n) return alert("Enter a name to save this project.");
    saveNamed(n, store.toDocument());
    force((x) => x + 1);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await readProjectFile(file);
      store.loadDocument(doc);
      props.onClose();
    } catch (err) {
      alert("Could not open file: " + (err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Projects</h3>

        <div className="save-row">
          <input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn primary" onClick={save}>
            <Save size={15} /> Save
          </button>
        </div>

        <div className="lib-list">
          {saved.length === 0 && <p className="muted">No saved projects yet.</p>}
          {saved.map((entry) => (
            <div className="lib-item" key={entry.name}>
              <div>
                <strong>{entry.name}</strong>
                <span className="muted">
                  {new Date(entry.doc.savedAt).toLocaleString()}
                </span>
              </div>
              <div className="lib-actions">
                <button
                  className="btn ghost"
                  onClick={() => {
                    store.loadDocument(entry.doc);
                    props.onClose();
                  }}
                >
                  <FolderOpen size={14} /> Open
                </button>
                <button
                  className="btn ghost"
                  onClick={() => downloadProject(entry.doc, entry.name)}
                >
                  <Download size={14} />
                </button>
                <button
                  className="btn ghost danger"
                  onClick={() => {
                    deleteNamed(entry.name);
                    force((x) => x + 1);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import .json
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={onFile}
          />
          <button
            className="btn ghost"
            onClick={() => downloadProject(store.toDocument(), name || "selections")}
          >
            <Download size={15} /> Export current
          </button>
          <span className="spacer" />
          <button
            className="btn ghost danger"
            onClick={() => {
              if (confirm("Start a new blank project? Unsaved changes will be cleared."))
                store.reset();
              props.onClose();
            }}
          >
            <RotateCcw size={15} /> New / Reset
          </button>
          <button className="btn" onClick={props.onClose}>
            <Plus size={15} style={{ transform: "rotate(45deg)" }} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
