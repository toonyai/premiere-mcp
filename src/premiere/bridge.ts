import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import type {
  PremiereCommand,
  PremiereResponse,
  ProjectInfo,
  TimelineInsertResult,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

const DEFAULT_PORT = 8847;
const RECONNECT_INTERVAL = 5000;
const COMMAND_TIMEOUT = 30000;

class PremiereBridge {
  private ws: WebSocket | null = null;
  private port: number;
  private connected: boolean = false;
  private pendingCommands: Map<
    string,
    {
      resolve: (value: PremiereResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
  }

  async connect(): Promise<void> {
    if (this.connected && this.ws) {
      return;
    }

    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${this.port}`;
      logger.info("Connecting to Premiere Pro bridge at", url);

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.connected = true;
        logger.info("Connected to Premiere Pro bridge");
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("close", () => {
        this.connected = false;
        logger.warn("Disconnected from Premiere Pro bridge");
        this.scheduleReconnect();
      });

      this.ws.on("error", (error) => {
        logger.error("WebSocket error:", error.message);
        if (!this.connected) {
          reject(error);
        }
      });

      // Timeout for initial connection
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error("Connection to Premiere Pro bridge timed out"));
        }
      }, 5000);
    });
  }

  private handleMessage(data: string): void {
    try {
      const response: PremiereResponse = JSON.parse(data);

      const pending = this.pendingCommands.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(response.id);
        pending.resolve(response);
      } else {
        logger.warn("Received response for unknown command:", response.id);
      }
    } catch (error) {
      logger.error("Failed to parse message from Premiere:", data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        logger.warn("Reconnection failed:", err.message);
      });
    }, RECONNECT_INTERVAL);
  }

  private async sendCommand(command: PremiereCommand): Promise<PremiereResponse> {
    if (!this.connected || !this.ws) {
      throw new Error("Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(command.id);
        reject(new Error(`Command ${command.type} timed out`));
      }, COMMAND_TIMEOUT);

      this.pendingCommands.set(command.id, { resolve, reject, timeout });

      this.ws!.send(JSON.stringify(command));
    });
  }

  async isConnected(): Promise<boolean> {
    if (!this.connected || !this.ws) {
      return false;
    }

    try {
      const response = await this.sendCommand({
        id: uuidv4(),
        type: "ping",
        params: {},
      });
      return response.success;
    } catch {
      return false;
    }
  }

  async getProjectInfo(): Promise<ProjectInfo> {
    const response = await this.sendCommand({
      id: uuidv4(),
      type: "getProjectInfo",
      params: {},
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to get project info");
    }

    return response.data as ProjectInfo;
  }

  async insertClip(
    projectItemPath: string,
    inPoint: number,
    outPoint: number,
    timelinePosition: number,
    videoTrack: number = 0,
    audioTrack: number = 0
  ): Promise<TimelineInsertResult> {
    const response = await this.sendCommand({
      id: uuidv4(),
      type: "insertClip",
      params: {
        projectItemPath,
        inPoint,
        outPoint,
        timelinePosition,
        videoTrack,
        audioTrack,
      },
    });

    if (!response.success) {
      return {
        success: false,
        clipName: "",
        timelinePosition: 0,
        duration: 0,
        trackInfo: { video: videoTrack, audio: audioTrack },
        error: response.error,
      };
    }

    return response.data as TimelineInsertResult;
  }

  async overwriteClip(
    projectItemPath: string,
    inPoint: number,
    outPoint: number,
    timelinePosition: number,
    videoTrack: number = 0,
    audioTrack: number = 0
  ): Promise<TimelineInsertResult> {
    const response = await this.sendCommand({
      id: uuidv4(),
      type: "overwriteClip",
      params: {
        projectItemPath,
        inPoint,
        outPoint,
        timelinePosition,
        videoTrack,
        audioTrack,
      },
    });

    if (!response.success) {
      return {
        success: false,
        clipName: "",
        timelinePosition: 0,
        duration: 0,
        trackInfo: { video: videoTrack, audio: audioTrack },
        error: response.error,
      };
    }

    return response.data as TimelineInsertResult;
  }

  async findProjectItem(itemPath: string): Promise<boolean> {
    const response = await this.sendCommand({
      id: uuidv4(),
      type: "findProjectItem",
      params: { itemPath },
    });

    return response.success && response.data !== null;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;

    // Reject all pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge disconnected"));
    }
    this.pendingCommands.clear();

    logger.info("Premiere bridge disconnected");
  }
}

// Singleton instance
export const premiereBridge = new PremiereBridge(
  parseInt(process.env.PREMIERE_BRIDGE_PORT || String(DEFAULT_PORT))
);

export async function initializePremiereBridge(): Promise<void> {
  try {
    await premiereBridge.connect();
  } catch (error) {
    logger.warn(
      "Could not connect to Premiere Pro bridge. Timeline operations will not work until the bridge panel is opened in Premiere Pro."
    );
  }
}
