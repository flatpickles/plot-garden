import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type {
  GeometrySketchOutput,
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
} from "@/lib/sketch-core/types";

const schema = {
  inset: {
    type: "number",
    label: "Inset",
    description: "Border inset from edges.",
    default: 1,
    min: 0,
    max: 4,
    step: 0.05,
  },
  ringCount: {
    type: "number",
    label: "Rings",
    description: "Number of nested frames.",
    default: 4,
    min: 1,
    max: 24,
    step: 1,
  },
  showDiagonals: {
    type: "boolean",
    label: "Diagonals",
    description: "Include crossing diagonals in a second layer.",
    default: true,
  },
} as const satisfies SketchParamSchema;

function rectanglePolyline(x: number, y: number, width: number, height: number) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x, y },
  ];
}

export default class InsetSquare extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): GeometrySketchOutput {
    const ringCount = Math.max(1, Math.floor(params.ringCount));
    const maxInset = Math.max(0, Math.min(context.width, context.height) / 2 - 0.05);
    const baseInset = Math.max(0, Math.min(maxInset, params.inset));
    const available = Math.max(0, Math.min(context.width, context.height) / 2 - baseInset);
    const ringStep = ringCount > 1 ? available / ringCount : 0;

    const framePolylines = Array.from({ length: ringCount }, (_, index) => {
      const inset = baseInset + index * ringStep;
      return rectanglePolyline(
        inset,
        inset,
        Math.max(0.01, context.width - inset * 2),
        Math.max(0.01, context.height - inset * 2),
      );
    });

    const guidePolylines = params.showDiagonals
      ? [
          [
            { x: baseInset, y: baseInset },
            { x: context.width - baseInset, y: context.height - baseInset },
          ],
          [
            { x: context.width - baseInset, y: baseInset },
            { x: baseInset, y: context.height - baseInset },
          ],
        ]
      : [];

    return {
      kind: "geometry",
      layers: [
        {
          id: "frame",
          name: "Frame",
          polylines: framePolylines,
        },
        {
          id: "guides",
          name: "Guides",
          polylines: guidePolylines,
        },
      ],
    };
  }
}
