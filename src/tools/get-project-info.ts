import { z } from "zod";
import { premiereBridge } from "../premiere/bridge.js";
import { logger } from "../utils/logger.js";

export const getProjectInfoSchema = {
  includeItems: z
    .boolean()
    .default(true)
    .describe("Include list of project items"),
  includeSequences: z
    .boolean()
    .default(true)
    .describe("Include sequence information"),
};

export async function handleGetProjectInfo(params: {
  includeItems?: boolean;
  includeSequences?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { includeItems = true, includeSequences = true } = params;

  logger.info("Getting Premiere Pro project info");

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
                connected: false,
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

    const projectInfo = await premiereBridge.getProjectInfo();

    const response: Record<string, unknown> = {
      connected: true,
      projectName: projectInfo.name,
      projectPath: projectInfo.path,
    };

    if (projectInfo.activeSequence) {
      response.activeSequence = {
        name: projectInfo.activeSequence.name,
        duration: projectInfo.activeSequence.duration,
        videoTracks: projectInfo.activeSequence.videoTrackCount,
        audioTracks: projectInfo.activeSequence.audioTrackCount,
        frameRate: projectInfo.activeSequence.frameRate,
      };
    }

    if (includeSequences) {
      response.sequences = projectInfo.sequences.map((s) => ({
        name: s.name,
        id: s.id,
        duration: s.duration,
      }));
    }

    if (includeItems) {
      response.projectItems = projectInfo.projectItems.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        mediaDuration: item.mediaDuration,
      }));
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
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
