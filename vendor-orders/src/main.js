// Vendor Order Consolidation — UI. Ported from docs/artifact-reference.html:
// same views, workflow and markup; storage swapped for the API, and sign-in
// is name + a PIN issued by a Purchaser (roles are held on the server).
import "./styles.css";
import {
  COST, UNITS, STATUSES, esc, money, lineTotal, suggestCoa, nextCutoff, fmtCountdown, fmtDate,
  localDate, todayStr, buildCSV,
} from "./logic.js";
import { isPurchaser as isPurchaserUser, canModifyLine, CLEAR_HISTORY_PHRASE, RESET_ALL_PHRASE } from "./rules.js";
import { fetchConfig, remoteStore, demoStore, savedUser, saveUser } from "./store.js";

const POLL_MS = 30000;

/* ============================ STATE ============================ */
let store = null;
let ME = null;
let VENDORS = []; // [{id,name,day,cat,active,sortOrder}]
let DAYS = {}; // {tue:{label,weekday,cutoff,timezone}, ...}
let ORDERS = [];
let USERS = null;
let state = "connecting"; // connecting | setup | signin | ready | error
let errMsg = "";
let lastSync = null;
let view = "dashboard",
  selectedVendor = null;
let filters = { vendor: "", status: "", q: "" };

/* ============================ HELPERS ============================ */
const $ = (id) => document.getElementById(id);
function isPurchaser() {
  return isPurchaserUser(ME);
}
function canEdit(o) {
  return canModifyLine(ME, o);
}
function activeVendors() {
  return VENDORS.filter((v) => v.active);
}
function vendorObj(name) {
  return VENDORS.find((v) => v.name === name) || { name, day: "thu", cat: "" };
}
function dayLabel(key) {
  return (DAYS[key] && DAYS[key].label) || key;
}
function roleLabel(role) {
  return role === "purchaser" ? "Purchaser" : "Sales rep";
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 2800);
}
function coaName(code) {
  const c = COST.codes[code];
  return c ? c.name : "";
}

/* ============================ DATA ============================ */
function applyData(d) {
  ME = d.me;
  VENDORS = d.vendors;
  DAYS = Object.fromEntries(d.cutoffs.map((c) => [c.key, c]));
  ORDERS = d.orders;
  lastSync = new Date();
}
async function refresh() {
  try {
    applyData(await store.load());
    state = "ready";
  } catch (e) {
    if (e.status === 401) return signedOut();
    if (state !== "ready") {
      state = "error";
      errMsg = e.message;
    } else toast("Refresh failed: " + e.message);
  }
}
// Run a write, report errors, then reload so everyone's changes show.
async function act(promise, okMsg) {
  try {
    const r = await promise;
    if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg);
    await refresh();
    render();
    return r || true;
  } catch (e) {
    toast(e.message || "Save failed");
    if (e.status === 401) {
      signedOut();
      render();
    } else if (e.status === 403 || e.status === 404) {
      await refresh();
      render();
    }
    return false;
  }
}
// Keep the name on the device so the next sign-in only needs the PIN.
function signedOut() {
  const last = savedUser();
  saveUser(last ? { name: last.name } : null);
  ME = null;
  state = "signin";
}
async function startSession(r) {
  saveUser({ name: r.me.name, token: r.token });
  state = "connecting";
  view = "dashboard";
  await refresh();
}
async function signIn() {
  const name = $("si_name").value.trim().replace(/\s+/g, " ");
  const pin = $("si_pin").value.trim();
  if (name.length < 2) return toast("Enter your full name"), $("si_name").focus();
  if (!pin) return toast("Enter your PIN"), $("si_pin").focus();
  $("si_go").disabled = true;
  try {
    await startSession(await store.login(name, pin));
  } catch (e) {
    toast(e.message);
    $("si_go").disabled = false;
    $("si_pin").value = "";
    $("si_pin").focus();
    return;
  }
  render();
}
async function setupFirst() {
  const name = $("su_name").value.trim().replace(/\s+/g, " ");
  if (name.length < 2) return toast("Enter your full name"), $("su_name").focus();
  $("su_go").disabled = true;
  try {
    const r = await store.setup(name);
    await startSession(r);
    render();
    openPinModal(r.me.name, r.pin, true);
  } catch (e) {
    toast(e.message);
    if (e.status === 409) {
      state = "signin";
      render();
    } else $("su_go").disabled = false;
  }
}
async function switchUser() {
  try {
    await store.logout();
  } catch (e) {}
  signedOut();
  render();
}
function vendorLines(name, status) {
  return ORDERS.filter((o) => o.vendor === name && (!status || o.status === status));
}
function batchLines(name) {
  return ORDERS.filter((o) => o.vendor === name && o.status === "ready");
}
function vendorSubtotal(name, status) {
  return vendorLines(name, status).reduce((s, o) => s + lineTotal(o), 0);
}

/* ============================ RENDER ============================ */
function render() {
  document.documentElement.setAttribute("data-theme", currentTheme());
  renderWho();
  renderBanner();
  renderTabs();
  renderSync();
  if (state === "connecting") return renderApp(`<div class="empty">Loading…</div>`);
  if (state === "signin") return renderSignIn();
  if (state === "setup") return renderSetup();
  if (state === "error")
    return renderApp(`<div class="card"><div class="empty">Couldn't load the order queue: ${esc(errMsg)}<br><br><button class="btn" data-action="reload">Try again</button></div></div>`);
  if (view === "settings" && !isPurchaser()) view = "dashboard";
  if (view === "dashboard") renderDashboard();
  else if (view === "add") renderAddForm();
  else if (view === "track") renderTrack();
  else if (view === "settings") renderSettings();
  else if (view === "batch") renderBatch();
}
function renderApp(html) {
  $("app").innerHTML = html;
}
function currentTheme() {
  try {
    return localStorage.getItem("rid_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) {
    return "light";
  }
}
function renderWho() {
  const w = $("whoBox");
  if (!ME || state !== "ready") {
    w.innerHTML = "";
    return;
  }
  const rc = isPurchaser() ? "purch" : "";
  let second = `<span class="badge-role ${rc}">${esc(roleLabel(ME.role))}</span>`;
  if (store.mode === "demo") {
    second = `<span class="demo-role"><select data-demo-role title="Demo only — try each role">
      <option value="sales_rep" ${ME.role === "sales_rep" ? "selected" : ""}>Sales rep</option>
      <option value="purchaser" ${ME.role === "purchaser" ? "selected" : ""}>Purchaser</option></select></span>`;
  } else {
    second += ` <button class="btn sm ghost" data-action="switchUser" style="padding:1px 6px">switch user</button>`;
  }
  w.innerHTML = `<div><b>${esc(ME.name)}</b></div><div>${second}</div>`;
}
function renderSync() {
  const el = $("syncState");
  let text = "Connecting…",
    color = "var(--muted)";
  if (store && store.mode === "demo") text = "Demo mode (this browser only)";
  else if (state === "ready") {
    text = "● Live · shared queue" + (lastSync ? " · updated " + lastSync.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "");
    color = "var(--ok)";
  } else if (state === "error") {
    text = "Sync error";
    color = "var(--danger)";
  } else if (state === "signin" || state === "setup") text = "Signed out";
  el.textContent = text;
  el.style.color = color;
}
function renderBanner() {
  let h = "";
  if (store && store.mode === "demo")
    h += `<div class="banner info"><b>Demo mode.</b> The shared database isn't connected on this deployment yet, so entries are saved <b>only in this browser</b> and aren't shared with the team. Use the role picker (top right) to try the Sales rep and Purchaser views.</div>`;
  $("statusBanner").innerHTML = h;
}
function renderTabs() {
  if (state !== "ready") {
    $("tabs").innerHTML = "";
    return;
  }
  const tabs = [["dashboard", "Dashboard"], ["add", "＋ New order"], ["track", "Track orders"]];
  if (isPurchaser()) tabs.push(["settings", "Settings"]);
  $("tabs").innerHTML = tabs
    .map(([k, l]) => `<button class="${view === k || (k === "dashboard" && view === "batch") ? "active" : ""}" data-tab="${k}">${l}</button>`)
    .join("");
}
function renderSignIn() {
  const last = savedUser();
  const demoNote = store.mode === "demo" ? `<p class="small muted" style="margin:12px 0 0">Demo mode: any PIN works.</p>` : "";
  renderApp(`<div class="card signin">
    <h2>Sign in to Vendor Orders</h2>
    <p>Enter your name and the PIN you were given. Don't have a PIN, or forgot it? Ask a Purchaser.</p>
    <div class="fld" style="text-align:left;margin-bottom:12px"><label for="si_name">Your name</label>
      <input id="si_name" placeholder="First Last" autocomplete="username" value="${esc((last && last.name) || "")}"></div>
    <div class="fld" style="text-align:left;margin-bottom:16px"><label for="si_pin">PIN</label>
      <input id="si_pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="6 digits"></div>
    <button class="btn primary" id="si_go" data-action="signIn">Sign in</button>${demoNote}
  </div>`);
  (last && last.name ? $("si_pin") : $("si_name")).focus();
  for (const id of ["si_name", "si_pin"]) $(id).onkeydown = (e) => e.key === "Enter" && signIn();
}
function renderSetup() {
  renderApp(`<div class="card signin">
    <h2>First-time setup</h2>
    <p>No one has been set up yet. Enter your name to become the first <b>Purchaser</b>. You'll be given a PIN, and you can then add everyone else and issue their PINs under Settings.</p>
    <div class="fld" style="text-align:left;margin-bottom:16px"><label for="su_name">Your name</label>
      <input id="su_name" placeholder="First Last" autocomplete="name"></div>
    <button class="btn primary" id="su_go" data-action="setupFirst">Create my account</button>
  </div>`);
  $("su_name").focus();
  $("su_name").onkeydown = (e) => e.key === "Enter" && setupFirst();
}

function renderDashboard() {
  let h = "";
  for (const dayKey of Object.keys(DAYS)) {
    const day = DAYS[dayKey];
    const cut = nextCutoff(day);
    const vends = activeVendors().filter((v) => v.day === dayKey);
    const readyCount = vends.reduce((s, v) => s + vendorLines(v.name, "ready").length, 0);
    const pendCount = vends.reduce((s, v) => s + vendorLines(v.name, "pending").length, 0);
    h += `<div class="day-head">
      <span class="dh-day">${esc(day.label)}</span>
      <span class="dh-cut">Cutoff: <b data-cutoff="${cut ? cut.toISOString() : ""}" class="mono">…</b></span>
      <span class="dh-count"><span class="count-strong">${readyCount}</span> ready · ${pendCount} pending approval</span>
    </div><div class="vgrid">`;
    if (!vends.length) h += `<div class="muted small">No active vendors on this day.</div>`;
    for (const v of vends) {
      const ready = vendorLines(v.name, "ready").length;
      const pend = vendorLines(v.name, "pending").length;
      const sub = vendorSubtotal(v.name, "ready");
      h += `<div class="card vcard">
        <div><div class="vn">${esc(v.name)}</div><div class="vc">${esc(v.cat || "—")}</div></div>
        <div class="vstat">
          <div class="s ready"><span class="num">${ready}</span><span class="lbl">Ready</span></div>
          <div class="s pend"><span class="num">${pend}</span><span class="lbl">Pending</span></div>
        </div>
        <div class="vsub">This batch: <b>${money(sub)}</b></div>
        <button class="btn sm ${ready ? "cyan" : ""}" data-vendor="${esc(v.name)}" ${ready ? "" : "disabled"} style="margin-top:2px">${ready ? "Build order →" : "No lines"}</button>
      </div>`;
    }
    h += "</div>";
  }
  renderApp(h);
  tickCountdowns();
}

/* ---------- ADD (multi-item order form) ---------- */
function coaOptionsHTML(sel) {
  let h = '<option value="">— cost code —</option>';
  for (const ph in COST.phases) {
    const codes = Object.keys(COST.codes).filter((c) => COST.codes[c].phase === ph).sort();
    if (!codes.length) continue;
    h += `<optgroup label="${esc(COST.phases[ph])}">`;
    for (const c of codes) h += `<option value="${c}" ${c === sel ? "selected" : ""}>${esc(c)} — ${esc(COST.codes[c].name)}</option>`;
    h += "</optgroup>";
  }
  return h;
}
function itemRowHTML() {
  const u = UNITS.map((x) => `<option>${x}</option>`).join("");
  return `<tr class="item-row">
    <td><input class="i-name" placeholder="Product name"></td>
    <td><input class="i-sku" placeholder="SKU"></td>
    <td><input class="i-desc" placeholder="Description"></td>
    <td class="coacol"><select class="i-coa">${coaOptionsHTML("")}</select></td>
    <td class="qtycol"><input class="i-qty" type="number" min="0" step="any" value="1"></td>
    <td><select class="i-unit">${u}</select></td>
    <td class="costcol"><input class="i-cost" type="number" min="0" step="any" placeholder="0.00"></td>
    <td><button class="rm-row" data-action="removeItemRow" title="Remove item">✕</button></td>
  </tr>`;
}
function renderAddForm() {
  const vOpts = activeVendors().map((v) => `<option value="${esc(v.name)}">${esc(v.name)} — ${esc(dayLabel(v.day))}</option>`).join("");
  renderApp(`
  <div class="section-title"><h2>New order</h2><span class="rule"></span></div>
  <div class="card" style="padding:20px">
    <div class="form-grid">
      <div class="fld"><label>Vendor <span class="req">*</span></label><select id="f_vendor">${vOpts}</select></div>
      <div class="fld"><label>PO # <span class="req">*</span></label><input id="f_po" placeholder="Issued PO number"></div>
      <div class="fld"><label>Job code <span class="muted small">(JobTread/Meister)</span></label><input id="f_job" placeholder="e.g. REN2026-04"></div>
      <div class="fld"><label>Client / address</label><input id="f_client"></div>
      <div class="fld"><label>Needed by</label><input id="f_needed" type="date"></div>
      <div class="fld full"><label>Order notes <span class="muted small">(optional)</span></label><input id="f_notes"></div>
    </div>
    <div class="banner info" style="margin-top:14px">Enter the <b>issued PO #</b> for this order. Pick a <b>cost code</b> per item (auto-suggested from the product name) for QuickBooks coding — if none fits, check with Susan before finalizing.</div>
    <div class="section-title" style="margin:18px 0 6px"><h2 style="font-size:14px">Items</h2><span class="rule"></span></div>
    <div class="items-wrap"><table class="items-tbl"><thead><tr>
      <th style="min-width:150px">Product name <span class="req">*</span></th><th style="min-width:90px">SKU</th><th style="min-width:150px">Description</th><th>Cost code <span class="req">*</span></th><th>Qty <span class="req">*</span></th><th>Unit</th><th>Cost/unit</th><th></th>
    </tr></thead><tbody id="itemRows">${itemRowHTML()}${itemRowHTML()}${itemRowHTML()}</tbody></table></div>
    <button class="btn sm ghost" data-action="addItemRow" style="margin-top:8px">＋ Add another item</button>
    <div class="fld full" style="margin-top:18px">
      <div class="checkline"><input type="checkbox" id="f_appr">
        <div class="ct"><b>Approved &amp; deposit received.</b> Leave unchecked and the whole order waits in <b>Pending approval</b> — it won't join a batch until this is confirmed (JMRC rule: no PO before approval + deposit).</div>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" data-action="submitOrder" id="f_submit">Add order to queue</button><button class="btn ghost" data-action="clearForm">Clear form</button><button class="btn ghost" data-tab="dashboard">Cancel</button></div>
  </div>`);
}
async function submitOrder() {
  const g = (id) => $(id);
  const vendor = g("f_vendor").value,
    po = g("f_po").value.trim();
  if (!vendor) return toast("No active vendors — ask a Purchaser to add one");
  if (!po) {
    toast("PO # is required");
    g("f_po").focus();
    return;
  }
  const items = [];
  let missingCoa = false;
  document.querySelectorAll(".item-row").forEach((r) => {
    const name = r.querySelector(".i-name").value.trim();
    const qty = Number(r.querySelector(".i-qty").value);
    if (!name || !(qty > 0)) return;
    const coa = r.querySelector(".i-coa").value;
    if (!coa) missingCoa = true;
    items.push({
      productName: name, sku: r.querySelector(".i-sku").value.trim(), description: r.querySelector(".i-desc").value.trim(),
      coa, qty, unit: r.querySelector(".i-unit").value, cost: Number(r.querySelector(".i-cost").value) || 0,
    });
  });
  if (!items.length) return toast("Add at least one item with a product name and qty");
  if (missingCoa) return toast("Pick a cost code for every item — if unsure, check with Susan");
  const appr = g("f_appr").checked;
  g("f_submit").disabled = true;
  const ok = await act(
    store.createOrder({
      vendor, po, jobCode: g("f_job").value.trim(), client: g("f_client").value.trim(),
      neededBy: g("f_needed").value, notes: g("f_notes").value.trim(), approved: appr, items,
    }),
    (r) => { const n = r.created; return n + " item" + (n > 1 ? "s" : "") + (appr ? " added to batch" : " added — pending"); },
  );
  if (ok) {
    view = "dashboard";
    render();
  } else if (g("f_submit")) g("f_submit").disabled = false;
}

/* ---------- BATCH ---------- */
function renderBatch() {
  const name = selectedVendor;
  const v = vendorObj(name);
  const lines = batchLines(name);
  const cut = nextCutoff(DAYS[v.day]);
  const sub = lines.reduce((s, o) => s + lineTotal(o), 0);
  const recent = ORDERS.filter((o) => o.vendor === name && ["ordered", "received", "backordered"].includes(o.status))
    .sort((a, b) => (b.orderedAt || "").localeCompare(a.orderedAt || ""))
    .slice(0, 10);
  let h = `<div class="section-title"><h2>${esc(name)} — weekly batch</h2><span class="rule"></span>
    <button class="btn sm ghost" data-tab="dashboard">← All vendors</button></div>
    <div class="banner info">Order day: <b>${esc(dayLabel(v.day))}</b> · Cutoff <b data-cutoff="${cut ? cut.toISOString() : ""}" class="mono">…</b>. Everything <b>Ready</b> below ships on one PO.</div>`;
  if (!lines.length) {
    h += `<div class="card"><div class="empty">No ready lines for ${esc(name)}. Approved items land here automatically.</div></div>`;
  } else {
    h += `<div class="card" style="padding:14px"><div class="tbl-wrap"><table><thead><tr>
      <th>PO #</th><th>Job</th><th>Product</th><th>SKU</th><th>COA</th><th>Description</th>
      <th class="num">Qty</th><th>Unit</th><th class="num">Cost</th><th class="num">Line</th><th>Need by</th><th>Rep</th><th></th>
    </tr></thead><tbody>`;
    for (const o of lines) {
      const acts = canEdit(o)
        ? `<button class="btn sm ghost" data-action="edit" data-id="${o.id}">Edit</button><button class="btn sm ghost" data-action="del" data-id="${o.id}">✕</button>`
        : "";
      h += `<tr>
        <td class="po">${esc(o.po || "")}</td><td>${esc(o.jobCode)}</td><td>${esc(o.productName)}</td><td>${esc(o.sku)}</td><td title="${esc(coaName(o.coa))}">${esc(o.coa || "")}</td><td>${esc(o.description)}</td>
        <td class="num mono">${esc(o.qty)}</td><td>${esc(o.unit)}</td>
        <td class="num mono">${money(o.cost)}</td><td class="num mono">${money(lineTotal(o))}</td>
        <td>${esc(o.neededBy || "")}</td><td>${esc(o.createdByName)}</td>
        <td class="row-actions">${acts}</td>
      </tr>`;
    }
    h += `</tbody><tfoot><tr><td colspan="9" class="num">Batch subtotal (ex. HST)</td><td class="num mono">${money(sub)}</td><td colspan="3"></td></tr></tfoot></table></div>`;
    h += `<div class="row-actions" style="margin-top:14px">
      <button class="btn cyan" data-action="exportBatch" data-id="${esc(name)}">⭳ Export PO (CSV)</button>`;
    if (isPurchaser()) h += `<button class="btn primary" data-action="markOrdered" data-id="${esc(name)}">Mark batch ordered</button>`;
    h += `</div></div>`;
  }
  if (recent.length) {
    h += `<div class="section-title" style="margin-top:26px"><h2>Recent ${esc(name)} orders</h2><span class="rule"></span></div>
      <div class="card" style="padding:14px"><div class="tbl-wrap"><table><thead><tr>
      <th>Ordered</th><th>By</th><th>PO #</th><th>Product</th><th class="num">Qty</th><th>Status</th><th>Conf#</th><th>ETA</th>${isPurchaser() ? "<th></th>" : ""}</tr></thead><tbody>`;
    for (const o of recent) {
      h += `<tr><td>${esc(localDate(o.orderedAt))}</td><td class="small">${esc(o.orderedByName)}</td><td class="po">${esc(o.po || "")}</td><td>${esc(o.productName || o.description)}</td>
        <td class="num mono">${esc(o.qty)}</td><td><span class="chip ${o.status}">${o.status}</span></td>
        <td>${esc(o.confirmation || "")}</td><td>${esc(o.eta || "")}</td>
        ${isPurchaser() ? `<td class="row-actions">${o.status !== "received" ? `<button class="btn sm" data-action="receive" data-id="${o.id}">Received</button>` : ""}${o.status === "ordered" ? `<button class="btn sm ghost" data-action="backorder" data-id="${o.id}">Backorder</button>` : ""}</td>` : ""}
      </tr>`;
    }
    h += `</tbody></table></div></div>`;
  }
  renderApp(h);
  tickCountdowns();
}

/* ---------- TRACK ---------- */
function renderTrack() {
  const vOpts = ['<option value="">All vendors</option>']
    .concat(VENDORS.map((v) => `<option ${filters.vendor === v.name ? "selected" : ""}>${esc(v.name)}</option>`))
    .join("");
  const sOpts = ["", ...STATUSES]
    .map((s) => `<option value="${s}" ${filters.status === s ? "selected" : ""}>${s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}</option>`)
    .join("");
  let rows = ORDERS.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (filters.vendor) rows = rows.filter((o) => o.vendor === filters.vendor);
  if (filters.status) rows = rows.filter((o) => o.status === filters.status);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((o) => [o.po, o.jobCode, o.client, o.productName, o.description, o.sku, o.createdByName, o.coa].some((x) => String(x || "").toLowerCase().includes(q)));
  }
  let h = `<div class="section-title"><h2>Track orders</h2><span class="rule"></span><span class="pill">${rows.length} line${rows.length === 1 ? "" : "s"}</span></div>
   <div class="filters">
     <div class="fld"><label>Vendor</label><select data-filter="vendor">${vOpts}</select></div>
     <div class="fld"><label>Status</label><select data-filter="status">${sOpts}</select></div>
     <div class="fld" style="flex:1 1 200px"><label>Search PO / job / product / client</label><input data-filter="q" value="${esc(filters.q)}" placeholder="type to filter"></div>
   </div>`;
  if (!rows.length) {
    h += `<div class="card"><div class="empty">No lines match.</div></div>`;
    renderApp(h);
    return;
  }
  h += `<div class="card" style="padding:12px"><div class="tbl-wrap"><table><thead><tr>
    <th>Added</th><th>Vendor</th><th>PO #</th><th>COA</th><th>Product</th><th>Description</th><th class="num">Qty</th><th>Need by</th><th>Rep</th><th>Status</th><th></th></tr></thead><tbody>`;
  for (const o of rows) {
    let acts = "";
    if (canEdit(o)) acts += `<button class="btn sm ghost" data-action="edit" data-id="${o.id}">Edit</button>`;
    if (o.status === "pending" && canEdit(o)) acts += `<button class="btn sm cyan" data-action="approve" data-id="${o.id}">Approve</button>`;
    if (isPurchaser() && (o.status === "ordered" || o.status === "backordered")) acts += `<button class="btn sm" data-action="receive" data-id="${o.id}">Received</button>`;
    if (isPurchaser() && o.status === "ordered") acts += `<button class="btn sm ghost" data-action="backorder" data-id="${o.id}">Backorder</button>`;
    if (canEdit(o)) acts += `<button class="btn sm ghost" data-action="del" data-id="${o.id}">✕</button>`;
    h += `<tr>
      <td class="small">${esc(localDate(o.createdAt))}</td><td>${esc(o.vendor)}</td><td class="po">${esc(o.po || "")}</td><td title="${esc(coaName(o.coa))}">${esc(o.coa || "")}</td>
      <td>${esc(o.productName || "")}</td><td>${esc(o.description)}</td>
      <td class="num mono">${esc(o.qty)} ${esc(o.unit || "")}</td><td class="small">${esc(o.neededBy || "")}</td><td class="small">${esc(o.createdByName)}</td>
      <td><span class="chip ${o.status}">${o.status}</span></td>
      <td class="row-actions">${acts}</td></tr>`;
  }
  h += `</tbody></table></div></div>`;
  renderApp(h);
}

/* ---------- SETTINGS (Purchaser only) ---------- */
function renderSettings() {
  let h = `<div class="section-title"><h2>Weekly cutoff settings</h2><span class="rule"></span></div>
   <div class="card" style="padding:20px"><p class="muted small" style="margin-top:0">Set the deadline for each order day (Atlantic time). Lines added after the cutoff still queue — they simply ride the next week's shipment. Saved for the whole team.</p>
   <div class="form-grid">`;
  for (const k of Object.keys(DAYS)) {
    h += `<div class="fld"><label>${esc(DAYS[k].label)} cutoff time</label><input type="time" data-cuttime="${k}" value="${esc(DAYS[k].cutoff)}"></div>`;
  }
  h += `</div><div style="margin-top:18px"><button class="btn primary" data-action="saveSchedule">Save cutoffs</button></div></div>`;

  // Vendors
  const dayOpts = (sel) => Object.keys(DAYS).map((k) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(DAYS[k].label)}</option>`).join("");
  h += `<div class="section-title"><h2>Vendors</h2><span class="rule"></span></div>
   <div class="card" style="padding:20px">
   <p class="muted small" style="margin-top:0">The vendor roster and each vendor's order day. Deactivate a vendor to hide it from new orders (its history stays). Cabinets and Prosol run through their own ordering paths and are deliberately not listed here.</p>
   <div class="tbl-wrap"><table style="min-width:560px"><thead><tr><th>Vendor</th><th>Category</th><th>Order day</th><th>Open lines</th><th></th></tr></thead><tbody>`;
  for (const v of VENDORS) {
    const open = ORDERS.filter((o) => o.vendor === v.name && ["pending", "ready"].includes(o.status)).length;
    h += `<tr class="${v.active ? "" : "inactive"}"><td><b>${esc(v.name)}</b>${v.active ? "" : ' <span class="muted small">(inactive)</span>'}</td><td>${esc(v.cat || "—")}</td><td>${esc(dayLabel(v.day))}</td><td class="mono">${open}</td>
      <td class="row-actions"><button class="btn sm ghost" data-action="editVendor" data-id="${v.id}">Edit</button>
      <button class="btn sm ghost" data-action="toggleVendor" data-id="${v.id}">${v.active ? "Deactivate" : "Reactivate"}</button></td></tr>`;
  }
  h += `</tbody></table></div>
   <div class="inline-form" style="margin-top:14px">
     <div class="fld"><label>New vendor</label><input id="nv_name" placeholder="Vendor name"></div>
     <div class="fld"><label>Category</label><input id="nv_cat" placeholder="e.g. Tile"></div>
     <div class="fld"><label>Order day</label><select id="nv_day">${dayOpts("tue")}</select></div>
     <button class="btn" data-action="addVendor">＋ Add vendor</button>
   </div></div>`;

  // Team
  h += `<div class="section-title"><h2>Team &amp; roles</h2><span class="rule"></span></div>
   <div class="card" style="padding:20px">
   <p class="muted small" style="margin-top:0">Add each person here to issue their sign-in PIN. The PIN is shown <b>once</b>: write it down or pass it on privately. If someone forgets their PIN, or it gets out, use <b>Reset PIN</b> to issue a new one. That also signs them out everywhere. <b>Deactivate</b> blocks sign-in.</p>`;
  if (!USERS) h += `<div class="muted small">Loading team…</div>`;
  else {
    h += `<div class="tbl-wrap"><table style="min-width:560px"><thead><tr><th>Name</th><th>Role</th><th>PIN</th><th>Access</th></tr></thead><tbody>`;
    for (const u of USERS) {
      h += `<tr class="${u.active ? "" : "inactive"}"><td><b>${esc(u.name)}</b>${u.id === ME.id ? ' <span class="muted small">(you)</span>' : ""}</td>
        <td><select data-user-role="${u.id}"><option value="sales_rep" ${u.role === "sales_rep" ? "selected" : ""}>Sales rep</option><option value="purchaser" ${u.role === "purchaser" ? "selected" : ""}>Purchaser</option></select></td>
        <td>${u.hasPin ? "" : '<span class="muted small">none</span> '}<button class="btn sm ghost" data-action="resetPin" data-id="${u.id}">${u.hasPin ? "Reset PIN" : "Issue PIN"}</button></td>
        <td><button class="btn sm ghost" data-action="toggleUser" data-id="${u.id}">${u.active ? "Deactivate" : "Reactivate"}</button></td></tr>`;
    }
    h += `</tbody></table></div>`;
  }
  h += `<div class="inline-form" style="margin-top:14px">
     <div class="fld"><label>Add person</label><input id="nu_name" placeholder="First Last"></div>
     <div class="fld"><label>Role</label><select id="nu_role"><option value="sales_rep">Sales rep</option><option value="purchaser">Purchaser</option></select></div>
     <button class="btn" data-action="addUser">＋ Add &amp; issue PIN</button>
   </div>`;
  h += `</div>`;

  // Danger zone
  h += `<div class="section-title"><h2>Reset &amp; clear</h2><span class="rule"></span></div>
   <div class="card danger-zone" style="padding:20px">
     <p class="small" style="margin-top:0"><b>Clear ordered/received history</b> — permanently deletes every line marked <b>Ordered</b> or <b>Received</b>. Pending, ready and backordered lines stay.</p>
     <button class="btn danger" data-action="clearHistory">Clear ordered/received history…</button>
     <p class="small" style="margin-top:18px"><b>Reset all data</b> — permanently deletes <b>every</b> order line and puts cutoffs back to 10:00. Vendors and team accounts are kept.</p>
     <button class="btn danger" data-action="resetAll">Reset all data…</button>
   </div>`;
  renderApp(h);
  if (!USERS) loadUsers();
}
async function loadUsers() {
  try {
    USERS = (await store.listUsers()).users;
  } catch (e) {
    USERS = [];
    toast(e.message);
  }
  if (view === "settings") renderSettings();
}

/* ============================ ORDER ACTIONS ============================ */
function approve(id) {
  act(store.patchOrder(id, { status: "ready" }), "Approved — in this week's batch");
}
function receive(id) {
  act(store.patchOrder(id, { status: "received" }), "Marked received");
}
function backorder(id) {
  act(store.patchOrder(id, { status: "backordered" }), "Marked backordered");
}
function del(id) {
  openConfirm("Delete this line?", "This removes it from the shared queue for everyone.", () => act(store.deleteOrder(id), "Deleted"));
}
function deleteOrderGroup(groupId) {
  const lines = ORDERS.filter((o) => o.groupId === groupId);
  if (!lines.length) return;
  openConfirm(
    "Delete entire order?",
    `This removes all ${lines.length} item${lines.length > 1 ? "s" : ""} on this order (PO ${esc(lines[0].po || "")}) for everyone.`,
    () => act(store.deleteGroup(groupId), "Order deleted"),
  );
}
function markOrdered(name) {
  const lines = batchLines(name);
  if (!lines.length) return;
  openOrderModal(name, lines.length, (confirmation, eta) =>
    act(store.markOrdered({ vendor: name, ids: lines.map((o) => o.id), confirmation, eta }), (r) =>
      r.ordered + " line" + (r.ordered === 1 ? "" : "s") + " marked ordered"),
  );
}
function exportBatch(name) {
  const lines = batchLines(name);
  if (!lines.length) return toast("No ready lines");
  const csv = buildCSV(name, dayLabel(vendorObj(name).day), lines, ME.name);
  const fname = "PO_" + name.replace(/[^A-Za-z0-9]+/g, "_") + "_" + todayStr() + ".csv";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("PO exported");
}
function saveSchedule() {
  const times = {};
  document.querySelectorAll("[data-cuttime]").forEach((el) => (times[el.dataset.cuttime] = el.value));
  act(store.saveCutoffs(times), "Cutoffs saved");
}
function addVendor() {
  const name = $("nv_name").value.trim();
  if (!name) return toast("Enter a vendor name");
  act(store.createVendor({ name, cat: $("nv_cat").value.trim(), day: $("nv_day").value }), name + " added");
}
function toggleVendor(id) {
  const v = VENDORS.find((x) => x.id === id);
  if (v) act(store.updateVendor(id, { active: !v.active }), v.name + (v.active ? " deactivated" : " reactivated"));
}
async function addUser() {
  const name = $("nu_name").value.trim();
  if (name.length < 2) return toast("Enter the person's full name");
  try {
    const r = await store.createUser({ name, role: $("nu_role").value });
    USERS = null;
    renderSettings();
    openPinModal(r.user.name, r.pin);
  } catch (e) {
    toast(e.message);
  }
}
function resetPin(id) {
  const u = (USERS || []).find((x) => x.id === id);
  if (!u) return;
  const self = u.id === ME.id;
  openConfirm(
    (u.hasPin ? "Reset PIN for " : "Issue PIN for ") + u.name + "?",
    u.hasPin
      ? "Their old PIN stops working right away and they're signed out on every device." +
        (self ? " <b>This is you</b>: you'll need the new PIN next time you sign in." : "")
      : "A new PIN will be generated for them.",
    async () => {
      try {
        const r = await store.resetPin(id);
        USERS = null;
        renderSettings();
        openPinModal(r.user.name, r.pin);
      } catch (e) {
        toast(e.message);
      }
    },
    u.hasPin ? "Reset PIN" : "Issue PIN",
  );
}
// Shows a freshly issued PIN. It can't be looked up again afterwards.
function openPinModal(name, pin, isSelf = false) {
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal" style="text-align:center">
    <h3>${isSelf ? "Your PIN" : "PIN for " + esc(name)}</h3>
    <p>${isSelf ? "Write this down. You'll need it with your name to sign in." : "Give this to " + esc(name) + " privately. They'll sign in with their name and this PIN."} It <b>won't be shown again</b>. If it's lost, reset it.</p>
    <div class="pin-show mono">${esc(pin)}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:16px"><button class="btn ghost" id="pin_copy">Copy</button><button class="btn primary" data-action="closeModal">Done</button></div>
  </div></div>`;
  $("pin_copy").onclick = () =>
    navigator.clipboard ? navigator.clipboard.writeText(pin).then(() => toast("PIN copied"), () => toast("Copy failed")) : toast("Copy not available");
}
async function toggleUser(id) {
  const u = (USERS || []).find((x) => x.id === id);
  if (!u) return;
  try {
    await store.updateUser(id, { active: !u.active });
    toast(u.name + (u.active ? " deactivated" : " reactivated"));
  } catch (e) {
    toast(e.message);
  }
  USERS = null;
  renderSettings();
}
async function setUserRole(id, role) {
  try {
    await store.updateUser(id, { role });
    toast("Role updated");
    if (id === ME.id) await refresh();
  } catch (e) {
    toast(e.message);
  }
  USERS = null;
  render();
}

/* ============================ MODALS ============================ */
function openOrderModal(name, count, cb) {
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal">
    <h3>Mark ${esc(name)} batch ordered</h3>
    <p>${count} line${count > 1 ? "s" : ""} will move to <b>Ordered</b>. Record the confirmation from the vendor (optional).</p>
    <div class="fld" style="margin-bottom:12px"><label>Order confirmation #</label><input id="om_conf" placeholder="optional"></div>
    <div class="fld" style="margin-bottom:16px"><label>ETA / expected ship</label><input id="om_eta" type="date"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" id="om_go">Confirm ordered</button></div>
  </div></div>`;
  $("om_go").onclick = () => {
    const c = $("om_conf").value.trim();
    const e = $("om_eta").value;
    closeModal();
    cb(c, e);
  };
}
function openConfirm(title, msg, cb, goLabel = "Delete") {
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal">
    <h3>${esc(title)}</h3><p>${msg}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" id="cf_go">${esc(goLabel)}</button></div>
  </div></div>`;
  $("cf_go").onclick = () => {
    closeModal();
    cb();
  };
}
// Type-to-confirm for destructive Purchaser actions.
function openTypeConfirm(title, msg, phrase, cb) {
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal">
    <h3>${esc(title)}</h3><p>${msg}</p>
    <div class="fld" style="margin-bottom:16px"><label>Type <b>${esc(phrase)}</b> to confirm</label><input id="tc_in" autocomplete="off"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn danger" id="tc_go" disabled>${esc(title)}</button></div>
  </div></div>`;
  const inp = $("tc_in"),
    go = $("tc_go");
  inp.focus();
  inp.oninput = () => (go.disabled = inp.value.trim() !== phrase);
  go.onclick = () => {
    closeModal();
    cb(phrase);
  };
}
function closeModal() {
  $("modalRoot").innerHTML = "";
}
function edit(id) {
  const o = ORDERS.find((x) => x.id === id);
  if (o) openEditModal(o);
}
function openEditModal(o) {
  const vendorChoices = VENDORS.filter((v) => v.active || v.name === o.vendor);
  const vOpts = vendorChoices.map((v) => `<option ${v.name === o.vendor ? "selected" : ""}>${esc(v.name)}</option>`).join("");
  const uOpts = UNITS.map((u) => `<option ${u === o.unit ? "selected" : ""}>${u}</option>`).join("");
  const allowed = isPurchaser() ? STATUSES : ["pending", "ready"];
  const sOpts = allowed.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("");
  const group = ORDERS.filter((x) => x.groupId && x.groupId === o.groupId);
  const canDelGroup = group.length > 1 && group.every(canEdit);
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal" style="max-width:640px">
    <h3>Edit line</h3>
    <p>Changes save to the shared queue for everyone.</p>
    <div class="form-grid">
      <div class="fld"><label>Vendor</label><select id="e_vendor">${vOpts}</select></div>
      <div class="fld"><label>PO # <span class="req">*</span></label><input id="e_po" value="${esc(o.po || "")}"></div>
      <div class="fld"><label>Cost code (COA) <span class="req">*</span></label><select id="e_coa">${coaOptionsHTML(o.coa || "")}</select></div>
      <div class="fld"><label>Status</label><select id="e_status">${sOpts}</select></div>
      <div class="fld"><label>Job code</label><input id="e_job" value="${esc(o.jobCode)}"></div>
      <div class="fld"><label>Client / address</label><input id="e_client" value="${esc(o.client)}"></div>
      <div class="fld"><label>Needed by</label><input id="e_needed" type="date" value="${esc(o.neededBy || "")}"></div>
      <div class="fld full"><label>Product name <span class="req">*</span></label><input id="e_name" value="${esc(o.productName)}"></div>
      <div class="fld"><label>SKU</label><input id="e_sku" value="${esc(o.sku)}"></div>
      <div class="fld full"><label>Description</label><input id="e_desc" value="${esc(o.description)}"></div>
      <div class="fld"><label>Qty <span class="req">*</span></label><input id="e_qty" type="number" min="0" step="any" value="${esc(o.qty)}"></div>
      <div class="fld"><label>Unit</label><select id="e_unit">${uOpts}</select></div>
      <div class="fld"><label>Cost/unit</label><input id="e_cost" type="number" min="0" step="any" value="${esc(o.cost)}"></div>
      <div class="fld full"><label>Notes</label><input id="e_notes" value="${esc(o.notes || "")}"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
      <div class="row-actions">
        <button class="btn danger" id="e_del">Delete line</button>
        ${canDelGroup ? `<button class="btn danger" id="e_delorder">Delete entire order (${group.length})</button>` : ""}
      </div>
      <div style="display:flex;gap:10px"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" id="e_save">Save changes</button></div>
    </div>
  </div></div>`;
  $("e_save").onclick = () => {
    const g = (id) => $(id);
    const po = g("e_po").value.trim();
    const name = g("e_name").value.trim(),
      qty = Number(g("e_qty").value);
    if (!po) return toast("PO # is required");
    if (!name || !(qty > 0)) return toast("Product name and qty required");
    if (!g("e_coa").value) return toast("Pick a cost code — if unsure, check with Susan");
    const patch = {
      vendor: g("e_vendor").value, po, coa: g("e_coa").value,
      jobCode: g("e_job").value.trim(), client: g("e_client").value.trim(), neededBy: g("e_needed").value,
      productName: name, sku: g("e_sku").value.trim(), description: g("e_desc").value.trim(),
      qty, unit: g("e_unit").value, cost: Number(g("e_cost").value) || 0, notes: g("e_notes").value.trim(),
      status: g("e_status").value,
    };
    closeModal();
    act(store.patchOrder(o.id, patch), "Line updated");
  };
  $("e_del").onclick = () => {
    closeModal();
    del(o.id);
  };
  const dgo = $("e_delorder");
  if (dgo) dgo.onclick = () => deleteOrderGroup(o.groupId);
}
function openVendorModal(v) {
  const dayOpts = Object.keys(DAYS).map((k) => `<option value="${k}" ${k === v.day ? "selected" : ""}>${esc(DAYS[k].label)}</option>`).join("");
  $("modalRoot").innerHTML = `<div class="overlay"><div class="card modal">
    <h3>Edit vendor</h3>
    <p>Changing the order day moves this vendor's open (pending/ready) lines to that day's batch.</p>
    <div class="fld" style="margin-bottom:12px"><label>Name</label><input id="ev_name" value="${esc(v.name)}"></div>
    <div class="fld" style="margin-bottom:12px"><label>Category</label><input id="ev_cat" value="${esc(v.cat)}"></div>
    <div class="fld" style="margin-bottom:16px"><label>Order day</label><select id="ev_day">${dayOpts}</select></div>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" id="ev_go">Save</button></div>
  </div></div>`;
  $("ev_go").onclick = () => {
    const name = $("ev_name").value.trim();
    if (!name) return toast("Vendor name is required");
    closeModal();
    act(store.updateVendor(v.id, { name, cat: $("ev_cat").value.trim(), day: $("ev_day").value }), "Vendor saved");
  };
}

/* ============================ COUNTDOWN TICK ============================ */
function tickCountdowns() {
  document.querySelectorAll("[data-cutoff]").forEach((el) => {
    const iso = el.getAttribute("data-cutoff");
    if (!iso) {
      el.textContent = "—";
      return;
    }
    const ms = new Date(iso) - new Date();
    const cd = fmtCountdown(ms);
    if (cd === null) {
      el.textContent = "in progress";
      el.style.color = "var(--warn)";
    } else {
      el.textContent = fmtDate(new Date(iso)) + " · " + cd + " left";
      el.style.color = ms < 12 * 3600 * 1000 ? "var(--warn)" : "";
    }
  });
}
setInterval(tickCountdowns, 1000);

/* ============================ EVENTS ============================ */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-vendor],[data-action]");
  if (!t) return;
  if (t.dataset.tab) {
    view = t.dataset.tab;
    selectedVendor = null;
    if (view === "settings") USERS = null;
    render();
    return;
  }
  if (t.dataset.vendor && !t.dataset.action) {
    selectedVendor = t.dataset.vendor;
    view = "batch";
    render();
    return;
  }
  const a = t.dataset.action,
    id = t.dataset.id;
  if (a === "addItemRow") {
    $("itemRows").insertAdjacentHTML("beforeend", itemRowHTML());
    return;
  }
  if (a === "removeItemRow") {
    const row = t.closest(".item-row");
    if (row && $("itemRows").querySelectorAll(".item-row").length > 1) row.remove();
    return;
  }
  ({
    submitOrder, closeModal, saveSchedule, addVendor,
    signIn, switchUser, setupFirst, addUser,
    resetPin: () => resetPin(id),
    reload: () => location.reload(),
    clearForm: () => renderAddForm(),
    edit: () => edit(id),
    approve: () => approve(id), receive: () => receive(id), backorder: () => backorder(id), del: () => del(id),
    markOrdered: () => markOrdered(id), exportBatch: () => exportBatch(id),
    editVendor: () => { const v = VENDORS.find((x) => x.id === id); if (v) openVendorModal(v); },
    toggleVendor: () => toggleVendor(id),
    toggleUser: () => toggleUser(id),
    clearHistory: () => openTypeConfirm("Clear history",
      "Every <b>Ordered</b> and <b>Received</b> line will be permanently deleted for everyone.", CLEAR_HISTORY_PHRASE,
      (p) => act(store.clearHistory(p), (r) => r.deleted + " line" + (r.deleted === 1 ? "" : "s") + " cleared")),
    resetAll: () => openTypeConfirm("Reset all data",
      "<b>Every order line</b> will be permanently deleted and cutoffs reset to 10:00. This cannot be undone.", RESET_ALL_PHRASE,
      (p) => act(store.resetAll(p), "All order data reset")),
  })[a]?.();
});
document.addEventListener("input", (e) => {
  const f = e.target.closest("[data-filter]");
  if (f) {
    filters[f.dataset.filter] = f.value;
    if (f.dataset.filter === "q") renderTrackKeepFocus();
    else render();
  }
});
document.addEventListener("change", async (e) => {
  const nm = e.target.closest(".i-name");
  if (nm) {
    const row = nm.closest(".item-row");
    const coa = row && row.querySelector(".i-coa");
    if (coa && !coa.value) {
      const s = suggestCoa(nm.value);
      if (s) coa.value = s;
    }
    return;
  }
  const ur = e.target.closest("[data-user-role]");
  if (ur) return setUserRole(ur.dataset.userRole, ur.value);
  const dr = e.target.closest("[data-demo-role]");
  if (dr && store.mode === "demo") {
    await store.setDemoIdentity(null, dr.value);
    await refresh();
    render();
  }
});
function renderTrackKeepFocus() {
  const active = document.activeElement,
    val = active && active.value,
    pos = active && active.selectionStart;
  renderTrack();
  const box = document.querySelector('[data-filter="q"]');
  if (box) {
    box.focus();
    box.value = val;
    try {
      box.setSelectionRange(pos, pos);
    } catch (e) {}
  }
}
$("themeBtn").onclick = () => {
  const n = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("rid_theme", n);
  } catch (e) {}
  render();
};

/* ============================ POLLING ============================ */
// Short polling instead of live sync. Only redraw read-only views, never while
// someone is typing or has a dialog open.
function safeToRedraw() {
  if ($("modalRoot").innerHTML) return false;
  if (!["dashboard", "batch", "track"].includes(view)) return false;
  const a = document.activeElement;
  return !(a && a.matches && a.matches("input,select,textarea"));
}
async function poll() {
  if (state !== "ready" || document.hidden) return;
  await refresh();
  renderSync();
  if (safeToRedraw()) render();
}
setInterval(poll, POLL_MS);
document.addEventListener("visibilitychange", () => !document.hidden && poll());

/* ============================ BOOT ============================ */
async function boot() {
  render();
  const cfg = await fetchConfig();
  // Demo only when the server says it isn't configured — never on a failed
  // request, or people could type real orders into a browser-only queue.
  if (!cfg && !import.meta.env.DEV) {
    state = "error";
    errMsg = "couldn't reach the Vendor Orders service. Check your connection";
    return render();
  }
  store = cfg && cfg.live ? remoteStore : demoStore;
  const saved = savedUser();
  if (!saved || !saved.token) {
    state = cfg && cfg.needsSetup ? "setup" : "signin";
    return render();
  }
  await refresh();
  render();
}
boot();
