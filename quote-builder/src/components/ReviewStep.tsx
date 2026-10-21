import { useMemo, useState } from "react";
import { useApp } from "../store";
import { MARGIN_LABEL, type LineKind, type MarginKey, type ManualLine, type PricedLine, type Question, type ReviewItem, type Totals } from "../types";
import { approvalValid, canSend, marginBreakdown, type computeQuote } from "../engine/pricing";
import QuestionsPanel from "./QuestionsPanel";
import { buildProposal, costCsv, fileName } from "../utils/proposalDocx";
import { download, loadFolderHandle, writeToFolder } from "../utils/files";
import { uid, unitOptions } from "../data/questions";
import CatalogPicker from "./CatalogPicker";
import { itemLabel } from "../engine/catalog";
import { money, pct, when } from "../utils/format";

type Calc = ReturnType<typeof computeQuote>;

const SOURCE: Record<string, [string, string]> = {
  catalog: ["catalog", "ok"], square: ["Square", "ok"], rate: ["rate", "info"], quote: ["supplier quote", "info"],
  manual: ["entered", "warn"], repRate: ["entered rate", "warn"], cabinet: ["cabinet catalog", "ok"], unpriced: ["no price", "bad"],
};

export default function ReviewStep({ calc }: { calc: Calc }) {
  const { quote, update, settings, me, approve, assignNumber, save, notify } = useApp();
  const [picking, setPicking] = useState<PricedLine | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<ManualLine | null>(null);
  const showCost = true;
  const sections = useMemo(() => {
    const m = new Map<string, PricedLine[]>();
    for (const l of calc.lines) m.set(l.section, [...(m.get(l.section) || []), l]);
    return [...m.entries()];
  }, [calc.lines]);
  if (!quote) return null;
  const { totals, issues } = calc;
  const approved = approvalValid(quote, totals.total);
  const canExport = canSend(quote, calc);
  const mb = marginBreakdown(calc.lines);
  const removed = Object.entries(quote.overrides).filter(([, o]) => o.removed).map(([id]) => id);
  const issueFor = (id: string) => issues.find((i) => i.lineId === id && i.level === "block") ? "blocked" : issues.find((i) => i.lineId === id && i.level === "warn") ? "flagged" : "";

  async function exportProposal() {
    setBusy(true);
    try {
      if (!quote!.number) await assignNumber();
      const q = useApp.getState().quote!;
      const blob = await buildProposal(q, settings, calc.lines, totals);
      const name = fileName(q);
      download(blob, name);
      if (q.folderName) {
        const h = await loadFolderHandle(q.id).catch(() => undefined);
        if (h) await writeToFolder(h, name, blob).then(() => notify(`Saved to ${q.folderName}/Quotes/${name}`)).catch((e) => notify(e.message, true));
      }
      update((x) => { if (x.status !== "won" && x.status !== "lost") x.status = "sent"; });
      await save();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review-grid">
      <div className="stack">
        {approved && <div className="banner ok">Approved by {quote.approval!.by} {when(quote.approval!.at)}{quote.approval!.note ? ` — “${quote.approval!.note}”` : ""}.</div>}
        {!approved && quote.approval && <div className="banner warn">The total changed since {quote.approval.by} approved it ({money(quote.approval.totalAtApproval)}) — it needs approving again.</div>}
        <QuestionsPanel questions={calc.questions} />
        {calc.needsOwner && !approved && (
          <div className="banner warn">
            This quote is outside company policy (margin or size) and needs the owner's approval.
            {!me?.admin && quote.status !== "needs-approval" && (
              <button className="btn sm" onClick={() => { update((q) => { q.status = "needs-approval"; }); notify("Sent for approval — it shows on the owner's quote list."); }}>Request approval</button>
            )}
            {!me?.admin && quote.status === "needs-approval" && <span className="pill warn">waiting for approval</span>}
          </div>
        )}

        {issues.length > 0 && (
          <div className="card tight">
            <h3>Check before sending</h3>
            <ul className="issues">
              {issues.map((i, n) => (
                <li key={n}>
                  <span className={`pill ${i.level === "block" ? "bad" : i.level === "warn" ? "warn" : "info"}`}>{i.level === "block" ? (i.owner ? "owner" : "to do") : i.level}</span>
                  <span>{i.message}</span>
                  {i.lineId && <button className="btn sm ghost" onClick={() => document.getElementById(`line-${i.lineId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>Show</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card tight scroll-x">
          <div className="card-head">
            <h3>Takeoff &amp; pricing</h3>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setAdding({ id: uid(), section: "Additional Items", kind: "material", description: "", qty: 1, unit: "EA", unitCost: null })}>+ Add a line</button>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Item</th><th className="num">Qty</th><th>Unit</th>
                {showCost && <th className="num">Unit cost</th>}
                {showCost && <th className="num">Cost</th>}
                <th className="num">Margin</th><th className="num">Sell</th><th>Source</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sections.map(([sec, ls]) => (
                <SectionRows key={sec} name={sec} lines={ls} showCost={showCost} cls={issueFor}
                  onQty={(l, v) => update((q) => { if (q.manualLines.find((m) => m.id === l.id)) q.manualLines.find((m) => m.id === l.id)!.qty = v; else q.overrides[l.id] = { ...q.overrides[l.id], qty: v }; })}
                  onCost={(l, v) => update((q) => { if (q.manualLines.find((m) => m.id === l.id)) q.manualLines.find((m) => m.id === l.id)!.unitCost = v; else q.overrides[l.id] = { ...q.overrides[l.id], unitCost: v }; })}
                  onPick={(l) => setPicking(l)}
                  onMargin={(l, v) => update((q) => { const o = { ...q.overrides[l.id] }; if (v == null) delete o.margin; else o.margin = v; q.overrides[l.id] = o; })}
                  onRemove={(l) => update((q) => { if (q.manualLines.some((m) => m.id === l.id)) q.manualLines = q.manualLines.filter((m) => m.id !== l.id); else q.overrides[l.id] = { ...q.overrides[l.id], removed: true }; })}
                  onReset={(l) => update((q) => { delete q.overrides[l.id]; })}
                  edited={(id) => !!quote.overrides[id]}
                />
              ))}
            </tbody>
          </table>
          {removed.length > 0 && (
            <p className="small muted" style={{ marginTop: 8 }}>
              {removed.length} line(s) removed. <button className="btn sm ghost" onClick={() => update((q) => { removed.forEach((id) => { const o = { ...q.overrides[id] }; delete o.removed; q.overrides[id] = o; }); })}>Put them back</button>
            </p>
          )}
        </div>
      </div>

      <div className="sticky-side stack">
        <div className="card">
          <h3>Price</h3>
          <table className="totals">
            <tbody>
              {showCost && <>
                <tr><td>Materials</td><td>{money(totals.material)}</td></tr>
                <tr><td>Labour</td><td>{money(totals.labour)}</td></tr>
                <tr><td>Sub-trades</td><td>{money(totals.sub)}</td></tr>
                <tr><td>Allowances &amp; quotes</td><td>{money(totals.allowance)}</td></tr>
                <tr><td><b>Cost</b></td><td><b>{money(totals.cost)}</b></td></tr>
                <tr><td>Sell before fees</td><td>{money(totals.sellBeforeFees)}</td></tr>
              </>}
              {totals.pmFee > 0 && <tr><td>Project management ({pct(settings.pricing.pmFeeNewBuild)})</td><td>{money(totals.pmFee)}</td></tr>}
              {totals.contingency > 0 && <tr><td>Contingency</td><td>{money(totals.contingency)}</td></tr>}
              <tr><td>Subtotal (ex. HST)</td><td>{money(totals.subtotal)}</td></tr>
              <tr><td>HST ({pct(settings.pricing.hst)})</td><td>{money(totals.hst)}</td></tr>
              <tr className="grand"><td>Total</td><td>{money(totals.total)}</td></tr>
              {showCost && <tr><td className="muted">Gross margin</td><td className="muted">{pct(totals.margin)}</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Margin</h3>
          <table className="totals">
            <tbody>
              {mb.map((m) => {
                const cur = quote.margins[m.key];
                return (
                  <tr key={m.key}>
                    <td className="small">{MARGIN_LABEL[m.key]}<div className="muted">{money(m.cost)} → {money(m.sell)}</div></td>
                    <td>
                      <div className="unit-input" style={{ justifyContent: "flex-end" }}>
                        <input className="margin-input" type="number" step="0.5" placeholder={(m.margin * 100).toFixed(1)}
                          value={cur == null ? "" : Math.round(cur * 1000) / 10}
                          onChange={(e) => update((q) => { if (e.target.value === "") delete q.margins[m.key as MarginKey]; else q.margins[m.key as MarginKey] = Number(e.target.value) / 100; })} />
                        <em>%</em>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="grand"><td>Overall</td><td>{pct(totals.margin)}</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 6 }}>Blank = company margins ({settings.pricing.minMargin != null ? `minimum ${pct(settings.pricing.minMargin)} overall` : "no minimum set"}). Type a % to set this quote's margin for a category; set one line on the line itself.</p>
        </div>

        <div className="card stack">
          <h3>Proposal</h3>
          <button className="btn primary" disabled={!canExport || busy} onClick={exportProposal}>
            {busy ? "Building…" : `Download ${quote.type === "shop" || quote.type === "custom-home" ? "proposal" : "quotation"} (.docx)`}
          </button>
          {!canExport && <p className="small muted">{calc.repBlocks ? "Answer the open questions above to download the client copy." : "Needs the owner's approval (margin or size)."}</p>}
          {canExport && quote.folderName && <p className="small muted">Also saved to {quote.folderName}/Quotes.</p>}
          {showCost && (
            <button className="btn" onClick={() => download(new Blob([costCsv(quote, calc.lines, totals)], { type: "text/csv" }), fileName(quote).replace(/\.docx$/, "_COSTS.csv"))}>
              Internal cost breakdown (.csv)
            </button>
          )}
          <label className="field"><span>Status</span>
            <select value={quote.status} onChange={(e) => update((q) => { q.status = e.target.value as typeof q.status; })}>
              {["draft", "needs-approval", ...(me?.admin || quote.status === "approved" ? ["approved"] : []), "sent", "won", "lost"].map((s) => <option key={s} value={s}>{s.replace("-", " ")}</option>)}
            </select>
          </label>
          {!me?.admin && !approved && quote.status !== "needs-approval" && !["sent", "won", "lost"].includes(quote.status) && (
            <button className="btn accent" onClick={async () => {
              update((q) => { q.status = "needs-approval"; });
              try { await save(); notify("Handed off to the approver — they'll see it when they log in."); }
              catch (e) { notify((e as Error).message, true); }
            }}>Submit for approval →</button>
          )}
          {!me?.admin && quote.status === "needs-approval" && <p className="small muted">✓ Submitted — waiting on the approver.</p>}
        </div>

        {me?.admin && (
          <div className="card stack">
            <h3>Owner approval</h3>
            <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row">
              <button className="btn accent" onClick={() => approve(note).then(() => notify("Approved.")).catch((e) => notify(e.message, true))}>Approve at {money(totals.total)}</button>
              {quote.approval && <button className="btn sm ghost" onClick={() => approve("", true).catch((e) => notify(e.message, true))}>Withdraw</button>}
            </div>
            <p className="small muted">Approval holds as long as the total stays the same.</p>
          </div>
        )}
      </div>

      {picking && (
        <CatalogPicker
          title={`Choose the item for: ${picking.description.split(" — ")[0]}`}
          initial=""
          onClose={() => setPicking(null)}
          onPick={(it) => {
            if (it) update((q) => {
              const m = q.manualLines.find((x) => x.id === picking.id);
              if (m) { m.catalogItemId = it.id; m.description = itemLabel(it); m.unit = it.unit; m.unitCost = it.unitCost; }
              else q.overrides[picking.id] = { ...q.overrides[picking.id], catalogItemId: it.id };
            });
            setPicking(null);
          }}
        />
      )}
      {adding && <AddLine line={adding} onClose={() => setAdding(null)} onAdd={(l) => { update((q) => { q.manualLines.push(l); }); setAdding(null); }} />}
    </div>
  );
}

function SectionRows({ name, lines, showCost, cls, onQty, onCost, onPick, onRemove, onReset, edited, onMargin }: {
  onMargin: (l: PricedLine, v: number | null) => void;
  name: string; lines: PricedLine[]; showCost: boolean; cls: (id: string) => string;
  onQty: (l: PricedLine, v: number) => void; onCost: (l: PricedLine, v: number | null) => void;
  onPick: (l: PricedLine) => void; onRemove: (l: PricedLine) => void; onReset: (l: PricedLine) => void; edited: (id: string) => boolean;
}) {
  const sell = lines.reduce((a, l) => a + l.sell, 0);
  return (
    <>
      <tr className="sect"><td colSpan={showCost ? 6 : 4}>{name}</td><td className="num">{money(sell)}</td><td colSpan={2}></td></tr>
      {lines.map((l) => {
        const [srcLabel, srcCls] = SOURCE[l.source] || [l.source, ""];
        return (
          <tr key={l.id} id={`line-${l.id}`} className={cls(l.id)}>
            <td>
              {l.description}
              {l.basis && <div className="basis">{l.basis}</div>}
              {l.flags.filter((f) => f !== "manual line").length > 0 && <div>{l.flags.filter((f) => f !== "manual line").map((f) => <span key={f} className="pill warn" style={{ marginRight: 4 }}>{f}</span>)}</div>}
            </td>
            <td className="num"><input type="number" step="any" min={0} value={l.qty} style={{ width: 80 }} onChange={(e) => onQty(l, Number(e.target.value) || 0)} /></td>
            <td>{l.unit}</td>
            {showCost && (
              <td className="num">
                <input type="number" step="0.01" min={0} value={l.unitCost ?? ""} placeholder="—" style={{ width: 90 }}
                  onChange={(e) => onCost(l, e.target.value === "" ? null : Number(e.target.value))} />
              </td>
            )}
            {showCost && <td className="num">{l.unitCost == null ? "—" : money(l.extCost)}</td>}
            <td className="num">
              <div className="unit-input" style={{ justifyContent: "flex-end" }}>
                <input className="margin-input" type="number" step="0.5" title={l.marginFrom === "retail" ? "store retail price" : l.marginFrom === "line" ? "set on this line" : `from the ${l.marginFrom} margin`}
                  value={l.marginFrom === "line" ? Math.round(l.margin * 1000) / 10 : ""} placeholder={(l.margin * 100).toFixed(1)}
                  onChange={(e) => onMargin(l, e.target.value === "" ? null : Number(e.target.value) / 100)} />
                <em>%</em>
              </div>
            </td>
            <td className="num">{l.unitCost == null ? "—" : money(l.sell)}</td>
            <td><span className={`pill ${srcCls}`}>{srcLabel}</span></td>
            <td style={{ whiteSpace: "nowrap" }}>
              {(l.kind === "material") && <button className="btn sm ghost" title="Pick a different catalog item" onClick={() => onPick(l)}>Item</button>}
              {edited(l.id) && <button className="btn sm ghost" title="Undo my changes to this line" onClick={() => onReset(l)}>Reset</button>}
              <button className="btn sm ghost danger" title="Remove from the quote" onClick={() => onRemove(l)}>✕</button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function AddLine({ line, onClose, onAdd }: { line: ManualLine; onClose: () => void; onAdd: (l: ManualLine) => void }) {
  const [l, setL] = useState(line);
  const [pick, setPick] = useState(false);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
        <header><h3 style={{ margin: 0 }}>Add a line</h3></header>
        <div className="body stack">
          <button className="btn sm" onClick={() => setPick(true)}>Pick from the catalog…</button>
          <label className="field"><span>Description</span><input value={l.description} onChange={(e) => setL({ ...l, description: e.target.value, catalogItemId: undefined })} /></label>
          <div className="grid three">
            <label className="field"><span>Section</span><input value={l.section} onChange={(e) => setL({ ...l, section: e.target.value })} /></label>
            <label className="field"><span>Kind</span>
              <select value={l.kind} onChange={(e) => setL({ ...l, kind: e.target.value as LineKind })}>
                <option value="material">Material</option><option value="labour">Labour</option><option value="sub">Sub-trade</option><option value="allowance">Allowance</option>
              </select>
            </label>
            <label className="field"><span>Unit</span>
              <select value={l.unit} onChange={(e) => setL({ ...l, unit: e.target.value })}>
                {unitOptions(l.unit).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="field"><span>Qty</span><input type="number" step="any" value={l.qty} onChange={(e) => setL({ ...l, qty: Number(e.target.value) || 0 })} /></label>
            <label className="field"><span>Unit cost</span><input type="number" step="0.01" value={l.unitCost ?? ""} onChange={(e) => setL({ ...l, unitCost: e.target.value === "" ? null : Number(e.target.value), catalogItemId: undefined })} /></label>
          </div>
          <p className="small muted">A price typed by hand (not from the catalog) needs the owner's approval.</p>
        </div>
        <footer>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!l.description.trim()} onClick={() => onAdd(l)}>Add</button>
        </footer>
      </div>
      {pick && <CatalogPicker title="Pick an item" onClose={() => setPick(false)} onPick={(it) => {
        if (it) setL({ ...l, description: itemLabel(it), unit: it.unit, unitCost: it.unitCost, catalogItemId: it.id, section: l.section });
        setPick(false);
      }} />}
    </div>
  );
}

