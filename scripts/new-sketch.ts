import fs from "node:fs";
import path from "node:path";

import {
  SKETCHES_DIR,
  tinyPngBuffer,
  toPascalCase,
  writeFileWithBanner,
} from "./lib";
import { syncSketchRegistry } from "./sync-sketches";

function validateSlug(input: string): string {
  const slug = input.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `Invalid slug "${input}". Use lowercase letters, numbers, and dashes only.`,
    );
  }
  return slug;
}

function createSketchTemplate(className: string): string {
  return `import { PlotterSketch } from "@/lib/sketch-core/PlotterSketch";
import type {
  GeometrySketchOutput,
  SketchParamSchema,
  SketchParamValues,
  SketchRenderContext,
} from "@/lib/sketch-core/types";

const schema = {
  seed: {
    type: "number",
    label: "Seed",
    description: "Deterministic random seed.",
    default: 1,
    min: 0,
    max: 999999,
    step: 1,
  },
  inset: {
    type: "number",
    label: "Inset",
    default: 1,
    min: 0,
    max: 4,
    step: 0.05,
  },
  diagonal: {
    type: "boolean",
    label: "Diagonal",
    default: true,
  },
} as const satisfies SketchParamSchema;

export default class ${className} extends PlotterSketch<typeof schema> {
  readonly schema = schema;

  render(
    params: SketchParamValues<typeof schema>,
    context: SketchRenderContext,
  ): GeometrySketchOutput {
    const inset = Math.max(0, params.inset);
    const layerPolylines = [
      [
        { x: inset, y: inset },
        { x: context.width - inset, y: inset },
        { x: context.width - inset, y: context.height - inset },
        { x: inset, y: context.height - inset },
        { x: inset, y: inset },
      ],
    ];

    const guidePolylines = params.diagonal
      ? [
          [
            { x: inset, y: inset },
            { x: context.width - inset, y: context.height - inset },
          ],
        ]
      : [];

    return {
      kind: "geometry",
      layers: [
        { id: "main", name: "Main", polylines: layerPolylines },
        { id: "guides", name: "Guides", polylines: guidePolylines },
      ],
    };
  }
}
`;
}

function createManifest(slug: string, className: string): string {
  return JSON.stringify(
    {
      slug,
      title: className,
      description: "Describe your sketch here.",
      tags: ["starter"],
      order: 100,
      thumbnail: "thumbnail.png",
      className,
    },
    null,
    2,
  );
}

function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error("Usage: pnpm sketch:new <slug>");
  }

  const slug = validateSlug(input);
  const className = toPascalCase(slug);
  const sketchDir = path.join(SKETCHES_DIR, slug);

  if (fs.existsSync(sketchDir)) {
    throw new Error(`Sketch directory already exists: ${sketchDir}`);
  }

  fs.mkdirSync(sketchDir, { recursive: true });

  writeFileWithBanner(
    path.join(sketchDir, `${className}.ts`),
    createSketchTemplate(className),
  );
  writeFileWithBanner(path.join(sketchDir, "sketch.json"), `${createManifest(slug, className)}\n`);
  fs.writeFileSync(path.join(sketchDir, "thumbnail.png"), tinyPngBuffer());

  syncSketchRegistry();

  console.log(`Created sketch: ${slug}`);
}

main();
