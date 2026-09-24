// One name + PIN sign-in for the whole suite. Staff are checked first (the
// suite team list, kept in the Vendor Orders store), then clients (Finish
// Selections sign-ins). Each wrong PIN counts toward that account's lockout.
import { mutate } from "./storage.mjs";
import { attemptPin, addSession, newPin, hashPin, LOCK_MINUTES } from "./pins.mjs";
import { accessOf, canUse, ensureOwner } from "./accounts.mjs";

export const SEL_INDEX = { key: "index", init: () => ({ version: 1, customers: [], sessions: [], projects: [] }) };
export const LOGIN_FAILED = "Name or PIN not recognised";
const httpError = (status, message, commit = false) => Object.assign(new Error(message), { status, commit });
const cleanName = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, 80);
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

// stores: { vo, sel }. `app` (optional): staff must have access to it.
// Returns { token, me } where me is { kind: "staff", … } or { kind: "customer", … }.
export async function signIn(stores, body, { app } = {}) {
  const name = cleanName(body.name);
  const pin = String(body.pin ?? "").trim().slice(0, 12);
  if (!name || !pin) throw httpError(400, "Enter your name and PIN");

  const staff = await mutate(stores.vo, (book) => {
    ensureOwner(book); // the Netlify-set owner sign-in, if any
    const u = book.users.find((x) => sameName(x.name, name) && x.pinHash);
    if (!u) return null;
    const r = attemptPin(u, pin);
    if (r === "locked") throw httpError(429, `Too many wrong PINs — try again in ${LOCK_MINUTES} minutes.`);
    if (r === "bad") return { bad: true }; // saved; then try clients
    if (!u.active) throw httpError(403, "Your access has been turned off. Ask an Admin.");
    if (app && !canUse(u, app)) throw httpError(403, "You don't have access to this app. Ask an Admin.");
    return { token: addSession(book, { userId: u.id }), me: staffMe(u) };
  });
  if (staff && !staff.bad) return staff;

  const client = await mutate(stores.sel, (idx) => {
    const c = idx.customers.find((x) => sameName(x.name, name) && x.pinHash);
    if (!c) return null;
    const r = attemptPin(c, pin);
    if (r === "locked") throw httpError(429, `Too many wrong PINs — try again in ${LOCK_MINUTES} minutes.`);
    if (r === "bad") throw httpError(401, LOGIN_FAILED, true); // save the failed attempt
    if (!c.active) throw httpError(403, "This link has been turned off. Contact Robins Interiors & Design.");
    if (app && app !== "selections") throw httpError(403, "Your sign-in is for your finish selections only.");
    return { token: addSession(idx, { customerId: c.id }), me: clientMe(c) };
  }, SEL_INDEX);
  if (client) return client;
  throw httpError(401, LOGIN_FAILED);
}

export const staffMe = (u) => ({ kind: "staff", id: u.id, name: u.name, role: u.role, ...accessOf(u) });
export const clientMe = (c) => ({ kind: "customer", id: c.id, name: c.name, projectId: c.projectId });

/* ------------------------------ client sign-ins (staff/Admin) ------------------------------ */

export async function resetClientPin(stores, projectId) {
  const pin = newPin();
  const name = await mutate(stores.sel, (idx) => {
    const c = idx.customers.find((x) => x.projectId === projectId);
    if (!c) throw httpError(404, "No client sign-in for this project");
    Object.assign(c, { pinHash: hashPin(pin), failedAttempts: 0, lockedUntil: "", active: true });
    idx.sessions = idx.sessions.filter((s) => s.customerId !== c.id); // signed out everywhere
    return c.name;
  }, SEL_INDEX);
  return { customerName: name, pin };
}

export async function setClientAccess(stores, projectId, active) {
  await mutate(stores.sel, (idx) => {
    const c = idx.customers.find((x) => x.projectId === projectId);
    if (!c) throw httpError(404, "No client sign-in for this project");
    c.active = !!active;
    if (!c.active) idx.sessions = idx.sessions.filter((s) => s.customerId !== c.id);
  }, SEL_INDEX);
  return { ok: true };
}
