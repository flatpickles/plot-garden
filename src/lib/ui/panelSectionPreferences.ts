export type ControlPanelView = "default" | "help" | "settings";

export type PanelSectionId =
  | "sketches"
  | "renderControls"
  | "params"
  | "layers"
  | "plotter"
  | "helpOverview"
  | "aboutPlotGarden"
  | "panelSettings";

export type PanelSectionModePreferences = {
  order: PanelSectionId[];
  collapsed: Record<PanelSectionId, boolean>;
};

export type PanelSectionPreferences = {
  modes: Record<ControlPanelView, PanelSectionModePreferences>;
  sidebarWidth: number;
};

export const PANEL_SECTION_PREFS_STORAGE_KEY = "plot-garden.panel-section-preferences";
export const PANEL_SECTION_PREFS_COOKIE_KEY = "plot-garden.panel-section-preferences";
export const DEFAULT_PANEL_SECTION_WIDTH = 340;

export const DEFAULT_PANEL_SECTION_ORDER: PanelSectionId[] = [
  "sketches",
  "renderControls",
  "params",
  "layers",
  "plotter",
];
export const DEFAULT_HELP_SECTION_ORDER: PanelSectionId[] = ["aboutPlotGarden", "helpOverview"];
export const DEFAULT_SETTINGS_SECTION_ORDER: PanelSectionId[] = ["panelSettings"];

export const PANEL_SECTION_ORDER_BY_VIEW: Record<ControlPanelView, PanelSectionId[]> = {
  default: DEFAULT_PANEL_SECTION_ORDER,
  help: DEFAULT_HELP_SECTION_ORDER,
  settings: DEFAULT_SETTINGS_SECTION_ORDER,
};

export const DEFAULT_PANEL_SECTION_COLLAPSED: Record<PanelSectionId, boolean> = {
  sketches: false,
  renderControls: false,
  params: false,
  layers: false,
  plotter: false,
  helpOverview: false,
  aboutPlotGarden: false,
  panelSettings: false,
};

export const DEFAULT_PANEL_SECTION_MODE_PREFERENCES: Record<
  ControlPanelView,
  PanelSectionModePreferences
> = {
  default: {
    order: [...DEFAULT_PANEL_SECTION_ORDER],
    collapsed: { ...DEFAULT_PANEL_SECTION_COLLAPSED },
  },
  help: {
    order: [...DEFAULT_HELP_SECTION_ORDER],
    collapsed: { ...DEFAULT_PANEL_SECTION_COLLAPSED },
  },
  settings: {
    order: [...DEFAULT_SETTINGS_SECTION_ORDER],
    collapsed: { ...DEFAULT_PANEL_SECTION_COLLAPSED },
  },
};

const PANEL_SECTION_IDS = new Set<PanelSectionId>(
  Object.values(PANEL_SECTION_ORDER_BY_VIEW).flat() as PanelSectionId[],
);

export function isPanelSectionId(value: unknown): value is PanelSectionId {
  return typeof value === "string" && PANEL_SECTION_IDS.has(value as PanelSectionId);
}

export function clonePanelSectionModePreferences(
  modes: Record<ControlPanelView, PanelSectionModePreferences>,
): Record<ControlPanelView, PanelSectionModePreferences> {
  return {
    default: {
      order: [...modes.default.order],
      collapsed: { ...modes.default.collapsed },
    },
    help: {
      order: [...modes.help.order],
      collapsed: { ...modes.help.collapsed },
    },
    settings: {
      order: [...modes.settings.order],
      collapsed: { ...modes.settings.collapsed },
    },
  };
}

export function sanitizePanelSectionOrder(
  value: unknown,
  view: ControlPanelView = "default",
): PanelSectionId[] {
  const defaults = PANEL_SECTION_ORDER_BY_VIEW[view];
  if (!Array.isArray(value)) return [...defaults];

  const next: PanelSectionId[] = [];
  const seen = new Set<PanelSectionId>();
  const allowed = new Set<PanelSectionId>(defaults);

  for (const candidate of value) {
    if (!isPanelSectionId(candidate) || !allowed.has(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    next.push(candidate);
  }

  // Migrate legacy help layouts (saved before About existed) to show About first.
  if (view === "help" && !seen.has("aboutPlotGarden")) {
    seen.add("aboutPlotGarden");
    next.unshift("aboutPlotGarden");
  }

  for (const id of defaults) {
    if (!seen.has(id)) next.push(id);
  }

  return next;
}

export function sanitizePanelSectionCollapsed(
  value: unknown,
  view: ControlPanelView = "default",
): Record<PanelSectionId, boolean> {
  const next = { ...DEFAULT_PANEL_SECTION_COLLAPSED };
  if (!value || typeof value !== "object") return next;

  const record = value as Record<string, unknown>;
  for (const sectionId of PANEL_SECTION_ORDER_BY_VIEW[view]) {
    const candidate = record[sectionId];
    if (typeof candidate === "boolean") {
      next[sectionId] = candidate;
    }
  }

  return next;
}

export function sanitizePanelSectionWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PANEL_SECTION_WIDTH;
  return Math.max(1, Math.round(value));
}

function sanitizePanelSectionModePreferences(
  view: ControlPanelView,
  value: unknown,
  legacy?: { order?: unknown; collapsed?: unknown },
): PanelSectionModePreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyOrder = view === "default" ? legacy?.order : undefined;
  const legacyCollapsed = view === "default" ? legacy?.collapsed : undefined;
  return {
    order: sanitizePanelSectionOrder(record.order ?? legacyOrder, view),
    collapsed: sanitizePanelSectionCollapsed(record.collapsed ?? legacyCollapsed, view),
  };
}

export function sanitizePanelSectionPreferences(value: unknown): PanelSectionPreferences {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const modesRecord =
    record.modes && typeof record.modes === "object"
      ? (record.modes as Record<string, unknown>)
      : {};

  return {
    modes: {
      default: sanitizePanelSectionModePreferences("default", modesRecord.default, {
        order: record.order,
        collapsed: record.collapsed,
      }),
      help: sanitizePanelSectionModePreferences("help", modesRecord.help),
      settings: sanitizePanelSectionModePreferences("settings", modesRecord.settings),
    },
    sidebarWidth: sanitizePanelSectionWidth(record.sidebarWidth),
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
