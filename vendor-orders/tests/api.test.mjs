// Integration tests for the Vendor Orders API against a real Postgres.
// Run with: TEST_DATABASE_URL=postgres://... npm run test:vendor-orders
// (Skipped when TEST_DATABASE_URL is not set. The database is wiped.)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && "TEST_DATABASE_URL not set";

let handler, sql;
const IDS = {}; // name key -> user id, filled by login

async function call(who, method, path, body) {
  const res = await handler(
    new Request("https://x.test/api/vendor-orders/" + path, {
      method,
      headers: { "x-user-id": (who && (IDS[who] || who)) || "", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (skip) return;
  Object.assign(process.env, { DATABASE_URL: DB, PURCHASER_NAMES: "Mike Robins" });
  const mod = await import("../../netlify/functions/vendor-orders-api/vendor-orders-api.mjs");
  const db = await import("../../netlify/functions/vendor-orders-api/db.mjs");
  sql = db.getSql();
  await sql.unsafe("DROP TABLE IF EXISTS order_events, orders, cost_codes, cutoffs, vendors, app_users CASCADE");
  handler = mod.createHandler();
});
after(async () => { if (sql) await sql.end(); });

const item = (o = {}) => ({ productName: "Oak LVP", coa: "5540", qty: 10, unit: "box", cost: 42.5, ...o });

test("config is public and reports live", { skip }, async () => {
  const r = await call(null, "GET", "config");
  assert.equal(r.status, 200);
  assert.equal(r.body.live, true);
});

test("name login: first user is Purchaser, names are case-insensitive", { skip }, async () => {
  assert.equal((await call(null, "GET", "bootstrap")).status, 401);
  assert.equal((await call("00000000-0000-0000-0000-000000000000", "GET", "bootstrap")).status, 401);
  assert.equal((await call(null, "POST", "login", { name: " " })).status, 400);
  const first = await call(null, "POST", "login", { name: "Rita  Rep" });
  assert.equal(first.body.me.role, "purchaser"); // first ever sign-in
  assert.equal(first.body.me.name, "Rita Rep");
  const again = await call(null, "POST", "login", { name: "rita rep" });
  assert.equal(again.body.me.id, first.body.me.id);
  IDS.rep = first.body.me.id;
  IDS.mike = (await call(null, "POST", "login", { name: "Mike Robins" })).body.me.id; // PURCHASER_NAMES
  IDS.rep2 = (await call(null, "POST", "login", { name: "Sam Rep" })).body.me.id;
  assert.deepEqual((await call(null, "GET", "names")).body.names, ["Mike Robins", "Rita Rep", "Sam Rep"]);
  // demote Rita to a rep for the rest of the suite
  assert.equal((await call("mike", "PATCH", "users/" + IDS.rep, { role: "sales_rep" })).status, 200);
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

  const ev = await sql`SELECT event FROM order_events WHERE order_id = ${a.id} ORDER BY created_at`;
  assert.deepEqual(ev.map((e) => e.event), ["created", "approved", "ordered", "backordered", "received"]);

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
  const me = users.find((u) => u.name === "Mike Robins");
  assert.equal((await call("mike", "PATCH", "users/" + me.id, { role: "sales_rep" })).status, 400);
  const rep2 = users.find((u) => u.name === "Sam Rep");
  assert.equal((await call("mike", "PATCH", "users/" + rep2.id, { active: false })).status, 200);
  assert.equal((await call("rep2", "GET", "bootstrap")).status, 403);
  assert.equal((await call(null, "POST", "login", { name: "Sam Rep" })).status, 403);
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
