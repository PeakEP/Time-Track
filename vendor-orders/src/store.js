// Data layer. `remoteStore` talks to the Vendor Orders API (shared queue in Netlify Blobs).
// `demoStore` mirrors the same calls in this browser's localStorage so the tool
// can be reviewed on a deployment that has no database / sign-in configured yet.
import {
  isPurchaser,
  canModifyLine,
  checkPatch,
  CLEAR_HISTORY_PHRASE,
  RESET_ALL_PHRASE,
} from "./rules.js";

const API = "/api/vendor-orders/";
const SESSION_KEY = "rid_vo_session";

// Who is signed in on this device: { name, token }. The token is the session
// the server issued after a correct name + PIN.
export function savedUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
export function saveUser(u) {
  try {
    if (u) localStorage.setItem(SESSION_KEY, JSON.stringify({ name: u.name, token: u.token || "" }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export async function fetchConfig() {
  try {
    const r = await fetch(API + "config", { headers: { accept: "application/json" } });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* ------------------------------ remote ------------------------------ */

async function call(method, path, body) {
  const u = savedUser();
  const r = await fetch(API + path, {
    method,
    headers: {
      ...(u && u.token ? { authorization: "Bearer " + u.token } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || "Request failed (" + r.status + ")");
    e.status = r.status;
    throw e;
  }
  return data;
}

export const remoteStore = {
  mode: "live",
  // -> { token, me }
  login: (name, pin) => call("POST", "login", { name, pin }),
  // First-run only -> { token, me, pin }
  setup: (name) => call("POST", "setup", { name }),
  logout: () => call("POST", "logout"),
  load: () => call("GET", "bootstrap"),
  createOrder: (order) => call("POST", "orders", order),
  patchOrder: (id, patch) => call("PATCH", "orders/" + id, patch),
  deleteOrder: (id) => call("DELETE", "orders/" + id),
  deleteGroup: (gid) => call("DELETE", "groups/" + gid),
  markOrdered: (req) => call("POST", "batches/ordered", req),
  saveCutoffs: (times) => call("PUT", "cutoffs", times),
  createVendor: (v) => call("POST", "vendors", v),
  updateVendor: (id, v) => call("PATCH", "vendors/" + id, v),
  listUsers: () => call("GET", "users"),
  updateUser: (id, patch) => call("PATCH", "users/" + id, patch),
  // -> { user, pin }
  createUser: (u) => call("POST", "users", u),
  resetPin: (id) => call("POST", "users/" + id + "/reset-pin"),
  clearHistory: (confirm) => call("POST", "admin/clear-history", { confirm }),
  resetAll: (confirm) => call("POST", "admin/reset", { confirm }),
};

/* ------------------------------ demo ------------------------------ */

const DEMO_KEY = "rid_vo_demo_v1";
const DEFAULT_CUTOFFS = [
  { key: "tue", label: "Tuesday", weekday: 2, cutoff: "10:00", timezone: "America/Halifax" },
  { key: "thu", label: "Thursday", weekday: 4, cutoff: "10:00", timezone: "America/Halifax" },
];
const DEFAULT_VENDORS = [
  ["Avide Flooring", "tue", "Flooring"],
  ["Richmond Flooring", "tue", "Flooring"],
  ["MSI", "tue", "Tile / Stone"],
  ["Sarana Tile", "tue", "Tile"],
  ["Tosca", "tue", "Fixtures"],
  ["Agua", "thu", "Kitchen & Bath"],
  ["Maxxmar", "thu", "Window coverings"],
  ["Dainolite", "thu", "Lighting"],
  ["Marathon", "thu", "Hardware"],
];

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const clone = (x) => JSON.parse(JSON.stringify(x));

function freshDemo() {
  return {
    me: { id: "demo-user", name: "Demo User", email: "", role: "purchaser", active: true },
    vendors: DEFAULT_VENDORS.map(([name, day, cat], i) => ({
      id: uid(), name, day, cat, active: true, sortOrder: i + 1,
    })),
    cutoffs: clone(DEFAULT_CUTOFFS),
    orders: [],
  };
}
function readDemo() {
  try {
    const s = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
    if (s && s.vendors) return s;
  } catch {}
  return freshDemo();
}
function writeDemo(s) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(s));
  } catch {}
}
function demo(fn) {
  return async (...args) => {
    const s = readDemo();
    const out = fn(s, ...args);
    writeDemo(s);
    return out;
  };
}
function demoPin() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}
function fail(msg) {
  throw new Error(msg);
}

export const demoStore = {
  mode: "demo",
  // Demo accepts any PIN — nothing is protected in a browser-only demo.
  login: demo((s, name) => {
    s.me.name = name.trim().replace(/\s+/g, " ");
    return { token: "demo", me: clone(s.me) };
  }),
  setup: async () => fail("Setup happens on the live deployment."),
  logout: async () => ({ ok: true }),
  load: demo((s) => clone({ ...s, orders: [...s.orders].reverse() })),
  // Demo only: lets a reviewer try both roles. Live roles come from the server.
  setDemoIdentity: demo((s, name, role) => {
    s.me.name = name || s.me.name;
    s.me.role = role;
    return {};
  }),
  createOrder: demo((s, o) => {
    const v = s.vendors.find((x) => x.name === o.vendor) || fail("Unknown vendor");
    const groupId = uid();
    const now = new Date().toISOString();
    for (const it of o.items) {
      s.orders.push({
        id: uid(), groupId, vendor: v.name, orderDay: v.day, po: o.po, jobCode: o.jobCode,
        client: o.client, neededBy: o.neededBy, notes: o.notes, approved: !!o.approved,
        status: o.approved ? "ready" : "pending", productName: it.productName, sku: it.sku,
        description: it.description, coa: it.coa, qty: Number(it.qty), unit: it.unit,
        cost: Number(it.cost) || 0, createdBy: s.me.id, createdByName: s.me.name, createdAt: now,
        orderedAt: "", orderedByName: "", receivedAt: "", confirmation: "", eta: "",
      });
    }
    return { created: o.items.length };
  }),
  patchOrder: demo((s, id, patch) => {
    const o = s.orders.find((x) => x.id === id) || fail("Line not found");
    const err = checkPatch(s.me, o, patch);
    if (err) fail(err);
    if (patch.vendor) patch.orderDay = (s.vendors.find((v) => v.name === patch.vendor) || {}).day;
    if (patch.status && patch.status !== o.status) {
      patch.approved = patch.status !== "pending";
      if (patch.status === "ordered" && !o.orderedAt) {
        patch.orderedAt = new Date().toISOString();
        patch.orderedByName = s.me.name;
      }
      if (patch.status === "received") patch.receivedAt = new Date().toISOString();
    }
    Object.assign(o, patch);
    return { ok: true };
  }),
  deleteOrder: demo((s, id) => {
    const o = s.orders.find((x) => x.id === id);
    if (o && !canModifyLine(s.me, o)) fail("You can only delete your own lines before they are ordered.");
    s.orders = s.orders.filter((x) => x.id !== id);
    return { deleted: 1 };
  }),
  deleteGroup: demo((s, gid) => {
    const lines = s.orders.filter((x) => x.groupId === gid);
    if (lines.some((o) => !canModifyLine(s.me, o)))
      fail("Only a Purchaser can delete an order that has lines already ordered or added by someone else.");
    s.orders = s.orders.filter((x) => x.groupId !== gid);
    return { deleted: lines.length };
  }),
  markOrdered: demo((s, { vendor, ids, confirmation, eta }) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    const now = new Date().toISOString();
    let n = 0;
    for (const o of s.orders) {
      if (ids.includes(o.id) && o.vendor === vendor && o.status === "ready") {
        Object.assign(o, { status: "ordered", orderedAt: now, orderedByName: s.me.name, confirmation, eta });
        n++;
      }
    }
    return { ordered: n };
  }),
  saveCutoffs: demo((s, times) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    for (const c of s.cutoffs) if (times[c.key]) c.cutoff = times[c.key];
    return { ok: true };
  }),
  createVendor: demo((s, v) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    if (!v.name) fail("Vendor name is required");
    if (s.vendors.some((x) => x.name === v.name)) fail(v.name + " already exists");
    const row = { id: uid(), name: v.name, day: v.day, cat: v.cat || "", active: true, sortOrder: s.vendors.length + 1 };
    s.vendors.push(row);
    return row;
  }),
  updateVendor: demo((s, id, v) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    const row = s.vendors.find((x) => x.id === id) || fail("Vendor not found");
    if (v.name && v.name !== row.name && s.vendors.some((x) => x.name === v.name)) fail(v.name + " already exists");
    for (const o of s.orders) {
      if (o.vendor !== row.name) continue;
      if (v.name) o.vendor = v.name;
      if (v.day && ["pending", "ready"].includes(o.status)) o.orderDay = v.day;
    }
    Object.assign(row, v);
    return { ok: true };
  }),
  listUsers: demo((s) => ({ users: [{ ...clone(s.me), hasPin: true }, ...(s.team || [])] })),
  updateUser: demo((s, id, patch) => {
    const u = (s.team || []).find((x) => x.id === id) || fail("Change your own role with the demo picker.");
    Object.assign(u, patch);
    return { ok: true };
  }),
  createUser: demo((s, { name, role }) => {
    name = (name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2) fail("Enter the person's full name");
    s.team = s.team || [];
    if ([s.me, ...s.team].some((u) => u.name.toLowerCase() === name.toLowerCase()))
      fail(name + " is already on the team — use Reset PIN instead.");
    const user = { id: uid(), name, role: role === "purchaser" ? "purchaser" : "sales_rep", active: true, hasPin: true };
    s.team.push(user);
    return { user, pin: demoPin() };
  }),
  resetPin: demo((s, id) => {
    const u = [s.me, ...(s.team || [])].find((x) => x.id === id) || fail("User not found");
    return { user: clone(u), pin: demoPin() };
  }),
  clearHistory: demo((s, confirm) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    if (confirm !== CLEAR_HISTORY_PHRASE) fail("Type " + CLEAR_HISTORY_PHRASE + " to confirm");
    const before = s.orders.length;
    s.orders = s.orders.filter((o) => !["ordered", "received"].includes(o.status));
    return { deleted: before - s.orders.length };
  }),
  resetAll: demo((s, confirm) => {
    if (!isPurchaser(s.me)) fail("Purchaser access required");
    if (confirm !== RESET_ALL_PHRASE) fail("Type " + RESET_ALL_PHRASE + " to confirm");
    const n = s.orders.length;
    s.orders = [];
    s.cutoffs = clone(DEFAULT_CUTOFFS);
    return { deleted: n };
  }),
};
