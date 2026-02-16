import { describe, expect, it } from "vitest";

import { loadSketchSources, tinyPngBuffer, toPascalCase } from "../../scripts/lib";

describe("script helpers", () => {
  it("converts kebab-case to PascalCase", () => {
    expect(toPascalCase("first-art-piece")).toBe("FirstArtPiece");
  });

  it("creates valid PNG placeholder bytes", () => {
    const buffer = tinyPngBuffer();
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("discovers current sketch manifests", () => {
    const sketches = loadSketchSources();
    expect(sketches.length).toBeGreaterThan(0);
    expect(sketches.map((item) => item.manifest.slug)).toContain("inset-square");
  });
});
