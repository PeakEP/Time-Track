# JMRC Cabinet Designer — Handoff

Working notes for the next session. The app is a local-first kitchen cabinet
designer (2D plan + 3D + 2D elevations) built from the BUILD SPEC, using the
OPPEIN RTA 2025 catalog as its component/price book.

## Where things live
- Repo: `peakep/time-track`, develop on branch **`claude/brave-tesla-AA9LC`**.
- This app lives in **`cabinet-designer/`** (a Vite app). The repo root also holds
  the older **Time Track** single-file app (`index.html`).
- Netlify builds both via `scripts/netlify-build.sh` → `_site/` (Time Track at
  `/`, this app at `/cabinet-designer/`). `netlify.toml` runs that script.
- Current HEAD: `4addab7`. Always commit + push to the branch.

## Run / build / test
```
cd cabinet-designer
npm install
npm run dev      # http://localhost:5173/cabinet-designer/
npm run build    # tsc -b && vite build  (must stay green)
```
- Stack: Vite + React 18 + TypeScript + **Zustand** (one store) + **three.js /
  @react-three/fiber / drei** (3D) + **jsPDF / jspdf-autotable** (export) +
  lucide-react. 2D plan and elevations are hand-rendered **SVG**.
- The 3D bundle is **code-split** (lazy `Scene3D`); keep it that way.

## Catalog & data model
- `public/oppein-catalog.json` — 253 products, 16 finishes, 5 tiers,
  `_meta.dealer_discount = 0.58`. Single source of truth for SKUs/dims/prices.
- **All geometry is in inches.** Plan: `x,y` = top-left of footprint, room origin
  top-left. `rotation` ∈ {0,90,180,270}. `mountZ` = bottom height AFF
  (0 = base/floor; uppers default 54"). `footprint(item)` swaps w/d for 90/270.
- Types in `src/types.ts`. `Project = { meta, settings, room, items }`.
  `settings` now includes: `finishCode, boxMaterial, wallHeight(96),
  wallCabinetAFF(54), counterHeight(36), markup, hstRate(0.15), wallMode(1-4),
  wallViewAngle(45), pricingMode("markup"|"discount"|"margin"), discountPct,
  marginPct`.
- `Item.kind`: cabinet | appliance | window | door | filler | panel | accessory.

## Store (`src/store.ts`)
- One Zustand store drives all views. Key state: `catalog, project, selectedId,
  view ("plan"|"front"|"split"|"3d"), showPricing, showInternalPricing,
  scheduleCollapsed, showDimensions, vertexEdit, frontWall, ghost, pxPerInch,
  past/future (undo/redo)`.
- **Undo/redo**: mutating actions snapshot `past`; live drag/number-spinners pass
  `{snapshot:false}` and commit one step at drag end. Cmd/Ctrl-Z, Shift for redo.
- **Persistence**: `attachAutosave()` writes a debounced draft to localStorage;
  `restoreDraft()` offers it on load. IMPORTANT: autosave intentionally skips the
  pristine empty default so it can't clobber a saved draft on reload (this was a
  real data-loss bug — see history). `showPricing`/`showDimensions`/pane widths
  also persist to localStorage. `.json` save/open via File System Access API with
  download/upload fallback (`src/utils/persistence.ts`).

## Components
- `SettingsBar.tsx` — top bar: File (New/Open/Save/Export PDF×2/CSV), Room
  (rect/L/U presets, custom dims dialog, vertex edit toggle), Add (Window/Door
  dialogs + appliance presets), undo/redo, settings dialog, **view toggle
  (Plan / Front / Split / 3D)**.
- `CatalogPalette.tsx` — searchable, category-grouped palette; click a SKU →
  `ghost` → click plan to place. Panels/fillers are placeable; accessories/
  hardware/glass are schedule-only. Wall-cab ghost shows a "gap above counter".
- `Plan2D.tsx` — SVG plan. Grid drawn **inside** room (clipPath), wall-mode
  rendering, blueprint dimension toggle, vertex editor, ghost preview. Drag with
  threshold + global mouseup (no "sticking"); double-click locks + closes
  inspector; arrow-key nudge (1", 1/8" w/Shift); wheel zoom-to-cursor + Fit.
- `Scene3D.tsx` — r3f scene. White carcasses + finish-colored shaker doors (2
  stacked doors on tall cabs), drei `<Edges>` outlines, corner L cabinets +
  lazy-susan bi-fold + wall-diagonal door, countertop slabs, OrbitControls with
  Iso/Top/Front presets, drag-to-move (pointer-capture + ground-plane raycast),
  wall-mode hides front walls.
- `Elevation.tsx` — 2D front view per wall, ‹ › wall flip, zoom + Fit + wheel,
  arrow nudge (along wall / mountZ). Uses the shared wall-assignment util.
- `SchedulePanel.tsx` — BOM/schedule grouped by category; collapsible to a rail;
  **pricing pane** with mode switch (Markup / % off MSRP / Margin) editable live,
  Client/Internal toggle, shows achieved margin% & discount%. "Cut to" W×H inputs
  for fillers/panels.
- `Inspector.tsx` — floating, **draggable (header) + resizable + scrollable**
  panel for the selected item (x/y, dims, mountZ + gap, hinge/swing/sill, lay-flat
  for panels, rotate/duplicate/delete).
- `Welcome.tsx` — first-run dialog (localStorage-gated).

## Key utils
- `placement.ts` — `isScheduleOnly/isWallMounted/isPanelOrFiller/placedKind/
  placedDepth/defaultMountZ`, `isCornerCabinet/isLazySusan/isWallDiagonal`,
  `cornerLPoints/diagonalPoints`, `footprint`, `itemDimsLabel`, `snap`, `makeId`.
- `snapping.ts` — `snapToNearestWall` (cabinets flush to walls, auto-rotate) and
  `snapToAdjacent` (auto-attach: edges snap flush within 8"; Alt disables).
  `generateCountertops`.
- `elevation.ts` — **shared** `assignItemsToWalls(items, points)`: assigns each
  item to its single nearest wall (interior side, within ~42") and projects it.
  Used by BOTH `Elevation.tsx` and `pdf.ts` so views match.
- `pricing.ts` — `computeLines` (excludes window/door/appliance), `computeTotals`
  (mode-aware: markup / discount-off-MSRP / margin; returns achieved margin% &
  discount%), `unitListPrice`, `formatCAD`.
- `pdf.ts` — 3-page landscape export: (1) aerial plan w/ per-wall + overall dims,
  (2) elevations — one wall per full-width band (≤3/page), SKU labels (rotated if
  narrow) + width under each box, (3) schedule table (grouped, full page,
  repeats title on overflow) + pricing totals. Client vs Internal vs no-pricing.
- `roomPresets.ts` — rectangle/L/U builders, `edges`, `bounds`, `visibleWallSet`
  (wall-mode dollhouse selection, rotatable by `wallViewAngle`).

## Pricing model
list (MSRP) → dealer discount 58% → JMRC cost. Client price by `pricingMode`:
markup× cost, or (1−discount%)×MSRP, or cost/(1−margin%). Then 15% HST.
All adjustable live in the pricing pane and used by the PDF.

## How I test here (no human in the loop)
- Playwright + the bundled Chromium render real browser flows. Pattern: start
  `npm run/vite dev` on a port, drive the app, read `localStorage` draft for item
  state, capture screenshots.
- **PDF visual check**: export → `download.saveAs(path)` → open `file://…pdf` in
  Chromium (its built-in viewer renders) → screenshot. `#page=N` mostly works.
- Tip for loading a real project in a test: seed `localStorage["jmrc.cabinet.
  draft.v1"] = {savedAt, project}` via `addInitScript`, then click "Restore".
  (The autosave-skip-default fix is what makes this reliable now.)
- Env for the scripts: `GLOBAL_NM=$(npm root -g)`,
  `PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- The user's real project is at `/tmp/sandra.json` (Sandra Shephard Kitchen,
  208×122 rect, cabinets on top + left walls) — good regression fixture.

## Recently fixed (don't regress)
- Placement race (click right after picking a SKU): `onClick` reads live ghost via
  `useStore.getState()`.
- Boxes "sticking" to cursor: global mouseup + buttons-released check + drag
  threshold; double-click to lock.
- Per-wall elevations: each item assigned to ONE wall (was double-counting
  corners / leaving walls empty).
- Autosave clobbering saved drafts on reload.
- Front-view blur on first open (measure container in `useLayoutEffect`).
- Panels/fillers: fine 0.25" grid, no wall-snap rotation override, lay-flat,
  editable cut sizes; excluded from overlap warnings.

## Open items / things to confirm with Mike
- **Default markup/margin** assumptions (1.20× / 45% margin / 30% off MSRP) —
  confirm real numbers.
- Busy-wall elevations: a few narrow base width call-outs still sit close; could
  add a proper dimension strip with leader ticks if desired.
- Fridge/upper-fridge-cabinet snapping "between two panels" — reported once;
  not reproduced. Get a repro if it recurs.
- Wall-mode dollhouse control lives in the plan toolbar (Plan/Split) — not in the
  pure 3D-only view; could mirror it into the 3D overlay.
- Countertop pricing, filler/panel placement nuances, Tauri/Electron wrapper:
  deferred per spec §15.
