# Sketch API

## Base class

All sketches extend `PlotterSketch` from:

`/Users/matt/dev/plot-garden/src/lib/sketch-core/PlotterSketch.ts`

Required pieces:

1. `schema`: explicit typed parameter schema (`number`, `boolean` for MVP).
2. `render(params, context)`: returns either geometry output or SVG output.

## Render context

`SketchRenderContext`:

- `width: number`
- `height: number`
- `units: "in" | "mm"`

The width/height/units are controlled in the sidebar global controls.

## Output modes

### 1) Geometry output

Return:

- `kind: "geometry"`
- `layers: Array<{ id, name?, polylines }>`

`polylines` is an array of point arrays (`{x,y}`), where each polyline is a stroke path.

### 2) SVG output

Return:

- `kind: "svg"`
- `svg: string`

Layer behavior:

- If the SVG has multiple top-level `<g>` elements, each top-level group is treated as one layer.
- If SVG has no top-level groups (or only one), output is treated as a single layer.

Recommended for deterministic layer naming:

- Use top-level `<g id="..." data-layer-name="...">`.

## Manifest schema (`sketch.json`)

Validated by `zod` in:

`/Users/matt/dev/plot-garden/src/lib/sketch-core/manifestSchema.ts`

Fields:

- `slug`: kebab-case unique key
- `title`: display title
- `description`: short description
- `tags`: string array
- `order`: integer for list ordering
- `thumbnail`: usually `thumbnail.png`
- `className`: TS class filename/export name

## New sketch scaffolding

Use:

```bash
pnpm sketch:new my-new-sketch
```

This creates:

- `/Users/matt/dev/plot-garden/src/sketches/my-new-sketch/MyNewSketch.ts`
- `/Users/matt/dev/plot-garden/src/sketches/my-new-sketch/sketch.json`
- `/Users/matt/dev/plot-garden/src/sketches/my-new-sketch/thumbnail.png`

It also refreshes the registry.
