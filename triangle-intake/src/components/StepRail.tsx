import { Check } from "lucide-react";
import { useStore } from "../store";
import { stepDone } from "../utils/visibility";
import type { Step } from "../types";

// Left rail: the numbered path. Only in-play steps show; each marks done once
// it has an answer (optional/info/review steps never block). The progress bar
// at the top gives an at-a-glance sense of how far along the intake is.
export function StepRail({ steps }: { steps: Step[] }) {
  const catalog = useStore((s) => s.catalog);
  const project = useStore((s) => s.project);
  const activeStep = useStore((s) => s.activeStep);
  const setActiveStep = useStore((s) => s.setActiveStep);
  if (!catalog) return null;

  const answerable = steps.filter((s) => s.kind === "choose" && !s.optional);
  const done = answerable.filter((s) => (project.selections[s.id] ?? []).length > 0).length;
  const pct = answerable.length ? Math.round((done / answerable.length) * 100) : 0;

  return (
    <nav className="rail">
      <div className="rail-progress">
        <div className="rail-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="rail-progress-label">
        {done} of {answerable.length} required steps
      </div>
      <ol className="rail-steps">
        {steps.map((step, i) => {
          const isActive = step.id === activeStep;
          const chosen = (project.selections[step.id] ?? []).length > 0;
          const complete = step.kind === "choose" ? chosen : stepDone(step, project, catalog);
          return (
            <li key={step.id}>
              <button
                className={`rail-row${isActive ? " active" : ""}${complete ? " done" : ""}`}
                onClick={() => setActiveStep(step.id)}
              >
                <span className="rail-num">
                  {complete && !isActive ? <Check size={13} /> : i + 1}
                </span>
                <span className="rail-name">{step.nav || step.name}</span>
                {step.optional && step.kind === "choose" && !chosen && <span className="rail-opt">optional</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
