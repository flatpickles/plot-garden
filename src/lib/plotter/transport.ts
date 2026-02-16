import type {
  EbbPacket,
  PlotterProgressCallback,
  PlotterStatus,
  PlotterTransport,
} from "@/lib/plotter/types";
import { supportsWebSerial } from "@/lib/plotter/support";

const sleep = (durationMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

type SerialLike = {
  requestPort(): Promise<SerialPortLike>;
};

type SerialPortLike = {
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  writable?: WritableStream<Uint8Array>;
};

export class AxiDrawWebSerialTransport implements PlotterTransport {
  private port: SerialPortLike | undefined;

  private status: PlotterStatus = {
    state: "idle",
    message: "Not connected",
  };

  private paused = false;

  private canceled = false;

  private isSending = false;

  isSupported(): boolean {
    return supportsWebSerial();
  }

  isConnected(): boolean {
    return this.status.state === "connected" || this.status.state === "plotting" || this.status.state === "paused";
  }

  getStatus(): PlotterStatus {
    return { ...this.status };
  }

  private updateStatus(next: PlotterStatus, callback?: PlotterProgressCallback) {
    this.status = { ...next };
    callback?.(this.getStatus());
  }

  async connect(onProgress?: PlotterProgressCallback): Promise<void> {
    if (!this.isSupported()) {
      this.updateStatus(
        {
          state: "error",
          message: "Web Serial is not supported in this browser.",
        },
        onProgress,
      );
      return;
    }

    this.updateStatus({ state: "connecting", message: "Connecting to plotter..." }, onProgress);

    const serial = (navigator as Navigator & { serial?: SerialLike }).serial;
    if (!serial) {
      this.updateStatus(
        {
          state: "error",
          message: "Serial interface unavailable.",
        },
        onProgress,
      );
      return;
    }

    try {
      this.port = await serial.requestPort();
      await this.port.open({ baudRate: 9600, bufferSize: 1024 });
      this.updateStatus({ state: "connected", message: "Connected" }, onProgress);
    } catch (error) {
      this.updateStatus(
        {
          state: "error",
          message: error instanceof Error ? error.message : "Connection failed",
        },
        onProgress,
      );
    }
  }

  async disconnect(onProgress?: PlotterProgressCallback): Promise<void> {
    this.paused = false;
    this.canceled = false;

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // Ignore close errors for stale/disconnected ports.
      }
    }

    this.port = undefined;
    this.updateStatus({ state: "idle", message: "Disconnected" }, onProgress);
  }

  async send(packets: EbbPacket[], onProgress?: PlotterProgressCallback): Promise<void> {
    if (!this.port || !this.port.writable) {
      this.updateStatus(
        {
          state: "error",
          message: "No plotter connection found.",
        },
        onProgress,
      );
      return;
    }

    if (this.isSending) return;

    this.isSending = true;
    this.paused = false;
    this.canceled = false;

    const writer = this.port.writable.getWriter();
    const encoder = new TextEncoder();
    let sentPackets = 0;

    this.updateStatus(
      {
        state: "plotting",
        message: "Plotting in progress",
        totalPackets: packets.length,
        sentPackets,
      },
      onProgress,
    );

    try {
      for (const packet of packets) {
        if (this.canceled) {
          this.updateStatus({ state: "canceled", message: "Plot canceled" }, onProgress);
          break;
        }

        while (this.paused && !this.canceled) {
          await sleep(120);
        }

        if (packet.type === "pause-marker") {
          this.paused = true;
          this.updateStatus(
            {
              state: "paused",
              message: `Paused before layer ${packet.layerName}`,
              totalPackets: packets.length,
              sentPackets,
            },
            onProgress,
          );

          while (this.paused && !this.canceled) {
            await sleep(120);
          }

          if (this.canceled) break;

          this.updateStatus(
            {
              state: "plotting",
              message: "Resumed plotting",
              totalPackets: packets.length,
              sentPackets,
            },
            onProgress,
          );
          continue;
        }

        await writer.write(encoder.encode(`${packet.command}\r`));
        sentPackets += 1;

        this.updateStatus(
          {
            state: "plotting",
            message: "Plotting in progress",
            totalPackets: packets.length,
            sentPackets,
          },
          onProgress,
        );

        await sleep(4);
      }

      if (!this.canceled) {
        this.updateStatus(
          {
            state: "connected",
            message: "Plot complete",
            totalPackets: packets.length,
            sentPackets,
          },
          onProgress,
        );
      }
    } catch (error) {
      this.updateStatus(
        {
          state: "error",
          message: error instanceof Error ? error.message : "Plot command failed",
          totalPackets: packets.length,
          sentPackets,
        },
        onProgress,
      );
    } finally {
      writer.releaseLock();
      this.isSending = false;
    }
  }

  pause(onProgress?: PlotterProgressCallback): void {
    if (this.status.state !== "plotting") return;
    this.paused = true;
    this.updateStatus(
      {
        ...this.status,
        state: "paused",
        message: "Paused",
      },
      onProgress,
    );
  }

  resume(onProgress?: PlotterProgressCallback): void {
    if (this.status.state !== "paused") return;
    this.paused = false;
    this.updateStatus(
      {
        ...this.status,
        state: "plotting",
        message: "Resumed",
      },
      onProgress,
    );
  }

  async cancel(onProgress?: PlotterProgressCallback): Promise<void> {
    this.canceled = true;
    this.paused = false;

    if (this.port?.writable) {
      const writer = this.port.writable.getWriter();
      const encoder = new TextEncoder();
      try {
        await writer.write(encoder.encode("ES\r"));
      } catch {
        // Ignore best-effort cancel errors.
      } finally {
        writer.releaseLock();
      }
    }

    this.updateStatus(
      {
        ...this.status,
        state: "canceled",
        message: "Cancel request sent",
      },
      onProgress,
    );
  }
}
