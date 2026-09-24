// Three-way merge (browser copy of netlify/functions/selections-api/merge.mjs).
// Used when someone else saved while you were editing: your changes since
// `base` are kept, and theirs are brought in.

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> => v !== null && typeof v === "object" && !Array.isArray(v);

function stable(v: Json): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (isObj(v))
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

export function same(a: Json, b: Json): boolean {
  return stable(a) === stable(b);
}

export function merge3<T>(base: T, mine: T, theirs: T): T {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  if (isObj(mine) && isObj(theirs)) {
    const b: Record<string, Json> = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b)])) {
      const v = merge3(b[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out as T;
  }
  return mine;
}
