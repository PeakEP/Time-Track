// Vendor Orders API (Netlify Function). Mounted at /api/vendor-orders/* via netlify.toml.
// Data lives in Netlify Blobs (storage.mjs), so no database needs setting up.
// Sign-in is name + a PIN; POST /login returns a session token (sent back as a
// Bearer token or the suite cookie, see shared/accounts.mjs). Staff accounts
// are suite-wide; this app needs Vendor Orders access, and roles are checked
// here on every Purchaser-only route, never taken from the client.
import { openStore, readState, mutate, DEFAULT_CUTOFFS } from "../../shared/storage.mjs";
import {
  newPin, hashPin, checkPin, newToken, hashToken, MAX_FAILED, LOCK_MINUTES, SESSION_DAYS,
} from "../../shared/pins.mjs";
import {
  accessOf, canUse, needsSetup, publicUser, setupFirstAdmin, sessionCookie, clearCookie, tokenOf,
  createStaff, resetStaffPin, updateStaff,
} from "../../shared/accounts.mjs";
import COST_SEED from "../../../vendor-orders/seed/cost_codes.json" with { type: "json" };
import {
  isPurchaser,
  canModifyLine,
  checkPatch,
  CLEAR_HISTORY_PHRASE,
  RESET_ALL_PHRASE,
} from "../../../vendor-orders/src/rules.js";

const STATUSES = ["pending", "ready", "ordered", "received", "backordered"];
const DAYS = ["tue", "thu"];
const MAX_ORDERS_RETURNED = 5000;

class HttpError extends Error {
  constructor(status, message, commit = false) {
    super(message);
    this.status = status;
    this.commit = commit;
  }
}
const bad = (msg) => new HttpError(400, msg);
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

/* ------------------------------ mapping ------------------------------ */

const nameOf = (state, id) => (id && state.users.find((u) => u.id === id)?.name) || "";
const outOrder = (state, o) => ({
  ...o,
  createdByName: nameOf(state, o.createdBy),
  orderedByName: nameOf(state, o.orderedBy),
});
const mapUser = publicUser;

/* ------------------------------ validation ------------------------------ */

const str = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
function dateOrEmpty(v, field) {
  const s = str(v, 10);
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`${field} must be a date (YYYY-MM-DD)`);
  return s;
}
function requireCoa(code) {
  const c = str(code, 8);
  if (!c) throw bad("Pick a cost code for every item — if unsure, check with Susan");
  if (!COST_SEED.codes[c]) throw bad(`Unknown cost code ${c}`);
  return c;
}
function positiveQty(v) {
  const n = Number(v);
  if (!(n > 0)) throw bad("Qty must be greater than zero");
  return Math.round(n * 1000) / 1000;
}
function cost(v) {
  const n = Number(v) || 0;
  if (n < 0) throw bad("Cost cannot be negative");
  return Math.round(n * 100) / 100;
}
function requireText(v, msg, max) {
  const s = str(v, max);
  if (!s) throw bad(msg);
  return s;
}
const cleanName = (v) => str(v, 80).replace(/\s+/g, " ");
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/* ------------------------------ helpers ------------------------------ */

function requirePurchaser(user) {
  if (!isPurchaser(user)) throw new HttpError(403, "Purchaser access required");
}
function findOrder(state, id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) throw new HttpError(404, "Line not found — it may have been deleted");
  return o;
}
function findVendor(state, name) {
  const v = state.vendors.find((x) => x.name === name);
  if (!v) throw bad(`Unknown vendor ${name}`);
  return v;
}
function findUser(state, id) {
  const u = state.users.find((x) => x.id === id);
  if (!u) throw new HttpError(404, "User not found");
  return u;
}
const logEach = (events, ids, event, actor, detail) =>
  ids.forEach((orderId) => events.push({ orderId, event, actor, detail }));
const now = () => new Date().toISOString();

/* ------------------------------ sign-in ------------------------------ */

const LOGIN_FAILED = "Name or PIN not recognised";

function startSession(state, userId) {
  const token = newToken();
  const t = Date.now();
  state.sessions = state.sessions.filter((s) => new Date(s.expiresAt).getTime() > t);
  state.sessions.push({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(t + SESSION_DAYS * 86400000).toISOString(),
  });
  return token;
}

function setupFirstPurchaser(state, body) {
  const r = setupFirstAdmin(state, body.name);
  return { pin: r.pin, token: r.token, me: mapUser(r.user) };
}

function loginUser(state, body) {
  const name = cleanName(body.name);
  const pin = str(body.pin, 12);
  if (!name || !pin) throw bad("Enter your name and PIN");
  const u = state.users.find((x) => sameName(x.name, name));
  if (!u || !u.pinHash) throw new HttpError(401, LOGIN_FAILED);
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date())
    throw new HttpError(429, `Too many wrong PINs — try again in ${LOCK_MINUTES} minutes, or ask a Purchaser to reset it.`);
  if (!checkPin(pin, u.pinHash)) {
    const fails = (u.failedAttempts || 0) + 1;
    const lock = fails >= MAX_FAILED;
    u.failedAttempts = lock ? 0 : fails;
    u.lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : "";
    throw new HttpError(401, LOGIN_FAILED, true); // save the failed attempt, then refuse
  }
  if (!u.active) throw new HttpError(403, "Your access has been turned off. Ask a Purchaser.");
  u.failedAttempts = 0;
  u.lockedUntil = "";
  return { token: startSession(state, u.id), me: mapUser(u) };
}

function currentUser(state, req) {
  const token = tokenOf(req);
  if (!token) throw new HttpError(401, "Sign in with your name and PIN");
  const h = hashToken(token);
  const s = state.sessions.find((x) => x.tokenHash === h && new Date(x.expiresAt) > new Date());
  const u = s && state.users.find((x) => x.id === s.userId);
  if (!u) throw new HttpError(401, "Your session has ended — sign in again");
  if (!u.active) throw new HttpError(403, "Your access has been turned off. Ask an Admin.");
  if (!canUse(u, "vendorOrders")) throw new HttpError(403, "You don't have access to Vendor Orders. Ask an Admin.");
  return u;
}
function requireAdmin(user) {
  if (!accessOf(user).admin) throw new HttpError(403, "Admin access required");
}

/* ------------------------------ routes ------------------------------ */

function bootstrap(state, user) {
  return {
    me: mapUser(user),
    vendors: [...state.vendors].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    cutoffs: [...state.cutoffs].sort((a, b) => a.weekday - b.weekday),
    orders: [...state.orders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_ORDERS_RETURNED)
      .map((o) => outOrder(state, o)),
  };
}

function createOrder(state, events, user, body) {
  const vendor = findVendor(state, str(body.vendor, 200));
  if (!vendor.active) throw bad(`${vendor.name} is inactive`);
  const po = requireText(body.po, "PO # is required", 100);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw bad("Add at least one item with a product name and qty");
  if (items.length > 200) throw bad("Too many items on one order");
  const approved = !!body.approved;
  const t = now();
  const common = {
    groupId: crypto.randomUUID(),
    vendor: vendor.name,
    orderDay: vendor.day,
    po,
    jobCode: str(body.jobCode, 100),
    client: str(body.client, 300),
    neededBy: dateOrEmpty(body.neededBy, "Needed by"),
    notes: str(body.notes, 2000),
    status: approved ? "ready" : "pending",
    approved,
    createdBy: user.id,
    orderedBy: "",
    confirmation: "",
    eta: "",
    createdAt: t,
    orderedAt: "",
    receivedAt: "",
    updatedAt: t,
  };
  const rows = items.map((it) => ({
    id: crypto.randomUUID(),
    ...common,
    productName: requireText(it.productName, "Every item needs a product name", 300),
    sku: str(it.sku, 100),
    description: str(it.description, 1000),
    coa: requireCoa(it.coa),
    qty: positiveQty(it.qty),
    unit: str(it.unit, 20),
    cost: cost(it.cost),
  }));
  state.orders.push(...rows);
  const ids = rows.map((r) => r.id);
  logEach(events, ids, "created", user.id);
  return { created: ids.length, ids };
}

function patchOrder(state, events, user, id, body) {
  const order = findOrder(state, id);
  const err = checkPatch(user, order, body);
  if (err) throw new HttpError(403, err);

  const set = {};
  if ("vendor" in body) {
    const v = findVendor(state, str(body.vendor, 200));
    set.vendor = v.name;
    set.orderDay = v.day;
  }
  if ("po" in body) set.po = requireText(body.po, "PO # is required", 100);
  if ("coa" in body) set.coa = requireCoa(body.coa);
  if ("jobCode" in body) set.jobCode = str(body.jobCode, 100);
  if ("client" in body) set.client = str(body.client, 300);
  if ("neededBy" in body) set.neededBy = dateOrEmpty(body.neededBy, "Needed by");
  if ("productName" in body) set.productName = requireText(body.productName, "Product name and qty required", 300);
  if ("sku" in body) set.sku = str(body.sku, 100);
  if ("description" in body) set.description = str(body.description, 1000);
  if ("qty" in body) set.qty = positiveQty(body.qty);
  if ("unit" in body) set.unit = str(body.unit, 20);
  if ("cost" in body) set.cost = cost(body.cost);
  if ("notes" in body) set.notes = str(body.notes, 2000);
  if ("confirmation" in body) set.confirmation = str(body.confirmation, 100);
  if ("eta" in body) set.eta = dateOrEmpty(body.eta, "ETA");

  let event = "edited";
  if ("status" in body && body.status !== order.status) {
    const status = str(body.status, 20);
    if (!STATUSES.includes(status)) throw bad("Unknown status");
    set.status = status;
    set.approved = status !== "pending";
    if (status === "ordered" && !order.orderedAt) {
      set.orderedAt = now();
      set.orderedBy = user.id;
    }
    if (status === "received") set.receivedAt = now();
    event = status === "ready" ? "approved" : status;
  }
  if (!Object.keys(set).length) return { ok: true };
  Object.assign(order, set, { updatedAt: now() });
  logEach(events, [id], event, user.id, { fields: Object.keys(set) });
  return { ok: true };
}

function deleteOrder(state, events, user, id) {
  const order = findOrder(state, id);
  if (!canModifyLine(user, order))
    throw new HttpError(403, "You can only delete your own lines before they are ordered.");
  state.orders = state.orders.filter((o) => o.id !== id);
  logEach(events, [id], "deleted", user.id, { po: order.po, product: order.productName });
  return { deleted: 1 };
}

function deleteGroup(state, events, user, gid) {
  const lines = state.orders.filter((o) => o.groupId === gid);
  if (!lines.length) throw new HttpError(404, "Order not found");
  if (lines.some((o) => !canModifyLine(user, o)))
    throw new HttpError(403, "Only a Purchaser can delete an order that has lines already ordered or added by someone else.");
  state.orders = state.orders.filter((o) => o.groupId !== gid);
  logEach(events, lines.map((o) => o.id), "deleted", user.id, { group: gid });
  return { deleted: lines.length };
}

function markBatchOrdered(state, events, user, body) {
  requirePurchaser(user);
  const vendor = str(body.vendor, 200);
  const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
  if (!vendor || !ids.size) throw bad("Nothing to order");
  const eta = dateOrEmpty(body.eta, "ETA");
  const confirmation = str(body.confirmation, 100);
  const t = now();
  const done = [];
  for (const o of state.orders) {
    if (ids.has(o.id) && o.vendor === vendor && o.status === "ready") {
      Object.assign(o, { status: "ordered", orderedAt: t, orderedBy: user.id, confirmation, eta, updatedAt: t });
      done.push(o.id);
    }
  }
  logEach(events, done, "ordered", user.id, { vendor, confirmation, eta });
  return { ordered: done.length };
}

function saveCutoffs(state, user, body) {
  requirePurchaser(user);
  for (const day of DAYS) {
    if (!(day in body)) continue;
    const t = str(body[day], 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw bad("Cutoff must be a time (HH:MM)");
    const c = state.cutoffs.find((x) => x.key === day);
    if (c) c.cutoff = t;
  }
  return { ok: true };
}

function vendorFields(body, partial) {
  const out = {};
  if (!partial || "name" in body) out.name = requireText(body.name, "Vendor name is required", 200);
  if (!partial || "day" in body) {
    if (!DAYS.includes(body.day)) throw bad("Order day must be Tuesday or Thursday");
    out.day = body.day;
  }
  if (!partial || "cat" in body) out.cat = str(body.cat, 100);
  if ("active" in body) out.active = !!body.active;
  return out;
}
function createVendor(state, user, body) {
  requirePurchaser(user);
  const v = vendorFields(body, false);
  if (state.vendors.some((x) => sameName(x.name, v.name))) throw bad(`${v.name} already exists`);
  const row = {
    id: crypto.randomUUID(), active: true, ...v,
    sortOrder: Math.max(0, ...state.vendors.map((x) => x.sortOrder)) + 1,
  };
  state.vendors.push(row);
  return row;
}
function updateVendor(state, user, id, body) {
  requirePurchaser(user);
  const v = vendorFields(body, true);
  const row = state.vendors.find((x) => x.id === id);
  if (!row) throw new HttpError(404, "Vendor not found");
  if (v.name && v.name !== row.name && state.vendors.some((x) => x.id !== id && sameName(x.name, v.name)))
    throw bad(`${v.name} already exists`);
  for (const o of state.orders) {
    if (o.vendor !== row.name) continue;
    if (v.name) o.vendor = v.name; // lines follow a renamed vendor
    if (v.day && ["pending", "ready"].includes(o.status)) o.orderDay = v.day; // open lines move day
  }
  Object.assign(row, v);
  return { ok: true };
}

function listUsers(state, user) {
  requireAdmin(user);
  return { users: [...state.users].sort((a, b) => a.name.localeCompare(b.name)).map(mapUser) };
}
// Team management is suite-wide (shared/accounts.mjs); Admins only.
function createUser(state, user, body) {
  requireAdmin(user);
  const r = createStaff(state, body);
  return { user: mapUser(r.user), pin: r.pin };
}
function resetPin(state, user, id) {
  requireAdmin(user);
  const r = resetStaffPin(state, id);
  return { user: mapUser(r.user), pin: r.pin };
}
function updateUser(state, user, id, body) {
  requireAdmin(user);
  updateStaff(state, id, body);
  return { ok: true };
}

function clearHistory(state, events, user, body) {
  requirePurchaser(user);
  if (body.confirm !== CLEAR_HISTORY_PHRASE) throw bad(`Type ${CLEAR_HISTORY_PHRASE} to confirm`);
  const gone = state.orders.filter((o) => ["ordered", "received"].includes(o.status));
  state.orders = state.orders.filter((o) => !["ordered", "received"].includes(o.status));
  logEach(events, gone.map((o) => o.id), "cleared", user.id);
  return { deleted: gone.length };
}
function resetAll(state, events, user, body) {
  requirePurchaser(user);
  if (body.confirm !== RESET_ALL_PHRASE) throw bad(`Type ${RESET_ALL_PHRASE} to confirm`);
  const n = state.orders.length;
  state.orders = [];
  state.cutoffs = DEFAULT_CUTOFFS.map((c) => ({ ...c }));
  events.push({ event: "reset", actor: user.id, detail: { deleted: n } });
  return { deleted: n };
}

/* ------------------------------ handler ------------------------------ */

export function routePath(url) {
  const p = new URL(url).pathname;
  const m = p.match(/\/(?:api\/vendor-orders|\.netlify\/functions\/vendor-orders-api)\/?(.*)$/);
  return (m ? m[1] : "").replace(/\/+$/, "");
}
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s || "");

// `store` can be injected (tests); on Netlify it comes from the deploy context.
export function createHandler({ store: injected } = {}) {
  return async function handler(req, context) {
    const path = routePath(req.url);
    const method = req.method;
    const store = injected || openStore(context);

    try {
      if (!store) {
        if (path === "config" && method === "GET") return json({ live: false });
        throw new HttpError(503, "Vendor Orders storage isn't available on this deployment.");
      }
      if (path === "config" && method === "GET")
        return json({ live: true, needsSetup: needsSetup(await readState(store)) });

      const body = ["POST", "PUT", "PATCH", "DELETE"].includes(method)
        ? await req.json().catch(() => ({}))
        : {};

      // Signing in sets the suite cookie too, so the other apps know you.
      const signedIn = (r) => json(r, 200, { "set-cookie": sessionCookie(r.token) });
      if (method === "POST" && path === "setup") return signedIn(await mutate(store, (s) => setupFirstPurchaser(s, body)));
      if (method === "POST" && path === "login") return signedIn(await mutate(store, (s) => loginUser(s, body)));

      if (method === "GET") {
        const state = await readState(store);
        const user = currentUser(state, req);
        if (path === "bootstrap") return json(bootstrap(state, user));
        if (path === "users") return json(listUsers(state, user));
        throw new HttpError(404, "Not found");
      }

      const [a, b, c] = path.split("/").map(decodeURIComponent);
      const route = (state, events, user) => {
        if (method === "POST" && path === "logout") {
          const h = hashToken(tokenOf(req));
          state.sessions = state.sessions.filter((s) => s.tokenHash !== h);
          return { ok: true };
        }
        if (method === "POST" && a === "orders" && !b) return createOrder(state, events, user, body);
        if (a === "orders" && isUuid(b) && !c) {
          if (method === "PATCH") return patchOrder(state, events, user, b, body);
          if (method === "DELETE") return deleteOrder(state, events, user, b);
        }
        if (method === "DELETE" && a === "groups" && isUuid(b)) return deleteGroup(state, events, user, b);
        if (method === "POST" && a === "batches" && b === "ordered") return markBatchOrdered(state, events, user, body);
        if (method === "PUT" && a === "cutoffs") return saveCutoffs(state, user, body);
        if (method === "POST" && a === "vendors" && !b) return createVendor(state, user, body);
        if (method === "PATCH" && a === "vendors" && isUuid(b)) return updateVendor(state, user, b, body);
        if (method === "POST" && a === "users" && !b) return createUser(state, user, body);
        if (method === "POST" && a === "users" && isUuid(b) && c === "reset-pin") return resetPin(state, user, b);
        if (method === "PATCH" && a === "users" && isUuid(b) && !c) return updateUser(state, user, b, body);
        if (method === "POST" && a === "admin" && b === "clear-history") return clearHistory(state, events, user, body);
        if (method === "POST" && a === "admin" && b === "reset") return resetAll(state, events, user, body);
        throw new HttpError(404, "Not found");
      };
      const created = method === "POST" && ["orders", "vendors", "users"].includes(a) && !b;
      const result = await mutate(store, (state, events) => route(state, events, currentUser(state, req)));
      if (method === "POST" && path === "logout") return json(result, 200, { "set-cookie": clearCookie() });
      return json(result, created ? 201 : 200);
    } catch (e) {
      if (e instanceof HttpError || e.status) return json({ error: e.message }, e.status);
      console.error("vendor-orders-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
