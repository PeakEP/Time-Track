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
| Postgres + `schema.sql` | **Netlify Blobs**, the storage built into every Netlify site, so there's nothing to set up. Vendors, cutoffs and cost codes seed themselves on first use (`storage.mjs`) |
| NextAuth + Entra ID (M365) | Replaced by **name + PIN**. A Purchaser issues each person a random 6-digit PIN. Roles are stored on the server, not chosen by the user |
| `claude.use('downloads')` | A normal browser CSV download (`buildCSV`, ported as-is) |
| localStorage name/role modal | Replaced by the name + PIN sign-in, with a server session token |

## Turning it on (one-time)

There's nothing to configure. On Netlify the tool is live as soon as it deploys.

1. **Open the suite home page (`/`) straight away** after the first deploy. The first
   screen is *First-time setup*: enter your name to become the suite Admin (and a
   Purchaser), and you'll be shown your PIN. Setup only appears while no Admin with a PIN
   exists.
2. On **Suite Admin** (`/admin/`), add each employee and choose their Vendor Orders role.
   Each one gets a PIN to hand out.

**Where the data lives:**

- The whole order book is one JSON document in the `vendor-orders` Blobs store.
- Every save is a compare-and-swap on that document's version, retried on conflict, so
  two people saving at the same moment never overwrite each other. A test covers this.
- The audit log is written as separate entries under `events/`.
- Deploy previews and branch deploys use a separate store (`vendor-orders-deploy-preview`,
  etc.), so testing never touches real orders.
- Outside Netlify, such as plain `vite dev`, the page runs in **demo mode** with
  browser-only data, and a banner says so.

A single document suits a team this size, even with thousands of lines. If it ever grows
very large, **Clear ordered/received history** trims it.

## Signing in (name + PIN)

Sign-in is shared by the whole JMRC suite. See `admin/README.md`.

- A suite Admin adds a person on **Suite Admin** (`/admin/`), and the system generates a
  random 6-digit PIN. The PIN is shown **once**. Only a salted hash is stored, so nobody can
  look it up later. The same page sets each person's Vendor Orders role (Sales rep,
  Purchaser, or no access) and their other apps.
- The person signs in once on the suite home page with their name and PIN. Capitals and
  extra spaces in the name don't matter. A sign-in lasts 30 days on that device and covers
  every app they can use. **Switch user** signs out of the whole suite.
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
- Every change is written to an audit log (`events/` in the Blobs store).
- Live sync is replaced by a 30-second refresh. The refresh never redraws a form you are
  typing in.

## Development

```bash
cd vendor-orders && npm install && npm run dev   # UI in demo mode at :5175
npm install && npm run test:vendor-orders        # from repo root; logic + API tests
                                                 # (API tests use a local Blobs server)
```

To run the UI against the real API locally, use `netlify dev`. Vite proxies `/api` to it.

## Still open (from the brief)

1. Sign-in is name + PIN issued by a Purchaser. Microsoft 365 sign-in was built and then
   removed at Mike's request. It can be restored if needed.
2. Vendor categories (Tosca, Marathon, Avide, Richmond, MSI, Sarana, Agua, Maxxmar,
   Dainolite) were partly assumed. They can be fixed in Settings.
3. Job code is still free text. Linking it to a shared job list is a later step.
4. Interior Selections → order queue hook and QuickBooks push are not built (post-v1).
