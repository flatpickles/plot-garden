import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type {
  GeometrySketchOutput,
  Point,
  Polyline,
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
} from "@/lib/sketch-core/types";

const schema = {
  seed: {
    type: "number",
    label: "Seed",
    description: "Deterministic random seed.",
    default: 2718,
    min: 0,
    max: 999999,
    step: 1,
  },
  cloudCount: {
    type: "number",
    label: "Clouds",
    description: "Number of major cloud masses in the stack.",
    default: 4,
    min: 2,
    max: 8,
    step: 1,
  },
  contourLevels: {
    type: "number",
    label: "Contours",
    description: "Nested contour loops per cloud mass.",
    default: 6,
    min: 2,
    max: 14,
    step: 1,
  },
  drift: {
    type: "number",
    label: "Drift",
    description: "How much the clouds shear and wander.",
    default: 0.46,
    min: 0,
    max: 1,
    step: 0.01,
  },
  starfield: {
    type: "boolean",
    label: "Starfield",
    description: "Scatter a sparse field of stars around the nebula.",
    default: true,
  },
} as const satisfies SketchParamSchema;

type CloudAnchor = {
  center: Point;
  radiusX: number;
  radiusY: number;
  phase: number;
};

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 0.0017) * 43758.5453123;
  return fract(value);
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = fract(x);
  const ty = fract(y);

  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);

  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);

  const mixAB = a * (1 - ux) + b * ux;
  const mixCD = c * (1 - ux) + d * ux;

  return mixAB * (1 - uy) + mixCD * uy;
}

function fbm(x: number, y: number, seed: number): number {
  let amplitude = 0.5;
  let frequency = 1;
  let value = 0;

  for (let octave = 0; octave < 5; octave += 1) {
    value += noise(x * frequency, y * frequency, seed + octave * 9151) * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }

  return value;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeNebulaContour(
  center: Point,
  radiusX: number,
  radiusY: number,
  phase: number,
  drift: number,
  seed: number,
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  },
): Polyline {
  const segments = 220;
  const polyline: Polyline = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const theta = t * Math.PI * 2;
    const domainX = Math.cos(theta) * 1.3 + phase * 0.35 + center.x * 0.08;
    const domainY = Math.sin(theta) * 1.3 - phase * 0.28 + center.y * 0.08;
    const field = (fbm(domainX, domainY, seed) - 0.5) * 0.56;
    const swirl =
      Math.sin(theta * 3 + phase) * 0.11 + Math.cos(theta * 5 - phase * 0.6) * 0.07;
    const plume = Math.sin(theta - Math.PI / 2) * drift * 0.16;

    const localRadiusX = radiusX * (1 + field + swirl + plume * 0.6);
    const localRadiusY = radiusY * (1 + field * 0.85 - swirl * 0.25 - plume);

    polyline.push({
      x: clamp(center.x + Math.cos(theta) * localRadiusX, bounds.minX, bounds.maxX),
      y: clamp(center.y + Math.sin(theta) * localRadiusY, bounds.minY, bounds.maxY),
    });
  }

  return polyline;
}

function makeFilament(
  index: number,
  yT: number,
  seed: number,
  drift: number,
  anchors: CloudAnchor[],
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  },
): Polyline {
  const sampleCount = 180;
  const points: Polyline = [];
  const baseY = lerp(bounds.minY, bounds.maxY, yT);

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const t = sampleIndex / sampleCount;
    const x = lerp(bounds.minX, bounds.maxX, t);

    const macro =
      Math.sin(t * Math.PI * (2.2 + drift * 2.8) + index * 0.73 + seed * 0.0015) *
      bounds.height *
      0.03;
    const turbulence =
      (fbm(t * 4.2 + index * 0.21, yT * 3.4 - index * 0.17, seed + index * 1013) - 0.5) *
      bounds.height *
      (0.08 + drift * 0.08);

    const cloudPull = anchors.reduce((sum, anchor, anchorIndex) => {
      const dx = Math.abs(x - anchor.center.x) / Math.max(anchor.radiusX, 0.001);
      const dy = Math.abs(baseY - anchor.center.y) / Math.max(anchor.radiusY * 2.8, 0.001);
      const influence = Math.exp(-(dx * dx * 0.7 + dy * dy));
      return (
        sum +
        influence *
          Math.sin(t * Math.PI * 4 + anchor.phase + anchorIndex * 0.6) *
          bounds.height *
          0.012
      );
    }, 0);

    points.push({
      x,
      y: clamp(baseY + macro + turbulence + cloudPull, bounds.minY, bounds.maxY),
    });
  }

  return points;
}

function makeStar(center: Point, size: number, tilt: number): Polyline[] {
  const diagonal = size * 0.75;
  return [
    [
      { x: center.x - size, y: center.y },
      { x: center.x + size, y: center.y },
    ],
    [
      { x: center.x, y: center.y - size },
      { x: center.x, y: center.y + size },
    ],
    [
      {
        x: center.x - Math.cos(tilt) * diagonal,
        y: center.y - Math.sin(tilt) * diagonal,
      },
      {
        x: center.x + Math.cos(tilt) * diagonal,
        y: center.y + Math.sin(tilt) * diagonal,
      },
    ],
  ];
}

export default class Nebulous extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): GeometrySketchOutput {
    const random = mulberry32(params.seed);
    const portraitRatio = 12 / 9;
    const currentRatio = context.height / context.width;
    const ratioBias = clamp(currentRatio / portraitRatio, 0.72, 1.25);
    const margin = Math.min(context.width, context.height) * 0.08;
    const bounds = {
      minX: margin,
      maxX: context.width - margin,
      minY: margin,
      maxY: context.height - margin,
      width: context.width - margin * 2,
      height: context.height - margin * 2,
    };

    const cloudCount = Math.max(2, Math.floor(params.cloudCount));
    const contourLevels = Math.max(2, Math.floor(params.contourLevels));

    const anchors: CloudAnchor[] = Array.from({ length: cloudCount }, (_, index) => {
      const t = cloudCount === 1 ? 0.5 : index / (cloudCount - 1);
      const centerWeight = 1 - Math.abs(t - 0.5) * 1.5;
      const xOffset =
        Math.sin(t * Math.PI * 2 + params.seed * 0.0012) * bounds.width * 0.1 +
        (random() - 0.5) * bounds.width * 0.12;
      const yOffset = (random() - 0.5) * bounds.height * 0.05;

      return {
        center: {
          x: context.width * 0.5 + xOffset * (0.55 + params.drift * 0.45),
          y: lerp(bounds.minY + bounds.height * 0.12, bounds.maxY - bounds.height * 0.12, t) + yOffset,
        },
        radiusX: bounds.width * (0.16 + centerWeight * 0.14 + random() * 0.05) * ratioBias,
        radiusY: bounds.height * (0.055 + centerWeight * 0.075 + random() * 0.02),
        phase: random() * Math.PI * 2,
      };
    });

    const cloudPolylines = anchors.flatMap((anchor, cloudIndex) =>
      Array.from({ length: contourLevels }, (_, level) => {
        const t = contourLevels === 1 ? 0.5 : level / (contourLevels - 1);
        const scale = 1.16 - t * 0.54;
        const offsetAmount = (0.5 - t) * bounds.width * 0.035;
        const center = {
          x:
            anchor.center.x +
            Math.cos(anchor.phase + t * Math.PI * 2) * offsetAmount * (0.6 + params.drift * 0.5),
          y:
            anchor.center.y +
            Math.sin(anchor.phase * 0.7 - t * Math.PI * 2) * bounds.height * 0.02,
        };

        return makeNebulaContour(
          center,
          anchor.radiusX * scale,
          anchor.radiusY * (scale + 0.08),
          anchor.phase + t * 0.8,
          params.drift,
          params.seed + cloudIndex * 997 + level * 131,
          bounds,
        );
      }),
    );

    const filamentCount = Math.max(6, cloudCount * 3);
    const filamentPolylines = Array.from({ length: filamentCount }, (_, index) => {
      const t = (index + 1) / (filamentCount + 1);
      return makeFilament(index, t, params.seed, params.drift, anchors, bounds);
    });

    const starPolylines: Polyline[] = [];

    if (params.starfield) {
      const starCount = cloudCount * 6;
      let placed = 0;
      let attempts = 0;

      while (placed < starCount && attempts < starCount * 12) {
        attempts += 1;

        const edgeBand = random();
        const x =
          edgeBand < 0.5
            ? lerp(bounds.minX, bounds.maxX, random())
            : edgeBand < 0.75
              ? lerp(bounds.minX, bounds.minX + bounds.width * 0.18, random())
              : lerp(bounds.maxX - bounds.width * 0.18, bounds.maxX, random());
        const y =
          edgeBand < 0.25
            ? lerp(bounds.minY, bounds.minY + bounds.height * 0.18, random())
            : edgeBand < 0.5
              ? lerp(bounds.maxY - bounds.height * 0.18, bounds.maxY, random())
              : lerp(bounds.minY, bounds.maxY, random());

        const point = { x, y };
        const nearCloud = anchors.some(
          (anchor) => distance(point, anchor.center) < Math.max(anchor.radiusX, anchor.radiusY) * 1.15,
        );
        if (nearCloud) continue;

        const size = Math.min(context.width, context.height) * (0.008 + random() * 0.007);
        starPolylines.push(...makeStar(point, size, random() * Math.PI));
        placed += 1;
      }
    }

    return {
      kind: "geometry",
      layers: [
        { id: "clouds", name: "Clouds", polylines: cloudPolylines },
        { id: "filaments", name: "Filaments", polylines: filamentPolylines },
        { id: "stars", name: "Stars", polylines: starPolylines },
      ],
    };
  }
}
