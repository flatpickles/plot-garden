import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PANEL_SECTION_WIDTH } from "@/lib/ui/panelSectionPreferences";
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
      const raw = window.localStorage.getItem("vibe-plotter.panel-section-preferences");
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw ?? "{}") as {
        order?: string[];
        collapsed?: Record<string, boolean>;
      };
      expect(parsed.order).toEqual([
        "sketches",
        "renderControls",
        "params",
        "layers",
        "plotter",
      ]);
      expect(parsed.collapsed?.renderControls).toBe(true);
      expect(parsed.sidebarWidth).toBe(DEFAULT_PANEL_SECTION_WIDTH);
    });
  });
});
