import { z } from "zod";
import { getSpeechAnalysis, getVisualAnalysis } from "../cache/store.js";
import { findSegments } from "../analyzer/segment-finder.js";
import { logger } from "../utils/logger.js";

export const findSegmentsSchema = {
  videoPath: z.string().describe("Path to the analyzed video"),
  query: z
    .string()
    .describe("What to search for (speech content or visual description)"),
  searchType: z
    .enum(["speech", "visual", "both"])
    .default("both")
    .describe("Type of content to search"),
  maxResults: z
    .number()
    .default(10)
    .describe("Maximum segments to return"),
  minDuration: z
    .number()
    .default(1)
    .describe("Minimum segment duration in seconds"),
  expandBy: z
    .number()
    .default(0.5)
    .describe("Seconds to expand segment boundaries"),
};

export async function handleFindSegments(params: {
  videoPath: string;
  query: string;
  searchType?: "speech" | "visual" | "both";
  maxResults?: number;
  minDuration?: number;
  expandBy?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    videoPath,
    query,
    searchType = "both",
    maxResults = 10,
    minDuration = 1,
    expandBy = 0.5,
  } = params;

  logger.info(`Searching for "${query}" in ${searchType} data for:`, videoPath);

  try {
    // Get cached analysis data
    const speechAnalysis =
      searchType === "visual" ? null : getSpeechAnalysis(videoPath);
    const visualAnalysis =
      searchType === "speech" ? null : getVisualAnalysis(videoPath);

    if (!speechAnalysis && !visualAnalysis) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error:
                  "No analysis found for this video. Please run analyze_video_speech or analyze_video_visual first.",
                videoPath,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const segments = findSegments(speechAnalysis, visualAnalysis, {
      query,
      searchType,
      maxResults,
      minDuration,
      expandBy,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              searchType,
              resultsCount: segments.length,
              segments: segments.map((s) => ({
                start: s.start.toFixed(2),
                end: s.end.toFixed(2),
                duration: s.duration.toFixed(2),
                matchType: s.matchType,
                matchedContent: s.matchedContent,
                confidence: s.confidence,
                context: s.context,
              })),
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
