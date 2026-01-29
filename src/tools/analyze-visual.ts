import { z } from "zod";
import { analyzeVideoVisual } from "../analyzer/vision-analyzer.js";
import { logger } from "../utils/logger.js";

export const analyzeVisualSchema = {
  videoPath: z.string().describe("Absolute path to the video file"),
  fps: z
    .number()
    .default(1)
    .describe("Frames per second to extract (0.5-5 recommended)"),
  startTime: z.number().optional().describe("Start time in seconds"),
  endTime: z.number().optional().describe("End time in seconds"),
  prompt: z
    .string()
    .optional()
    .describe("Custom analysis prompt for each frame"),
  forceReanalyze: z
    .boolean()
    .default(false)
    .describe("Force re-analysis even if cached results exist"),
};

export async function handleAnalyzeVisual(params: {
  videoPath: string;
  fps?: number;
  startTime?: number;
  endTime?: number;
  prompt?: string;
  forceReanalyze?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const {
    videoPath,
    fps = 1,
    startTime,
    endTime,
    prompt,
    forceReanalyze = false,
  } = params;

  logger.info("Analyzing visual content in video:", videoPath);

  try {
    const result = await analyzeVideoVisual(videoPath, {
      fps,
      startTime,
      endTime,
      prompt,
      forceReanalyze,
    });

    const summary = {
      analysisId: result.analysisId,
      videoPath: result.videoPath,
      duration: result.duration,
      fps: result.fps,
      framesAnalyzed: result.framesAnalyzed,
      scenes: result.frames.map((f) => ({
        timestamp: f.timestamp,
        scene: f.scene,
        description: f.description,
        objects: f.objects,
      })),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
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
