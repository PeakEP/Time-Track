// Suite API (Netlify Function) at /api/suite/* (see netlify.toml): the home
// page sign-in, the Admin page, and the access check used by the page gate
// (netlify/edge-functions/suite-gate.js).
//
// Staff accounts are suite-wide (shared/accounts.mjs, stored in the Vendor
// Orders book so existing PINs keep working); client sign-ins belong to
// Finish Selections projects. Signing in sets an HttpOnly cookie that every
// app and the gate accept.
import { openStore, readState, mutate } from "../../shared/storage.mjs";
import {
  canUse, needsSetup, publicUser, setupFirstAdmin, createStaff, resetStaffPin, updateStaff,
  sessionCookie, clearCookie, tokenOf, resolveToken, accessOf, dropSession,
} from "../../shared/accounts.mjs";
import { signIn, staffMe, clientMe, SEL_INDEX, resetClientPin, setClientAccess } from "../../shared/signin.mjs";

const GATED_APPS = ["vendorOrders", "selections", "cabinet", "aline", "admin"];

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const isId = (s) => /^[0-9a-f-]{36}$/i.test(s || "");

async function whoIs(stores, req) {
  const [book, idx] = await Promise.all([readState(stores.vo), readState(stores.sel, SEL_INDEX)]);
  const who = resolveToken(book, idx, tokenOf(req));
  if (!who) return null;
  if (who.kind === "staff") return who.user.active ? { ...who, me: staffMe(who.user) } : null;
  return who.client.active ? { ...who, me: clientMe(who.client) } : null;
}

async function requireAdmin(stores, req) {
  const who = await whoIs(stores, req);
  if (!who) throw httpError(401, "Sign in with your name and PIN");
  if (who.kind !== "staff" || !accessOf(who.user).admin) throw httpError(403, "Admin access required");
  return who;
}

// Team list + client sign-ins, for the Admin page.
async function team(stores) {
  const [book, idx] = await Promise.all([readState(stores.vo), readState(stores.sel, SEL_INDEX)]);
  return {
    users: [...book.users].sort((a, b) => a.name.localeCompare(b.name)).map(publicUser),
    clients: idx.customers
      .map((c) => {
        const p = idx.projects.find((x) => x.id === c.projectId);
        return {
          projectId: c.projectId, name: c.name, active: c.active, hasPin: !!c.pinHash,
          project: p?.title || "", client: p?.client || "", updatedAt: p?.updatedAt || "", updatedByName: p?.updatedByName || "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// `stores` can be injected (tests): { sel, vo }.
export function createHandler({ stores: injected } = {}) {
  return async function handler(req, context) {
    const url = new URL(req.url);
    const path = (url.pathname.match(/\/(?:api\/suite|\.netlify\/functions\/suite-api)\/?(.*)$/)?.[1] || "").replace(/\/+$/, "");
    const method = req.method;
    const stores = injected || { vo: openStore(context), sel: openStore(context, "selections") };

    try {
      if (!stores.vo || !stores.sel) {
        if (path === "config") return json({ live: false });
        if (path === "check") return json({ ok: true, local: true }); // no server storage: nothing to gate
        throw httpError(503, "Suite storage isn't available on this deployment.");
      }
      if (path === "config" && method === "GET") return json({ live: true, needsSetup: needsSetup(await readState(stores.vo)) });

      // Page gate: may this visitor open `app`? 200 yes, 401 not signed in, 403 no access.
      if (path === "check" && method === "GET") {
        const app = url.searchParams.get("app");
        if (!GATED_APPS.includes(app)) throw httpError(400, "Unknown app");
        const who = await whoIs(stores, req);
        if (!who) return json({ ok: false }, 401);
        const ok = who.kind === "staff" ? canUse(who.user, app) : app === "selections";
        return json({ ok }, ok ? 200 : 403);
      }

      const body = ["POST", "PUT", "PATCH"].includes(method) ? await req.json().catch(() => ({})) : {};
      if (method === "POST" && path === "setup") {
        const r = await mutate(stores.vo, (book) => setupFirstAdmin(book, body.name));
        return json({ pin: r.pin, me: staffMe(r.user) }, 200, { "set-cookie": sessionCookie(r.token) });
      }
      if (method === "POST" && path === "login") {
        const r = await signIn(stores, body);
        return json({ me: r.me }, 200, { "set-cookie": sessionCookie(r.token) });
      }
      if (method === "POST" && path === "logout") {
        const token = tokenOf(req);
        if (token) {
          await mutate(stores.vo, (doc) => dropSession(doc, token));
          await mutate(stores.sel, (doc) => dropSession(doc, token), SEL_INDEX);
        }
        return json({ ok: true }, 200, { "set-cookie": clearCookie() });
      }
      if (method === "GET" && path === "me") {
        const who = await whoIs(stores, req);
        if (!who) throw httpError(401, "Sign in with your name and PIN");
        return json({ me: who.me });
      }

      // ---- Admin ----
      const [a, b, c] = path.split("/");
      if (a === "team" || a === "clients") await requireAdmin(stores, req);
      if (method === "GET" && a === "team" && !b) return json(await team(stores));
      if (method === "POST" && a === "team" && !b) {
        const idx = await readState(stores.sel, SEL_INDEX);
        const r = await mutate(stores.vo, (book) => createStaff(book, body, idx.customers.map((x) => x.name)));
        return json({ user: publicUser(r.user), pin: r.pin }, 201);
      }
      if (a === "team" && isId(b) && !c && method === "PATCH") {
        const u = await mutate(stores.vo, (book) => updateStaff(book, b, body));
        return json({ user: publicUser(u) });
      }
      if (a === "team" && isId(b) && c === "reset-pin" && method === "POST") {
        const r = await mutate(stores.vo, (book) => resetStaffPin(book, b));
        return json({ user: publicUser(r.user), pin: r.pin });
      }
      if (a === "clients" && isId(b) && c === "reset-pin" && method === "POST") return json(await resetClientPin(stores, b));
      if (a === "clients" && isId(b) && !c && method === "PATCH") return json(await setClientAccess(stores, b, body.active));

      throw httpError(404, "Not found");
    } catch (e) {
      if (e.status) return json({ error: e.message }, e.status);
      console.error("suite-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
