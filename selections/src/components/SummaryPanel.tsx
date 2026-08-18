import { useMemo } from "react";
import { useStore } from "../store";
import { computeLines, computeTotals, formatCAD } from "../utils/pricing";

// Right pane: project details, running selection list, and the pricing rollup.
export function SummaryPanel() {
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const designer = useStore((s) => s.mode === "designer");
  const patchMeta = useStore((s) => s.patchMeta);
  const setBasePrice = useStore((s) => s.setBasePrice);
  const patchDiscount = useStore((s) => s.patchDiscount);

  const lines = useMemo(() => computeLines(project, catalog), [project, catalog]);
  const totals = useMemo(() => computeTotals(lines, project), [lines, project]);

  return (
    <aside className="summary">
      <section>
        <h3>Project</h3>
        <div className="fields">
          <Field label="Client" value={project.meta.client} onChange={(v) => patchMeta({ client: v })} />
          <Field label="Project" value={project.meta.project} onChange={(v) => patchMeta({ project: v })} />
          <Field label="Address" value={project.meta.address} onChange={(v) => patchMeta({ address: v })} />
          <Field label="Date" type="date" value={project.meta.date} onChange={(v) => patchMeta({ date: v })} />
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
            <li key={`${l.category.id}:${l.option.id}`}>
              <span>{l.option.name}</span>
              <span className="num">{l.price > 0 ? formatCAD(l.price) : "—"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Pricing</h3>
        <div className="totals">
          <div className="trow">
            <span>Base Package</span>
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
          <div className="trow">
            <span>Subtotal</span>
            <span className="num">{formatCAD(totals.subtotal)}</span>
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

          <div className="trow grand">
            <span>Total</span>
            <span className="num">{formatCAD(totals.total)}</span>
          </div>
        </div>
      </section>
    </aside>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
