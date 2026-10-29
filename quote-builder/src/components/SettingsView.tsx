import { useMemo, useState } from "react";
import { useApp } from "../store";
import { server, type CatalogSourceRef } from "../api";
import { MARGIN_LABEL, type CatalogItem, type MarginKey, type Settings, type ToolComponent } from "../types";
import { itemLabel, marginsFromRetail, parseJmrcCatalog, parseJmrcWorkbook, resolveComponent } from "../engine/catalog";
import { SUPPLIER_LABEL, validateCabinetFile, identifySupplier } from "../engine/cabinets";
import { readXlsx } from "../utils/xlsx";
import CatalogPicker from "./CatalogPicker";
import NewProductModal from "./NewProductModal";
import { money, when } from "../utils/format";

const pctIn = (v: number | null) => (v == null ? "" : String(Math.round(v * 10000) / 100));
const pctOut = (s: string) => (s === "" ? null : Number(s) / 100);

export default function SettingsView() {
  const app = useApp();
  const { catalog, items, byId, notify, loadCatalog, cabinetData, loadCabinets } = app;
  const [s, setS] = useState<Settings>(() => JSON.parse(JSON.stringify(app.settings)));
  const [dirty, setDirty] = useState(false);
  const [pin, setPin] = useState<ToolComponent | null>(null);
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("");
  const [newProduct, setNewProduct] = useState(false);
  const edit = (fn: (x: Settings) => void) => { const n = JSON.parse(JSON.stringify(s)); fn(n); setS(n); setDirty(true); };
  const resolved = useMemo(() => new Map(s.components.map((c) => [c.key, resolveComponent(c, byId, items)])), [s.components, byId, items]);
  const unsetRates = s.rates.filter((r) => r.value == null).length;

  async function saveAll() {
    setBusy("Saving…");
    try { await app.saveSettings(s); setDirty(false); notify("Settings saved."); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(""); }
  }

  // Upload one or more catalog files at once (.xlsx / .csv). "merge" adds them to
  // the current catalog (updating any item with the same id); "replace" rebuilds
  // the catalog from just these files. Keeping separate supplier catalogs and
  // adding them beats remaking one master each time.
  async function importCatalogs(files: FileList, mode: "merge" | "replace") {
    setBusy("Reading the catalog…");
    try {
      const nowIso = new Date().toISOString();
      const by = app.me?.name || "";
      const incoming = new Map<string, CatalogItem>(); // union within this upload (later file wins)
      const newSources: CatalogSourceRef[] = [];
      const warnings: string[] = [];
      const names: string[] = [];
      let retail: ReturnType<typeof marginsFromRetail> | null = null;
      let retailFrom = "";
      for (const file of Array.from(files)) {
        const sheets = /\.xlsx$/i.test(file.name) ? await readXlsx(await file.arrayBuffer()) : null;
        const { items: parsed, warnings: w } = sheets ? parseJmrcWorkbook(sheets) : parseJmrcCatalog(await file.text());
        const src = crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
        newSources.push({ id: src, name: file.name, at: nowIso, by });
        for (const it of parsed) incoming.set(it.id, { ...it, src }); // tag each item with its file, so it can be removed later
        for (const x of w) warnings.push(`${file.name}: ${x}`);
        names.push(file.name);
        if (sheets) { const r = marginsFromRetail(sheets); if (r?.detail.length) { retail = r; retailFrom = file.name; } }
      }
      if (!incoming.size) throw new Error("No catalog rows found in those files.");
      const merged = new Map<string, CatalogItem>();
      const sources: CatalogSourceRef[] = [];
      if (mode === "merge") {
        for (const it of catalog.jmrc.items || []) merged.set(it.id, it);
        for (const s of catalog.jmrc.sources || []) sources.push(s);
      }
      for (const [id, it] of incoming) merged.set(id, it);
      sources.push(...newSources);
      const result = [...merged.values()];
      const label = names.length === 1 ? names[0] : `${names.length} files: ${names.join(", ")}`;
      const unpriced = result.filter((i) => i.unitCost == null).length;
      const summary = mode === "merge"
        ? `Add them to the catalog (${(catalog.jmrc.items || []).length} → ${result.length} items)?`
        : `Replace the whole catalog with these ${result.length} items?`;
      if (!confirm(`${incoming.size} item(s) from ${names.length} file(s): ${names.join(", ")}.${warnings.length ? `\n\n${warnings.length} warning(s):\n${warnings.slice(0, 5).join("\n")}` : ""}\n\n${summary}`)) return;
      await server.putJmrc(result, label, sources);
      await loadCatalog();
      notify(`Catalog ${mode === "merge" ? "updated" : "loaded"}: ${result.length} items (${unpriced} without a price).`);
      if (retail?.detail.length && confirm(`${retailFrom}'s retail reference gives selling margins for ${retail.detail.length} cost codes (e.g. ${retail.detail.slice(0, 4).map((d) => `${d.code} ${Math.round(d.margin * 100)}%`).join(", ")}).\n\nUse these as the margins for those product codes?`)) {
        edit((x) => { x.pricing.codeMargins = retail!.margins; x.pricing.codeMarginSource = `${retailFrom} retail reference (${new Date().toLocaleDateString("en-CA")})`; });
        notify("Product margins filled in — review them under Pricing and save.");
      }
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  async function importCabinets(files: FileList) {
    setBusy("Reading cabinet catalogs…");
    try {
      const parsed = [];
      for (const f of Array.from(files)) {
        let j: any;
        try { j = JSON.parse(await f.text()); } catch { throw new Error(`${f.name} isn't a JSON catalog file.`); }
        if (j && !j.supplier && j.discounts) continue; // suppliers.json — discounts are in each file
        const err = validateCabinetFile(j);
        if (err) throw new Error(`${f.name}: ${err}`);
        parsed.push(j);
      }
      if (!parsed.length) throw new Error("Pick aline.json, oppein.json and/or divine.json.");
      await server.putCabinets(parsed);
      await loadCabinets();
      notify(`Loaded ${parsed.map((j) => `${SUPPLIER_LABEL[identifySupplier(j)!]} (${j.products.length} items, ${Math.round(j.discount * 100)}% off list)`).join(", ")}.`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }

  const comps = s.components.filter((c) => !filter || `${c.label} ${c.section}`.toLowerCase().includes(filter.toLowerCase()));

  // Uploaded catalogs (sources) that can be removed individually.
  const jmrcItems = catalog.jmrc.items || [];
  const jmrcSources = catalog.jmrc.sources || [];
  const srcCount = (id: string) => jmrcItems.filter((it) => (it.src || "__untagged__") === id).length;
  async function removeSource(id: string, name: string) {
    if (!confirm(`Remove "${name}" (${srcCount(id)} item${srcCount(id) === 1 ? "" : "s"}) from the catalog?`)) return;
    try { await app.removeCatalogSource(id); notify("Catalog removed."); }
    catch (e) { notify((e as Error).message, true); }
  }

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
        Set these once and every quote uses them. Anything missing here is asked of the salesperson on the quote instead
        (and shows on the cost breakdown), so quotes never wait on you unless they're under your minimum margin or over your limit.
      </p>

      <div className="card stack">
        <h3>Cost catalog</h3>
        <p className="small">
          {catalog.jmrc.items.length
            ? <>{catalog.jmrc.items.length} items · last import <b>{catalog.jmrc.fileName || "upload"}</b>, {when(catalog.jmrc.importedAt)} by {catalog.jmrc.importedBy}.</>
            : <span className="pill bad">not loaded</span>}
        </p>
        <p className="small muted">Upload one or more cost catalogs (.xlsx workbooks or CSV exports: Cost Item Name, Description, Unit, Unit Cost, Cost Code). Keep separate supplier lists and <b>Add</b> them — each new file adds its items and updates any with the same id, so you don't rebuild one master each time. <b>Replace</b> rebuilds the catalog from just the files you pick. Stored on the server, not in the code.</p>
        <div className="row">
          <label className="btn" style={{ width: "fit-content" }}>
            Add catalog file(s)…
            <input type="file" accept=".csv,.xlsx,text/csv" multiple hidden onChange={(e) => { if (e.target.files?.length) void importCatalogs(e.target.files, "merge"); e.target.value = ""; }} />
          </label>
          <label className="btn ghost" style={{ width: "fit-content" }}>
            Replace with file(s)…
            <input type="file" accept=".csv,.xlsx,text/csv" multiple hidden onChange={(e) => { if (e.target.files?.length) void importCatalogs(e.target.files, "replace"); e.target.value = ""; }} />
          </label>
        </div>
        {(jmrcSources.length > 0 || srcCount("__untagged__") > 0) && (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            <div className="small muted">Loaded catalogs — remove any with ✕:</div>
            {jmrcSources.map((src) => (
              <div className="row" key={src.id} style={{ gap: 8, alignItems: "center" }}>
                <span className="name">{src.name}</span>
                <span className="small muted">{srcCount(src.id)} item(s){src.at ? ` · ${when(src.at)}` : ""}</span>
                <div className="spacer" />
                <button className="btn sm ghost danger" title="Remove this catalog" onClick={() => removeSource(src.id, src.name)}>✕</button>
              </div>
            ))}
            {srcCount("__untagged__") > 0 && (
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className="name">{catalog.jmrc.fileName || "Existing catalog"}</span>
                <span className="small muted">{srcCount("__untagged__")} item(s) · earlier import</span>
                <div className="spacer" />
                <button className="btn sm ghost danger" title="Remove this catalog" onClick={() => removeSource("__untagged__", catalog.jmrc.fileName || "Existing catalog")}>✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Custom products</h3>
        <p className="small muted">Products you add by hand, for anything not in the master catalog. They stay when the master catalog is re-imported, and appear in the catalog everywhere — the Products step, line pickers and takeoff defaults.</p>
        {catalog.custom?.items.length ? (
          <ul className="file-list">
            {catalog.custom.items.map((it) => (
              <li key={it.id}>
                <span className="name">{itemLabel(it)}</span>
                <span className="small muted">{it.costCode || "—"} · {it.unit}{it.unitCost != null ? ` · ${money(it.unitCost)}` : " · no price"}</span>
                <button className="btn sm ghost danger" onClick={async () => {
                  if (!confirm(`Remove "${it.name}" from the catalog? Quotes that used it keep their line, repriced by hand.`)) return;
                  try { await app.deleteCustomProduct(it.id); notify("Removed."); } catch (e) { notify((e as Error).message, true); }
                }}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="small">None yet.</p>}
        <button className="btn" style={{ width: "fit-content" }} onClick={() => setNewProduct(true)}>+ New product</button>
      </div>

      <div className="card stack">
        <h3>Cabinet catalogs — Aline, Oppein, Divine</h3>
        <div className="row">
          {(["aline", "oppein", "divine"] as const).map((k) => {
            const d = (cabinetData as any)[k];
            return <span key={k} className={`pill ${d ? "ok" : "warn"}`}>{SUPPLIER_LABEL[k]}: {d ? `${d.products.length} items · ${Math.round(d.discount * 100)}% dealer discount` : "not loaded"}</span>;
          })}
        </div>
        <p className="small muted">The same price files the cabinet-quoting skill uses (aline.json, oppein.json, divine.json): supplier list prices; JMRC's cost is list less the dealer discount in each file. Re-upload when a supplier changes pricing.</p>
        <label className="btn" style={{ width: "fit-content" }}>
          Upload cabinet catalog files…
          <input type="file" accept=".json,application/json" multiple hidden onChange={(e) => { if (e.target.files?.length) void importCabinets(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      <div className="card">
        <h3>Labour</h3>
        <p className="small muted" style={{ marginBottom: 10 }}>
          Labour is estimated in hours and billed at your hourly rate. Sell = cost ÷ (1 − the labour margin below).
        </p>
        <div className="grid three">
          <label className="field"><span>Carpenter / tradesperson — cost per hour</span>
            <div className="unit-input"><em>$</em><input type="number" step="0.5" value={s.pricing.labourCostPerHour} onChange={(e) => edit((x) => { x.pricing.labourCostPerHour = Number(e.target.value) || 0; })} /><em>/hr</em></div>
            <span className="help">sell ≈ ${(s.pricing.labourCostPerHour / (1 - (s.pricing.margins.labour ?? 0.5))).toFixed(0)}/hr</span>
          </label>
          <label className="field"><span>Labourer — cost per hour</span>
            <div className="unit-input"><em>$</em><input type="number" step="0.5" value={s.pricing.laborerCostPerHour} onChange={(e) => edit((x) => { x.pricing.laborerCostPerHour = Number(e.target.value) || 0; })} /><em>/hr</em></div>
            <span className="help">sell ≈ ${(s.pricing.laborerCostPerHour / (1 - (s.pricing.margins.labour ?? 0.5))).toFixed(0)}/hr</span>
          </label>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary className="small" style={{ cursor: "pointer" }}>How fast each task goes (productivity) — tune if your crews differ</summary>
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <table className="t">
              <thead><tr><th>Task</th><th>Section</th><th className="num">Units / hour</th><th>Unit</th><th>Crew</th></tr></thead>
              <tbody>
                {s.labour.map((t, i) => (
                  <tr key={t.key}>
                    <td>{t.label}<div className="basis">{t.note}</div></td>
                    <td className="small">{t.section}</td>
                    <td className="num"><input type="number" step="any" min={0} style={{ width: 80 }} value={t.perHour} onChange={(e) => edit((x) => { x.labour[i].perHour = Number(e.target.value) || 0; })} /></td>
                    <td>{t.unit}/hr</td>
                    <td><select value={t.crew} onChange={(e) => edit((x) => { x.labour[i].crew = e.target.value as "carpenter" | "laborer"; })}><option value="carpenter">Carpenter</option><option value="laborer">Labourer</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="card">
        <h3>Margins</h3>
        <p className="small muted" style={{ marginBottom: 10 }}>
          Gross margin on the selling price: sell = cost ÷ (1 − margin). 50% margin = cost × 2. Product-code margins (below) win over the category; the salesperson can adjust any quote.
        </p>
        <div className="grid three">
          {(Object.keys(MARGIN_LABEL) as MarginKey[]).map((k) => (
            <label className="field" key={k}><span>{MARGIN_LABEL[k]}</span>
              <div className="unit-input">
                <input type="number" step="0.5" value={pctIn(s.pricing.margins[k])} placeholder="not set"
                  onChange={(e) => edit((x) => { x.pricing.margins[k] = pctOut(e.target.value); })} />
                <em>%</em>
              </div>
              {s.pricing.margins[k] != null && <span className="help">cost × {(1 / (1 - (s.pricing.margins[k] || 0))).toFixed(2)}</span>}
            </label>
          ))}
        </div>
        <h3 style={{ marginTop: 18 }}>Product-code margins</h3>
        {Object.keys(s.pricing.codeMargins).length === 0 ? (
          <p className="small muted">None yet — upload the master catalog workbook and they're worked out from its retail reference.</p>
        ) : (
          <>
            <p className="small muted">From {s.pricing.codeMarginSource || "manual entry"}.</p>
            <div className="grid four" style={{ marginTop: 8 }}>
              {Object.entries(s.pricing.codeMargins).sort().map(([code, m]) => {
                const name = items.find((i) => i.costCode.startsWith(code))?.costCode || code;
                return (
                  <label className="field" key={code}><span>{name}</span>
                    <div className="unit-input">
                      <input type="number" step="0.5" value={pctIn(m)} onChange={(e) => edit((x) => { const v = pctOut(e.target.value); if (v == null) delete x.pricing.codeMargins[code]; else x.pricing.codeMargins[code] = v; })} />
                      <em>%</em>
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <h3 style={{ marginTop: 18 }}>Fees, tax &amp; approval</h3>
        <div className="grid four">
          {([["pmFeeNewBuild", "PM fee (shops & homes)"], ["contingency", "Contingency"], ["hst", "HST"], ["minMargin", "Minimum overall margin"]] as const).map(([k, label]) => (
            <label className="field" key={k}><span>{label}</span>
              <div className="unit-input">
                <input type="number" step="0.1" value={pctIn(s.pricing[k] as number | null)} placeholder="not set"
                  onChange={(e) => edit((x) => { (x.pricing as unknown as Record<string, number | null>)[k] = k === "minMargin" ? pctOut(e.target.value) : pctOut(e.target.value) ?? 0; })} />
                <em>%</em>
              </div>
            </label>
          ))}
          <label className="field"><span>Quotes over this need you</span>
            <div className="unit-input"><em>$</em><input type="number" value={s.pricing.autoApproveLimit ?? ""} placeholder="no limit"
              onChange={(e) => edit((x) => { x.pricing.autoApproveLimit = e.target.value === "" ? null : Number(e.target.value); })} /></div>
          </label>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Only these two stop a quote for your approval. Everything else the salesperson answers in the quote.</p>
      </div>

      <div className="card scroll-x">
        <div className="card-head">
          <h3>Sub-trade &amp; allowance rates</h3>
          {unsetRates > 0 && <span className="pill warn">{unsetRates} not set</span>}
        </div>
        <p className="small muted" style={{ marginBottom: 8 }}>Your cost per unit for labour, sub-trades and allowances. Blank means the salesperson is asked for it on each quote that needs it.</p>
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
      {newProduct && (
        <NewProductModal
          onClose={() => setNewProduct(false)}
          onSave={async (item) => { await app.addCustomProduct(item); notify("Product added to the catalog."); }}
        />
      )}
    </div>
  );
}
