import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SketchWorkbench } from "@/lib/ui/SketchWorkbench";

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

describe("SketchWorkbench", () => {
  it("shows fallback plotting message when Web Serial is unavailable", async () => {
    render(<SketchWorkbench initialSlug="inset-square" />);

    expect(
      await screen.findByText(/Web Serial is unavailable here/i),
    ).toBeInTheDocument();
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
});
