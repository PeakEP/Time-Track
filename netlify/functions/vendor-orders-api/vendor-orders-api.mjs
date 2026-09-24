// Vendor Orders API (Netlify Function). Mounted at /api/vendor-orders/* via netlify.toml.
// Sign-in is by name only (honour system): POST /login returns the user's id,
// which the browser sends back as X-User-Id. Roles live in app_users and are
// checked here on every Purchaser-only route, never taken from the client.
import { getSql, ensureSchema, databaseUrl, DEFAULT_CUTOFFS } from "./db.mjs";
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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function purchaserNames() {
  return (process.env.PURCHASER_NAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/* ------------------------------ mapping ------------------------------ */

const ORDER_COLUMNS = (sql) => sql`
  o.id, o.order_group_id, o.vendor, o.order_day, o.po, o.job_code, o.client, o.product_name,
  o.sku, o.description, o.coa, o.qty, o.unit, o.unit_cost, o.needed_by::text AS needed_by,
  o.notes, o.status, o.approved, o.created_by, o.ordered_by, o.confirmation, o.eta::text AS eta,
  o.created_at, o.ordered_at, o.received_at,
  cu.display_name AS created_by_name, ou.display_name AS ordered_by_name`;

function mapOrder(r) {
  return {
    id: r.id,
    groupId: r.order_group_id,
    vendor: r.vendor,
    orderDay: r.order_day,
    po: r.po,
    jobCode: r.job_code || "",
    client: r.client || "",
    productName: r.product_name,
    sku: r.sku || "",
    description: r.description || "",
    coa: r.coa || "",
    qty: Number(r.qty),
    unit: r.unit || "",
    cost: Number(r.unit_cost),
    neededBy: r.needed_by || "",
    notes: r.notes || "",
    status: r.status,
    approved: r.approved,
    createdBy: r.created_by,
    createdByName: r.created_by_name || "",
    orderedByName: r.ordered_by_name || "",
    confirmation: r.confirmation || "",
    eta: r.eta || "",
    createdAt: r.created_at && new Date(r.created_at).toISOString(),
    orderedAt: r.ordered_at ? new Date(r.ordered_at).toISOString() : "",
    receivedAt: r.received_at ? new Date(r.received_at).toISOString() : "",
  };
}
const mapUser = (u) => ({
  id: u.id,
  name: u.display_name,
  role: u.role,
  active: u.active,
});
const mapVendor = (v) => ({
  id: v.id,
  name: v.name,
  day: v.order_day,
  cat: v.category || "",
  active: v.active,
  sortOrder: v.sort_order,
});
const mapCutoff = (c) => ({
  key: c.order_day,
  label: c.label,
  weekday: c.weekday,
  cutoff: c.cutoff_time,
  timezone: c.timezone,
});

/* ------------------------------ validation ------------------------------ */

const str = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
function dateOrNull(v, field) {
  const s = str(v, 10);
  if (!s) return null;
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
  return n;
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

/* ------------------------------ data helpers ------------------------------ */

async function loadOrder(sql, id) {
  const [r] = await sql`
    SELECT ${ORDER_COLUMNS(sql)} FROM orders o
    LEFT JOIN app_users cu ON cu.id = o.created_by
    LEFT JOIN app_users ou ON ou.id = o.ordered_by
    WHERE o.id = ${id}`;
  if (!r) throw new HttpError(404, "Line not found — it may have been deleted");
  return mapOrder(r);
}
async function loadVendor(sql, name) {
  const [v] = await sql`SELECT * FROM vendors WHERE name = ${name}`;
  if (!v) throw bad(`Unknown vendor ${name}`);
  return v;
}
function logEvents(sql, orderIds, event, actor, detail = null) {
  if (!orderIds.length) return;
  const rows = orderIds.map((order_id) => ({ order_id, event, actor, detail }));
  return sql`INSERT INTO order_events ${sql(rows, "order_id", "event", "actor", "detail")}`;
}
function requirePurchaser(user) {
  if (!isPurchaser(user)) throw new HttpError(403, "Purchaser access required");
}
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);

function cleanName(v) {
  return str(v, 80).replace(/\s+/g, " ");
}

// Find-or-create by name. The first person ever to sign in, and anyone listed in
// PURCHASER_NAMES, is a Purchaser so someone can always manage roles.
async function loginUser(sql, body) {
  const name = cleanName(body.name);
  if (name.length < 2) throw bad("Enter your full name");
  const forcePurchaser = purchaserNames().includes(name.toLowerCase());
  return sql.begin(async (tx) => {
    await tx`LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE`;
    let [u] = await tx`SELECT * FROM app_users WHERE lower(display_name) = lower(${name})`;
    if (!u) {
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM app_users`;
      const role = forcePurchaser || n === 0 ? "purchaser" : "sales_rep";
      [u] = await tx`INSERT INTO app_users (display_name, role) VALUES (${name}, ${role}) RETURNING *`;
    } else if (forcePurchaser && u.role !== "purchaser") {
      [u] = await tx`UPDATE app_users SET role = 'purchaser', updated_at = now() WHERE id = ${u.id} RETURNING *`;
    }
    if (!u.active) throw new HttpError(403, "That name has been deactivated. Ask a Purchaser.");
    return mapUser(u);
  });
}

async function currentUser(sql, req) {
  const id = req.headers.get("x-user-id") || "";
  if (!isUuid(id)) throw new HttpError(401, "Sign in with your name");
  const [u] = await sql`SELECT * FROM app_users WHERE id = ${id}`;
  if (!u) throw new HttpError(401, "Sign in with your name");
  if (!u.active) throw new HttpError(403, "Your name has been deactivated. Ask a Purchaser.");
  return u;
}

/* ------------------------------ routes ------------------------------ */

async function bootstrap(sql, user) {
  const [vendors, cutoffs, orders] = await Promise.all([
    sql`SELECT * FROM vendors ORDER BY sort_order, name`,
    sql`SELECT * FROM cutoffs ORDER BY weekday`,
    sql`SELECT ${ORDER_COLUMNS(sql)} FROM orders o
        LEFT JOIN app_users cu ON cu.id = o.created_by
        LEFT JOIN app_users ou ON ou.id = o.ordered_by
        ORDER BY o.created_at DESC LIMIT 5000`,
  ]);
  return {
    me: mapUser(user),
    vendors: vendors.map(mapVendor),
    cutoffs: cutoffs.map(mapCutoff),
    orders: orders.map(mapOrder),
  };
}

async function createOrder(sql, user, body) {
  const vendor = await loadVendor(sql, str(body.vendor, 200));
  if (!vendor.active) throw bad(`${vendor.name} is inactive`);
  const po = requireText(body.po, "PO # is required", 100);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw bad("Add at least one item with a product name and qty");
  if (items.length > 200) throw bad("Too many items on one order");
  const approved = !!body.approved;
  const common = {
    vendor: vendor.name,
    order_day: vendor.order_day,
    po,
    job_code: str(body.jobCode, 100) || null,
    client: str(body.client, 300) || null,
    needed_by: dateOrNull(body.neededBy, "Needed by"),
    notes: str(body.notes, 2000) || null,
    status: approved ? "ready" : "pending",
    approved,
    created_by: user.id,
  };
  const rows = items.map((it) => ({
    ...common,
    product_name: requireText(it.productName, "Every item needs a product name", 300),
    sku: str(it.sku, 100) || null,
    description: str(it.description, 1000) || null,
    coa: requireCoa(it.coa),
    qty: positiveQty(it.qty),
    unit: str(it.unit, 20) || null,
    unit_cost: cost(it.cost),
  }));
  const ids = await sql.begin(async (tx) => {
    const [{ gid }] = await tx`SELECT gen_random_uuid() AS gid`;
    const withGroup = rows.map((r) => ({ ...r, order_group_id: gid }));
    const inserted = await tx`INSERT INTO orders ${tx(withGroup, Object.keys(withGroup[0]))} RETURNING id`;
    const ids = inserted.map((r) => r.id);
    await logEvents(tx, ids, "created", user.id);
    return ids;
  });
  return { created: ids.length, ids };
}

async function patchOrder(sql, user, id, body) {
  const order = await loadOrder(sql, id);
  const err = checkPatch(user, order, body);
  if (err) throw new HttpError(403, err);

  const set = {};
  if ("vendor" in body) {
    const v = await loadVendor(sql, str(body.vendor, 200));
    set.vendor = v.name;
    set.order_day = v.order_day;
  }
  if ("po" in body) set.po = requireText(body.po, "PO # is required", 100);
  if ("coa" in body) set.coa = requireCoa(body.coa);
  if ("jobCode" in body) set.job_code = str(body.jobCode, 100) || null;
  if ("client" in body) set.client = str(body.client, 300) || null;
  if ("neededBy" in body) set.needed_by = dateOrNull(body.neededBy, "Needed by");
  if ("productName" in body)
    set.product_name = requireText(body.productName, "Product name and qty required", 300);
  if ("sku" in body) set.sku = str(body.sku, 100) || null;
  if ("description" in body) set.description = str(body.description, 1000) || null;
  if ("qty" in body) set.qty = positiveQty(body.qty);
  if ("unit" in body) set.unit = str(body.unit, 20) || null;
  if ("cost" in body) set.unit_cost = cost(body.cost);
  if ("notes" in body) set.notes = str(body.notes, 2000) || null;
  if ("confirmation" in body) set.confirmation = str(body.confirmation, 100) || null;
  if ("eta" in body) set.eta = dateOrNull(body.eta, "ETA");

  let event = "edited";
  if ("status" in body && body.status !== order.status) {
    const status = str(body.status, 20);
    if (!STATUSES.includes(status)) throw bad("Unknown status");
    set.status = status;
    set.approved = status !== "pending";
    if (status === "ordered" && !order.orderedAt) {
      set.ordered_at = new Date();
      set.ordered_by = user.id;
    }
    if (status === "received") set.received_at = new Date();
    event = status === "ready" ? "approved" : status;
  }
  if (!Object.keys(set).length) return { ok: true };
  set.updated_at = new Date();

  await sql.begin(async (tx) => {
    await tx`UPDATE orders SET ${tx(set, Object.keys(set))} WHERE id = ${id}`;
    await logEvents(tx, [id], event, user.id, { fields: Object.keys(set) });
  });
  return { ok: true };
}

async function deleteOrder(sql, user, id) {
  const order = await loadOrder(sql, id);
  if (!canModifyLine(user, order))
    throw new HttpError(403, "You can only delete your own lines before they are ordered.");
  await sql.begin(async (tx) => {
    await tx`DELETE FROM orders WHERE id = ${id}`;
    await logEvents(tx, [id], "deleted", user.id, { po: order.po, product: order.productName });
  });
  return { deleted: 1 };
}

async function deleteGroup(sql, user, gid) {
  const rows = await sql`SELECT id, status, created_by FROM orders WHERE order_group_id = ${gid}`;
  if (!rows.length) throw new HttpError(404, "Order not found");
  for (const r of rows) {
    if (!canModifyLine(user, { createdBy: r.created_by, status: r.status }))
      throw new HttpError(403, "Only a Purchaser can delete an order that has lines already ordered or added by someone else.");
  }
  const ids = rows.map((r) => r.id);
  await sql.begin(async (tx) => {
    await tx`DELETE FROM orders WHERE order_group_id = ${gid}`;
    await logEvents(tx, ids, "deleted", user.id, { group: gid });
  });
  return { deleted: ids.length };
}

async function markBatchOrdered(sql, user, body) {
  requirePurchaser(user);
  const vendor = str(body.vendor, 200);
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isUuid);
  if (!vendor || !ids.length) throw bad("Nothing to order");
  const eta = dateOrNull(body.eta, "ETA");
  const confirmation = str(body.confirmation, 100) || null;
  return sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE orders SET status = 'ordered', ordered_at = now(), ordered_by = ${user.id},
        confirmation = ${confirmation}, eta = ${eta}, updated_at = now()
      WHERE id IN ${tx(ids)} AND vendor = ${vendor} AND status = 'ready'
      RETURNING id`;
    const done = updated.map((r) => r.id);
    await logEvents(tx, done, "ordered", user.id, { vendor, confirmation, eta });
    return { ordered: done.length };
  });
}

async function saveCutoffs(sql, user, body) {
  requirePurchaser(user);
  for (const day of DAYS) {
    if (!(day in body)) continue;
    const t = str(body[day], 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw bad("Cutoff must be a time (HH:MM)");
    await sql`UPDATE cutoffs SET cutoff_time = ${t}, updated_by = ${user.id}, updated_at = now()
              WHERE order_day = ${day}`;
  }
  return { ok: true };
}

function vendorFields(body, partial) {
  const out = {};
  if (!partial || "name" in body) out.name = requireText(body.name, "Vendor name is required", 200);
  if (!partial || "day" in body) {
    if (!DAYS.includes(body.day)) throw bad("Order day must be Tuesday or Thursday");
    out.order_day = body.day;
  }
  if (!partial || "cat" in body) out.category = str(body.cat, 100) || null;
  if ("active" in body) out.active = !!body.active;
  return out;
}
async function createVendor(sql, user, body) {
  requirePurchaser(user);
  const v = vendorFields(body, false);
  const [{ next }] = await sql`SELECT coalesce(max(sort_order), 0) + 1 AS next FROM vendors`;
  try {
    const [row] = await sql`INSERT INTO vendors ${sql({ ...v, sort_order: next })} RETURNING *`;
    return mapVendor(row);
  } catch (e) {
    if (e.code === "23505") throw bad(`${v.name} already exists`);
    throw e;
  }
}
async function updateVendor(sql, user, id, body) {
  requirePurchaser(user);
  const v = vendorFields(body, true);
  if (!Object.keys(v).length) return { ok: true };
  try {
    await sql.begin(async (tx) => {
      const [row] = await tx`UPDATE vendors SET ${tx(v, Object.keys(v))} WHERE id = ${id} RETURNING *`;
      if (!row) throw new HttpError(404, "Vendor not found");
      // Open lines follow the vendor to its new order day.
      if (v.order_day)
        await tx`UPDATE orders SET order_day = ${v.order_day} WHERE vendor = ${row.name}
                 AND status IN ('pending','ready')`;
    });
  } catch (e) {
    if (e.code === "23505") throw bad(`${v.name} already exists`);
    throw e;
  }
  return { ok: true };
}

async function listUsers(sql, user) {
  requirePurchaser(user);
  const rows = await sql`SELECT * FROM app_users ORDER BY display_name`;
  return { users: rows.map(mapUser) };
}
async function updateUser(sql, user, id, body) {
  requirePurchaser(user);
  const set = {};
  if ("role" in body) {
    if (!["sales_rep", "purchaser"].includes(body.role)) throw bad("Unknown role");
    set.role = body.role;
  }
  if ("active" in body) set.active = !!body.active;
  if (!Object.keys(set).length) return { ok: true };
  if (id === user.id && (set.role === "sales_rep" || set.active === false)) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM app_users
                              WHERE role = 'purchaser' AND active AND id <> ${user.id}`;
    if (n === 0) throw bad("You are the only Purchaser — promote someone else first.");
  }
  set.updated_at = new Date();
  const [row] = await sql`UPDATE app_users SET ${sql(set, Object.keys(set))} WHERE id = ${id} RETURNING id`;
  if (!row) throw new HttpError(404, "User not found");
  return { ok: true };
}

async function clearHistory(sql, user, body) {
  requirePurchaser(user);
  if (body.confirm !== CLEAR_HISTORY_PHRASE) throw bad(`Type ${CLEAR_HISTORY_PHRASE} to confirm`);
  return sql.begin(async (tx) => {
    const rows = await tx`DELETE FROM orders WHERE status IN ('ordered','received') RETURNING id`;
    await logEvents(tx, rows.map((r) => r.id), "cleared", user.id);
    return { deleted: rows.length };
  });
}
async function resetAll(sql, user, body) {
  requirePurchaser(user);
  if (body.confirm !== RESET_ALL_PHRASE) throw bad(`Type ${RESET_ALL_PHRASE} to confirm`);
  return sql.begin(async (tx) => {
    const rows = await tx`DELETE FROM orders RETURNING id`;
    for (const c of DEFAULT_CUTOFFS)
      await tx`UPDATE cutoffs SET cutoff_time = ${c.cutoff_time}, updated_by = ${user.id},
               updated_at = now() WHERE order_day = ${c.order_day}`;
    await tx`INSERT INTO order_events (event, actor, detail)
             VALUES ('reset', ${user.id}, ${tx.json({ deleted: rows.length })})`;
    return { deleted: rows.length };
  });
}

/* ------------------------------ handler ------------------------------ */

export function routePath(url) {
  const p = new URL(url).pathname;
  const m = p.match(/\/(?:api\/vendor-orders|\.netlify\/functions\/vendor-orders-api)\/?(.*)$/);
  return (m ? m[1] : "").replace(/\/+$/, "");
}

export function createHandler() {
  return async function handler(req) {
    const path = routePath(req.url);
    const method = req.method;
    const live = !!databaseUrl();

    try {
      if (path === "config" && method === "GET") return json({ live });
      if (!live) throw new HttpError(503, "Vendor Orders is not configured on this deployment yet.");

      await ensureSchema();
      const sql = getSql();
      if (method === "POST" && path === "login") {
        return json({ me: await loginUser(sql, await req.json().catch(() => ({}))) });
      }
      if (method === "GET" && path === "names") {
        const rows = await sql`SELECT display_name FROM app_users WHERE active ORDER BY display_name`;
        return json({ names: rows.map((r) => r.display_name) });
      }
      const user = await currentUser(sql, req);

      const body = ["POST", "PUT", "PATCH", "DELETE"].includes(method)
        ? await req.json().catch(() => ({}))
        : {};
      const [a, b, c] = path.split("/").map(decodeURIComponent);

      if (method === "GET" && a === "bootstrap") return json(await bootstrap(sql, user));
      if (method === "POST" && a === "orders" && !b) return json(await createOrder(sql, user, body), 201);
      if (a === "orders" && b && isUuid(b) && !c) {
        if (method === "PATCH") return json(await patchOrder(sql, user, b, body));
        if (method === "DELETE") return json(await deleteOrder(sql, user, b));
      }
      if (method === "DELETE" && a === "groups" && isUuid(b)) return json(await deleteGroup(sql, user, b));
      if (method === "POST" && a === "batches" && b === "ordered")
        return json(await markBatchOrdered(sql, user, body));
      if (method === "PUT" && a === "cutoffs") return json(await saveCutoffs(sql, user, body));
      if (method === "POST" && a === "vendors" && !b) return json(await createVendor(sql, user, body), 201);
      if (method === "PATCH" && a === "vendors" && isUuid(b)) return json(await updateVendor(sql, user, b, body));
      if (method === "GET" && a === "users") return json(await listUsers(sql, user));
      if (method === "PATCH" && a === "users" && isUuid(b)) return json(await updateUser(sql, user, b, body));
      if (method === "POST" && a === "admin" && b === "clear-history")
        return json(await clearHistory(sql, user, body));
      if (method === "POST" && a === "admin" && b === "reset") return json(await resetAll(sql, user, body));

      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e && e.code === "23503") return json({ error: "That vendor or cost code does not exist." }, 400);
      console.error("vendor-orders-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
