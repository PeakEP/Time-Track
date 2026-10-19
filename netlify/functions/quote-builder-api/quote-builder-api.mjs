// Quote Builder API (Netlify Function) at /api/quote-builder/* (see netlify.toml).
//
// Staff only (suite sign-in cookie + Quote Builder access). Stores, in the
// "quote-builder" Blobs store:
//   settings            owner settings: takeoff tools, rates, markups, numbering
//   catalog/jmrc        the JMRC master cost catalog (uploaded by an Admin)
//   catalog/square      Robins Interiors Square catalog (synced by an Admin)
//   catalog/cabinets/<aline|oppein|divine>  supplier cabinet price files (the
//                       jmrc-cabinet-quoting data: list prices + dealer discount)
//   index               quote summaries
//   quotes/<id>         one document per quote
//   uploads/<job>/<f>/<n>  document chunks for the document reader
//   jobs/<id>           document reader jobs (run by quote-builder-read-background)
//
// The cost catalog and settings live here, never in the repository (it's public).
import { openStore, readState, mutate } from "../../shared/storage.mjs";
import { canUse, accessOf, sessionCookie, tokenOf, resolveToken } from "../../shared/accounts.mjs";
import { signIn } from "../../shared/signin.mjs";
import { syncSquareCatalog } from "../../shared/square-catalog.mjs";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
const isId = (s) => /^[0-9a-z-]{8,64}$/i.test(s || "");
const str = (v, max = 500) => String(v == null ? "" : v).slice(0, max);

const INDEX = { key: "index", init: () => ({ version: 1, quotes: [] }) };
const quoteDoc = (id) => ({ key: `quotes/${id}`, init: () => ({}) });

export const MAX_CHUNK = 4 * 1024 * 1024; // under Netlify's 6 MB request limit
export const MAX_READ_BYTES = 24 * 1024 * 1024; // the Claude request limit is 32 MB incl. base64

/* ------------------------------ who's calling ------------------------------ */

async function whoIs(stores, req) {
  const book = await readState(stores.vo);
  const who = resolveToken(book, null, tokenOf(req));
  if (!who || who.kind !== "staff") throw new HttpError(401, "Sign in with your name and PIN");
  const u = who.user;
  if (!u.active) throw new HttpError(403, "Your access has been turned off. Ask an Admin.");
  if (!canUse(u, "quoteBuilder")) throw new HttpError(403, "You don't have access to Quote Builder. Ask an Admin.");
  return { id: u.id, name: u.name, admin: accessOf(u).admin };
}
const requireAdmin = (who) => {
  if (!who.admin) throw new HttpError(403, "Only an Admin can change this.");
};

/* ------------------------------ catalog ------------------------------ */

function cleanItems(items, source) {
  if (!Array.isArray(items)) throw new HttpError(400, "items must be a list");
  if (items.length > 20000) throw new HttpError(400, "Catalog is too large");
  return items.map((it) => {
    const cost = it.unitCost == null || it.unitCost === "" ? null : Number(it.unitCost);
    return {
      id: str(it.id, 80),
      source,
      name: str(it.name, 300),
      description: str(it.description, 1000),
      unit: str(it.unit, 10).toUpperCase(),
      unitCost: Number.isFinite(cost) && cost > 0 ? Math.round(cost * 10000) / 10000 : null,
      costCode: str(it.costCode, 120),
      ...(it.sku ? { sku: str(it.sku, 80) } : {}),
      ...(it.retail != null && Number.isFinite(Number(it.retail)) ? { retail: Number(it.retail) } : {}),
    };
  }).filter((it) => it.id && (it.name || it.description));
}

async function getCatalog(stores) {
  const [jmrc, square, custom] = await Promise.all([
    stores.qb.get("catalog/jmrc", { type: "json" }),
    stores.qb.get("catalog/square", { type: "json" }),
    stores.qb.get("catalog/custom", { type: "json" }),
  ]);
  return {
    jmrc: jmrc || { items: [], importedAt: "", importedBy: "", fileName: "" },
    square: square || { items: [], syncedAt: "", syncedBy: "", note: "" },
    custom: custom || { items: [], updatedAt: "", updatedBy: "" },
  };
}

// Products an Admin adds by hand. Kept in their own blob so re-importing the
// master cost catalog never wipes them. Ids are path-safe (no colon) so the
// delete route can carry one.
const CUSTOM = { key: "catalog/custom", init: () => ({ items: [], updatedAt: "", updatedBy: "" }) };

async function addCustomItem(stores, who, body) {
  requireAdmin(who);
  const id = str(body.id, 80) || "cust_" + crypto.randomUUID().replace(/-/g, "");
  const [it] = cleanItems([{ ...body, id, source: "custom" }], "custom");
  if (!it || !(it.name || it.description)) throw new HttpError(400, "Enter a name for the product.");
  if (!it.unit) throw new HttpError(400, "Enter a unit (EA, SF, LF…).");
  const count = await mutate(stores.qb, (cur) => {
    cur.items = Array.isArray(cur.items) ? cur.items : [];
    const i = cur.items.findIndex((x) => x.id === it.id);
    if (i >= 0) cur.items[i] = it;
    else { if (cur.items.length >= 5000) throw new HttpError(400, "Too many custom products."); cur.items.push(it); }
    cur.updatedAt = new Date().toISOString();
    cur.updatedBy = who.name;
    return cur.items.length;
  }, CUSTOM);
  return { item: it, count };
}

async function deleteCustomItem(stores, who, id) {
  requireAdmin(who);
  await mutate(stores.qb, (cur) => { cur.items = (cur.items || []).filter((x) => x.id !== id); }, CUSTOM);
  return { ok: true };
}

async function putJmrcCatalog(stores, who, body) {
  requireAdmin(who);
  const items = cleanItems(body.items, "jmrc");
  if (!items.length) throw new HttpError(400, "No catalog rows found");
  const doc = { items, importedAt: new Date().toISOString(), importedBy: who.name, fileName: str(body.fileName, 200) };
  await stores.qb.setJSON("catalog/jmrc", doc);
  return { count: items.length, importedAt: doc.importedAt };
}

async function squareSync(stores, who, { fetchImpl } = {}) {
  requireAdmin(who);
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new HttpError(400, "SQUARE_ACCESS_TOKEN isn't set in Netlify (Site configuration → Environment variables).");
  const { items, skipped } = await syncSquareCatalog({ token, fetchImpl });
  const doc = { items: cleanItems(items, "square"), syncedAt: new Date().toISOString(), syncedBy: who.name, note: skipped ? `${skipped} variation(s) without a default unit cost were skipped` : "" };
  await stores.qb.setJSON("catalog/square", doc);
  return { count: doc.items.length, skipped, syncedAt: doc.syncedAt };
}

const SUPPLIERS = ["aline", "oppein", "divine"];

async function getCabinets(stores) {
  const docs = await Promise.all(SUPPLIERS.map((x) => stores.qb.get(`catalog/cabinets/${x}`, { type: "json" })));
  return Object.fromEntries(SUPPLIERS.map((x, i) => [x, docs[i]]));
}

async function putCabinets(stores, who, body) {
  requireAdmin(who);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) throw new HttpError(400, "No catalog files");
  const saved = [];
  for (const f of files) {
    const sup = SUPPLIERS.find((x) => String(f?.supplier || "").toLowerCase().includes(x));
    if (!sup) throw new HttpError(400, "Each file must be the Aline, Oppein or Divine catalog (it names its supplier).");
    if (!(typeof f.discount === "number" && f.discount > 0 && f.discount < 1)) throw new HttpError(400, `${sup}: dealer discount missing`);
    if (!Array.isArray(f.products) || !f.products.length) throw new HttpError(400, `${sup}: no products`);
    if (JSON.stringify(f).length > 2_000_000) throw new HttpError(413, `${sup}: file too large`);
    await stores.qb.setJSON(`catalog/cabinets/${sup}`, { ...f, loadedAt: new Date().toISOString(), loadedBy: who.name });
    saved.push({ supplier: sup, products: f.products.length, discount: f.discount });
  }
  return { saved };
}

/* ------------------------------ settings ------------------------------ */

// mutate() saves the object it hands over, so replace its contents in place.
function replaceDoc(doc, next) {
  for (const k of Object.keys(doc)) delete doc[k];
  return Object.assign(doc, next);
}

async function putSettings(stores, who, body) {
  requireAdmin(who);
  const s = body.settings;
  if (!s || typeof s !== "object" || !Array.isArray(s.components) || !Array.isArray(s.rates) || !s.pricing)
    throw new HttpError(400, "Settings are incomplete");
  if (JSON.stringify(s).length > 500_000) throw new HttpError(413, "Settings are too large");
  let saved;
  await mutate(stores.qb, (cur) => {
    // Numbering is owned by the server (allocateNumber): keep the stored counters.
    saved = replaceDoc(cur, { ...s, nextNumbers: cur.nextNumbers || {}, updatedAt: new Date().toISOString(), updatedBy: who.name });
  }, { key: "settings", init: () => ({}) });
  return { settings: saved };
}

// Next REN2026-07 / CUS2026-03 for a prefix, atomically.
async function allocateNumber(stores, prefix) {
  if (!/^(REN|CUS)\d{4}$/.test(prefix)) throw new HttpError(400, "Bad prefix");
  let n;
  await mutate(stores.qb, (s) => {
    if (!s.components) throw new HttpError(409, "The owner hasn't saved Quote Builder settings yet.");
    s.nextNumbers = s.nextNumbers || {};
    n = s.nextNumbers[prefix] || 1;
    s.nextNumbers[prefix] = n + 1;
  }, { key: "settings", init: () => ({}) });
  return `${prefix}-${String(n).padStart(2, "0")}`;
}

/* ------------------------------ quotes ------------------------------ */

const STATUSES = ["draft", "needs-approval", "approved", "sent", "won", "lost"];

const summary = (q) => ({
  id: q.id, number: q.number, version: q.version, type: q.type, title: q.title, status: q.status,
  client: q.answers?.clientName || "", address: q.answers?.siteAddress || "",
  total: q.totals?.total ?? null, createdBy: q.createdBy, updatedAt: q.updatedAt, updatedBy: q.updatedBy || "",
});

async function saveQuote(stores, who, id, body) {
  const q = body.quote;
  if (!q || typeof q !== "object" || q.id !== id) throw new HttpError(400, "Quote id doesn't match");
  if (JSON.stringify(q).length > 1_500_000) throw new HttpError(413, "Quote is too large");
  const now = new Date().toISOString();
  const saved = await mutate(stores.qb, (cur) => {
    const prev = cur.id ? { ...cur } : null;
    if (prev && body.baseUpdatedAt && prev.updatedAt !== body.baseUpdatedAt && !body.force)
      throw Object.assign(new HttpError(409, `${prev.updatedBy || "Someone"} saved this quote since you opened it.`), { current: prev });
    // Approval is only ever set by an Admin through /approve; a rep can't
    // write it, and 'approved' can't be set by hand.
    const approval = prev?.approval;
    let status = STATUSES.includes(q.status) ? q.status : "draft";
    if (status === "approved" && !who.admin && prev?.status !== "approved") status = "needs-approval";
    const next = {
      ...q,
      status,
      approval,
      number: prev?.number || "",
      createdBy: prev?.createdBy || who.name,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      updatedBy: who.name,
    };
    if (q.number && (!prev?.number || who.admin)) next.number = str(q.number, 30);
    if (!next.approval) delete next.approval;
    return replaceDoc(cur, next);
  }, quoteDoc(id));
  await mutate(stores.qb, (idx) => {
    idx.quotes = idx.quotes.filter((x) => x.id !== id);
    idx.quotes.unshift(summary(saved));
  }, INDEX);
  return { quote: saved };
}

async function approveQuote(stores, who, id, body) {
  requireAdmin(who);
  const total = Number(body.total);
  if (!Number.isFinite(total)) throw new HttpError(400, "total is required");
  const out = await mutate(stores.qb, (cur) => {
    if (!cur.id) throw new HttpError(404, "Quote not found");
    if (body.revoke) { delete cur.approval; cur.status = "needs-approval"; }
    else {
      cur.approval = { by: who.name, at: new Date().toISOString(), note: str(body.note, 1000), totalAtApproval: total };
      cur.status = "approved";
    }
    cur.updatedAt = new Date().toISOString();
    cur.updatedBy = who.name;
    return { ...cur };
  }, quoteDoc(id));
  await mutate(stores.qb, (idx) => {
    idx.quotes = idx.quotes.filter((x) => x.id !== id);
    idx.quotes.unshift(summary(out));
  }, INDEX);
  return { quote: out };
}

async function deleteQuote(stores, who, id) {
  const q = await stores.qb.get(`quotes/${id}`, { type: "json" });
  if (q && !who.admin && q.createdBy !== who.name) throw new HttpError(403, "Only the person who made it or an Admin can delete a quote.");
  await stores.qb.delete(`quotes/${id}`);
  await mutate(stores.qb, (idx) => { idx.quotes = idx.quotes.filter((x) => x.id !== id); }, INDEX);
  return { ok: true };
}

/* ------------------------------ document reader ------------------------------ */

const readable = (type, name) =>
  /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/.*)$/.test(type) || /\.(txt|md|csv)$/i.test(name);

async function putChunk(stores, req, jobId, fileId, n) {
  if (!isId(jobId) || !isId(fileId) || !/^\d{1,3}$/.test(n)) throw new HttpError(400, "Bad upload path");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_CHUNK) throw new HttpError(413, "Chunk too large");
  await stores.qb.set(`uploads/${jobId}/${fileId}/${n}`, buf);
  return { ok: true, bytes: buf.byteLength };
}

async function startRead(stores, who, body, req, fetchImpl) {
  const jobId = str(body.jobId, 64);
  if (!isId(jobId)) throw new HttpError(400, "jobId required");
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 40).map((f) => ({
    id: str(f.id, 64), name: str(f.name, 200), type: str(f.type, 100), size: Number(f.size) || 0, chunks: Math.min(Number(f.chunks) || 0, 999),
  }));
  if (!files.length && !str(body.notes, 1).length) throw new HttpError(400, "Add a document or some notes first");
  const bad = files.find((f) => !isId(f.id) || !readable(f.type, f.name));
  if (bad) throw new HttpError(400, `${bad.name}: the reader takes PDFs, images (PNG/JPG/GIF/WebP) and text files.`);
  if (files.reduce((a, f) => a + f.size, 0) > MAX_READ_BYTES) throw new HttpError(413, "Those documents are over 24 MB together — pick the drawings and notes that matter.");
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(400, "ANTHROPIC_API_KEY isn't set in Netlify (Site configuration → Environment variables).");
  const secret = crypto.randomUUID();
  const job = {
    id: jobId, secret, status: "queued", by: who.name, at: new Date().toISOString(),
    quoteType: str(body.quoteType, 20), notes: str(body.notes, 60000), answers: body.answers || {},
    fields: Array.isArray(body.fields) ? body.fields.slice(0, 200) : [], files,
  };
  await stores.qb.setJSON(`jobs/${jobId}`, job);
  const origin = new URL(req.url).origin;
  const r = await (fetchImpl || fetch)(`${origin}/.netlify/functions/quote-builder-read-background`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, secret }),
  }).catch((e) => ({ ok: false, status: 0, e }));
  if (!r.ok && r.status !== 202) {
    await stores.qb.setJSON(`jobs/${jobId}`, { ...job, status: "error", error: "Couldn't start the document reader." });
    throw new HttpError(502, "Couldn't start the document reader — try again.");
  }
  return { jobId, status: "queued" };
}

async function readStatus(stores, jobId) {
  const job = await stores.qb.get(`jobs/${jobId}`, { type: "json" });
  if (!job) throw new HttpError(404, "Job not found");
  return { status: job.status, error: job.error || "", result: job.result || null, at: job.doneAt || job.at };
}

/* ------------------------------ handler ------------------------------ */

export function routePath(url) {
  const p = new URL(url).pathname;
  const m = p.match(/\/(?:api\/quote-builder|\.netlify\/functions\/quote-builder-api)\/?(.*)$/);
  return (m ? m[1] : "").replace(/\/+$/, "");
}

// `stores` can be injected (tests): { qb, vo, sel }.
export function createHandler({ stores: injected, fetchImpl } = {}) {
  return async function handler(req, context) {
    const path = routePath(req.url);
    const method = req.method;
    const stores = injected || { qb: openStore(context, "quote-builder"), vo: openStore(context), sel: openStore(context, "selections") };
    try {
      if (!stores.qb || !stores.vo) {
        if (path === "config" && method === "GET") return json({ live: false });
        throw new HttpError(503, "Quote Builder storage isn't available on this deployment.");
      }
      if (path === "config" && method === "GET") return json({ live: true });
      const [a, b, c, d] = path.split("/");

      if (method === "POST" && a === "login") {
        const body = await req.json().catch(() => ({}));
        const r = await signIn(stores, body, { app: "quoteBuilder" });
        return json(r, 200, { "set-cookie": sessionCookie(r.token) });
      }

      const who = await whoIs(stores, req);
      if (method === "PUT" && a === "uploads") return json(await putChunk(stores, req, b, c, d));
      const body = ["POST", "PUT", "PATCH"].includes(method) ? await req.json().catch(() => ({})) : {};

      if (method === "GET" && a === "me") return json({ me: who });
      if (a === "catalog") {
        if (method === "GET" && !b) return json(await getCatalog(stores));
        if (method === "PUT" && b === "jmrc") return json(await putJmrcCatalog(stores, who, body));
        if (method === "GET" && b === "cabinets") return json(await getCabinets(stores));
        if (method === "PUT" && b === "cabinets") return json(await putCabinets(stores, who, body));
        if (method === "POST" && b === "square-sync") return json(await squareSync(stores, who, { fetchImpl }));
        if (method === "POST" && b === "custom") return json(await addCustomItem(stores, who, body));
        if (method === "DELETE" && b === "custom" && c) return json(await deleteCustomItem(stores, who, c));
      }
      if (a === "settings") {
        if (method === "GET") {
          const st = await stores.qb.get("settings", { type: "json" });
          return json({ settings: st && st.components ? st : null });
        }
        if (method === "PUT") return json(await putSettings(stores, who, body));
      }
      if (method === "POST" && a === "numbers") return json({ number: await allocateNumber(stores, str(body.prefix, 10)) });
      if (a === "quotes" && !b && method === "GET") return json(await readState(stores.qb, INDEX));
      if (a === "quotes" && isId(b)) {
        if (!c && method === "GET") {
          const q = await stores.qb.get(`quotes/${b}`, { type: "json" });
          if (!q) throw new HttpError(404, "Quote not found");
          return json({ quote: q });
        }
        if (!c && method === "PUT") return json(await saveQuote(stores, who, b, body));
        if (!c && method === "DELETE") return json(await deleteQuote(stores, who, b));
        if (c === "approve" && method === "POST") return json(await approveQuote(stores, who, b, body));
      }
      if (a === "read" && method === "POST" && !b) return json(await startRead(stores, who, body, req, fetchImpl), 202);
      if (a === "read" && method === "GET" && isId(b)) return json(await readStatus(stores, b));
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e.status === 409 && e.current) return json({ error: e.message, current: e.current }, 409);
      if (e instanceof HttpError || e.status) return json({ error: e.message }, e.status);
      console.error("quote-builder-api", e);
      return json({ error: "Server error — try again" }, 500);
    }
  };
}

export default createHandler();
