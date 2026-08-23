# Cabinet Designer — Rendering Audit (Phase 0)

Grounding for the phased upgrades in `RENDERING_UPGRADE.md`. This is the "before"
snapshot; every later phase should be judged against it.

## Stack

- **React Three Fiber** (`@react-three/fiber` ^8.17.10)
- **drei helpers** (`@react-three/drei` ^9.114.0)
- **three** ^0.169.0
- No `@react-three/postprocessing` yet
- Both apps (`cabinet-designer/` OPPEIN + `aline-designer/` ALINE) share the same
  Scene3D.tsx file structure — every rendering change lands in both.

## Current renderer settings

```tsx
<Canvas
  shadows={false}
  camera={{ position: [...], fov: 40, near: 1, far: 5000 }}
  gl={{ antialias: true, preserveDrawingBuffer: true }}
>
```

- `outputColorSpace` — not set explicitly (three r152+ default is SRGBColorSpace)
- `toneMapping` — **not set** → defaults to `THREE.NoToneMapping`
- `toneMappingExposure` — n/a
- `shadows: false` — no shadow rendering at all
- `preserveDrawingBuffer: true` — kept for the PNG Capture button

## Lights

Static rig, no dynamic response to layout:

- `hemisphereLight("#ffffff", "#b8bfd0", 0.8)` — sky/ground fill
- `directionalLight` at `(cx + 200, 320, cy + 200)`, intensity 0.8
- `directionalLight` at `(cx - 150, 260, cy - 100)`, intensity 0.3
- `ambientLight` intensity 0.4

Combined intensity ≈ 2.3 — reasonable for a flat-shaded look but heavy fills that
wash out shadow structure.

## Environment / IBL

- **None.** No `<Environment>`, no HDRI, no PMREM. All shading comes from the
  static lights above → metals look like plastic, no directional sheen on doors.
- Background is a solid `<color attach="background" args={["#eef1f7"]}>`.

## Materials (per part)

| Part                | Material                | Notes                                                 |
|---------------------|-------------------------|-------------------------------------------------------|
| Cabinet carcass     | `meshStandardMaterial`  | `WHITE_BOX = "#f4f3ef"`, roughness 0.7 (0.3 appliance) |
| Cabinet door        | `meshStandardMaterial`  | finish hex from `finishColors.ts`, roughness 0.45     |
| Recessed shaker centre | `meshStandardMaterial` | `darken(doorColor, 0.10)`, roughness 0.55            |
| Appliance body      | `meshStandardMaterial`  | `#aab2c0`, roughness 0.3, metalness 0.4               |
| Appliance front     | `meshStandardMaterial`  | `#20242e`, roughness 0.25, metalness 0.5              |
| Countertop          | `meshStandardMaterial`  | `#2a2a30`, roughness 0.35, metalness 0.05             |
| Floor               | `meshStandardMaterial`  | `#b9b0a0`, roughness 0.95                             |
| Wall                | `meshStandardMaterial`  | `#cdd3dc`, roughness 0.97                             |
| Window pane         | `meshStandardMaterial`  | `#9ec5d8`, transparent 0.45, roughness 0.1            |
| Selection outline   | `meshBasicMaterial`     | wireframe, `#2C327C`                                  |

Every material is `meshStandardMaterial`. No `MeshPhysicalMaterial` (no clearcoat,
no transmission, no sheen). No texture maps whatsoever — everything is a solid hex.

## Camera & controls

- Perspective, FOV 40, near 1, far 5000
- `OrbitControls` (drei) with `enableDamping`, `dampingFactor: 0.1`
- Three preset positions via `setView("iso"|"top"|"front")` — no smooth transition,
  they hard-cut.
- `GizmoHelper` in the bottom-right for orientation

## Post-processing

- **None.** No AO, no bloom, no SMAA/TAA. Antialiasing is the WebGL context's own
  (`antialias: true`).

## Screenshots

- Baseline capture: use the **Capture** button on the live 3D view
  (`cabinetdesignjmrc.netlify.app/cabinet-designer/`) — that already downloads a PNG
  of the current scene. Save it as `docs/renders/baseline.png` in the repo before
  merging any later phase, so we have an apples-to-apples comparison.

## Gap list — ordered by expected visual impact

1. **Phase 2 — HDRI environment (`<Environment>`).** Biggest single win. Doors and
   metal hardware currently have no reflections; adding an interior HDR immediately
   makes finishes look like real materials.
2. **Phase 1 — Colour management + tone mapping.** Adding `ACESFilmicToneMapping`
   and confirming `SRGBColorSpace` output normalises whites/blacks and stops the
   washed-out look. Also unlocks HDRI's benefits in Phase 2.
3. **Phase 4 — Grounding shadows.** `<ContactShadows>` under the cabinet run.
   Cheap, huge grounding effect vs the current floating look.
4. **Phase 5 — Ambient occlusion (post-processing).** Reveals the panel gaps,
   toe kicks, and reveals that read as "built cabinetry" vs "CAD".
5. **Phase 3 — PBR pass with real maps.** Painted-lacquer clearcoat on doors,
   subtle sheen on quartz, brushed-metal pulls. Feeds directly off Phase 2's
   environment.
6. **Phase 6 — Framing presets.** Smooth camera transitions + hardware-detail
   preset.
7. **Phase 7 — Room context.** Optional; already have walls + floor, needs a
   window plane and neutral floor material.
8. **Phase 8 — Presentation/export.** High-res render, shot list, branded PDF.
9. **Phase 9 — Performance tiers.** Preview vs Final; adaptive DPR.

## Working plan

Small commits, one phase per PR, both apps in every commit. Phase 0 + Phase 1 ship
together because Phase 0 is doc-only.
