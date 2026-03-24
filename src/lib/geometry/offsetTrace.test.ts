import { describe, expect, it } from "vitest";

import type { Point, Polyline } from "@/lib/sketch-core/types";
import {
  traceOffsetLine,
  traceOffsetLinesSequentially,
  type OffsetTraceStartSpec,
  type TraceBounds,
} from "@/lib/geometry/offsetTrace";

const BOUNDS: TraceBounds = {
  minX: -20,
  minY: -20,
  maxX: 20,
  maxY: 20,
};

function buildStartSpec(
  startPoint: { x: number; y: number },
  traceMode: OffsetTraceStartSpec["traceMode"] = "turn-on-breach",
): OffsetTraceStartSpec {
  return {
    startPoint,
    offsetDistance: 2,
    preferredSide: "left",
    traceMode,
  };
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

describe("offsetTrace", () => {
  it("tracks a straight line at a fixed offset without intersections", () => {
    const base: Polyline[] = [[
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]];

    const line = traceOffsetLine(base, buildStartSpec({ x: 0, y: 2 }), BOUNDS);

    expect(line).not.toBeNull();
    expect(line?.[0]).toEqual({ x: 0, y: 2 });
    expect(line?.every((point) => Math.abs(point.y - 2) < 0.01)).toBe(true);
    expect(countPolylineIntersections(line ?? [], base[0] ?? [])).toBe(0);
    expect(countPolylineIntersections(line ?? [], line ?? [], true)).toBe(0);
  });

  it("continues through a unique redirect only in turn-on-breach mode", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 6, y: 0 },
        { x: 6, y: 8 },
      ],
    ];

    const turning = traceOffsetLine(base, buildStartSpec({ x: 0, y: 2 }, "turn-on-breach"), BOUNDS);
    const stopping = traceOffsetLine(
      base,
      buildStartSpec({ x: 0, y: 2 }, "stop-on-ambiguity"),
      BOUNDS,
    );

    expect(turning).not.toBeNull();
    expect(stopping).not.toBeNull();
    expect((turning?.length ?? 0)).toBeGreaterThan(stopping?.length ?? 0);
    expect(turning?.some((point) => point.x <= 4.1 && point.y > 2.5)).toBe(true);
    expect(stopping?.at(-1)?.x).toBeCloseTo(4, 1);
    expect(stopping?.at(-1)?.y).toBeCloseTo(2, 1);
  });

  it("stops both modes when there is no valid continuation", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 6, y: -4 },
        { x: 6, y: 2 },
      ],
    ];

    const turning = traceOffsetLine(base, buildStartSpec({ x: 0, y: 2 }, "turn-on-breach"), BOUNDS);
    const stopping = traceOffsetLine(
      base,
      buildStartSpec({ x: 0, y: 2 }, "stop-on-ambiguity"),
      BOUNDS,
    );

    expect(turning).not.toBeNull();
    expect(stopping).not.toBeNull();
    expect(turning).toEqual(stopping);
    expect(turning?.at(-1)?.x).toBeCloseTo(4, 1);
    expect(turning?.at(-1)?.y).toBeCloseTo(2, 1);
  });

  it("lets a later traced line bounce against an earlier traced line without intersecting it", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 6, y: 0 },
        { x: 6, y: 8 },
      ],
    ];

    const traced = traceOffsetLinesSequentially(
      base,
      [
        buildStartSpec({ x: 0, y: 2 }),
        buildStartSpec({ x: 0, y: 4 }),
      ],
      BOUNDS,
    );

    expect(traced).toHaveLength(2);
    expect(countPolylineIntersections(traced[1] ?? [], traced[0] ?? [])).toBe(0);
    expect((traced[1] ?? []).some((point) => point.x <= 2.1 && point.y > 4.5)).toBe(true);
  });
});
