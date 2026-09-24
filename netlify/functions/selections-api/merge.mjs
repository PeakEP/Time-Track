// Three-way merge for Finish Selections projects, so a designer and a customer
// editing at the same time keep each other's changes. `base` is the copy the
// editor started from, `mine` is what they now have, `theirs` is what is saved.
// Plain objects merge key by key; anything else (arrays, strings, numbers) is
// taken whole — whoever changed it wins, and `mine` wins a true conflict.
// (Mirrored in selections/src/utils/merge.ts for the browser.)

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function same(a, b) {
  return stable(a) === stable(b);
}

function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

export function merge3(base, mine, theirs) {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b)])) {
      const v = merge3(b[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return mine;
}
