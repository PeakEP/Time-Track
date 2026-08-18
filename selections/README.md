# Robins Interiors & Designs — Finish Selections

A guided interior-finish selection app for custom homes. Clients/designers pick
finishes from image cards, some **included** in the base price and some priced
**upgrades**, with discounts and price overrides, then export a branded **PDF**.

Served at **`/selections/`** alongside the other JMRC apps. Built independently
via `scripts/netlify-build.sh` — it does not touch Time Track, Cabinet Designer,
or Aline Designer.

## Run locally

```bash
cd selections
npm install
npm run dev      # http://localhost:5175/selections/
npm run build    # production build into dist/
```

## Features (v1 demo)

- **Designer / Client modes** — Designer sees cost fields, price overrides, and
  discount controls; Client sees a clean selection experience.
- **Included vs. Upgrade** pricing per option, with a live running total.
- **Discounts** — order-level percent or flat dollar, plus per-line price
  overrides (designer mode).
- **Save & reload** — autosaves to the browser, plus a named project library and
  import/export of `.json` project files.
- **PDF export** — branded header, project info, itemized selections with
  thumbnails, totals, discount, notes, and a signature line.

## Replacing the demo catalog with your real data

Everything you select lives in **`src/data/catalog.ts`**. To go live:

1. Replace the `CATALOG` array. Each **category** has `id`, `name`, optional
   `description`, optional `multi` (allow several selections), and `options`.
2. Each **option** has:
   - `name`, optional `description`
   - `pricing`: `"included"` or `"upgrade"`
   - `price`: dollar value (0 for included)
   - `image`: a photo. The demo uses generated `swatch()` placeholders — replace
     with real product photos (see below).
3. Set `DEFAULT_BASE_PRICE` to your standard package price.

### Adding real product photos

Drop image files in `selections/public/` (e.g. `public/finishes/quartz-white.jpg`)
and reference them as `image: "/selections/finishes/quartz-white.jpg"`. They are
converted to PNG at export time so they embed correctly in the PDF.

> Tip: send a spreadsheet (category, option, included/upgrade, price) plus a
> folder of photos and the catalog file can be generated from it directly.

## Branding

PDF branding (company name, tagline, color) is in `src/utils/pdf.ts` (`BRAND`).
UI colors are CSS variables at the top of `src/styles.css`.
