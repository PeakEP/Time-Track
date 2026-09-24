import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useCloud } from "../cloud";
import { computeLines, computeTotals, formatCAD } from "../utils/pricing";

// Right pane: project details, running selection list, and the pricing rollup.
// On phones it collapses to a bar (count + total) that opens as a bottom sheet,
// so the finish cards get the screen.
export function SummaryPanel() {
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const designer = useStore((s) => s.mode === "designer");
  // Clients can't edit project details (the server ignores it anyway).
  const readOnly = useCloud((s) => s.me?.kind === "customer");
  const patchMeta = useStore((s) => s.patchMeta);
  const setBasePrice = useStore((s) => s.setBasePrice);
  const patchDiscount = useStore((s) => s.patchDiscount);

  const lines = useMemo(() => computeLines(project, catalog), [project, catalog]);
  const totals = useMemo(() => computeTotals(lines, project), [lines, project]);
  const [open, setOpen] = useState(false);

  return (
    <aside className={"summary" + (open ? " is-open" : "")}>
      <button type="button" className="summary-bar" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="summary-bar-count">
          {lines.length} selection{lines.length === 1 ? "" : "s"}
        </span>
        <strong>{formatCAD(totals.total)}</strong>
        <span className="summary-bar-hint">{open ? "Hide ▾" : "Details ▴"}</span>
      </button>
      <div className="summary-body">
      <section>
        <h3>Project</h3>
        <div className="fields">
          <Field label="Client" value={project.meta.client} onChange={(v) => patchMeta({ client: v })} readOnly={readOnly} />
          <Field label="Project" value={project.meta.project} onChange={(v) => patchMeta({ project: v })} readOnly={readOnly} />
          <Field label="Address" value={project.meta.address} onChange={(v) => patchMeta({ address: v })} readOnly={readOnly} />
          <Field label="Date" type="date" value={project.meta.date} onChange={(v) => patchMeta({ date: v })} readOnly={readOnly} />
          {designer && (
            <Field label="Sales Rep" value={project.meta.salesRep} onChange={(v) => patchMeta({ salesRep: v })} />
          )}
        </div>
      </section>

      <section>
        <h3>Selections ({lines.length})</h3>
        <ul className="line-list">
          {lines.length === 0 && <li className="muted">No selections yet.</li>}
          {lines.map((l) => (
            <li key={`${l.category.id}:${l.slotLabel ?? ""}:${l.option.id}`}>
              <span className="line-name">
                <em className="cat-label">
                  {l.category.name}
                  {l.slotLabel ? ` — ${l.slotLabel}` : ""}:{" "}
                </em>
                {l.option.name}
                {l.option.pricing === "upgrade" && l.unit === "sqft" && (
                  <em className="qty-note">{l.quantity > 0 ? ` · ${l.quantity} sf` : " · enter sf"}</em>
                )}
                {l.unit === "each" && l.quantity !== 1 && (
                  <em className="qty-note">{` · ×${l.quantity}`}</em>
                )}
              </span>
              <span className="num">
                {l.option.tbd ? "TBD" : l.lineTotal > 0 ? formatCAD(l.lineTotal) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Pricing</h3>
        <div className="totals">
          <div className="trow">
            <span>Base Package <em className="tax-note">incl. HST</em></span>
            {designer ? (
              <input
                className="num-input"
                type="number"
                min={0}
                value={project.basePrice}
                onChange={(e) => setBasePrice(Number(e.target.value))}
              />
            ) : (
              <span className="num">{formatCAD(project.basePrice)}</span>
            )}
          </div>
          <div className="trow">
            <span>Upgrades</span>
            <span className="num">{formatCAD(totals.upgrades)}</span>
          </div>

          {designer && (
            <div className="discount-row">
              <input
                type="text"
                aria-label="Discount label"
                value={project.discount.label}
                onChange={(e) => patchDiscount({ label: e.target.value }, { snapshot: false })}
              />
              <select
                aria-label="Discount type"
                value={project.discount.type}
                onChange={(e) => patchDiscount({ type: e.target.value as "percent" | "flat" })}
              >
                <option value="percent">%</option>
                <option value="flat">$</option>
              </select>
              <input
                type="number"
                min={0}
                aria-label="Discount value"
                value={project.discount.value}
                onChange={(e) => patchDiscount({ value: Number(e.target.value) })}
              />
            </div>
          )}

          {totals.discount > 0 && (
            <div className="trow discount">
              <span>
                {project.discount.label}
                {project.discount.type === "percent" ? ` (${project.discount.value}%)` : ""}
              </span>
              <span className="num">- {formatCAD(totals.discount)}</span>
            </div>
          )}

          <div className="trow">
            <span>HST (15%) on upgrades</span>
            <span className="num">{formatCAD(totals.hst)}</span>
          </div>

          <div className="trow grand">
            <span>Total</span>
            <span className="num">{formatCAD(totals.total)}</span>
          </div>
        </div>
      </section>
      </div>
    </aside>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
