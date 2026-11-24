// Triangle Intake API: staff sign in with their suite name + PIN, create/edit/
// delete intakes everyone can see, simultaneous edits merge, and a staff member
// without Triangle access is refused. There are no client sign-ins.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { merge3 } from "../../netlify/functions/triangle-api/merge.mjs";

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

let tri, suite;
const T = {};
async function suiteCall(who, method, path, body) {
  const r = await suite(new Request("https://x.test/api/suite/" + path, {
    method, headers: { authorization: who ? "Bearer " + (T[who] || who) : "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json() };
}
async function call(who, method, path, body) {
  const r = await tri(new Request("https://x.test/api/triangle/" + path, {
    method, headers: { authorization: who ? "Bearer " + (T[who] || who) : "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json() };
}

const blank = (over = {}) => ({
  meta: { client: "", contact: "", address: "", date: "2026-11-24", designer: "Susan Parlee", employee: "", projectType: "", timeline: "" },
  selections: {}, notes: {}, requests: "", ...over,
});

before(async () => {
  const stores = { tri: casStore(), vo: casStore(), sel: casStore() };
  const suiteMod = await import("../../netlify/functions/suite-api/suite-api.mjs");
  const triMod = await import("../../netlify/functions/triangle-api/triangle-api.mjs");
  suite = suiteMod.createHandler({ stores: { vo: stores.vo, sel: stores.sel } });
  tri = triMod.createHandler({ stores });

  // First-time setup makes Mike an Admin with every app (incl. Triangle).
  const r = await suite(new Request("https://x.test/api/suite/setup", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Mike Robins" }),
  }));
  const m = (r.headers.get("set-cookie") || "").match(/jmrc_session=([^;]+)/);
  T.mike = m ? m[1] : null;
});

// The suite handler returns the session in a Set-Cookie; capture it for Bearer use.
async function suiteLogin(name, pin) {
  const r = await suite(new Request("https://x.test/api/suite/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin }),
  }));
  const cookie = r.headers.get("set-cookie") || "";
  const m = cookie.match(/jmrc_session=([^;]+)/);
  return { status: r.status, token: m ? m[1] : null, body: await r.json() };
}

test("setup + Mike can sign in to Triangle and has access", async () => {
  // Re-run setup path cleanly: fetch Mike a fresh PIN via setup is one-shot, so
  // sign in with the PIN setup returned.
  const setup = await suite(new Request("https://x.test/api/suite/config"));
  const cfg = await setup.json();
  assert.equal(cfg.live, true);
  // Mike's token came from setup's Set-Cookie:
  assert.ok(T.mike, "Mike has a session token");
  const me = await call("mike", "GET", "me");
  assert.equal(me.status, 200);
  assert.equal(me.body.me.kind, "staff");
  assert.equal(me.body.me.name, "Mike Robins");
});

test("create, list, get and delete an intake", async () => {
  const c = await call("mike", "POST", "projects", {
    client: "Jane Smith", title: "Smith — 12 Elm St",
    project: blank({ selections: { construction: ["fivepiece"] } }),
  });
  assert.equal(c.status, 201);
  const id = c.body.project.id;
  assert.equal(c.body.project.client, "Jane Smith");

  const list = await call("mike", "GET", "projects");
  assert.equal(list.body.projects.length, 1);
  assert.equal(list.body.projects[0].id, id);

  const g = await call("mike", "GET", "projects/" + id);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.project.selections.construction, ["fivepiece"]);

  assert.equal((await call("mike", "DELETE", "projects/" + id)).status, 200);
  assert.equal((await call("mike", "GET", "projects/" + id)).status, 404);
});

test("concurrent edits merge (both sides kept)", async () => {
  const c = await call("mike", "POST", "projects", { client: "Merge Co", title: "Merge", project: blank() });
  const id = c.body.project.id;
  const g = await call("mike", "GET", "projects/" + id);
  const base = g.body.project;

  // Editor A sets construction; editor B sets a note — from the same base.
  const a = { ...base, selections: { ...base.selections, construction: ["mdf"] } };
  const b = { ...base, notes: { ...base.notes, construction: "painted white" } };
  const ra = await call("mike", "PUT", "projects/" + id, { base, project: a });
  assert.equal(ra.status, 200);
  const rb = await call("mike", "PUT", "projects/" + id, { base, project: b });
  assert.equal(rb.status, 200);

  const final = (await call("mike", "GET", "projects/" + id)).body.project;
  assert.deepEqual(final.selections.construction, ["mdf"], "A's construction kept");
  assert.equal(final.notes.construction, "painted white", "B's note kept");

  // Sanity: the pure merge function agrees.
  const merged = merge3(base, a, b);
  assert.deepEqual(merged.selections.construction, ["mdf"]);
});

test("unauthenticated is refused; a staff member without Triangle access is 403", async () => {
  assert.equal((await call(null, "GET", "projects")).status, 401);

  // Add Pat with Triangle turned off, then have Pat try to use the tool.
  const add = await suiteCall("mike", "POST", "team", {
    name: "Pat NoTriangle",
    apps: { vendorOrders: "sales_rep", selections: "none", cabinet: true, aline: true, triangle: false, quoteBuilder: false },
  });
  assert.equal(add.status, 201);
  const pat = await suiteLogin("Pat NoTriangle", add.body.pin);
  assert.equal(pat.status, 200);
  T.pat = pat.token;

  // The suite gate says no…
  assert.equal((await suiteCall("pat", "GET", "check?app=triangle")).status, 403);
  // …and so does the Triangle API.
  assert.equal((await call("pat", "GET", "projects")).status, 403);
  // Logging in to Triangle directly is refused too.
  const login = await call(null, "POST", "login", { name: "Pat NoTriangle", pin: add.body.pin });
  assert.equal(login.status, 403);
});
