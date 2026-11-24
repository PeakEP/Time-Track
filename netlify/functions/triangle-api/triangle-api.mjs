// Triangle Kitchen Intake API (Netlify Function) at /api/triangle/* (see
// netlify.toml). Staff-only: everyone with Triangle access signs in with their
// suite name + PIN, sees every intake, and can create/edit/delete them — so an
// employee can take an intake and the designer can open it. There are NO client
// sign-ins (unlike Finish Selections).
//
// Data lives in Netlify Blobs: the "triangle" store holds an `index` document
// (the project list) and one `projects/<id>` document per intake. Staff
// accounts/sessions stay in the Vendor Orders store. Saves are three-way merged
// (merge.mjs) and written with compare-and-swap, so two staff editing together
// don't clash.
import { openStore, readState, mutate } from "../../shared/storage.mjs";
import { findSession, hashToken } from "../../shared/pins.mjs";
import { merge3, same } from "./merge.mjs";
import { canUse, sessionCookie, clearCookie, tokenOf } from "../../shared/accounts.mjs";
import { signIn } from "../../shared/signin.mjs";

const INDEX = { key: "index", init: () => ({ version: 1, projects: [] }) };
const projectKey = (id) => ({ key: `projects/${id}`, init: () => null });
const MAX_TITLE = 200;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const str = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const isId = (s) => /^[0-9a-f-]{36}$/i.test(s || "");
const now = () => new Date().toISOString();

/* ------------------------------ project shape ------------------------------ */

// Keep only the fields the app uses, with the right types. No pricing.
function cleanProject(p) {
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const meta = obj(p?.meta);
  const selections = Object.fromEntries(
    Object.entries(obj(p?.selections))
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [String(k).slice(0, 80), v.map(String).slice(0, 80)]),
  );
  const notes = Object.fromEntries(
    Object.entries(obj(p?.notes))
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [String(k).slice(0, 80), str(v, 2000)]),
  );
  return {
    meta: {
      client: str(meta.client, 200),
      contact: str(meta.contact, 200),
      address: str(meta.address, 300),
      date: str(meta.date, 10),
      designer: str(meta.designer, 120),
      employee: str(meta.employee, 120),
      projectType: str(meta.projectType, 120),
      timeline: str(meta.timeline, 200),
    },
    selections,
    notes,
    requests: str(p?.requests, 6000),
  };
}

const summary = (p) => ({
  id: p.id,
  title: p.title,
  client: p.client,
  createdAt: p.createdAt,
  createdByName: p.createdByName,
  updatedAt: p.updatedAt,
  updatedByName: p.updatedByName,
});

/* ------------------------------ who's calling ------------------------------ */

async function whoIs(stores, req) {
  const token = tokenOf(req);
  if (!token) throw new HttpError(401, "Sign in with your name and PIN");
  const vo = await readState(stores.vo);
  const ss = findSession(vo, token);
  const u = ss && vo.users.find((x) => x.id === ss.userId);
  if (!u) throw new HttpError(401, "Your session has ended — sign in again");
  if (!u.active) throw new HttpError(403, "Your access has been turned off. Ask an Admin.");
  if (!canUse(u, "triangle")) throw new HttpError(403, "You don't have access to Triangle Intake. Ask an Admin.");
  return { kind: "staff", id: u.id, name: u.name, role: u.role };
}

/* ------------------------------ sign-in ------------------------------ */

const login = (stores, body) => signIn(stores, body, { app: "triangle" });

async function logout(stores, req) {
  const h = hashToken(tokenOf(req));
  const drop = (doc) => {
    doc.sessions = (doc.sessions || []).filter((s) => s.tokenHash !== h);
  };
  await mutate(stores.vo, drop);
  if (stores.sel) await mutate(stores.sel, drop, { key: "index", init: () => ({ version: 1, customers: [], sessions: [], projects: [] }) });
  return { ok: true };
}

/* ------------------------------ projects ------------------------------ */

async function listProjects(stores) {
  const idx = await readState(stores.tri, INDEX);
  return {
    projects: [...idx.projects]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .map(summary),
  };
}

async function createProject(stores, who, body) {
  const project = cleanProject(body.project || {});
  const client = str(body.client, 200) || project.meta.client;
  if (!client) throw bad("Enter the customer's name");
  const title = str(body.title, MAX_TITLE) || client;
  project.meta.client = client;

  const id = crypto.randomUUID();
  const t = now();
  await mutate(stores.tri, (idx) => {
    idx.projects.push({ id, title, client, createdAt: t, createdByName: who.name, updatedAt: t, updatedByName: who.name });
  }, INDEX);
  await stores.tri.setJSON(`projects/${id}`, { version: 1, project, updatedAt: t, updatedBy: who.name }, { onlyIfNew: true });
  const idx = await readState(stores.tri, INDEX);
  return { project: summary(idx.projects.find((p) => p.id === id)) };
}

async function getProject(stores, id) {
  const doc = await readState(stores.tri, projectKey(id));
  if (!doc) throw new HttpError(404, "Intake not found — it may have been deleted");
  const idx = await readState(stores.tri, INDEX);
  const p = idx.projects.find((x) => x.id === id);
  return { id, title: p?.title || "", version: doc.version, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy, project: doc.project };
}

async function saveProject(stores, who, id, body) {
  const base = cleanProject(body.base);
  const mine = cleanProject(body.project);
  const result = await mutate(stores.tri, (doc) => {
    if (!doc) throw new HttpError(404, "Intake not found — it may have been deleted");
    const saved = doc.project;
    const merged = cleanProject(merge3(base, mine, saved));
    if (same(merged, saved)) return { changed: false, version: doc.version, project: saved };
    doc.project = merged;
    doc.version = (doc.version || 0) + 1;
    doc.updatedAt = now();
    doc.updatedBy = who.name;
    return { changed: true, version: doc.version, project: merged, updatedAt: doc.updatedAt };
  }, projectKey(id));
  if (result.changed) {
    await mutate(stores.tri, (idx) => {
      const p = idx.projects.find((x) => x.id === id);
      if (p) Object.assign(p, { updatedAt: result.updatedAt, updatedByName: who.name, client: result.project.meta.client || p.client });
    }, INDEX);
  }
  return { version: result.version, project: result.project };
}

async function deleteProject(stores, id) {
  await mutate(stores.tri, (idx) => {
    idx.projects = idx.projects.filter((p) => p.id !== id);
  }, INDEX);
  await stores.tri.delete(`projects/${id}`);
  return { ok: true };
}

/* ------------------------------ handler ------------------------------ */

export function routePath(url) {
  const p = new URL(url).pathname;
  const m = p.match(/\/(?:api\/triangle|\.netlify\/functions\/triangle-api)\/?(.*)$/);
  return (m ? m[1] : "").replace(/\/+$/, "");
}

// `stores` can be injected (tests): { tri, vo, sel }.
export function createHandler({ stores: injected } = {}) {
  return async function handler(req, context) {
    const path = routePath(req.url);
    const method = req.method;
    const stores = injected || {
      tri: openStore(context, "triangle"),
      vo: openStore(context),
      sel: openStore(context, "selections"),
    };

    try {
      if (!stores.tri || !stores.vo) {
        if (path === "config" && method === "GET") return json({ live: false });
        throw new HttpError(503, "Triangle Intake storage isn't available on this deployment.");
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
        if (method === "GET") return json(await listProjects(stores));
        if (method === "POST") return json(await createProject(stores, who, body), 201);
      }
      if (a === "projects" && isId(b) && !c) {
        if (method === "GET") return json(await getProject(stores, b));
        if (method === "PUT") return json(await saveProject(stores, who, b, body));
        if (method === "DELETE") return json(await deleteProject(stores, b));
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError || e.status) return json({ error: e.message }, e.status);
      console.error("triangle-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
