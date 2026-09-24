// PIN sign-in: Purchasers issue each person a random 6-digit PIN. PINs are
// stored as salted scrypt hashes; signing in returns a random session token
// that is stored as a SHA-256 hash.
import { randomInt, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const PIN_LENGTH = 6;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 30;

export function newPin() {
  return String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
}

export function hashPin(pin) {
  const salt = randomBytes(16);
  return salt.toString("hex") + ":" + scryptSync(pin, salt, 32).toString("hex");
}

export function checkPin(pin, stored) {
  if (!stored || typeof pin !== "string") return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Shared PIN check with lockout, used by every app's sign-in. Mutates `rec`
// (failedAttempts / lockedUntil) and returns "ok" | "bad" | "locked".
export function attemptPin(rec, pin) {
  if (rec.lockedUntil && new Date(rec.lockedUntil) > new Date()) return "locked";
  if (!checkPin(pin, rec.pinHash)) {
    const fails = (rec.failedAttempts || 0) + 1;
    const lock = fails >= MAX_FAILED;
    rec.failedAttempts = lock ? 0 : fails;
    rec.lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : "";
    return "bad";
  }
  rec.failedAttempts = 0;
  rec.lockedUntil = "";
  return "ok";
}

// New session on a { sessions: [] } document; prunes expired ones.
export function addSession(doc, fields) {
  const token = newToken();
  const t = Date.now();
  doc.sessions = (doc.sessions || []).filter((s) => new Date(s.expiresAt).getTime() > t);
  doc.sessions.push({
    tokenHash: hashToken(token),
    ...fields,
    expiresAt: new Date(t + SESSION_DAYS * 86400000).toISOString(),
  });
  return token;
}

export function findSession(doc, token) {
  if (!token) return null;
  const h = hashToken(token);
  return (doc.sessions || []).find((s) => s.tokenHash === h && new Date(s.expiresAt) > new Date()) || null;
}
