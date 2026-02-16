import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_SECTION_COLLAPSED,
  DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
  DEFAULT_PANEL_SECTION_WIDTH,
  parsePanelSectionPreferencesCookie,
  serializePanelSectionPreferencesCookie,
} from "@/lib/ui/panelSectionPreferences";

describe("panelSectionPreferences cookie helpers", () => {
  it("round-trips encoded cookie preferences", () => {
    const encoded = serializePanelSectionPreferencesCookie({
      modes: {
        default: {
          order: ["plotter", "sketches", "renderControls", "params", "layers"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            renderControls: true,
            layers: true,
            plotter: true,
          },
        },
        help: {
          order: ["aboutPlotGarden", "helpOverview"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            helpOverview: true,
            aboutPlotGarden: true,
          },
        },
        settings: {
          order: ["panelSettings"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            panelSettings: true,
          },
        },
      },
      sidebarWidth: 420,
    });

    expect(parsePanelSectionPreferencesCookie(encoded)).toEqual({
      modes: {
        default: {
          order: ["plotter", "sketches", "renderControls", "params", "layers"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            renderControls: true,
            layers: true,
            plotter: true,
          },
        },
        help: {
          order: ["aboutPlotGarden", "helpOverview"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            helpOverview: true,
            aboutPlotGarden: true,
          },
        },
        settings: {
          order: ["panelSettings"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            panelSettings: true,
          },
        },
      },
      sidebarWidth: 420,
    });
  });

  it("sanitizes malformed legacy cookie preferences", () => {
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
      modes: {
        default: {
          order: ["layers", "plotter", "sketches", "renderControls", "params"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            layers: true,
          },
        },
        help: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.help,
        settings: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.settings,
      },
      sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
    });
  });
});
