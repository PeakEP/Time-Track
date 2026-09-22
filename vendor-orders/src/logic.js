// Business logic ported from the Vendor Order Consolidation prototype
// (docs/artifact-reference.html). Framework-agnostic: no DOM, no storage.
import COST_SEED from "../seed/cost_codes.json" with { type: "json" };

export const TZ = "America/Halifax";
export const UNITS = ["ea", "box", "sq ft", "sheet", "lin ft", "pcs", "set", "roll", "pair"];
export const STATUSES = ["pending", "ready", "ordered", "received", "backordered"];

// { phases:{code:name}, codes:{code:{name,phase}}, hints:{keyword:code} }
export const COST = {
  phases: Object.fromEntries(Object.entries(COST_SEED.phases).map(([k, v]) => [k, v.name])),
  codes: Object.fromEntries(
    Object.entries(COST_SEED.codes).map(([k, v]) => [k, { name: v.name, phase: v.phase }]),
  ),
  hints: COST_SEED.keyword_hints,
};

export function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
export function money(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function lineTotal(o) {
  return (Number(o.qty) || 0) * (Number(o.cost) || 0);
}
export function coaName(code) {
  const c = COST.codes[code];
  return c ? c.name : "";
}
export function phaseName(code) {
  const c = COST.codes[code];
  return c ? COST.phases[c.phase] || "" : "";
}
// Longest keyword hit wins. No hit → "" (policy: check with Susan, never guess).
export function suggestCoa(text) {
  if (!text) return "";
  const t = " " + text.toLowerCase() + " ";
  let best = "",
    bestLen = 0;
  for (const kw in COST.hints) {
    if (t.includes(kw) && kw.length > bestLen) {
      best = COST.hints[kw];
      bestLen = kw.length;
    }
  }
  return best;
}

/* ---------------- time (America/Halifax, DST-aware) ---------------- */

// Wall-clock parts of `date` in `tz`.
function zonedParts(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd };
}
function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}
// UTC instant for a wall-clock time in `tz`.
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0);
  let t = wall - tzOffsetMs(new Date(wall), tz);
  t = wall - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

// Next cutoff instant for an order day {weekday, cutoff:'HH:MM', timezone}.
export function nextCutoff(day, now = new Date()) {
  if (!day) return null;
  const tz = day.timezone || TZ;
  const [h, m] = String(day.cutoff).split(":").map(Number);
  const p = zonedParts(now, tz);
  let diff = (day.weekday - p.wd + 7) % 7;
  for (let i = 0; i < 2; i++) {
    const base = new Date(Date.UTC(p.y, p.mo - 1, p.d + diff));
    const t = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, m, tz);
    if (t > now) return t;
    diff += 7;
  }
  return null;
}
export function fmtCountdown(ms) {
  if (ms <= 0) return null;
  const m = Math.floor(ms / 60000);
  const days = Math.floor(m / 1440),
    hrs = Math.floor((m % 1440) / 60),
    mins = m % 60;
  if (days > 0) return days + "d " + hrs + "h " + mins + "m";
  if (hrs > 0) return hrs + "h " + mins + "m";
  return mins + "m";
}
export function fmtDate(d, tz = TZ) {
  return (
    d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: tz }) +
    " " +
    d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: tz })
  );
}
// YYYY-MM-DD of an instant in Halifax.
export function localDate(iso, tz = TZ) {
  if (!iso) return "";
  const p = zonedParts(new Date(iso), tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
export function todayStr() {
  return localDate(new Date().toISOString());
}

/* ---------------- PO export ---------------- */

export const CSV_COLUMNS = [
  "PO #", "Cost Code", "Cost Code Name", "Phase", "Job", "Product", "SKU", "Description",
  "Qty", "Unit", "Needed By", "Unit Cost", "Line Total", "Notes",
];

export function buildCSV(name, dayLabel, lines, generatedBy) {
  const q = (s) => {
    s = String(s == null ? "" : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = [
    `# Purchase Order — ${name}`,
    `# Robins Interiors & Design (J.M Robins Construction Ltd.)`,
    `# Order day: ${dayLabel}`,
    `# Generated: ${new Date().toLocaleString("en-CA", { timeZone: TZ })} by ${generatedBy}`,
    `# PO coding per OPS-POL-001`,
    "",
  ];
  const body = lines.map((o) =>
    [
      o.po, o.coa, coaName(o.coa), phaseName(o.coa), o.jobCode, o.productName, o.sku, o.description,
      o.qty, o.unit, o.neededBy, Number(o.cost || 0).toFixed(2), lineTotal(o).toFixed(2), o.notes,
    ]
      .map(q)
      .join(","),
  );
  const sub = lines.reduce((s, o) => s + lineTotal(o), 0);
  const subRow = Array(CSV_COLUMNS.length).fill("");
  subRow[11] = "SUBTOTAL (ex. HST)";
  subRow[12] = sub.toFixed(2);
  return (
    head.join("\n") + "\n" + CSV_COLUMNS.map(q).join(",") + "\n" + body.join("\n") + "\n" +
    subRow.map(q).join(",") + "\n"
  );
}
