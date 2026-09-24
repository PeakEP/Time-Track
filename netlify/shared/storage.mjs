// Vendor Orders data lives in Netlify Blobs: built into every Netlify site, so
// there is nothing to set up. The whole order book is one JSON document; every
// write is a compare-and-swap on its ETag (retried on conflict), so two people
// saving at once never overwrite each other. Audit events are written as
// separate append-only blobs under events/.
import { getStore } from "@netlify/blobs";

const DOC = "db";
const MAX_TRIES = 8;

export const DEFAULT_CUTOFFS = [
  { key: "tue", label: "Tuesday", weekday: 2, cutoff: "10:00", timezone: "America/Halifax" },
  { key: "thu", label: "Thursday", weekday: 4, cutoff: "10:00", timezone: "America/Halifax" },
];

// Cabinets (Oppein/Aline/Divine/Canada Kitchens) and Prosol are deliberately excluded.
const DEFAULT_VENDORS = [
  ["Avide Flooring", "tue", "Flooring"],
  ["Richmond Flooring", "tue", "Flooring"],
  ["MSI", "tue", "Tile / Stone"],
  ["Sarana Tile", "tue", "Tile"],
  ["Tosca", "tue", "Fixtures"],
  ["Agua", "thu", "Kitchen & Bath"],
  ["Maxxmar", "thu", "Window coverings"],
  ["Dainolite", "thu", "Lighting"],
  ["Marathon", "thu", "Hardware"],
];

function seed() {
  return {
    version: 1,
    users: [],
    sessions: [],
    vendors: DEFAULT_VENDORS.map(([name, day, cat], i) => ({
      id: crypto.randomUUID(), name, day, cat, active: true, sortOrder: i + 1,
    })),
    cutoffs: DEFAULT_CUTOFFS.map((c) => ({ ...c })),
    orders: [],
  };
}

// Production gets its own store; previews and branch deploys share a separate
// one so testing never touches real data. Returns null outside Netlify.
// `base` names the app's store (Finish Selections reuses this with "selections").
export function openStore(context, base = "vendor-orders") {
  const deployContext = context?.deploy?.context || "production";
  const name = deployContext === "production" ? base : `${base}-${deployContext}`;
  try {
    return getStore({ name, consistency: "strong" });
  } catch {
    return null;
  }
}

// `key`/`init` let other documents (e.g. Finish Selections) use the same
// read / compare-and-swap machinery; the defaults are the Vendor Orders book.
export async function readState(store, { key = DOC, init = seed } = {}) {
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data || init();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Applies fn(state, events) and saves atomically. fn may throw to abort without
// saving; an error with `commit = true` is thrown after its changes are saved.
export async function mutate(store, fn, { key = DOC, init = seed } = {}) {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const cur = await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    const state = cur ? cur.data : init();
    const events = [];
    let result, deferred;
    try {
      result = await fn(state, events);
    } catch (e) {
      if (!e.commit) throw e;
      deferred = e;
    }
    const res = cur
      ? await store.setJSON(key, state, { onlyIfMatch: cur.etag })
      : await store.setJSON(key, state, { onlyIfNew: true });
    if (res.modified) {
      await writeEvents(store, events);
      if (deferred) throw deferred;
      return result;
    }
    await sleep(20 + Math.random() * 80 * (attempt + 1));
  }
  const e = new Error("Busy — please try again");
  e.status = 503;
  throw e;
}

async function writeEvents(store, events) {
  if (!events.length) return;
  const at = new Date().toISOString();
  try {
    await Promise.all(
      events.map((ev, i) =>
        store.setJSON(`events/${at}-${i}-${crypto.randomUUID().slice(0, 8)}`, { at, ...ev }),
      ),
    );
  } catch (e) {
    console.error("vendor-orders audit write failed", e); // never fail the user's save over the log
  }
}
