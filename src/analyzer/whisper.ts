import { nodewhisper } from "nodejs-whisper";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import ffmpeg from "fluent-ffmpeg";
import type {
  SpeechAnalysisResult,
  TranscriptSegment,
  WordTimestamp,
} from "../types/index.js";
import { getVideoInfo } from "../utils/video-info.js";
import {
  generateAnalysisId,
  getSpeechAnalysis,
  saveSpeechAnalysis,
  updateAnalysisStatus,
} from "../cache/store.js";
import { logger } from "../utils/logger.js";

export type WhisperModelSize =
  | "tiny"
  | "tiny.en"
  | "base"
  | "base.en"
  | "small"
  | "small.en"
  | "medium"
  | "medium.en"
  | "large"
  | "large-v2"
  | "large-v3";

export interface TranscribeOptions {
  modelSize?: WhisperModelSize;
  language?: string;
  forceReanalyze?: boolean;
}

// Extract audio from video to WAV format (required by Whisper)
async function extractAudio(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputPath)
      .audioCodec("pcm_s16le")
      .audioFrequency(16000)
      .audioChannels(1)
      .format("wav")
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function transcribeVideo(
  videoPath: string,
  options: TranscribeOptions = {}
): Promise<SpeechAnalysisResult> {
  const { modelSize = "base", language, forceReanalyze = false } = options;

  // Check cache first
  if (!forceReanalyze) {
    const cached = getSpeechAnalysis(videoPath);
    if (cached) {
      logger.info("Using cached speech analysis", cached.analysisId);
      return cached;
    }
  }

  const analysisId = generateAnalysisId();
  const startTime = Date.now();

  // Update status
  updateAnalysisStatus({
    analysisId,
    videoPath,
    type: "speech",
    status: "processing",
    progress: 0,
    startedAt: startTime,
  });

  try {
    // Get video info
    const videoInfo = await getVideoInfo(videoPath);
    logger.info("Video duration:", videoInfo.duration, "seconds");

    // Create temp directory for audio extraction
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "premiere-mcp-audio-")
    );
    const audioPath = path.join(tempDir, "audio.wav");

    // Extract audio
    logger.info("Extracting audio from video...");
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "speech",
      status: "processing",
      progress: 10,
      startedAt: startTime,
    });

    await extractAudio(videoPath, audioPath);
    logger.info("Audio extracted to", audioPath);

    // Update progress
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "speech",
      status: "processing",
      progress: 30,
      startedAt: startTime,
    });

    // Run Whisper transcription
    logger.info("Running Whisper transcription with model:", modelSize);

    const whisperResult = await nodewhisper(audioPath, {
      modelName: modelSize,
      autoDownloadModelName: modelSize,
      removeWavFileAfterTranscription: false,
      withCuda: false,
      whisperOptions: {
        language: language || undefined,
        wordTimestamps: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,
      },
    });

    // Update progress
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "speech",
      status: "processing",
      progress: 90,
      startedAt: startTime,
    });

    // Parse results
    const segments: TranscriptSegment[] = [];
    const words: WordTimestamp[] = [];

    // Handle the whisper result format
    if (Array.isArray(whisperResult)) {
      // Result is array of segments
      whisperResult.forEach((seg: { start: number; end: number; speech: string }, index: number) => {
        segments.push({
          id: index,
          start: seg.start,
          end: seg.end,
          text: seg.speech || "",
        });
      });
    }

    // Build result
    const result: SpeechAnalysisResult = {
      analysisId,
      videoPath,
      duration: videoInfo.duration,
      language: language || "auto",
      segments,
      words,
      createdAt: Date.now(),
    };

    // Save to cache
    saveSpeechAnalysis(result);

    // Update status
    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "speech",
      status: "completed",
      progress: 100,
      startedAt: startTime,
      completedAt: Date.now(),
    });

    // Cleanup temp files
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch (e) {
      logger.warn("Failed to cleanup temp directory", tempDir);
    }

    logger.info("Transcription complete:", segments.length, "segments");
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Transcription failed:", errorMessage);

    updateAnalysisStatus({
      analysisId,
      videoPath,
      type: "speech",
      status: "failed",
      progress: 0,
      error: errorMessage,
      startedAt: startTime,
      completedAt: Date.now(),
    });

    throw error;
  }
}
