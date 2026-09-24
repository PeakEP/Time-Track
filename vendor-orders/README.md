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
| NextAuth + Entra ID (M365) | Replaced by **name + PIN**. A Purchaser issues each person a random 6-digit PIN. Roles are stored on the server, not chosen by the user |
| `claude.use('downloads')` | A normal browser CSV download (`buildCSV`, ported as-is) |
| localStorage name/role modal | Replaced by the name + PIN sign-in, with a server session token |

## Turning it on (one-time)

Until a database is connected, the page runs in **demo mode**: the full UI works, but data
lives only in that browser. A banner says so.

1. **Database.** In Netlify, enable Netlify DB, or set `DATABASE_URL` to any Postgres 13+
   connection string. No migration step is needed.
2. Redeploy, then **open `/vendor-orders/` straight away**. The first screen is
   *First-time setup*: enter your name to become the first Purchaser, and you'll be shown
   your PIN. Setup only appears while no Purchaser with a PIN exists.
3. Under **Settings → Team & roles**, add each employee. Each one gets a PIN to hand out.

## Signing in (name + PIN)

- A Purchaser adds a person under **Settings → Team & roles**, and the system generates a
  random 6-digit PIN. The PIN is shown **once**. Only a salted hash is stored, so nobody can
  look it up later.
- The person signs in with their name and PIN. Capitals and extra spaces in the name don't
  matter. The device remembers the name, so next time only the PIN is needed. A sign-in
  lasts 30 days on that device, and **switch user** signs out.
- **Reset PIN** issues a new PIN and signs that person out everywhere. Use it for a
  forgotten or leaked PIN. **Deactivate** blocks sign-in and also ends their sessions.
- Five wrong PINs in a row lock that name for 15 minutes. A PIN reset unlocks it.
- Names that aren't on the team can't sign in.

A 6-digit PIN with lockout is fine for an internal tool, but it isn't bank-grade.
Microsoft 365 sign-in was built earlier and can be restored from git history if needed.

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

1. Sign-in is name + PIN issued by a Purchaser. Microsoft 365 sign-in was built and then
   removed at Mike's request. It can be restored if needed.
2. Vendor categories (Tosca, Marathon, Avide, Richmond, MSI, Sarana, Agua, Maxxmar,
   Dainolite) were partly assumed. They can be fixed in Settings.
3. Job code is still free text. Linking it to a shared job list is a later step.
4. Interior Selections → order queue hook and QuickBooks push are not built (post-v1).
