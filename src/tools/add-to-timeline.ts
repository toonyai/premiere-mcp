import { z } from "zod";
import { premiereBridge } from "../premiere/bridge.js";
import { logger } from "../utils/logger.js";

export const addToTimelineSchema = {
  projectItemPath: z
    .string()
    .describe("Path or name of the project item in Premiere (e.g., 'Footage/interview.mp4')"),
  inPoint: z.number().describe("Start time in seconds within the source clip"),
  outPoint: z.number().describe("End time in seconds within the source clip"),
  timelinePosition: z
    .number()
    .optional()
    .describe("Position in timeline (seconds). Uses playhead position if not specified"),
  videoTrack: z.number().default(0).describe("Video track index (0-based)"),
  audioTrack: z.number().default(0).describe("Audio track index (0-based)"),
  insertMode: z
    .enum(["insert", "overwrite"])
    .default("insert")
    .describe("Insert mode: 'insert' shifts existing clips, 'overwrite' replaces them"),
};

export async function handleAddToTimeline(params: {
  projectItemPath: string;
  inPoint: number;
  outPoint: number;
  timelinePosition?: number;
  videoTrack?: number;
  audioTrack?: number;
  insertMode?: "insert" | "overwrite";
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    projectItemPath,
    inPoint,
    outPoint,
    timelinePosition = 0,
    videoTrack = 0,
    audioTrack = 0,
    insertMode = "insert",
  } = params;

  logger.info(
    `Adding clip to timeline: ${projectItemPath} (${inPoint}s - ${outPoint}s)`
  );

  try {
    // Check if connected to Premiere
    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error:
                  "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open in Premiere Pro.",
                hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    let result;
    if (insertMode === "overwrite") {
      result = await premiereBridge.overwriteClip(
        projectItemPath,
        inPoint,
        outPoint,
        timelinePosition,
        videoTrack,
        audioTrack
      );
    } else {
      result = await premiereBridge.insertClip(
        projectItemPath,
        inPoint,
        outPoint,
        timelinePosition,
        videoTrack,
        audioTrack
      );
    }

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: result.error || "Failed to add clip to timeline",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              clipName: result.clipName,
              timelinePosition: result.timelinePosition,
              duration: result.duration,
              track: result.trackInfo,
              mode: insertMode,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
    };
  }
}
