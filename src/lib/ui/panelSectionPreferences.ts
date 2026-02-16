export type PanelSectionId =
  | "sketches"
  | "renderControls"
  | "params"
  | "layers"
  | "plotter";

export type PanelSectionPreferences = {
  order: PanelSectionId[];
  collapsed: Record<PanelSectionId, boolean>;
};

export const PANEL_SECTION_PREFS_STORAGE_KEY = "vibe-plotter.panel-section-preferences";
export const PANEL_SECTION_PREFS_COOKIE_KEY = "vibe-plotter.panel-section-preferences";

export const DEFAULT_PANEL_SECTION_ORDER: PanelSectionId[] = [
  "sketches",
  "renderControls",
  "params",
  "layers",
  "plotter",
];

export const DEFAULT_PANEL_SECTION_COLLAPSED: Record<PanelSectionId, boolean> = {
  sketches: false,
  renderControls: false,
  params: false,
  layers: false,
  plotter: false,
};

const PANEL_SECTION_IDS = new Set<PanelSectionId>(DEFAULT_PANEL_SECTION_ORDER);

export function isPanelSectionId(value: unknown): value is PanelSectionId {
  return typeof value === "string" && PANEL_SECTION_IDS.has(value as PanelSectionId);
}

export function sanitizePanelSectionOrder(value: unknown): PanelSectionId[] {
  if (!Array.isArray(value)) return [...DEFAULT_PANEL_SECTION_ORDER];

  const next: PanelSectionId[] = [];
  const seen = new Set<PanelSectionId>();

  for (const candidate of value) {
    if (!isPanelSectionId(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    next.push(candidate);
  }

  for (const id of DEFAULT_PANEL_SECTION_ORDER) {
    if (!seen.has(id)) next.push(id);
  }

  return next;
}

export function sanitizePanelSectionCollapsed(
  value: unknown,
): Record<PanelSectionId, boolean> {
  const next = { ...DEFAULT_PANEL_SECTION_COLLAPSED };
  if (!value || typeof value !== "object") return next;

  const record = value as Record<string, unknown>;
  for (const sectionId of DEFAULT_PANEL_SECTION_ORDER) {
    const candidate = record[sectionId];
    if (typeof candidate === "boolean") {
      next[sectionId] = candidate;
    }
  }

  return next;
}

export function sanitizePanelSectionPreferences(value: unknown): PanelSectionPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    order: sanitizePanelSectionOrder(record.order),
    collapsed: sanitizePanelSectionCollapsed(record.collapsed),
  };
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parsePanelSectionPreferencesCookie(
  value: string | undefined | null,
): PanelSectionPreferences | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeCookieValue(value)) as unknown;
    return sanitizePanelSectionPreferences(parsed);
  } catch {
    return null;
  }
}

export function serializePanelSectionPreferencesCookie(
  preferences: PanelSectionPreferences,
): string {
  const safe = sanitizePanelSectionPreferences(preferences);
  return encodeURIComponent(JSON.stringify(safe));
}
