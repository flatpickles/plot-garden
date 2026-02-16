import { notFound } from "next/navigation";

import { sketchRegistry } from "@/generated/sketch-registry";
import { SketchWorkbench } from "@/lib/ui/SketchWorkbench";

export default async function SketchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const match = sketchRegistry.find((entry) => entry.manifest.slug === resolved.slug);
  if (!match) notFound();

  return <SketchWorkbench initialSlug={resolved.slug} />;
}

export async function generateStaticParams() {
  return sketchRegistry.map((entry) => ({ slug: entry.manifest.slug }));
}
