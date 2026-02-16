import { describe, expect, it } from "vitest";

import { sketchRegistry } from "@/generated/sketch-registry";
import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type { SketchParamSchema } from "@/lib/sketch-core/types";
import type { SketchRegistryEntry } from "@/generated/sketch-registry";
import { computeSketchInitialRenderState } from "@/lib/ui/sketchRenderBootstrap";

describe("computeSketchInitialRenderState", () => {
  it("computes defaults, normalized document, and seeded job plan for a valid sketch", async () => {
    const target = sketchRegistry.find((entry) => entry.manifest.slug === "inset-square");
    if (!target) throw new Error("Missing inset-square sketch");

    const seed = await computeSketchInitialRenderState(target);

    expect(seed.renderError).toBeNull();
    expect(seed.normalizedDocument).not.toBeNull();
    expect(seed.seededJobPlan).not.toBeNull();
    expect(seed.renderedParams).toEqual(seed.draftParams);
    expect(seed.draftContext).toEqual({ width: 8, height: 6, units: "in", seed: 1 });
  });

  it("returns an error state when sketch.render throws", async () => {
    const explodingSketchEntry: SketchRegistryEntry = {
      manifest: {
        slug: "exploding",
        title: "Exploding",
        description: "Intentionally fails on render.",
        tags: ["test"],
        order: 999,
        thumbnail: "thumbnail.png",
        className: "Exploding",
      },
      Sketch: class ExplodingSketch extends PlotterSketch {
        schema: SketchParamSchema = {
          size: { type: "number", label: "Size", default: 1, min: 1, max: 10, step: 1 },
        };

        render(): never {
          throw new Error("Nope");
        }
      },
    };

    const seed = await computeSketchInitialRenderState(explodingSketchEntry);

    expect(seed.renderError).toBe("Nope");
    expect(seed.normalizedDocument).toBeNull();
    expect(seed.seededJobPlan).toBeNull();
    expect(seed.draftParams).toEqual({ size: 1 });
  });
});
