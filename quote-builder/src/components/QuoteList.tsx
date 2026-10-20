import { useMemo, useState } from "react";
import { useApp } from "../store";
import { PROJECT_TYPE_LABEL, type ProjectType } from "../types";
import { money0, when } from "../utils/format";

const TYPES: { type: ProjectType; blurb: string }[] = [
  { type: "renovation", blurb: "Any reno — flooring, paint, tile, kitchens & baths, plus walls moved, structural & plumbing changes." },
  { type: "shop", blurb: "New detached shop or garage, slab to roof." },
  { type: "custom-home", blurb: "New custom home with allowances, CUS proposal format." },
];

const STATUS: Record<string, string> = {
  draft: "", "needs-approval": "warn", approved: "ok", sent: "info", won: "ok", lost: "bad",
};

export default function QuoteList() {
  const { quotes, startQuote, openQuote, deleteQuote, me, settingsSaved, items, notify } = useApp();
  const finalized = (st: string) => st === "sent" || st === "won" || st === "lost";
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return quotes.filter((x) => (!mine || x.createdBy === me?.name) && (!t || `${x.number} ${x.title} ${x.client} ${x.address}`.toLowerCase().includes(t)));
  }, [quotes, q, mine, me]);
  const pending = quotes.filter((x) => x.status === "needs-approval");

  return (
    <div>
      <div className="hero">
        <div>
          <h1>Start a quote</h1>
          <p className="muted">Answer the questions, add drawings and notes, and the takeoff and pricing are done for you.</p>
        </div>
      </div>
      {(!settingsSaved || !items.length) && (
        <div className="banner warn">
          {!items.length ? "The cost catalog hasn't been loaded yet. " : ""}
          {!settingsSaved ? "Rates and markups haven't been set yet. " : ""}
          {me?.admin ? "Open Settings to finish setup — quotes can't go out until then." : "Ask the owner to finish setup in Settings."}
        </div>
      )}
      <div className="types">
        {TYPES.map((t) => (
          <button key={t.type} className="type-card" onClick={() => startQuote(t.type)}>
            <strong>{PROJECT_TYPE_LABEL[t.type]}</strong>
            <span>{t.blurb}</span>
          </button>
        ))}
      </div>

      {me?.admin && pending.length > 0 && (
        <div className="banner info">
          {pending.length} quote{pending.length > 1 ? "s" : ""} waiting for your approval.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3>Quotes</h3>
          <div className="spacer" />
          <label className="check small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only</label>
          <input placeholder="Search number, client, address…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        </div>
        {rows.length === 0 ? (
          <p className="muted">No quotes yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="t">
              <thead>
                <tr><th>No.</th><th>Client / project</th><th>Type</th><th>Status</th><th className="num">Total</th><th>Updated</th><th>By</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const canDelete = me?.admin || (x.createdBy === me?.name && !finalized(x.status));
                  return (
                  <tr key={x.id} className="quote-row" onClick={() => openQuote(x.id).catch((e) => notify(e.message, true))}>
                    <td>{x.number || <span className="muted">draft</span>}{x.version > 1 ? ` V${x.version}` : ""}</td>
                    <td><b>{x.client || "(no client yet)"}</b><div className="muted small">{x.title !== x.client ? x.title : ""} {x.address}</div></td>
                    <td>{PROJECT_TYPE_LABEL[x.type]}</td>
                    <td><span className={`pill ${STATUS[x.status] || ""}`}>{x.status.replace("-", " ")}</span></td>
                    <td className="num">{money0(x.total)}</td>
                    <td className="small">{when(x.updatedAt)}</td>
                    <td className="small">{x.updatedBy || x.createdBy}</td>
                    <td>
                      {canDelete && (
                        <button className="btn sm ghost danger" title="Delete this quote" onClick={(e) => {
                          e.stopPropagation();
                          const fin = finalized(x.status);
                          if (!confirm(`Delete ${x.number || "this draft"}${x.client ? ` for ${x.client}` : ""}? This can't be undone.${fin ? " It's a finalized quote." : ""}`)) return;
                          deleteQuote(x.id).then(() => notify("Quote deleted.")).catch((err) => notify(err.message, true));
                        }}>Delete</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
