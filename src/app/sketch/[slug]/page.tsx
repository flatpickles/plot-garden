import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { sketchRegistry } from "@/generated/sketch-registry";
import { parsePanelSectionPreferencesCookie, PANEL_SECTION_PREFS_COOKIE_KEY } from "@/lib/ui/panelSectionPreferences";
import { SketchWorkbench } from "@/lib/ui/SketchWorkbench";

export default async function SketchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolved = await params;
  const cookieStore = await cookies();
  const initialPanelSectionPreferences = parsePanelSectionPreferencesCookie(
    cookieStore.get(PANEL_SECTION_PREFS_COOKIE_KEY)?.value,
  );
  const match = sketchRegistry.find((entry) => entry.manifest.slug === resolved.slug);
  if (!match) notFound();

  return (
    <SketchWorkbench
      initialPanelSectionPreferences={initialPanelSectionPreferences}
      initialSlug={resolved.slug}
    />
  );
}

export async function generateStaticParams() {
  return sketchRegistry.map((entry) => ({ slug: entry.manifest.slug }));
}
