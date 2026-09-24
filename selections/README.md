# Robins Interiors & Design — Finish Selections

A guided interior-finish selection app for custom homes. A designer or client walks
through finish categories, picks options from image cards — some **included** in the base
price, some priced **upgrades** — with discounts and per-line overrides, then exports a
branded **PDF**.

Built in the **JMRC cabinet-designer house style**: React 18 + Vite + TypeScript, a single
flat **Zustand** store (with undo/redo and namespaced-localStorage autosave), one global
`styles.css` token system, a runtime catalog fetched from `public/`, and a `jsPDF` +
`jspdf-autotable` export. Deploys under **`/selections/`** alongside the other JMRC apps.

## Online: staff and client sign-in

On the live site (Netlify), everyone signs in with a **name + PIN** on the suite home
page. The page gate sends anyone who isn't signed in there first, then back here.

- **Staff** use their suite name + PIN (one team list for the suite, managed on
  **Suite Admin**, `/admin/`). Staff whose Finish Selections access is set to *Designer*
  get the designer view and **Projects → Client projects**.
- **New client project** creates a shared project plus a sign-in for the client. It shows
  the client's PIN **once**, a link that pre-fills their name, and a ready-to-send message.
  From the same list, staff can reissue a PIN (🔑), turn a client's access off or on (⏻),
  or delete a project. Suite Admin also lists every client sign-in, with the same
  reissue and on/off controls.
- **Clients** see only their own project, locked to the **client view**. They can't open
  any other app in the suite. The Designer
  toggle and Projects button are hidden, and the project details are read-only. They can
  pick and change selections and quantities, and the server ignores anything else they send.
- Changes save automatically and show up for the other side within about 15 seconds. If
  the designer and the client edit at the same moment, both sets of changes are kept: saves
  are three-way merged on the server.
- 5 wrong PINs lock that name for 15 minutes. Reissuing a PIN, or turning access off,
  signs the client out everywhere.

Data lives in Netlify Blobs (`selections` store; previews use a separate store), and the
API is `netlify/functions/selections-api/`. Without a server (plain `npm run dev`), the
app works locally exactly as before: no sign-in, with the in-browser project library.

## Run locally

```bash
cd selections
npm install
npm run dev      # http://localhost:5175/selections/
npm run build    # production build into dist/
npm run lint     # tsc type-check (the linter, same as the other apps)
```

## Architecture (mirrors cabinet-designer)

```
src/
  main.tsx                Entry: createRoot + <App/>, imports styles.css
  App.tsx                 Shell: catalog load, draft restore, autosave, undo/redo keys, layout
  store.ts                Zustand store + loadCatalog / attachAutosave / restoreDraft
  types.ts                All domain types (single source of truth)
  styles.css              One global stylesheet with the :root brand token block
  components/             PascalCase panes (SettingsBar, CategoryNav, OptionGrid, SummaryPanel, ProjectDialog, Welcome)
  utils/
    pricing.ts            computeLines / computeTotals / formatCAD (CAD)
    pdf.ts                exportSelectionsPdf — branded, with thumbnails + signature
    persistence.ts        .json save/open (versioned wrapper) + named library + CSV
    swatch.ts             placeholder image generator + optionImage() resolver
public/
  rid-catalog.json        The catalog (categories → options). Swap this for real data.
```

## Replacing the demo catalog with your real data

Everything you select lives in **`public/rid-catalog.json`** — fetched at runtime, so no
rebuild-time coupling. Its shape:

- `_meta`: `{ currency: "CAD", pricing_year, base_price, notes }` — `base_price` is the
  standard finish package the upgrades add onto.
- `categories[]`: `{ id, name, description?, multi?, options[] }`
- each **option**: `{ id, name, description?, pricing: "included" | "upgrade", price, image?, swatch? }`
  - `pricing: "included"` → in the base package ($0). `"upgrade"` → adds `price`.
  - `image`: path to a real photo (see below). `swatch`: a hex colour used only for a
    generated placeholder when no `image` is set.

### Product photos — no external hosting needed

Drop image files in **`selections/public/finishes/`** (e.g. `finishes/quartz-white.jpg`) and
set the option's `image` to `finishes/quartz-white.jpg`. They're bundled with the app and
embed correctly into the PDF. Placeholder swatches render until real photos are added.

### Sourcing from Square

The catalog can be generated from the Robins Interiors **Square** catalog (item names,
categories, prices, and Square-hosted image URLs), then annotated with which items are
`included` vs `upgrade` and the `base_price`. See the JMRC assistant to run the import.

## Branding

PDF branding is in `src/utils/pdf.ts` (`BRAND`). UI colours/fonts are the `:root` tokens at
the top of `src/styles.css` — the JMRC indigo→cyan gradient, Montserrat + Inter.
