// Suite API + page gate: first-time setup on the home page, one sign-in (a
// cookie) for every app, per-app access set by Admins, clients limited to
// their Finish Selections project, and the gate's decisions.
import { test, before } from "node:test";
import assert from "node:assert/strict";

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

let suite, sel, gateMod;
const T = {}; // cookies by person
async function call(who, method, path, body) {
  const r = await suite(new Request("https://x.test/api/suite/" + path, {
    method, headers: { cookie: who && T[who] ? T[who] : "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { status: r.status, body: await r.json(), cookie };
}
async function selCall(who, method, path, body) {
  const r = await sel(new Request("https://x.test/api/selections/" + path, {
    method, headers: { cookie: T[who] || "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json() };
}
const wrong = (pin) => (pin === "000000" ? "111111" : "000000");

before(async () => {
  const stores = { vo: casStore(), sel: casStore() };
  suite = (await import("../../netlify/functions/suite-api/suite-api.mjs")).createHandler({ stores });
  sel = (await import("../../netlify/functions/selections-api/selections-api.mjs")).createHandler({ stores });
  gateMod = await import("../../netlify/edge-functions/suite-gate.js");
});

test("first-time setup makes an Admin with every app and signs them in", async () => {
  assert.deepEqual((await call(null, "GET", "config")).body, { live: true, needsSetup: true });
  const r = await call(null, "POST", "setup", { name: "Mike Robins" });
  assert.equal(r.status, 200);
  assert.match(r.body.pin, /^\d{6}$/);
  assert.match(r.cookie, /^jmrc_session=.+/);
  assert.equal(r.body.me.admin, true);
  assert.deepEqual(r.body.me.apps, { vendorOrders: "purchaser", selections: "designer", cabinet: true, aline: true });
  T.mike = r.cookie;
  T.mikePin = r.body.pin;
  assert.equal((await call(null, "POST", "setup", { name: "Someone Else" })).status, 409);
  assert.equal((await call(null, "GET", "config")).body.needsSetup, false);
  assert.equal((await call("mike", "GET", "me")).body.me.name, "Mike Robins");
});

test("Admins add people with per-app access; others can't", async () => {
  assert.equal((await call(null, "GET", "team")).status, 401);
  const r = await call("mike", "POST", "team", {
    name: "Sam Sales", apps: { vendorOrders: "sales_rep", selections: "none", cabinet: false, aline: true },
  });
  assert.equal(r.status, 201);
  T.samId = r.body.user.id;
  T.samPin = r.body.pin;
  assert.equal(r.body.user.admin, false);
  assert.equal(r.body.user.apps.selections, "none");
  assert.equal((await call("mike", "POST", "team", { name: "sam sales" })).status, 400);
  assert.equal((await call("mike", "POST", "team", { name: "Bad Role", apps: { vendorOrders: "boss" } })).status, 400);

  const s = await call(null, "POST", "login", { name: "Sam Sales", pin: T.samPin });
  assert.equal(s.status, 200);
  T.sam = s.cookie;
  assert.equal((await call("sam", "GET", "team")).status, 403);
  assert.equal((await call("sam", "POST", "team", { name: "Sneaky Pete" })).status, 403);
  assert.equal((await call("sam", "PATCH", "team/" + T.samId, { admin: true })).status, 403);
});

test("check says who may open which app", async () => {
  const st = async (who, app) => (await call(who, "GET", "check?app=" + app)).status;
  assert.equal(await st(null, "cabinet"), 401);
  assert.equal(await st("mike", "admin"), 200);
  assert.equal(await st("mike", "cabinet"), 200);
  assert.equal(await st("sam", "vendorOrders"), 200);
  assert.equal(await st("sam", "aline"), 200);
  assert.equal(await st("sam", "cabinet"), 403);
  assert.equal(await st("sam", "selections"), 403);
  assert.equal(await st("sam", "admin"), 403);
  assert.equal((await call("sam", "GET", "check?app=nope")).status, 400);
  // the Selections API agrees
  assert.equal((await selCall("sam", "GET", "projects")).status, 403);
  assert.equal((await selCall("mike", "GET", "projects")).status, 200);
});

test("Admins change access; last Admin and last Purchaser are protected", async () => {
  const r = await call("mike", "PATCH", "team/" + T.samId, { apps: { cabinet: true, selections: "designer" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.apps.cabinet, true);
  assert.equal(r.body.user.apps.vendorOrders, "sales_rep"); // untouched
  assert.equal((await call("sam", "GET", "check?app=cabinet")).status, 200);

  const team = (await call("mike", "GET", "team")).body;
  const mikeId = team.users.find((u) => u.name === "Mike Robins").id;
  assert.equal((await call("mike", "PATCH", "team/" + mikeId, { admin: false })).status, 400);
  assert.equal((await call("mike", "PATCH", "team/" + mikeId, { apps: { vendorOrders: "sales_rep" } })).status, 400);
  assert.equal((await call("mike", "PATCH", "team/" + mikeId, { active: false })).status, 400);

  // turning someone off ends their sessions
  assert.equal((await call("mike", "PATCH", "team/" + T.samId, { active: false })).status, 200);
  assert.equal((await call("sam", "GET", "me")).status, 401);
  assert.equal((await call(null, "POST", "login", { name: "Sam Sales", pin: T.samPin })).status, 403);
  await call("mike", "PATCH", "team/" + T.samId, { active: true });

  const reset = await call("mike", "POST", "team/" + T.samId + "/reset-pin");
  assert.match(reset.body.pin, /^\d{6}$/);
  assert.equal((await call(null, "POST", "login", { name: "Sam Sales", pin: T.samPin })).status, 401);
  T.sam = (await call(null, "POST", "login", { name: "Sam Sales", pin: reset.body.pin })).cookie;
  assert.equal((await call("sam", "GET", "me")).status, 200);
});

test("clients: only their project, listed and managed in Admin", async () => {
  const p = await selCall("mike", "POST", "projects", { client: "Jane Smith", title: "Smith — 12 Elm St" });
  assert.equal(p.status, 201);
  const projectId = p.body.project.id;
  assert.equal((await call("mike", "POST", "team", { name: "Jane Smith" })).status, 400); // taken by a client

  const j = await call(null, "POST", "login", { name: "Jane Smith", pin: p.body.pin });
  assert.equal(j.body.me.kind, "customer");
  assert.equal(j.body.me.projectId, projectId);
  T.jane = j.cookie;
  assert.equal((await call("jane", "GET", "check?app=selections")).status, 200);
  for (const app of ["cabinet", "aline", "vendorOrders", "admin"])
    assert.equal((await call("jane", "GET", "check?app=" + app)).status, 403, app);
  assert.equal((await call("jane", "GET", "team")).status, 403);
  assert.equal((await selCall("jane", "GET", "projects/" + projectId)).status, 200); // cookie works in the app

  const clients = (await call("mike", "GET", "team")).body.clients;
  assert.equal(clients.length, 1);
  assert.equal(clients[0].name, "Jane Smith");
  assert.equal(clients[0].project, "Smith — 12 Elm St");

  assert.equal((await call("mike", "PATCH", "clients/" + projectId, { active: false })).status, 200);
  assert.equal((await call("jane", "GET", "check?app=selections")).status, 401);
  const re = await call("mike", "POST", "clients/" + projectId + "/reset-pin");
  assert.equal(re.body.customerName, "Jane Smith");
  const j2 = await call(null, "POST", "login", { name: "Jane Smith", pin: re.body.pin });
  assert.equal(j2.status, 200); // reissuing turns access back on
});

test("sign out ends the session and clears the cookie", async () => {
  const r = await call("sam", "POST", "logout");
  assert.match(r.cookie, /^jmrc_session=$/);
  assert.equal((await call("sam", "GET", "me")).status, 401);
});

test("wrong PINs are refused and lock after 5", async () => {
  const team = (await call("mike", "GET", "team")).body;
  const r = await call("mike", "POST", "team", { name: "Lock Test" });
  for (let i = 0; i < 5; i++) assert.equal((await call(null, "POST", "login", { name: "Lock Test", pin: wrong(r.body.pin) })).status, 401);
  assert.equal((await call(null, "POST", "login", { name: "Lock Test", pin: r.body.pin })).status, 429);
  assert.ok(team.users.length >= 2);
});

/* ------------------------------ page gate ------------------------------ */

function gateRun(path, { cookie = "", accept = "text/html", answer }) {
  gateMod._clearCache();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), cookie: init?.headers?.cookie || "" });
    if (answer instanceof Error) throw answer;
    return new Response("{}", { status: answer });
  };
  const next = new Response("the app");
  const req = new Request("https://x.test" + path, { headers: { cookie, accept } });
  return gateMod.default(req, { next: () => next })
    .then((res) => ({ res, calls, passed: res === next }))
    .finally(() => { globalThis.fetch = realFetch; });
}

test("gate: lets in, sends to sign-in, or shows no access", async () => {
  const ok = await gateRun("/cabinet-designer/", { cookie: "jmrc_session=abc; other=1", answer: 200 });
  assert.ok(ok.passed);
  assert.equal(ok.calls[0].url, "https://x.test/api/suite/check?app=cabinet");
  assert.equal(ok.calls[0].cookie, "jmrc_session=abc");

  const out = await gateRun("/selections/?name=Jane%20Smith", { answer: 401 });
  assert.equal(out.res.status, 302);
  assert.equal(out.res.headers.get("location"), "/?next=" + encodeURIComponent("/selections/?name=Jane%20Smith"));

  const asset = await gateRun("/vendor-orders/assets/app.js", { accept: "*/*", answer: 401 });
  assert.equal(asset.res.status, 401);

  const no = await gateRun("/aline-designer", { cookie: "jmrc_session=x", answer: 403 });
  assert.equal(no.res.status, 403);
  assert.match(await no.res.text(), /Aline Cabinet Designer/);

  assert.equal((await gateRun("/admin/", { answer: 500 })).res.status, 503); // fails closed
  assert.equal((await gateRun("/admin/", { answer: new Error("down") })).res.status, 503);

  const other = await gateRun("/", { answer: 401 });
  assert.ok(other.passed);
  assert.equal(other.calls.length, 0);
  assert.equal(gateMod.appFor("/selections-old"), null);
  assert.deepEqual(gateMod.config.path.length, 10);
});
