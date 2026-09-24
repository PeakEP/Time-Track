// Finish Selections API (Netlify Function) at /api/selections/* (see netlify.toml).
//
// Two kinds of people sign in with a name + PIN:
//   - Staff: the Vendor Orders team list (same name + PIN). They get the
//     designer view, see every project, and create customer projects.
//   - Customers: one account per project, created by staff, who can open only
//     their own project and change only selections and quantities.
// Data lives in Netlify Blobs: the "selections" store holds an `index`
// document (customers, customer sessions, project list) and one
// `projects/<id>` document per project. Staff accounts/sessions stay in the
// Vendor Orders store. Saves are three-way merged (merge.mjs) and written with
// compare-and-swap, so a designer and a customer editing together don't clash.
import { openStore, readState, mutate } from "../../shared/storage.mjs";
import { newPin, hashPin, findSession, hashToken } from "../../shared/pins.mjs";
import { merge3, same } from "./merge.mjs";
import { canUse, sessionCookie, clearCookie, tokenOf } from "../../shared/accounts.mjs";
import { signIn, SEL_INDEX, resetClientPin, setClientAccess } from "../../shared/signin.mjs";

const INDEX = SEL_INDEX;
const projectKey = (id) => ({ key: `projects/${id}`, init: () => null });
const MAX_TITLE = 200;

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

const str = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const cleanName = (v) => str(v, 80).replace(/\s+/g, " ");
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const isId = (s) => /^[0-9a-f-]{36}$/i.test(s || "");
const now = () => new Date().toISOString();


/* ------------------------------ project shape ------------------------------ */

// Keep only the fields the app uses, with the right types.
function cleanProject(p) {
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const meta = obj(p?.meta);
  const nums = (m) =>
    Object.fromEntries(Object.entries(obj(m)).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
  const sels = Object.fromEntries(
    Object.entries(obj(p?.selections)).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.map(String).slice(0, 50)]),
  );
  const d = obj(p?.discount);
  return {
    meta: {
      client: str(meta.client, 200),
      project: str(meta.project, 200),
      address: str(meta.address, 300),
      date: str(meta.date, 10),
      salesRep: str(meta.salesRep, 200),
      notes: str(meta.notes, 4000),
    },
    basePrice: Number(p?.basePrice) || 0,
    selections: sels,
    overrides: nums(p?.overrides),
    quantities: nums(p?.quantities),
    discount: {
      label: str(d.label, 100) || "Discount",
      type: d.type === "flat" ? "flat" : "percent",
      value: Number(d.value) || 0,
    },
  };
}

// Customers may change only what they pick (selections) and how much
// (quantities). Everything else is taken from the saved copy.
function customerView(mine, saved) {
  return { ...saved, selections: mine.selections, quantities: mine.quantities };
}

const summary = (p, idx) => {
  const c = idx.customers.find((x) => x.projectId === p.id);
  return {
    id: p.id,
    title: p.title,
    client: p.client,
    createdAt: p.createdAt,
    createdByName: p.createdByName,
    updatedAt: p.updatedAt,
    updatedByName: p.updatedByName,
    customer: c ? { name: c.name, active: c.active, hasPin: !!c.pinHash } : null,
  };
};

/* ------------------------------ who's calling ------------------------------ */

// Staff accounts live in the Vendor Orders book; customers in the selections index.
async function whoIs(stores, req) {
  const token = tokenOf(req);
  if (!token) throw new HttpError(401, "Sign in with your name and PIN");
  const idx = await readState(stores.sel, INDEX);
  const cs = findSession(idx, token);
  if (cs) {
    const c = idx.customers.find((x) => x.id === cs.customerId);
    if (!c) throw new HttpError(401, "Your session has ended — sign in again");
    if (!c.active) throw new HttpError(403, "This link has been turned off. Contact Robins Interiors & Design.");
    return { kind: "customer", id: c.id, name: c.name, projectId: c.projectId };
  }
  const vo = await readState(stores.vo);
  const ss = findSession(vo, token);
  const u = ss && vo.users.find((x) => x.id === ss.userId);
  if (!u) throw new HttpError(401, "Your session has ended — sign in again");
  if (!u.active) throw new HttpError(403, "Your access has been turned off. Ask an Admin.");
  if (!canUse(u, "selections")) throw new HttpError(403, "You don't have access to Finish Selections. Ask an Admin.");
  return { kind: "staff", id: u.id, name: u.name, role: u.role };
}
const requireStaff = (who) => {
  if (who.kind !== "staff") throw new HttpError(403, "Staff only");
};
function canOpen(who, projectId) {
  if (who.kind === "customer" && who.projectId !== projectId)
    throw new HttpError(403, "You can only open your own selections.");
}

/* ------------------------------ sign-in ------------------------------ */

// Shared suite sign-in (shared/signin.mjs); staff need Finish Selections access.
const login = (stores, body) => signIn(stores, body, { app: "selections" });

async function logout(stores, req) {
  const h = hashToken(tokenOf(req));
  const drop = (doc) => {
    doc.sessions = (doc.sessions || []).filter((s) => s.tokenHash !== h);
  };
  await mutate(stores.sel, drop, INDEX);
  await mutate(stores.vo, drop);
  return { ok: true };
}

/* ------------------------------ projects ------------------------------ */

async function listProjects(stores, who) {
  requireStaff(who);
  const idx = await readState(stores.sel, INDEX);
  return {
    projects: [...idx.projects]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .map((p) => summary(p, idx)),
  };
}

async function createProject(stores, who, body) {
  requireStaff(who);
  const project = cleanProject(body.project || {});
  const client = str(body.client, 200) || project.meta.client;
  if (!client) throw bad("Enter the client's name");
  const title = str(body.title, MAX_TITLE) || project.meta.project || client;
  const customerName = cleanName(body.customerName || client);
  if (customerName.length < 2) throw bad("Enter the name the client will sign in with");
  project.meta.client = client;
  if (!project.meta.project) project.meta.project = title;

  const id = crypto.randomUUID();
  const pin = newPin();
  const t = now();
  const vo = await readState(stores.vo);
  if (vo.users.some((u) => sameName(u.name, customerName)))
    throw bad(`${customerName} is a staff name — use a different sign-in name for the client.`);

  await mutate(stores.sel, (idx) => {
    if (idx.customers.some((c) => sameName(c.name, customerName)))
      throw bad(`A client already signs in as "${customerName}" — use a different name (e.g. add the street).`);
    idx.projects.push({ id, title, client, createdAt: t, createdByName: who.name, updatedAt: t, updatedByName: who.name });
    idx.customers.push({
      id: crypto.randomUUID(), name: customerName, projectId: id, active: true,
      pinHash: hashPin(pin), failedAttempts: 0, lockedUntil: "", createdAt: t,
    });
  }, INDEX);
  await stores.sel.setJSON(`projects/${id}`, { version: 1, project, updatedAt: t, updatedBy: who.name }, { onlyIfNew: true });
  const idx = await readState(stores.sel, INDEX);
  return { project: summary(idx.projects.find((p) => p.id === id), idx), customerName, pin };
}

async function getProject(stores, who, id) {
  canOpen(who, id);
  const doc = await readState(stores.sel, projectKey(id));
  if (!doc) throw new HttpError(404, "Project not found — it may have been deleted");
  const idx = await readState(stores.sel, INDEX);
  const p = idx.projects.find((x) => x.id === id);
  return { id, title: p?.title || "", version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, project: doc.project };
}

async function saveProject(stores, who, id, body) {
  canOpen(who, id);
  const base = cleanProject(body.base);
  let mine = cleanProject(body.project);
  const result = await mutate(stores.sel, (doc) => {
    if (!doc) throw new HttpError(404, "Project not found — it may have been deleted");
    const saved = doc.project;
    if (who.kind === "customer") mine = customerView(mine, saved);
    const merged = cleanProject(merge3(who.kind === "customer" ? customerView(base, saved) : base, mine, saved));
    if (same(merged, saved)) return { changed: false, version: doc.version, project: saved };
    doc.project = merged;
    doc.version = (doc.version || 0) + 1;
    doc.updatedAt = now();
    doc.updatedBy = who.name;
    return { changed: true, version: doc.version, project: merged, updatedAt: doc.updatedAt };
  }, projectKey(id));
  if (result.changed) {
    await mutate(stores.sel, (idx) => {
      const p = idx.projects.find((x) => x.id === id);
      if (p) Object.assign(p, { updatedAt: result.updatedAt, updatedByName: who.name, client: result.project.meta.client || p.client });
    }, INDEX);
  }
  return { version: result.version, project: result.project };
}

async function resetCustomerPin(stores, who, id) {
  requireStaff(who);
  return resetClientPin(stores, id);
}

async function setCustomerAccess(stores, who, id, body) {
  requireStaff(who);
  return setClientAccess(stores, id, body.active);
}

async function deleteProject(stores, who, id) {
  requireStaff(who);
  await mutate(stores.sel, (idx) => {
    const gone = new Set(idx.customers.filter((c) => c.projectId === id).map((c) => c.id));
    idx.projects = idx.projects.filter((p) => p.id !== id);
    idx.customers = idx.customers.filter((c) => c.projectId !== id);
    idx.sessions = idx.sessions.filter((s) => !gone.has(s.customerId));
  }, INDEX);
  await stores.sel.delete(`projects/${id}`);
  return { ok: true };
}

/* ------------------------------ handler ------------------------------ */

export function routePath(url) {
  const p = new URL(url).pathname;
  const m = p.match(/\/(?:api\/selections|\.netlify\/functions\/selections-api)\/?(.*)$/);
  return (m ? m[1] : "").replace(/\/+$/, "");
}

// `stores` can be injected (tests): { sel, vo }.
export function createHandler({ stores: injected } = {}) {
  return async function handler(req, context) {
    const path = routePath(req.url);
    const method = req.method;
    const stores = injected || { sel: openStore(context, "selections"), vo: openStore(context) };

    try {
      if (!stores.sel || !stores.vo) {
        if (path === "config" && method === "GET") return json({ live: false });
        throw new HttpError(503, "Finish Selections storage isn't available on this deployment.");
      }
      if (path === "config" && method === "GET") return json({ live: true });

      const body = ["POST", "PUT", "PATCH"].includes(method) ? await req.json().catch(() => ({})) : {};
      if (method === "POST" && path === "login") {
        const r = await login(stores, body);
        return json(r, 200, { "set-cookie": sessionCookie(r.token) });
      }

      const who = await whoIs(stores, req);
      const [a, b, c] = path.split("/");
      if (method === "GET" && a === "me") return json({ me: who });
      if (method === "POST" && a === "logout")
        return json(await logout(stores, req), 200, { "set-cookie": clearCookie() });
      if (a === "projects" && !b) {
        if (method === "GET") return json(await listProjects(stores, who));
        if (method === "POST") return json(await createProject(stores, who, body), 201);
      }
      if (a === "projects" && isId(b)) {
        if (!c && method === "GET") return json(await getProject(stores, who, b));
        if (!c && method === "PUT") return json(await saveProject(stores, who, b, body));
        if (!c && method === "DELETE") return json(await deleteProject(stores, who, b));
        if (c === "reset-pin" && method === "POST") return json(await resetCustomerPin(stores, who, b));
        if (c === "access" && method === "PATCH") return json(await setCustomerAccess(stores, who, b, body));
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError || e.status) return json({ error: e.message }, e.status);
      console.error("selections-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
