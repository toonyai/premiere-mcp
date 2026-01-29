import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import type { FrameAnalysis, VisualAnalysisResult } from "../types/index.js";
import { getVideoInfo } from "../utils/video-info.js";
import {
  extractVideoFrames,
  cleanupFrames,
  type ExtractedFrame,
} from "./frame-extractor.js";
import {
  generateAnalysisId,
  getVisualAnalysis,
  saveVisualAnalysis,
  updateAnalysisStatus,
} from "../cache/store.js";
import { logger } from "../utils/logger.js";

const anthropic = new Anthropic();

export interface VisionAnalysisOptions {
  fps?: number;
  startTime?: number;
  endTime?: number;
  prompt?: string;
  batchSize?: number;
  forceReanalyze?: boolean;
}

const DEFAULT_PROMPT = `Analyze this video frame and provide a JSON response with the following structure:
{
  "description": "A brief description of what is happening in this frame",
  "objects": ["list", "of", "notable", "objects", "or", "people"],
  "scene": "A short scene classification (e.g., 'office interior', 'outdoor nature', 'product demo')"
}

Only respond with the JSON, no other text.`;

async function analyzeFrame(
  frame: ExtractedFrame,
  prompt: string
): Promise<FrameAnalysis> {
  const imageData = await fs.promises.readFile(frame.framePath);
  const base64 = imageData.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude Vision");
  }

  // Parse JSON response
  try {
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = content.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    return {
      timestamp: frame.timestamp,
      framePath: frame.framePath,
      description: parsed.description || "",
      objects: parsed.objects || [],
      scene: parsed.scene || "",
    };
  } catch (e) {
    // If JSON parsing fails, use the raw text as description
    logger.warn("Failed to parse JSON response, using raw text");
    return {
      timestamp: frame.timestamp,
      framePath: frame.framePath,
      description: content.text,
      objects: [],
      scene: "unknown",
    };
  }
}

export async function analyzeVideoVisual(
  videoPath: string,
  options: VisionAnalysisOptions = {}
): Promise<VisualAnalysisResult> {
  const {
    fps = 1,
    startTime,
    endTime,
    prompt = DEFAULT_PROMPT,
    batchSize = 5,
    forceReanalyze = false,
  } = options;

  // Check cache first
  if (!forceReanalyze) {
    const cached = getVisualAnalysis(videoPath);
    if (cached && cached.fps === fps) {
      logger.info("Using cached visual analysis", cached.analysisId);
      return cached;
    }
  }

  const analysisId = generateAnalysisId();
  const startedAt = Date.now();

  // Update status
  updateAnalysisStatus({
    analysisId,
    videoPath,
    type: "visual",
    status: "processing",
    progress: 0,
    startedAt,
  });

  let tempDir = "";

  try {
    // Get video info
    const videoInfo = await getVideoInfo(videoPath);
    logger.info("Analyzing video:", videoPath);
    logger.info("Duration:", videoInfo.duration, "seconds");

    // Extract frames
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "visual",
      status: "processing",
      progress: 10,
      startedAt,
    });

    const extraction = await extractVideoFrames(videoPath, {
      fps,
      startTime,
      endTime,
    });
    tempDir = extraction.tempDir;
    const frames = extraction.frames;

    if (frames.length === 0) {
      throw new Error("No frames extracted from video");
    }

    logger.info(`Analyzing ${frames.length} frames with Claude Vision...`);

    // Analyze frames in batches
    const frameAnalyses: FrameAnalysis[] = [];
    const totalBatches = Math.ceil(frames.length / batchSize);

    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      logger.info(`Processing batch ${batchNumber}/${totalBatches}...`);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((frame) => analyzeFrame(frame, prompt))
      );

      frameAnalyses.push(...batchResults);

      // Update progress
      const progress = 10 + (90 * (i + batch.length)) / frames.length;
      updateAnalysisStatus({
        analysisId,
        videoPath,
        type: "visual",
        status: "processing",
        progress: Math.round(progress),
        startedAt,
      });

      // Rate limiting delay between batches
      if (i + batchSize < frames.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Build result
    const result: VisualAnalysisResult = {
      analysisId,
      videoPath,
      duration: videoInfo.duration,
      fps,
      framesAnalyzed: frameAnalyses.length,
      frames: frameAnalyses,
      createdAt: Date.now(),
    };

    // Save to cache
    saveVisualAnalysis(result);

    // Update status
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "visual",
      status: "completed",
      progress: 100,
      startedAt,
      completedAt: Date.now(),
    });

    logger.info("Visual analysis complete:", frameAnalyses.length, "frames analyzed");

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Visual analysis failed:", errorMessage);

    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "visual",
      status: "failed",
      progress: 0,
      error: errorMessage,
      startedAt,
      completedAt: Date.now(),
    });

    throw error;
  } finally {
    // Cleanup temp files
    if (tempDir) {
      await cleanupFrames(tempDir);
    }
  }
}
