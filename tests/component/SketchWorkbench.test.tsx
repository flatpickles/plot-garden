import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HELP_SECTION_ORDER,
  DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
  DEFAULT_SETTINGS_SECTION_ORDER,
  DEFAULT_PANEL_SECTION_WIDTH,
} from "@/lib/ui/panelSectionPreferences";
import {
  resetClientSketchSortModeForTests,
  SketchWorkbench,
} from "@/lib/ui/SketchWorkbench";
import { WORKBENCH_SESSION_STORAGE_KEY } from "@/lib/ui/workbenchSessionPreferences";
import { sketchRegistry } from "@/generated/sketch-registry";

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

describe("SketchWorkbench", () => {
  const getSketchListTitles = () => {
    const sketchList = screen.getByTestId("sketch-list");
    return within(sketchList)
      .getAllByRole("button")
      .map((button) => button.firstElementChild?.textContent?.trim() ?? "");
  };

  beforeEach(() => {
    window.localStorage.clear();
    resetClientSketchSortModeForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      expect(screen.getByText("Render", { selector: "button" })).toBeEnabled();
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
      expect(screen.getByText("Render", { selector: "button" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close panel settings" }));

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    await waitFor(() => {
      expect(screen.getByText("Render", { selector: "button" })).toBeEnabled();
    });
  });

  it("enables reset params only after params differ from defaults", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
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
      name: "Expand Parameters section",
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
      name: "Expand Parameters section",
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

  it("persists render controls to shared workbench session storage", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.change(await screen.findByLabelText("Render mode"), {
      target: { value: "manual" },
    });
    fireEvent.change(screen.getByLabelText("Canvas width"), {
      target: { value: "9.5" },
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY);
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        renderControls?: { width?: number; renderMode?: string };
      };
      expect(parsed.renderControls?.width).toBe(9.5);
      expect(parsed.renderControls?.renderMode).toBe("manual");
    });
  });

  it("persists sketch params per slug between sessions", async () => {
    const insetRender = render(<SketchWorkbench initialSlug="inset-square" />);
    const expandInsetParamsButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
    });
    if (expandInsetParamsButton) {
      fireEvent.click(expandInsetParamsButton);
    }
    fireEvent.change(screen.getByLabelText("Inset"), {
      target: { value: "1.8" },
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? "{}") as {
        sketchParamsBySlug?: Record<string, Record<string, number | boolean | string>>;
      };
      expect(parsed.sketchParamsBySlug?.["inset-square"]?.inset).toBe(1.8);
    });

    insetRender.unmount();

    const wavesRender = render(<SketchWorkbench initialSlug="layered-waves" />);
    const expandWaveParamsButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
    });
    if (expandWaveParamsButton) {
      fireEvent.click(expandWaveParamsButton);
    }
    fireEvent.change(screen.getByLabelText("Waves"), {
      target: { value: "12" },
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? "{}") as {
        sketchParamsBySlug?: Record<string, Record<string, number | boolean | string>>;
      };
      expect(parsed.sketchParamsBySlug?.["layered-waves"]?.waveCount).toBe(12);
    });

    wavesRender.unmount();

    render(<SketchWorkbench initialSlug="inset-square" />);
    const expandInsetParamsAgainButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
    });
    if (expandInsetParamsAgainButton) {
      fireEvent.click(expandInsetParamsAgainButton);
    }

    await waitFor(() => {
      expect((screen.getByLabelText("Inset") as HTMLInputElement).value).toBe("1.8");
    });
  });

  it("renders and persists select sketch params", async () => {
    render(<SketchWorkbench initialSlug="nebulous" />);

    const expandParamsButton = screen.queryByRole("button", {
      name: "Expand Parameters section",
    });
    if (expandParamsButton) {
      fireEvent.click(expandParamsButton);
    }

    const tieBreakSelect = screen.getByLabelText("Tie-break Mode") as HTMLSelectElement;
    expect(tieBreakSelect.value).toBe("prefer-current");

    fireEvent.change(tieBreakSelect, {
      target: { value: "nearest-valid" },
    });

    await waitFor(() => {
      expect((screen.getByLabelText("Tie-break Mode") as HTMLSelectElement).value).toBe(
        "nearest-valid",
      );

      const raw = window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? "{}") as {
        sketchParamsBySlug?: Record<string, Record<string, number | boolean | string>>;
      };
      expect(parsed.sketchParamsBySlug?.nebulous?.tieBreakMode).toBe("nearest-valid");
    });
  });

  it("restores saved render controls from shared workbench session storage", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 10.25,
          height: 7.75,
          units: "mm",
          renderMode: "manual",
        },
        sketchParamsBySlug: {},
      }),
    );

    render(<SketchWorkbench initialSlug="inset-square" />);
    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));

    await waitFor(() => {
      expect((screen.getByLabelText("Canvas width") as HTMLInputElement).value).toBe("10.25");
      expect((screen.getByLabelText("Render mode") as HTMLSelectElement).value).toBe(
        "manual",
      );
    });
  });

  it("defaults sketch sorting to recent and keeps the selected sketch first", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["layered-waves", "inset-square", "aurora-topography"],
      }),
    );

    const view = render(<SketchWorkbench initialSlug="aurora-topography" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by most recently viewed" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    expect(getSketchListTitles()).toEqual([
      "Aurora Topography",
      "Layered Waves",
      "Inset Square Study",
      "Nebulous",
    ]);
  });

  it("reorders sketches when switching to published sort", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["layered-waves", "aurora-topography"],
      }),
    );

    const view = render(<SketchWorkbench initialSlug="aurora-topography" />);

    await waitFor(() => {
      expect(getSketchListTitles()[0]).toBe("Aurora Topography");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort sketches by publish date" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by publish date" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(getSketchListTitles()).toEqual([
        "Nebulous",
        "Inset Square Study",
        "Layered Waves",
        "Aurora Topography",
      ]);
    });
  });

  it("shows the sketch creation date in the list meta line", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 23));

    render(<SketchWorkbench initialSlug="inset-square" />);

    const sketchList = screen.getByTestId("sketch-list");
    const insetSketchButton = within(sketchList).getByRole("button", {
      name: /Inset Square Study/i,
    });

    expect(insetSketchButton).toHaveTextContent("March 23");
    expect(within(sketchList).queryByText("inset-square")).not.toBeInTheDocument();
  });

  it("includes the year for sketch dates older than one year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 23));

    const insetSketch = sketchRegistry.find((entry) => entry.manifest.slug === "inset-square");
    expect(insetSketch).toBeDefined();

    const originalPublishedAt = insetSketch!.manifest.publishedAt;
    insetSketch!.manifest.publishedAt = "2025-03-22";

    try {
      render(<SketchWorkbench initialSlug="inset-square" />);

      const sketchList = screen.getByTestId("sketch-list");
      const insetSketchButton = within(sketchList).getByRole("button", {
        name: /Inset Square Study/i,
      });

      expect(insetSketchButton).toHaveTextContent("March 22, 2025");
    } finally {
      insetSketch!.manifest.publishedAt = originalPublishedAt;
    }
  });

  it("shows viewed timestamps in recent sort mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 23, 9, 30));

    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["layered-waves", "aurora-topography"],
        lastViewedAtBySlug: {
          "layered-waves": "2026-03-22T22:15:00.000Z",
          "aurora-topography": "2025-03-20T22:15:00.000Z",
        },
      }),
    );

    render(<SketchWorkbench initialSlug="inset-square" />);
    await act(async () => {
      vi.runAllTimers();
    });

    const sketchList = screen.getByTestId("sketch-list");
    const layeredWavesButton = within(sketchList).getByRole("button", {
      name: /Layered Waves/i,
    });

    expect(layeredWavesButton).toHaveTextContent("March 23 • Viewed Mar 22, 3:15 PM");
  });

  it("hides viewed timestamps when published sort is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 23, 9, 30));

    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["layered-waves", "aurora-topography"],
        lastViewedAtBySlug: {
          "layered-waves": "2026-03-22T22:15:00.000Z",
        },
      }),
    );

    render(<SketchWorkbench initialSlug="inset-square" />);
    await act(async () => {
      vi.runAllTimers();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort sketches by publish date" }));
    expect(screen.queryByText(/Viewed /)).not.toBeInTheDocument();
  });

  it("persists the selected sketch view timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 23, 9, 30));

    render(<SketchWorkbench initialSlug="inset-square" />);
    await act(async () => {
      vi.runAllTimers();
    });

    const raw = window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY);
    expect(raw).toBeTruthy();

    const parsed = JSON.parse(raw ?? "{}") as {
      lastViewedAtBySlug?: Record<string, string>;
    };

    expect(parsed.lastViewedAtBySlug?.["inset-square"]).toBe("2026-03-23T16:30:00.000Z");
  });

  it("clears the active sort after selecting a sketch that is not first", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["aurora-topography", "layered-waves", "inset-square"],
      }),
    );

    const view = render(<SketchWorkbench initialSlug="aurora-topography" />);

    await waitFor(() => {
      expect(getSketchListTitles()).toEqual([
        "Aurora Topography",
        "Layered Waves",
        "Inset Square Study",
        "Nebulous",
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: /Layered Waves/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by most recently viewed" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByRole("button", { name: "Sort sketches by publish date" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(getSketchListTitles()).toEqual([
        "Aurora Topography",
        "Layered Waves",
        "Inset Square Study",
        "Nebulous",
      ]);
    });

    const sketchList = screen.getByTestId("sketch-list");
    const auroraButton = within(sketchList).getByRole("button", {
      name: /Aurora Topography/i,
    });
    expect(auroraButton).toHaveTextContent(/Viewed /);

    view.unmount();
    render(<SketchWorkbench initialSlug="layered-waves" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by most recently viewed" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByRole("button", { name: "Sort sketches by publish date" }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(getSketchListTitles()).toEqual([
        "Aurora Topography",
        "Layered Waves",
        "Inset Square Study",
        "Nebulous",
      ]);
    });
  });

  it("reapplies recent sorting when clicking the left sort button again", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 8,
          height: 6,
          units: "in",
          renderMode: "live",
        },
        sketchParamsBySlug: {},
        recentSketchSlugs: ["aurora-topography", "layered-waves", "inset-square"],
      }),
    );

    render(<SketchWorkbench initialSlug="aurora-topography" />);

    fireEvent.click(screen.getByRole("button", { name: /Layered Waves/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by most recently viewed" }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort sketches by most recently viewed" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Sort sketches by most recently viewed" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(getSketchListTitles()).toEqual([
        "Layered Waves",
        "Aurora Topography",
        "Inset Square Study",
        "Nebulous",
      ]);
    });
  });

  it("applies search filtering in both sketch sort modes", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sketches" }), {
      target: { value: "waves" },
    });

    await waitFor(() => {
      expect(getSketchListTitles()).toEqual(["Layered Waves"]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort sketches by publish date" }));

    await waitFor(() => {
      expect(getSketchListTitles()).toEqual(["Layered Waves"]);
    });
  });

  it("scrolls the selected sketch into view on initial render", async () => {
    const scrolledElements: HTMLElement[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolledElements.push(this);
    });

    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    try {
      render(<SketchWorkbench initialSlug="layered-waves" />);

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "nearest",
        });
      });

      expect(scrolledElements).toContain(
        screen.getByRole("button", { name: /Layered Waves/i }),
      );
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: originalScrollIntoView,
      });
    }
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
      await screen.findByRole("button", { name: "Collapse Render section" }),
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
      await screen.findByRole("button", { name: "Collapse Render section" }),
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
      await screen.findByRole("button", { name: "Collapse Render section" }),
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

  it("clears workbench and plotter persistence when resetting plot garden", async () => {
    window.localStorage.setItem(
      WORKBENCH_SESSION_STORAGE_KEY,
      JSON.stringify({
        renderControls: {
          width: 10.25,
          height: 7.75,
          units: "mm",
          renderMode: "manual",
        },
        sketchParamsBySlug: {
          "inset-square": {
            inset: 1.8,
          },
        },
      }),
    );
    window.localStorage.setItem(
      "plot-garden.plotter-config",
      JSON.stringify({
        model: "A3",
        speedPenDown: 50,
        speedPenUp: 50,
        penUpDelayMs: 250,
        penDownDelayMs: 250,
        repeatCount: 2,
      }),
    );

    render(<SketchWorkbench initialSlug="inset-square" />);
    fireEvent.click(screen.getByRole("button", { name: "Open panel settings" }));
    fireEvent.click(await screen.findByText("Reset Plot Garden", { selector: "button" }));
    fireEvent.click(screen.getByText("Reset Plot Garden", { selector: "button" }));

    await waitFor(() => {
      expect(window.localStorage.getItem(WORKBENCH_SESSION_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem("plot-garden.plotter-config")).toBeNull();
      expect((screen.getByLabelText("Canvas width") as HTMLInputElement).value).toBe("8");
      expect((screen.getByLabelText("Render mode") as HTMLSelectElement).value).toBe("live");
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
