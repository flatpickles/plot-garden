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

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointsClose(a: Point, b: Point, tolerance = 1e-3): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function properSegmentIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
  if (pointsClose(a, c) || pointsClose(a, d) || pointsClose(b, c) || pointsClose(b, d)) {
    return false;
  }

  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);

  return (
    ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) &&
    ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))
  );
}

function countPolylineIntersections(lineA: Polyline, lineB: Polyline, skipNearby = false): number {
  let count = 0;

  for (let indexA = 0; indexA < lineA.length - 1; indexA += 1) {
    const startA = lineA[indexA];
    const endA = lineA[indexA + 1];
    if (!startA || !endA) continue;

    for (let indexB = 0; indexB < lineB.length - 1; indexB += 1) {
      if (skipNearby && Math.abs(indexA - indexB) <= 1) continue;
      const startB = lineB[indexB];
      const endB = lineB[indexB + 1];
      if (!startB || !endB) continue;

      if (properSegmentIntersection(startA, endA, startB, endB)) {
        count += 1;
      }
    }
  }

  return count;
}

describe("Nebulous", () => {
  it("renders a spiral layer and one tracked offset layer without crossings", async () => {
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

    expect(countPolylineIntersections(tracked ?? [], spiral ?? [])).toBe(0);
    expect(countPolylineIntersections(tracked ?? [], tracked ?? [], true)).toBe(0);
  });

  it("keeps the stop-on-ambiguity output free of crossings", async () => {
    const sketch = new Nebulous();
    const params = sketch.getDefaultParams();
    const output = await sketch.render(
      { ...params, traceMode: "stop-on-ambiguity" },
      { width: 8, height: 10, units: "in" },
    );

    expect(output.kind).toBe("geometry");
    if (output.kind !== "geometry") return;

    const spiral = output.layers[0]?.polylines[0] ?? [];
    const tracked = output.layers[1]?.polylines[0] ?? [];

    expect(tracked.length).toBeGreaterThan(1);
    expect(countPolylineIntersections(tracked, spiral)).toBe(0);
    expect(countPolylineIntersections(tracked, tracked, true)).toBe(0);
  });
});
