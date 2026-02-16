# Plotter Support (MVP)

## Target hardware

- AxiDraw/EBB-compatible machines.

## Browser support model

- Direct plotting: Chromium desktop browsers with Web Serial support.
- Non-Chromium desktop browsers: full browse/render/export still works; direct plotting is disabled with clear UI messaging.

## Plotter controls in MVP

- Connect / Disconnect
- Send to Plotter
- Pause / Resume / Cancel
- Pre-send confirmation modal with job stats

Exposed config:

- AxiDraw model selector
- Pen-down speed
- Pen-up speed
- Pen-up delay
- Pen-down delay
- Stroke repeat count

Settings are persisted to browser local storage.

## Layer plotting modes

When a sketch has multiple layers, users can choose:

1. Plot in order
2. Flatten layers before optimization
3. Pause between layers (for pen swaps)

## Notes on implementation

- Motion commands are generated as EBB-compatible command packets.
- Basic path optimization is applied before command generation.
- Bounds checking uses model-specific travel bounds and reports out-of-bounds points in the UI.

## Safety

- Always verify pen-up/pen-down behavior and machine calibration with small test plots first.
- Use conservative speed settings on initial runs.
