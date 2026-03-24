import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type {
  GeometrySketchOutput,
  Point,
  Polyline,
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
} from "@/lib/sketch-core/types";

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_SPIRAL_DECAY = (2 * Math.log(PHI)) / Math.PI;
const PHASE_SAMPLES = 720;
const MIN_BOX_SIZE = 0.01;

const schema = {
  edgePadding: {
    type: "number",
    label: "Edge Padding",
    description: "Inset from the page edges before fitting the spiral.",
    default: 0.35,
    min: 0,
    max: 3,
    step: 0.05,
  },
  spiralDepth: {
    type: "number",
    label: "Spiral Depth",
    description: "Quarter-turns drawn inward toward the center.",
    default: 12,
    min: 2,
    max: 32,
    step: 1,
  },
} as const satisfies SketchParamSchema;

type SpiralFit = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  points: Polyline;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sampleCanonicalSpiral(
  phase: number,
  direction: -1 | 1,
  quarterTurns: number,
): SpiralFit {
  const totalAngle = quarterTurns * (Math.PI / 2);
  const sampleCount = Math.max(quarterTurns * 64, 160);
  const rawPoints: Polyline = [];

  for (let index = 0; index <= sampleCount; index += 1) {
    const t = (index / sampleCount) * totalAngle;
    const angle = phase + direction * t;
    const radius = Math.exp(-GOLDEN_SPIRAL_DECAY * t);
    rawPoints.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
  }

  const firstPoint = rawPoints[0] as Point;
  const points = rawPoints.map((point) => ({
    x: point.x - firstPoint.x,
    y: point.y - firstPoint.y,
  }));

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    points,
  };
}

function chooseSpiralFit(targetRatio: number, quarterTurns: number): SpiralFit {
  const preferredDirection: -1 | 1 = targetRatio >= 1 ? -1 : 1;
  const directions: Array<-1 | 1> = [preferredDirection, preferredDirection === -1 ? 1 : -1];
  let bestFit: SpiralFit | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const direction of directions) {
    for (let index = 0; index < PHASE_SAMPLES; index += 1) {
      const phase = (index / PHASE_SAMPLES) * Math.PI * 2;
      const fit = sampleCanonicalSpiral(phase, direction, quarterTurns);
      const overshoot = Math.max(0, -fit.minX) + Math.max(0, fit.maxY);

      if (fit.maxX <= 0 || fit.minY >= 0) {
        continue;
      }

      const ratio = -fit.minY / fit.maxX;
      const distortion = Math.abs(Math.log(targetRatio / ratio));
      const score = overshoot * 1000 + distortion;

      if (score < bestScore) {
        bestScore = score;
        bestFit = fit;
      }
    }

    if (bestFit && bestScore < 0.02) {
      break;
    }
  }

  return bestFit ?? sampleCanonicalSpiral((163 / 360) * Math.PI * 2, 1, quarterTurns);
}

function buildGoldenSpiral(
  padding: number,
  quarterTurns: number,
  context: SketchRenderContext,
): Polyline {
  const maxPadding = Math.max(0, Math.min(context.width, context.height) / 2 - MIN_BOX_SIZE);
  const inset = clamp(padding, 0, maxPadding);
  const left = inset;
  const top = inset;
  const right = Math.max(left + MIN_BOX_SIZE, context.width - inset);
  const bottom = Math.max(top + MIN_BOX_SIZE, context.height - inset);
  const availableWidth = right - left;
  const availableHeight = bottom - top;
  const targetRatio = availableHeight / availableWidth;
  const fit = chooseSpiralFit(targetRatio, quarterTurns);
  const scaleX = availableWidth / Math.max(fit.maxX, MIN_BOX_SIZE);
  const scaleY = availableHeight / Math.max(-fit.minY, MIN_BOX_SIZE);

  return fit.points.map((point) => ({
    x: left + point.x * scaleX,
    y: bottom + point.y * scaleY,
  }));
}

export default class Nebulous extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): GeometrySketchOutput {
    const spiralDepth = Math.max(2, Math.floor(params.spiralDepth));
    const spiral = buildGoldenSpiral(params.edgePadding, spiralDepth, context);

    return {
      kind: "geometry",
      layers: [
        {
          id: "spiral",
          name: "Golden Spiral",
          polylines: [spiral],
        },
      ],
    };
  }
}
