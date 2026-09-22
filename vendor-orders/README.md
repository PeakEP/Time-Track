# Vendor Orders — weekly vendor order consolidation

Robins Interiors & Design's shared vendor order queue. Reps add line items as jobs are
approved. Each vendor has a weekly cutoff (Tue/Thu, 10:00 Atlantic). After the cutoff a
Purchaser pulls that vendor's ready lines into one batched PO. Served at `/vendor-orders/`
next to the Cabinet Designer and Aline Designer.

The behaviour comes from the handoff in [`docs/`](docs/) (`INTEGRATION.md` plus the working
prototype `artifact-reference.html`). The brief assumed a Next.js app. This site is static
Netlify + Vite, so the module is built this way instead:

| Brief | Built as |
|---|---|
| Next.js route `/tools/vendor-orders` | Vite app → `/vendor-orders/` (same pattern as the other two tools) |
| Next.js API routes | One Netlify Function, `netlify/functions/vendor-orders-api/`, at `/api/vendor-orders/*` |
| Postgres + `schema.sql` | Any Postgres through `DATABASE_URL` (Netlify DB / Neon works). The function creates its tables and seeds vendors, cutoffs and cost codes on first use (`db.mjs`) |
| NextAuth + Entra ID | MSAL in the browser. The function verifies the Microsoft ID token (signature, audience, tenant) on every request. No client secret is needed |
| `claude.use('downloads')` | A normal browser CSV download (`buildCSV`, ported as-is) |
| localStorage name/role modal | Removed. Name comes from M365, and the role is stored in `app_users` |

## Turning it on (one-time)

Until these are set, the page runs in **demo mode**: the full UI works, but data lives only
in that browser. A banner says so.

1. **Database.** In Netlify, enable Netlify DB, or set `DATABASE_URL` to any Postgres 13+
   connection string. No migration step is needed.
2. **Microsoft 365 app registration** (Entra admin center → App registrations → New):
   - Supported account types: *this organizational directory only*.
   - Platform: **Single-page application**. Redirect URI:
     `https://<your-site>/vendor-orders/`. Add one per domain, e.g. the production domain
     plus any deploy preview you want to test. Entra doesn't accept wildcards here.
   - Copy the **Application (client) ID** and **Directory (tenant) ID**.
3. **Netlify environment variables:**

   | Variable | Value |
   |---|---|
   | `MS_CLIENT_ID` | Application (client) ID |
   | `MS_TENANT_ID` | Directory (tenant) ID. Must be the GUID, not the domain |
   | `DATABASE_URL` | Postgres connection string. Not needed if you use Netlify DB (`NETLIFY_DATABASE_URL`) |
   | `PURCHASER_EMAILS` | Comma-separated M365 emails that are always Purchasers, e.g. `michael@robinsinvestments.com` |

4. Redeploy. Staff sign in with their work accounts and start as **Sales rep**. Purchasers
   promote others under **Settings → Team & roles**.

## Roles (enforced server-side in `src/rules.js` + the function)

- **Sales rep**: add orders. Edit, approve or delete *their own* lines while they are pending
  or ready.
- **Purchaser**: everything, plus mark batches ordered, receive/backorder, edit cutoffs,
  manage vendors and team roles, and **Clear ordered/received history** / **Reset all data**
  (both need a typed confirmation).

## Business rules kept from the prototype

- No line joins a batch until "Approved & deposit received" is checked.
- The PO # is typed in by hand. POs are never auto-generated.
- A cost code (COA) is required on every line. It is auto-suggested from the product name
  using the OPS-POL-001 keyword table (`seed/cost_codes.json`). No match means no guess:
  check with Susan.
- Unit cost is internal. It appears only in the batch view and the PO export, and no page
  is client-facing.
- The CSV columns are: PO #, Cost Code, Cost Code Name, Phase, Job, Product, SKU,
  Description, Qty, Unit, Needed By, Unit Cost, Line Total, Notes.

Changes from the prototype:

- Cutoffs are computed in **America/Halifax**, including DST. The prototype used the
  viewer's own clock.
- Vendors are editable in Settings instead of hardcoded.
- Every change is written to an `order_events` audit table.
- Live sync is replaced by a 30-second refresh. The refresh never redraws a form you are
  typing in.

## Development

```bash
cd vendor-orders && npm install && npm run dev   # UI in demo mode at :5175
npm install && npm run test:vendor-orders        # from repo root; logic tests
TEST_DATABASE_URL=postgres://… npm run test:vendor-orders   # + API tests (wipes that DB)
```

To run the UI against the real API locally, use `netlify dev`. Vite proxies `/api` to it.

## Still open (from the brief)

1. Role source: this uses the `role` column plus `PURCHASER_EMAILS`. An Entra security group
   could replace it later.
2. Vendor categories (Tosca, Marathon, Avide, Richmond, MSI, Sarana, Agua, Maxxmar,
   Dainolite) were partly assumed. They can be fixed in Settings.
3. Job code is still free text. Linking it to a shared job list is a later step.
4. Interior Selections → order queue hook and QuickBooks push are not built (post-v1).
