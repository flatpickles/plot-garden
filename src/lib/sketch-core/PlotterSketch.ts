import type {
  SketchOutput,
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
} from "@/lib/sketch-core/types";

export abstract class PlotterSketch<
  TSchema extends SketchParamSchema = SketchParamSchema,
> {
  abstract readonly schema: TSchema;

  abstract render(
    params: SketchParamValues<TSchema>,
    context: SketchRenderContext,
  ): SketchOutput | Promise<SketchOutput>;

  getDefaultParams(): SketchParamValues<TSchema> {
    const defaults = Object.entries(this.schema).map(([key, definition]) => [
      key,
      definition.default,
    ]);
    return Object.fromEntries(defaults) as SketchParamValues<TSchema>;
  }

  coerceParams(input: Record<string, unknown>): SketchParamValues<TSchema> {
    const coalesced = {} as SketchParamValues<TSchema>;

    for (const [key, definition] of Object.entries(this.schema)) {
      const rawValue = input[key];
      if (definition.type === "number") {
        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        const finite = Number.isFinite(num) ? num : definition.default;
        const clamped = Math.min(definition.max, Math.max(definition.min, finite));
        const rounded = Math.round(clamped / definition.step) * definition.step;
        (coalesced as Record<string, number>)[key] = Number(rounded.toFixed(6));
      } else {
        (coalesced as Record<string, boolean>)[key] = Boolean(
          rawValue ?? definition.default,
        );
      }
    }

    return coalesced;
  }
}
