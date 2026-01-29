import { z } from "zod";
import { transcribeVideo, type WhisperModelSize } from "../analyzer/whisper.js";
import { logger } from "../utils/logger.js";

export const analyzeSpeechSchema = {
  videoPath: z.string().describe("Absolute path to the video file"),
  language: z
    .string()
    .optional()
    .describe("Language code (e.g., 'en', 'es'). Auto-detect if not specified"),
  modelSize: z
    .enum(["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large"])
    .default("base")
    .describe("Whisper model size. Larger = more accurate but slower"),
  forceReanalyze: z
    .boolean()
    .default(false)
    .describe("Force re-analysis even if cached results exist"),
};

export async function handleAnalyzeSpeech(params: {
  videoPath: string;
  language?: string;
  modelSize?: WhisperModelSize;
  forceReanalyze?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { videoPath, language, modelSize = "base", forceReanalyze = false } = params;

  logger.info("Analyzing speech in video:", videoPath);

  try {
    const result = await transcribeVideo(videoPath, {
      modelSize,
      language,
      forceReanalyze,
    });

    const summary = {
      analysisId: result.analysisId,
      videoPath: result.videoPath,
      duration: result.duration,
      language: result.language,
      segmentCount: result.segments.length,
      wordCount: result.words.length,
      transcript: result.segments.map((s) => s.text).join(" "),
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
