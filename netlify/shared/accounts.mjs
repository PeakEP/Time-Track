// Suite-wide staff accounts and access. Staff records live in the Vendor
// Orders book (`users`, `sessions`) so existing PINs keep working. Each person
// has an Admin flag and a setting per app:
//   vendorOrders: "none" | "sales_rep" | "purchaser"
//   selections:   "none" | "designer"
//   cabinet, aline: true | false
// Records made before per-app access existed get sensible defaults:
// Purchasers become Admins, and everyone keeps their Vendor Orders role and
// gets the other apps.
import { addSession, findSession, hashPin, hashToken, newPin, SESSION_DAYS } from "./pins.mjs";

export const APPS = ["vendorOrders", "selections", "cabinet", "aline"];
export const VO_ROLES = ["none", "sales_rep", "purchaser"];
export const SEL_ROLES = ["none", "designer"];
export const COOKIE = "jmrc_session";

export function accessOf(u) {
  const a = u.apps || {};
  return {
    admin: u.admin ?? u.role === "purchaser",
    apps: {
      vendorOrders: VO_ROLES.includes(a.vendorOrders) ? a.vendorOrders : u.role || "sales_rep",
      selections: SEL_ROLES.includes(a.selections) ? a.selections : "designer",
      cabinet: a.cabinet ?? true,
      aline: a.aline ?? true,
    },
  };
}

export const FULL_ACCESS = {
  admin: true,
  apps: { vendorOrders: "purchaser", selections: "designer", cabinet: true, aline: true },
};

// Write access onto a record. `role` mirrors the Vendor Orders setting (kept
// for the Vendor Orders code, which predates per-app access).
export function setAccess(u, { admin, apps }) {
  u.admin = !!admin;
  u.apps = { ...apps };
  if (apps.vendorOrders !== "none") u.role = apps.vendorOrders;
}

// Can this staff member use the app? (app: vendorOrders|selections|cabinet|aline|admin)
export function canUse(u, app) {
  const { admin, apps } = accessOf(u);
  if (app === "admin") return admin;
  const v = apps[app];
  return v === true || (typeof v === "string" && v !== "none");
}

// Until an active Admin with a PIN exists, anyone may do first-time setup.
export const needsSetup = (book) => !book.users.some((u) => u.active && u.pinHash && accessOf(u).admin);

export function publicUser(u) {
  return { id: u.id, name: u.name, active: u.active, hasPin: !!u.pinHash, role: u.role, ...accessOf(u) };
}

/* ------------------------------ cookie ------------------------------ */

// Signing in anywhere sets this cookie, so the whole suite (and the page gate)
// knows who you are. HttpOnly: page scripts can't read it.
export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// Bearer token (older app sign-ins) or the suite cookie.
export function tokenOf(req) {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : "";
}

// Who holds this token: { kind: "staff", user } | { kind: "client", client } | null
export function resolveToken(book, selIndex, token) {
  if (!token) return null;
  const s = findSession(book, token);
  const u = s && book.users.find((x) => x.id === s.userId);
  if (u) return { kind: "staff", user: u };
  const cs = selIndex && findSession(selIndex, token);
  const c = cs && selIndex.customers.find((x) => x.id === cs.customerId);
  if (c) return { kind: "client", client: c };
  return null;
}

export const dropSession = (doc, token) => {
  const h = hashToken(token);
  doc.sessions = (doc.sessions || []).filter((s) => s.tokenHash !== h);
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

// First-time setup: the first person becomes an Admin with every app. Used by
// the suite home page (and Vendor Orders' own setup screen).
export function setupFirstAdmin(book, name) {
  name = cleanName(name);
  if (name.length < 2) throw httpError(400, "Enter your full name");
  if (!needsSetup(book)) throw httpError(409, "Setup is already done — sign in with your PIN.");
  const pin = newPin();
  let u = book.users.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!u) {
    u = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    book.users.push(u);
  }
  Object.assign(u, { active: true, pinHash: hashPin(pin), failedAttempts: 0, lockedUntil: "" });
  setAccess(u, FULL_ACCESS);
  return { pin, token: addSession(book, { userId: u.id }), user: u };
}

/* ------------------------------ team (Admins only) ------------------------------ */

const cleanName = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, 80);
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// Parse { admin, apps } from a request body, starting from `current`. A bare
// { role } (older Vendor Orders screens) sets just the Vendor Orders role.
function readAccess(body, current) {
  const next = { admin: current.admin, apps: { ...current.apps } };
  if ("admin" in body) next.admin = !!body.admin;
  if ("role" in body) {
    if (!["sales_rep", "purchaser"].includes(body.role)) throw httpError(400, "Unknown role");
    next.apps.vendorOrders = body.role;
  }
  const a = body.apps || {};
  if ("vendorOrders" in a) {
    if (!VO_ROLES.includes(a.vendorOrders)) throw httpError(400, "Unknown Vendor Orders role");
    next.apps.vendorOrders = a.vendorOrders;
  }
  if ("selections" in a) {
    if (!SEL_ROLES.includes(a.selections)) throw httpError(400, "Unknown Finish Selections role");
    next.apps.selections = a.selections;
  }
  if ("cabinet" in a) next.apps.cabinet = !!a.cabinet;
  if ("aline" in a) next.apps.aline = !!a.aline;
  return next;
}

const DEFAULT_NEW = { admin: false, apps: { vendorOrders: "sales_rep", selections: "designer", cabinet: true, aline: true } };

export function createStaff(book, body, clientNames = []) {
  const name = cleanName(body.name);
  if (name.length < 2) throw httpError(400, "Enter the person's full name");
  if (book.users.some((u) => sameName(u.name, name)))
    throw httpError(400, `${name} is already on the team — use Reset PIN instead.`);
  if (clientNames.some((n) => sameName(n, name)))
    throw httpError(400, `A client signs in as "${name}" — use a different name.`);
  const pin = newPin();
  const u = { id: crypto.randomUUID(), name, active: true, pinHash: hashPin(pin), failedAttempts: 0, lockedUntil: "", createdAt: new Date().toISOString() };
  setAccess(u, readAccess(body, DEFAULT_NEW));
  book.users.push(u);
  return { user: u, pin };
}

export function resetStaffPin(book, id) {
  const u = book.users.find((x) => x.id === id);
  if (!u) throw httpError(404, "User not found");
  const pin = newPin();
  Object.assign(u, { pinHash: hashPin(pin), failedAttempts: 0, lockedUntil: "" });
  book.sessions = book.sessions.filter((s) => s.userId !== id); // signed out everywhere
  return { user: u, pin };
}

// Change access and/or active. Always keeps at least one active Admin and one
// active Purchaser (someone must be able to manage the team and place orders).
export function updateStaff(book, id, body) {
  const u = book.users.find((x) => x.id === id);
  if (!u) throw httpError(404, "User not found");
  const next = readAccess(body, accessOf(u));
  const active = "active" in body ? !!body.active : u.active;
  const others = book.users.filter((x) => x.id !== id && x.active);
  if (u.active && accessOf(u).admin && (!active || !next.admin) && !others.some((x) => accessOf(x).admin))
    throw httpError(400, "That's the only Admin — make someone else an Admin first.");
  if (u.active && accessOf(u).apps.vendorOrders === "purchaser" && (!active || next.apps.vendorOrders !== "purchaser") &&
      !others.some((x) => accessOf(x).apps.vendorOrders === "purchaser"))
    throw httpError(400, "That's the only Purchaser — promote someone else first.");
  setAccess(u, next);
  u.active = active;
  if (!active) book.sessions = book.sessions.filter((s) => s.userId !== id);
  return u;
}
