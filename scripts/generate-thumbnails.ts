import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Resvg } from "@resvg/resvg-js";

import {
  loadSketchSources,
  syncError,
} from "./thumbnail-lib";
import { normalizeSketchOutput, renderNormalizedDocumentToSvg } from "../src/lib/sketch-core/normalizeSketchOutput";
import type { PlotterSketch } from "../src/lib/sketch-core/PlotterSketch";
import type { SketchRenderContext } from "../src/lib/sketch-core/types";

const PREVIEW_CONTEXT: SketchRenderContext = {
  width: 8,
  height: 6,
  units: "in",
};

async function renderThumbnail(classFilePath: string): Promise<Buffer> {
  const moduleRef = await import(pathToFileURL(classFilePath).href);
  const SketchClass = moduleRef.default as new () => PlotterSketch;
  const sketch = new SketchClass();

  const defaults = sketch.getDefaultParams();
  const output = await sketch.render(defaults, PREVIEW_CONTEXT);
  const normalized = await normalizeSketchOutput(output, PREVIEW_CONTEXT);
  const svg = renderNormalizedDocumentToSvg(normalized);

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 640,
    },
  });

  return Buffer.from(resvg.render().asPng());
}

async function main() {
  const sources = loadSketchSources();
  for (const source of sources) {
    const png = await renderThumbnail(source.classFilePath);
    fs.writeFileSync(path.join(source.dirPath, "thumbnail.png"), png);
    console.log(`Generated thumbnail for ${source.manifest.slug}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(syncError(message));
  process.exitCode = 1;
});
