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
  kitchenSinkItemId: "kitchenSink", kitchenFaucetItemId: "kitchenFaucet",
  cabinetHardwareItemId: "cabinetHardware", underCabinetLightItemId: "underCabinetLight",
};

export default function ProductsStep() {
  const { quote, update, byId, items, settings, me, addCustomProduct } = useApp();
  const [openPick, setOpenPick] = useState<(typeof PRODUCT_PICKS)[number] | null>(null);
  const [openFloor, setOpenFloor] = useState<{ roomId?: string; type: string } | null>(null);
  const [creating, setCreating] = useState<{ name: string; costCode: string; assign: (id: string) => void } | null>(null);
  if (!quote) return null;
  const a = quote.answers;
  // Only the products that are actually in scope for this job — derived from the
  // rooms and what's ticked on each, so a kitchen doesn't show vanity/toilet/tub.
  const picks = productsInScope(a, quote.type);
  const pick = (id: string) => (id && id !== EXCLUDED ? byId.get(id) : undefined);

  // Flooring is chosen per room on a reno (so two rooms of the same type can take
  // different products), and per floor type on a new build (no rooms).
  const isReno = quote.type === "renovation" || quote.type === "remodel";
  const floorRooms = isReno ? a.rooms.filter((r) => r.floor && r.floor !== "none") : [];
  const floorsUsed = floorTypesInScope(a, quote.type);
  const hasFlooring = isReno ? floorRooms.length > 0 : floorsUsed.length > 0;
  const nothingInScope = picks.length === 0 && !hasFlooring;

  // Assign a flooring product to a room (reno) or a floor type (new build). Empty id clears.
  function assignFloor(of: { roomId?: string; type: string }, id: string) {
    update((q) => {
      if (of.roomId) {
        const r = q.answers.rooms.find((x) => x.id === of.roomId);
        if (r) r.floorItemId = id || undefined;
      } else {
        const m = { ...(q.answers.floorItemIds || {}) };
        if (id) m[of.type] = id; else delete m[of.type];
        q.answers.floorItemIds = m;
      }
    });
  }

  return (
    <div className="stack">
      {hasFlooring && (
        <div className="card">
          <h3>Flooring</h3>
          {isReno ? (
            <>
              <p className="muted small">The flooring product for each room. Rooms with the same type can each take a different product — e.g. a different tile colour in the dining room and the entry.</p>
              <div className="grid two">
                {floorRooms.map((r) => {
                  const ft = floorType(r.floor);
                  const it = pick(r.floorItemId || a.floorItemIds?.[r.floor] || "");
                  const def = searchCatalog(items, "", { codes: ft.codes, limit: 1 })[0];
                  return (
                    <div className="field" key={r.id}>
                      <span>{r.name} — {ft.label}</span>
                      <div className="product-pick">
                        <div className="chosen">
                          {it ? <>{itemLabel(it)} <span className="muted">· {it.unit}{it.unitCost != null ? ` · ${money(it.unitCost)}` : ""}</span></>
                            : <span className="muted">Default: {def ? itemLabel(def) : "none in catalog"}</span>}
                          {it && it.unitCost == null && <span className="pill warn" style={{ marginLeft: 6 }}>no price — as per drawings / quote</span>}
                        </div>
                        <button type="button" className="btn sm" onClick={() => setOpenFloor({ roomId: r.id, type: r.floor })}>Choose</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="muted small">One product per floor type. Choose the floor type on the Interior step; here you pick the exact product.</p>
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
                        <button type="button" className="btn sm" onClick={() => setOpenFloor({ type })}>Choose</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
          title={`Choose ${floorType(openFloor.type).tile ? floorType(openFloor.type).label : floorType(openFloor.type).label + " flooring"}`}
          codes={floorType(openFloor.type).codes}
          allowClear
          onManual={me?.admin ? (query) => {
            const of = openFloor;
            setOpenFloor(null);
            setCreating({ name: query, costCode: floorType(of.type).codes[0] || "", assign: (id) => assignFloor(of, id) });
          } : undefined}
          onClose={() => setOpenFloor(null)}
          onPick={(it) => { assignFloor(openFloor, it?.id || ""); setOpenFloor(null); }}
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
