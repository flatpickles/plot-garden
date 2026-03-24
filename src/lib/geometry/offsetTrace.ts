import type { Point, Polyline } from "@/lib/sketch-core/types";

export type TieBreakMode = "prefer-current" | "nearest-valid" | "stop-on-ambiguity";
export type OffsetTraceSidePreference = "auto-inward" | "left" | "right";

export type TraceBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type OffsetTraceStartSpec = {
  startPoint: Point;
  offsetDistance: number;
  preferredSide: OffsetTraceSidePreference;
  tieBreakMode: TieBreakMode;
};

type OffsetSide = "left" | "right";

type Sample = {
  basePoint: Point;
  tangent: Point;
};

type SampledOwner = {
  ownerId: string;
  samples: Sample[];
};

type Candidate = {
  matchDistance: number;
  nextPoint: Point;
  ownerId: string;
  ownerIndex: number;
  sampleIndex: number;
  side: OffsetSide;
};

const EPSILON = 1e-6;
const MAX_TRACE_POINTS = 20_000;

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(point: Point, amount: number): Point {
  return { x: point.x * amount, y: point.y * amount };
}

function length(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function normalize(point: Point): Point {
  const pointLength = length(point);
  if (pointLength <= EPSILON) return { x: 0, y: 0 };
  return { x: point.x / pointLength, y: point.y / pointLength };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function offsetPoint(sample: Sample, side: OffsetSide, offsetDistance: number): Point {
  const normal = { x: -sample.tangent.y, y: sample.tangent.x };
  const direction = side === "left" ? 1 : -1;
  return add(sample.basePoint, scale(normal, offsetDistance * direction));
}

function buildSegments(polyline: Polyline) {
  const segments: Array<{
    from: Point;
    to: Point;
    length: number;
    tangent: Point;
  }> = [];

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const from = polyline[index];
    const to = polyline[index + 1];
    if (!from || !to) continue;
    const tangent = subtract(to, from);
    const segmentLength = length(tangent);
    if (segmentLength <= EPSILON) continue;
    segments.push({
      from,
      to,
      length: segmentLength,
      tangent: scale(tangent, 1 / segmentLength),
    });
  }

  return segments;
}

function samplePolyline(polyline: Polyline, stepLength: number): Sample[] {
  const segments = buildSegments(polyline);
  if (!segments.length) return [];

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const sampleCount = Math.max(1, Math.ceil(totalLength / Math.max(stepLength, EPSILON)));
  const samples: Sample[] = [];
  let segmentIndex = 0;
  let traversed = 0;

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const targetLength = Math.min(totalLength, sampleIndex * stepLength);

    while (
      segmentIndex < segments.length - 1 &&
      traversed + (segments[segmentIndex]?.length ?? 0) < targetLength - EPSILON
    ) {
      traversed += segments[segmentIndex]?.length ?? 0;
      segmentIndex += 1;
    }

    const segment = segments[segmentIndex];
    if (!segment) continue;
    const localDistance = Math.max(0, Math.min(segment.length, targetLength - traversed));
    samples.push({
      basePoint: add(segment.from, scale(segment.tangent, localDistance)),
      tangent: segment.tangent,
    });
  }

  return samples;
}

function buildOwners(referencePolylines: Polyline[], stepLength: number): SampledOwner[] {
  return referencePolylines
    .map((polyline, ownerIndex) => ({
      ownerId: `owner-${ownerIndex}`,
      samples: samplePolyline(polyline, stepLength),
    }))
    .filter((owner) => owner.samples.length >= 2);
}

function inBounds(point: Point, bounds: TraceBounds): boolean {
  return (
    point.x >= bounds.minX - EPSILON &&
    point.x <= bounds.maxX + EPSILON &&
    point.y >= bounds.minY - EPSILON &&
    point.y <= bounds.maxY + EPSILON
  );
}

function candidateKey(ownerId: string, side: OffsetSide): string {
  return `${ownerId}:${side}`;
}

function stateKey(candidate: Pick<Candidate, "ownerId" | "sampleIndex" | "side">): string {
  return `${candidate.ownerId}:${candidate.side}:${candidate.sampleIndex}`;
}

function collectCandidates(
  owners: SampledOwner[],
  currentPoint: Point,
  currentHeading: Point | null,
  offsetDistance: number,
  ownershipTolerance: number,
  preferredSide?: OffsetSide,
): Candidate[] {
  const bestByOwnerSide = new Map<string, Candidate>();

  owners.forEach((owner, ownerIndex) => {
    for (const side of ["left", "right"] as const) {
      if (preferredSide && side !== preferredSide) continue;

      for (let sampleIndex = 0; sampleIndex < owner.samples.length - 1; sampleIndex += 1) {
        const sample = owner.samples[sampleIndex];
        const nextSample = owner.samples[sampleIndex + 1];
        if (!sample || !nextSample) continue;

        const currentOffsetPoint = offsetPoint(sample, side, offsetDistance);
        const matchDistance = distance(currentOffsetPoint, currentPoint);
        if (matchDistance > ownershipTolerance) continue;

        const nextOffsetPoint = offsetPoint(nextSample, side, offsetDistance);
        const nextHeading = normalize(subtract(nextOffsetPoint, currentOffsetPoint));
        if (length(nextHeading) <= EPSILON) continue;
        if (currentHeading && dot(nextHeading, currentHeading) < -EPSILON) continue;

        const key = candidateKey(owner.ownerId, side);
        const candidate: Candidate = {
          ownerId: owner.ownerId,
          ownerIndex,
          side,
          sampleIndex,
          matchDistance,
          nextPoint: nextOffsetPoint,
        };
        const existing = bestByOwnerSide.get(key);
        if (
          !existing ||
          candidate.matchDistance < existing.matchDistance - EPSILON ||
          (Math.abs(candidate.matchDistance - existing.matchDistance) <= EPSILON &&
            candidate.sampleIndex > existing.sampleIndex)
        ) {
          bestByOwnerSide.set(key, candidate);
        }
      }
    }
  });

  return [...bestByOwnerSide.values()];
}

function chooseCandidate(
  candidates: Candidate[],
  activeCandidate: Candidate | null,
  tieBreakMode: TieBreakMode,
): Candidate | null {
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (Math.abs(a.matchDistance - b.matchDistance) > EPSILON) {
      return a.matchDistance - b.matchDistance;
    }

    if (tieBreakMode === "nearest-valid" && activeCandidate) {
      const aIsCurrent = a.ownerId === activeCandidate.ownerId && a.side === activeCandidate.side;
      const bIsCurrent = b.ownerId === activeCandidate.ownerId && b.side === activeCandidate.side;
      if (aIsCurrent !== bIsCurrent) {
        return aIsCurrent ? 1 : -1;
      }
    }

    if (a.ownerIndex !== b.ownerIndex) return a.ownerIndex - b.ownerIndex;
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    return a.sampleIndex - b.sampleIndex;
  });

  if (tieBreakMode === "stop-on-ambiguity" && sorted.length > 1) {
    return null;
  }

  if (tieBreakMode === "prefer-current" && activeCandidate) {
    const current = sorted.find(
      (candidate) =>
        candidate.ownerId === activeCandidate.ownerId && candidate.side === activeCandidate.side,
    );
    if (current) return current;
  }

  return sorted[0] ?? null;
}

export function traceOffsetLine(
  referencePolylines: Polyline[],
  startSpec: OffsetTraceStartSpec,
  bounds: TraceBounds,
): Polyline | null {
  if (!Number.isFinite(startSpec.offsetDistance) || startSpec.offsetDistance <= EPSILON) {
    return null;
  }
  if (!inBounds(startSpec.startPoint, bounds)) {
    return null;
  }

  const stepLength = Math.max(startSpec.offsetDistance / 4, 0.01);
  const owners = buildOwners(referencePolylines, stepLength);
  if (!owners.length) return null;

  const ownershipTolerance = Math.max(stepLength * 0.75, startSpec.offsetDistance * 0.05, 0.01);
  const preferredSide =
    startSpec.preferredSide === "left" || startSpec.preferredSide === "right"
      ? startSpec.preferredSide
      : undefined;
  const initialCandidates = collectCandidates(
    owners,
    startSpec.startPoint,
    null,
    startSpec.offsetDistance,
    ownershipTolerance,
    preferredSide,
  );
  const initialCandidate = chooseCandidate(initialCandidates, null, startSpec.tieBreakMode);
  if (!initialCandidate) return null;

  const trace: Polyline = [startSpec.startPoint];
  const visited = new Set<string>([
    stateKey({
      ownerId: initialCandidate.ownerId,
      side: initialCandidate.side,
      sampleIndex: initialCandidate.sampleIndex,
    }),
  ]);

  let activeCandidate = initialCandidate;
  let currentPoint = startSpec.startPoint;
  let currentHeading = normalize(subtract(initialCandidate.nextPoint, currentPoint));

  if (length(currentHeading) <= EPSILON || !inBounds(initialCandidate.nextPoint, bounds)) {
    return null;
  }

  for (let pointCount = 1; pointCount < MAX_TRACE_POINTS; pointCount += 1) {
    const candidates = collectCandidates(
      owners,
      currentPoint,
      currentHeading,
      startSpec.offsetDistance,
      ownershipTolerance,
    );
    const nextCandidate = chooseCandidate(candidates, activeCandidate, startSpec.tieBreakMode);
    if (!nextCandidate || !inBounds(nextCandidate.nextPoint, bounds)) {
      break;
    }

    const nextState = {
      ownerId: nextCandidate.ownerId,
      side: nextCandidate.side,
      sampleIndex: nextCandidate.sampleIndex + 1,
    };
    if (visited.has(stateKey(nextState))) {
      break;
    }

    if (distance(currentPoint, nextCandidate.nextPoint) <= EPSILON) {
      break;
    }

    trace.push(nextCandidate.nextPoint);
    visited.add(stateKey(nextState));
    currentHeading = normalize(subtract(nextCandidate.nextPoint, currentPoint));
    currentPoint = nextCandidate.nextPoint;
    activeCandidate = {
      ...nextCandidate,
      sampleIndex: nextCandidate.sampleIndex + 1,
      matchDistance: 0,
    };
  }

  return trace.length >= 2 ? trace : null;
}

export function traceOffsetLinesSequentially(
  basePolylines: Polyline[],
  startSpecs: OffsetTraceStartSpec[],
  bounds: TraceBounds,
): Polyline[] {
  const references = [...basePolylines];
  const traced: Polyline[] = [];

  for (const startSpec of startSpecs) {
    const line = traceOffsetLine(references, startSpec, bounds);
    if (!line) continue;
    traced.push(line);
    references.push(line);
  }

  return traced;
}
