import { describe, expect, it } from "vitest";

import {
  normalizeSketchOutput,
  renderNormalizedDocumentToSvg,
} from "@/lib/sketch-core/normalizeSketchOutput";

const context = {
  width: 8,
  height: 6,
  units: "in" as const,
  seed: 1,
};

describe("normalizeSketchOutput", () => {
  it("normalizes geometry output into layers", async () => {
    const normalized = await normalizeSketchOutput(
      {
        kind: "geometry",
        layers: [
          {
            id: "main",
            name: "Main",
            polylines: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]],
          },
        ],
      },
      context,
    );

    expect(normalized.layers).toHaveLength(1);
    expect(normalized.layers[0]?.name).toBe("Main");
    expect(normalized.layers[0]?.polylines[0]).toHaveLength(2);
  });

  it("splits top-level SVG groups into layers", async () => {
    const normalized = await normalizeSketchOutput(
      {
        kind: "svg",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 6"><g id="a" data-layer-name="Alpha"><line x1="0" y1="0" x2="1" y2="1" /></g><g id="b" data-layer-name="Beta"><line x1="1" y1="1" x2="2" y2="2" /></g></svg>`,
      },
      context,
    );

    expect(normalized.layers).toHaveLength(2);
    expect(normalized.layers.map((layer) => layer.name)).toEqual(["Alpha", "Beta"]);
  });

  it("treats single or no top-level group as one layer", async () => {
    const normalized = await normalizeSketchOutput(
      {
        kind: "svg",
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 6"><line x1="0" y1="0" x2="1" y2="1" /><line x1="1" y1="1" x2="2" y2="2" /></svg>`,
      },
      context,
    );

    expect(normalized.layers).toHaveLength(1);
    expect(normalized.layers[0]?.name).toContain("Layer");

    const svg = renderNormalizedDocumentToSvg(normalized, {
      hoveredLayerId: normalized.layers[0]?.id ?? null,
    });
    expect(svg).toContain("<svg");
  });
});
