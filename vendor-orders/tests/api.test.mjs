// Integration tests for the Vendor Orders API against a local Netlify Blobs
// server (the same client code Netlify runs in production).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";
import { getStore } from "@netlify/blobs";

const skip = false;
let handler, server, store, dir;
const TOKENS = {}; // who -> session token
const IDS = {}; // who -> user id

async function call(who, method, path, body) {
  const res = await handler(
    new Request("https://x.test/api/vendor-orders/" + path, {
      method,
      headers: { authorization: who ? "Bearer " + (TOKENS[who] || who) : "", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (skip) return;
  dir = await mkdtemp(join(tmpdir(), "vo-blobs-"));
  const token = "test-token";
  server = new BlobsServer({ directory: dir, token });
  const { port } = await server.start();
  store = getStore({ name: "vendor-orders", siteID: "test-site", token, edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}`, consistency: "strong" });
  const mod = await import("../../netlify/functions/vendor-orders-api/vendor-orders-api.mjs");
  handler = mod.createHandler({ store });
});
after(async () => {
  if (server) await server.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const item = (o = {}) => ({ productName: "Oak LVP", coa: "5540", qty: 10, unit: "box", cost: 42.5, ...o });

test("config is public and reports live", { skip }, async () => {
  const r = await call(null, "GET", "config");
  assert.equal(r.status, 200);
  assert.equal(r.body.live, true);
});

test("PIN sign-in: first-run setup, issued PINs, lockout", { skip }, async () => {
  assert.equal((await call(null, "GET", "bootstrap")).status, 401);
  assert.equal((await call("not-a-token", "GET", "bootstrap")).status, 401);
  assert.equal((await call(null, "GET", "config")).body.needsSetup, true);

  // first-run creates the first Purchaser and shows their PIN once
  const setup = await call(null, "POST", "setup", { name: "Mike  Robins" });
  assert.equal(setup.status, 200);
  assert.match(setup.body.pin, /^\d{6}$/);
  assert.equal(setup.body.me.role, "purchaser");
  assert.equal(setup.body.me.name, "Mike Robins");
  TOKENS.mike = setup.body.token;
  IDS.mike = setup.body.me.id;
  assert.equal((await call(null, "GET", "config")).body.needsSetup, false);
  assert.equal((await call(null, "POST", "setup", { name: "Intruder" })).status, 409);

  // unknown names can't sign in; Purchaser issues PINs
  assert.equal((await call(null, "POST", "login", { name: "Rita Rep", pin: "123456" })).status, 401);
  const rita = await call("mike", "POST", "users", { name: "Rita Rep" });
  assert.equal(rita.status, 201);
  assert.equal(rita.body.user.role, "sales_rep");
  assert.equal((await call("mike", "POST", "users", { name: "rita rep" })).status, 400);
  const sam = await call("mike", "POST", "users", { name: "Sam Rep" });
  IDS.rep = rita.body.user.id;
  IDS.rep2 = sam.body.user.id;

  const wrong = rita.body.pin === "000000" ? "111111" : "000000";
  assert.equal((await call(null, "POST", "login", { name: "Rita Rep", pin: wrong })).status, 401);
  const ok = await call(null, "POST", "login", { name: "rita rep", pin: rita.body.pin });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.me.id, IDS.rep);
  TOKENS.rep = ok.body.token;
  TOKENS.rep2 = (await call(null, "POST", "login", { name: "Sam Rep", pin: sam.body.pin })).body.token;

  // a rep can't issue PINs
  assert.equal((await call("rep", "POST", "users", { name: "X Y" })).status, 403);
  assert.equal((await call("rep", "POST", "users/" + IDS.rep2 + "/reset-pin")).status, 403);

  // 5 wrong PINs locks the name, even for the right PIN
  for (let i = 0; i < 5; i++) await call(null, "POST", "login", { name: "Sam Rep", pin: wrong === sam.body.pin ? "222222" : wrong });
  assert.equal((await call(null, "POST", "login", { name: "Sam Rep", pin: sam.body.pin })).status, 429);
  // reset PIN unlocks, issues a new PIN and ends existing sessions
  const reset = await call("mike", "POST", "users/" + IDS.rep2 + "/reset-pin");
  assert.match(reset.body.pin, /^\d{6}$/);
  assert.equal((await call("rep2", "GET", "bootstrap")).status, 401);
  TOKENS.rep2 = (await call(null, "POST", "login", { name: "Sam Rep", pin: reset.body.pin })).body.token;
  assert.equal((await call("rep2", "GET", "bootstrap")).status, 200);

  // logout ends that session
  const extra = (await call(null, "POST", "login", { name: "Rita Rep", pin: rita.body.pin })).body.token;
  TOKENS.tmp = extra;
  assert.equal((await call("tmp", "POST", "logout")).status, 200);
  assert.equal((await call("tmp", "GET", "bootstrap")).status, 401);
});

test("bootstrap seeds vendors/cutoffs and assigns roles", { skip }, async () => {
  const m = await call("mike", "GET", "bootstrap");
  assert.equal(m.status, 200);
  assert.equal(m.body.me.role, "purchaser");
  assert.equal(m.body.vendors.length, 9);
  assert.deepEqual(m.body.cutoffs.map((c) => c.cutoff), ["10:00", "10:00"]);
  const r = await call("rep", "GET", "bootstrap");
  assert.equal(r.body.me.role, "sales_rep");
});

test("full cycle: add → approve → mark ordered → receive", { skip }, async () => {
  const bad = await call("rep", "POST", "orders", { vendor: "MSI", po: "PO-1", items: [item({ coa: "" })] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Susan/);
  assert.equal((await call("rep", "POST", "orders", { vendor: "MSI", po: "", items: [item()] })).status, 400);

  const c = await call("rep", "POST", "orders", {
    vendor: "MSI", po: "PO-1", jobCode: "J1", approved: false, items: [item(), item({ productName: "Grout", qty: 2 })],
  });
  assert.equal(c.status, 201);
  assert.equal(c.body.created, 2);
  let orders = (await call("rep", "GET", "bootstrap")).body.orders;
  assert.equal(orders.length, 2);
  assert.ok(orders.every((o) => o.status === "pending" && o.createdByName === "Rita Rep"));
  assert.equal(orders[0].groupId, orders[1].groupId);
  assert.equal(orders.find((o) => o.productName === "Oak LVP").cost, 42.5);

  // rep approves own line; rep cannot mark ordered
  const [a, b] = orders;
  assert.equal((await call("rep", "PATCH", "orders/" + a.id, { status: "ready" })).status, 200);
  assert.equal((await call("rep", "PATCH", "orders/" + b.id, { status: "ordered" })).status, 403);
  // another rep cannot touch it
  assert.equal((await call("rep2", "PATCH", "orders/" + b.id, { po: "X" })).status, 403);
  assert.equal((await call("rep2", "DELETE", "orders/" + b.id)).status, 403);

  // rep cannot order a batch; purchaser can, only ready lines of that vendor move
  assert.equal((await call("rep", "POST", "batches/ordered", { vendor: "MSI", ids: [a.id] })).status, 403);
  const o = await call("mike", "POST", "batches/ordered", {
    vendor: "MSI", ids: [a.id, b.id], confirmation: "C-9", eta: "2026-10-01",
  });
  assert.equal(o.body.ordered, 1);
  orders = (await call("mike", "GET", "bootstrap")).body.orders;
  const oa = orders.find((x) => x.id === a.id);
  assert.equal(oa.status, "ordered");
  assert.equal(oa.orderedByName, "Mike Robins");
  assert.equal(oa.eta, "2026-10-01");
  assert.ok(oa.orderedAt);

  // once ordered, the rep can no longer edit it
  assert.equal((await call("rep", "PATCH", "orders/" + a.id, { notes: "x" })).status, 403);
  assert.equal((await call("mike", "PATCH", "orders/" + a.id, { status: "backordered" })).status, 200);
  assert.equal((await call("mike", "PATCH", "orders/" + a.id, { status: "received" })).status, 200);
  orders = (await call("mike", "GET", "bootstrap")).body.orders;
  assert.ok(orders.find((x) => x.id === a.id).receivedAt);

  const { blobs } = await store.list({ prefix: "events/" });
  const ev = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }))))
    .filter((e) => e.orderId === a.id)
    .sort((x, y) => x.at.localeCompare(y.at))
    .map((e) => e.event);
  assert.deepEqual(ev, ["created", "approved", "ordered", "backordered", "received"]);

  // group delete by rep blocked (one line ordered); purchaser can
  assert.equal((await call("rep", "DELETE", "groups/" + a.groupId)).status, 403);
  assert.equal((await call("mike", "DELETE", "groups/" + a.groupId)).body.deleted, 2);
});

test("cutoffs, vendors and team roles are purchaser-only", { skip }, async () => {
  assert.equal((await call("rep", "PUT", "cutoffs", { tue: "09:00" })).status, 403);
  assert.equal((await call("mike", "PUT", "cutoffs", { tue: "25:00" })).status, 400);
  assert.equal((await call("mike", "PUT", "cutoffs", { tue: "09:30" })).status, 200);

  assert.equal((await call("rep", "POST", "vendors", { name: "New Co", day: "tue" })).status, 403);
  const v = await call("mike", "POST", "vendors", { name: "New Co", day: "tue", cat: "Tile" });
  assert.equal(v.status, 201);
  assert.equal((await call("mike", "POST", "vendors", { name: "New Co", day: "thu" })).status, 400);
  await call("rep", "POST", "orders", { vendor: "New Co", po: "P2", approved: true, items: [item()] });
  assert.equal((await call("mike", "PATCH", "vendors/" + v.body.id, { name: "Newer Co", day: "thu" })).status, 200);
  const boot = (await call("mike", "GET", "bootstrap")).body;
  const line = boot.orders.find((o) => o.po === "P2");
  assert.equal(line.vendor, "Newer Co");
  assert.equal(line.orderDay, "thu");
  assert.equal(boot.cutoffs.find((c) => c.key === "tue").cutoff, "09:30");

  const users = (await call("mike", "GET", "users")).body.users;
  assert.equal((await call("rep", "GET", "users")).status, 403);
  assert.ok(users.every((u) => u.hasPin && !("pin_hash" in u)));
  const me = users.find((u) => u.name === "Mike Robins");
  assert.equal((await call("mike", "PATCH", "users/" + me.id, { role: "sales_rep" })).status, 400);
  const rep2 = users.find((u) => u.name === "Sam Rep");
  assert.equal((await call("mike", "PATCH", "users/" + rep2.id, { active: false })).status, 200);
  assert.equal((await call("rep2", "GET", "bootstrap")).status, 401); // sessions ended
});

test("clear history and reset need purchaser + typed phrase", { skip }, async () => {
  assert.equal((await call("rep", "POST", "admin/clear-history", { confirm: "CLEAR HISTORY" })).status, 403);
  assert.equal((await call("mike", "POST", "admin/clear-history", { confirm: "yes" })).status, 400);
  const r = await call("mike", "POST", "orders", { vendor: "MSI", po: "P3", approved: true, items: [item()] });
  await call("mike", "POST", "batches/ordered", { vendor: "MSI", ids: r.body.ids });
  const c = await call("mike", "POST", "admin/clear-history", { confirm: "CLEAR HISTORY" });
  assert.equal(c.body.deleted, 1);
  assert.ok((await call("mike", "GET", "bootstrap")).body.orders.length >= 1); // open lines survive
  const z = await call("mike", "POST", "admin/reset", { confirm: "RESET ALL DATA" });
  assert.equal(z.status, 200);
  const boot = (await call("mike", "GET", "bootstrap")).body;
  assert.equal(boot.orders.length, 0);
  assert.equal(boot.cutoffs.find((c) => c.key === "tue").cutoff, "10:00");
});

// Netlify's local BlobsServer checks If-Match and writes in two steps (and its
// ETags are mtime-based), so it can't referee a race. This store does what
// production Blobs documents: an atomic compare-and-swap on a content ETag,
// with a delay inside every call so requests really interleave.
function casStore() {
  const data = new Map();
  let n = 0;
  const pause = () => new Promise((r) => setTimeout(r, Math.random() * 5));
  return {
    async get(key) { await pause(); const v = data.get(key); return v ? JSON.parse(v.body) : null; },
    async getWithMetadata(key) {
      await pause();
      const v = data.get(key);
      return v ? { data: JSON.parse(v.body), etag: v.etag, metadata: {} } : null;
    },
    async setJSON(key, value, opts = {}) {
      await pause();
      const cur = data.get(key); // check-and-set below runs without awaiting: atomic
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${++n}"`;
      data.set(key, { body: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
    async list() { return { blobs: [], directories: [] }; },
  };
}

test("simultaneous saves never overwrite each other", async () => {
  const mod = await import("../../netlify/functions/vendor-orders-api/vendor-orders-api.mjs");
  const h = mod.createHandler({ store: casStore() });
  const req = (method, path, body, token) =>
    h(new Request("https://x.test/api/vendor-orders/" + path, {
      method,
      headers: { authorization: token ? "Bearer " + token : "", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })).then(async (r) => ({ status: r.status, body: await r.json() }));

  const { token } = (await req("POST", "setup", { name: "Mike Robins" })).body;
  const results = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      req("POST", "orders", { vendor: "Agua", po: "C" + i, approved: true, items: [item()] }, token),
    ),
  );
  assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.body)));
  const orders = (await req("GET", "bootstrap", null, token)).body.orders;
  assert.equal(orders.length, 15);
  assert.equal(new Set(orders.map((o) => o.po)).size, 15);
});

test("preview deploys use their own storage", async () => {
  const { openStore } = await import("../../netlify/functions/vendor-orders-api/storage.mjs");
  // Outside Netlify there's no Blobs environment: the app reports demo mode.
  assert.equal(openStore({ deploy: { context: "production" } }), null);
  const mod = await import("../../netlify/functions/vendor-orders-api/vendor-orders-api.mjs");
  const res = await mod.default(new Request("https://x.test/api/vendor-orders/config"), {});
  assert.deepEqual(await res.json(), { live: false });
});
