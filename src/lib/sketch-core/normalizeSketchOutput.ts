import { parse, stringify, type INode } from "svgson";
import { svgPathProperties } from "svg-path-properties";

import type {
  GeometryLayer,
  NormalizedLayer,
  NormalizedSketchDocument,
  Point,
  Polyline,
  SketchOutput,
  SketchRenderContext,
  SvgRenderOptions,
} from "@/lib/sketch-core/types";

function parseFloatOr(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value.replace(/[a-zA-Z%]+/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pointsToPath(polyline: Polyline): string {
  if (!polyline.length) return "";
  const first = polyline[0];
  if (!first) return "";
  const rest = polyline.slice(1);
  const commands = [`M ${first.x} ${first.y}`];
  for (const point of rest) {
    commands.push(`L ${point.x} ${point.y}`);
  }
  return commands.join(" ");
}

function pointsStringToPolyline(pointsAttribute: string): Polyline {
  const chunks = pointsAttribute
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.split(","));

  return chunks
    .map(([x, y]) => ({
      x: Number.parseFloat(x ?? ""),
      y: Number.parseFloat(y ?? ""),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function normalizeGeometryLayer(layer: GeometryLayer, index: number): NormalizedLayer {
  const name = layer.name?.trim() || `Layer ${index + 1}`;
  const polylines = layer.polylines.filter((polyline) => polyline.length >= 2);
  const svgMarkup = polylines
    .map((polyline) => {
      const d = pointsToPath(polyline);
      return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.012" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");

  return {
    id: layer.id,
    name,
    polylines,
    svgMarkup,
  };
}

function samplePath(pathData: string): Polyline {
  if (!pathData.trim()) return [];

  try {
    const properties = new svgPathProperties(pathData);
    const length = properties.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return [];

    const steps = Math.max(8, Math.min(300, Math.ceil(length / 2)));
    const sampled: Polyline = [];

    for (let index = 0; index <= steps; index += 1) {
      const at = (length * index) / steps;
      const point = properties.getPointAtLength(at);
      sampled.push({ x: point.x, y: point.y });
    }

    return sampled;
  } catch {
    return [];
  }
}

function sampleEllipse(cx: number, cy: number, rx: number, ry: number): Polyline {
  const segments = 48;
  const points: Polyline = [];

  for (let index = 0; index <= segments; index += 1) {
    const theta = (Math.PI * 2 * index) / segments;
    points.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry });
  }

  return points;
}

function collectPolylines(node: INode): Polyline[] {
  const polylines: Polyline[] = [];

  switch (node.name) {
    case "path": {
      const d = node.attributes.d ?? "";
      const polyline = samplePath(d);
      if (polyline.length >= 2) polylines.push(polyline);
      break;
    }

    case "line": {
      const x1 = parseFloatOr(node.attributes.x1, 0);
      const y1 = parseFloatOr(node.attributes.y1, 0);
      const x2 = parseFloatOr(node.attributes.x2, 0);
      const y2 = parseFloatOr(node.attributes.y2, 0);
      polylines.push([
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]);
      break;
    }

    case "polyline":
    case "polygon": {
      const polyline = pointsStringToPolyline(node.attributes.points ?? "");
      if (polyline.length >= 2) {
        if (node.name === "polygon") {
          const first = polyline[0];
          const last = polyline[polyline.length - 1];
          if (first && last && (first.x !== last.x || first.y !== last.y)) {
            polyline.push({ ...first });
          }
        }
        polylines.push(polyline);
      }
      break;
    }

    case "rect": {
      const x = parseFloatOr(node.attributes.x, 0);
      const y = parseFloatOr(node.attributes.y, 0);
      const width = parseFloatOr(node.attributes.width, 0);
      const height = parseFloatOr(node.attributes.height, 0);
      if (width > 0 && height > 0) {
        polylines.push([
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
          { x, y },
        ]);
      }
      break;
    }

    case "circle": {
      const cx = parseFloatOr(node.attributes.cx, 0);
      const cy = parseFloatOr(node.attributes.cy, 0);
      const radius = parseFloatOr(node.attributes.r, 0);
      if (radius > 0) polylines.push(sampleEllipse(cx, cy, radius, radius));
      break;
    }

    case "ellipse": {
      const cx = parseFloatOr(node.attributes.cx, 0);
      const cy = parseFloatOr(node.attributes.cy, 0);
      const rx = parseFloatOr(node.attributes.rx, 0);
      const ry = parseFloatOr(node.attributes.ry, 0);
      if (rx > 0 && ry > 0) polylines.push(sampleEllipse(cx, cy, rx, ry));
      break;
    }

    default:
      break;
  }

  for (const child of node.children) {
    polylines.push(...collectPolylines(child));
  }

  return polylines;
}

function flattenToSingleLayer(root: INode): INode {
  return {
    name: "g",
    type: "element",
    value: "",
    attributes: {},
    children: root.children,
  };
}

export async function normalizeSketchOutput(
  output: SketchOutput,
  context: SketchRenderContext,
): Promise<NormalizedSketchDocument> {
  if (output.kind === "geometry") {
    const layers = output.layers.map((layer, index) => normalizeGeometryLayer(layer, index));
    return {
      width: context.width,
      height: context.height,
      units: context.units,
      layers,
    };
  }

  const parsedSvg = await parse(output.svg);
  const topLevelGroups = parsedSvg.children.filter((node) => node.name === "g");
  const layeredNodes = topLevelGroups.length > 1 ? topLevelGroups : [flattenToSingleLayer(parsedSvg)];

  const normalizedLayers = layeredNodes.map((node, index) => {
    const attrs = node.attributes;
    const layerName =
      attrs["data-layer-name"] ??
      attrs["inkscape:label"] ??
      attrs.id ??
      attrs["data-name"] ??
      `Layer ${index + 1}`;

    return {
      id: attrs.id ?? `svg-layer-${index + 1}`,
      name: layerName,
      polylines: collectPolylines(node),
      svgMarkup: stringify(node),
    } satisfies NormalizedLayer;
  });

  return {
    width: context.width,
    height: context.height,
    units: context.units,
    layers: normalizedLayers,
  };
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderNormalizedDocumentToSvg(
  document: NormalizedSketchDocument,
  options: SvgRenderOptions = {},
): string {
  const { hoveredLayerId = null, dimOpacity = 0.15, background = "#fcf7ef" } = options;

  const groups = document.layers
    .map((layer) => {
      const dimmed = hoveredLayerId !== null && hoveredLayerId !== layer.id;
      const opacity = dimmed ? dimOpacity : 1;
      return `<g data-layer-id="${escapeAttr(layer.id)}" data-layer-name="${escapeAttr(layer.name)}" opacity="${opacity}">${layer.svgMarkup}</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}">
  <rect x="0" y="0" width="${document.width}" height="${document.height}" fill="${background}" />
  <g stroke="#1a1a1a" fill="none">
    ${groups}
  </g>
</svg>`;
}

export function clonePolylines(polylines: Polyline[]): Polyline[] {
  return polylines.map((polyline) => polyline.map((point) => ({ ...point })));
}

export function polylineLength(polyline: Polyline): number {
  let total = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    const previous = polyline[index - 1] as Point;
    const current = polyline[index] as Point;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}
