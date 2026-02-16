"use client";

import {
  type CSSProperties,
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
  supportsWebSerial,
  type PlotLayerMode,
  type PlotterConfig,
  type PlotterStatus,
} from "@/lib/plotter";
import {
  readLocalStorageJSON,
  writeLocalStorageJSON,
} from "@/lib/utils/localStorage";
import {
  DEFAULT_PANEL_SECTION_COLLAPSED,
  DEFAULT_PANEL_SECTION_ORDER,
  PANEL_SECTION_PREFS_COOKIE_KEY,
  PANEL_SECTION_PREFS_STORAGE_KEY,
  type PanelSectionId,
  type PanelSectionPreferences,
  isPanelSectionId,
  sanitizePanelSectionPreferences,
  serializePanelSectionPreferencesCookie,
} from "@/lib/ui/panelSectionPreferences";

import styles from "./SketchWorkbench.module.css";

const DEFAULT_CONTEXT: SketchRenderContext = {
  width: 8,
  height: 6,
  units: "in",
  seed: 1,
};

const PLOTTER_CONFIG_STORAGE_KEY = "vibe-plotter.plotter-config";
const SECTION_DROP_TRAVEL_MS = 280;
const SECTION_DROP_FADE_MS = 220;
const SECTION_ACTIVE_FADE_IN_MS = 120;
const SECTION_DROP_ANIMATION_MS = SECTION_DROP_TRAVEL_MS + SECTION_DROP_FADE_MS;
const SECTION_REAL_FADE_COMPLETE_MS = SECTION_DROP_TRAVEL_MS + SECTION_ACTIVE_FADE_IN_MS;

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
          <span className={styles.sectionCollapseCaret}>
            {collapsed ? "▾" : "▴"}
          </span>
        </span>
      </div>
      {!collapsed ? <div className={styles.sectionBody}>{section.body}</div> : null}
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

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`${styles.section} ${isDragging ? styles.sectionDragging : ""}`}
    >
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
          <span className={styles.sectionCollapseCaret} aria-hidden>
            {collapsed ? "▾" : "▴"}
          </span>
        </button>
      </div>
      {!collapsed ? (
        <div className={styles.sectionBody} id={contentId}>
          {section.body}
        </div>
      ) : null}
    </section>
  );
}

export function SketchWorkbench({
  initialSlug,
  initialPanelSectionPreferences,
}: {
  initialSlug: string;
  initialPanelSectionPreferences?: PanelSectionPreferences | null;
}) {
  const router = useRouter();

  const [directPlottingAvailable, setDirectPlottingAvailable] = useState(false);
  const [serialAvailable, setSerialAvailable] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [searchTerm, setSearchTerm] = useState("");

  const selectedEntry =
    sketchRegistry.find((entry) => entry.manifest.slug === selectedSlug) ??
    sketchRegistry[0];
  const sketch = useMemo(
    () => (selectedEntry ? new selectedEntry.Sketch() : null),
    [selectedEntry],
  );

  const [draftParams, setDraftParams] = useState<Record<string, SketchParamValue>>({});
  const [renderedParams, setRenderedParams] = useState<
    Record<string, SketchParamValue>
  >({});
  const [draftContext, setDraftContext] =
    useState<SketchRenderContext>(DEFAULT_CONTEXT);
  const [renderedContext, setRenderedContext] =
    useState<SketchRenderContext>(DEFAULT_CONTEXT);

  const [renderMode, setRenderMode] = useState<"live" | "manual">("live");
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [normalizedDocument, setNormalizedDocument] =
    useState<Awaited<ReturnType<typeof normalizeSketchOutput>> | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);

  const [layerMode, setLayerMode] = useState<PlotLayerMode>("ordered");
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const [plotterConfig, setPlotterConfig] =
    useState<PlotterConfig>(DEFAULT_PLOTTER_CONFIG);
  const seededPanelPreferences = initialPanelSectionPreferences
    ? sanitizePanelSectionPreferences(initialPanelSectionPreferences)
    : null;
  const [panelSectionOrder, setPanelSectionOrder] = useState<PanelSectionId[]>(
    seededPanelPreferences?.order ?? DEFAULT_PANEL_SECTION_ORDER,
  );
  const [collapsedSections, setCollapsedSections] = useState<
    Record<PanelSectionId, boolean>
  >(seededPanelPreferences?.collapsed ?? DEFAULT_PANEL_SECTION_COLLAPSED);
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
  const sectionSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const landingRevealTimeoutRef = useRef<number | null>(null);
  const landingResetTimeoutRef = useRef<number | null>(null);

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

  const transportRef = useRef<AxiDrawWebSerialTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = new AxiDrawWebSerialTransport();
  }

  const [plotterStatus, setPlotterStatus] = useState<PlotterStatus>(
    transportRef.current.getStatus(),
  );

  useEffect(() => {
    setDirectPlottingAvailable(supportsDirectPlotting());
    setSerialAvailable(supportsWebSerial());
  }, []);

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
      setPanelSectionOrder(safePreferences.order);
      setCollapsedSections(safePreferences.collapsed);
    }
    setPanelSectionPrefsReady(true);
  }, [panelSectionPrefsReady]);

  useEffect(() => {
    writeLocalStorageJSON(PLOTTER_CONFIG_STORAGE_KEY, plotterConfig);
  }, [plotterConfig]);

  useEffect(() => {
    if (!panelSectionPrefsReady) return;

    const nextPreferences: PanelSectionPreferences = {
      order: panelSectionOrder,
      collapsed: collapsedSections,
    };
    writeLocalStorageJSON(PANEL_SECTION_PREFS_STORAGE_KEY, {
      order: panelSectionOrder,
      collapsed: collapsedSections,
    });
    document.cookie = `${PANEL_SECTION_PREFS_COOKIE_KEY}=${serializePanelSectionPreferencesCookie(
      nextPreferences,
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [collapsedSections, panelSectionOrder, panelSectionPrefsReady]);

  useEffect(() => {
    return () => clearLandingTimers();
  }, [clearLandingTimers]);

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

    const defaults = sketch.getDefaultParams() as Record<string, SketchParamValue>;
    setDraftParams(defaults);
    setRenderedParams(defaults);
    setDraftContext(DEFAULT_CONTEXT);
    setRenderedContext(DEFAULT_CONTEXT);
    setHoveredLayerId(null);
    void performRender(defaults, DEFAULT_CONTEXT);
  }, [sketch, performRender]);

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
      background: "#fff8ee",
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

  const jobPlan = useMemo(() => {
    if (!normalizedDocument) return null;
    return createPlotJobPlan(normalizedDocument, layerMode, plotterConfig);
  }, [layerMode, normalizedDocument, plotterConfig]);

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

  const onToggleSection = (sectionId: PanelSectionId) => {
    setCollapsedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
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

    setPanelSectionOrder((current) => {
      const sourceIndex = current.indexOf(sourceSectionId);
      const targetIndex = current.indexOf(targetSectionId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      return arrayMove(current, sourceIndex, targetIndex);
    });
  };

  if (!selectedEntry || !sketch) {
    return <div className={styles.shell}>No sketches found.</div>;
  }

  const schemaEntries = Object.entries(sketch.schema) as [
    string,
    SketchParamDefinition,
  ][];
  const sidebarSections: Record<
    PanelSectionId,
    { title: string; body: ReactNode }
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
          <div className={styles.radioStack}>
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

          <div
            className={styles.layerList}
            onMouseLeave={() => setHoveredLayerId(null)}
          >
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
          {!directPlottingAvailable ? (
            <p className={styles.status}>
              {serialAvailable
                ? "This browser is not Chromium-based. Direct plotting is disabled, but rendering and SVG export still work."
                : "Web Serial is unavailable here. Use Chromium desktop for direct plotting."}
            </p>
          ) : null}

          <div className={styles.controlsRow}>
            <button
              className={styles.actionButton}
              disabled={!serialAvailable || plotterStatus.state === "connecting"}
              onClick={onConnect}
              type="button"
            >
              Connect
            </button>
            <button
              className={styles.secondaryButton}
              disabled={!transportRef.current?.isConnected()}
              onClick={onDisconnect}
              type="button"
            >
              Disconnect
            </button>
          </div>

          <div className={styles.controlsRow}>
            <button
              className={styles.actionButton}
              disabled={
                !directPlottingAvailable ||
                !transportRef.current?.isConnected() ||
                !packets.length ||
                plotterStatus.state === "plotting"
              }
              onClick={() => setConfirmSendOpen(true)}
              type="button"
            >
              Send to Plotter
            </button>
            <button
              className={styles.secondaryButton}
              disabled={plotterStatus.state !== "plotting"}
              onClick={onPause}
              type="button"
            >
              Pause
            </button>
            <button
              className={styles.secondaryButton}
              disabled={plotterStatus.state !== "paused"}
              onClick={onResume}
              type="button"
            >
              Resume
            </button>
            <button
              className={styles.dangerButton}
              disabled={
                plotterStatus.state !== "plotting" &&
                plotterStatus.state !== "paused"
              }
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
          </div>

          <details>
            <summary>More plotter config</summary>
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
                  <option value="A2">AxiDraw A2</option>
                  <option value="A1">AxiDraw A1</option>
                  <option value="XLX">AxiDraw XLX</option>
                  <option value="MiniKit">AxiDraw MiniKit</option>
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
          </details>

          <p className={styles.status}>
            {plotterStatus.message ?? "Status unavailable"}
            {plotterStatus.totalPackets
              ? ` (${plotterStatus.sentPackets ?? 0}/${plotterStatus.totalPackets})`
              : ""}
          </p>
        </>
      ),
    },
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <DndContext
          id="panel-sections-dnd"
          collisionDetection={closestCenter}
          onDragCancel={onSectionDragCancel}
          onDragEnd={onSectionDragEnd}
          onDragStart={onSectionDragStart}
          sensors={sectionSensors}
        >
          <SortableContext
            items={panelSectionOrder}
            strategy={verticalListSortingStrategy}
          >
            {panelSectionOrder.map((sectionId) => {
              const section = sidebarSections[sectionId];
              return (
                <SortablePanelSection
                  collapsed={collapsedSections[sectionId]}
                  draggingSource={draggingSectionId === sectionId}
                  key={sectionId}
                  landingPhase={
                    landingSection && landingSection.id === sectionId
                      ? landingSection.phase
                      : null
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
            {draggingSectionId ? (
              <SectionDragOverlay
                collapsed={collapsedSections[draggingSectionId]}
                section={{
                  id: draggingSectionId,
                  title: sidebarSections[draggingSectionId].title,
                  body: sidebarSections[draggingSectionId].body,
                }}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </aside>

      <main className={styles.previewPane}>
        <header className={styles.previewHeader}>
          <div>
            <h1 className={styles.previewTitle}>{selectedEntry.manifest.title}</h1>
            <p className={styles.previewDescription}>
              {selectedEntry.manifest.description}
            </p>
          </div>
          <p className={styles.muted}>/{selectedEntry.manifest.slug}</p>
        </header>

        <div className={styles.canvasWrap} style={{ aspectRatio: canvasAspectRatio }}>
          {previewSvgMarkup ? (
            <div
              className={styles.previewSvg}
              dangerouslySetInnerHTML={{ __html: previewSvgMarkup }}
            />
          ) : null}
        </div>

        {jobPlan ? (
          <div className={styles.status}>
            {jobPlan.stats.layerCount} layers, {jobPlan.stats.strokeCount} strokes, draw{" "}
            {prettyDistance(jobPlan.stats.drawDistance, draftContext.units)}, travel{" "}
            {prettyDistance(jobPlan.stats.travelDistance, draftContext.units)}.
            {jobPlan.stats.outOfBoundsPoints > 0
              ? ` ${jobPlan.stats.outOfBoundsPoints} points exceed ${plotterConfig.model} bounds.`
              : ""}
          </div>
        ) : null}
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
