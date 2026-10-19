import { useMemo } from "react";
import { useApp } from "../store";
import { stepsFor } from "../data/questions";
import { PROJECT_TYPE_LABEL } from "../types";
import { computeQuote } from "../engine/pricing";
import { money0, when } from "../utils/format";
import { FieldGrid } from "./Fields";
import RoomsStep from "./RoomsStep";
import ProductsStep from "./ProductsStep";
import DocumentsStep from "./DocumentsStep";
import ReviewStep from "./ReviewStep";
import CabinetsStep from "./CabinetsStep";

export default function QuoteEditor() {
  const { quote, step, setStep, settings, items, cabinetData, dirty, saving, saveError, conflict, save, takeTheirs, go, duplicateQuote, update, me, notify } = useApp();
  const steps = quote ? stepsFor(quote.type) : [];
  const calc = useMemo(() => (quote ? computeQuote(quote, settings, items, cabinetData) : null), [quote, settings, items, cabinetData]);
  if (!quote || !calc) return null;
  const s = steps[Math.min(step, steps.length - 1)];
  const open = calc.questions.length;
  const reviewIdx = steps.findIndex((x) => x.id === "review");
  const finalized = quote.status === "sent" || quote.status === "won" || quote.status === "lost";
  const locked = finalized && !me?.admin; // reps can't edit a finalized quote

  return (
    <div>
      <div className="quote-bar">
        <h2>{quote.answers.clientName || "New quote"}</h2>
        <span className="pill info">{PROJECT_TYPE_LABEL[quote.type]}</span>
        {quote.number && <span className="pill">{quote.number} · V{quote.version}</span>}
        <span className={`pill ${quote.status === "approved" ? "ok" : quote.status === "needs-approval" ? "warn" : ""}`}>{quote.status.replace("-", " ")}</span>
        <div className="spacer" />
        <span className={`status-line${saveError ? " bad" : ""}`}>
          {saveError ? saveError : saving ? "Saving…" : dirty ? "Unsaved changes" : quote.updatedAt ? `Saved ${when(quote.updatedAt)}` : ""}
        </span>
        {dirty && !saving && <button className="btn sm" onClick={() => save()}>Save now</button>}
        <button className="btn sm" onClick={duplicateQuote} title="Start a new quote from this one">Duplicate</button>
        <button className="btn sm" onClick={() => {
          update((q) => { q.version += 1; q.status = "draft"; });
          notify(`Now on V${quote.version + 1}. The approval is kept only if the total doesn't change.`);
        }} title="Start the next revision (V+1)" disabled={locked}>New version</button>
        <button className="btn sm ghost" onClick={() => go("list")}>Close</button>
      </div>

      {conflict && (
        <div className="banner bad">
          {saveError}
          <button className="btn sm" onClick={takeTheirs}>Load their version</button>
          <button className="btn sm danger" onClick={() => save(true)}>Keep mine (overwrite)</button>
        </div>
      )}

      {finalized && (
        <div className="banner info">
          This quote is finalized ({quote.status.replace("-", " ")}).{" "}
          {me?.admin ? (
            <>Editing is locked for the sales team.{" "}
              <button className="btn sm" onClick={() => { update((q) => { q.status = "draft"; }); notify("Reopened for editing — it's a draft again."); }}>Unlock for editing</button>
            </>
          ) : "Only an Admin can reopen it for editing or delete it."}
        </div>
      )}

      <div className="wizard">
        <aside className="steps">
          {steps.map((x, i) => (
            <button key={x.id} className={i === step ? "on" : ""} onClick={() => setStep(i)}>
              <span className="n">{i + 1}</span>{x.title}
            </button>
          ))}
          <div className="totals-mini">
            <span className="muted">Total incl. HST</span>
            <b>{money0(calc.totals.total)}</b>
            <span className="muted" style={{ display: "block", marginTop: 4 }}>Margin {(calc.totals.margin * 100).toFixed(1)}%</span>
            {open > 0
              ? <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setStep(reviewIdx)}>{open} question{open > 1 ? "s" : ""} to answer →</button>
              : calc.needsOwner ? <span className="pill warn">needs owner approval</span> : <span className="pill ok">ready to send</span>}
          </div>
        </aside>

        <section>
          <div className="step-head">
            <h2>{s.title}</h2>
            <p>{s.intro}</p>
          </div>
          <fieldset className="lockwrap" disabled={locked}>
            {s.fields.length > 0 && <div className="card"><FieldGrid fields={s.fields} /></div>}
            {s.id === "rooms" && <RoomsStep />}
            {s.id === "cabinets" && <CabinetsStep />}
            {s.id === "selections" && <ProductsStep />}
            {s.id === "documents" && <DocumentsStep />}
            {s.id === "review" && <ReviewStep calc={calc} />}
          </fieldset>
          <div className="step-foot">
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
            <div className="spacer" />
            {step < steps.length - 1 && <button className="btn primary" onClick={() => setStep(step + 1)}>Next: {steps[step + 1].title} →</button>}
          </div>
        </section>
      </div>
    </div>
  );
}
