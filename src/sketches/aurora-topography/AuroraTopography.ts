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
    default: 314,
    min: 0,
    max: 999999,
    step: 1,
  },
  contourCount: {
    type: "number",
    label: "Contours",
    description: "Number of flowing contour lines.",
    default: 84,
    min: 12,
    max: 220,
    step: 1,
  },
  waveAmplitude: {
    type: "number",
    label: "Wave Amplitude",
    description: "Vertical contour movement intensity.",
    default: 0.22,
    min: 0.02,
    max: 0.8,
    step: 0.01,
  },
  turbulence: {
    type: "number",
    label: "Turbulence",
    description: "Fine-grain turbulence mixed into contours.",
    default: 0.42,
    min: 0,
    max: 1,
    step: 0.01,
  },
  haloCount: {
    type: "number",
    label: "Halo Rings",
    description: "Concentric rings around the aurora core.",
    default: 4,
    min: 0,
    max: 12,
    step: 1,
  },
  mirrorContours: {
    type: "boolean",
    label: "Mirror Contours",
    description: "Reflect contour fields for bilateral symmetry.",
    default: true,
  },
  starfield: {
    type: "boolean",
    label: "Starfield",
    description: "Add sparse star-cross strokes around the scene.",
    default: true,
  },
} as const satisfies SketchParamSchema;

const LOCAL_SEED = 1;

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 0.0019) * 43758.5453123;
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
    value += noise(x * frequency, y * frequency, seed + octave * 7919) * amplitude;
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

function mirroredPolyline(polyline: Polyline, centerY: number): Polyline {
  return polyline.map((point) => ({
    x: point.x,
    y: centerY + (centerY - point.y),
  }));
}

function makeHalo(
  center: Point,
  radius: number,
  jitter: number,
  seed: number,
  turnBias: number,
): Polyline {
  const segments = 280;
  const polyline: Polyline = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const theta = t * Math.PI * 2;
    const radialNoise = fbm(
      Math.cos(theta) * 1.4 + turnBias,
      Math.sin(theta) * 1.4 - turnBias,
      seed,
    );
    const ripple = Math.sin(theta * 3 + seed * 0.0008) * jitter * 0.5;
    const localRadius = radius + (radialNoise - 0.5) * jitter + ripple;

    polyline.push({
      x: center.x + Math.cos(theta) * localRadius,
      y: center.y + Math.sin(theta) * localRadius,
    });
  }

  return polyline;
}

export default class AuroraTopography extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): GeometrySketchOutput {
    const random = mulberry32(params.seed + LOCAL_SEED * 13);

    const inset = Math.min(context.width, context.height) * 0.06;
    const minX = inset;
    const maxX = context.width - inset;
    const minY = inset;
    const maxY = context.height - inset;

    const innerWidth = maxX - minX;
    const innerHeight = maxY - minY;

    const contourSamples = 240;
    const contourCount = Math.max(8, Math.floor(params.contourCount));
    const contours: Polyline[] = [];

    for (let contourIndex = 0; contourIndex < contourCount; contourIndex += 1) {
      const lineT = contourIndex / Math.max(1, contourCount - 1);
      const baselineY = minY + innerHeight * lineT;
      const curve: Polyline = [];

      for (let sampleIndex = 0; sampleIndex <= contourSamples; sampleIndex += 1) {
        const sampleT = sampleIndex / contourSamples;
        const x = minX + innerWidth * sampleT;

        const nx = sampleT * 3.6 + lineT * 0.8;
        const ny = lineT * 3.1 + sampleT * 0.6;

        const macro = Math.sin(nx * 2.8 + params.seed * 0.004) * 0.55;
        const micro = (fbm(nx + macro, ny - macro, params.seed) - 0.5) * 2;
        const shimmer =
          Math.sin(sampleT * Math.PI * 14 + params.seed * 0.003 + lineT * 1.7) *
          params.turbulence *
          0.12;

        const offset =
          innerHeight *
          (macro * params.waveAmplitude * 0.35 + micro * params.waveAmplitude * 0.5 + shimmer);

        const y = clamp(baselineY + offset, minY, maxY);
        curve.push({ x, y });
      }

      contours.push(curve);

      if (params.mirrorContours) {
        const centerY = minY + innerHeight * 0.5;
        contours.push(mirroredPolyline(curve, centerY));
      }
    }

    const haloCount = Math.max(0, Math.floor(params.haloCount));
    const haloCenter: Point = {
      x: minX + innerWidth * 0.62,
      y: minY + innerHeight * 0.38,
    };
    const haloLayer: Polyline[] = [];
    const haloBase = Math.min(innerWidth, innerHeight) * 0.08;

    for (let ring = 0; ring < haloCount; ring += 1) {
      const radius = haloBase + ring * Math.min(innerWidth, innerHeight) * 0.05;
      const jitter = radius * (0.24 + params.turbulence * 0.6);
      const turnBias = random() * 2 - 1;
      const halo = makeHalo(haloCenter, radius, jitter, params.seed + ring * 3571, turnBias);
      haloLayer.push(halo.map((point) => ({
        x: clamp(point.x, minX, maxX),
        y: clamp(point.y, minY, maxY),
      })));
    }

    const stars: Polyline[] = [];
    if (params.starfield) {
      const starCount = 18 + Math.floor(params.turbulence * 50);
      for (let starIndex = 0; starIndex < starCount; starIndex += 1) {
        const x = minX + random() * innerWidth;
        const y = minY + random() * innerHeight;

        const dx = (0.025 + random() * 0.06) * innerWidth;
        const dy = (0.02 + random() * 0.05) * innerHeight;

        stars.push([
          { x: clamp(x - dx, minX, maxX), y },
          { x: clamp(x + dx, minX, maxX), y },
        ]);
        stars.push([
          { x, y: clamp(y - dy, minY, maxY) },
          { x, y: clamp(y + dy, minY, maxY) },
        ]);
      }
    }

    return {
      kind: "geometry",
      layers: [
        {
          id: "aurora-contours",
          name: "Aurora Contours",
          polylines: contours,
        },
        {
          id: "halo-rings",
          name: "Halo Rings",
          polylines: haloLayer,
        },
        {
          id: "starfield",
          name: "Starfield",
          polylines: stars,
        },
      ],
    };
  }
}
