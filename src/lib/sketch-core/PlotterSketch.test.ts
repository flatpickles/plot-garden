import { describe, expect, it } from "vitest";

import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type { SketchParamSchema, SketchRenderContext } from "@/lib/sketch-core/types";

class ParamTestSketch extends PlotterSketch {
  readonly schema: SketchParamSchema = {
    amount: {
      type: "number",
      label: "Amount",
      default: 1,
      min: 0,
      max: 10,
      step: 0.1,
    },
    enabled: {
      type: "boolean",
      label: "Enabled",
      default: true,
    },
    mode: {
      type: "select",
      label: "Mode",
      default: "prefer-current",
      options: ["prefer-current", "nearest-valid", "stop-on-ambiguity"],
    },
  };

  render(_params: Record<string, unknown>, _context: SketchRenderContext) {
    return {
      kind: "geometry" as const,
      layers: [],
    };
  }
}

describe("PlotterSketch", () => {
  it("returns select param defaults", () => {
    const sketch = new ParamTestSketch();

    expect(sketch.getDefaultParams()).toEqual({
      amount: 1,
      enabled: true,
      mode: "prefer-current",
    });
  });

  it("coerces invalid select params back to defaults", () => {
    const sketch = new ParamTestSketch();

    expect(
      sketch.coerceParams({
        amount: 4.26,
        enabled: 0,
        mode: "not-valid",
      }),
    ).toEqual({
      amount: 4.3,
      enabled: false,
      mode: "prefer-current",
    });
  });
});
