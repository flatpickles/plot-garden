import { describe, expect, it } from "vitest";

import { createManifest, formatLocalDate } from "../../scripts/new-sketch";

describe("new-sketch helpers", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 2, 23, 12, 30, 0))).toBe("2026-03-23");
  });

  it("includes publishedAt in scaffolded manifests", () => {
    expect(JSON.parse(createManifest("test-sketch", "TestSketch", "2026-03-23"))).toMatchObject({
      slug: "test-sketch",
      className: "TestSketch",
      publishedAt: "2026-03-23",
    });
  });
});
