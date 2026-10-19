import { useState } from "react";
import { useApp } from "../store";
import { floorType, PRODUCT_PICKS } from "../data/questions";
import { EXCLUDED, type Answers } from "../types";
import { itemLabel, resolveComponent, searchCatalog } from "../engine/catalog";
import CatalogPicker from "./CatalogPicker";
import { money } from "../utils/format";

// Which takeoff tool each product pick replaces (to show the default).
const TOOL_FOR: Partial<Record<keyof Answers, string>> = {
  showerTileItemId: "tile", backsplashItemId: "backsplash", countertopItemId: "countertop",
  paintItemId: "wallPaint", interiorDoorItemId: "interiorDoor", lightFixtureItemId: "lightFixture",
  toiletItemId: "toilet", vanityItemId: "vanity", faucetItemId: "faucet", tubItemId: "tub",
};

export default function ProductsStep() {
  const { quote, update, byId, items, settings } = useApp();
  const [openPick, setOpenPick] = useState<(typeof PRODUCT_PICKS)[number] | null>(null);
  const [openFloor, setOpenFloor] = useState<string | null>(null);
  if (!quote) return null;
  const a = quote.answers;
  const picks = PRODUCT_PICKS.filter((p) => !p.types || p.types.includes(quote.type));
  const pick = (id: string) => (id && id !== EXCLUDED ? byId.get(id) : undefined);

  // The floor types actually used in the job — one product each, filtered to type.
  const floorsUsed: string[] = (() => {
    const s = new Set<string>();
    if (quote.type === "custom-home") { if (a.flooringType) s.add(a.flooringType); if (Number(a.tileFloorSF) > 0) s.add("tile"); }
    else if (quote.type !== "shop") for (const r of a.rooms) if (r.floor && r.floor !== "none") s.add(r.floor);
    return [...s];
  })();

  return (
    <div className="stack">
      {floorsUsed.length > 0 && (
        <div className="card">
          <h3>Flooring</h3>
          <p className="muted small">One product per floor type in the job. Choose the floor type on each room (or on the Interior step for a new home); here you pick the exact product.</p>
          <div className="grid two">
            {floorsUsed.map((type) => {
              const ft = floorType(type);
              const it = pick(a.floorItemIds?.[type] || "");
              const def = searchCatalog(items, "", { codes: ft.codes, limit: 1 })[0];
              return (
                <div className="field" key={type}>
                  <span>{ft.label}{ft.tile ? " tile" : " flooring"}</span>
                  <div className="product-pick">
                    <div className="chosen">
                      {it ? <>{itemLabel(it)} <span className="muted">· {it.unit}{it.unitCost != null ? ` · ${money(it.unitCost)}` : ""}</span></>
                        : <span className="muted">Default: {def ? itemLabel(def) : "none in catalog"}</span>}
                      {it && it.unitCost == null && <span className="pill warn" style={{ marginLeft: 6 }}>no price — as per drawings / quote</span>}
                    </div>
                    <button type="button" className="btn sm" onClick={() => setOpenFloor(type)}>Choose</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Products</h3>
        <div className="grid two">
          {picks.map((p) => {
            const id = quote.answers[p.key] as string;
            const excluded = id === EXCLUDED;
            const it = pick(id);
            const tool = settings.components.find((c) => c.key === TOOL_FOR[p.key]);
            const def = tool ? resolveComponent(tool, byId, items).item : null;
            return (
              <div className="field" key={p.key}>
                <span>{p.label}</span>
                <div className="product-pick">
                  <div className="chosen">
                    {excluded ? <span className="muted">Not included</span>
                      : it ? <>{itemLabel(it)} <span className="muted">· {it.unit}{it.unitCost != null ? ` · ${money(it.unitCost)}` : ""}</span></>
                      : <span className="muted">Default: {def ? itemLabel(def) : "none set"}</span>}
                    {it && it.unitCost == null && <span className="pill warn" style={{ marginLeft: 6 }}>no price — as per drawings / quote</span>}
                  </div>
                  <button type="button" className="btn sm" onClick={() => setOpenPick(p)}>Choose</button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          For custom homes these become the allowance amounts. "Not included" leaves the item off this quote. The client makes
          their final colour and finish selections with Robins Interiors &amp; Design.
        </p>
      </div>

      {openFloor && (
        <CatalogPicker
          title={`Choose ${floorType(openFloor).label}${floorType(openFloor).tile ? " tile" : " flooring"}`}
          codes={floorType(openFloor).codes}
          allowClear
          onClose={() => setOpenFloor(null)}
          onPick={(it) => {
            update((q) => {
              const m = { ...(q.answers.floorItemIds || {}) };
              if (it) m[openFloor] = it.id; else delete m[openFloor];
              q.answers.floorItemIds = m;
            });
            setOpenFloor(null);
          }}
        />
      )}
      {openPick && (
        <CatalogPicker
          title={`Choose ${openPick.label.toLowerCase()}`}
          codes={openPick.codes}
          allowClear
          onExclude={() => { update((q) => { (q.answers as unknown as Record<string, string>)[openPick.key] = EXCLUDED; }); setOpenPick(null); }}
          onClose={() => setOpenPick(null)}
          onPick={(it) => { update((q) => { (q.answers as unknown as Record<string, string>)[openPick.key] = it?.id || ""; }); setOpenPick(null); }}
        />
      )}
    </div>
  );
}
