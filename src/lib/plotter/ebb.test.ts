import { describe, expect, it } from "vitest";

import { buildEbbPackets, DEFAULT_PLOTTER_CONFIG } from "@/lib/plotter";

const planFixture = {
  mode: "pause-between" as const,
  layers: [
    {
      id: "one",
      name: "One",
      polylines: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
    },
    {
      id: "two",
      name: "Two",
      polylines: [[{ x: 0, y: 1 }, { x: 1, y: 1 }]],
    },
  ],
  stats: {
    layerCount: 2,
    strokeCount: 2,
    pointCount: 4,
    drawDistance: 2,
    travelDistance: 1,
    outOfBoundsPoints: 0,
  },
};

describe("buildEbbPackets", () => {
  it("injects pause markers for pause-between-layer mode", () => {
    const packets = buildEbbPackets(planFixture, DEFAULT_PLOTTER_CONFIG);
    expect(packets.some((packet) => packet.type === "pause-marker")).toBe(true);
    expect(packets[0]).toEqual({ type: "command", command: "EM,1,1" });
    expect(packets[packets.length - 1]).toEqual({
      type: "command",
      command: "EM,0,0",
    });
  });
});
