import { z } from "zod";
import {
  getAnalysisStatus,
  getAnalysisStatusByVideo,
  getSpeechAnalysis,
  getVisualAnalysis,
} from "../cache/store.js";
import { logger } from "../utils/logger.js";

export const getAnalysisStatusSchema = {
  analysisId: z
    .string()
    .optional()
    .describe("Specific analysis ID to check"),
  videoPath: z
    .string()
    .optional()
    .describe("Check all analyses for a video"),
};

export async function handleGetAnalysisStatus(params: {
  analysisId?: string;
  videoPath?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { analysisId, videoPath } = params;

  logger.info("Checking analysis status");

  try {
    if (analysisId) {
      // Get specific analysis
      const status = getAnalysisStatus(analysisId);
      if (!status) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: "Analysis not found",
                  analysisId,
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
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }

    if (videoPath) {
      // Get all analyses for a video
      const statuses = getAnalysisStatusByVideo(videoPath);

      // Also check for completed analyses in cache
      const speechResult = getSpeechAnalysis(videoPath);
      const visualResult = getVisualAnalysis(videoPath);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                videoPath,
                recentStatuses: statuses,
                cachedResults: {
                  speech: speechResult
                    ? {
                        analysisId: speechResult.analysisId,
                        segmentCount: speechResult.segments.length,
                        createdAt: new Date(speechResult.createdAt).toISOString(),
                      }
                    : null,
                  visual: visualResult
                    ? {
                        analysisId: visualResult.analysisId,
                        framesAnalyzed: visualResult.framesAnalyzed,
                        createdAt: new Date(visualResult.createdAt).toISOString(),
                      }
                    : null,
                },
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
              error: "Please provide either analysisId or videoPath",
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
