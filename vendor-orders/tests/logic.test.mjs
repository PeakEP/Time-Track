import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCutoff, suggestCoa, buildCSV, fmtCountdown, coaName, phaseName, CSV_COLUMNS } from "../src/logic.js";

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
  assert.equal(suggestCoa("Oak LVP 7in"), "5540");
  assert.equal(suggestCoa("Brass pendants"), "5525");
  assert.equal(suggestCoa("Mystery widget"), "");
  assert.equal(coaName("5540"), "Flooring & Tile Material");
  assert.equal(phaseName("5540"), "Phase 5 - Interior Finishes & Specialties");
});
test("CSV has the agreed columns, escaping and subtotal", () => {
  const csv = buildCSV("MSI", "Tuesday", [
    { po: "P1", coa: "5540", productName: 'Tile, "grey"', qty: 2, cost: 10.5, unit: "box" },
    { po: "P1", coa: "5540", productName: "Grout", qty: 1, cost: 4 },
  ], "Mike");
  const lines = csv.trim().split("\n");
  assert.equal(lines[6], CSV_COLUMNS.join(","));
  assert.match(lines[7], /"Tile, ""grey"""/);
  assert.match(lines[7], /,21\.00,$/);
  assert.match(lines.at(-1), /SUBTOTAL \(ex\. HST\),25\.00,$/);
});
