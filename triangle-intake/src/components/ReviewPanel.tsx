import { useMemo } from "react";
import { AlertTriangle, FileDown, Pencil } from "lucide-react";
import { useStore } from "../store";
import { optionImage } from "../utils/swatch";
import { buildSummary, openSteps, verificationFlags } from "../utils/summary";
import type { Step } from "../types";

// Final screen: the whole intake at a glance, a nudge for any required steps
// still blank, the designer's confirm-before-ordering list, and Export.
export function ReviewPanel({
  steps, onExport, onGoto,
}: {
  steps: Step[];
  onExport: () => void;
  onGoto: (stepId: string) => void;
}) {
  const catalog = useStore((s) => s.catalog)!;
  const project = useStore((s) => s.project);

  const lines = useMemo(() => buildSummary(catalog, project), [catalog, project]);
  const open = useMemo(() => openSteps(catalog, project), [catalog, project]);
  const flags = useMemo(() => verificationFlags(catalog, project), [catalog, project]);

  return (
    <div className="review">
      {open.length > 0 && (
        <div className="review-open">
          <strong><AlertTriangle size={15} /> Still blank</strong>
          <p>These steps don't have a selection yet. You can still export — the designer will follow up — or fill them in:</p>
          <div className="chip-row">
            {open.map((s) => (
              <button key={s.id} className="chip" onClick={() => onGoto(s.id)}>
                {s.nav || s.name} <Pencil size={11} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="review-card">
        <div className="review-meta">
          <h3>{project.meta.client || "Unnamed customer"}</h3>
          <p className="muted">
            {[project.meta.projectType, project.meta.address, project.meta.timeline].filter(Boolean).join(" · ") || "No project details yet"}
          </p>
          <p className="muted">
            Designer: {project.meta.designer || "—"} · Taken by: {project.meta.employee || "—"} · {project.meta.date}
          </p>
        </div>

        <ul className="review-list">
          {lines.length === 0 && <li className="muted">No selections yet. Walk back through the steps to make choices.</li>}
          {lines.map((l) => (
            <li key={l.step.id} className="review-row">
              <button className="review-thumb" onClick={() => onGoto(l.step.id)} title={`Edit ${l.step.name}`}>
                <img src={optionImage(l.options[0] ?? { id: "", name: "", swatch: "#e6e2d8" })} alt="" />
              </button>
              <div className="review-row-body">
                <span className="review-step">{l.step.name}</span>
                <strong>{l.options.map((o) => o.name).join(", ") || "—"}</strong>
                {l.note && <em className="review-note">“{l.note}”</em>}
              </div>
              <button className="review-edit" onClick={() => onGoto(l.step.id)}>
                <Pencil size={13} />
              </button>
            </li>
          ))}
        </ul>

        {project.requests.trim() && (
          <div className="review-requests">
            <span className="review-step">Notes & special requests</span>
            <p>{project.requests}</p>
          </div>
        )}
      </div>

      <div className="review-flags">
        <strong>Designer verification — confirm before ordering</strong>
        <ul>
          {flags.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>

      <button className="btn-primary btn-big" onClick={onExport}>
        <FileDown size={16} /> Export PDF for the designer
      </button>
    </div>
  );
}
