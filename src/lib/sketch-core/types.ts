export type Unit = "in" | "mm";

export type Point = {
  x: number;
  y: number;
};

export type Polyline = Point[];

export interface BaseParamDefinition<TType extends string> {
  type: TType;
  label: string;
  description?: string;
}

export interface NumberParamDefinition extends BaseParamDefinition<"number"> {
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface BooleanParamDefinition extends BaseParamDefinition<"boolean"> {
  default: boolean;
}

export type SketchParamDefinition = NumberParamDefinition | BooleanParamDefinition;

export type SketchParamSchema = Record<string, SketchParamDefinition>;

export type SketchParamValue = number | boolean;

export type SketchParamValues<TSchema extends SketchParamSchema = SketchParamSchema> = {
  [K in keyof TSchema]: TSchema[K] extends NumberParamDefinition
    ? number
    : TSchema[K] extends BooleanParamDefinition
      ? boolean
      : never;
};

export interface SketchRenderContext {
  width: number;
  height: number;
  units: Unit;
  seed: number;
}

export interface GeometryLayer {
  id: string;
  name?: string;
  polylines: Polyline[];
}

export interface GeometrySketchOutput {
  kind: "geometry";
  layers: GeometryLayer[];
}

export interface SvgSketchOutput {
  kind: "svg";
  svg: string;
}

export type SketchOutput = GeometrySketchOutput | SvgSketchOutput;

export interface NormalizedLayer {
  id: string;
  name: string;
  polylines: Polyline[];
  svgMarkup: string;
}

export interface NormalizedSketchDocument {
  width: number;
  height: number;
  units: Unit;
  layers: NormalizedLayer[];
}

export interface SvgRenderOptions {
  hoveredLayerId?: string | null;
  dimOpacity?: number;
  background?: string;
}
