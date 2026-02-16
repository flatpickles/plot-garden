import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_SECTION_WIDTH,
  parsePanelSectionPreferencesCookie,
  serializePanelSectionPreferencesCookie,
} from "@/lib/ui/panelSectionPreferences";

describe("panelSectionPreferences cookie helpers", () => {
  it("round-trips encoded cookie preferences", () => {
    const encoded = serializePanelSectionPreferencesCookie({
      order: ["plotter", "sketches", "renderControls", "params", "layers"],
      collapsed: {
        sketches: false,
        renderControls: true,
        params: false,
        layers: true,
        plotter: true,
      },
      sidebarWidth: 420,
    });

    expect(parsePanelSectionPreferencesCookie(encoded)).toEqual({
      order: ["plotter", "sketches", "renderControls", "params", "layers"],
      collapsed: {
        sketches: false,
        renderControls: true,
        params: false,
        layers: true,
        plotter: true,
      },
      sidebarWidth: 420,
    });
  });

  it("sanitizes malformed cookie preferences", () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        order: ["layers", "nope", "plotter"],
        collapsed: {
          layers: true,
          plotter: "yes",
        },
      }),
    );

    expect(parsePanelSectionPreferencesCookie(encoded)).toEqual({
      order: ["layers", "plotter", "sketches", "renderControls", "params"],
      collapsed: {
        sketches: false,
        renderControls: false,
        params: false,
        layers: true,
        plotter: false,
      },
      sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
    });
  });
});
