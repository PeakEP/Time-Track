// Finish Selections API: staff sign in with their Vendor Orders name + PIN,
// create customer projects, customers see only their own project and can only
// change selections/quantities, and simultaneous edits merge.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { merge3 } from "../../netlify/functions/selections-api/merge.mjs";

// In-memory Blobs store with atomic compare-and-swap (what production documents).
function casStore() {
  const data = new Map();
  let n = 0;
  const pause = () => new Promise((r) => setTimeout(r, Math.random() * 4));
  return {
    async get(key) { await pause(); const v = data.get(key); return v ? JSON.parse(v.body) : null; },
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
    async delete(key) { data.delete(key); },
    async list() { return { blobs: [], directories: [] }; },
  };
}

let sel, vo;
const T = {};
async function voCall(method, path, body, who) {
  const r = await vo(new Request("https://x.test/api/vendor-orders/" + path, {
    method, headers: { authorization: who ? "Bearer " + T[who] : "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json() };
}
async function call(who, method, path, body) {
  const r = await sel(new Request("https://x.test/api/selections/" + path, {
    method, headers: { authorization: who ? "Bearer " + (T[who] || who) : "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json() };
}

const blank = (over = {}) => ({
  meta: { client: "", project: "", address: "", date: "2026-09-24", salesRep: "", notes: "" },
  basePrice: 50000, selections: {}, overrides: {}, quantities: {},
  discount: { label: "Discount", type: "percent", value: 0 }, ...over,
});

before(async () => {
  const stores = { vo: casStore(), sel: casStore() };
  const voMod = await import("../../netlify/functions/vendor-orders-api/vendor-orders-api.mjs");
  const selMod = await import("../../netlify/functions/selections-api/selections-api.mjs");
  vo = voMod.createHandler({ store: stores.vo });
  sel = selMod.createHandler({ stores });
  // Vendor Orders team: Mike (purchaser) + Dana (sales rep)
  const s = await voCall("POST", "setup", { name: "Mike Robins" });
  T.voMike = s.body.token;
  T.mikePin = s.body.pin;
  const d = await voCall("POST", "users", { name: "Dana Design" }, "voMike");
  T.danaPin = d.body.pin;
});

test("merge keeps both sides' changes", () => {
  const base = { selections: { floor: ["a"] }, overrides: {}, meta: { notes: "" } };
  const mine = { selections: { floor: ["a"], tile: ["t1"] }, overrides: {}, meta: { notes: "" } };
  const theirs = { selections: { floor: ["b"] }, overrides: { b: 4 }, meta: { notes: "x" } };
  assert.deepEqual(merge3(base, mine, theirs), { selections: { floor: ["b"], tile: ["t1"] }, overrides: { b: 4 }, meta: { notes: "x" } });
  // a key removed on one side stays removed
  assert.deepEqual(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 }), { a: 1, c: 3 });
});

test("config and sign-in with the Vendor Orders team PIN", async () => {
  assert.deepEqual((await call(null, "GET", "config")).body, { live: true });
  assert.equal((await call(null, "GET", "projects")).status, 401);
  assert.equal((await call(null, "POST", "login", { name: "Dana Design", pin: "000000" === T.danaPin ? "111111" : "000000" })).status, 401);
  const r = await call(null, "POST", "login", { name: "dana design", pin: T.danaPin });
  assert.equal(r.status, 200);
  assert.equal(r.body.me.kind, "staff");
  T.dana = r.body.token;
  T.mike = (await call(null, "POST", "login", { name: "Mike Robins", pin: T.mikePin })).body.token;
  assert.equal((await call("dana", "GET", "me")).body.me.name, "Dana Design");
});

test("staff create a customer project and issue a PIN", async () => {
  assert.equal((await call("dana", "POST", "projects", { client: "" })).status, 400);
  assert.equal((await call("dana", "POST", "projects", { client: "Mike Robins" })).status, 400); // staff name
  const r = await call("dana", "POST", "projects", {
    client: "Jane Smith", title: "Smith — 12 Elm St", project: blank({ selections: { floor: ["oak"] } }),
  });
  assert.equal(r.status, 201);
  assert.match(r.body.pin, /^\d{6}$/);
  assert.equal(r.body.customerName, "Jane Smith");
  T.janePin = r.body.pin;
  T.janeProject = r.body.project.id;
  const again = await call("dana", "POST", "projects", { client: "jane smith" });
  assert.equal(again.status, 400); // sign-in names are unique
  const other = await call("mike", "POST", "projects", { client: "Bob Brown", project: blank() });
  T.bobProject = other.body.project.id;
  const list = (await call("mike", "GET", "projects")).body.projects;
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.id === T.janeProject).customer.name, "Jane Smith");
});

test("customers see only their project and change only selections", async () => {
  const r = await call(null, "POST", "login", { name: "Jane Smith", pin: T.janePin });
  assert.equal(r.body.me.kind, "customer");
  assert.equal(r.body.me.projectId, T.janeProject);
  T.jane = r.body.token;
  assert.equal((await call("jane", "GET", "projects")).status, 403);
  assert.equal((await call("jane", "GET", "projects/" + T.bobProject)).status, 403);
  assert.equal((await call("jane", "POST", "projects", { client: "X Y" })).status, 403);
  assert.equal((await call("jane", "POST", "projects/" + T.janeProject + "/reset-pin")).status, 403);

  const got = (await call("jane", "GET", "projects/" + T.janeProject)).body;
  const base = got.project;
  const mine = {
    ...base,
    selections: { ...base.selections, tile: ["white"] },
    quantities: { white: 120 },
    overrides: { oak: 0.01 }, // not allowed
    discount: { label: "Free!", type: "percent", value: 100 }, // not allowed
    basePrice: 1,
  };
  const saved = (await call("jane", "PUT", "projects/" + T.janeProject, { base, project: mine })).body.project;
  assert.deepEqual(saved.selections, { floor: ["oak"], tile: ["white"] });
  assert.equal(saved.quantities.white, 120);
  assert.deepEqual(saved.overrides, {});
  assert.equal(saved.discount.value, 0);
  assert.equal(saved.basePrice, 50000);
});

test("designer and customer editing at once keep both changes", async () => {
  const base = (await call("dana", "GET", "projects/" + T.janeProject)).body.project;
  const designer = { ...base, overrides: { oak: 5.5 }, meta: { ...base.meta, notes: "Rush" } };
  const client = { ...base, selections: { ...base.selections, counters: ["quartz"] } };
  await Promise.all([
    call("dana", "PUT", "projects/" + T.janeProject, { base, project: designer }),
    call("jane", "PUT", "projects/" + T.janeProject, { base, project: client }),
  ]);
  const now = (await call("dana", "GET", "projects/" + T.janeProject)).body;
  assert.equal(now.project.overrides.oak, 5.5);
  assert.equal(now.project.meta.notes, "Rush");
  assert.deepEqual(now.project.selections.counters, ["quartz"]);
  assert.deepEqual(now.project.selections.tile, ["white"]);
  assert.ok(now.version >= 3);
});

test("reset PIN, turn off access, delete", async () => {
  const r = await call("dana", "POST", "projects/" + T.janeProject + "/reset-pin");
  assert.match(r.body.pin, /^\d{6}$/);
  assert.equal((await call("jane", "GET", "projects/" + T.janeProject)).status, 401); // old session ended
  T.jane = (await call(null, "POST", "login", { name: "Jane Smith", pin: r.body.pin })).body.token;
  assert.equal((await call("dana", "PATCH", "projects/" + T.janeProject + "/access", { active: false })).status, 200);
  assert.equal((await call(null, "POST", "login", { name: "Jane Smith", pin: r.body.pin })).status, 403);
  assert.equal((await call("mike", "DELETE", "projects/" + T.janeProject)).status, 200);
  assert.equal((await call("mike", "GET", "projects/" + T.janeProject)).status, 404);
  assert.equal((await call("mike", "GET", "projects")).body.projects.length, 1);
});

test("5 wrong customer PINs lock the name", async () => {
  const r = await call("mike", "POST", "projects", { client: "Lock Test", project: blank() });
  const wrong = r.body.pin === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await call(null, "POST", "login", { name: "Lock Test", pin: wrong });
  assert.equal((await call(null, "POST", "login", { name: "Lock Test", pin: r.body.pin })).status, 429);
});
