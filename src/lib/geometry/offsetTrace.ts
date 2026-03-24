import type { Point, Polyline } from "@/lib/sketch-core/types";

export type TraceMode = "turn-on-breach" | "stop-on-ambiguity";
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
  preferredOwnerIndex?: number;
  preferredSide: OffsetTraceSidePreference;
  traceMode: TraceMode;
};

type OffsetSide = "left" | "right";

type Sample = {
  basePoint: Point;
  tangent: Point;
};

type TrackPosition = {
  segmentIndex: number;
  t: number;
};

type TrackDirection = -1 | 1;

type Track = {
  ownerId: string;
  ownerIndex: number;
  points: Polyline;
  side: OffsetSide;
};

type Owner = {
  ownerId: string;
  ownerIndex: number;
  sourcePoints: Polyline;
  tracks: Track[];
};

type TraceState = {
  direction: TrackDirection;
  heading: Point;
  position: TrackPosition;
  track: Track;
};

type TrackProjection = {
  direction: TrackDirection;
  distance: number;
  heading: Point;
  point: Point;
  position: TrackPosition;
  track: Track;
};

const BINARY_SEARCH_STEPS = 24;
const CANDIDATE_CLUSTER_GAP = 3;
const DISTANCE_SAMPLES = [0.25, 0.5, 0.75, 1];
const EPSILON = 1e-6;
const MAX_TRACE_POINTS = 20_000;
const SOURCE_EXCLUSION_WINDOW = 4;

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(point: Point, amount: number): Point {
  return { x: point.x * amount, y: point.y * amount };
}

function interpolate(start: Point, end: Point, t: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
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

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointsClose(a: Point, b: Point, tolerance: number): boolean {
  return distance(a, b) <= tolerance;
}

function buildSegments(polyline: Polyline) {
  const segments: Array<{
    from: Point;
    length: number;
    tangent: Point;
    to: Point;
  }> = [];

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const from = polyline[index];
    const to = polyline[index + 1];
    if (!from || !to) continue;
    const delta = subtract(to, from);
    const segmentLength = length(delta);
    if (segmentLength <= EPSILON) continue;
    segments.push({
      from,
      to,
      length: segmentLength,
      tangent: scale(delta, 1 / segmentLength),
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

function offsetPoint(sample: Sample, side: OffsetSide, offsetDistance: number): Point {
  const normal = { x: -sample.tangent.y, y: sample.tangent.x };
  const direction = side === "left" ? 1 : -1;
  return add(sample.basePoint, scale(normal, offsetDistance * direction));
}

function createTrack(
  ownerId: string,
  ownerIndex: number,
  samples: Sample[],
  side: OffsetSide,
  offsetDistance: number,
): Track {
  return {
    ownerId,
    ownerIndex,
    side,
    points: samples.map((sample) => offsetPoint(sample, side, offsetDistance)),
  };
}

function buildOwners(
  referencePolylines: Polyline[],
  stepLength: number,
  offsetDistance: number,
): Owner[] {
  return referencePolylines
    .map((polyline, ownerIndex) => {
      const ownerId = `owner-${ownerIndex}`;
      const samples = samplePolyline(polyline, stepLength);
      if (samples.length < 2) return null;
      return {
        ownerId,
        ownerIndex,
        sourcePoints: samples.map((sample) => sample.basePoint),
        tracks: [
          createTrack(ownerId, ownerIndex, samples, "left", offsetDistance),
          createTrack(ownerId, ownerIndex, samples, "right", offsetDistance),
        ],
      } satisfies Owner;
    })
    .filter((owner): owner is Owner => owner !== null);
}

function inBounds(point: Point, bounds: TraceBounds): boolean {
  return (
    point.x >= bounds.minX - EPSILON &&
    point.x <= bounds.maxX + EPSILON &&
    point.y >= bounds.minY - EPSILON &&
    point.y <= bounds.maxY + EPSILON
  );
}

function projectPointOntoSegment(point: Point, start: Point, end: Point) {
  const delta = subtract(end, start);
  const segmentLengthSquared = dot(delta, delta);
  if (segmentLengthSquared <= EPSILON) {
    return {
      distance: distance(point, start),
      point: start,
      t: 0,
    };
  }

  const rawT = dot(subtract(point, start), delta) / segmentLengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = interpolate(start, end, t);
  return {
    distance: distance(point, projected),
    point: projected,
    t,
  };
}

function segmentHeading(start: Point, end: Point): Point {
  return normalize(subtract(end, start));
}

function segmentProperlyIntersects(
  startA: Point,
  endA: Point,
  startB: Point,
  endB: Point,
  tolerance: number,
): boolean {
  if (
    pointsClose(startA, startB, tolerance) ||
    pointsClose(startA, endB, tolerance) ||
    pointsClose(endA, startB, tolerance) ||
    pointsClose(endA, endB, tolerance)
  ) {
    return false;
  }

  const d1 = cross(startA, endA, startB);
  const d2 = cross(startA, endA, endB);
  const d3 = cross(startB, endB, startA);
  const d4 = cross(startB, endB, endA);

  return (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  );
}

function segmentIntersectsPolyline(
  start: Point,
  end: Point,
  polyline: Polyline,
  tolerance: number,
  skipPredicate?: (segmentIndex: number) => boolean,
): boolean {
  for (let segmentIndex = 0; segmentIndex < polyline.length - 1; segmentIndex += 1) {
    if (skipPredicate?.(segmentIndex)) continue;
    const otherStart = polyline[segmentIndex];
    const otherEnd = polyline[segmentIndex + 1];
    if (!otherStart || !otherEnd) continue;
    if (segmentProperlyIntersects(start, end, otherStart, otherEnd, tolerance)) {
      return true;
    }
  }

  return false;
}

function traceIntersectsItself(trace: Polyline, start: Point, end: Point, tolerance: number): boolean {
  if (trace.length < 3) return false;
  const prior = trace.slice(0, -1);
  return segmentIntersectsPolyline(start, end, prior, tolerance);
}

function isLocalOwnerSegment(
  owner: Owner,
  activeState: TraceState,
  segmentIndex: number,
  windowSize: number,
): boolean {
  return (
    owner.ownerId === activeState.track.ownerId &&
    Math.abs(segmentIndex - activeState.position.segmentIndex) <= windowSize
  );
}

function pointToCompetingDistance(point: Point, owners: Owner[], activeState: TraceState): number {
  let best = Number.POSITIVE_INFINITY;

  for (const owner of owners) {
    for (let segmentIndex = 0; segmentIndex < owner.sourcePoints.length - 1; segmentIndex += 1) {
      if (isLocalOwnerSegment(owner, activeState, segmentIndex, SOURCE_EXCLUSION_WINDOW)) {
        continue;
      }

      const start = owner.sourcePoints[segmentIndex];
      const end = owner.sourcePoints[segmentIndex + 1];
      if (!start || !end) continue;
      best = Math.min(best, projectPointOntoSegment(point, start, end).distance);
    }
  }

  return best;
}

function advanceAlongTrack(
  track: Track,
  position: TrackPosition,
  stepLength: number,
  direction: TrackDirection,
): { heading: Point; point: Point; position: TrackPosition } | null {
  let segmentIndex = position.segmentIndex;
  let t = position.t;
  let remaining = stepLength;

  while (segmentIndex >= 0 && segmentIndex < track.points.length - 1) {
    const segmentStart = track.points[segmentIndex];
    const segmentEnd = track.points[segmentIndex + 1];
    const start = direction === 1 ? segmentStart : segmentEnd;
    const end = direction === 1 ? segmentEnd : segmentStart;
    if (!start || !end) return null;

    const delta = subtract(end, start);
    const segmentLength = length(delta);
    if (segmentLength <= EPSILON) {
      segmentIndex += 1;
      t = 0;
      continue;
    }

    const localT = direction === 1 ? t : 1 - t;
    const available = segmentLength * (1 - localT);
    if (remaining <= available + EPSILON) {
      const nextLocalT = Math.min(1, localT + remaining / segmentLength);
      const nextT = direction === 1 ? nextLocalT : 1 - nextLocalT;
      return {
        point: interpolate(start, end, nextLocalT),
        position: {
          segmentIndex,
          t: nextT,
        },
        heading: scale(delta, 1 / segmentLength),
      };
    }

    remaining -= available;
    segmentIndex += direction;
    t = direction === 1 ? 0 : 1;
  }

  return null;
}

function trackStateKey(state: TraceState): string {
  return `${state.track.ownerId}:${state.track.side}:${state.direction}:${state.position.segmentIndex}:${Math.round(
    state.position.t * 1000,
  )}`;
}

function appendPoint(polyline: Polyline, point: Point) {
  const last = polyline[polyline.length - 1];
  if (!last || distance(last, point) > EPSILON) {
    polyline.push(point);
  }
}

function findEarliestBreachPoint(
  currentPoint: Point,
  nextPoint: Point,
  owners: Owner[],
  activeState: TraceState,
  offsetDistance: number,
  breachTolerance: number,
): Point | null {
  const threshold = offsetDistance + breachTolerance;
  let low = 0;
  let high: number | null = null;
  let previousT = 0;
  let previousDistance = pointToCompetingDistance(currentPoint, owners, activeState);

  for (const sampleT of DISTANCE_SAMPLES) {
    const samplePoint = interpolate(currentPoint, nextPoint, sampleT);
    const sampleDistance = pointToCompetingDistance(samplePoint, owners, activeState);
    if (previousDistance > threshold && sampleDistance <= threshold) {
      low = previousT;
      high = sampleT;
      break;
    }
    previousT = sampleT;
    previousDistance = sampleDistance;
  }

  if (high === null) {
    return null;
  }

  let upper = high;
  let lower = low;

  for (let index = 0; index < BINARY_SEARCH_STEPS; index += 1) {
    const mid = (lower + upper) / 2;
    const midPoint = interpolate(currentPoint, nextPoint, mid);
    if (pointToCompetingDistance(midPoint, owners, activeState) <= threshold) {
      upper = mid;
    } else {
      lower = mid;
    }
  }

  return interpolate(currentPoint, nextPoint, upper);
}

function collectRawTrackProjections(
  owners: Owner[],
  point: Point,
  heading: Point | null,
  tolerance: number,
  options?: {
    activeState?: TraceState;
    preferredSide?: OffsetSide;
  },
): TrackProjection[] {
  const candidates: TrackProjection[] = [];

  for (const owner of owners) {
    for (const track of owner.tracks) {
      if (options?.preferredSide && track.side !== options.preferredSide) continue;

      for (let segmentIndex = 0; segmentIndex < track.points.length - 1; segmentIndex += 1) {
        if (
          options?.activeState &&
          track.ownerId === options.activeState.track.ownerId &&
          track.side === options.activeState.track.side &&
          Math.abs(segmentIndex - options.activeState.position.segmentIndex) <=
            SOURCE_EXCLUSION_WINDOW
        ) {
          continue;
        }

        const start = track.points[segmentIndex];
        const end = track.points[segmentIndex + 1];
        if (!start || !end) continue;

        const projected = projectPointOntoSegment(point, start, end);
        if (projected.distance > tolerance) continue;

        for (const direction of [1, -1] as const) {
          const projectedHeading =
            direction === 1 ? segmentHeading(start, end) : segmentHeading(end, start);
          if (length(projectedHeading) <= EPSILON) continue;
          const allowOppositeSideReversal =
            options?.activeState &&
            track.ownerId === options.activeState.track.ownerId &&
            track.side !== options.activeState.track.side &&
            direction === ((options.activeState.direction * -1) as TrackDirection);
          if (!allowOppositeSideReversal && heading && dot(projectedHeading, heading) < -EPSILON) {
            continue;
          }

          candidates.push({
            track,
            direction,
            position: {
              segmentIndex,
              t: projected.t,
            },
            point: projected.point,
            distance: projected.distance,
            heading: projectedHeading,
          });
        }
      }
    }
  }

  return candidates;
}

function clusterTrackProjections(candidates: TrackProjection[]): TrackProjection[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.track.ownerIndex !== b.track.ownerIndex) return a.track.ownerIndex - b.track.ownerIndex;
    if (a.track.side !== b.track.side) return a.track.side.localeCompare(b.track.side);
    if (a.direction !== b.direction) return a.direction - b.direction;
    if (a.position.segmentIndex !== b.position.segmentIndex) {
      return a.position.segmentIndex - b.position.segmentIndex;
    }
    return a.distance - b.distance;
  });

  const clustered: TrackProjection[] = [];

  for (const candidate of sorted) {
    const previous = clustered[clustered.length - 1];
    if (
      previous &&
      previous.track.ownerId === candidate.track.ownerId &&
      previous.track.side === candidate.track.side &&
      previous.direction === candidate.direction &&
      Math.abs(previous.position.segmentIndex - candidate.position.segmentIndex) <=
        CANDIDATE_CLUSTER_GAP
    ) {
      if (candidate.distance < previous.distance) {
        clustered[clustered.length - 1] = candidate;
      }
      continue;
    }

    clustered.push(candidate);
  }

  return clustered;
}

function validateSegmentAgainstSources(
  start: Point,
  end: Point,
  owners: Owner[],
  activeState: TraceState,
  tolerance: number,
): boolean {
  return owners.some((owner) =>
    segmentIntersectsPolyline(start, end, owner.sourcePoints, tolerance, (segmentIndex) =>
      isLocalOwnerSegment(owner, activeState, segmentIndex, SOURCE_EXCLUSION_WINDOW),
    ),
  );
}

function collectRedirectCandidates(
  turnPoint: Point,
  incomingHeading: Point,
  trace: Polyline,
  owners: Owner[],
  activeState: TraceState,
  bounds: TraceBounds,
  stepLength: number,
  offsetDistance: number,
  trackTolerance: number,
  breachTolerance: number,
): TrackProjection[] {
  const intersectionTolerance = Math.max(trackTolerance * 0.5, 0.002);
  const clustered = clusterTrackProjections(
    collectRawTrackProjections(owners, turnPoint, incomingHeading, trackTolerance, {
      activeState,
    }),
  );

  return clustered.filter((candidate) => {
    if (distance(candidate.point, turnPoint) > trackTolerance) return false;
    if (!inBounds(candidate.point, bounds)) return false;
    if (
      distance(turnPoint, candidate.point) > intersectionTolerance &&
      (traceIntersectsItself(trace, turnPoint, candidate.point, intersectionTolerance) ||
        validateSegmentAgainstSources(
          turnPoint,
          candidate.point,
          owners,
          activeState,
          intersectionTolerance,
        ))
    ) {
      return false;
    }

    const redirectState: TraceState = {
      direction: candidate.direction,
      track: candidate.track,
      position: candidate.position,
      heading: candidate.heading,
    };
    const nextStep = advanceAlongTrack(
      candidate.track,
      candidate.position,
      stepLength,
      candidate.direction,
    );
    if (!nextStep || !inBounds(nextStep.point, bounds)) return false;
    if (
      traceIntersectsItself(trace, candidate.point, nextStep.point, intersectionTolerance) ||
      validateSegmentAgainstSources(
        candidate.point,
        nextStep.point,
        owners,
        redirectState,
        intersectionTolerance,
      )
    ) {
      return false;
    }

    return (
      pointToCompetingDistance(nextStep.point, owners, redirectState) >=
      offsetDistance - breachTolerance
    );
  });
}

function findInitialState(
  owners: Owner[],
  startSpec: OffsetTraceStartSpec,
  trackTolerance: number,
  stepLength: number,
): TraceState | null {
  const preferredSide =
    startSpec.preferredSide === "left" || startSpec.preferredSide === "right"
      ? startSpec.preferredSide
      : undefined;
  const baseCandidates = clusterTrackProjections(
    collectRawTrackProjections(
      owners,
      startSpec.startPoint,
      null,
      trackTolerance,
      preferredSide ? { preferredSide } : undefined,
    ),
  ).filter(
    (candidate) =>
      advanceAlongTrack(candidate.track, candidate.position, stepLength, candidate.direction) !==
      null,
  );

  const candidates =
    startSpec.preferredOwnerIndex === undefined
      ? baseCandidates
      : (() => {
          const preferred = baseCandidates.filter(
            (candidate) => candidate.track.ownerIndex === startSpec.preferredOwnerIndex,
          );
          return preferred.length > 0 ? preferred : baseCandidates;
        })();

  candidates.sort((a, b) => a.distance - b.distance);

  const selected = candidates[0];
  if (!selected) return null;

  return {
    direction: selected.direction,
    track: selected.track,
    position: selected.position,
    heading: selected.heading,
  };
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
  const owners = buildOwners(referencePolylines, stepLength, startSpec.offsetDistance);
  if (!owners.length) return null;

  const breachTolerance = Math.max(startSpec.offsetDistance * 0.015, 0.002);
  const trackTolerance = Math.max(stepLength * 0.75, startSpec.offsetDistance * 0.08, 0.01);
  const intersectionTolerance = Math.max(trackTolerance * 0.5, 0.002);
  const initialState = findInitialState(owners, startSpec, trackTolerance, stepLength);
  if (!initialState) return null;

  const trace: Polyline = [startSpec.startPoint];
  const visitedStates = new Set<string>([trackStateKey(initialState)]);

  let currentPoint = startSpec.startPoint;
  let activeState = initialState;

  for (let pointCount = 1; pointCount < MAX_TRACE_POINTS; pointCount += 1) {
    const nextStep = advanceAlongTrack(
      activeState.track,
      activeState.position,
      stepLength,
      activeState.direction,
    );
    if (!nextStep) {
      if (startSpec.traceMode === "stop-on-ambiguity") {
        break;
      }

      const redirectCandidates = collectRedirectCandidates(
        currentPoint,
        activeState.heading,
        trace,
        owners,
        activeState,
        bounds,
        stepLength,
        startSpec.offsetDistance,
        trackTolerance,
        breachTolerance,
      );

      if (redirectCandidates.length !== 1) {
        break;
      }

      const redirect = redirectCandidates[0] as TrackProjection;
      if (distance(redirect.point, currentPoint) > intersectionTolerance) {
        appendPoint(trace, redirect.point);
      }

      const nextState: TraceState = {
        direction: redirect.direction,
        track: redirect.track,
        position: redirect.position,
        heading: redirect.heading,
      };
      const nextStateKey = trackStateKey(nextState);
      if (visitedStates.has(nextStateKey)) {
        break;
      }

      visitedStates.add(nextStateKey);
      currentPoint = trace[trace.length - 1] as Point;
      activeState = nextState;
      continue;
    }

    const breachPoint = findEarliestBreachPoint(
      currentPoint,
      nextStep.point,
      owners,
      activeState,
      startSpec.offsetDistance,
      breachTolerance,
    );

    if (breachPoint) {
      if (!inBounds(breachPoint, bounds)) break;
      appendPoint(trace, breachPoint);

      if (startSpec.traceMode === "stop-on-ambiguity") {
        break;
      }

      const incomingHeading =
        distance(currentPoint, breachPoint) > EPSILON
          ? normalize(subtract(breachPoint, currentPoint))
          : nextStep.heading;
      const redirectCandidates = collectRedirectCandidates(
        breachPoint,
        incomingHeading,
        trace,
        owners,
        activeState,
        bounds,
        stepLength,
        startSpec.offsetDistance,
        trackTolerance,
        breachTolerance,
      );

      if (redirectCandidates.length !== 1) {
        break;
      }

      const redirect = redirectCandidates[0] as TrackProjection;
      if (distance(redirect.point, breachPoint) > intersectionTolerance) {
        appendPoint(trace, redirect.point);
      }

      const nextState: TraceState = {
        direction: redirect.direction,
        track: redirect.track,
        position: redirect.position,
        heading: redirect.heading,
      };
      const nextStateKey = trackStateKey(nextState);
      if (visitedStates.has(nextStateKey)) {
        break;
      }

      visitedStates.add(nextStateKey);
      currentPoint = trace[trace.length - 1] as Point;
      activeState = nextState;
      continue;
    }

    if (
      !inBounds(nextStep.point, bounds) ||
      traceIntersectsItself(trace, currentPoint, nextStep.point, intersectionTolerance) ||
      validateSegmentAgainstSources(
        currentPoint,
        nextStep.point,
        owners,
        activeState,
        intersectionTolerance,
      )
    ) {
      break;
    }

    appendPoint(trace, nextStep.point);
    const nextState: TraceState = {
      direction: activeState.direction,
      track: activeState.track,
      position: nextStep.position,
      heading: nextStep.heading,
    };
    const nextStateKey = trackStateKey(nextState);
    if (visitedStates.has(nextStateKey)) {
      break;
    }

    visitedStates.add(nextStateKey);
    currentPoint = nextStep.point;
    activeState = nextState;
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
