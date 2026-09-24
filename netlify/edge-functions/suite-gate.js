// Page gate (Netlify Edge Function). Runs in front of every app page and file
// and asks the Suite API (/api/suite/check) whether this visitor may open the
// app. Signed in with access → the page loads as normal. Not signed in → sent
// to the suite home page to sign in (and brought back afterwards). Signed in
// without access → a short "no access" page. If the check itself fails, the
// app stays closed.
//
// Answers are remembered for a minute per visitor, so opening an app (which
// loads many files) costs one check, and turning someone's access off takes
// effect within a minute.

const APPS = [
  ["/cabinet-designer", "cabinet", "Cabinet Designer"],
  ["/aline-designer", "aline", "Aline Cabinet Designer"],
  ["/selections", "selections", "Finish Selections"],
  ["/vendor-orders", "vendorOrders", "Vendor Orders"],
  ["/admin", "admin", "Suite Admin"],
];
const COOKIE = "jmrc_session";
const CACHE_MS = 60_000;
const cache = new Map(); // `${app}|${token}` → { status, until }

export function appFor(pathname) {
  for (const [prefix, app, label] of APPS)
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return { app, label };
  return null;
}

function tokenOf(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)jmrc_session=([^;]+)/);
  return m ? m[1] : "";
}

const wantsPage = (request, pathname) =>
  (request.headers.get("accept") || "").includes("text/html") || !/\.[a-z0-9]+$/i.test(pathname) || pathname.endsWith(".html");

async function check(request, app) {
  const token = tokenOf(request);
  const key = `${app}|${token}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.status;
  const url = new URL(`/api/suite/check?app=${encodeURIComponent(app)}`, request.url);
  const res = await fetch(url, { headers: token ? { cookie: `${COOKIE}=${token}` } : {} });
  const status = [200, 401, 403].includes(res.status) ? res.status : 503;
  if (status !== 503) {
    if (cache.size > 2000) cache.clear();
    cache.set(key, { status, until: Date.now() + CACHE_MS });
  }
  return status;
}

const page = (status, title, text) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="font-family:system-ui,sans-serif;background:#f5f3ef;color:#2b2b2b;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">` +
      `<div style="background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;box-shadow:0 2px 12px rgba(0,0,0,.08)">` +
      `<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="margin:0 0 18px;line-height:1.5">${text}</p>` +
      `<a href="/" style="color:#8a6d3b;font-weight:600">← Back to the JMRC suite</a></div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export default async function gate(request, context) {
  const url = new URL(request.url);
  const target = appFor(url.pathname);
  if (!target) return context.next();

  let status;
  try {
    status = await check(request, target.app);
  } catch {
    status = 503;
  }
  if (status === 200) return context.next();

  const html = wantsPage(request, url.pathname);
  if (status === 401) {
    if (!html) return new Response("Sign in required", { status: 401, headers: { "cache-control": "no-store" } });
    const next = encodeURIComponent(url.pathname + url.search);
    return new Response(null, { status: 302, headers: { location: `/?next=${next}`, "cache-control": "no-store" } });
  }
  if (status === 403) {
    if (!html) return new Response("No access", { status: 403, headers: { "cache-control": "no-store" } });
    return page(403, "No access", `You don't have access to ${target.label}. Ask a suite Admin to turn it on for you.`);
  }
  if (!html) return new Response("Unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  return page(503, "Please try again", "We couldn't check your sign-in just now. Refresh the page in a moment.");
}

// Test hook: forget remembered answers.
export const _clearCache = () => cache.clear();

// Kept as plain literals (Netlify reads this at build time). Match APPS above.
export const config = {
  path: [
    "/cabinet-designer", "/cabinet-designer/*",
    "/aline-designer", "/aline-designer/*",
    "/selections", "/selections/*",
    "/vendor-orders", "/vendor-orders/*",
    "/admin", "/admin/*",
  ],
};
