import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HELP_SECTION_ORDER,
  DEFAULT_PANEL_SECTION_WIDTH,
} from "@/lib/ui/panelSectionPreferences";
import { SketchWorkbench } from "@/lib/ui/SketchWorkbench";

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

describe("SketchWorkbench", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows unavailable plotter control when Web Serial is unsupported", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    expect(await screen.findByRole("button", { name: "Unavailable" })).toBeInTheDocument();
  });

  it("supports manual render dirty flow", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    const modeSelect = (await screen.findAllByLabelText("Render mode"))[0];
    if (!modeSelect) throw new Error("Render mode select not found");
    fireEvent.change(modeSelect, { target: { value: "manual" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rendered" })).toBeDisabled();
    });

    const insetInput = screen.getAllByLabelText("Inset")[0];
    if (!insetInput) throw new Error("Inset input not found");
    fireEvent.change(insetInput, {
      target: { value: "1.4" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Render" })).toBeEnabled();
    });
  });

  it("persists panel section state to localStorage", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Render Controls section" }),
    );

    await waitFor(() => {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          default?: {
            order?: string[];
            collapsed?: Record<string, boolean>;
          };
          help?: {
            order?: string[];
            collapsed?: Record<string, boolean>;
          };
          settings?: {
            order?: string[];
            collapsed?: Record<string, boolean>;
          };
        };
        sidebarWidth?: number;
      };
      expect(parsed.modes?.default?.order).toEqual([
        "sketches",
        "renderControls",
        "params",
        "layers",
        "plotter",
      ]);
      expect(parsed.modes?.default?.collapsed?.renderControls).toBe(true);
      expect(parsed.modes?.help?.order).toEqual(DEFAULT_HELP_SECTION_ORDER);
      expect(parsed.modes?.settings?.order).toEqual(["panelSettings"]);
      expect(parsed.sidebarWidth).toBe(DEFAULT_PANEL_SECTION_WIDTH);
    });
  });

  it("persists settings panel section state to localStorage", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse Reset Plot Garden section" }),
    );

    await waitFor(() => {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          settings?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.settings?.collapsed?.panelSettings).toBe(true);
    });
  });

  it("requires a confirmation click before resetting panel layout", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse Render Controls section" }),
    );

    await waitFor(() => {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          default?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.default?.collapsed?.renderControls).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(await screen.findByText("Reset Plot Garden", { selector: "button" }));
    expect(screen.getByText("Reset Plot Garden", { selector: "button" })).toBeInTheDocument();

    {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          default?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.default?.collapsed?.renderControls).toBe(true);
    }

    fireEvent.click(screen.getByText("Reset Plot Garden", { selector: "button" }));

    await waitFor(() => {
      expect(screen.getByText("Reset Plot Garden", { selector: "button" })).toBeInTheDocument();

      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          default?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.default?.collapsed?.renderControls).toBe(false);
    });
  });
});
