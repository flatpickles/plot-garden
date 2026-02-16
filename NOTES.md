# Implementation Notes

## Process observations

This was a satisfying project to implement because the architecture naturally split into three clear planes:

1. Authoring plane: `PlotterSketch`, manifests, and scaffold scripts.
2. Presentation plane: the Next.js workbench UI with render state management.
3. Machine plane: planning/optimization and Web Serial transport.

Getting those boundaries right early made the rest of the work much easier.

## What felt easiest

- The explicit parameter schema model removed ambiguity quickly.
- Generating the sketch registry from manifests made routing and search straightforward.
- The live/manual render toggle was clean once I separated `draft` vs `rendered` state.

## What was trickiest

- Strict typing with `noUncheckedIndexedAccess` surfaced many edge cases quickly.
- Handling SVG layer behavior consistently required careful normalization rules.
- Web Serial support constraints needed very clear UX messaging to avoid confusion.
- Playwright setup required installing browser binaries and tightening selectors.

## Validation approach

I validated with four layers of checks:

- `pnpm lint`
- `pnpm test` (unit + component)
- `pnpm build`
- `pnpm test:e2e` (Playwright against local server)

That stack caught regressions quickly while iterating.

## Design notes

- I aimed for a warm paper/ink visual language to suit pen plotting.
- The sidebar intentionally keeps plotter controls, layer strategy, and parameters in one place.
- `Aurora Topography` was designed to exercise all major features:
  - deterministic seed
  - multi-layer output
  - contour-heavy geometry for plotting
  - aesthetic layering suitable for multi-pen runs

## If I extended this next

- Add stronger SVG geometric extraction (including transforms/curves with better fidelity).
- Add richer parameter types (selects, grouped sections, conditional visibility).
- Improve plot telemetry (time estimates from measured send throughput, better resume semantics).
- Add shareable presets per sketch.
