# Vendor Order Consolidation — Production Build Brief

**For:** Claude Code, building this into the Robins Interiors & Design / JMRC main app
**Prepared:** 2026-09-22
**Owner:** Mike Robins (michael@robinsinvestments.com)

---

## 0. TL;DR for Claude Code

There is a **working, fully-specified prototype** of a weekly vendor order-consolidation tool
(`reference/artifact-reference.html`). It currently runs as a claude.ai Artifact using that
platform's runtime storage (`claude.use('db')`) and file-save (`claude.use('downloads')`)
capabilities. **Those two things are the only parts that do not carry over.** Everything else —
the UI, the workflow, the OPS-POL-001 PO cost-coding logic, the CSV/PO export, the weekly
cutoff/batching model — is production-ready logic to port.

Your job: rebuild it as a module inside the existing **Next.js** app, backed by the team's
**own server + Postgres database**, gated by **Microsoft 365 sign-in**, sitting alongside the
Cabinet Designer and Interior Selections tools under a shared shell.

Do **not** treat the reference file as throwaway — port its behaviour faithfully. It is the spec.

---

## 1. What the tool does (business logic — do not change without Mike's sign-off)

Robins Interiors buys from a fixed roster of vendors. Instead of many one-off orders, reps drop
line items into a **shared queue** as jobs get approved; each vendor has a **weekly cutoff**;
after cutoff a Purchaser pulls that vendor's ready lines into **one batched PO** — one shipment
per vendor per week, saving freight.

**Weekly cutoff calendar (current, must stay editable by Purchasers):**

| Order day | Default cutoff | Vendors |
|---|---|---|
| Tuesday | Tue 10:00 (America/Halifax) | Avide Flooring, Richmond Flooring, MSI, Sarana Tile, Tosca |
| Thursday | Thu 10:00 (America/Halifax) | Agua, Maxxmar, Dainolite, Marathon |

Cabinets (Oppein/Aline/Divine/Canada Kitchens) and Prosol were **deliberately excluded** —
cabinets run through the Roji/2020 design path, and Prosol has its own multi-PO cart. Do not
re-add them.

**Order lifecycle (status machine):**

```
pending  ──approve──▶ ready ──mark ordered──▶ ordered ──receive──▶ received
(await approval        (in this                (PO placed,           (delivered)
 + deposit)             week's batch)           conf# + ETA)
                                                    └──backorder──▶ backordered ──receive──▶ received
```

**Hard business rules baked in (keep them):**
- **No line joins a batch until `approved` is checked** (JMRC rule: no PO before approval + deposit).
- **Dealer/unit cost is internal** — never shown on anything client-facing (Prosol rule). It appears
  only in the Purchaser-facing batch view and the PO export.
- **Cost code (COA) is required per line item** — auto-suggested from the product name via the
  OPS-POL-001 keyword table; if nothing fits, the rule is *stop and check with Susan (Accounting)* —
  never guess a code.
- **PO # is entered manually** by the person issuing it. Earlier iterations auto-built PO strings
  from `[Purchaser][Project]-[COA]-[Seq]`; Mike removed that because jobs change constantly and PO
  issuance is a manual, controlled act. **Do not re-introduce auto-generated PO strings.** Keep the
  cost-code (COA) picker per item — that part stayed.

**Roles:**
- **Sales rep** — add/edit their own lines; cannot place batch orders or edit cutoffs.
- **Purchaser** — everything reps can do, plus mark batches ordered, receive/backorder, edit cutoffs,
  and (new for prod, see §6) reset/clear.

---

## 2. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js app (existing) — shared shell / nav / M365 session  │
│                                                              │
│   /tools/cabinet-designer     (existing)                     │
│   /tools/interior-selections  (existing)                     │
│   /tools/vendor-orders    ◀── NEW: this module               │
│        ├─ Dashboard        (per-day vendor cards + countdown) │
│        ├─ New order        (multi-item form, manual PO, COA)  │
│        ├─ Track orders     (filter/search, edit, delete)      │
│        ├─ Vendor batch     (build/export/mark ordered)        │
│        └─ Cutoff settings  (Purchaser only)                   │
└───────────────┬──────────────────────────────────────────────┘
                │  authenticated API routes (server)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Own server + Postgres                                        │
│   tables: orders, vendors, cutoffs, cost_codes, app_users     │
│   auth:   Microsoft 365 (Entra ID / Azure AD) via NextAuth    │
└─────────────────────────────────────────────────────────────┘
```

**Recommended libraries** (adjust to match the existing app's conventions — match, don't fight):
- Auth: **NextAuth.js** (Auth.js) with the **Microsoft Entra ID** provider (or MSAL if the app
  already uses it). See §4.
- DB access: whatever the other tools use (Prisma is the safe default). Schema in `schema.sql`.
- Realtime: the artifact had live multi-user sync. In prod this is **not** required for launch —
  short polling (e.g. refetch the active vendor queue every 20–30s) or a manual refresh is fine.
  Add websockets/SSE later only if reps ask for it.

---

## 3. The capability swap (the ONLY parts that don't port directly)

The reference file calls two claude.ai runtime capabilities. Replace each with a server call:

| Reference (claude.ai only) | Production replacement |
|---|---|
| `db = await claude.use('db')` → `db.collection('orders').onSnapshot(...)`, `.add()`, `.doc(id).update()/.delete()` | REST/RPC API routes hitting Postgres — see §5. Swap the snapshot subscription for a fetch on load + poll. |
| `db.doc('config/schedule')` | `cutoffs` table, read on load, written by `PATCH /api/cutoffs` (Purchaser only). |
| `downloads = await claude.use('downloads')` → `downloads.save({filename, data})` | Standard browser download: build the CSV string (logic in `buildCSV`, port as-is), serve it as a `Blob` with `Content-Disposition: attachment`, or generate server-side at `GET /api/batch/:vendor/export.csv`. |
| `localStorage` identity (name + role) | Real session from M365 (§4). Delete the honour-system name/role modal entirely. |

**Everything else in the reference `<script>` is portable business logic** — lift these functions
essentially verbatim (they're framework-agnostic): `nextCutoff`, `fmtCountdown`, `suggestCoa`
(COA auto-suggest from the 220-keyword table), `coaName`, `phaseName`, `lineTotal`, `money`,
`buildCSV`, and the status transitions (`approve`/`receive`/`backorder`/`markOrdered`).

---

## 4. Authentication — Microsoft 365

Staff sign in with their existing Robins/Microsoft 365 accounts (tenant for
robinsinvestments.com). No new passwords.

1. Register an app in **Entra ID (Azure AD)** for the tenant → client ID + secret + tenant ID.
   Redirect URI: `https://<yourdomain>/api/auth/callback/azure-ad`.
2. NextAuth Microsoft Entra ID provider; store `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`
   in server env (never client-side).
3. On first sign-in, upsert an `app_users` row keyed by the M365 object id (`oid`) / email.
4. **Role mapping** (`sales_rep` | `purchaser`): simplest is a `role` column on `app_users`,
   defaulting to `sales_rep`, that an admin flips. If the tenant has an Entra security group like
   `RID-Purchasers`, map group membership → `purchaser` instead so it's managed in the directory.
   Confirm with Mike which he prefers before wiring it.
5. Gate the whole `/tools/vendor-orders` route behind an authenticated session; gate Purchaser-only
   API routes (mark ordered, receive, cutoffs, reset) with a server-side role check — **never trust
   a client role flag**.

Reuse whatever session/nav the Cabinet Designer and Interior Selections tools already use — this
should feel like one app, one login, not a bolt-on.

---

## 5. Data model

Full DDL in `schema.sql`. Summary:

- **`orders`** — one row per **line item** (a multi-item order shares an `order_group_id` so
  "Delete entire order" and grouped display work). Carries: vendor, `po` (manual text), `job_code`,
  client, product_name, sku, description, `coa` (cost code), qty, unit, `unit_cost` (internal),
  needed_by, status, notes, created_by (user id), ordered_by, confirmation, eta, timestamps.
- **`vendors`** — name, order_day (`tue`/`thu`), category, active. Seed from §1 table. Making this a
  table (not a hardcoded array like the artifact) is the main upgrade — Mike wanted vendors editable
  without a code change.
- **`cutoffs`** — order_day, cutoff_time, timezone (`America/Halifax`). Purchaser-editable.
- **`cost_codes`** — code, name, phase, phase_name. Seed from `seed/cost_codes.json` (66 codes,
  9 phases). The 220 keyword→code hints drive `suggestCoa`; keep them in a `cost_code_hints` table
  or a shipped JSON constant — either is fine, they change rarely.
- **`app_users`** — m365_oid, email, display_name, role, created_at.

Money: store `unit_cost` as `numeric(12,2)`. All times UTC in the DB; render in `America/Halifax`.

**Cost basis for the COA auto-suggest and export lives in `seed/` — do not hand-retype it.**
Seed the DB from those JSON files. They are the authoritative OPS-POL-001 tables (same source the
`jmrc-purchase-order` skill uses), so the app stays consistent with how POs are coded everywhere
else in the business.

---

## 6. New for production (not in the prototype)

- **Reset / clear** (Mike asked where this was): add a **Purchaser-only "Clear ordered/received
  history"** and a separate **"Reset all data"** action in Cutoff settings, each behind a
  type-to-confirm prompt. Never expose either to reps. Keep the existing per-line **Delete** and
  **Delete entire order** (already in the reference).
- **Audit trail**: log who marked a batch ordered and when (`ordered_by`, `ordered_at` already
  modelled). Consider an `order_events` table if Mike wants full history.
- **Integration hooks with the other tools** (nice-to-have, confirm priority):
  - **Job codes**: the order form's `job_code` is free text today. If the Cabinet Designer /
    Interior Selections tools already carry a job/project identifier, share that source so a rep
    picks a job rather than typing it.
  - **Interior Selections → order queue**: a selection sheet (flooring/tile/fixtures chosen for a
    client) is exactly what becomes a vendor order. A "Send to order queue" button on a finalized
    selection could pre-fill New order lines. High-value, do after core launch.
  - **QuickBooks**: the PO export already carries COA + phase. A later step can push ordered POs to
    QBO instead of CSV. Out of scope for v1.

---

## 7. Launch checklist

**Build**
- [ ] Scaffold `/tools/vendor-orders` route + shared shell/nav entry alongside the other two tools
- [ ] Postgres schema applied (`schema.sql`); seed vendors, cutoffs, cost_codes + hints from `seed/`
- [ ] Port UI + business logic from `reference/artifact-reference.html` (keep JMRC branding: indigo
      `#2C327C`, cyan `#49C1C4`, charcoal `#333333`, Montserrat, logo already inline in reference)
- [ ] Replace `claude.use('db')` with authenticated API routes (§3, §5); replace `downloads` with
      a real file download; delete the localStorage identity modal
- [ ] M365 sign-in wired; server-side role checks on all Purchaser actions
- [ ] Per-line + whole-order delete retained; Purchaser reset/clear added (§6)

**Pre-launch**
- [ ] Cutoff times confirmed with Mike and set in `cutoffs`
- [ ] Vendor roster confirmed (categories were partly assumed — Tosca, Marathon, Avide, Richmond,
      MSI, Sarana, Agua, Maxxmar, Dainolite; verify each)
- [ ] Real staff added to `app_users` with correct roles (at least one Purchaser)
- [ ] Test a full cycle: add multi-item order → approve → build batch → export PO → mark ordered →
      receive; confirm COA auto-suggest and the CSV columns (PO#, Cost Code, Cost Code Name, Phase,
      Job, Product, SKU, Description, Qty, Unit, Needed By, Unit Cost, Line Total, Notes)
- [ ] Verify internal `unit_cost` never renders anywhere a client could see
- [ ] Timezone correctness across the Tue/Thu cutoffs (America/Halifax, incl. DST)
- [ ] Backup/retention on the Postgres DB

**Launch**
- [ ] Soft-launch to the sales team with a one-page how-to (Mike to circulate)
- [ ] Watch the first two weekly cycles; tune cutoffs/vendors as needed

---

> **Note (repo copy):** this is the original handoff brief. See `../README.md` for how it was
> built on this Netlify site. Data is stored in Netlify Blobs (`netlify/functions/vendor-orders-api/storage.mjs`),
> and the seed files are in `../seed/`.

## 8. Files in this handoff

```
INTEGRATION.md                     ← this brief (the spec + build order)
schema.sql                         ← Postgres DDL for all tables
reference/artifact-reference.html  ← the working prototype = behavioural spec (port, don't discard)
seed/cost_codes.json               ← 66 OPS-POL-001 cost codes + 9 phases + 220 keyword hints
seed/employee_ids.json             ← purchaser lookup (for app_users seeding / reference)
seed/project_codes.json            ← project/location codes (reference; not required by the order form
                                      anymore since PO is manual, but kept for QBO coding continuity)
```

**Open questions to confirm with Mike before/while building:**
1. Role source — a `role` column an admin flips, or an Entra security group?
2. Vendor category labels — verify the assumed ones.
3. Job code — free text, or pulled from the Cabinet Designer / Interior Selections job identifier?
4. Priority of the Interior Selections → order-queue hook (v1 or later?).
