import { useState } from "react";
import { useApp } from "../store";
import type { Question } from "../types";
import { stepsFor } from "../data/questions";
import CatalogPicker from "./CatalogPicker";

// "To finish this quote": every open question, answerable right here.
export default function QuestionsPanel({ questions }: { questions: Question[] }) {
  const { quote, update, setStep, me, settings, saveSettings, notify } = useApp();
  const [picking, setPicking] = useState<(Question & { kind: "price" }) | null>(null);
  if (!quote) return null;
  const steps = stepsFor(quote.type);
  const goto = (id: string) => { const i = steps.findIndex((s) => s.id === id); if (i >= 0) setStep(i); };

  if (!questions.length)
    return <div className="banner ok">Every question is answered — the quote is fully priced.</div>;

  return (
    <div className="card tight">
      <div className="card-head">
        <h3>To finish this quote</h3>
        <span className="pill warn">{questions.length} open</span>
      </div>
      <ol className="questions">
        {questions.map((q, i) => (
          <li key={i}>
            <div className="q">
              {q.kind === "price" ? <><b>{q.label}</b> — {q.why}.</>
                : q.kind === "rate" ? <>What does <b>{q.label.toLowerCase()}</b> cost you per {q.unit}? <span className="muted small">(no company rate yet · {q.lineIds.length} line{q.lineIds.length > 1 ? "s" : ""})</span></>
                : q.label}
            </div>
            <div className="a">
              {q.kind === "field" && <button className="btn sm" onClick={() => goto(q.step)}>Answer</button>}
              {q.kind === "cabinets" && <button className="btn sm" onClick={() => goto("cabinets")}>Price cabinets</button>}
              {q.kind === "rate" && (
                <Answer unit={`$ per ${q.unit}`} onSave={async (v, company) => {
                  if (company && me?.admin) {
                    const s = JSON.parse(JSON.stringify(settings));
                    const r = s.rates.find((x: { key: string }) => x.key === q.key);
                    if (r) r.value = v;
                    await saveSettings(s);
                    notify(`Saved as the company rate for ${q.label}.`);
                  } else update((x) => { x.rates[q.key] = v; });
                }} admin={!!me?.admin} hint="your cost" />
              )}
              {q.kind === "price" && (
                <>
                  <button className="btn sm" onClick={() => setPicking(q)}>Pick product</button>
                  <Answer unit={`$ per ${q.unit}`} onSave={(v) => update((x) => { x.overrides[q.lineId] = { ...x.overrides[q.lineId], unitCost: v }; })} hint="or enter the cost" />
                </>
              )}
              {q.kind === "cabinetSku" && (
                <>
                  {q.suggestions.map((sg) => (
                    <button key={sg} className="btn sm" title="Use this SKU" onClick={() => update((x) => {
                      const set = x.cabinetSets.find((c) => c.id === q.setId);
                      const ln = set?.lines.find((l) => l.sku === q.sku);
                      if (ln) ln.sku = sg;
                    })}>{sg}</button>
                  ))}
                  <button className="btn sm ghost" onClick={() => goto("cabinets")}>Edit list</button>
                  <Answer unit="$ each (your cost)" onSave={(v) => update((x) => { x.overrides[q.lineId] = { ...x.overrides[q.lineId], unitCost: v }; })} hint="or enter the cost" />
                </>
              )}
              {q.kind === "margin" && (
                <Answer unit="% margin" onSave={(v) => update((x) => { x.margins[q.key] = v / 100; })} hint="gross margin on sell" />
              )}
            </div>
          </li>
        ))}
      </ol>
      {picking && (
        <CatalogPicker
          title={`Pick the product for: ${picking.label.split(" — ")[0]}`}
          onClose={() => setPicking(null)}
          onPick={(it) => { if (it) update((x) => { x.overrides[picking.lineId] = { ...x.overrides[picking.lineId], catalogItemId: it.id }; }); setPicking(null); }}
        />
      )}
    </div>
  );
}

function Answer({ unit, onSave, hint, admin }: { unit: string; onSave: (v: number, company: boolean) => void | Promise<void>; hint: string; admin?: boolean }) {
  const [v, setV] = useState("");
  const [company, setCompany] = useState(false);
  const ok = v !== "" && Number(v) >= 0;
  return (
    <span className="row" style={{ gap: 6 }}>
      <input type="number" step="0.01" min={0} value={v} placeholder={hint} onChange={(e) => setV(e.target.value)} style={{ width: 150 }}
        onKeyDown={(e) => { if (e.key === "Enter" && ok) { void onSave(Number(v), company); setV(""); } }} />
      <span className="small muted">{unit}</span>
      {admin && <label className="check small"><input type="checkbox" checked={company} onChange={(e) => setCompany(e.target.checked)} /> company rate</label>}
      <button className="btn sm primary" disabled={!ok} onClick={() => { void onSave(Number(v), company); setV(""); }}>Save</button>
    </span>
  );
}
