import { useState } from "react";
import { useApp } from "../store";
import type { CabinetSet, CabinetSupplier } from "../types";
import { finishOptions, parseSkuList, priceCabinet, searchSkus, SUPPLIER_LABEL } from "../engine/cabinets";
import { uid } from "../data/questions";
import { money } from "../utils/format";

function newSet(name: string, roomId: string, supplier: CabinetSupplier): CabinetSet {
  return {
    id: uid(), name, roomId, supplier, box: "PLY",
    color: supplier === "oppein" ? "WSS" : supplier === "aline" ? "SW" : "",
    style: supplier === "aline" ? "shaker" : supplier === "divine" ? "S7" : "",
    assemble: supplier === "divine", shipping: supplier === "divine" ? 150 : 0, lines: [], notes: "",
  };
}

export default function CabinetsStep() {
  const { quote, update, cabinetData, me } = useApp();
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [find, setFind] = useState<Record<string, string>>({});
  if (!quote) return null;
  const rooms = quote.answers.rooms;
  const loaded = (["aline", "oppein", "divine"] as const).filter((k) => (cabinetData as any)[k]);
  const setOf = (id: string, fn: (s: CabinetSet) => void) => update((q) => { const s = q.cabinetSets.find((x) => x.id === id); if (s) fn(s); });

  const suggestions = rooms.filter((r) => (r.cabinetLF > 0 || r.vanity) && !quote.cabinetSets.some((s) => s.roomId === r.id));

  return (
    <div className="stack">
      {!loaded.length && (
        <div className="banner warn">
          No cabinet catalogs are loaded yet{me?.admin ? " — upload aline.json, oppein.json and divine.json in Settings." : " — ask an Admin to load them in Settings."} Until then, enter the cabinet quote total on the Rooms step.
        </div>
      )}

      {quote.cabinetSets.map((set) => {
        const data = (cabinetData as any)[set.supplier];
        const opts = finishOptions(set.supplier, data);
        let list = 0, cost = 0, assembly = 0;
        const priced = set.lines.map((ln) => {
          const p = data ? priceCabinet(set, data, ln.sku) : null;
          if (p) { list += p.list * ln.qty; cost += p.dealer * ln.qty; if (set.assemble) assembly += p.assemblyEach * ln.qty; }
          return { ln, p };
        });
        const hits = find[set.id] ? searchSkus(set.supplier, data, find[set.id], 12) : [];
        return (
          <div className="room" key={set.id}>
            <div className="room-head">
              <input value={set.name} onChange={(e) => setOf(set.id, (s) => { s.name = e.target.value; })} />
              <select value={set.supplier} onChange={(e) => setOf(set.id, (s) => { const n = newSet(s.name, s.roomId, e.target.value as CabinetSupplier); Object.assign(s, { ...n, id: s.id, lines: s.lines, name: s.name }); })}>
                {(["aline", "oppein", "divine"] as const).map((k) => <option key={k} value={k}>{SUPPLIER_LABEL[k]}{(cabinetData as any)[k] ? "" : " (not loaded)"}</option>)}
              </select>
              {quote.type !== "custom-home" && (
                <select value={set.roomId} onChange={(e) => setOf(set.id, (s) => { s.roomId = e.target.value; })}>
                  <option value="">Whole job</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              <div className="spacer" />
              <span className="small muted">{set.lines.length} items · list {money(list)} · <b>cost {money(cost + assembly + set.shipping)}</b></span>
              <button className="btn sm danger" onClick={() => update((q) => { q.cabinetSets = q.cabinetSets.filter((x) => x.id !== set.id); })}>Remove</button>
            </div>
            <div className="room-body">
              <div className="grid four">
                {set.supplier === "aline" && (
                  <label className="field"><span>Door style</span>
                    <select value={set.style} onChange={(e) => setOf(set.id, (s) => { s.style = e.target.value; s.color = opts.colors.find((c) => c.group === e.target.value)?.code || ""; })}>
                      {opts.styles.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                    </select>
                  </label>
                )}
                {set.supplier === "divine" && (
                  <label className="field"><span>Door style</span>
                    <select value={set.style} onChange={(e) => setOf(set.id, (s) => { s.style = e.target.value; })}>
                      {opts.styles.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="field"><span>{set.supplier === "oppein" ? "Colour (sets the price tier)" : set.supplier === "divine" ? "Finishing colour" : "Colour"}</span>
                  <select value={set.color} onChange={(e) => setOf(set.id, (s) => { s.color = e.target.value; })}>
                    {set.supplier === "divine" && <option value="">—</option>}
                    {opts.colors.filter((c) => set.supplier !== "aline" || c.group === set.style).map((c) => (
                      <option key={c.code} value={c.code}>{c.name}{set.supplier === "oppein" ? ` — ${c.group}` : ""}</option>
                    ))}
                  </select>
                </label>
                {set.supplier !== "divine" ? (
                  <label className="field"><span>Box</span>
                    <select value={set.box} onChange={(e) => setOf(set.id, (s) => { s.box = e.target.value as "PB" | "PLY"; })}>
                      <option value="PLY">Plywood</option><option value="PB">Particle board</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={set.assemble} onChange={(e) => setOf(set.id, (s) => { s.assemble = e.target.checked; })} /> Divine assembles ({money(assembly)})</label>
                    <label className="field"><span>Freight</span><div className="unit-input"><em>$</em><input type="number" value={set.shipping || ""} onChange={(e) => setOf(set.id, (s) => { s.shipping = Number(e.target.value) || 0; })} /></div></label>
                  </>
                )}
              </div>

              <div className="room-section">
                <h4>Cabinet list</h4>
                {priced.length > 0 && (
                  <table className="t">
                    <thead><tr><th>SKU</th><th>Description</th><th className="num">Qty</th><th className="num">List</th><th className="num">Your cost</th><th></th></tr></thead>
                    <tbody>
                      {priced.map(({ ln, p }) => (
                        <tr key={ln.id} className={p ? "" : "blocked"}>
                          <td><input value={ln.sku} style={{ width: 110 }} onChange={(e) => setOf(set.id, (s) => { s.lines.find((x) => x.id === ln.id)!.sku = e.target.value.toUpperCase(); })} /></td>
                          <td>{p ? `${p.desc}${p.dims ? ` · ${p.dims}` : ""}` : <span className="pill bad">{data ? "not in the catalog" : "catalog not loaded"}</span>}</td>
                          <td className="num"><input type="number" min={0} value={ln.qty} style={{ width: 60 }} onChange={(e) => setOf(set.id, (s) => { s.lines.find((x) => x.id === ln.id)!.qty = Number(e.target.value) || 0; })} /></td>
                          <td className="num">{p ? money(p.list * ln.qty) : "—"}</td>
                          <td className="num">{p ? money(p.dealer * ln.qty) : "—"}</td>
                          <td><button className="btn sm ghost danger" onClick={() => setOf(set.id, (s) => { s.lines = s.lines.filter((x) => x.id !== ln.id); })}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="grid two" style={{ marginTop: 10 }}>
                  <label className="field"><span>Paste the SKU list from the design (e.g. "B24:2, W3030 x3, SB36")</span>
                    <textarea style={{ minHeight: 60 }} value={paste[set.id] || ""} onChange={(e) => setPaste({ ...paste, [set.id]: e.target.value })} />
                    <button className="btn sm" style={{ marginTop: 6 }} disabled={!paste[set.id]?.trim()} onClick={() => {
                      const got = parseSkuList(paste[set.id] || "");
                      setOf(set.id, (s) => { s.lines.push(...got.map((g) => ({ id: uid(), sku: g.sku.toUpperCase(), qty: g.qty }))); });
                      setPaste({ ...paste, [set.id]: "" });
                    }}>Add to list</button>
                  </label>
                  <div className="field"><span>Or search the {SUPPLIER_LABEL[set.supplier]} catalog</span>
                    <input placeholder="e.g. sink 36, W3030, pantry" value={find[set.id] || ""} onChange={(e) => setFind({ ...find, [set.id]: e.target.value })} />
                    {hits.length > 0 && (
                      <div style={{ maxHeight: 180, overflow: "auto", marginTop: 4 }}>
                        {hits.map((h: any) => (
                          <div key={h.sku} className="pick-row" style={{ gridTemplateColumns: "90px 1fr" }} onClick={() => setOf(set.id, (s) => { s.lines.push({ id: uid(), sku: h.sku, qty: 1 }); })}>
                            <b>{h.sku}</b><span className="small">{h.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="row">
        <span className="muted">Add cabinets:</span>
        {suggestions.map((r) => (
          <button key={r.id} className="btn sm" onClick={() => update((q) => { q.cabinetSets.push(newSet(r.cabinetLF > 0 ? `${r.name} cabinets` : `${r.name} vanity`, r.id, r.cabinetLF > 0 ? "oppein" : "divine")); })}>
            + {r.name}
          </button>
        ))}
        <button className="btn sm" onClick={() => update((q) => { q.cabinetSets.push(newSet(quote.type === "custom-home" ? "Kitchen" : "Cabinets", "", loaded[0] || "oppein")); })}>+ {quote.type === "custom-home" ? "Kitchen / vanity order" : "Other cabinets"}</button>
      </div>
      <p className="small muted">Prices are the supplier's list less JMRC's dealer discount (Aline 66%, Oppein 58%, Divine 55% — read from the catalog files). Cabinets carry the cabinet margin from Settings.</p>
    </div>
  );
}
