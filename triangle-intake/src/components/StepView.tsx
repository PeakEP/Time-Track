import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, Info, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { useCloud } from "../cloud";
import { visibleOptions, visibleSteps } from "../utils/visibility";
import { optionImage, isSwatch } from "../utils/swatch";
import { ReviewPanel } from "./ReviewPanel";
import type { Option, Step } from "../types";

const SPECIES_LABEL: Record<string, string> = {
  C: "Cherry", M: "Maple", O: "Oak", P: "Pine", W: "Walnut", WO: "White Oak Rift",
};

export function StepView({ steps, onExport }: { steps: Step[]; onExport: () => void }) {
  const catalog = useStore((s) => s.catalog);
  const activeStep = useStore((s) => s.activeStep);
  const setActiveStep = useStore((s) => s.setActiveStep);
  const project = useStore((s) => s.project);

  const idx = steps.findIndex((s) => s.id === activeStep);
  const step = idx >= 0 ? steps[idx] : steps[0];
  const prev = idx > 0 ? steps[idx - 1] : null;
  const next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;

  // Scroll to top when the step changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeStep]);

  if (!catalog || !step) return <main className="stage" />;

  const chosen = project.selections[step.id] ?? [];
  const needsAnswer = step.kind === "choose" && !step.optional && chosen.length === 0;

  return (
    <main className="stage" ref={scrollRef}>
      <div className="stage-inner">
        <div className="stage-head">
          <div className="stage-step">Step {idx + 1} of {steps.length}</div>
          <h2>{step.name}</h2>
          {step.subtitle && <p className="stage-sub">{step.subtitle}</p>}
          {step.help && (
            <div className="tip">
              <Info size={15} />
              <span>{step.help}</span>
            </div>
          )}
        </div>

        {step.kind === "info" && step.id === "project" && <ProjectForm />}
        {step.kind === "info" && step.id === "notes" && <NotesForm />}
        {step.kind === "choose" && <ChooseGrid step={step} />}
        {step.kind === "review" && <ReviewPanel steps={steps} onExport={onExport} onGoto={(id) => setActiveStep(id)} />}
      </div>

      <div className="stage-foot">
        <button className="btn-ghost" disabled={!prev} onClick={() => prev && setActiveStep(prev.id)}>
          <ArrowLeft size={15} /> Back
        </button>
        <span className="stage-foot-mid">
          {needsAnswer && <span className="foot-hint">Pick one to continue — or skip for now</span>}
        </span>
        {next ? (
          <button className={"btn-primary" + (needsAnswer ? "" : " glow")} onClick={() => setActiveStep(next.id)}>
            {step.kind === "choose" && step.optional && chosen.length === 0 ? (
              <><SkipForward size={15} /> Skip</>
            ) : (
              <>Next <ArrowRight size={15} /></>
            )}
          </button>
        ) : (
          <button className="btn-primary" onClick={onExport}>
            Export PDF
          </button>
        )}
      </div>
    </main>
  );
}

function ChooseGrid({ step }: { step: Step }) {
  const catalog = useStore((s) => s.catalog)!;
  const project = useStore((s) => s.project);
  const toggleOption = useStore((s) => s.toggleOption);
  const setActiveStep = useStore((s) => s.setActiveStep);
  const setNote = useStore((s) => s.setNote);
  const chosen = project.selections[step.id] ?? [];

  const options = useMemo(() => visibleOptions(step, project, catalog), [step, project, catalog]);

  // Auto-advance on a required single-select, so the intake keeps moving. The
  // target is recomputed from live state at fire time — selecting can reveal
  // new steps (e.g. construction → door style), so a step captured now would
  // be stale.
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  function advance() {
    const st = useStore.getState();
    if (!st.catalog) return;
    const vis = visibleSteps(st.catalog, st.project);
    const i = vis.findIndex((s) => s.id === step.id);
    if (i >= 0 && i < vis.length - 1) setActiveStep(vis[i + 1].id);
  }

  function pick(opt: Option) {
    const wasSelected = chosen.includes(opt.id);
    toggleOption(step.id, opt.id, !!step.multi);
    if (!step.multi && !step.optional && !wasSelected) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(advance, 420);
    }
  }

  // Group options under a divider when they carry a `group`.
  const groups = useMemo(() => {
    const map = new Map<string, Option[]>();
    for (const o of options) {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()];
  }, [options]);

  if (options.length === 0) {
    return <p className="empty-note">Nothing to choose here for the path so far — go Back if that's unexpected.</p>;
  }

  return (
    <>
      {step.multi && <span className="pill">Select any that apply</span>}
      {groups.map(([g, opts]) => (
        <div key={g || "_"}>
          {g && <div className="group-divider">{g}</div>}
          <div className="card-grid">
            {opts.map((opt) => (
              <OptionCard
                key={opt.id}
                opt={opt}
                step={step}
                selected={chosen.includes(opt.id)}
                onPick={() => pick(opt)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Per-step note the designer should see alongside the choice. */}
      <label className="step-note">
        <span>Add a note for the designer about this step (optional)</span>
        <input
          type="text"
          value={project.notes[step.id] ?? ""}
          placeholder="e.g. customer leaning this way but open to options"
          onChange={(e) => setNote(step.id, e.target.value)}
        />
      </label>
    </>
  );
}

function OptionCard({ opt, step, selected, onPick }: { opt: Option; step: Step; selected: boolean; onPick: () => void }) {
  const swatch = isSwatch(opt);
  const imgClass =
    "card-img" + (step.fit === "contain" ? " card-img--contain" : "") + (swatch ? " card-img--swatch" : "");
  return (
    <div className={`card ${selected ? "selected" : ""}`}>
      <button className={imgClass} onClick={onPick} aria-pressed={selected}>
        <img src={optionImage(opt)} alt={opt.name} loading="lazy" />
        {selected && (
          <span className="card-tick">
            <Check size={15} />
          </span>
        )}
      </button>
      <div className="card-body">
        <strong>{opt.name}</strong>
        {opt.species && opt.species.length > 0 && (
          <span className="card-species" title={opt.species.map((c) => SPECIES_LABEL[c] || c).join(", ")}>
            {opt.species.join(" · ")}
          </span>
        )}
        {opt.note && <p>{opt.note}</p>}
      </div>
    </div>
  );
}

function ProjectForm() {
  const meta = useStore((s) => s.project.meta);
  const patchMeta = useStore((s) => s.patchMeta);
  const me = useCloud((s) => s.me);

  // Prefill "taken by" with the signed-in employee once.
  useEffect(() => {
    if (me && !meta.employee) patchMeta({ employee: me.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <div className="form-grid">
      <Field label="Customer name" value={meta.client} onChange={(v) => patchMeta({ client: v })} placeholder="e.g. Jane Smith" wide />
      <Field label="Contact (phone / email)" value={meta.contact} onChange={(v) => patchMeta({ contact: v })} />
      <Field label="Date" type="date" value={meta.date} onChange={(v) => patchMeta({ date: v })} />
      <Field label="Project address" value={meta.address} onChange={(v) => patchMeta({ address: v })} wide />
      <SelectField
        label="Project type"
        value={meta.projectType}
        onChange={(v) => patchMeta({ projectType: v })}
        options={["", "New build", "Renovation", "Addition", "Secondary suite", "Other"]}
      />
      <Field label="Target timeline" value={meta.timeline} onChange={(v) => patchMeta({ timeline: v })} placeholder="e.g. install spring 2026" />
      <Field label="Designer" value={meta.designer} onChange={(v) => patchMeta({ designer: v })} />
      <Field label="Taken by (employee)" value={meta.employee} onChange={(v) => patchMeta({ employee: v })} />
    </div>
  );
}

function NotesForm() {
  const requests = useStore((s) => s.project.requests);
  const setRequests = useStore((s) => s.setRequests);
  return (
    <label className="notes-field">
      <span>Notes & special requests</span>
      <textarea
        rows={10}
        value={requests}
        placeholder="Layout quirks, must-haves, inspiration links, appliance notes, deadlines, anything the designer should know…"
        onChange={(e) => setRequests(e.target.value)}
      />
    </label>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, wide,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; wide?: boolean;
}) {
  return (
    <label className={"field" + (wide ? " field-wide" : "")}>
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "Select…"}
          </option>
        ))}
      </select>
    </label>
  );
}
