// Engine tests: takeoff quantities, catalog matching, pricing and the review
// rules. The TypeScript engine is bundled with esbuild on the fly. Uses a
// tiny made-up catalog (the real cost catalog is uploaded in the app, never
// committed — this repository is public).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
let E;

before(async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qb-")), "engine.mjs");
  await build({
    stdin: {
      contents: `export * from "./src/engine/catalog"; export * from "./src/engine/takeoff"; export * from "./src/engine/pricing";
                 export * from "./src/data/questions"; export * from "./src/data/defaultSettings"; export * from "./src/engine/cabinets";
                 export { EXCLUDED } from "./src/types";`,
      resolveDir: path.join(here, ".."), loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent",
  });
  E = await import(pathToFileURL(out).href);
});

const CSV = `Cost Item Name,Description,Unit,Unit Cost,Cost Code,Cost Type
EXT. STUDS,"2 x 6 x 8' SPF Stud Kiln Dried",EA,5.50,0602 Studs,Materials
2x6x14,"2 x 6 x 14' #2 & Better SPF Lumber Kiln Dried",EA,10.00,0601 Framing Lumber,Materials
OSB,"7/16"" x 4' x 8' OSB",SH,12.00,0603 Sheathing,Materials
Shingle,"Cambridge Dual Black Architectural Shingle - 33.3 SqFt/bdl",EA,40.00,0901 Shingles & Roofing Accessories,Materials
Vanity,"HDF Vanity Cabinets as per drawings",EA,0.00,1110 Vanities,Materials
SPC A,"SPC Ridgelock PRO, Aspen (Square SKU NC045)",SF,1.25,1701 SPC Flooring,Materials
Paint,"Paint, 5-Gallon, Satin, Greek Villa",EA,300.00,2301 Interior Paint,Materials
Sconce,"Dainolite sconce DAY-161W-AGB-CLR",EA,,1005 Sconces,Materials
`;

test("CSV import keeps blanks and $0.00 unpriced and reads Square SKUs", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  assert.equal(items.length, 8);
  const vanity = items.find((i) => i.name === "Vanity");
  assert.equal(vanity.unitCost, null);
  assert.equal(items.find((i) => i.name === "Sconce").unitCost, null);
  assert.equal(items.find((i) => i.name === "SPC A").sku, "NC045");
  // ids are stable across re-imports
  assert.equal(E.parseJmrcCatalog(CSV).items[0].id, items[0].id);
});

test("CSV import rejects a file without the catalog columns", () => {
  assert.throws(() => E.parseJmrcCatalog("a,b\n1,2"), /Missing column/);
});

test("Square cost replaces the JMRC cost for the same SKU", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const sq = [{ id: "sq:1", source: "square", name: "SPC Ridgelock PRO, Aspen", description: "", unit: "SF", unitCost: 1.3, costCode: "SPC", sku: "NC045", retail: 3.4 }];
  const merged = E.mergeCatalogs(items, sq);
  assert.equal(merged.length, items.length);
  assert.equal(merged.find((i) => i.sku === "NC045").unitCost, 1.3);
});

test("slope factor matches the takeoff standard table", () => {
  assert.equal(E.slopeFactor(6).toFixed(4), "1.1180");
  assert.equal(E.slopeFactor(8).toFixed(4), "1.2019");
  assert.equal(E.slopeFactor(12).toFixed(4), "1.4142");
});

function shopQuote() {
  const q = E.newQuote("shop", "test");
  Object.assign(q.answers, { length: 40, width: 30, wallHeight: 8, roofPitch: 6, eaveOverhang: 1, rakeOverhang: 1, windowCount: 0, extDoorCount: 0, overheadDoorCount: 0, foundation: "existing" });
  return q;
}

test("new build takeoff: studs, plates, sheathing and shingles", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const lines = E.buildLines(shopQuote(), s, items);
  const get = (k) => lines.find((l) => l.toolKey === k);
  // P = 140 LF → 140*12/16 = 105 + 1 field + 12 corner = 118 studs, +10% → 130
  assert.equal(get("stud2x6_8").qty, 130);
  assert.equal(get("stud2x6_8").unitCost, 5.5);
  // Plates: 140 × 3 = 420 LF +10% = 462 / 14 = 33
  assert.equal(get("plate2x6").qty, 33);
  // Sheathing: walls 140×8 = 1120 + gables 2 × (30 × 7.5 / 2) = 225 → 1345 × 1.1 / 32 = 46.2 → 47
  assert.equal(get("wallSheathing").qty, 47);
  // Roof: (40+2) × (15+1) × 1.1180 × 2 = 1502.6 SF × 1.1 / 33.3 = 49.6 → 50 bundles
  assert.equal(get("shingles").qty, 50);
});

test("labour is priced in hours from the hourly rate; only subs and unpriced items are questions", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = shopQuote();
  q.answers.clientName = "A"; q.answers.siteAddress = "B";
  const r = E.computeQuote(q, s, items);
  // Framing labour: 1200 SF ÷ 8 SF/hr = 150 hr @ $40/hr
  const fr = r.lines.find((l) => l.toolKey === "lab.framing");
  assert.equal(fr.unit, "hr");
  assert.equal(fr.qty, 150);
  assert.equal(fr.unitCost, 40);
  assert.equal(fr.marginKey, "labour");
  // labour sell at 50% margin = cost / 0.5 = $80/hr
  const pl = E.priceLines(q, [fr], s).lines[0];
  assert.equal(pl.sell, fr.qty * 80);
  // No labour rate questions (labour always prices); no margin questions (defaults set)
  assert.ok(!r.questions.some((x) => x.kind === "rate" && x.key.startsWith("lab.")));
  assert.ok(!r.questions.some((x) => x.kind === "margin"));
  // Subs ARE questions (rep enters the sub's quote)
  assert.ok(r.questions.some((x) => x.kind === "rate" && x.key.startsWith("sub.")));
  assert.equal(r.needsOwner, false);
  // Owner policy: a minimum margin can still force approval
  s.pricing.minMargin = 0.9;
  for (const x of r.questions) if (x.kind === "rate") q.rates[x.key] = 1;
  for (const l of r.lines) if (l.unitCost == null && l.kind === "material") q.overrides[l.id] = { unitCost: 1 };
  const r2 = E.computeQuote(q, s, items);
  assert.equal(r2.needsOwner, true);
  assert.equal(E.canSend(q, r2), false);
});

test("pricing: margins by category and code, line override, 15% PM fee, HST", () => {
  const s = E.defaultSettings();
  s.pricing.margins = { material: 0.2, finish: 0.5, cabinets: 0.5, labour: 0.5, sub: 0.2, allowance: 0.2 };
  const q = shopQuote();
  const lines = [
    { id: "a", section: "x", kind: "material", description: "m", qty: 10, unit: "EA", unitCost: 10, source: "catalog", costCode: "0602 Studs", flags: [] },
    { id: "b", section: "x", kind: "labour", description: "l", qty: 1, unit: "EA", unitCost: 100, source: "rate", flags: [] },
    { id: "c", section: "x", kind: "material", description: "tile", qty: 1, unit: "SF", unitCost: 100, source: "catalog", costCode: "1801 Porcelain Tile", flags: [] },
  ];
  let { totals, lines: pl } = E.priceLines(q, lines, s);
  assert.equal(pl[0].sell, 125); // 100 ÷ 0.8
  assert.equal(pl[1].sell, 200); // 100 ÷ 0.5
  assert.equal(pl[2].marginKey, "finish");
  assert.equal(pl[2].sell, 200);
  assert.equal(totals.cost, 300);
  assert.equal(totals.sellBeforeFees, 525);
  assert.equal(totals.pmFee, 78.75);
  assert.equal(totals.subtotal, 603.75);
  assert.equal(totals.hst, 90.56);
  // code margin beats the category; quote margin beats the code; line beats all
  s.pricing.codeMargins = { "1801": 0.6 };
  assert.equal(E.priceLines(q, lines, s).lines[2].sell, 250);
  q.margins = { finish: 0.75 };
  assert.equal(E.priceLines(q, lines, s).lines[2].sell, 400);
  q.overrides = { c: { margin: 0 } };
  assert.equal(E.priceLines(q, lines, s).lines[2].sell, 100);
  // renovations carry no PM fee
  assert.equal(E.priceLines({ ...q, type: "renovation" }, lines, s).totals.pmFee, 0);
});

test("store retail: Square products sell at retail when switched on", () => {
  const s = E.defaultSettings();
  s.pricing.margins.finish = 0.3;
  s.pricing.useStoreRetail = true;
  const items = new Map([["sq:1", { id: "sq:1", source: "square", name: "SPC", description: "", unit: "SF", unitCost: 1, retail: 3.4, costCode: "1701" }]]);
  const lines = [{ id: "f", section: "Flooring", kind: "material", description: "SPC", qty: 100, unit: "SF", unitCost: 1, source: "square", catalogItemId: "sq:1", costCode: "1701 SPC", flags: [] }];
  const r = E.priceLines(E.newQuote("renovation", "t"), lines, s, items);
  assert.equal(r.lines[0].sell, 340);
  assert.equal(r.lines[0].marginFrom, "retail");
});

test("renovation rooms: flooring net of cabinets, paint in 5-gal pails, vanity as per drawings", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen");
  Object.assign(k, { length: 12, width: 10, cabinetLF: 10 });
  const b = E.newRoom("bathroom");
  q.answers.rooms = [k, b];
  q.answers.floorItemIds = { spc: items.find((i) => i.name === "SPC A").id };
  q.answers.paintItemId = items.find((i) => i.name === "Paint").id;
  const lines = E.buildLines(q, s, items);
  const floor = lines.find((l) => l.id === `floor@${k.id}`);
  // 120 − 10×2 = 100 SF + 10% = 110
  assert.equal(floor.qty, 110);
  assert.equal(floor.unitCost, 1.25);
  const paint = lines.find((l) => l.id === `paint@${k.id}`);
  // walls (2×22×8 − 1 door 17.8 − 1 window 12) = 322.2 × 2 coats = 644.4 × 1.05 / (350 × 5) → 1 pail
  assert.equal(paint.qty, 1);
  const vanity = lines.find((l) => l.id === `vanity@${b.id}`);
  assert.equal(vanity.unitCost, null);
  assert.ok(vanity.flags.includes("priced as per drawings"));
});

test("floor type prices from its own cost code by default", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const r = E.newRoom("bedroom"); // non-wet rooms default to SPC
  Object.assign(r, { length: 10, width: 10, cabinetLF: 0 });
  assert.equal(r.floor, "spc");
  q.answers.rooms = [r];
  const floor = E.buildLines(q, s, items).find((l) => l.id === `floor@${r.id}`);
  // Resolves within the SPC code (1701) with no product chosen, 100 SF + 10%
  assert.match(floor.costCode, /^1701/);
  assert.equal(floor.unitCost, 1.25);
  assert.equal(floor.qty, 110);
});

test("a product marked Not included is dropped from the takeoff", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen");
  Object.assign(k, { countertopSF: 30 });
  q.answers.rooms = [k];
  const has = (ls) => ls.some((l) => /countertop/i.test(l.description));
  assert.ok(has(E.buildLines(q, s, items)));
  q.answers.countertopItemId = E.EXCLUDED;
  assert.ok(!has(E.buildLines(q, s, items)));
});

test("overrides: removed lines vanish, a typed price is flagged for review", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = shopQuote();
  q.overrides = { shingles: { removed: true }, plate2x6: { unitCost: 9 } };
  const r = E.computeQuote(q, s, items);
  assert.ok(!r.lines.find((l) => l.id === "shingles"));
  assert.equal(r.lines.find((l) => l.id === "plate2x6").source, "manual");
  assert.ok(r.issues.some((i) => /entered on this quote/.test(i.message)));
});

test("mergeSettings keeps owner edits and adds new tools", () => {
  const saved = { components: [{ key: "shingles", pinnedItemId: "jmrc:x", coverage: 32 }], labour: [{ key: "lab.framing", perHour: 10 }], rates: [{ key: "sub.concrete", value: 250 }], pricing: { materialMarkup: 0.25, hideCostsFromSales: true } };
  const s = E.mergeSettings(saved);
  assert.equal(s.components.find((c) => c.key === "shingles").pinnedItemId, "jmrc:x");
  assert.equal(s.components.find((c) => c.key === "shingles").coverage, 32);
  assert.ok(s.components.find((c) => c.key === "stud2x6_8"));
  assert.equal(s.labour.find((l) => l.key === "lab.framing").perHour, 10);
  assert.ok(s.labour.find((l) => l.key === "lab.drywall")); // new tasks still added
  assert.equal(s.rates.find((r) => r.key === "sub.concrete").value, 250);
  // old markup 25% → margin 20%
  assert.equal(s.pricing.margins.material, 0.2);
  assert.equal(s.pricing.materialMarkup, undefined);
  assert.equal(s.pricing.hideCostsFromSales, undefined);
  assert.equal(s.pricing.hst, 0.15);
});

// Tiny made-up supplier files in the cabinet-quoting skill's format.
const OPPEIN = { supplier: "Oppein", discount: 0.58, tiers: ["essential", "premium"], tier_names: { essential: "Essential", premium: "Premium" },
  colors: [{ code: "MPW", name: "Pure White", tier: "essential" }, { code: "BSS", name: "Blue Shaker", tier: "premium" }],
  products: [{ sku: "B24", desc: "Base 24", dims: "", pb: { essential: 100, premium: 120 }, ply: { essential: 150, premium: 200 } }] };
const ALINE = { supplier: "Aline", discount: 0.66, door_styles: { shaker: { name: "Shaker", colors: [{ code: "SW", name: "Shaker White" }] } },
  products: [{ sku: "B24", desc: "Base", dims: "", prices: { shaker: { pb: 300, ply: 400, door: 100 } } }] };
const DIVINE = { supplier: "Divine", discount: 0.55, style_finish_map: { S7: { finish: "Hudson", profile: "Shaker" } }, assembly_per_unit: { "Base Units": 40 }, shipping_default: 150,
  products: [{ code: "B24", desc: "Base", cat: "Base Units", base_price: 200, prices: { S7: 200, E9: 210 } }], shared: [{ sku: "SINK1", desc: "Sink", price: 300 }] };

test("cabinet pricing matches the skill: list less each supplier's dealer discount", () => {
  const op = E.priceCabinet({ supplier: "oppein", box: "PLY", color: "BSS", style: "" }, OPPEIN, "b24");
  assert.equal(op.list, 200); assert.equal(op.dealer, 84); // 200 × 0.42
  assert.equal(E.priceCabinet({ supplier: "oppein", box: "PB", color: "MPW", style: "" }, OPPEIN, "B24").dealer, 42);
  const al = E.priceCabinet({ supplier: "aline", box: "PLY", color: "SW", style: "shaker" }, ALINE, "B24");
  assert.equal(al.list, 500); assert.equal(al.dealer, 170); // (400 + 100) × 0.34
  const dv = E.priceCabinet({ supplier: "divine", box: "PLY", color: "", style: "S7" }, DIVINE, "S7-B24");
  assert.equal(dv.list, 200); assert.equal(dv.dealer, 90); assert.equal(dv.assemblyEach, 40);
  assert.equal(E.priceCabinet({ supplier: "divine", box: "PLY", color: "", style: "S7" }, DIVINE, "SINK1").dealer, 135);
  assert.equal(E.priceCabinet({ supplier: "oppein", box: "PLY", color: "BSS", style: "" }, OPPEIN, "W9999"), null);
  assert.deepEqual(E.parseSkuList("B24:2, W3030 x3\nSB36"), [{ sku: "B24", qty: 2 }, { sku: "W3030", qty: 3 }, { sku: "SB36", qty: 1 }]);
});

test("a cabinet order replaces the room's allowance and vanity; unknown SKUs become questions", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen"); const b = E.newRoom("bathroom");
  q.answers.rooms = [k, b];
  let r = E.computeQuote(q, s, items, { oppein: OPPEIN, divine: DIVINE });
  // No cabinets are priced per linear foot: an uncovered kitchen is a question, not a line.
  assert.ok(!r.lines.some((l) => l.id.startsWith("cab:")));
  assert.ok(r.questions.some((x) => x.kind === "cabinets" && x.roomId === k.id));
  q.cabinetSets = [
    { id: "k1", name: "Kitchen", roomId: k.id, supplier: "oppein", box: "PLY", color: "BSS", style: "", assemble: false, shipping: 0, lines: [{ id: "a", sku: "B24", qty: 2 }, { id: "b", sku: "ZZ99", qty: 1 }], notes: "" },
    { id: "v1", name: "Bath vanity", roomId: b.id, supplier: "divine", box: "PLY", color: "", style: "S7", assemble: true, shipping: 150, lines: [{ id: "c", sku: "B24", qty: 1 }], notes: "" },
  ];
  r = E.computeQuote(q, s, items, { oppein: OPPEIN, divine: DIVINE });
  assert.ok(!r.lines.some((l) => l.id === `cab@${k.id}`));
  assert.ok(!r.lines.some((l) => l.id === `vanity@${b.id}`));
  const line = r.lines.find((l) => l.id === "cab:k1:a");
  assert.equal(line.unitCost, 84); assert.equal(line.marginKey, "cabinets");
  assert.equal(r.lines.find((l) => l.id === "cab:v1:assembly").unitCost, 40);
  assert.equal(r.lines.find((l) => l.id === "cab:v1:freight").unitCost, 150);
  const qn = r.questions.find((x) => x.kind === "cabinetSku");
  assert.equal(qn.sku, "ZZ99");
  assert.ok(!r.questions.some((x) => x.kind === "cabinets"));
});

test("a cabinet package allowance prices as one lump-sum line (no per-LF)", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen");
  q.answers.rooms = [k];
  q.cabinetSets = [
    { id: "pk1", name: "Kitchen", roomId: k.id, supplier: "oppein", box: "PLY", color: "", style: "", assemble: false, shipping: 0, lines: [], allowance: 9000, unit: "PKG", notes: "" },
  ];
  const r = E.computeQuote(q, s, items, { oppein: OPPEIN, divine: DIVINE });
  const line = r.lines.find((l) => l.id === "cab:pk1:allow");
  assert.ok(line, "the allowance line exists");
  assert.equal(line.qty, 1);
  assert.equal(line.unit, "PKG");
  assert.equal(line.unitCost, 9000);
  assert.equal(line.extCost, 9000);
  assert.equal(line.kind, "allowance");
  assert.equal(line.marginKey, "cabinets");
  // Nothing is priced per linear foot of cabinet.
  assert.ok(!r.lines.some((l) => l.unit === "LF" && /cabinet/i.test(l.description)));
  // The kitchen is covered by the allowance, so there's no "which cabinets?" question.
  assert.ok(!r.questions.some((x) => x.kind === "cabinets"));
});

test("Takeoff (notes & drawings) is step 2 for every project type", () => {
  for (const t of ["renovation", "remodel", "shop", "custom-home"]) {
    const steps = E.stepsFor(t);
    assert.equal(steps[0].id, "client", `${t}: step 1 is client & project`);
    assert.equal(steps[1].id, "documents", `${t}: step 2 is the takeoff`);
  }
});

test("Products show only what's in scope: a kitchen has no bath fixtures", () => {
  const q = E.newQuote("renovation", "t");
  q.answers.rooms = [E.newRoom("kitchen")];
  const keys = E.productsInScope(q.answers, "renovation").map((p) => p.key);
  for (const k of ["countertopItemId", "backsplashItemId", "paintItemId", "lightFixtureItemId", "kitchenSinkItemId", "kitchenFaucetItemId", "cabinetHardwareItemId", "underCabinetLightItemId"]) assert.ok(keys.includes(k), `kitchen should include ${k}`);
  for (const k of ["toiletItemId", "vanityItemId", "faucetItemId", "tubItemId", "showerTileItemId"]) assert.ok(!keys.includes(k), `kitchen should NOT include ${k}`);
  assert.deepEqual(E.floorTypesInScope(q.answers, "renovation"), ["spc"]);
});

test("Products show bath fixtures for a bathroom, with a tile floor", () => {
  const q = E.newQuote("renovation", "t");
  q.answers.rooms = [E.newRoom("bathroom")];
  const keys = E.productsInScope(q.answers, "renovation").map((p) => p.key);
  for (const k of ["toiletItemId", "vanityItemId", "faucetItemId", "tubItemId", "showerTileItemId", "paintItemId", "lightFixtureItemId"]) assert.ok(keys.includes(k), `bathroom should include ${k}`);
  for (const k of ["countertopItemId", "backsplashItemId", "kitchenSinkItemId", "kitchenFaucetItemId", "cabinetHardwareItemId", "underCabinetLightItemId"]) assert.ok(!keys.includes(k), `bathroom should NOT include ${k}`);
  assert.deepEqual(E.floorTypesInScope(q.answers, "renovation"), ["tile"]);
});

test("a kitchen emits sink, faucet, cabinet hardware and under-cabinet lighting lines", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen"); // 16 LF of cabinets by default
  q.answers.rooms = [k];
  const r = E.computeQuote(q, s, items, {});
  const ids = r.lines.map((l) => l.id);
  for (const p of ["ksink", "kfaucet", "cabhw", "ucl"]) assert.ok(ids.includes(`${p}@${k.id}`), `missing ${p} line`);
  const hw = r.lines.find((l) => l.id === `cabhw@${k.id}`);
  assert.ok(hw.qty >= 32, `cabinet hardware should be ~2 per LF (got ${hw.qty})`); // 16 LF × 2 + waste
  // A bathroom-only job has none of them.
  q.answers.rooms = [E.newRoom("bathroom")];
  const r2 = E.computeQuote(q, s, items, {});
  for (const p of ["ksink", "kfaucet", "cabhw", "ucl"]) assert.ok(!r2.lines.some((l) => l.id.startsWith(`${p}@`)), `bathroom should not emit ${p}`);
});

test("custom-home products follow the interior answers", () => {
  const q = E.newQuote("custom-home", "t");
  Object.assign(q.answers, { bathroomCount: 2, countertopSF: 40, showerTileSF: 0, lightFixtureCount: 10, flooringType: "lvt", tileFloorSF: 60, interiorDoorCount: 8 });
  const keys = E.productsInScope(q.answers, "custom-home").map((p) => p.key);
  for (const k of ["toiletItemId", "vanityItemId", "faucetItemId", "tubItemId", "countertopItemId", "lightFixtureItemId", "paintItemId", "interiorDoorItemId"]) assert.ok(keys.includes(k), `custom-home should include ${k}`);
  assert.ok(!keys.includes("showerTileItemId"), "no shower tile when showerTileSF is 0");
  assert.ok(!keys.includes("backsplashItemId"), "backsplash isn't itemized on new builds");
  assert.deepEqual(E.floorTypesInScope(q.answers, "custom-home").sort(), ["lvt", "tile"]);
});

test("workbook: margins by cost code from the retail reference", () => {
  const sheets = { "Retail Reference (JobTread)": [["Cost Code", "Item", "Unit Cost", "JobTread Retail", "Markup x"], [], ["1801 Porcelain Tile", "a", 2, 4, 2], ["1801 Porcelain Tile", "b", 3, 6, 2], ["1801 Porcelain Tile", "c", 1, 1.5, 1.5], ["1009 Fans", "d", 10, 12, 1.2]] };
  const r = E.marginsFromRetail(sheets);
  assert.deepEqual(r.margins, { "1801": 0.5 }); // median ×2; 1009 has too few items
  const wb = { "Master Catalog": [["Parent Group", "Cost Code", "Cost Type", "Brand", "Cost Item Name", "Description", "Unit", "Unit Cost"], ["▸ Framing"], [null, "0602 Studs"], ["Framing", "0602 Studs", "Materials", null, "Stud", "2 x 6 x 8'", "EA", 5.5]] };
  const p = E.parseJmrcWorkbook(wb);
  assert.equal(p.items.length, 1);
  assert.equal(p.items[0].unitCost, 5.5);
});
