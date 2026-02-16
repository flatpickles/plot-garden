import type { Point, Polyline } from "@/lib/sketch-core/types";

export type PlotLayerMode = "ordered" | "flatten" | "pause-between";

export type AxiDrawModel =
  | "A4"
  | "A3"
  | "XLX"
  | "MiniKit"
  | "A2"
  | "A1"
  | "B6";

export interface PlotterConfig {
  model: AxiDrawModel;
  speedPenDown: number;
  speedPenUp: number;
  penUpDelayMs: number;
  penDownDelayMs: number;
  repeatCount: number;
}

export interface PlannedLayer {
  id: string;
  name: string;
  polylines: Polyline[];
}

export interface PlotJobStats {
  layerCount: number;
  strokeCount: number;
  pointCount: number;
  drawDistance: number;
  travelDistance: number;
  outOfBoundsPoints: number;
}

export interface PlotJobPlan {
  mode: PlotLayerMode;
  layers: PlannedLayer[];
  stats: PlotJobStats;
}

export type EbbPacket =
  | { type: "command"; command: string; layerId?: string }
  | { type: "pause-marker"; layerId: string; layerName: string };

export type PlotterState =
  | "idle"
  | "connecting"
  | "connected"
  | "plotting"
  | "paused"
  | "canceled"
  | "error";

export interface PlotterStatus {
  state: PlotterState;
  message?: string;
  totalPackets?: number;
  sentPackets?: number;
}

export type PlotterProgressCallback = (status: PlotterStatus) => void;

export interface PlotterTransport {
  isSupported(): boolean;
  isConnected(): boolean;
  getStatus(): PlotterStatus;
  connect(onProgress?: PlotterProgressCallback): Promise<void>;
  disconnect(onProgress?: PlotterProgressCallback): Promise<void>;
  send(
    packets: EbbPacket[],
    onProgress?: PlotterProgressCallback,
  ): Promise<void>;
  pause(onProgress?: PlotterProgressCallback): void;
  resume(onProgress?: PlotterProgressCallback): void;
  cancel(onProgress?: PlotterProgressCallback): Promise<void>;
}

export interface AxiDrawBounds {
  widthInches: number;
  heightInches: number;
}

export const AXIDRAW_MODEL_BOUNDS: Record<AxiDrawModel, AxiDrawBounds> = {
  A4: { widthInches: 11.81, heightInches: 8.58 },
  A3: { widthInches: 16.93, heightInches: 11.69 },
  XLX: { widthInches: 23.42, heightInches: 8.58 },
  MiniKit: { widthInches: 6.3, heightInches: 4.0 },
  A2: { widthInches: 23.39, heightInches: 17.01 },
  A1: { widthInches: 34.02, heightInches: 23.39 },
  B6: { widthInches: 7.48, heightInches: 5.51 },
};

export const DEFAULT_PLOTTER_CONFIG: PlotterConfig = {
  model: "A4",
  speedPenDown: 35,
  speedPenUp: 65,
  penUpDelayMs: 140,
  penDownDelayMs: 170,
  repeatCount: 1,
};

export function polylineEndpoints(polyline: Polyline): {
  start: Point;
  end: Point;
} {
  return {
    start: polyline[0] as Point,
    end: polyline[polyline.length - 1] as Point,
  };
}
