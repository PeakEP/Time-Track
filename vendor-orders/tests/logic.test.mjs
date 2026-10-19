import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCutoff, suggestCoa, buildCSV, fmtCountdown, coaName, phaseName, CSV_COLUMNS, squareMatrix, mdy, poFilename, SQUARE_HEADERS } from "../src/logic.js";

const tue = { weekday: 2, cutoff: "10:00", timezone: "America/Halifax" };

test("cutoff is 10:00 Halifax in summer (ADT, UTC-3)", () => {
  const now = new Date("2026-09-21T12:00:00Z"); // Mon
  assert.equal(nextCutoff(tue, now).toISOString(), "2026-09-22T13:00:00.000Z");
});
test("cutoff is 10:00 Halifax in winter (AST, UTC-4)", () => {
  const now = new Date("2026-12-07T12:00:00Z");
  assert.equal(nextCutoff(tue, now).toISOString(), "2026-12-08T14:00:00.000Z");
});
test("cutoff rolls to next week once passed on the day", () => {
  const now = new Date("2026-09-22T13:00:01Z"); // Tue 10:00:01 ADT
  assert.equal(nextCutoff(tue, now).toISOString(), "2026-09-29T13:00:00.000Z");
});
test("cutoff across DST change (Nov 1 2026)", () => {
  const now = new Date("2026-10-28T12:00:00Z"); // Wed, ADT
  assert.equal(nextCutoff(tue, now).toISOString(), "2026-11-03T14:00:00.000Z");
});
test("cutoff uses Halifax date, not UTC date, late in the evening", () => {
  // Mon 22:30 ADT = Tue 01:30 UTC → next Tue cutoff is the same Tuesday
  const now = new Date("2026-09-22T01:30:00Z");
  assert.equal(nextCutoff(tue, now).toISOString(), "2026-09-22T13:00:00.000Z");
});
test("countdown format", () => {
  assert.equal(fmtCountdown(0), null);
  assert.equal(fmtCountdown(90 * 60000), "1h 30m");
  assert.equal(fmtCountdown((2 * 1440 + 61) * 60000), "2d 1h 1m");
});
test("COA suggest: longest keyword wins, no guess on miss", () => {
  assert.equal(suggestCoa("Oak LVP 7in"), "5515"); // flooring material now 5515
  assert.equal(suggestCoa("Brass pendants"), "5525");
  assert.equal(suggestCoa("Painting crew deposit"), "5540"); // "painting" → Sub - Painting
  assert.equal(suggestCoa("Mystery widget"), "");
  assert.equal(coaName("5515"), "Flooring & Tile Material");
  assert.equal(coaName("5540"), "Sub - Painting"); // same code, new meaning in the 2026-10 COA
  assert.equal(phaseName("5515"), "Phase 5 - Finishes & Specialties");
  // showroom/warehouse inventory accounts are pickable, grouped on their own
  assert.equal(coaName("1245"), "Flooring");
  assert.equal(phaseName("1245"), "Showroom & Warehouse Inventory");
  // non-postable / dropped accounts never appear in the picker
  assert.equal(coaName("7130"), ""); // 7000-series G&A dropped
  assert.equal(coaName("5020"), ""); // payroll / labour burden excluded
  assert.equal(coaName("5000"), ""); // header rollup excluded
});
test("CSV has the agreed columns, escaping and subtotal", () => {
  const csv = buildCSV("MSI", "Tuesday", [
    { po: "P1", coa: "5515", productName: 'Tile, "grey"', qty: 2, cost: 10.5, unit: "box" },
    { po: "P1", coa: "5515", productName: "Grout", qty: 1, cost: 4 },
  ], "Mike");
  const lines = csv.trim().split("\n");
  assert.equal(lines[6], CSV_COLUMNS.join(","));
  assert.match(lines[7], /"Tile, ""grey"""/);
  assert.match(lines[7], /,21\.00,$/);
  assert.match(lines.at(-1), /SUBTOTAL \(ex\. HST\),25\.00,$/);
});
test("Square import matrix matches the template layout", () => {
  const lines = [
    { productName: "Oak LVP", sku: "NC045", description: "7in plank", qty: 10, cost: 3.5, neededBy: "2026-02-01" },
    { productName: "Grout", sku: "", description: "", qty: 2, cost: 4 },
  ];
  const m = squareMatrix({ vendor: "MSI", shipTo: "", expectedOn: mdy("2026-02-01"), notes: "JMRC PO(s): A1", lines });
  assert.deepEqual(m[3], ["Vendor", "MSI"]); // row 4
  assert.deepEqual(m[4], ["Ship to", ""]); // row 5
  assert.deepEqual(m[5], ["Expected On", "2/1/2026"]); // row 6
  assert.deepEqual(m[6], ["Notes", "JMRC PO(s): A1"]); // row 7
  assert.deepEqual(m[8], SQUARE_HEADERS); // row 9 header
  assert.deepEqual(m[9], ["Oak LVP", "", "NC045", "", "", "7in plank", "10", "3.50"]); // row 10
  assert.deepEqual(m[10], ["Grout", "", "", "", "", "", "2", "4.00"]);
});
test("mdy formats dates for Square; poFilename is safe", () => {
  assert.equal(mdy("2026-02-01"), "2/1/2026");
  assert.equal(mdy(""), "");
  assert.equal(mdy("not a date"), "");
  assert.ok(poFilename("MSI Inc.", "xlsx").startsWith("PO_MSI_Inc"));
  assert.ok(poFilename("MSI", "pdf").endsWith(".pdf"));
});
