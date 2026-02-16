import { redirect } from "next/navigation";

import { sketchRegistry } from "@/generated/sketch-registry";

export default function HomePage() {
  const firstSketch = sketchRegistry[0];
  if (!firstSketch) {
    return <main>No sketches found. Add one in /src/sketches.</main>;
  }

  redirect(`/sketch/${firstSketch.manifest.slug}`);
}
