import { useState } from "react";
import { useApp } from "../store";
import { PRODUCT_PICKS } from "../data/questions";
import type { Answers } from "../types";
import { itemLabel, resolveComponent } from "../engine/catalog";
import CatalogPicker from "./CatalogPicker";
import { money } from "../utils/format";

// Which takeoff tool each product pick replaces (to show the default).
const TOOL_FOR: Partial<Record<keyof Answers, string>> = {
  flooringItemId: "flooring", tileItemId: "tile", showerTileItemId: "tile", backsplashItemId: "backsplash",
  countertopItemId: "countertop", paintItemId: "wallPaint", interiorDoorItemId: "interiorDoor",
  lightFixtureItemId: "lightFixture", toiletItemId: "toilet", vanityItemId: "vanity", faucetItemId: "faucet", tubItemId: "tub",
};

export default function ProductsStep() {
  const { quote, update, byId, items, settings, me } = useApp();
  const [open, setOpen] = useState<(typeof PRODUCT_PICKS)[number] | null>(null);
  if (!quote) return null;
  const showCost = me?.admin || !settings.pricing.hideCostsFromSales;
  const picks = PRODUCT_PICKS.filter((p) => !p.types || p.types.includes(quote.type));

  return (
    <div className="card">
      <div className="grid two">
        {picks.map((p) => {
          const id = quote.answers[p.key] as string;
          const it = id ? byId.get(id) : undefined;
          const tool = settings.components.find((c) => c.key === TOOL_FOR[p.key]);
          const def = tool ? resolveComponent(tool, byId, items).item : null;
          return (
            <div className="field" key={p.key}>
              <span>{p.label}</span>
              <div className="product-pick">
                <div className="chosen">
                  {it ? <>{itemLabel(it)} <span className="muted">· {it.unit}{showCost && it.unitCost != null ? ` · ${money(it.unitCost)}` : ""}</span></>
                    : <span className="muted">Default: {def ? itemLabel(def) : "none set"}</span>}
                  {it && it.unitCost == null && <span className="pill warn" style={{ marginLeft: 6 }}>no price — as per drawings / quote</span>}
                </div>
                <button type="button" className="btn sm" onClick={() => setOpen(p)}>Choose</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        For custom homes these become the allowance amounts. The client makes their final colour and finish selections with Robins Interiors &amp; Design.
      </p>
      {open && (
        <CatalogPicker
          title={`Choose ${open.label.toLowerCase()}`}
          codes={open.codes}
          allowClear
          onClose={() => setOpen(null)}
          onPick={(it) => { update((q) => { (q.answers as unknown as Record<string, string>)[open.key] = it?.id || ""; }); setOpen(null); }}
        />
      )}
    </div>
  );
}
