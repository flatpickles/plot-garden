import type { SketchParamValue, Unit } from "@/lib/sketch-core/types";
import {
  DEFAULT_CONTEXT,
  DEFAULT_RENDER_MODE,
} from "@/lib/ui/sketchRenderBootstrap";

export type RenderMode = "live" | "manual";

export type WorkbenchRenderControls = {
  width: number;
  height: number;
  units: Unit;
  renderMode: RenderMode;
};

export type WorkbenchSessionPreferences = {
  renderControls: WorkbenchRenderControls;
  sketchParamsBySlug: Record<string, Record<string, SketchParamValue>>;
};

export const WORKBENCH_SESSION_STORAGE_KEY = "plot-garden.workbench-session-preferences";
export const WORKBENCH_SESSION_COOKIE_KEY = "plot-garden.workbench-session-preferences";

function sanitizeFiniteDimension(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function sanitizeUnits(value: unknown): Unit {
  return value === "in" || value === "mm" ? value : DEFAULT_CONTEXT.units;
}

function sanitizeRenderMode(value: unknown): RenderMode {
  return value === "live" || value === "manual" ? value : DEFAULT_RENDER_MODE;
}

function sanitizeSketchParamsBySlug(
  value: unknown,
): Record<string, Record<string, SketchParamValue>> {
  if (!value || typeof value !== "object") return {};

  const bySlug = value as Record<string, unknown>;
  const next: Record<string, Record<string, SketchParamValue>> = {};

  for (const [slug, rawParams] of Object.entries(bySlug)) {
    if (!slug || !rawParams || typeof rawParams !== "object") continue;
    const rawRecord = rawParams as Record<string, unknown>;
    const safeParams: Record<string, SketchParamValue> = {};

    for (const [paramKey, rawValue] of Object.entries(rawRecord)) {
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        safeParams[paramKey] = rawValue;
        continue;
      }
      if (typeof rawValue === "boolean") {
        safeParams[paramKey] = rawValue;
      }
    }

    if (Object.keys(safeParams).length > 0) {
      next[slug] = safeParams;
    }
  }

  return next;
}

export function createDefaultWorkbenchSessionPreferences(): WorkbenchSessionPreferences {
  return {
    renderControls: {
      width: DEFAULT_CONTEXT.width,
      height: DEFAULT_CONTEXT.height,
      units: DEFAULT_CONTEXT.units,
      renderMode: DEFAULT_RENDER_MODE,
    },
    sketchParamsBySlug: {},
  };
}

export function sanitizeWorkbenchSessionPreferences(
  value: unknown,
): WorkbenchSessionPreferences {
  const defaults = createDefaultWorkbenchSessionPreferences();
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const renderControlsRecord =
    record.renderControls && typeof record.renderControls === "object"
      ? (record.renderControls as Record<string, unknown>)
      : {};

  return {
    renderControls: {
      width: sanitizeFiniteDimension(renderControlsRecord.width, defaults.renderControls.width),
      height: sanitizeFiniteDimension(renderControlsRecord.height, defaults.renderControls.height),
      units: sanitizeUnits(renderControlsRecord.units),
      renderMode: sanitizeRenderMode(renderControlsRecord.renderMode),
    },
    sketchParamsBySlug: sanitizeSketchParamsBySlug(record.sketchParamsBySlug),
  };
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseWorkbenchSessionPreferencesCookie(
  value: string | undefined | null,
): WorkbenchSessionPreferences | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeCookieValue(value)) as unknown;
    return sanitizeWorkbenchSessionPreferences(parsed);
  } catch {
    return null;
  }
}

export function serializeWorkbenchSessionPreferencesCookie(
  preferences: WorkbenchSessionPreferences,
): string {
  const safe = sanitizeWorkbenchSessionPreferences(preferences);
  return encodeURIComponent(JSON.stringify(safe));
}

export function isDefaultWorkbenchSessionPreferences(
  value: WorkbenchSessionPreferences,
): boolean {
  return (
    value.renderControls.width === DEFAULT_CONTEXT.width &&
    value.renderControls.height === DEFAULT_CONTEXT.height &&
    value.renderControls.units === DEFAULT_CONTEXT.units &&
    value.renderControls.renderMode === DEFAULT_RENDER_MODE &&
    Object.keys(value.sketchParamsBySlug).length === 0
  );
}
