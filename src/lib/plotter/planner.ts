import type {
  NormalizedSketchDocument,
  Point,
  Polyline,
} from "@/lib/sketch-core/types";

import {
  AXIDRAW_MODEL_BOUNDS,
  type PlotJobPlan,
  type PlotLayerMode,
  type PlotterConfig,
} from "@/lib/plotter/types";
import { optimizePolylines } from "@/lib/plotter/optimize";

function toInches(value: number, units: "in" | "mm"): number {
  return units === "in" ? value : value / 25.4;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineLength(polyline: Polyline): number {
  let length = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    length += distance(polyline[index - 1] as Point, polyline[index] as Point);
  }
  return length;
}

function mapPolylineUnits(polyline: Polyline, units: "in" | "mm"): Polyline {
  return polyline.map((point) => ({
    x: toInches(point.x, units),
    y: toInches(point.y, units),
  }));
}

export function createPlotJobPlan(
  document: NormalizedSketchDocument,
  mode: PlotLayerMode,
  config: PlotterConfig,
): PlotJobPlan {
  const repeatedLayerCopies = Math.max(1, Math.floor(config.repeatCount));
  const normalizedLayers = document.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    polylines: layer.polylines.map((polyline) =>
      mapPolylineUnits(polyline, document.units),
    ),
  }));

  const layerGroups =
    mode === "flatten"
      ? [
          {
            id: "flattened",
            name: "Flattened Layer",
            polylines: normalizedLayers.flatMap((layer) => layer.polylines),
          },
        ]
      : normalizedLayers;

  const plannedLayers = layerGroups
    .map((layer) => ({
      ...layer,
      polylines: optimizePolylines(layer.polylines),
    }))
    .flatMap((layer) =>
      Array.from({ length: repeatedLayerCopies }, (_, copyIndex) => ({
        id:
          repeatedLayerCopies > 1
            ? `${layer.id}-copy-${copyIndex + 1}`
            : layer.id,
        name:
          repeatedLayerCopies > 1
            ? `${layer.name} (${copyIndex + 1}/${repeatedLayerCopies})`
            : layer.name,
        polylines: layer.polylines.map((polyline) =>
          polyline.map((point) => ({ ...point })),
        ),
      })),
    );

  const bounds = AXIDRAW_MODEL_BOUNDS[config.model];
  let strokeCount = 0;
  let pointCount = 0;
  let drawDistance = 0;
  let travelDistance = 0;
  let outOfBoundsPoints = 0;

  for (const layer of plannedLayers) {
    let cursor: Point | null = null;

    for (const polyline of layer.polylines) {
      if (polyline.length < 2) continue;

      strokeCount += 1;
      pointCount += polyline.length;
      drawDistance += polylineLength(polyline);

      const start = polyline[0] as Point;
      if (cursor) travelDistance += distance(cursor, start);
      cursor = polyline[polyline.length - 1] as Point;

      for (const point of polyline) {
        if (
          point.x < 0 ||
          point.y < 0 ||
          point.x > bounds.widthInches ||
          point.y > bounds.heightInches
        ) {
          outOfBoundsPoints += 1;
        }
      }
    }
  }

  return {
    mode,
    layers: plannedLayers,
    stats: {
      layerCount: plannedLayers.length,
      strokeCount,
      pointCount,
      drawDistance,
      travelDistance,
      outOfBoundsPoints,
    },
  };
}
