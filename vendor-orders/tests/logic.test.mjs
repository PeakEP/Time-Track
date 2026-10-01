import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCutoff, suggestCoa, fmtCountdown, coaName, phaseName, poTotals, COST } from "../src/logic.js";
import { buildPoPdf, poFileName } from "../src/po-pdf.js";

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
  assert.equal(suggestCoa("Oak LVP 7in"), "5515");
  assert.equal(suggestCoa("Brass pendant"), "5525");
  assert.equal(suggestCoa("Kitchen faucet"), "5526");
  assert.equal(suggestCoa("Drywall sub for basement"), "5347");
  assert.equal(suggestCoa("Mystery widget"), "");
  assert.equal(coaName("5515"), "Flooring & Tile Material");
  assert.equal(coaName("5540"), "Sub - Painting");
  assert.equal(phaseName("5515"), "Phase 5 - Finishes & Specialties");
  assert.equal(phaseName("1245"), "Inventory - Showroom & Warehouse");
});
test("cost codes come from the chart of accounts: postable accounts only", () => {
  assert.equal(Object.keys(COST.codes).length, 78);
  for (const header of ["5000", "5100", "5310", "5501", "5502", "5580", "1240", "1230", "5021", "5031"])
    assert.equal(COST.codes[header], undefined, header);
  for (const hint of Object.values(COST.hints)) assert.ok(COST.codes[hint], hint);
});
test("PO totals: subtotal, 15% HST, per-code subtotals", () => {
  const t = poTotals([
    { coa: "5515", qty: 2, cost: 10.5 },
    { coa: "5515", qty: 1, cost: 4 },
    { coa: "5526", qty: 1, cost: 100 },
  ]);
  assert.equal(t.subtotal, 125);
  assert.equal(t.hst, 18.75);
  assert.equal(t.total, 143.75);
  assert.deepEqual(t.byCode.map((c) => [c.code, c.amount]), [["5515", 25], ["5526", 100]]);
});
test("PO PDF builds with the vendor, lines and totals", () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({
    po: "PO-26-104", jobCode: "J-12", coa: "5515", productName: `Oak LVP ${i}`, sku: "FV11-8",
    description: "Granite Guard 5.5mm", qty: 10, unit: "box", cost: 42.5, neededBy: "2026-10-09",
  }));
  const doc = buildPoPdf({ vendor: "Richmond Flooring", dayLabel: "Tuesday", lines, issuedBy: "Mike Robins", now: new Date("2026-10-01T15:00:00Z") });
  assert.ok(doc.getNumberOfPages() >= 2); // long batches flow onto more pages
  const pdf = doc.output();
  assert.match(pdf, /PURCHASE ORDER/);
  assert.match(pdf, /Richmond Flooring/);
  assert.match(pdf, /\$19,550\.00/); // 40 x 10 x 42.50 + 15% HST
  assert.equal(poFileName("Avide Flooring", "2026-10-01"), "PO_Avide_Flooring_2026-10-01.pdf");
});
