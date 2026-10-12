import { useMemo, useState } from "react";
import { useApp } from "../store";
import { server } from "../api";
import type { Settings, ToolComponent } from "../types";
import { itemLabel, parseJmrcCatalog, resolveComponent } from "../engine/catalog";
import CatalogPicker from "./CatalogPicker";
import { money, when } from "../utils/format";

const pctIn = (v: number | null) => (v == null ? "" : String(Math.round(v * 10000) / 100));
const pctOut = (s: string) => (s === "" ? null : Number(s) / 100);

export default function SettingsView() {
  const app = useApp();
  const { catalog, items, byId, notify, loadCatalog } = app;
  const [s, setS] = useState<Settings>(() => JSON.parse(JSON.stringify(app.settings)));
  const [dirty, setDirty] = useState(false);
  const [pin, setPin] = useState<ToolComponent | null>(null);
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const edit = (fn: (x: Settings) => void) => { const n = JSON.parse(JSON.stringify(s)); fn(n); setS(n); setDirty(true); };
  const resolved = useMemo(() => new Map(s.components.map((c) => [c.key, resolveComponent(c, byId, items)])), [s.components, byId, items]);
  const unsetRates = s.rates.filter((r) => r.value == null).length;

  async function saveAll() {
    setBusy("Saving…");
    try { await app.saveSettings(s); setDirty(false); notify("Settings saved."); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(""); }
  }

  async function importCsv(file: File) {
    setBusy("Reading the catalog…");
    try {
      const { items: parsed, warnings } = parseJmrcCatalog(await file.text());
      const unpriced = parsed.filter((i) => i.unitCost == null).length;
      if (!confirm(`${parsed.length} items found (${unpriced} without a price — "as per drawings" or blank).${warnings.length ? `\n\n${warnings.length} warning(s):\n${warnings.slice(0, 5).join("\n")}` : ""}\n\nReplace the current JMRC catalog with this file?`)) return;
      await server.putJmrc(parsed, file.name);
      await loadCatalog();
      notify(`Catalog loaded: ${parsed.length} items.`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  async function squareSync() {
    setBusy("Syncing Square…");
    try {
      const r = await server.squareSync();
      await loadCatalog();
      notify(`Square synced: ${r.count} items${r.skipped ? ` (${r.skipped} skipped — no default unit cost)` : ""}.`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  const comps = s.components.filter((c) => !filter || `${c.label} ${c.section}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="stack">
      <div className="quote-bar">
        <h2>Settings</h2>
        <span className="muted small">{app.settings.updatedAt ? `Last saved ${when(app.settings.updatedAt)} by ${app.settings.updatedBy}` : "Not saved yet"}</span>
        <div className="spacer" />
        {busy && <span className="status-line">{busy}</span>}
        <button className="btn primary" disabled={!dirty || !!busy} onClick={saveAll}>Save settings</button>
      </div>
      <p className="muted">
        Everything here is yours to set once: the sales team's quotes use it automatically, and anything missing stops a quote
        from going out until you've looked at it.
      </p>

      <div className="grid two">
        <div className="card stack">
          <h3>JMRC cost catalog</h3>
          <p className="small">
            {catalog.jmrc.items.length
              ? <>{catalog.jmrc.items.length} items from <b>{catalog.jmrc.fileName || "upload"}</b>, loaded {when(catalog.jmrc.importedAt)} by {catalog.jmrc.importedBy}.</>
              : <span className="pill bad">not loaded</span>}
          </p>
          <p className="small muted">Upload the master catalog export (CSV with Cost Item Name, Description, Unit, Unit Cost, Cost Code). It's stored on the server, not in the code.</p>
          <label className="btn" style={{ width: "fit-content" }}>
            Upload catalog CSV…
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
          </label>
        </div>
        <div className="card stack">
          <h3>Square — Robins Interiors catalog</h3>
          <p className="small">
            {catalog.square.items.length
              ? <>{catalog.square.items.length} items, synced {when(catalog.square.syncedAt)} by {catalog.square.syncedBy}. {catalog.square.note}</>
              : <span className="pill warn">not synced</span>}
          </p>
          <p className="small muted">Pulls every item's <b>Default Unit Cost</b> (your cost, not the shelf price). Where a catalog line names a Square SKU, the live Square cost is used. Needs SQUARE_ACCESS_TOKEN in Netlify.</p>
          <button className="btn" style={{ width: "fit-content" }} onClick={squareSync} disabled={!!busy}>Sync from Square now</button>
        </div>
      </div>

      <div className="card">
        <h3>Pricing</h3>
        <div className="grid four">
          {([
            ["materialMarkup", "Material markup"], ["labourMarkup", "Labour markup"], ["subMarkup", "Sub-trade & allowance markup"],
            ["pmFeeNewBuild", "PM fee (shops & homes)"], ["contingency", "Contingency"], ["hst", "HST"], ["minMargin", "Minimum gross margin"],
          ] as const).map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span>
              <div className="unit-input">
                <input type="number" step="0.1" value={pctIn(s.pricing[k] as number | null)} placeholder="not set"
                  onChange={(e) => edit((x) => { (x.pricing as unknown as Record<string, number | null>)[k] = k === "pmFeeNewBuild" || k === "contingency" || k === "hst" ? pctOut(e.target.value) ?? 0 : pctOut(e.target.value); })} />
                <em>%</em>
              </div>
            </label>
          ))}
          <label className="field"><span>Quotes over this always need you</span>
            <div className="unit-input"><em>$</em><input type="number" value={s.pricing.autoApproveLimit ?? ""} placeholder="no limit"
              onChange={(e) => edit((x) => { x.pricing.autoApproveLimit = e.target.value === "" ? null : Number(e.target.value); })} /></div>
          </label>
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={s.pricing.hideCostsFromSales} onChange={(e) => edit((x) => { x.pricing.hideCostsFromSales = e.target.checked; })} />
          Hide costs and margins from sales reps (they see sell prices only)
        </label>
      </div>

      <div className="card scroll-x">
        <div className="card-head">
          <h3>Rates</h3>
          {unsetRates > 0 && <span className="pill warn">{unsetRates} not set</span>}
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>Your cost per unit for labour, sub-trades and allowances. Blank means "not set" — quotes that need it will wait for you.</p>
        <table className="t">
          <thead><tr><th>Section</th><th>Rate</th><th>Kind</th><th className="num">Cost per unit</th><th>Unit</th><th>Notes</th></tr></thead>
          <tbody>
            {s.rates.map((r, i) => (
              <tr key={r.key}>
                <td className="small">{r.section}</td>
                <td>{r.label}</td>
                <td><span className="pill">{r.kind}</span></td>
                <td className="num"><input type="number" step="0.01" min={0} style={{ width: 100 }} value={r.value ?? ""} placeholder="—"
                  onChange={(e) => edit((x) => { x.rates[i].value = e.target.value === "" ? null : Number(e.target.value); })} /></td>
                <td>{r.unit}</td>
                <td><input value={r.note} onChange={(e) => edit((x) => { x.rates[i].note = e.target.value; })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card scroll-x">
        <div className="card-head">
          <h3>Takeoff tools</h3>
          <div className="spacer" />
          <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 200 }} />
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Each takeoff tool finds its material in the catalog. <b>Pin</b> the exact item you buy, and confirm how much one unit covers — unconfirmed coverage is flagged on every quote that uses it.
        </p>
        <table className="t">
          <thead><tr><th>Tool</th><th>Catalog item</th><th className="num">Unit cost</th><th className="num">Covers per unit</th><th>Confirmed</th><th className="num">Waste</th></tr></thead>
          <tbody>
            {comps.map((c) => {
              const i = s.components.findIndex((x) => x.key === c.key);
              const r = resolved.get(c.key)!;
              return (
                <tr key={c.key} className={!r.item ? "blocked" : !c.coverageVerified ? "flagged" : ""}>
                  <td><b>{c.label}</b><div className="basis">{c.section}</div></td>
                  <td>
                    {r.item ? itemLabel(r.item) : <span className="pill bad">no match</span>}
                    <div className="row" style={{ marginTop: 4 }}>
                      <span className={`pill ${r.how === "pinned" ? "ok" : "info"}`}>{r.how === "pinned" ? "pinned" : r.how === "matched" ? `matched${r.alternatives ? ` (+${r.alternatives} others)` : ""}` : "none"}</span>
                      <button className="btn sm ghost" onClick={() => setPin(c)}>Pin item…</button>
                      {c.pinnedItemId && <button className="btn sm ghost" onClick={() => edit((x) => { delete x.components[i].pinnedItemId; })}>Unpin</button>}
                    </div>
                  </td>
                  <td className="num">{r.item ? `${money(r.item.unitCost)} / ${r.item.unit}` : "—"}</td>
                  <td className="num">
                    <input type="number" step="any" min={0} style={{ width: 80 }} value={c.coverage} onChange={(e) => edit((x) => { x.components[i].coverage = Number(e.target.value) || 1; x.components[i].coverageVerified = true; })} />
                    <div className="basis">{c.coverageNote}</div>
                  </td>
                  <td><input type="checkbox" checked={c.coverageVerified} onChange={(e) => edit((x) => { x.components[i].coverageVerified = e.target.checked; })} /></td>
                  <td className="num"><div className="unit-input"><input type="number" step="1" min={0} style={{ width: 60 }} value={Math.round(c.waste * 100)} onChange={(e) => edit((x) => { x.components[i].waste = (Number(e.target.value) || 0) / 100; })} /><em>%</em></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Company &amp; terms</h3>
        <div className="grid three">
          {([["name", "Company name"], ["address", "Address line"], ["phone", "Phone"], ["signer", "Signs proposals"], ["signerTitle", "Title"]] as const).map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span><input value={s.company[k]} onChange={(e) => edit((x) => { x.company[k] = e.target.value; })} /></label>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Payment schedule for shops &amp; custom homes (one draw per line)</span>
          <textarea placeholder={"Deposit upon signing: __%\nFoundation complete: __%\nFraming complete: __%\nRough-ins complete: __%\nDrywall complete: __%\nSubstantial completion: __%\nFinal holdback release: __%"}
            value={s.terms.paymentScheduleNewBuild} onChange={(e) => edit((x) => { x.terms.paymentScheduleNewBuild = e.target.value; })} />
        </label>
      </div>

      {pin && (
        <CatalogPicker
          title={`Pin the catalog item for: ${pin.label}`}
          codes={pin.codes}
          initial={pin.match.join(" ")}
          onClose={() => setPin(null)}
          onPick={(it) => {
            if (it) edit((x) => { const c = x.components.find((y) => y.key === pin.key)!; c.pinnedItemId = it.id; });
            setPin(null);
          }}
        />
      )}
    </div>
  );
}
