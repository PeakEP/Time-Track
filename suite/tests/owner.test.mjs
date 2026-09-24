// Owner sign-in set in Netlify (OWNER_NAME / OWNER_PIN): works on a brand-new
// site with no setup, is always a full Admin, keeps the lockout, and can't be
// changed from Suite Admin.
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.OWNER_NAME = "Robins";
process.env.OWNER_PIN = "051711";

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

let suite;
const T = {};
async function call(who, method, path, body) {
  const r = await suite(new Request("https://x.test/api/suite/" + path, {
    method, headers: { cookie: (who && T[who]) || "", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: r.status, body: await r.json(), cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}

before(async () => {
  const stores = { vo: casStore(), sel: casStore() };
  suite = (await import("../../netlify/functions/suite-api/suite-api.mjs")).createHandler({ stores });
});

test("owner signs in on a fresh site without setup", async () => {
  assert.deepEqual((await call(null, "GET", "config")).body, { live: true, needsSetup: false, ownerSet: true });
  assert.equal((await call(null, "POST", "setup", { name: "Someone" })).status, 409);
  assert.equal((await call(null, "POST", "login", { name: "Robins", pin: "000000" })).status, 401);
  const r = await call(null, "POST", "login", { name: " robins ", pin: "051711" });
  assert.equal(r.status, 200);
  assert.equal(r.body.me.admin, true);
  assert.deepEqual(r.body.me.apps, { vendorOrders: "purchaser", selections: "designer", cabinet: true, aline: true });
  T.owner = r.cookie;
  assert.equal((await call("owner", "GET", "check?app=admin")).status, 200);
});

test("owner can't be changed from Suite Admin", async () => {
  const team = (await call("owner", "GET", "team")).body.users;
  const me = team.find((u) => u.owner);
  assert.equal(me.name, "Robins");
  assert.equal((await call("owner", "PATCH", "team/" + me.id, { active: false })).status, 400);
  assert.equal((await call("owner", "PATCH", "team/" + me.id, { admin: false })).status, 400);
  assert.equal((await call("owner", "POST", "team/" + me.id + "/reset-pin")).status, 400);
  // but can still add people
  assert.equal((await call("owner", "POST", "team", { name: "Dana Design" })).status, 201);
});

test("owner PIN still locks after 5 wrong tries", async () => {
  for (let i = 0; i < 5; i++) await call(null, "POST", "login", { name: "Robins", pin: "999999" });
  assert.equal((await call(null, "POST", "login", { name: "Robins", pin: "051711" })).status, 429);
});
