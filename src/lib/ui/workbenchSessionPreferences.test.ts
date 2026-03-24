import { describe, expect, it } from "vitest";

import {
  createDefaultWorkbenchSessionPreferences,
  parseWorkbenchSessionPreferencesCookie,
  sanitizeWorkbenchSessionPreferences,
  serializeWorkbenchSessionPreferencesCookie,
} from "@/lib/ui/workbenchSessionPreferences";

describe("workbenchSessionPreferences helpers", () => {
  it("round-trips encoded cookie preferences", () => {
    const encoded = serializeWorkbenchSessionPreferencesCookie({
      renderControls: {
        width: 11.5,
        height: 8.25,
        units: "mm",
        renderMode: "manual",
      },
      sketchParamsBySlug: {
        "inset-square": {
          inset: 2.25,
          ringCount: 6,
          showDiagonals: false,
          mode: "turn-on-breach",
        },
      },
      recentSketchSlugs: ["inset-square", "layered-waves"],
      lastViewedAtBySlug: {
        "inset-square": "2026-03-23T15:45:00.000Z",
      },
    });

    expect(parseWorkbenchSessionPreferencesCookie(encoded)).toEqual({
      renderControls: {
        width: 11.5,
        height: 8.25,
        units: "mm",
        renderMode: "manual",
      },
      sketchParamsBySlug: {
        "inset-square": {
          inset: 2.25,
          ringCount: 6,
          showDiagonals: false,
          mode: "turn-on-breach",
        },
      },
      recentSketchSlugs: ["inset-square", "layered-waves"],
      lastViewedAtBySlug: {
        "inset-square": "2026-03-23T15:45:00.000Z",
      },
    });
  });

  it("sanitizes malformed payload values", () => {
    const defaults = createDefaultWorkbenchSessionPreferences();

    expect(
      sanitizeWorkbenchSessionPreferences({
        renderControls: {
          width: Number.NaN,
          height: -2,
          units: "cm",
          renderMode: "auto",
        },
        sketchParamsBySlug: {
          "inset-square": {
            inset: "1.2",
            ringCount: 5,
            showDiagonals: true,
            mode: "turn-on-breach",
            meta: { ignore: true },
          },
          "layered-waves": "invalid",
        },
        recentSketchSlugs: [
          "layered-waves",
          "layered-waves",
          "unknown-sketch",
          "inset-square",
        ],
        lastViewedAtBySlug: {
          "layered-waves": "2026-03-22T18:10:00.000Z",
          "unknown-sketch": "2026-03-20T12:00:00.000Z",
          "inset-square": "not-a-date",
        },
      }),
    ).toEqual({
      renderControls: {
        width: defaults.renderControls.width,
        height: defaults.renderControls.height,
        units: defaults.renderControls.units,
        renderMode: defaults.renderControls.renderMode,
      },
      sketchParamsBySlug: {
        "inset-square": {
          inset: "1.2",
          ringCount: 5,
          showDiagonals: true,
          mode: "turn-on-breach",
        },
      },
      recentSketchSlugs: ["layered-waves", "inset-square"],
      lastViewedAtBySlug: {
        "layered-waves": "2026-03-22T18:10:00.000Z",
      },
    });
  });

  it("returns null for malformed cookie payloads", () => {
    expect(parseWorkbenchSessionPreferencesCookie("%7Bnot-json")).toBeNull();
  });
});
