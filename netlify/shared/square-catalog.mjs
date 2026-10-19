// Robins Interiors Square catalog → Quote Builder catalog items.
//
// JMRC's cost for a Square product is the variation's Default Unit Cost
// (falling back to the vendor cost on the variation). The retail price is
// kept for reference only and is never used as a cost.

const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2025-01-23";

const AREA = { IMPERIAL_SQUARE_FOOT: "SF", IMPERIAL_SQUARE_INCH: "SI", IMPERIAL_SQUARE_YARD: "SY", METRIC_SQUARE_METER: "M2" };
const LENGTH = { IMPERIAL_FOOT: "LF", IMPERIAL_INCH: "IN", IMPERIAL_YARD: "YD", METRIC_METER: "M" };

export function unitOf(mu) {
  const m = mu?.measurement_unit_data?.measurement_unit;
  if (!m) return "EA";
  if (m.area_unit) return AREA[m.area_unit] || "SF";
  if (m.length_unit) return LENGTH[m.length_unit] || "LF";
  if (m.custom_unit) return String(m.custom_unit.abbreviation || m.custom_unit.name || "EA").toUpperCase().slice(0, 10);
  return "EA";
}

const cents = (m) => (m && Number.isFinite(Number(m.amount)) ? Number(m.amount) / 100 : null);

// Pure mapping (tested): Square catalog objects → items.
export function mapSquareObjects(objects) {
  const units = new Map(), cats = new Map();
  for (const o of objects) {
    if (o.type === "MEASUREMENT_UNIT") units.set(o.id, unitOf(o));
    if (o.type === "CATEGORY") cats.set(o.id, o.category_data?.name || "");
  }
  const items = [];
  let skipped = 0;
  for (const o of objects) {
    if (o.type !== "ITEM" || o.is_deleted) continue;
    const d = o.item_data || {};
    if (d.is_archived) continue;
    const catId = d.reporting_category?.id || d.categories?.[0]?.id || d.category_id;
    const category = cats.get(catId) || "Square";
    for (const v of d.variations || []) {
      if (v.is_deleted) continue;
      const vd = v.item_variation_data || {};
      const vendor = vd.item_variation_vendor_infos?.[0]?.item_variation_vendor_info_data?.price_money;
      const cost = cents(vd.default_unit_cost) ?? cents(vendor);
      if (cost == null || cost <= 0) { skipped++; continue; }
      const vname = vd.name && !/^regular$/i.test(vd.name) ? vd.name : "";
      items.push({
        id: `sq:${v.id}`,
        source: "square",
        name: vname ? `${d.name} — ${vname}` : d.name || vname,
        description: [d.description_plaintext || d.description || "", vd.sku ? `(SKU ${vd.sku})` : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || d.name,
        unit: units.get(vd.measurement_unit_id) || "EA",
        unitCost: cost,
        costCode: category,
        ...(vd.sku ? { sku: vd.sku } : {}),
        retail: cents(vd.price_money),
      });
    }
  }
  return { items, skipped };
}

export async function syncSquareCatalog({ token, fetchImpl = fetch }) {
  const objects = [];
  let cursor = "";
  for (let page = 0; page < 200; page++) {
    const url = `${SQUARE_API}/catalog/list?types=ITEM,CATEGORY,MEASUREMENT_UNIT${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, "square-version": SQUARE_VERSION, accept: "application/json" } });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const msg = body.errors?.[0]?.detail || `Square returned ${r.status}`;
      throw Object.assign(new Error(`Square sync failed: ${msg}`), { status: 502 });
    }
    const body = await r.json();
    objects.push(...(body.objects || []));
    cursor = body.cursor || "";
    if (!cursor) break;
  }
  return mapSquareObjects(objects);
}
