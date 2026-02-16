import type { Point, Polyline } from "@/lib/sketch-core/types";

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cloneAndMaybeReverse(polyline: Polyline, reverse: boolean): Polyline {
  const cloned = polyline.map((point) => ({ ...point }));
  return reverse ? cloned.reverse() : cloned;
}

export function optimizePolylines(
  inputPolylines: Polyline[],
  joinTolerance = 0.02,
): Polyline[] {
  const remaining = inputPolylines
    .filter((polyline) => polyline.length >= 2)
    .map((polyline) => polyline.map((point) => ({ ...point })));

  if (!remaining.length) return [];

  const ordered: Polyline[] = [];
  let cursor = remaining[0]?.[0] as Point;

  while (remaining.length) {
    let bestIndex = 0;
    let bestReverse = false;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index] as Polyline;
      const start = candidate[0] as Point;
      const end = candidate[candidate.length - 1] as Point;

      const startDistance = distance(cursor, start);
      if (startDistance < bestDistance) {
        bestDistance = startDistance;
        bestIndex = index;
        bestReverse = false;
      }

      const endDistance = distance(cursor, end);
      if (endDistance < bestDistance) {
        bestDistance = endDistance;
        bestIndex = index;
        bestReverse = true;
      }
    }

    const chosen = remaining.splice(bestIndex, 1)[0] as Polyline;
    const normalized = cloneAndMaybeReverse(chosen, bestReverse);

    if (!ordered.length) {
      ordered.push(normalized);
      cursor = normalized[normalized.length - 1] as Point;
      continue;
    }

    const previous = ordered[ordered.length - 1] as Polyline;
    const previousEnd = previous[previous.length - 1] as Point;
    const currentStart = normalized[0] as Point;

    if (distance(previousEnd, currentStart) <= joinTolerance) {
      previous.push(...normalized.slice(1));
      cursor = previous[previous.length - 1] as Point;
    } else {
      ordered.push(normalized);
      cursor = normalized[normalized.length - 1] as Point;
    }
  }

  return ordered;
}
