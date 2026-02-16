import fs from "node:fs";
import path from "node:path";

import { sketchManifestSchema, type SketchManifest } from "../src/lib/sketch-core/manifestSchema";

export type SketchSource = {
  manifest: SketchManifest;
  dirPath: string;
  classFilePath: string;
};

export const ROOT_DIR = process.cwd();
export const SKETCHES_DIR = path.join(ROOT_DIR, "src", "sketches");
export const GENERATED_REGISTRY_FILE = path.join(
  ROOT_DIR,
  "src",
  "generated",
  "sketch-registry.ts",
);

export function toPascalCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

export function tinyPngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5xT0wAAAAASUVORK5CYII=",
    "base64",
  );
}

export function ensureSketchesDir(): void {
  fs.mkdirSync(SKETCHES_DIR, { recursive: true });
}

function readManifest(manifestPath: string): SketchManifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return sketchManifestSchema.parse(parsed);
}

export function loadSketchSources(): SketchSource[] {
  ensureSketchesDir();

  const directories = fs
    .readdirSync(SKETCHES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const sources: SketchSource[] = [];

  for (const directoryName of directories) {
    const dirPath = path.join(SKETCHES_DIR, directoryName);
    const manifestPath = path.join(dirPath, "sketch.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = readManifest(manifestPath);
    const classFilePath = path.join(dirPath, `${manifest.className}.ts`);

    if (!fs.existsSync(classFilePath)) {
      throw new Error(
        `Expected sketch class file at ${classFilePath} for ${manifest.slug}.`,
      );
    }

    sources.push({
      manifest,
      dirPath,
      classFilePath,
    });
  }

  return sources.sort((a, b) => {
    if (a.manifest.order !== b.manifest.order) {
      return a.manifest.order - b.manifest.order;
    }
    return a.manifest.title.localeCompare(b.manifest.title);
  });
}

export function writeFileWithBanner(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}
