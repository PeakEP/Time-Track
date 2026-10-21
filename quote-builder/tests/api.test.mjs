// Quote Builder API: staff need Quote Builder access; only Admins change the
// catalog/settings and approve quotes; reps can't approve their own quotes;
// numbering is atomic; Square costs come from Default Unit Cost; document
// reader jobs run once with their secret.
import { test, before } from "node:test";
import assert from "node:assert/strict";

// In-memory Blobs store with compare-and-swap (as in the other apps' tests),
// plus binary values for upload chunks.
function casStore() {
  const data = new Map();
  let n = 0;
  const pause = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  return {
    data,
    async get(key, opts = {}) {
      await pause();
      const v = data.get(key);
      if (!v) return null;
      if (opts.type === "arrayBuffer") return v.bin;
      return JSON.parse(v.body);
    },
    async getWithMetadata(key) {
      await pause();
      const v = data.get(key);
      return v ? { data: JSON.parse(v.body), etag: v.etag, metadata: {} } : null;
    },
    async setJSON(key, value, opts = {}) {
      await pause();
      const cur = data.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      data.set(key, { body: JSON.stringify(value), etag: `"${++n}"` });
      return { modified: true };
    },
    async set(key, buf) { data.set(key, { bin: buf, etag: `"${++n}"` }); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list() { return { blobs: [], directories: [] }; },
  };
}

let suite, qb, stores, read, started = [];
const T = {};
const cookie = (who) => (T[who] ? `jmrc_session=${T[who]}` : "");

async function suiteCall(who, method, path, body) {
  const r = await suite(new Request("https://x.test/api/suite/" + path, {
    method, headers: { cookie: cookie(who), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  }));
  const set = r.headers.get("set-cookie") || "";
  return { status: r.status, body: await r.json(), token: (set.match(/jmrc_session=([^;]*)/) || [])[1] };
}
async function call(who, method, path, body, raw) {
  const r = await qb(new Request("https://x.test/api/quote-builder/" + path, {
    method, headers: { cookie: cookie(who), "content-type": raw ? "application/octet-stream" : "application/json" },
    body: raw || (body ? JSON.stringify(body) : undefined),
  }));
  return { status: r.status, body: await r.json() };
}

before(async () => {
  stores = { vo: casStore(), sel: casStore(), qb: casStore() };
  const suiteMod = await import("../../netlify/functions/suite-api/suite-api.mjs");
  const qbMod = await import("../../netlify/functions/quote-builder-api/quote-builder-api.mjs");
  read = await import("../../netlify/functions/quote-builder-read-background/quote-builder-read-background.mjs");
  suite = suiteMod.createHandler({ stores });
  const fetchImpl = async (url, init) => { started.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 202 }; };
  qb = qbMod.createHandler({ stores, fetchImpl });
  const s = await suiteCall(null, "POST", "setup", { name: "Mike Robins" });
  T.mike = s.token;
  const rep = await suiteCall("mike", "POST", "team", { name: "Sam Sales", apps: { quoteBuilder: true } }); // beta tester
  const nobody = await suiteCall("mike", "POST", "team", { name: "Pat Painter" }); // not granted — beta off by default
  T.sam = (await suiteCall(null, "POST", "login", { name: "Sam Sales", pin: rep.body.pin })).token;
  T.pat = (await suiteCall(null, "POST", "login", { name: "Pat Painter", pin: nobody.body.pin })).token;
});

test("access: owner and granted beta testers get in; ungranted staff don't", async () => {
  assert.equal((await call("mike", "GET", "me")).body.me.admin, true);
  const sam = await call("sam", "GET", "me");
  assert.equal(sam.status, 200);
  assert.equal(sam.body.me.admin, false);
  assert.equal((await call("pat", "GET", "me")).status, 403);
  assert.equal((await call(null, "GET", "me")).status, 401);
});

const settings = () => ({ version: 1, components: [{ key: "x" }], rates: [], pricing: { hst: 0.15 }, company: {}, nextNumbers: { REN2026: 99 } });

test("settings and catalog are Admin-only to change, readable by reps", async () => {
  assert.equal((await call("sam", "PUT", "settings", { settings: settings() })).status, 403);
  const put = await call("mike", "PUT", "settings", { settings: settings() });
  assert.equal(put.status, 200);
  assert.equal(put.body.settings.updatedBy, "Mike Robins");
  // counters belong to the server, not the client's copy
  assert.deepEqual(put.body.settings.nextNumbers, {});
  assert.equal((await call("sam", "GET", "settings")).body.settings.updatedBy, "Mike Robins");

  const items = [{ id: "jmrc:a", name: "Stud", description: "2 x 6 x 8'", unit: "ea", unitCost: "5.50", costCode: "0602 Studs" }, { id: "jmrc:b", name: "Vanity", description: "as per drawings", unit: "EA", unitCost: 0, costCode: "1110" }];
  assert.equal((await call("sam", "PUT", "catalog/jmrc", { items })).status, 403);
  assert.equal((await call("mike", "PUT", "catalog/jmrc", { items, fileName: "cost_catalog.csv" })).body.count, 2);
  const cat = (await call("sam", "GET", "catalog")).body;
  assert.equal(cat.jmrc.items[0].unit, "EA");
  assert.equal(cat.jmrc.items[0].unitCost, 5.5);
  assert.equal(cat.jmrc.items[1].unitCost, null); // $0.00 stays unpriced
});

test("Admins add custom products that survive a master re-import; reps can't", async () => {
  assert.equal((await call("sam", "POST", "catalog/custom", { name: "Custom trim" })).status, 403);
  assert.equal((await call("mike", "POST", "catalog/custom", { unit: "EA" })).status, 400); // name required
  const add = await call("mike", "POST", "catalog/custom", { name: "Custom trim", unit: "lf", unitCost: "2.25", costCode: "1706" });
  assert.equal(add.status, 200);
  const id = add.body.item.id;
  assert.match(id, /^cust_/);
  assert.equal(add.body.item.source, "custom");
  assert.equal(add.body.item.unit, "LF");
  assert.equal(add.body.item.unitCost, 2.25);
  // Reps see it in the catalog
  assert.ok((await call("sam", "GET", "catalog")).body.custom.items.some((x) => x.id === id));
  // Re-importing the master JMRC catalog leaves custom products alone
  const items = [{ id: "jmrc:a", name: "Stud", description: "2 x 6 x 8'", unit: "ea", unitCost: "5.50", costCode: "0602 Studs" }, { id: "jmrc:b", name: "Vanity", description: "as per drawings", unit: "EA", unitCost: 0, costCode: "1110" }];
  await call("mike", "PUT", "catalog/jmrc", { items, fileName: "cost_catalog.csv" });
  assert.ok((await call("mike", "GET", "catalog")).body.custom.items.some((x) => x.id === id));
  // Delete it
  assert.equal((await call("mike", "DELETE", `catalog/custom/${id}`)).status, 200);
  assert.ok(!(await call("mike", "GET", "catalog")).body.custom.items.some((x) => x.id === id));
});

test("quote numbers are sequential per prefix, even when requested together", async () => {
  const got = await Promise.all([1, 2, 3].map(() => call("sam", "POST", "numbers", { prefix: "REN2026" })));
  assert.deepEqual(got.map((g) => g.body.number).sort(), ["REN2026-01", "REN2026-02", "REN2026-03"]);
  assert.equal((await call("sam", "POST", "numbers", { prefix: "CUS2026" })).body.number, "CUS2026-01");
  assert.equal((await call("sam", "POST", "numbers", { prefix: "../x" })).status, 400);
});

const quote = (over = {}) => ({ id: "11111111-2222-3333-4444-555555555555", type: "renovation", status: "draft", number: "REN2026-01", title: "Smith kitchen", answers: { clientName: "Jo Smith" }, totals: { total: 1150 }, ...over });

test("reps save quotes but can't approve them; Admin approval sticks", async () => {
  const s = await call("sam", "PUT", `quotes/${quote().id}`, { quote: quote({ status: "approved", approval: { by: "Sam" } }) });
  assert.equal(s.status, 200);
  assert.equal(s.body.quote.status, "needs-approval");
  assert.equal(s.body.quote.approval, undefined);
  assert.equal(s.body.quote.createdBy, "Sam Sales");
  assert.equal((await call("sam", "POST", `quotes/${quote().id}/approve`, { total: 1150 })).status, 403);
  const a = await call("mike", "POST", `quotes/${quote().id}/approve`, { total: 1150, note: "ok" });
  assert.equal(a.body.quote.approval.by, "Mike Robins");
  // a later rep save keeps the approval (the app checks it still matches the total)
  const again = await call("sam", "PUT", `quotes/${quote().id}`, { quote: quote({ title: "Smith kitchen v2", approval: null }), baseUpdatedAt: a.body.quote.updatedAt });
  assert.equal(again.body.quote.approval.totalAtApproval, 1150);
  assert.equal(again.body.quote.status, "draft");
  const list = (await call("mike", "GET", "quotes")).body.quotes;
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Smith kitchen v2");
  assert.equal(list[0].client, "Jo Smith");
});

test("saving over someone else's newer save is refused with their copy", async () => {
  const id = "22222222-2222-3333-4444-555555555555";
  const first = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id }) });
  await call("mike", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Mike's edit" }), baseUpdatedAt: first.body.quote.updatedAt });
  const stale = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Sam's edit" }), baseUpdatedAt: first.body.quote.updatedAt });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.current.title, "Mike's edit");
  assert.equal((await call("pat", "DELETE", `quotes/${id}`)).status, 403);
  assert.equal((await call("sam", "DELETE", `quotes/${id}`)).status, 200);
});

test("finalized quotes lock: reps can't edit content or delete, only move the outcome; Admin can", async () => {
  const id = "33333333-2222-3333-4444-555555555555";
  // Sam drafts it, then exporting sends it (status "sent").
  const draft = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Lake reno" }) });
  assert.equal(draft.body.quote.status, "draft");
  const sent = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Lake reno", status: "sent" }), baseUpdatedAt: draft.body.quote.updatedAt });
  assert.equal(sent.body.quote.status, "sent");
  // A rep's attempt to change the content of a sent quote is ignored.
  const edit = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Changed title", status: "sent" }), baseUpdatedAt: sent.body.quote.updatedAt });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.quote.title, "Lake reno");
  // A rep can still move the outcome (sent → won).
  const won = await call("sam", "PUT", `quotes/${id}`, { quote: quote({ id, title: "ignored", status: "won" }), baseUpdatedAt: edit.body.quote.updatedAt });
  assert.equal(won.body.quote.status, "won");
  assert.equal(won.body.quote.title, "Lake reno");
  // A rep can't delete a finalized quote...
  assert.equal((await call("sam", "DELETE", `quotes/${id}`)).status, 403);
  // ...but an Admin edits the content freely and can delete it.
  const fixed = await call("mike", "PUT", `quotes/${id}`, { quote: quote({ id, title: "Admin fixed", status: "won" }), baseUpdatedAt: won.body.quote.updatedAt });
  assert.equal(fixed.body.quote.title, "Admin fixed");
  assert.equal((await call("mike", "DELETE", `quotes/${id}`)).status, 200);
});

test("Square mapping uses Default Unit Cost, not the retail price", async () => {
  const { mapSquareObjects } = await import("../../netlify/shared/square-catalog.mjs");
  const objs = [
    { type: "MEASUREMENT_UNIT", id: "MU", measurement_unit_data: { measurement_unit: { area_unit: "IMPERIAL_SQUARE_FOOT" } } },
    { type: "CATEGORY", id: "C", category_data: { name: "SPC Flooring" } },
    { type: "ITEM", id: "I1", item_data: { name: "SPC Granite Guard, American Oak", reporting_category: { id: "C" }, variations: [
      { id: "V1", item_variation_data: { name: "Regular", sku: "AMERICAN OAK", price_money: { amount: 300 }, default_unit_cost: { amount: 100 }, measurement_unit_id: "MU" } },
      { id: "V2", item_variation_data: { name: "Sample", price_money: { amount: 500 } } },
    ] } },
    { type: "ITEM", id: "I2", item_data: { name: "Old", is_archived: true, variations: [{ id: "V3", item_variation_data: { default_unit_cost: { amount: 100 } } }] } },
  ];
  const { items, skipped } = mapSquareObjects(objs);
  assert.equal(items.length, 1);
  assert.equal(skipped, 1);
  assert.deepEqual(
    { id: items[0].id, unit: items[0].unit, unitCost: items[0].unitCost, retail: items[0].retail, costCode: items[0].costCode, sku: items[0].sku },
    { id: "sq:V1", unit: "SF", unitCost: 1, retail: 3, costCode: "SPC Flooring", sku: "AMERICAN OAK" },
  );
});

test("Square sync needs the token and is Admin-only", async () => {
  delete process.env.SQUARE_ACCESS_TOKEN;
  assert.equal((await call("sam", "POST", "catalog/square-sync")).status, 403);
  const r = await call("mike", "POST", "catalog/square-sync");
  assert.equal(r.status, 400);
  assert.match(r.body.error, /SQUARE_ACCESS_TOKEN/);
});

test("document reader: chunks upload, job runs once with its secret, uploads are cleaned up", async () => {
  process.env.ANTHROPIC_API_KEY = "test";
  const jobId = "job-0001-abcd";
  const fileId = "file-0001-abcd";
  const half = (s) => new TextEncoder().encode(s);
  assert.equal((await call("sam", "PUT", `uploads/${jobId}/${fileId}/0`, null, half("Kitchen 12x10, "))).status, 200);
  assert.equal((await call("sam", "PUT", `uploads/${jobId}/${fileId}/1`, null, half("remove wall"))).status, 200);
  const bad = await call("sam", "POST", "read", { jobId, files: [{ id: fileId, name: "plan.dwg", type: "application/acad", size: 10, chunks: 1 }] });
  assert.equal(bad.status, 400);
  const go = await call("sam", "POST", "read", {
    jobId, quoteType: "renovation", notes: "client wants quartz",
    fields: [{ key: "clientName", label: "Client name", type: "text" }],
    files: [{ id: fileId, name: "notes.txt", type: "text/plain", size: 26, chunks: 2 }],
  });
  assert.equal(go.status, 202);
  const kick = started.at(-1);
  assert.match(kick.url, /quote-builder-read-background$/);

  let seen;
  const fake = async ({ job, files }) => { seen = files[0].data.toString(); return { summary: "Kitchen", answers: [], rooms: [], scopeItems: [], exclusions: [], openQuestions: [], notes: job.notes }; };
  assert.equal((await read.runJob(stores.qb, { jobId, secret: "wrong" }, { read: fake })).ok, false);
  assert.equal((await read.runJob(stores.qb, kick.body, { read: fake })).ok, true);
  assert.equal(seen, "Kitchen 12x10, remove wall");
  // the secret is spent; a replay does nothing
  assert.equal((await read.runJob(stores.qb, kick.body, { read: fake })).ok, false);
  const st = await call("sam", "GET", `read/${jobId}`);
  assert.equal(st.body.status, "done");
  assert.equal(st.body.result.summary, "Kitchen");
  assert.ok(![...stores.qb.data.keys()].some((k) => k.startsWith("uploads/")));
});

test("upload chunk rejects a too-short file id but accepts a uid (cabinet-scan fix)", async () => {
  const jobId = "job-cab-00001";
  const body = () => new TextEncoder().encode("x");
  // "f0" is what the cabinet scan used to send — 2 chars fails the id check → Bad upload path.
  assert.equal((await call("sam", "PUT", `uploads/${jobId}/f0/0`, null, body())).status, 400);
  // A proper uid-length id is accepted.
  assert.equal((await call("sam", "PUT", `uploads/${jobId}/a1b2c3d4e5/0`, null, body())).status, 200);
});

test("reader prompt pieces: schema limits fields to the interview keys; scope notes govern", async () => {
  const { resultSchema, contentBlocks, questionText, SYSTEM } = await import("../../netlify/shared/quote-reader.mjs");
  const s = resultSchema(["length", "width"]);
  assert.deepEqual(s.properties.answers.items.properties.field.enum, ["length", "width"]);
  assert.equal(s.additionalProperties, false);
  const blocks = contentBlocks([{ name: "a.pdf", type: "application/pdf", data: Buffer.from("x") }, { name: "p.jpg", type: "image/jpg", data: Buffer.from("y") }]);
  assert.equal(blocks[0].type, "document");
  assert.equal(blocks[2].source.media_type, "image/jpeg");
  // The rep's notes reach the reader and are framed as what's in scope.
  const qt = questionText({ quoteType: "renovation", fields: [{ key: "length", label: "Length", type: "number" }], answers: {}, notes: "Plans show 4 rooms — kitchen only." });
  assert.match(qt, /kitchen only/);
  assert.match(qt, /in scope/i);
  // And the system prompt makes the notes win over the drawings on scope.
  assert.match(SYSTEM, /notes set the scope|notes win/i);
});

test("cabinet catalogs: Admin uploads the supplier files, reps read them", async () => {
  const file = { supplier: "Oppein", discount: 0.58, products: [{ sku: "B24", pb: { essential: 100 }, ply: { essential: 120 } }] };
  assert.equal((await call("sam", "PUT", "catalog/cabinets", { files: [file] })).status, 403);
  assert.equal((await call("mike", "PUT", "catalog/cabinets", { files: [{ supplier: "Ikea", discount: 0.5, products: [{}] }] })).status, 400);
  assert.equal((await call("mike", "PUT", "catalog/cabinets", { files: [{ ...file, discount: 58 }] })).status, 400);
  const ok = await call("mike", "PUT", "catalog/cabinets", { files: [file] });
  assert.deepEqual(ok.body.saved, [{ supplier: "oppein", products: 1, discount: 0.58 }]);
  const got = (await call("sam", "GET", "catalog/cabinets")).body;
  assert.equal(got.oppein.products[0].sku, "B24");
  assert.equal(got.aline, null);
});
