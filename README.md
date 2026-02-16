# Plot Garden

A Next.js + pnpm sketchbook for pen plotter art.

## What it does

- Loads sketch classes from `src/sketches/*` through a generated registry.
- Renders sketch output as SVG with per-sketch parameters.
- Supports geometry-based and raw SVG-based sketch outputs.
- Provides live/manual rendering mode with explicit dirty-state behavior.
- Includes layer-aware preview and plotting modes:
  - Plot layers in order
  - Flatten all layers before optimization
  - Pause between layers for pen swaps
- Offers direct AxiDraw/EBB plotting via Web Serial on Chromium browsers.
- Keeps render/export workflow available on all desktop browsers.

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Sync sketch registry:

```bash
pnpm sketches:sync
```

3. Run development server:

```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Core commands

```bash
pnpm dev                 # sync registry + start Next dev server
pnpm build               # sync registry + production build
pnpm lint                # eslint
pnpm test                # vitest unit/component tests
pnpm test:e2e            # playwright smoke test against local server
pnpm sketch:new <slug>   # scaffold a new sketch
pnpm sketches:sync       # regenerate src/generated/sketch-registry.ts
pnpm sketches:thumbnails # manually regenerate committed sketch thumbnails (not used in current UI)
```

## Thumbnail status

- Thumbnails are currently a content artifact only; the app does not render them in the UX yet.
- `pnpm sketches:thumbnails` is an opt-in maintenance script and is not run by `pnpm dev` or `pnpm build`.
- `thumbnail.png` files are still scaffolded and kept in each sketch folder for possible future UI use.

## Sketch structure

Each sketch is self-contained in:

```text
src/sketches/<slug>/
  <ClassName>.ts
  sketch.json
  thumbnail.png
```

Read more:

- [Sketch API](docs/SKETCH_API.md)
- [Plotter support](docs/PLOTTER_SUPPORT.md)
