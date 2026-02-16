import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type {
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
  SvgSketchOutput,
} from "@/lib/sketch-core/types";

const schema = {
  waveCount: {
    type: "number",
    label: "Waves",
    description: "Number of horizontal wave lines.",
    default: 9,
    min: 2,
    max: 30,
    step: 1,
  },
  amplitude: {
    type: "number",
    label: "Amplitude",
    description: "Wave amplitude.",
    default: 0.35,
    min: 0.05,
    max: 2,
    step: 0.05,
  },
  alternatePhase: {
    type: "boolean",
    label: "Alternate Phase",
    description: "Offset every other line for contrast.",
    default: true,
  },
} as const satisfies SketchParamSchema;

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

export default class LayeredWaves extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): SvgSketchOutput {
    const random = mulberry32(context.seed);
    const count = Math.max(2, Math.floor(params.waveCount));
    const lineSpacing = context.height / (count + 1);
    const sampleCount = 120;

    const makeWavePath = (lineIndex: number, tight = false): string => {
      const baseY = lineSpacing * (lineIndex + 1);
      const points: string[] = [];
      const phaseShift = params.alternatePhase && lineIndex % 2 === 1 ? Math.PI / 3 : 0;
      const jitter = (random() - 0.5) * 0.2;

      for (let index = 0; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const x = t * context.width;
        const cycle = tight ? 8 : 4;
        const amp = params.amplitude * (tight ? 0.7 : 1);
        const y =
          baseY +
          Math.sin(t * Math.PI * cycle + phaseShift + jitter) * amp +
          Math.sin(t * Math.PI * (tight ? 13 : 7)) * (amp * 0.15);
        points.push(`${index === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
      }

      return points.join(" ");
    };

    const primary = Array.from({ length: count }, (_, index) =>
      `<path d="${makeWavePath(index)}" />`,
    ).join("\n");

    const secondary = Array.from({ length: count }, (_, index) =>
      index % 2 === 0 ? `<path d="${makeWavePath(index, true)}" />` : "",
    ).join("\n");

    return {
      kind: "svg",
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${context.width} ${context.height}">
  <g id="primary" data-layer-name="Primary Waves" fill="none" stroke="#121212" stroke-width="0.018">${primary}</g>
  <g id="secondary" data-layer-name="Secondary Waves" fill="none" stroke="#121212" stroke-width="0.012">${secondary}</g>
</svg>`,
    };
  }
}
