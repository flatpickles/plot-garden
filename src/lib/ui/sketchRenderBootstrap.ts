import type { SketchRegistryEntry } from "@/generated/sketch-registry";
import type { PlotterConfig } from "@/lib/plotter";
import { DEFAULT_PLOTTER_CONFIG, createPlotJobPlan } from "@/lib/plotter";
import type { PlotJobPlan, PlotLayerMode } from "@/lib/plotter/types";
import {
  normalizeSketchOutput,
} from "@/lib/sketch-core/normalizeSketchOutput";
import type {
  NormalizedSketchDocument,
  SketchParamValue,
  SketchRenderContext,
  SketchParamValues,
} from "@/lib/sketch-core/types";
import type { WorkbenchRenderControls } from "@/lib/ui/workbenchSessionPreferences";

export const DEFAULT_CONTEXT: SketchRenderContext = {
  width: 8,
  height: 6,
  units: "in",
};

export const DEFAULT_LAYER_MODE: PlotLayerMode = "ordered";

export const DEFAULT_RENDER_MODE: "live" | "manual" = "live";

export type SketchRenderSeed = {
  draftParams: Record<string, SketchParamValue>;
  renderedParams: Record<string, SketchParamValue>;
  draftContext: SketchRenderContext;
  renderedContext: SketchRenderContext;
  normalizedDocument: NormalizedSketchDocument | null;
  layerMode: PlotLayerMode;
  renderMode: "live" | "manual";
  plotterConfig: PlotterConfig;
  seededJobPlan?: PlotJobPlan | null;
  renderError?: string | null;
};

export type ComputeSketchInitialRenderStateOptions = {
  persistedRenderControls?: WorkbenchRenderControls | null;
  persistedParams?: Record<string, SketchParamValue> | null;
};

export async function computeSketchInitialRenderState(
  entry: SketchRegistryEntry,
  options?: ComputeSketchInitialRenderStateOptions,
): Promise<SketchRenderSeed> {
  const sketch = new entry.Sketch();
  const draftParams = sketch.coerceParams(
    (options?.persistedParams ?? sketch.getDefaultParams()) as Record<string, unknown>,
  ) as Record<string, SketchParamValue>;
  const draftContext = {
    width: options?.persistedRenderControls?.width ?? DEFAULT_CONTEXT.width,
    height: options?.persistedRenderControls?.height ?? DEFAULT_CONTEXT.height,
    units: options?.persistedRenderControls?.units ?? DEFAULT_CONTEXT.units,
  };
  const renderMode = options?.persistedRenderControls?.renderMode ?? DEFAULT_RENDER_MODE;

  try {
    const output = await sketch.render(
      draftParams as SketchParamValues,
      draftContext,
    );
    const normalizedDocument = await normalizeSketchOutput(output, draftContext);

    const seededJobPlan = createPlotJobPlan(
      normalizedDocument,
      DEFAULT_LAYER_MODE,
      DEFAULT_PLOTTER_CONFIG,
    );

    return {
      draftParams,
      renderedParams: { ...draftParams },
      draftContext,
      renderedContext: { ...draftContext },
      normalizedDocument,
      layerMode: DEFAULT_LAYER_MODE,
      renderMode,
      plotterConfig: DEFAULT_PLOTTER_CONFIG,
      seededJobPlan,
      renderError: null,
    };
  } catch (error) {
    const fallbackRenderedParams: Record<string, SketchParamValue> = {};

    return {
      draftParams,
      renderedParams: fallbackRenderedParams,
      draftContext,
      renderedContext: { ...draftContext },
      normalizedDocument: null,
      layerMode: DEFAULT_LAYER_MODE,
      renderMode,
      plotterConfig: DEFAULT_PLOTTER_CONFIG,
      seededJobPlan: null,
      renderError: error instanceof Error ? error.message : "Render failed",
    };
  }
}
