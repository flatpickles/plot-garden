import { describe, expect, it } from "vitest";

import type { NormalizedSketchDocument } from "@/lib/sketch-core/types";
import {
  createPlotJobPlan,
  DEFAULT_PLOTTER_CONFIG,
} from "@/lib/plotter";

const documentFixture: NormalizedSketchDocument = {
  width: 8,
  height: 6,
  units: "in",
  layers: [
    {
      id: "one",
      name: "One",
      polylines: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
      svgMarkup: "",
    },
    {
      id: "two",
      name: "Two",
      polylines: [[{ x: 0, y: 1 }, { x: 1, y: 1 }]],
      svgMarkup: "",
    },
  ],
};

describe("createPlotJobPlan", () => {
  it("keeps layers in ordered mode", () => {
    const plan = createPlotJobPlan(documentFixture, "ordered", DEFAULT_PLOTTER_CONFIG);
    expect(plan.layers).toHaveLength(2);
    expect(plan.layers[0]?.name).toBe("One");
    expect(plan.stats.strokeCount).toBe(2);
  });

  it("flattens layers in flatten mode", () => {
    const plan = createPlotJobPlan(documentFixture, "flatten", DEFAULT_PLOTTER_CONFIG);
    expect(plan.layers).toHaveLength(1);
    expect(plan.layers[0]?.polylines).toHaveLength(2);
  });

  it("expands with repeat count", () => {
    const plan = createPlotJobPlan(documentFixture, "ordered", {
      ...DEFAULT_PLOTTER_CONFIG,
      repeatCount: 3,
    });

    expect(plan.layers).toHaveLength(6);
  });
});
