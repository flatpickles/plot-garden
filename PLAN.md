## Pen Plotter Sketchbook for Next.js (Vercel) — Implementation Plan

### Summary
Build `/Users/matt/dev/plot-garden` as a `pnpm`-managed Next.js App Router project where each sketch is a typed `PlotterSketch` subclass in `/Users/matt/dev/plot-garden/src/sketches`, automatically listed in a searchable UI, parameterized via a control panel, rendered as SVG, and optionally sent directly to AxiDraw/EBB hardware via Web Serial on Chromium browsers. Non-Chromium desktop browsers still get full browse/render/export functionality with clear plotting fallback messaging.  
Execution will start by writing this plan to `/Users/matt/dev/plot-garden/PLAN.md`.

### Milestone 0 — Plan Capture
Create `/Users/matt/dev/plot-garden/PLAN.md` with this full plan verbatim as the first execution step.

### Milestone 1 — Project Bootstrap (`pnpm`, Next.js, baseline tooling)
Initialize Next.js (App Router + TypeScript) in `/Users/matt/dev/plot-garden` using `pnpm`, add lint/test scripts, and set strict TS defaults.  
Set up baseline directories: `/Users/matt/dev/plot-garden/src/app`, `/Users/matt/dev/plot-garden/src/lib`, `/Users/matt/dev/plot-garden/src/sketches`, `/Users/matt/dev/plot-garden/scripts`, `/Users/matt/dev/plot-garden/src/generated`.  
Acceptance: app runs locally, builds cleanly, and is ready for Vercel deployment.

### Milestone 2 — Core Sketch Contract and Domain Types
Implement abstract base class `PlotterSketch` and shared types in `/Users/matt/dev/plot-garden/src/lib/sketch-core`.  
Define explicit typed param schema (initial types: `number`, `boolean`) and global render context (width/height + units + seed).  
Define dual sketch output contract (`geometry` or `svg`) and a normalization pipeline that converts either form into one canonical internal document with ordered layers.  
Acceptance: one sample sketch can render through the normalized pipeline with typed params.

### Milestone 3 — Sketch Storage Model, Registry, and Scaffolding
Adopt per-sketch folder contract:
- `/Users/matt/dev/plot-garden/src/sketches/<slug>/<Slug>.ts` (class extending `PlotterSketch`)
- `/Users/matt/dev/plot-garden/src/sketches/<slug>/sketch.json` (manifest)
- `/Users/matt/dev/plot-garden/src/sketches/<slug>/thumbnail.png` (script-generated)
Implement `zod` validation for `sketch.json`.  
Implement `pnpm sketch:new <slug>` generator in `/Users/matt/dev/plot-garden/scripts/new-sketch.ts` to scaffold class + manifest + starter thumbnail placeholder.  
Implement `pnpm sketches:sync` in `/Users/matt/dev/plot-garden/scripts/sync-sketches.ts` to validate manifests and generate `/Users/matt/dev/plot-garden/src/generated/sketch-registry.ts`.  
Acceptance: creating a new sketch via CLI makes it appear in registry and UI without manual wiring.

### Milestone 4 — Main UI Shell and Sketch Navigation
Build a two-pane layout in `/Users/matt/dev/plot-garden/src/app` with:
- Main preview canvas/SVG pane.
- Sidebar containing sketch search list, sketch selector, global controls, plotter controls, and per-sketch params.
Add route structure `/` and `/sketch/[slug]`, with selected sketch loaded from registry and deep-link support.  
Acceptance: searchable list works, selecting sketch updates URL and rendered output.

### Milestone 5 — Parameter UI, Global Dimensions, and Render-Mode State Machine
Implement parameter controls for numeric/boolean fields from schema.  
Implement global dimensions control with inches/mm toggle (default inches), shared by all sketches and fed into render context.  
Implement live vs manual render mode exactly as specified:
- Live default.
- Manual mode shows `Render` button only when dirty.
- Button states: `Render` (enabled when dirty), `Processing...` (disabled during render), `Rendered` (disabled when clean), returns to `Render` after param changes.  
Acceptance: dirty tracking, render button text transitions, and manual/live behavior all match expected UX.

### Milestone 6 — Layer Panel and Multi-Layer Behavior
Normalize layers from either output type:
- Geometry output: explicit layer list.
- SVG output: top-level `<g>` groups become layers; if none/single, treat as one layer.
Use sketch-provided layer names when available; fallback to `Layer 1..N`.  
Add ordered layer list UI in sidebar with hover-to-dim behavior for non-hovered layers in preview.  
Implement plotting modes when multiple layers exist:
- Plot in order.
- Flatten all layers before optimization.
- Pause between layers (pen swap flow).  
Acceptance: layer hover visibility behavior and all three layer plotting modes function end-to-end in preview/job planning.

### Milestone 7 — Plotter Pipeline and AxiDraw Web Serial Integration (MVP)
Implement plot job planner that converts normalized layers to polylines, applies basic optimization (endpoint-join + nearest-neighbor ordering + reversible stroke direction), and expands repeat count.  
Implement EBB transport abstraction and Chromium implementation in `/Users/matt/dev/plot-garden/src/lib/plotter` using Web Serial:
- Connect/disconnect.
- Send/pause/cancel controls.
- Command queue execution and progress state.
- Pre-send confirmation modal with selected mode and estimated stats.
Add “More plotter config” essentials:
- Pen-down speed.
- Pen-up/travel speed.
- Pen up/down timing delay.
- Stroke repeat count.
- AxiDraw model selector toggle (UI setting before connect; extensible for future models).
Persist plotter settings to browser local storage.  
Add non-Chromium fallback: plotting controls disabled with clear reason; SVG render/export remains available.  
Acceptance: Chromium desktop can connect and run send/pause/cancel flows; Firefox/Safari can still browse/render/export and see expected fallback UI.

### Milestone 8 — Thumbnail Generation, Testing, and Docs
Implement `pnpm sketches:thumbnails` in `/Users/matt/dev/plot-garden/scripts/generate-thumbnails.ts` to regenerate committed previews for all sketches.  
Add docs:
- `/Users/matt/dev/plot-garden/README.md` quickstart and architecture.
- `/Users/matt/dev/plot-garden/docs/SKETCH_API.md` sketch contract + layer conventions.
- `/Users/matt/dev/plot-garden/docs/PLOTTER_SUPPORT.md` browser support and hardware notes.
Add CI-friendly tests and smoke checks.

## Public APIs, Interfaces, and Types (New/Changed)

### Sketch Authoring API
`PlotterSketch` abstract class in `/Users/matt/dev/plot-garden/src/lib/sketch-core/PlotterSketch.ts`.  
`SketchParamSchema` typed declarations (`number`, `boolean`) with defaults and constraints.  
`SketchRenderContext` includes physical dimensions, units, and seed.  
`SketchOutput` union supports `geometry` and `svg`.

### Manifest API
`sketch.json` schema in `/Users/matt/dev/plot-garden/src/lib/sketch-core/manifestSchema.ts` with slug/title/description/tags/order/thumbnail path metadata.

### Registry API
Generated module `/Users/matt/dev/plot-garden/src/generated/sketch-registry.ts` exporting typed sketch descriptors for UI and routing.

### Plotter API
`PlotterTransport` interface with connect/send/pause/cancel/status methods.  
`AxiDrawWebSerialTransport` implementation for Chromium Web Serial.  
`PlotJobPlan` type describing selected layers, flattening mode, pauses, repeat count, optimization stats.

## Test Cases and Scenarios

### Unit Tests
`/Users/matt/dev/plot-garden/src/lib/sketch-core/*.test.ts` for schema validation, output normalization, SVG top-level-group layer extraction, param coercion, and seed determinism.  
`/Users/matt/dev/plot-garden/src/lib/plotter/*.test.ts` for planner ordering, flatten mode, pause-between-layer markers, repeat expansion, and EBB command encoding rules.  
`/Users/matt/dev/plot-garden/scripts/*.test.ts` for scaffold/sync/thumbnail script behavior and validation errors.

### Component/Integration Tests
Render mode state machine tests for live/manual transitions and button labels.  
Layer list hover-dimming tests and layer-order display tests.  
Browser capability gating tests to ensure non-Chromium plotting controls are disabled but rendering works.

### E2E (Playwright)
Sketch selection + URL deep link.  
Parameter edits in live mode vs manual mode.  
Pre-send confirmation modal behavior.  
Mocked serial transport send/pause/cancel flow.  
Fallback UX in non-supported browser context simulation.

## Assumptions and Defaults Chosen
`pnpm` is the package manager for all scripts and workflows.  
Hosting target is Vercel with Next.js App Router.  
Direct plotting is browser-native only (no local Python/server bridge).  
AxiDraw/EBB is the MVP hardware target.  
All major desktop browsers support browse/render/export; direct plotting is Chromium-only due Web Serial support.  
Per-sketch metadata is stored in each sketch folder (`sketch.json`).  
Sketch creation/commit workflow is Codex/CLI-driven, not in-app git UI.  
Migration from `/Users/matt/dev/sketchbook` is manual and out of MVP scope.  
Global dimensions default to inches with mm toggle.  
Live render is default; manual render mode is opt-in.  
Seed parameter is included by default in generated sketch templates.  
Layer names use sketch-provided values when present.
