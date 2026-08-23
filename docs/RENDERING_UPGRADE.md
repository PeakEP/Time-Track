# Cabinet Tool — Rendering & Client Presentation Upgrade
### Instruction map for Claude Code

**Repo:** `PeakEP/Time-Track` · **Stack:** React + Three.js
**Goal:** Client-ready 3D renders comparable to 2020 Design Live, plus a branded presentation/export layer that turns a finished layout into deliverables a client sees.

---

## How to use this file with Claude Code

1. Drop this file in the repo (e.g. `docs/RENDERING_UPGRADE.md`).
2. Start each session with: *"Read docs/RENDERING_UPGRADE.md. Execute Phase N only, then stop and show me the result."*
3. **Work one phase at a time. Commit after each phase.** Review the visual result before advancing.
4. Do not advance past a phase until its **Acceptance criteria** are met.
5. If a phase reveals the stack differs from what's assumed here (e.g. vanilla Three.js instead of React Three Fiber), note it in `AUDIT.md` and adapt the APIs — the *intent* of each phase stays the same.

**Priority note:** Phases 1, 2, 4, and 5 deliver ~80% of the visual jump. If time is short, do those four and stop — the rest is polish and sell.

---

## Phase 0 — Audit & baseline (no visual changes)

**Goal:** Ground every later phase in what actually exists today.

**Tasks:**
- Determine whether rendering uses **React Three Fiber (R3F) + drei** or **vanilla Three.js**. Record which.
- Report the installed Three.js version and any helper libs (`@react-three/fiber`, `@react-three/drei`, `postprocessing`).
- Document current: lights, materials (per cabinet part), renderer settings, color space, tone mapping, shadow config, camera/controls.
- Capture one baseline screenshot of a representative layout and save it to `docs/renders/baseline.png`.

**Output:** `AUDIT.md` with findings + a prioritized gap list.
**Acceptance:** Audit doc + baseline screenshot committed. No functional changes made.

---

## Phase 1 — Color management & tone mapping *(foundational — do first)*

**Why:** Wrong color space is the #1 hidden cause of flat, washed-out, or muddy renders. Fixing this alone often makes the existing scene look dramatically better.

**Tasks:**
- Set `renderer.outputColorSpace = THREE.SRGBColorSpace`.
- Set `renderer.toneMapping = THREE.ACESFilmicToneMapping` with a tunable `toneMappingExposure` (start ~1.0).
- Ensure **albedo/base-color textures** are tagged `SRGBColorSpace`; **data maps** (normal, roughness, metalness, AO) are `NoColorSpace` / linear.
- R3F: configure on `<Canvas gl={{ toneMapping, outputColorSpace }}>`.

**Acceptance:** Side-by-side vs baseline shows corrected color — whites read white, blacks read black, no overall wash. Committed with a comparison screenshot.

---

## Phase 2 — Image-based lighting (HDRI environment) *(biggest single quality jump)*

**Why:** An HDR environment map gives realistic soft lighting and true reflections. This is what makes PBR materials come alive and is the largest visible improvement in the whole map.

**Tasks:**
- R3F: add drei `<Environment>` driving `scene.environment` for reflections. Vanilla: `RGBELoader` + `PMREMGenerator` → `scene.environment`.
- Source CC0 interior/studio HDRIs from **Poly Haven**.
- Provide 2–3 selectable presets: *Warm interior*, *Neutral studio*, *Bright daylight*.
- Keep the background clean (blurred environment or solid neutral) so cabinets read as a studio shot, not a busy scene.
- Expose an environment-intensity control.

**Acceptance:** Metal hardware shows real reflections; painted doors show a soft directional sheen; the scene no longer looks self-lit or flat. Presets switchable at runtime.

---

## Phase 3 — PBR material pass (cabinet-specific)

**Why:** Generic gray materials read as CAD. Real finishes read as a kitchen. Tie materials to the actual selected finish so the render matches what the client is buying.

**Tasks — build a material system keyed to product data:**
- **Painted / laminate doors:** `MeshPhysicalMaterial`, `clearcoat` 0.2–0.6 + `clearcoatRoughness`, `roughness` ~0.35–0.5 → sprayed-lacquer look.
- **Wood / melamine grain:** albedo + normal + roughness maps, UV scale matched to real-world mm.
- **Stone / quartz countertop:** `MeshPhysicalMaterial`, subtle `clearcoat`, roughness map, optional sheen.
- **Metal bar pulls / hinges:** `MeshStandardMaterial`, `metalness` 1.0, `roughness` 0.15–0.3 (polished vs brushed), correct metal tint.
- **Glass (if any):** `MeshPhysicalMaterial` with `transmission`.
- **Map existing colorways/finishes to material presets** so selecting a finish in the tool changes the rendered material.

**Acceptance:** Each finish type is visually distinct and reads as its real material; hardware looks like metal, not plastic. Selecting a finish updates the render.

---

## Phase 4 — Shadows & grounding

**Why:** Cabinets floating with no contact shadow always look fake. Grounding them is a large, cheap win.

**Tasks:**
- Add drei `<ContactShadows>` (or `<AccumulativeShadows>` for baked-quality softness) under the cabinet run.
- One key directional light with `PCFSoftShadowMap` for cast-shadow direction; tune `shadow.bias` to avoid acne.
- Ensure soft occlusion at the toe-kick and the cabinet/floor and cabinet/wall junctions.

**Acceptance:** Cabinets feel planted, not floating; soft grounding shadow visible where boxes meet floor and wall.

---

## Phase 5 — Post-processing (depth & polish)

**Why:** Ambient occlusion in particular is essential for cabinetry — it reveals panel gaps, reveals, inset detail, and shadow lines that make the work read as built.

**Tasks — add drei `<EffectComposer>`:**
- **Ambient occlusion:** N8AO or SSAO. *(Highest priority effect for cabinets.)*
- **Bloom:** subtle, high threshold — should only catch hardware/metal highlights.
- **Antialiasing:** SMAA (or TAA) for clean presentation edges.
- Optional slight vignette / final tone tweak.

**Acceptance:** Corners, reveals, and gaps gain depth; edges are clean; the image reads "rendered," not "real-time." Effects tunable and not overcooked.

---

## Phase 6 — Camera & framing presets

**Tasks:**
- Damped `OrbitControls`; FOV ~35–45 to avoid wide-angle distortion.
- Saved camera presets: **Hero (3/4)**, **Left elevation**, **Right elevation**, **Hardware detail**.
- Auto-frame to the bounding box of the current layout; smooth transitions between presets.

**Acceptance:** One-click jump to consistent, flattering angles regardless of layout size.

---

## Phase 7 — Room context *(optional, high-impact)*

**Why:** "Cabinets in a gray void" vs "cabinets in a room" is a big perceived-quality gap for clients.

**Tasks:**
- Simple floor + two walls + a window plane acting as a soft light source.
- Neutral floor material (wood or tile) with subtle reflection; optional backsplash plane.

**Acceptance:** Cabinets sit in a believable space without hand-modeling a full room.

---

## Phase 8 — Client presentation & export layer

**Why:** This is the part clients actually see. *(Scope this phase to the output format Mike confirms — see note below.)*

**Options:**
- **High-res still export:** render offscreen at 2–4× resolution → download PNG. A "Generate Presentation Render" button.
- **Shot list:** auto-render all camera presets to a set of stills in one action.
- **Branded output:** overlay JMRC logo + project header per the `jmrc-branding` standards; export a multi-page **PDF proposal** combining renders + selections + pricing from the existing tool.
- **Optional:** turntable orbit (GIF/MP4); shareable read-only web link.

**Acceptance:** From a finished layout, one action produces client-ready branded stills and/or a PDF proposal.

---

## Phase 9 — Performance & quality tiers

**Tasks:**
- **Preview tier:** lower samples, device pixel ratio 1–1.5, adaptive DPR for smooth interaction.
- **Final-render tier:** high DPR, full post-processing, offscreen render — triggered only on explicit "render."
- Lazy-load HDRIs and heavy textures.

**Acceptance:** Interaction stays smooth; high-quality cost is incurred only on an explicit render action.

---

## Dependencies (R3F path)

`@react-three/drei`, `@react-three/postprocessing`, `postprocessing` (and `n8ao` if AO isn't pulled via drei).
**Assets — use CC0 only:** HDRIs from Poly Haven; wood/stone/normal textures from Poly Haven or ambientCG.

## Gotchas

- Color-space bugs (Phase 1) are the top cause of "mine looks worse than the demo." Get this right before judging anything else.
- Keep albedo textures sRGB; keep normal/roughness/metalness/AO maps linear.
- Don't over-bloom — cabinetry isn't sci-fi.
- If clients are viewed on a showroom tablet, watch GPU load; lean on the preview tier there.
