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
                 export * from "./src/data/questions"; export * from "./src/data/defaultSettings";`,
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

test("unset rates and markups stay unpriced and block the quote", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const r = E.computeQuote(shopQuote(), s, items);
  assert.ok(r.blocked);
  assert.ok(r.issues.some((i) => /Markups aren't set/.test(i.message)));
  const framing = r.lines.find((l) => l.toolKey === "lab.framing");
  assert.equal(framing.unitCost, null);
  assert.equal(framing.extCost, 0);
});

test("pricing: markups, 15% PM fee on new builds, HST", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  s.pricing.materialMarkup = 0.2; s.pricing.labourMarkup = 0.1; s.pricing.subMarkup = 0.1;
  const q = shopQuote();
  const lines = [
    { id: "a", section: "x", kind: "material", description: "m", qty: 10, unit: "EA", unitCost: 10, source: "catalog", flags: [] },
    { id: "b", section: "x", kind: "labour", description: "l", qty: 1, unit: "EA", unitCost: 100, source: "rate", flags: [] },
  ];
  const { totals } = E.priceLines(q, lines, s);
  assert.equal(totals.cost, 200);
  assert.equal(totals.sellBeforeFees, 230); // 120 + 110
  assert.equal(totals.pmFee, 34.5);
  assert.equal(totals.subtotal, 264.5);
  assert.equal(totals.hst, 39.68);
  assert.equal(totals.total, 304.18);
  // renovations carry no PM fee
  assert.equal(E.priceLines({ ...q, type: "renovation" }, lines, s).totals.pmFee, 0);
});

test("renovation rooms: flooring net of cabinets, paint in 5-gal pails, vanity as per drawings", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = E.newQuote("renovation", "t");
  const k = E.newRoom("kitchen");
  Object.assign(k, { length: 12, width: 10, cabinetLF: 10 });
  const b = E.newRoom("bathroom");
  q.answers.rooms = [k, b];
  q.answers.flooringItemId = items.find((i) => i.name === "SPC A").id;
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

test("overrides: removed lines vanish, a typed price is flagged for review", () => {
  const { items } = E.parseJmrcCatalog(CSV);
  const s = E.defaultSettings();
  const q = shopQuote();
  q.overrides = { shingles: { removed: true }, plate2x6: { unitCost: 9 } };
  const r = E.computeQuote(q, s, items);
  assert.ok(!r.lines.find((l) => l.id === "shingles"));
  assert.equal(r.lines.find((l) => l.id === "plate2x6").source, "manual");
  assert.ok(r.issues.some((i) => /typed by hand/.test(i.message)));
});

test("mergeSettings keeps owner edits and adds new tools", () => {
  const saved = { components: [{ key: "shingles", pinnedItemId: "jmrc:x", coverage: 32 }], rates: [{ key: "lab.framing", value: 5 }], pricing: { materialMarkup: 0.25 } };
  const s = E.mergeSettings(saved);
  assert.equal(s.components.find((c) => c.key === "shingles").pinnedItemId, "jmrc:x");
  assert.equal(s.components.find((c) => c.key === "shingles").coverage, 32);
  assert.ok(s.components.find((c) => c.key === "stud2x6_8"));
  assert.equal(s.rates.find((r) => r.key === "lab.framing").value, 5);
  assert.equal(s.pricing.materialMarkup, 0.25);
  assert.equal(s.pricing.hst, 0.15);
});
