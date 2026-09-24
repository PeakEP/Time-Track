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
| NextAuth + Entra ID (M365) | **Dropped for now.** People sign in by typing their name, an honour system like the prototype. Roles are stored on the server, not chosen by the user |
| `claude.use('downloads')` | A normal browser CSV download (`buildCSV`, ported as-is) |
| localStorage name/role modal | Kept the name part. The role picker was removed, and roles live in `app_users` |

## Turning it on (one-time)

Until a database is connected, the page runs in **demo mode**: the full UI works, but data
lives only in that browser. A banner says so.

1. **Database.** In Netlify, enable Netlify DB, or set `DATABASE_URL` to any Postgres 13+
   connection string. No migration step is needed.
2. Optional: set `PURCHASER_NAMES` to a comma-separated list of names that are always
   Purchasers, e.g. `Michael Robins`.
3. Redeploy.

## Signing in

People type their name, and the device remembers it ("switch user" changes it). Names are
matched without regard to capitals or extra spaces, so "mike robins" and "Mike Robins" are
the same person. New names start as **Sales rep**. The **first name ever to sign in**
becomes a Purchaser, so someone can always promote others under **Settings → Team &
roles**. Purchasers can also deactivate a name.

There is no password. Anyone with the link can use the tool under any name. Roles can't be
self-assigned, but a person could type a Purchaser's name. If that ever matters,
Microsoft 365 sign-in can go back in (see git history).

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

1. Sign-in is name-only for now (no passwords). Microsoft 365 sign-in was built and then
   removed at Mike's request. It can be restored if needed.
2. Vendor categories (Tosca, Marathon, Avide, Richmond, MSI, Sarana, Agua, Maxxmar,
   Dainolite) were partly assumed. They can be fixed in Settings.
3. Job code is still free text. Linking it to a shared job list is a later step.
4. Interior Selections → order queue hook and QuickBooks push are not built (post-v1).
