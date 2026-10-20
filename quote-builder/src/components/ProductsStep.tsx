import { useState } from "react";
import { useApp } from "../store";
import { floorType, PRODUCT_PICKS, productsInScope, floorTypesInScope } from "../data/questions";
import { EXCLUDED, type Answers } from "../types";
import { itemLabel, resolveComponent, searchCatalog } from "../engine/catalog";
import CatalogPicker from "./CatalogPicker";
import NewProductModal from "./NewProductModal";
import { money } from "../utils/format";

// Which takeoff tool each product pick replaces (to show the default).
const TOOL_FOR: Partial<Record<keyof Answers, string>> = {
  showerTileItemId: "tile", backsplashItemId: "backsplash", countertopItemId: "countertop",
  paintItemId: "wallPaint", interiorDoorItemId: "interiorDoor", lightFixtureItemId: "lightFixture",
  toiletItemId: "toilet", vanityItemId: "vanity", faucetItemId: "faucet", tubItemId: "tub",
};

export default function ProductsStep() {
  const { quote, update, byId, items, settings, me, addCustomProduct } = useApp();
  const [openPick, setOpenPick] = useState<(typeof PRODUCT_PICKS)[number] | null>(null);
  const [openFloor, setOpenFloor] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ name: string; costCode: string; assign: (id: string) => void } | null>(null);
  if (!quote) return null;
  const a = quote.answers;
  // Only the products that are actually in scope for this job — derived from the
  // rooms and what's ticked on each, so a kitchen doesn't show vanity/toilet/tub.
  const picks = productsInScope(a, quote.type);
  const pick = (id: string) => (id && id !== EXCLUDED ? byId.get(id) : undefined);

  // The floor types actually used in the job — one product each, filtered to type.
  const floorsUsed = floorTypesInScope(a, quote.type);
  const nothingInScope = picks.length === 0 && floorsUsed.length === 0;

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
                  <span>{ft.tile ? ft.label : `${ft.label} flooring`}</span>
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

      {nothingInScope && (
        <div className="card">
          <h3>Products</h3>
          <p className="muted">Nothing to select yet. Add the rooms and tick what's being done on the <b>Rooms &amp; scope</b> step (or fill in the <b>Interior</b> step for a new home) — only the products for what's in scope show up here.</p>
        </div>
      )}
      {picks.length > 0 && (
      <div className="card">
        <h3>Products</h3>
        <p className="muted small" style={{ marginTop: -4, marginBottom: 12 }}>Only the products for what's in scope. Each is an allowance — set it now or leave the default; "Not included" drops it.</p>
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
          For custom homes these are the allowance amounts. The client makes their final colour and finish selections with Robins Interiors &amp; Design.
        </p>
      </div>
      )}

      {openFloor && (
        <CatalogPicker
          title={`Choose ${floorType(openFloor).tile ? floorType(openFloor).label : floorType(openFloor).label + " flooring"}`}
          codes={floorType(openFloor).codes}
          allowClear
          onManual={me?.admin ? (query) => {
            const type = openFloor;
            setOpenFloor(null);
            setCreating({ name: query, costCode: floorType(type).codes[0] || "", assign: (id) => update((q) => { const m = { ...(q.answers.floorItemIds || {}) }; m[type] = id; q.answers.floorItemIds = m; }) });
          } : undefined}
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
          onManual={me?.admin ? (query) => {
            const key = openPick.key as string;
            const codes = openPick.codes;
            setOpenPick(null);
            setCreating({ name: query, costCode: codes[0] || "", assign: (id) => update((q) => { (q.answers as unknown as Record<string, string>)[key] = id; }) });
          } : undefined}
          onClose={() => setOpenPick(null)}
          onPick={(it) => { update((q) => { (q.answers as unknown as Record<string, string>)[openPick.key] = it?.id || ""; }); setOpenPick(null); }}
        />
      )}
      {creating && (
        <NewProductModal
          initialName={creating.name}
          initialCostCode={creating.costCode}
          onClose={() => setCreating(null)}
          onSave={async (item) => { const it = await addCustomProduct(item); creating.assign(it.id); }}
        />
      )}
    </div>
  );
}
