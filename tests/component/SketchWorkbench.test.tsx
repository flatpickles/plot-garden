import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HELP_SECTION_ORDER,
  DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
  DEFAULT_SETTINGS_SECTION_ORDER,
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
    fireEvent.click(screen.getByRole("button", { name: "Expand Plotter section" }));

    expect(await screen.findByRole("button", { name: "Unavailable" })).toBeInTheDocument();
  });

  it("supports manual render dirty flow", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    const modeSelect = await screen.findByLabelText("Render mode");
    fireEvent.change(modeSelect, { target: { value: "manual" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rendered" })).toBeDisabled();
    });

    const widthInput = screen.getByLabelText("Canvas width");
    fireEvent.change(widthInput, {
      target: { value: "9" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Render" })).toBeEnabled();
    });
  });

  it("shows export section in settings", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));

    expect(
      await screen.findByRole("button", { name: "Collapse Export section" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download SVG" })).toBeInTheDocument();
  });

  it("shows the params render button only in manual mode", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);
    expect(screen.queryByRole("button", { name: "Rendered" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    const modeSelect = await screen.findByLabelText("Render mode");
    fireEvent.change(modeSelect, { target: { value: "manual" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rendered" })).toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText("Canvas width"), {
      target: { value: "9" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Render" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close panel settings" }));

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Sketch Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Render" })).toBeEnabled();
    });
  });

  it("enables reset params only after params differ from defaults", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Sketch Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    const resetParamsButton = screen.getByRole("button", { name: "Reset Params" });
    expect(resetParamsButton).toBeDisabled();

    const firstParamInput = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const defaultValue = firstParamInput.value;
    const changedValue = defaultValue === "1" ? "2" : "1";
    fireEvent.change(firstParamInput, { target: { value: changedValue } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reset Params" })).toBeEnabled();
    });
  });

  it("requires a confirmation click before resetting sketch params", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Sketch Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    const firstParamInput = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const defaultValue = firstParamInput.value;
    const changedValue = defaultValue === "1" ? "2" : "1";
    fireEvent.change(firstParamInput, { target: { value: changedValue } });

    const resetParamsButton = screen.getByRole("button", { name: "Reset Params" });
    await waitFor(() => {
      expect(resetParamsButton).toBeEnabled();
    });

    fireEvent.click(resetParamsButton);
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe(changedValue);

    fireEvent.click(resetParamsButton);
    await waitFor(() => {
      expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe(
        defaultValue,
      );
      expect(screen.getByRole("button", { name: "Reset Params" })).toBeDisabled();
    });
  });

  it("cancels reset params confirmation when clicking outside the reset button", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Sketch Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    const firstParamInput = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    const defaultValue = firstParamInput.value;
    const changedValue = defaultValue === "1" ? "2" : "1";
    fireEvent.change(firstParamInput, { target: { value: changedValue } });

    const resetParamsButton = screen.getByRole("button", { name: "Reset Params" });
    await waitFor(() => {
      expect(resetParamsButton).toBeEnabled();
    });

    fireEvent.click(resetParamsButton);
    fireEvent.pointerDown(document.body);
    fireEvent.click(resetParamsButton);
    expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe(changedValue);

    fireEvent.click(resetParamsButton);
    await waitFor(() => {
      expect((screen.getAllByRole("spinbutton")[0] as HTMLInputElement).value).toBe(
        defaultValue,
      );
    });
  });

  it("persists panel section state to localStorage", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Sketches section" }));

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
        sidebarHeight?: number | null;
      };
      expect(parsed.modes?.default?.order).toEqual([
        "sketches",
        "layers",
        "params",
        "plotter",
      ]);
      expect(parsed.modes?.default?.collapsed?.sketches).toBe(true);
      expect(parsed.modes?.help?.order).toEqual(DEFAULT_HELP_SECTION_ORDER);
      expect(parsed.modes?.settings?.order).toEqual(DEFAULT_SETTINGS_SECTION_ORDER);
      expect(parsed.sidebarWidth).toBe(DEFAULT_PANEL_SECTION_WIDTH);
      expect(parsed.sidebarHeight).toBeNull();
    });
  });

  it("persists settings panel section state to localStorage", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse Render Controls section" }),
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
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(true);
    });
  });

  it("requires a confirmation click before resetting panel layout", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse Render Controls section" }),
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
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(true);
    });

    fireEvent.click(await screen.findByText("Reset Plot Garden", { selector: "button" }));
    expect(screen.getByText("Reset Plot Garden", { selector: "button" })).toBeInTheDocument();

    {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          settings?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(true);
    }

    fireEvent.click(screen.getByText("Reset Plot Garden", { selector: "button" }));

    await waitFor(() => {
      expect(screen.getByText("Reset Plot Garden", { selector: "button" })).toBeInTheDocument();

      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          settings?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(false);
    });
  });

  it("cancels reset confirmation when clicking outside the reset button", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Collapse Render Controls section" }),
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
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(true);
    });

    fireEvent.click(await screen.findByText("Reset Plot Garden", { selector: "button" }));
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByText("Reset Plot Garden", { selector: "button" }));

    {
      const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        modes?: {
          settings?: {
            collapsed?: Record<string, boolean>;
          };
        };
      };
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(true);
    }

    fireEvent.click(screen.getByText("Reset Plot Garden", { selector: "button" }));

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
      expect(parsed.modes?.settings?.collapsed?.renderControls).toBe(false);
    });
  });

  it("starts narrow layout at an even split and uses a horizontal separator", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 480,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    try {
      const { container } = render(<SketchWorkbench initialSlug="inset-square" />);
      const separator = screen.getByRole("separator", { name: "Resize control panel" });
      const shell = container.firstElementChild as HTMLElement;

      await waitFor(() => {
        expect(separator).toHaveAttribute("aria-orientation", "horizontal");
      });

      await waitFor(() => {
        expect(shell.style.getPropertyValue("--panel-section-height")).toBe("400px");
      });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalHeight,
      });
    }
  });

  it("applies seeded mobile split height on initial render", () => {
    const { container } = render(
      <SketchWorkbench
        initialSlug="inset-square"
        initialPanelSectionPreferences={{
          modes: DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
          sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
          sidebarHeight: 310,
        }}
      />,
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.style.getPropertyValue("--panel-section-height")).toBe("310px");
  });

  it("restores saved narrow split height from localStorage", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 480,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });

    window.localStorage.setItem(
      "plot-garden.panel-section-preferences",
      JSON.stringify({
        modes: {
          default: {
            order: ["sketches", "layers", "params", "plotter"],
            collapsed: {},
          },
          help: {
            order: ["aboutPlotGarden", "helpOverview"],
            collapsed: {},
          },
          settings: {
            order: ["renderControls", "export", "panelSettings"],
            collapsed: {},
          },
        },
        sidebarWidth: DEFAULT_PANEL_SECTION_WIDTH,
        sidebarHeight: 310,
      }),
    );

    try {
      const { container } = render(<SketchWorkbench initialSlug="inset-square" />);
      const shell = container.firstElementChild as HTMLElement;

      await waitFor(() => {
        expect(shell.style.getPropertyValue("--panel-section-height")).toBe("310px");
      });

      await waitFor(() => {
        const raw = window.localStorage.getItem("plot-garden.panel-section-preferences");
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw ?? "{}") as { sidebarHeight?: number | null };
        expect(parsed.sidebarHeight).toBe(310);
      });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        writable: true,
        value: originalHeight,
      });
    }
  });
});
