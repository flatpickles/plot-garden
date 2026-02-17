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
          order: ["plotter", "sketches", "params", "layers"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
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
          order: ["renderControls", "panelSettings"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            renderControls: true,
            panelSettings: true,
          },
        },
      },
      sidebarWidth: 420,
      sidebarHeight: 360,
    });

    expect(parsePanelSectionPreferencesCookie(encoded)).toEqual({
      modes: {
        default: {
          order: ["plotter", "sketches", "params", "layers"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
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
          order: ["renderControls", "panelSettings"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            renderControls: true,
            panelSettings: true,
          },
        },
      },
      sidebarWidth: 420,
      sidebarHeight: 360,
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
          order: ["layers", "plotter", "sketches", "params"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            layers: true,
          },
        },
        help: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.help,
        settings: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.settings,
      },
      sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
      sidebarHeight: null,
    });
  });

  it("migrates legacy settings layout to put render controls first", () => {
    const encoded = encodeURIComponent(
      JSON.stringify({
        modes: {
          settings: {
            order: ["panelSettings"],
            collapsed: {
              panelSettings: true,
            },
          },
        },
      }),
    );

    expect(parsePanelSectionPreferencesCookie(encoded)).toEqual({
      modes: {
        default: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.default,
        help: DEFAULT_PANEL_SECTION_MODE_PREFERENCES.help,
        settings: {
          order: ["renderControls", "panelSettings"],
          collapsed: {
            ...DEFAULT_PANEL_SECTION_COLLAPSED,
            panelSettings: true,
          },
        },
      },
      sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
      sidebarHeight: null,
    });
  });
});
