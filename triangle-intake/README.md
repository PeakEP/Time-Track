# Triangle Kitchen Intake — Robins Interiors & Design

A guided, picture-led **intake / selection form** for **Triangle Kitchen** cabinetry.
An employee signs in, walks a customer's choices step by step (door construction →
style → species → finish → box → drawers → detailing → ventilation → accessories),
and hands the result off to the designer as a branded PDF and a shared cloud record.

**No pricing** — this is a starting point for the cabinet layout, not a quote. It is the
Triangle counterpart to **Finish Selections**, built in the same JMRC house style:
React 18 + Vite + TypeScript, a flat **Zustand** store (undo/redo +
namespaced-localStorage autosave), one global `styles.css` token system, a runtime
catalog fetched from `public/`, and a `jsPDF` + `jspdf-autotable` export. Deploys under
**`/triangle-intake/`** alongside the other JMRC apps.

## What makes it "spoon-fed"

The catalog is an ordered list of **steps**, and steps (and individual options) carry a
`showIf` condition plus a species filter. The flow narrows itself as you go:

- Pick **5-Piece Solid Wood** → you get the 42 solid-wood door styles, then a **species**
  step, then a **finish type**, then the **stain palette for that species** (or the paint
  palette). Pick **TFL** instead and those steps disappear, replaced by the TFL colour
  grid. Pick **Thermofoil** and you get the thermo styles + thermo colours.
- Pick **Wood Range Hood** under ventilation → the 12 hood series appear; pick anything
  else and they don't. An over-the-range microwave is called out as **not** a wood hood.

The engine lives in `src/utils/visibility.ts`; `pruneSelections` drops any downstream
pick that an upstream change made unreachable, so the summary always stays true.

## Online: staff sign-in and shared intakes

On the live site everyone signs in with their **suite name + PIN** on the home page (the
page gate sends anyone not signed in there first, then back here). This tool is
**staff-only** — there are no client sign-ins.

- Access is the per-person **Triangle Intake** toggle on **Suite Admin** (`/admin/`), on
  by default.
- **Intakes** (top bar) is a shared list: anyone with access sees every intake, so an
  employee can start one and the designer opens it in the same tool. Changes autosave and
  three-way merge on the server, like Finish Selections.
- Without a server (plain `npm run dev`) the app runs locally: no sign-in, autosave to the
  browser, and import/export a `.json` file.

Data lives in Netlify Blobs (the `triangle` store: an `index` document + one
`projects/<id>` per intake). The API is `netlify/functions/triangle-api/`.

## Run locally

```bash
cd triangle-intake
npm install
npm run dev      # http://localhost:5176/triangle-intake/
npm run build    # production build into dist/
npm run lint     # tsc type-check
```

API tests (run from the repo root, with the other suites):

```bash
npm run test:vendor-orders
```

## Architecture

```
src/
  main.tsx                Entry: createRoot + <App/>
  App.tsx                 Shell: catalog load, sign-in gate, autosave, undo/redo, layout
  store.ts                Zustand store + loadCatalog / attachAutosave / restoreDraft
  cloud.ts                Staff sign-in + shared-intake sync (/api/triangle/*)
  types.ts                Domain types (Catalog steps/options, Project)
  styles.css              One global stylesheet with the :root brand tokens
  components/
    TopBar, StepRail      Brand bar + numbered progress rail
    StepView              The wizard screen: card grid, forms, Back/Next, auto-advance
    ReviewPanel           Summary + "still blank" nudges + designer checklist + Export
    SignIn, ProjectsDialog, Welcome
  utils/
    visibility.ts         The showIf / species-filter / prune engine
    summary.ts            Hand-off lines + the "confirm before ordering" flags
    pdf.ts                Branded, no-price hand-off PDF
    swatch.ts             Image resolver + generated colour tiles
    persistence.ts        .json save/open + in-browser library
    merge.ts              Three-way merge (mirror of the API's merge.mjs)
public/
  triangle-catalog.json   The catalog (steps → options). Generated — see below.
  triangle/               Option images sliced from the Triangle brochures.
```

## Regenerating the catalog and images

The catalog and images are generated from the Triangle brochures (door styles, paint &
stain options, range hoods) and committed as static files. To rebuild them:

- **Catalog** (`public/triangle-catalog.json`): `python3 scripts/gen_catalog.py`. All the
  option lists, species codes, finish palettes (as hex swatches) and image paths live in
  that one script — edit it and re-run. It's deterministic.
- **Images** (`public/triangle/`): `scripts/slice_brochures.py` slices the per-option door,
  mullion, glass and hood images out of the brochure pages (rendered to PNG with
  `pdftoppm`). See the header of that script for the exact inputs. Colour finishes are not
  images — the app renders them as named swatches, so only the catalog's hex values need
  touching when a colour changes.

Colours on screen are **approximate** (the brochures themselves disclaim print colour); the
designer confirms the real species/finish from a physical Triangle sample. Hardware,
countertops and flooring are supplied separately, and bath vanities are usually Oppein, not
Triangle — the intake says so and the PDF's verification checklist repeats it.

## Branding

PDF branding is in `src/utils/pdf.ts` (the `BRAND` constant); UI colours/fonts are the
`:root` tokens at the top of `src/styles.css` — the JMRC indigo→cyan gradient,
Montserrat + Inter.
