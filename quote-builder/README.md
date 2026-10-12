# Quote Builder

Guided quoting for J.M Robins Construction: renovations, remodels, new shops/garages and custom homes.
A sales rep answers a short interview (or lets the document reader fill it in from drawings and notes),
the pre-configured takeoff tools work out the quantities, everything is priced from the JMRC cost catalog
and the Robins Interiors Square catalog, and the quote exports in the standard JMRC formats:

- **Renovation / remodel** → `RENOVATION QUOTATION` (REN numbering, Munana format): scope by room,
  material schedule, price with HST, inclusions, exclusions, terms, acceptance. Direct-to-client or
  insurance (TPA) variant.
- **Shop / custom home** → the custom-home proposal (CUS numbering, Dunlop format): cover, project
  overview, scope of work, numbered allowances, exclusions, terms & conditions (NB CRA holdback, lien,
  trust, exclusive purchasing), acceptance. Lump sum only — no line pricing on the client copy.

## How it keeps the owner out of the loop (safely)

Prices are never guessed. A line is priced only from the catalog, Square, an owner rate, or a supplier
quote typed on the quote. Anything else stops the quote from being downloaded until the owner approves it:

| Blocks the client copy | Warns |
|---|---|
| Markups not set · a rate not set · no catalog match · "as per drawings" items with no quote · a price typed by hand · margin under the minimum · total over the auto-approve limit | Coverage per unit not confirmed · lines removed by hand · document-reader suggestions not reviewed |

The owner approves from the Review step (Admins only, enforced by the API). An approval holds while the
total stays the same.

## Owner setup (Settings, Admins only)

1. **Cost catalog** — upload the master catalog CSV (`Cost Item Name, Description, Unit, Unit Cost, Cost Code`).
   It's stored in Netlify Blobs, not in this repository (the repository is public). Re-upload whenever prices change.
2. **Square** — set `SQUARE_ACCESS_TOKEN` in Netlify (Site configuration → Environment variables), then
   *Sync from Square now*. Each variation's **Default Unit Cost** is used (never the retail price); JMRC catalog
   lines that name a Square SKU take the live Square cost.
3. **Pricing** — material / labour / sub-trade markups, PM fee (15% on shops & homes), contingency, HST,
   minimum margin, auto-approve limit.
4. **Rates** — your cost per unit for labour, sub-trades and allowances (blank = not set).
5. **Takeoff tools** — pin the exact catalog item each tool uses and confirm the coverage per unit.
6. **Company & terms** — signer and the new-build payment schedule.

The document reader needs `ANTHROPIC_API_KEY` in Netlify. Give people access in Suite Admin → Quote Builder
(off by default, because the app shows costs to whoever can open it).

## Documents and client folders

- Drop PDFs, photos and text notes on the *Notes & drawings* step (kept in the browser with the quote).
- **Connect the client folder** (Chrome/Edge): pick files from it, and the finished proposal is saved back into
  its `Quotes/` subfolder.
- **Read documents & suggest answers** uploads the selected files (up to 24 MB) to
  `netlify/functions/quote-builder-read-background`, which asks Claude to answer the interview questions with a
  source for every answer. Suggestions are only applied when the rep clicks *Use*.

## Code

| Path | What |
|---|---|
| `src/engine/takeoff.ts` | Answers → quantity lines (JMRC takeoff standard: 16" o.c., 3-stud corners, slope factors, net/gross rules) |
| `src/engine/pricing.ts` | Overrides, markups, PM fee, HST, and the review rules |
| `src/engine/catalog.ts` | Catalog CSV import, search, Square merge |
| `src/data/defaultSettings.ts` | Takeoff tools and the rate list (no dollar figures) |
| `src/data/questions.ts` | The interview |
| `src/utils/proposalDocx.ts` | REN quotation and CUS proposal (.docx) |
| `../netlify/functions/quote-builder-api/` | API: catalog, settings, quotes, numbering, approvals, uploads |
| `../netlify/shared/square-catalog.mjs` | Square catalog → items |
| `../netlify/shared/quote-reader.mjs` | Document reader prompt + Claude call |

```
npm install
npm run dev        # local mode: no server, everything kept in this browser
npm test           # engine tests
npm run build
```

API tests run from the repository root with the rest of the suite: `npm run test:vendor-orders`.

Known limits: "Hide costs from sales reps" hides them on screen only (pricing runs in the browser, so the
catalog costs are sent to everyone with access). Attachments live in the browser that added them; use the
client folder to share files between people.
