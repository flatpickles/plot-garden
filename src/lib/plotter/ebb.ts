import type { Point, Polyline } from "@/lib/sketch-core/types";
import type { EbbPacket, PlotJobPlan, PlotterConfig } from "@/lib/plotter/types";

const STEPS_PER_INCH = 2874;
const MAX_DRAW_SPEED_IN_PER_SEC = 8.6979;
const MAX_TRAVEL_SPEED_IN_PER_SEC = 15;

function toSteps(deltaInches: number): number {
  return Math.round(deltaInches * STEPS_PER_INCH);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function speedFromPercent(percent: number, maxSpeed: number): number {
  const normalized = Math.max(1, Math.min(100, percent)) / 100;
  return Math.max(0.1, normalized * maxSpeed);
}

function durationMs(
  start: Point,
  end: Point,
  penDown: boolean,
  config: PlotterConfig,
): number {
  const inches = distance(start, end);
  const speed = penDown
    ? speedFromPercent(config.speedPenDown, MAX_DRAW_SPEED_IN_PER_SEC)
    : speedFromPercent(config.speedPenUp, MAX_TRAVEL_SPEED_IN_PER_SEC);
  return Math.max(1, Math.round((inches / speed) * 1000));
}

function xmCommand(start: Point, end: Point, config: PlotterConfig, penDown: boolean): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const aSteps = toSteps(dx);
  const bSteps = toSteps(dy);
  const duration = durationMs(start, end, penDown, config);
  return `XM,${duration},${aSteps},${bSteps}`;
}

function appendPolylineCommands(
  packets: EbbPacket[],
  cursor: Point,
  polyline: Polyline,
  config: PlotterConfig,
  layerId: string,
): Point {
  let current = { ...cursor };
  const start = polyline[0] as Point;

  if (distance(current, start) > 0) {
    packets.push({
      type: "command",
      layerId,
      command: `SP,0,${config.penUpDelayMs}`,
    });
    packets.push({
      type: "command",
      layerId,
      command: xmCommand(current, start, config, false),
    });
    current = { ...start };
  }

  packets.push({
    type: "command",
    layerId,
    command: `SP,1,${config.penDownDelayMs}`,
  });

  for (let index = 1; index < polyline.length; index += 1) {
    const target = polyline[index] as Point;
    packets.push({
      type: "command",
      layerId,
      command: xmCommand(current, target, config, true),
    });
    current = { ...target };
  }

  packets.push({
    type: "command",
    layerId,
    command: `SP,0,${config.penUpDelayMs}`,
  });

  return current;
}

export function buildEbbPackets(plan: PlotJobPlan, config: PlotterConfig): EbbPacket[] {
  const packets: EbbPacket[] = [];

  packets.push({ type: "command", command: "EM,1,1" });
  packets.push({ type: "command", command: `SP,0,${config.penUpDelayMs}` });

  let cursor: Point = { x: 0, y: 0 };

  for (let layerIndex = 0; layerIndex < plan.layers.length; layerIndex += 1) {
    const layer = plan.layers[layerIndex];
    if (!layer) continue;

    if (plan.mode === "pause-between" && layerIndex > 0) {
      packets.push({
        type: "pause-marker",
        layerId: layer.id,
        layerName: layer.name,
      });
    }

    for (const polyline of layer.polylines) {
      if (polyline.length < 2) continue;
      cursor = appendPolylineCommands(packets, cursor, polyline, config, layer.id);
    }
  }

  packets.push({ type: "command", command: "EM,0,0" });

  return packets;
}
