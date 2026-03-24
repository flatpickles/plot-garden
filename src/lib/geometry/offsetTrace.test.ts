import { describe, expect, it } from "vitest";

import type { Polyline } from "@/lib/sketch-core/types";
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
  tieBreakMode: OffsetTraceStartSpec["tieBreakMode"] = "prefer-current",
): OffsetTraceStartSpec {
  return {
    startPoint,
    offsetDistance: 2,
    preferredSide: "left",
    tieBreakMode,
  };
}

describe("offsetTrace", () => {
  it("tracks a straight line at a fixed offset", () => {
    const base: Polyline[] = [[
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]];

    const line = traceOffsetLine(base, buildStartSpec({ x: 0, y: 2 }), BOUNDS);

    expect(line).not.toBeNull();
    expect(line?.[0]).toEqual({ x: 0, y: 2 });
    expect(line?.every((point) => Math.abs(point.y - 2) < 0.01)).toBe(true);
    expect(line?.at(-1)?.x).toBeCloseTo(8, 1);
  });

  it("hands off to another owner under prefer-current when the current owner ends", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
      [
        { x: 8, y: 2 },
        { x: 8, y: 8 },
      ],
    ];

    const line = traceOffsetLine(base, buildStartSpec({ x: 0, y: 2 }), BOUNDS);

    expect(line).not.toBeNull();
    expect(line?.some((point) => point.x > 5.9 && point.y > 2.5)).toBe(true);
    expect(line?.at(-1)?.x).toBeCloseTo(6, 1);
    expect(line?.at(-1)?.y).toBeCloseTo(8, 1);
  });

  it("switches owners immediately under nearest-valid when offsets overlap", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 0, y: 4 },
        { x: 2, y: 4 },
        { x: 2, y: 8 },
      ],
    ];

    const line = traceOffsetLine(
      base,
      {
        ...buildStartSpec({ x: 0, y: 2 }, "nearest-valid"),
        preferredSide: "auto-inward",
      },
      BOUNDS,
    );

    expect(line).not.toBeNull();
    expect(line?.some((point) => point.x > 3.8 && point.y > 3.8)).toBe(true);
    expect(line?.at(-1)?.x).toBeCloseTo(4, 1);
    expect(line?.at(-1)?.y).toBeCloseTo(8, 1);
  });

  it("stops on the first ambiguity when configured to do so", () => {
    const base: Polyline[] = [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 0, y: 4 },
        { x: 2, y: 4 },
        { x: 2, y: 8 },
      ],
    ];

    const line = traceOffsetLine(
      base,
      {
        ...buildStartSpec({ x: 0, y: 2 }, "stop-on-ambiguity"),
        preferredSide: "auto-inward",
      },
      BOUNDS,
    );

    expect(line).toBeNull();
  });

  it("lets later traces reference previously generated lines", () => {
    const base: Polyline[] = [[
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]];

    const traced = traceOffsetLinesSequentially(
      base,
      [
        buildStartSpec({ x: 0, y: 2 }),
        buildStartSpec({ x: 0, y: 4 }),
      ],
      BOUNDS,
    );

    expect(traced).toHaveLength(2);
    expect(traced[0]?.every((point) => Math.abs(point.y - 2) < 0.01)).toBe(true);
    expect(traced[1]?.every((point) => Math.abs(point.y - 4) < 0.01)).toBe(true);
  });
});
