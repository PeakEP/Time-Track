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

## How a quote gets finished without the owner

Costs, margins and sell prices are visible to everyone with access (sales reps and estimators).

Prices are never guessed. A line is priced from the master catalog, Square, the supplier cabinet catalogs
(list less dealer discount), a company rate, or a supplier quote. Anything missing becomes a question in
**To finish this quote** that the salesperson answers right there:

- *What does flooring install cost you per SF?* (rate not set — answered for this quote; an Admin can save it as the company rate)
- *Kitchen cabinets: XYZ99 isn't in the Oppein catalog* (pick a suggested SKU or enter the cost)
- *Vanity is priced as per drawings* (pick a priced product or enter the supplier price)
- *Which cabinets for the Kitchen?* (price them on the Cabinets step)
- *What margin on labour?* (no company margin yet)

Answers are flagged on the internal cost breakdown. Only two things need the owner: an overall margin under
the company minimum, or a total over the approval limit (both set in Settings).

## Labour (hours) and margins

Labour is estimated in **hours** and billed at your hourly rate — JMRC standard **$40/hr cost → $80/hr sell**
(50% margin), labourer **$32.50 → $65**. Each takeoff quantity (SF/LF/EA) is turned into hours with a
per-task productivity (seeded from the Brent Smith and Bezzant worksheets — e.g. shower tile 4 SF/hr, flooring
23 SF/hr, drywall 23 SF/hr, painting 200 SF/hr/coat), so labour always prices and is never a question. The
owner tunes the hourly rate and any productivity in Settings → Labour.

Everything else is priced by gross margin on the selling price: sell = cost ÷ (1 − margin). Order of
precedence: a margin typed on the line → the quote's category margin → the product cost-code margin → the
company category margin. Company defaults, from JMRC's jobs: building materials 20%, finish products 50%,
cabinets 50%, labour 50%, sub-trades 17%, allowances 20%. Uploading the master catalog workbook (.xlsx)
offers per-cost-code margins worked out from its **Retail Reference** tab (median retail ÷ cost per code).

## Cabinets

The Cabinets step prices Aline, Oppein and Divine orders from the same data files as the cabinet-quoting skill
(`aline.json`, `oppein.json`, `divine.json`, uploaded in Settings): paste the design's SKU list or search the
catalog, pick colour / door style / box, and each line is priced at list less that supplier's dealer discount
(read from the file). Divine assembly and freight are added. A room with a cabinet order no longer carries
the per-LF cabinet allowance or the default vanity. The document reader also pulls cabinet SKU lists out of
uploaded designs.

## Owner setup (Settings, Admins only)

The company defaults (labour rate, margins, productivity) are built in, so the tool works once the catalog
is loaded. To set up or tune:

1. **Cost catalog** — upload the master cost catalog workbook (.xlsx) or a CSV export. This is the **single
   source** for material and finish costs (the Robins Interiors store items are already merged into it — no
   Square sync needed). Stored in Netlify Blobs, not in this repository (it's public). Accept the
   product-code margins it offers from the workbook's Retail Reference tab.
2. **Cabinet catalogs** — upload `aline.json`, `oppein.json`, `divine.json` from the cabinet-quoting skill.
3. **Labour** — confirm the hourly rate ($40/$80, labourer $65) and tune any task's productivity.
4. **Margins** — the six category defaults, PM fee, contingency, HST, optional minimum margin and approval limit.
5. **Sub-trade & allowance rates** — optional; blank ones are asked of the salesperson on each quote (they
   have the sub's quote), which is usually what you want.
6. **Takeoff tools** — pin the exact catalog item each tool uses and confirm the coverage per unit.
7. **Company & terms** — signer and the new-build payment schedule.

The document reader needs `ANTHROPIC_API_KEY` in Netlify. Quote Builder access is on for staff by default
(Suite Admin → Quote Builder to turn someone off).

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
| `src/engine/pricing.ts` | Overrides, margins, PM fee, HST, open questions and the review rules |
| `src/engine/cabinets.ts` | Aline / Oppein / Divine pricing (same rules as the cabinet-quoting skill) |
| `src/data/defaultSettings.ts` | Company defaults: labour rate, margins, labour productivity, takeoff tools |
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

Known limits: attachments live in the browser that added them; use the
client folder to share files between people.
