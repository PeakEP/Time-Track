import { useMemo, useState } from "react";
import { Search, Plus, Box, MoveDown } from "lucide-react";
import { useStore } from "../store";
import type { Product } from "../types";
import { isScheduleOnly, makeScheduleItem } from "../utils/placement";
import { findFinish, unitListPrice, formatCAD } from "../utils/pricing";

export function CatalogPalette() {
  const catalog = useStore((s) => s.catalog);
  const setGhost = useStore((s) => s.setGhost);
  const ghost = useStore((s) => s.ghost);
  const settings = useStore((s) => s.project.settings);
  const addItem = useStore((s) => s.addItem);
  const showPricing = useStore((s) => s.showPricing);
  const [q, setQ] = useState("");
  const [openCat, setOpenCat] = useState<string | null>("Base");

  const grouped = useMemo(() => {
    if (!catalog) return [] as { cat: string; items: Product[] }[];
    const groups = new Map<string, Product[]>();
    for (const p of catalog.products) {
      const arr = groups.get(p.cat) ?? [];
      arr.push(p);
      groups.set(p.cat, arr);
    }
    const filtered: { cat: string; items: Product[] }[] = [];
    const ql = q.trim().toLowerCase();
    for (const [cat, items] of groups) {
      const f = ql
        ? items.filter(
            (i) =>
              i.sku.toLowerCase().includes(ql) ||
              i.desc.toLowerCase().includes(ql) ||
              i.cat.toLowerCase().includes(ql),
          )
        : items;
      if (f.length) filtered.push({ cat, items: f });
    }
    filtered.sort((a, b) => a.cat.localeCompare(b.cat));
    return filtered;
  }, [catalog, q]);

  if (!catalog) {
    return (
      <aside className="palette">
        <div className="palette-empty">Loading catalog…</div>
      </aside>
    );
  }

  const tier = findFinish(catalog, settings.finishCode)?.tier ?? "essential";

  function onPick(p: Product) {
    if (isScheduleOnly(p)) {
      addItem(makeScheduleItem(p));
      return;
    }
    setGhost({ product: p, mountZ: 0 });
  }

  return (
    <aside className="palette">
      <header className="palette-header">
        <div className="palette-title">Catalog</div>
        <div className="palette-sub">OPPEIN RTA 2025 · {catalog.products.length} SKUs</div>
        <div className="palette-search">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU or name…"
          />
        </div>
        {ghost && (
          <div className="ghost-banner">
            Placing: <strong>{ghost.product.sku}</strong> — click on plan. Shift-click to place multiple. Esc to cancel.
            <button className="link" onClick={() => setGhost(null)}>cancel</button>
          </div>
        )}
      </header>
      <div className="palette-list">
        {grouped.map((g) => {
          const isOpen = q.trim() !== "" || openCat === g.cat;
          return (
            <div key={g.cat} className={`cat ${isOpen ? "open" : ""}`}>
              <button
                className="cat-head"
                onClick={() => setOpenCat(openCat === g.cat ? null : g.cat)}
              >
                <span className="cat-name">{g.cat}</span>
                <span className="cat-count">{g.items.length}</span>
              </button>
              {isOpen && (
                <ul className="cat-items">
                  {g.items.map((p) => {
                    const price = unitListPrice(p, tier, settings.boxMaterial);
                    const scheduleOnly = isScheduleOnly(p);
                    return (
                      <li key={p.sku} className="cat-item">
                        <button className="pick" onClick={() => onPick(p)}>
                          <div className="pick-row">
                            <span className="pick-sku">{p.sku}</span>
                            {showPricing && (
                              <span className="pick-price">
                                {price != null ? formatCAD(price) : "—"}
                              </span>
                            )}
                          </div>
                          <div className="pick-desc">{p.desc}</div>
                          <div className="pick-meta">
                            {p.dims}{" "}
                            <span className="pick-mode">
                              {scheduleOnly ? <><Plus size={10}/> add to schedule</> : <><MoveDown size={10}/> place on plan</>}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <Legend />
    </aside>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div className="legend-row"><span className="dot base" /> Base / floor</div>
      <div className="legend-row"><span className="dot wall" /> Wall / upper</div>
      <div className="legend-row"><span className="dot accessory" /><Box size={10}/> Schedule only (panels/hardware/etc.)</div>
    </div>
  );
}
