"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DropAnimation,
  type DragEndEvent,
  type DragStartEvent,
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleHelp, Play, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { sketchRegistry } from "@/generated/sketch-registry";
import {
  normalizeSketchOutput,
  renderNormalizedDocumentToSvg,
} from "@/lib/sketch-core/normalizeSketchOutput";
import type {
  SketchParamDefinition,
  SketchParamValue,
  SketchParamValues,
  SketchRenderContext,
  Unit,
} from "@/lib/sketch-core/types";
import {
  AxiDrawWebSerialTransport,
  buildEbbPackets,
  createPlotJobPlan,
  DEFAULT_PLOTTER_CONFIG,
  supportsDirectPlotting,
  type PlotLayerMode,
  type PlotterConfig,
  type PlotterStatus,
} from "@/lib/plotter";
import {
  readLocalStorageJSON,
  writeLocalStorageJSON,
} from "@/lib/utils/localStorage";
import {
  DEFAULT_CONTEXT,
  DEFAULT_LAYER_MODE,
  DEFAULT_RENDER_MODE,
  type SketchRenderSeed,
} from "@/lib/ui/sketchRenderBootstrap";
import {
  DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
  DEFAULT_PANEL_SECTION_WIDTH,
  PANEL_SECTION_PREFS_COOKIE_KEY,
  PANEL_SECTION_PREFS_STORAGE_KEY,
  type ControlPanelView,
  type PanelSectionId,
  type PanelSectionModePreferences,
  type PanelSectionPreferences,
  clonePanelSectionModePreferences,
  isPanelSectionId,
  sanitizePanelSectionPreferences,
  serializePanelSectionPreferencesCookie,
} from "@/lib/ui/panelSectionPreferences";

import styles from "./SketchWorkbench.module.css";

const PLOTTER_CONFIG_STORAGE_KEY = "plot-garden.plotter-config";
const MIN_PANEL_SECTION_WIDTH = 280;
const SECTION_DROP_TRAVEL_MS = 280;
const SECTION_DROP_FADE_MS = 220;
const SECTION_ACTIVE_FADE_IN_MS = 120;
const SECTION_DROP_ANIMATION_MS = SECTION_DROP_TRAVEL_MS + SECTION_DROP_FADE_MS;
const SECTION_REAL_FADE_COMPLETE_MS = SECTION_DROP_TRAVEL_MS + SECTION_ACTIVE_FADE_IN_MS;
const CONTROL_PANEL_FADE_MS = 110;

function plotterConfigEqual(a?: PlotterConfig, b?: PlotterConfig): boolean {
  if (!a || !b) return false;
  return (
    a.model === b.model &&
    a.speedPenDown === b.speedPenDown &&
    a.speedPenUp === b.speedPenUp &&
    a.penUpDelayMs === b.penUpDelayMs &&
    a.penDownDelayMs === b.penDownDelayMs &&
    a.repeatCount === b.repeatCount
  );
}

function toTranslationTransformString({
  x,
  y,
}: {
  x: number;
  y: number;
}): string {
  return `translate3d(${x}px, ${y}px, 0)`;
}

const SECTION_DROP_ANIMATION: DropAnimation = {
  duration: SECTION_DROP_ANIMATION_MS,
  // Keep timeline linear so the travel/fade boundary is exactly SECTION_DROP_TRAVEL_MS.
  easing: "linear",
  // Keep full opacity while traveling, then fade out after landing.
  keyframes: ({ transform }) => [
    {
      offset: 0,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      transform: toTranslationTransformString(transform.initial),
      opacity: "1",
      boxShadow: "0 14px 34px rgba(45, 34, 20, 0.22), 0 4px 10px rgba(45, 34, 20, 0.16)",
    },
    {
      offset: SECTION_DROP_TRAVEL_MS / SECTION_DROP_ANIMATION_MS,
      easing: "linear",
      transform: toTranslationTransformString(transform.final),
      opacity: "1",
      boxShadow: "0 14px 34px rgba(45, 34, 20, 0.22), 0 4px 10px rgba(45, 34, 20, 0.16)",
    },
    {
      offset: 1,
      transform: toTranslationTransformString(transform.final),
      opacity: "0",
      boxShadow: "0 4px 10px rgba(45, 34, 20, 0), 0 2px 6px rgba(45, 34, 20, 0)",
    },
  ],
  sideEffects: ({ dragOverlay }) => {
    const overlayStyle = dragOverlay.node.style;

    const previousOverlayBorderRadius = overlayStyle.borderRadius;
    const previousOverlayOverflow = overlayStyle.overflow;
    const previousOverlayBackgroundClip = overlayStyle.backgroundClip;
    const previousOverlayBackfaceVisibility = overlayStyle.backfaceVisibility;
    const previousOverlayTransformOrigin = overlayStyle.transformOrigin;

    // Keep rounded clipping during drop so no sharp corners appear.
    overlayStyle.borderRadius = "12px";
    overlayStyle.overflow = "hidden";
    overlayStyle.backgroundClip = "padding-box";
    overlayStyle.backfaceVisibility = "hidden";
    overlayStyle.transformOrigin = "center center";

    return () => {
      overlayStyle.borderRadius = previousOverlayBorderRadius;
      overlayStyle.overflow = previousOverlayOverflow;
      overlayStyle.backgroundClip = previousOverlayBackgroundClip;
      overlayStyle.backfaceVisibility = previousOverlayBackfaceVisibility;
      overlayStyle.transformOrigin = previousOverlayTransformOrigin;
    };
  },
};

const restrictSectionDragToVerticalAxis = ({
  transform,
}: {
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
  };
}) => ({
  ...transform,
  x: 0,
});

function shallowSerialize(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value);
  }

  const keys = Object.keys(value).sort();
  return JSON.stringify(value, keys);
}

function prettyDistance(inches: number, units: Unit): string {
  if (units === "in") return `${inches.toFixed(2)} in`;
  return `${(inches * 25.4).toFixed(1)} mm`;
}

type SidebarSection = {
  id: PanelSectionId;
  title: string;
  body: ReactNode;
};

function SectionCollapseCaret({
  collapsed,
}: {
  collapsed: boolean;
}) {
  return (
    <span
      aria-hidden
      className={styles.sectionCollapseCaret}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <Play
        className={styles.sectionCollapseCaretIcon}
        size={13}
        strokeWidth={1.75}
        fill="currentColor"
      />
    </span>
  );
}

function SectionDragOverlay({
  collapsed,
  section,
}: {
  collapsed: boolean;
  section: SidebarSection;
}) {
  return (
    <section className={`${styles.section} ${styles.sectionOverlay}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderDragArea}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionOverlayTitle}>{section.title}</span>
          </h2>
        </div>
        <span
          className={`${styles.sectionCollapseToggle} ${styles.sectionCollapseToggleGhost}`}
          aria-hidden
        >
          <SectionCollapseCaret collapsed={collapsed} />
        </span>
      </div>
      <div
        className={`${styles.sectionBodyContainer} ${
          collapsed ? styles.sectionBodyContainerCollapsed : ""
        }`}
        aria-hidden={collapsed}
      >
        <div className={styles.sectionBodyContainerInner}>
          <div className={styles.sectionBody}>{section.body}</div>
        </div>
      </div>
    </section>
  );
}

function SortablePanelSection({
  collapsed,
  draggingSource,
  landingPhase,
  onToggleSection,
  section,
}: {
  collapsed: boolean;
  draggingSource: boolean;
  landingPhase: "hold" | "reveal" | null;
  onToggleSection: (sectionId: PanelSectionId) => void;
  section: SidebarSection;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: section.id,
    });
  const opacityTransition =
    landingPhase === "reveal"
      ? `opacity ${SECTION_ACTIVE_FADE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "opacity 0ms linear";
  const combinedTransition = [transition, opacityTransition]
    .filter((value) => Boolean(value))
    .join(", ");
  const dimmed = draggingSource || landingPhase === "hold";
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: combinedTransition || undefined,
    opacity: dimmed ? 0.3 : 1,
  };
  const contentId = `panel-section-${section.id}`;
  const marginDragListeners = (listeners ?? {}) as HTMLAttributes<HTMLDivElement>;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`${styles.section} ${isDragging ? styles.sectionDragging : ""}`}
    >
      <div className={styles.sectionMarginDragRing} aria-hidden>
        <div
          className={`${styles.sectionMarginDragHandle} ${styles.sectionMarginDragHandleTop}`}
          {...marginDragListeners}
        />
        <div
          className={`${styles.sectionMarginDragHandle} ${styles.sectionMarginDragHandleRight}`}
          {...marginDragListeners}
        />
        <div
          className={`${styles.sectionMarginDragHandle} ${styles.sectionMarginDragHandleBottom}`}
          {...marginDragListeners}
        />
        <div
          className={`${styles.sectionMarginDragHandle} ${styles.sectionMarginDragHandleLeft}`}
          {...marginDragListeners}
        />
      </div>
      <div className={styles.sectionHeader}>
        <div
          className={styles.sectionHeaderDragArea}
          {...attributes}
          {...listeners}
        >
          <h2 className={styles.sectionTitle}>{section.title}</h2>
        </div>
        <button
          aria-controls={contentId}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${section.title} section`}
          className={styles.sectionCollapseToggle}
          onClick={() => onToggleSection(section.id)}
          type="button"
        >
          <SectionCollapseCaret collapsed={collapsed} />
        </button>
      </div>
      <div
        className={`${styles.sectionBodyContainer} ${
          collapsed ? styles.sectionBodyContainerCollapsed : ""
        }`}
        id={contentId}
        aria-hidden={collapsed}
      >
        <div className={styles.sectionBodyContainerInner}>
          <div className={styles.sectionBody}>{section.body}</div>
        </div>
      </div>
    </section>
  );
}

export function SketchWorkbench({
  initialSlug,
  initialPanelSectionPreferences,
  initialRenderSeed,
}: {
  initialSlug: string;
  initialPanelSectionPreferences?: PanelSectionPreferences | null;
  initialRenderSeed?: SketchRenderSeed;
}) {
  const router = useRouter();
  const initialSeed = initialRenderSeed;

  const [directPlottingAvailable, setDirectPlottingAvailable] = useState(false);
  const [plotterSupportReady, setPlotterSupportReady] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedEntry =
    sketchRegistry.find((entry) => entry.manifest.slug === selectedSlug) ??
    sketchRegistry[0];
  const sketch = useMemo(
    () => (selectedEntry ? new selectedEntry.Sketch() : null),
    [selectedEntry],
  );
  const fallbackDefaults = useMemo(() => {
    if (!sketch) return {};
    const defaults = sketch.getDefaultParams() as Record<string, SketchParamValue>;
    return sketch.coerceParams(defaults) as Record<string, SketchParamValue>;
  }, [sketch]);

  const [draftParams, setDraftParams] = useState<Record<string, SketchParamValue>>(() =>
    initialRenderSeed?.draftParams ?? fallbackDefaults,
  );
  const [renderedParams, setRenderedParams] = useState<
    Record<string, SketchParamValue>
  >(() => initialRenderSeed?.renderedParams ?? {});
  const [draftContext, setDraftContext] = useState<SketchRenderContext>(
    () => initialRenderSeed?.draftContext ?? DEFAULT_CONTEXT,
  );
  const [renderedContext, setRenderedContext] = useState<SketchRenderContext>(
    () => initialRenderSeed?.renderedContext ?? DEFAULT_CONTEXT,
  );

  const [renderMode, setRenderMode] = useState<"live" | "manual">(
    () => initialRenderSeed?.renderMode ?? DEFAULT_RENDER_MODE,
  );
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(
    () => initialRenderSeed?.renderError ?? null,
  );
  const [normalizedDocument, setNormalizedDocument] =
    useState<Awaited<ReturnType<typeof normalizeSketchOutput>> | null>(() =>
      initialRenderSeed?.normalizedDocument ?? null,
    );
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  const [layerMode, setLayerMode] = useState<PlotLayerMode>(
    () => initialRenderSeed?.layerMode ?? DEFAULT_LAYER_MODE,
  );
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const [plotterConfig, setPlotterConfig] =
    useState<PlotterConfig>(
      () => initialRenderSeed?.plotterConfig ?? DEFAULT_PLOTTER_CONFIG,
    );
  const [plotterConfigCollapsed, setPlotterConfigCollapsed] = useState(true);
  const seededPanelPreferences = initialPanelSectionPreferences
    ? sanitizePanelSectionPreferences(initialPanelSectionPreferences)
    : null;
  const [panelSectionModes, setPanelSectionModes] = useState<
    Record<ControlPanelView, PanelSectionModePreferences>
  >(() =>
    clonePanelSectionModePreferences(
      seededPanelPreferences?.modes ?? DEFAULT_PANEL_SECTION_MODE_PREFERENCES,
    ),
  );
  const [draggingSectionId, setDraggingSectionId] = useState<PanelSectionId | null>(
    null,
  );
  const [landingSection, setLandingSection] = useState<{
    id: PanelSectionId;
    phase: "hold" | "reveal";
  } | null>(null);
  const [panelSectionPrefsReady, setPanelSectionPrefsReady] = useState(
    seededPanelPreferences !== null,
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    seededPanelPreferences?.sidebarWidth ?? DEFAULT_PANEL_SECTION_WIDTH,
  );
  const sectionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const panelResizeStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const plotterControlsHideTimeoutRef = useRef<number | null>(null);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const landingRevealTimeoutRef = useRef<number | null>(null);
  const landingResetTimeoutRef = useRef<number | null>(null);
  const [plotterControlsMounted, setPlotterControlsMounted] = useState(false);
  const [plotterControlsCollapsed, setPlotterControlsCollapsed] = useState(true);
  const [controlPanelView, setControlPanelView] = useState<ControlPanelView>("default");
  const [renderedControlPanelView, setRenderedControlPanelView] =
    useState<ControlPanelView>("default");
  const [controlPanelContentVisible, setControlPanelContentVisible] = useState(true);
  const [confirmResetPlotGarden, setConfirmResetPlotGarden] = useState(false);
  const controlPanelSwapTimeoutRef = useRef<number | null>(null);

  const clearLandingTimers = useCallback(() => {
    if (landingRevealTimeoutRef.current !== null) {
      window.clearTimeout(landingRevealTimeoutRef.current);
      landingRevealTimeoutRef.current = null;
    }
    if (landingResetTimeoutRef.current !== null) {
      window.clearTimeout(landingResetTimeoutRef.current);
      landingResetTimeoutRef.current = null;
    }
  }, []);

  const clearPlotterControlsHideTimer = useCallback(() => {
    if (plotterControlsHideTimeoutRef.current !== null) {
      window.clearTimeout(plotterControlsHideTimeoutRef.current);
      plotterControlsHideTimeoutRef.current = null;
    }
  }, []);

  const clearControlPanelSwapTimer = useCallback(() => {
    if (controlPanelSwapTimeoutRef.current !== null) {
      window.clearTimeout(controlPanelSwapTimeoutRef.current);
      controlPanelSwapTimeoutRef.current = null;
    }
  }, []);

  const transitionControlPanelView = useCallback(
    (nextView: ControlPanelView) => {
      clearControlPanelSwapTimer();
      setControlPanelContentVisible(false);

      controlPanelSwapTimeoutRef.current = window.setTimeout(() => {
        setRenderedControlPanelView(nextView);
        controlPanelSwapTimeoutRef.current = null;
        window.requestAnimationFrame(() => {
          setControlPanelContentVisible(true);
        });
      }, CONTROL_PANEL_FADE_MS);
    },
    [clearControlPanelSwapTimer],
  );

  const onControlPanelIconClick = useCallback(
    (nextView: Exclude<ControlPanelView, "default">) => {
      setControlPanelView((current) => {
        const resolvedView: ControlPanelView = current === nextView ? "default" : nextView;
        transitionControlPanelView(resolvedView);
        return resolvedView;
      });
    },
    [transitionControlPanelView],
  );

  const clampPanelWidth = useCallback((nextWidth: number) => {
    const shell = shellRef.current;
    if (!shell) return Math.max(1, Math.round(nextWidth));

    if (shell.clientWidth <= 0) {
      return Math.max(1, Math.round(nextWidth));
    }

    const maxWidth = Math.max(0, Math.floor(shell.clientWidth / 2));
    if (maxWidth === 0) return Math.max(1, Math.round(nextWidth));

    const minimumWidth = Math.min(MIN_PANEL_SECTION_WIDTH, maxWidth);
    const normalized = Math.round(nextWidth);
    return Math.max(minimumWidth, Math.min(normalized, maxWidth));
  }, []);

  const fitPanelWidthToViewport = useCallback(() => {
    setSidebarWidth((currentWidth) => clampPanelWidth(currentWidth));
  }, [clampPanelWidth]);

  const onPanelResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const currentResize = panelResizeStateRef.current;
      if (!currentResize || currentResize.pointerId !== event.pointerId) return;

      const targetWidth = currentResize.startWidth + (event.clientX - currentResize.startX);
      setSidebarWidth(clampPanelWidth(targetWidth));
    },
    [clampPanelWidth],
  );

  const onPanelResizePointerUp = useCallback(
    (event: PointerEvent) => {
      const currentResize = panelResizeStateRef.current;
      if (!currentResize || currentResize.pointerId !== event.pointerId) return;

      panelResizeStateRef.current = null;
      setIsResizingPanel(false);
      window.removeEventListener("pointermove", onPanelResizePointerMove);
      window.removeEventListener("pointercancel", onPanelResizePointerUp);
      window.removeEventListener("pointerup", onPanelResizePointerUp);
    },
    [onPanelResizePointerMove],
  );

  const onPanelResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const shell = shellRef.current;
      if (!shell) return;

      event.preventDefault();
      const normalizedWidth = clampPanelWidth(sidebarWidth);
      setSidebarWidth(normalizedWidth);
      panelResizeStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: normalizedWidth,
      };
      setIsResizingPanel(true);
      window.addEventListener("pointermove", onPanelResizePointerMove);
      window.addEventListener("pointercancel", onPanelResizePointerUp);
      window.addEventListener("pointerup", onPanelResizePointerUp);
    },
    [clampPanelWidth, onPanelResizePointerMove, onPanelResizePointerUp, sidebarWidth],
  );

  const transportRef = useRef<AxiDrawWebSerialTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = new AxiDrawWebSerialTransport();
  }

  const [plotterStatus, setPlotterStatus] = useState<PlotterStatus>(
    transportRef.current.getStatus(),
  );

  useEffect(() => {
    setDirectPlottingAvailable(supportsDirectPlotting());
    setPlotterSupportReady(true);
  }, []);

  useEffect(() => {
    fitPanelWidthToViewport();
  }, [fitPanelWidthToViewport]);

  useEffect(() => {
    window.addEventListener("resize", fitPanelWidthToViewport);
    return () => window.removeEventListener("resize", fitPanelWidthToViewport);
  }, [fitPanelWidthToViewport]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPanelResizePointerMove);
      window.removeEventListener("pointercancel", onPanelResizePointerUp);
      window.removeEventListener("pointerup", onPanelResizePointerUp);
      panelResizeStateRef.current = null;
      setIsResizingPanel(false);
    };
  }, [onPanelResizePointerMove, onPanelResizePointerUp]);

  useEffect(() => {
    setSelectedSlug(initialSlug);
  }, [initialSlug]);

  useEffect(() => {
    setPlotterConfig(
      readLocalStorageJSON(PLOTTER_CONFIG_STORAGE_KEY, DEFAULT_PLOTTER_CONFIG),
    );
  }, []);

  useEffect(() => {
    if (panelSectionPrefsReady) return;

    const stored = readLocalStorageJSON<unknown>(
      PANEL_SECTION_PREFS_STORAGE_KEY,
      null,
    );
    if (stored && typeof stored === "object") {
      const safePreferences = sanitizePanelSectionPreferences(stored);
      setPanelSectionModes(clonePanelSectionModePreferences(safePreferences.modes));
      setSidebarWidth(safePreferences.sidebarWidth);
    }
    setPanelSectionPrefsReady(true);
  }, [panelSectionPrefsReady]);

  useEffect(() => {
    writeLocalStorageJSON(PLOTTER_CONFIG_STORAGE_KEY, plotterConfig);
  }, [plotterConfig]);

  useEffect(() => {
    if (!panelSectionPrefsReady) return;

    const nextPreferences: PanelSectionPreferences = {
      modes: panelSectionModes,
      sidebarWidth,
    };
    writeLocalStorageJSON(PANEL_SECTION_PREFS_STORAGE_KEY, nextPreferences);
    document.cookie = `${PANEL_SECTION_PREFS_COOKIE_KEY}=${serializePanelSectionPreferencesCookie(
      nextPreferences,
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [panelSectionModes, panelSectionPrefsReady, sidebarWidth]);

  useEffect(() => {
    return () => clearLandingTimers();
  }, [clearLandingTimers]);

  useEffect(() => {
    return () => clearPlotterControlsHideTimer();
  }, [clearPlotterControlsHideTimer]);

  useEffect(() => {
    return () => clearControlPanelSwapTimer();
  }, [clearControlPanelSwapTimer]);

  useEffect(() => {
    if (controlPanelView !== "settings") {
      setConfirmResetPlotGarden(false);
    }
  }, [controlPanelView]);

  const performRender = useCallback(
    async (
      nextDraftParams: Record<string, SketchParamValue>,
      nextContext: SketchRenderContext,
    ) => {
      if (!sketch) return;

      setRendering(true);
      setRenderError(null);

      try {
        const coerced = sketch.coerceParams(nextDraftParams);
        const output = await sketch.render(coerced as SketchParamValues, nextContext);
        const normalized = await normalizeSketchOutput(output, nextContext);

        setNormalizedDocument(normalized);
        setRenderedParams(coerced as Record<string, SketchParamValue>);
        setRenderedContext(nextContext);
      } catch (error) {
        setRenderError(error instanceof Error ? error.message : "Render failed");
      } finally {
        setRendering(false);
      }
    },
    [sketch],
  );

  useEffect(() => {
    if (!sketch) return;
    if (initialSeed?.normalizedDocument) return;

    const defaults = fallbackDefaults;
    setDraftParams(defaults);
    setRenderedParams(defaults);
    setDraftContext(DEFAULT_CONTEXT);
    setRenderedContext(DEFAULT_CONTEXT);
    setHoveredLayerId(null);
    void performRender(defaults, DEFAULT_CONTEXT);
  }, [initialSeed?.normalizedDocument, sketch, fallbackDefaults, performRender]);

  const dirty = useMemo(() => {
    return (
      shallowSerialize(draftParams) !== shallowSerialize(renderedParams) ||
      shallowSerialize(draftContext) !== shallowSerialize(renderedContext)
    );
  }, [draftContext, draftParams, renderedContext, renderedParams]);

  useEffect(() => {
    if (renderMode !== "live") return;
    if (!dirty || rendering) return;
    void performRender(draftParams, draftContext);
  }, [dirty, draftContext, draftParams, performRender, renderMode, rendering]);

  const previewSvgMarkup = useMemo(() => {
    if (!normalizedDocument) return "";
    return renderNormalizedDocumentToSvg(normalizedDocument, {
      hoveredLayerId,
      dimOpacity: 0.1,
      background: "transparent",
    });
  }, [hoveredLayerId, normalizedDocument]);

  const canvasAspectRatio = useMemo(() => {
    const width =
      Number.isFinite(draftContext.width) && draftContext.width > 0
        ? draftContext.width
        : DEFAULT_CONTEXT.width;
    const height =
      Number.isFinite(draftContext.height) && draftContext.height > 0
        ? draftContext.height
        : DEFAULT_CONTEXT.height;
    return width / height;
  }, [draftContext.height, draftContext.width]);

  const canvasWrapStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--canvas-aspect": String(canvasAspectRatio),
      }) as CSSProperties,
    [canvasAspectRatio],
  );
  const shellStyle = useMemo<CSSProperties & { ["--panel-section-width"]?: string }>(
    () => ({
      "--panel-section-width": `${sidebarWidth}px`,
    }),
    [sidebarWidth],
  );

  const filteredSketches = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return sketchRegistry;

    return sketchRegistry.filter((entry) => {
      const title = entry.manifest.title.toLowerCase();
      const tags = entry.manifest.tags.join(" ").toLowerCase();
      const slug = entry.manifest.slug.toLowerCase();
      return title.includes(needle) || tags.includes(needle) || slug.includes(needle);
    });
  }, [searchTerm]);

  const hasSeededJobPlan =
    Boolean(
      initialSeed?.seededJobPlan &&
        normalizedDocument === initialSeed.normalizedDocument &&
        layerMode === (initialSeed?.layerMode ?? DEFAULT_LAYER_MODE) &&
        plotterConfigEqual(plotterConfig, initialSeed?.plotterConfig),
    );

  const jobPlan = useMemo(() => {
    if (!normalizedDocument) return null;
    if (hasSeededJobPlan && initialSeed?.seededJobPlan) {
      return initialSeed.seededJobPlan;
    }
    return createPlotJobPlan(normalizedDocument, layerMode, plotterConfig);
  }, [
    hasSeededJobPlan,
    initialSeed?.seededJobPlan,
    layerMode,
    normalizedDocument,
    plotterConfig,
  ]);

  const packets = useMemo(() => {
    if (!jobPlan) return [];
    return buildEbbPackets(jobPlan, plotterConfig);
  }, [jobPlan, plotterConfig]);

  const renderButtonLabel = rendering
    ? "Processing..."
    : dirty
      ? "Render"
      : "Rendered";

  const onSelectSketch = (slug: string) => {
    setSelectedSlug(slug);
    router.push(`/sketch/${slug}`);
  };

  const onNumberParamChange = (key: string, value: number) => {
    setDraftParams((current) => {
      const fallback = current[key];
      const safeFallback = typeof fallback === "number" ? fallback : 0;
      return {
        ...current,
        [key]: Number.isFinite(value) ? value : safeFallback,
      };
    });
  };

  const onBooleanParamChange = (key: string, value: boolean) => {
    setDraftParams((current) => ({ ...current, [key]: value }));
  };

  const onRenderClick = () => {
    if (!dirty || rendering) return;
    void performRender(draftParams, draftContext);
  };

  const onDownloadSvg = () => {
    if (!normalizedDocument) return;

    const svg = renderNormalizedDocumentToSvg(normalizedDocument, {
      background: "#ffffff",
    });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedEntry?.manifest.slug ?? "sketch"}.svg`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const onConnect = async () => {
    await transportRef.current?.connect(setPlotterStatus);
  };

  const onDisconnect = async () => {
    await transportRef.current?.disconnect(setPlotterStatus);
  };

  const onSendConfirmed = async () => {
    setConfirmSendOpen(false);
    if (!packets.length) return;

    await transportRef.current?.send(packets, setPlotterStatus);
  };

  const onPause = () => {
    transportRef.current?.pause(setPlotterStatus);
  };

  const onResume = () => {
    transportRef.current?.resume(setPlotterStatus);
  };

  const onCancel = async () => {
    await transportRef.current?.cancel(setPlotterStatus);
  };

  const isPlotterCapable = plotterSupportReady && directPlottingAvailable;
  const isPlotterConnecting = plotterStatus.state === "connecting";
  const isPlotterConnected =
    plotterStatus.state === "connected" ||
    plotterStatus.state === "plotting" ||
    plotterStatus.state === "paused";
  const isPlotSessionActive =
    plotterStatus.state === "plotting" || plotterStatus.state === "paused";
  const canShowPlotControls = isPlotterConnected;
  const isPlotterUnavailable = plotterSupportReady && !directPlottingAvailable;

  const plotterStatusLabel = isPlotterUnavailable
    ? "Connection unavailable"
    : !plotterSupportReady
      ? "Not connected"
      : plotterStatus.message ?? "Not connected";

  const connectionButtonLabel = !plotterSupportReady
    ? "Connect"
    : directPlottingAvailable
      ? isPlotterConnecting
        ? "Connecting..."
        : isPlotterConnected
          ? "Disconnect"
          : "Connect"
      : "Unavailable";

  const connectionButtonDisabled = !plotterSupportReady || isPlotterConnecting || !directPlottingAvailable;

  const sessionButtonLabel = !isPlotterCapable
    ? "Start Plot"
    : isPlotSessionActive
      ? plotterStatus.state === "plotting"
        ? "Pause"
        : "Resume"
      : "Start Plot";

  const canStartPlotSession = plotterStatus.state === "connected" && packets.length > 0;
  const canPauseOrResumePlot = isPlotSessionActive;
  const canControlPlotSession = canStartPlotSession || canPauseOrResumePlot;
  const sessionButtonDisabled =
    !plotterSupportReady || !isPlotterCapable || !canControlPlotSession;

  const onConnectionToggle = async () => {
    if (!plotterSupportReady || !directPlottingAvailable) return;
    if (isPlotterConnected || isPlotSessionActive) {
      await onDisconnect();
      return;
    }
    if (isPlotterConnecting) return;
    await onConnect();
  };

  const onSessionToggle = () => {
    if (!canControlPlotSession) return;
    if (plotterStatus.state === "plotting") {
      onPause();
      return;
    }
    if (plotterStatus.state === "paused") {
      onResume();
      return;
    }
    setConfirmSendOpen(true);
  };

  useEffect(() => {
    clearPlotterControlsHideTimer();

    if (canShowPlotControls) {
      setPlotterControlsMounted(true);
      setPlotterControlsCollapsed(true);
      window.requestAnimationFrame(() => {
        setPlotterControlsCollapsed(false);
      });
      return;
    }

    if (!plotterControlsMounted) return;

    setPlotterControlsCollapsed(true);
    plotterControlsHideTimeoutRef.current = window.setTimeout(() => {
      setPlotterControlsMounted(false);
    }, SECTION_REAL_FADE_COMPLETE_MS);
  }, [canShowPlotControls, plotterControlsMounted, clearPlotterControlsHideTimer]);

  const onToggleSection = (sectionId: PanelSectionId) => {
    const mode = renderedControlPanelView;
    setPanelSectionModes((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        collapsed: {
          ...current[mode].collapsed,
          [sectionId]: !current[mode].collapsed[sectionId],
        },
      },
    }));
  };

  const onResetPanelLayout = () => {
    setPanelSectionModes(clonePanelSectionModePreferences(DEFAULT_PANEL_SECTION_MODE_PREFERENCES));
    setSidebarWidth(clampPanelWidth(DEFAULT_PANEL_SECTION_WIDTH));
  };

  const onResetPlotGarden = () => {
    if (!confirmResetPlotGarden) {
      setConfirmResetPlotGarden(true);
      return;
    }

    onResetPanelLayout();
    setConfirmResetPlotGarden(false);
  };

  const onSectionDragStart = (event: DragStartEvent) => {
    clearLandingTimers();
    setLandingSection(null);
    const sourceSectionId = isPanelSectionId(event.active.id) ? event.active.id : null;
    setDraggingSectionId(sourceSectionId);
  };

  const onSectionDragCancel = () => {
    clearLandingTimers();
    setLandingSection(null);
    setDraggingSectionId(null);
  };

  const onSectionDragEnd = (event: DragEndEvent) => {
    const mode = renderedControlPanelView;
    const sourceSectionId = isPanelSectionId(event.active.id) ? event.active.id : null;
    const targetSectionId =
      event.over && isPanelSectionId(event.over.id) ? event.over.id : null;
    setDraggingSectionId(null);

    clearLandingTimers();
    if (sourceSectionId) {
      setLandingSection({
        id: sourceSectionId,
        phase: "hold",
      });

      landingRevealTimeoutRef.current = window.setTimeout(() => {
        setLandingSection((current) =>
          current && current.id === sourceSectionId
            ? {
                id: sourceSectionId,
                phase: "reveal",
              }
            : current,
        );
        landingRevealTimeoutRef.current = null;
      }, SECTION_DROP_TRAVEL_MS);

      landingResetTimeoutRef.current = window.setTimeout(() => {
        setLandingSection((current) =>
          current && current.id === sourceSectionId ? null : current,
        );
        landingResetTimeoutRef.current = null;
      }, SECTION_REAL_FADE_COMPLETE_MS);
    }

    if (!sourceSectionId || !targetSectionId || sourceSectionId === targetSectionId) {
      return;
    }

    setPanelSectionModes((current) => {
      const modeState = current[mode];
      const sourceIndex = modeState.order.indexOf(sourceSectionId);
      const targetIndex = modeState.order.indexOf(targetSectionId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      return {
        ...current,
        [mode]: {
          ...modeState,
          order: arrayMove(modeState.order, sourceIndex, targetIndex),
        },
      };
    });
  };

  if (!selectedEntry || !sketch) {
    return <div className={styles.shell}>No sketches found.</div>;
  }

  const schemaEntries = Object.entries(sketch.schema) as [
    string,
    SketchParamDefinition,
  ][];
  const defaultSidebarSections: Partial<
    Record<PanelSectionId, { title: string; body: ReactNode }>
  > = {
    sketches: {
      title: "Sketches",
      body: (
        <>
          <input
            className={styles.searchInput}
            type="search"
            aria-label="Search sketches"
            placeholder="Search sketches"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <div className={styles.sketchList}>
            {filteredSketches.map((entry) => {
              const active = entry.manifest.slug === selectedEntry.manifest.slug;
              return (
                <button
                  className={`${styles.sketchButton} ${
                    active ? styles.sketchButtonActive : ""
                  }`}
                  key={entry.manifest.slug}
                  onClick={() => onSelectSketch(entry.manifest.slug)}
                  type="button"
                >
                  <div>{entry.manifest.title}</div>
                  <div className={styles.sketchMeta}>{entry.manifest.slug}</div>
                </button>
              );
            })}
          </div>
        </>
      ),
    },
    params: {
      title: `${selectedEntry.manifest.title} Params`,
      body: (
        <>
          {schemaEntries.map(([key, definition]) => (
            <div className={styles.paramItem} key={key}>
              <label>
                <span className={styles.label}>{definition.label}</span>
                {definition.type === "number" ? (
                  <input
                    className={styles.numberInput}
                    type="number"
                    aria-label={definition.label}
                    step={definition.step}
                    min={definition.min}
                    max={definition.max}
                    value={Number(draftParams[key] ?? definition.default)}
                    onChange={(event) =>
                      onNumberParamChange(key, Number(event.target.value))
                    }
                  />
                ) : (
                  <span className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      aria-label={definition.label}
                      checked={Boolean(draftParams[key] ?? definition.default)}
                      onChange={(event) =>
                        onBooleanParamChange(key, event.target.checked)
                      }
                    />
                    <span>{definition.description ?? "Enabled"}</span>
                  </span>
                )}
              </label>
              {definition.type === "number" && definition.description ? (
                <p className={styles.muted}>{definition.description}</p>
              ) : null}
            </div>
          ))}
        </>
      ),
    },
    layers: {
      title: "Layers",
      body: (
        <>
          <div className={styles.layerList} onMouseLeave={() => setHoveredLayerId(null)}>
            {normalizedDocument?.layers.map((layer, index) => {
              const hovered = hoveredLayerId === layer.id;
              return (
                <div
                  className={`${styles.layerItem} ${
                    hovered ? styles.layerItemHovered : ""
                  }`}
                  key={layer.id}
                  onMouseEnter={() => setHoveredLayerId(layer.id)}
                >
                  <div>
                    {index + 1}. {layer.name}
                  </div>
                  <div className={styles.sketchMeta}>{layer.polylines.length} strokes</div>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
    plotter: {
      title: "Plotter",
      body: (
        <>
          <button
            className={styles.actionButton}
            disabled={connectionButtonDisabled}
            onClick={onConnectionToggle}
            type="button"
          >
            {connectionButtonLabel}
          </button>

          <p className={styles.status}>
            {plotterStatusLabel}
            {plotterStatus.totalPackets
              ? ` (${plotterStatus.sentPackets ?? 0}/${plotterStatus.totalPackets})`
              : ""}
          </p>

          {plotterControlsMounted ? (
            <div
              className={`${styles.sectionBodyContainer} ${
                plotterControlsCollapsed ? styles.sectionBodyContainerCollapsed : ""
              }`}
              aria-hidden={plotterControlsCollapsed}
            >
              <div className={styles.sectionBodyContainerInner}>
                <div className={styles.sectionBody}>
                  <div className={styles.controlsRow}>
                    <button
                      className={styles.actionButton}
                      disabled={sessionButtonDisabled}
                      onClick={onSessionToggle}
                      type="button"
                    >
                      {sessionButtonLabel}
                    </button>

                    {isPlotSessionActive ? (
                      <button
                        className={styles.dangerButton}
                        onClick={onCancel}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>

                  <div className={styles.radioStack}>
                    <span className={styles.label}>Layer mode</span>
                    <label className={styles.inlineControl}>
                      <input
                        type="radio"
                        name="layerMode"
                        checked={layerMode === "ordered"}
                        onChange={() => setLayerMode("ordered")}
                      />
                      Plot layers in order
                    </label>
                    <label className={styles.inlineControl}>
                      <input
                        type="radio"
                        name="layerMode"
                        checked={layerMode === "flatten"}
                        onChange={() => setLayerMode("flatten")}
                      />
                      Flatten before optimization
                    </label>
                    <label className={styles.inlineControl}>
                      <input
                        type="radio"
                        name="layerMode"
                        checked={layerMode === "pause-between"}
                        onChange={() => setLayerMode("pause-between")}
                      />
                      Pause between layers
                    </label>
                  </div>

                  <div className={styles.plotterSubsection}>
                    <div className={styles.plotterSubsectionHeader}>
                      <span className={styles.sectionTitle}>More plotter config</span>
                      <button
                        className={styles.sectionCollapseToggle}
                        aria-label={`${plotterConfigCollapsed ? "Expand" : "Collapse"} plotter config`}
                        aria-expanded={!plotterConfigCollapsed}
                        onClick={() => setPlotterConfigCollapsed((current) => !current)}
                        type="button"
                      >
                        <SectionCollapseCaret collapsed={plotterConfigCollapsed} />
                      </button>
                    </div>
                    <div
                      className={`${styles.sectionBodyContainer} ${
                        plotterConfigCollapsed ? styles.sectionBodyContainerCollapsed : ""
                      }`}
                      aria-hidden={plotterConfigCollapsed}
                    >
                      <div className={styles.sectionBodyContainerInner}>
                        <div className={styles.sectionBody}>
                          <div className={styles.row}>
                            <label>
                              <span className={styles.label}>Model</span>
                              <select
                                className={styles.selectInput}
                                value={plotterConfig.model}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    model: event.target.value as PlotterConfig["model"],
                                  }))
                                }
                              >
                                <option value="A4">AxiDraw A4</option>
                                <option value="A3">AxiDraw A3</option>
                                <option value="XLX">AxiDraw XLX</option>
                                <option value="MiniKit">AxiDraw MiniKit</option>
                                <option value="A2">AxiDraw A2</option>
                                <option value="A1">AxiDraw A1</option>
                                <option value="B6">AxiDraw B6</option>
                              </select>
                            </label>
                            <label>
                              <span className={styles.label}>Repeat</span>
                              <input
                                className={styles.numberInput}
                                type="number"
                                min={1}
                                max={12}
                                step={1}
                                value={plotterConfig.repeatCount}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    repeatCount: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          </div>

                          <div className={styles.row}>
                            <label>
                              <span className={styles.label}>Pen-down speed</span>
                              <input
                                className={styles.numberInput}
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                value={plotterConfig.speedPenDown}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    speedPenDown: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span className={styles.label}>Pen-up speed</span>
                              <input
                                className={styles.numberInput}
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                value={plotterConfig.speedPenUp}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    speedPenUp: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          </div>

                          <div className={styles.row}>
                            <label>
                              <span className={styles.label}>Pen-up delay (ms)</span>
                              <input
                                className={styles.numberInput}
                                type="number"
                                min={0}
                                max={5000}
                                step={10}
                                value={plotterConfig.penUpDelayMs}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    penUpDelayMs: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span className={styles.label}>Pen-down delay (ms)</span>
                              <input
                                className={styles.numberInput}
                                type="number"
                                min={0}
                                max={5000}
                                step={10}
                                value={plotterConfig.penDownDelayMs}
                                onChange={(event) =>
                                  setPlotterConfig((current) => ({
                                    ...current,
                                    penDownDelayMs: Number(event.target.value),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ),
    },
  };

  const helpSidebarSections: Partial<Record<PanelSectionId, { title: string; body: ReactNode }>> =
    {
      helpOverview: {
        title: "Quick Help",
        body: (
          <>
            <p className={styles.status}>
              Configure sketches in this panel, then render and send plots from the Plotter
              section.
            </p>
            <ul className={styles.controlPanelInfoList}>
              <li>Drag section edges to reorder cards.</li>
              <li>Use manual render mode when tweaking lots of parameters.</li>
              <li>Hover a layer to isolate it in the preview.</li>
              <li>Connect your AxiDraw before starting a plot session.</li>
            </ul>
          </>
        ),
      },
      aboutPlotGarden: {
        title: "About Plot Garden",
        body: (
          <>
            <p className={styles.status}>
              Plot Garden is a collaboration between{" "}
              <a
                className={styles.inlineLink}
                href="https://flatpickles.com"
                rel="noreferrer"
                target="_blank"
              >
                Matt Nichols
              </a>{" "}
              and{" "}
              <a
                className={styles.inlineLink}
                href="https://openai.com/codex"
                rel="noreferrer"
                target="_blank"
              >
                Codex
              </a>
              .
            </p>
            <ul className={styles.controlPanelInfoList}>
              <li>Built for exploring and refining generative pen-plot sketches.</li>
              <li>Designed to move from sketch parameter tweaks to plotting workflows.</li>
            </ul>
          </>
        ),
      },
    };

  const settingsSidebarSections: Partial<
    Record<PanelSectionId, { title: string; body: ReactNode }>
  > = {
    renderControls: {
      title: "Render Controls",
      body: (
        <>
          <div className={styles.row}>
            <label>
              <span className={styles.label}>Width ({draftContext.units})</span>
              <input
                className={styles.numberInput}
                type="number"
                aria-label="Canvas width"
                min={0.5}
                step={0.1}
                value={draftContext.width}
                onChange={(event) =>
                  setDraftContext((current) => ({
                    ...current,
                    width: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span className={styles.label}>Height ({draftContext.units})</span>
              <input
                className={styles.numberInput}
                type="number"
                aria-label="Canvas height"
                min={0.5}
                step={0.1}
                value={draftContext.height}
                onChange={(event) =>
                  setDraftContext((current) => ({
                    ...current,
                    height: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              <span className={styles.label}>Units</span>
              <select
                className={styles.selectInput}
                aria-label="Canvas units"
                value={draftContext.units}
                onChange={(event) =>
                  setDraftContext((current) => ({
                    ...current,
                    units: event.target.value as Unit,
                  }))
                }
              >
                <option value="in">Inches</option>
                <option value="mm">Millimeters</option>
              </select>
            </label>
            <label>
              <span className={styles.label}>Seed</span>
              <input
                className={styles.numberInput}
                type="number"
                aria-label="Global seed"
                min={0}
                step={1}
                value={draftContext.seed}
                onChange={(event) =>
                  setDraftContext((current) => ({
                    ...current,
                    seed: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              <span className={styles.label}>Render Mode</span>
              <select
                className={styles.selectInput}
                aria-label="Render mode"
                value={renderMode}
                onChange={(event) =>
                  setRenderMode(event.target.value as "live" | "manual")
                }
              >
                <option value="live">Live</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <div>
              <span className={styles.label}>Render</span>
              {renderMode === "manual" ? (
                <button
                  className={styles.renderButton}
                  disabled={rendering || !dirty}
                  onClick={onRenderClick}
                  type="button"
                >
                  {renderButtonLabel}
                </button>
              ) : (
                <button className={styles.renderButton} disabled type="button">
                  Live
                </button>
              )}
            </div>
          </div>

          <div className={styles.controlsRow}>
            <button
              className={styles.secondaryButton}
              onClick={onDownloadSvg}
              type="button"
              disabled={!normalizedDocument}
            >
              Download SVG
            </button>
          </div>

          {renderError ? <p className={styles.status}>Render error: {renderError}</p> : null}
        </>
      ),
    },
    panelSettings: {
      title: "Reset Plot Garden",
      body: (
        <>
          <p className={styles.status}>
            Reset section order, collapsed state, and sidebar width back to defaults.
          </p>
          <div className={styles.controlsRow}>
            <button
              className={`${styles.fullWidthButton} ${
                confirmResetPlotGarden ? styles.dangerButton : styles.secondaryButton
              }`}
              onClick={onResetPlotGarden}
              type="button"
            >
              Reset Plot Garden
            </button>
          </div>
        </>
      ),
    },
  };

  const sectionsByView: Record<
    ControlPanelView,
    Partial<Record<PanelSectionId, { title: string; body: ReactNode }>>
  > = {
    default: defaultSidebarSections,
    help: helpSidebarSections,
    settings: settingsSidebarSections,
  };

  const renderedMode = renderedControlPanelView;
  const renderedModeSections = sectionsByView[renderedMode];
  const renderedModeState = panelSectionModes[renderedMode];
  const renderedModeOrder = renderedModeState.order;
  const renderedModeCollapsed = renderedModeState.collapsed;
  const draggingSection = draggingSectionId ? renderedModeSections[draggingSectionId] : null;

  const helpOpen = controlPanelView === "help";
  const settingsOpen = controlPanelView === "settings";
  const controlPanelBody = (
    <DndContext
      id="panel-sections-dnd"
      modifiers={[restrictSectionDragToVerticalAxis]}
      collisionDetection={closestCenter}
      onDragCancel={onSectionDragCancel}
      onDragEnd={onSectionDragEnd}
      onDragStart={onSectionDragStart}
      sensors={sectionSensors}
    >
      <SortableContext items={renderedModeOrder} strategy={verticalListSortingStrategy}>
        {renderedModeOrder.map((sectionId) => {
          const section = renderedModeSections[sectionId];
          if (!section) return null;

          return (
            <SortablePanelSection
              collapsed={renderedModeCollapsed[sectionId]}
              draggingSource={draggingSectionId === sectionId}
              key={sectionId}
              landingPhase={
                landingSection && landingSection.id === sectionId ? landingSection.phase : null
              }
              onToggleSection={onToggleSection}
              section={{
                id: sectionId,
                title: section.title,
                body: section.body,
              }}
            />
          );
        })}
      </SortableContext>
      <DragOverlay adjustScale={false} dropAnimation={SECTION_DROP_ANIMATION}>
        {draggingSectionId && draggingSection ? (
          <SectionDragOverlay
            collapsed={renderedModeCollapsed[draggingSectionId]}
            section={{
              id: draggingSectionId,
              title: draggingSection.title,
              body: draggingSection.body,
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <div className={styles.shell} ref={shellRef} style={shellStyle}>
      <aside className={styles.sidebar}>
        <div className={styles.controlPanelHeader}>
          <h2 className={styles.controlPanelTitle}>Plot Garden</h2>
          <div className={styles.controlPanelActions}>
            <button
              className={`${styles.controlPanelIconButton} ${
                helpOpen ? styles.controlPanelIconButtonActive : ""
              }`}
              aria-label={helpOpen ? "Close help panel" : "Open help panel"}
              aria-pressed={helpOpen}
              onClick={() => onControlPanelIconClick("help")}
              type="button"
            >
              {helpOpen ? <X size={18} strokeWidth={2} /> : <CircleHelp size={18} strokeWidth={2} />}
            </button>
            <button
              className={`${styles.controlPanelIconButton} ${
                settingsOpen ? styles.controlPanelIconButtonActive : ""
              }`}
              aria-label={settingsOpen ? "Close panel settings" : "Open panel settings"}
              aria-pressed={settingsOpen}
              onClick={() => onControlPanelIconClick("settings")}
              type="button"
            >
              {settingsOpen ? <X size={18} strokeWidth={2} /> : <Settings size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>
        <div
          className={`${styles.controlPanelContent} ${
            controlPanelContentVisible ? "" : styles.controlPanelContentHidden
          }`}
        >
          {controlPanelBody}
        </div>
      </aside>

      <div
        className={`${styles.resizeHandle} ${
          isResizingPanel ? styles.resizeHandleActive : ""
        }`}
        role="separator"
        aria-label="Resize control panel"
        aria-orientation="vertical"
        onPointerDown={onPanelResizePointerDown}
      />

      <main className={styles.previewPane}>
        <header className={styles.previewHeader}>
          <div>
            <h1 className={styles.previewTitle}>{selectedEntry.manifest.title}</h1>
          </div>
          <p className={styles.muted}>/{selectedEntry.manifest.slug}</p>
        </header>

        <div className={styles.canvasViewport}>
          <div className={styles.canvasWrap} style={canvasWrapStyle}>
            {previewSvgMarkup ? (
              <div
                className={styles.previewSvg}
                dangerouslySetInnerHTML={{ __html: previewSvgMarkup }}
              />
            ) : null}
          </div>

          <footer className={styles.canvasFooter}>
            <p className={styles.previewDescription}>
              {selectedEntry.manifest.description}
            </p>

            {jobPlan ? (
              <p className={styles.canvasFooterStats}>
                {jobPlan.stats.layerCount} layers, {jobPlan.stats.strokeCount} strokes, draw{" "}
                {prettyDistance(jobPlan.stats.drawDistance, draftContext.units)}, travel{" "}
                {prettyDistance(jobPlan.stats.travelDistance, draftContext.units)}.
                {jobPlan.stats.outOfBoundsPoints > 0
                  ? ` ${jobPlan.stats.outOfBoundsPoints} points exceed ${plotterConfig.model} bounds.`
                  : ""}
              </p>
            ) : null}
          </footer>
        </div>
      </main>

      {confirmSendOpen && jobPlan ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Confirm Plot Job</h3>
            <p className={styles.status}>
              Mode: <strong>{layerMode}</strong>
            </p>
            <p className={styles.status}>
              Layers: {jobPlan.stats.layerCount}, strokes: {jobPlan.stats.strokeCount}
            </p>
            <p className={styles.status}>
              Draw distance: {prettyDistance(jobPlan.stats.drawDistance, draftContext.units)}
            </p>
            <p className={styles.status}>
              Travel distance: {prettyDistance(jobPlan.stats.travelDistance, draftContext.units)}
            </p>
            {jobPlan.stats.outOfBoundsPoints > 0 ? (
              <p className={styles.status}>
                Warning: {jobPlan.stats.outOfBoundsPoints} points exceed model bounds.
              </p>
            ) : null}
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setConfirmSendOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.actionButton}
                onClick={onSendConfirmed}
                type="button"
              >
                Start Plot
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
