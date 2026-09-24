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
