import { describe, expect, it } from "vitest";

import Nebulous from "@/sketches/nebulous/Nebulous";
import type { Point, Polyline } from "@/lib/sketch-core/types";

function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const segmentLengthSquared = dx * dx + dy * dy;
  if (segmentLengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const projection =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / segmentLengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const projected = {
    x: start.x + dx * clamped,
    y: start.y + dy * clamped,
  };

  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

function pointToPolylineDistance(point: Point, polyline: Polyline): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    if (!start || !end) continue;
    best = Math.min(best, pointToSegmentDistance(point, start, end));
  }

  return best;
}

describe("Nebulous", () => {
  it("renders a spiral layer and one tracked offset layer", async () => {
    const sketch = new Nebulous();
    const params = sketch.getDefaultParams();
    const output = await sketch.render(params, {
      width: 8,
      height: 10,
      units: "in",
    });

    expect(output.kind).toBe("geometry");
    if (output.kind !== "geometry") return;

    expect(output.layers).toHaveLength(2);
    const spiral = output.layers[0]?.polylines[0];
    const tracked = output.layers[1]?.polylines[0];

    expect(spiral).toBeDefined();
    expect(tracked).toBeDefined();

    const spiralStart = spiral?.[0];
    const trackedStart = tracked?.[0];
    expect(trackedStart?.x).toBeCloseTo(spiralStart?.x ?? 0, 6);
    expect(trackedStart?.y).toBeCloseTo((spiralStart?.y ?? 0) - params.offsetDistance, 6);

    const trackedEnd = tracked?.at(-1);
    expect(trackedEnd).toBeDefined();
    expect(trackedEnd?.x !== trackedStart?.x || trackedEnd?.y !== trackedStart?.y).toBe(true);

    const sampleStride = Math.max(1, Math.floor((tracked?.length ?? 0) / 8));
    const sampledPoints =
      tracked?.filter((_, index) => index % sampleStride === 0).slice(0, 8) ?? [];

    expect(sampledPoints.length).toBeGreaterThan(0);
    for (const point of sampledPoints) {
      expect(pointToPolylineDistance(point, spiral ?? [])).toBeCloseTo(params.offsetDistance, 1);
    }
  });
});
