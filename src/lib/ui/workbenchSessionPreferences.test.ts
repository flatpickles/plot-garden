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
        },
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
        },
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
            meta: { ignore: true },
          },
          "layered-waves": "invalid",
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
          ringCount: 5,
          showDiagonals: true,
        },
      },
    });
  });

  it("returns null for malformed cookie payloads", () => {
    expect(parseWorkbenchSessionPreferencesCookie("%7Bnot-json")).toBeNull();
  });
});
