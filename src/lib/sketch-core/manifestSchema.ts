import { z } from "zod";

export const sketchManifestSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  order: z.number().int().default(0),
  thumbnail: z.string().default("thumbnail.png"),
  className: z.string().min(1),
});

export type SketchManifest = z.infer<typeof sketchManifestSchema>;
