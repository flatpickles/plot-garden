import { describe, expect, it } from "vitest";

import { sketchManifestSchema } from "@/lib/sketch-core/manifestSchema";

describe("sketchManifestSchema", () => {
  it("accepts manifests with a published date", () => {
    expect(
      sketchManifestSchema.parse({
        slug: "test-sketch",
        title: "Test Sketch",
        description: "Schema validation test.",
        tags: ["test"],
        publishedAt: "2026-03-23",
        order: 1,
        thumbnail: "thumbnail.png",
        className: "TestSketch",
      }),
    ).toMatchObject({
      slug: "test-sketch",
      publishedAt: "2026-03-23",
    });
  });

  it("rejects malformed published dates", () => {
    expect(() =>
      sketchManifestSchema.parse({
        slug: "test-sketch",
        title: "Test Sketch",
        description: "Schema validation test.",
        tags: ["test"],
        publishedAt: "03/23/2026",
        order: 1,
        thumbnail: "thumbnail.png",
        className: "TestSketch",
      }),
    ).toThrow();
  });
});
