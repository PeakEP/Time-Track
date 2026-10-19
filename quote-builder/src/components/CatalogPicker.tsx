import { useMemo, useState } from "react";
import { useApp } from "../store";
import { itemLabel, searchCatalog } from "../engine/catalog";
import type { CatalogItem } from "../types";
import { money } from "../utils/format";

// Search the merged JMRC + Square catalog and pick an item.
export default function CatalogPicker({ title, codes, initial = "", onPick, onClose, allowClear, onExclude, onManual }: {
  title: string; codes?: string[]; initial?: string; onPick: (it: CatalogItem | null) => void; onClose: () => void;
  allowClear?: boolean; onExclude?: () => void; onManual?: (q: string) => void;
}) {
  const { items, me, settings } = useApp();
  const [q, setQ] = useState(initial);
  const [all, setAll] = useState(!codes?.length);
  const [src, setSrc] = useState<"" | "jmrc" | "square">("");
  const showCost = true;
  const results = useMemo(
    () => searchCatalog(items, q, { codes: all ? undefined : codes, limit: 300, source: src || undefined }),
    [items, q, all, codes, src],
  );
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          <div className="row" style={{ marginBottom: 10 }}>
            <input autoFocus placeholder="Search — every word must match (e.g. spc oak, 2 x 6 stud)" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <select value={src} onChange={(e) => setSrc(e.target.value as typeof src)} style={{ width: 150 }}>
              <option value="">All sources</option><option value="jmrc">JMRC catalog</option><option value="square">Square (store)</option>
            </select>
            {codes?.length ? <label className="check small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All categories</label> : null}
          </div>
          {!items.length && <div className="banner warn">The catalog is empty — an Admin loads it in Settings.</div>}
          {results.map((it) => (
            <div className="pick-row" key={it.id} onClick={() => onPick(it)}>
              <div>
                <div>{itemLabel(it)}</div>
                <div className="code">{it.costCode}{it.sku ? ` · ${it.sku}` : ""} · {it.source === "square" ? "Square" : "JMRC"}</div>
              </div>
              <div className="small">{it.unit}</div>
              <div className="num">{showCost ? (it.unitCost == null ? <span className="pill warn">no price</span> : money(it.unitCost)) : ""}</div>
            </div>
          ))}
          {items.length > 0 && results.length === 0 && (
            <p className="muted">Nothing matches.{onManual ? <> <button className="btn sm" onClick={() => onManual(q)}>Enter it manually</button></> : null}</p>
          )}
        </div>
        {(allowClear || onExclude || onManual) && (
          <footer>
            {onManual && <button className="btn ghost" onClick={() => onManual(q)}>Enter manually / new product</button>}
            {onExclude && <button className="btn" onClick={onExclude}>Not included</button>}
            {allowClear && <button className="btn" onClick={() => onPick(null)}>Use the default</button>}
          </footer>
        )}
      </div>
    </div>
  );
}
