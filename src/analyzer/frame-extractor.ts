import extractFrames from "ffmpeg-extract-frames";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { getVideoInfo } from "../utils/video-info.js";
import { logger } from "../utils/logger.js";

export interface ExtractedFrame {
  timestamp: number;
  framePath: string;
}

export interface FrameExtractionOptions {
  fps?: number;
  startTime?: number;
  endTime?: number;
  maxFrames?: number;
}

export async function extractVideoFrames(
  videoPath: string,
  options: FrameExtractionOptions = {}
): Promise<{ frames: ExtractedFrame[]; tempDir: string }> {
  const { fps = 1, startTime, endTime, maxFrames = 500 } = options;

  // Get video info
  const videoInfo = await getVideoInfo(videoPath);
  const effectiveStart = startTime ?? 0;
  const effectiveEnd = endTime ?? videoInfo.duration;
  const duration = effectiveEnd - effectiveStart;

  // Calculate timestamps
  const intervalMs = 1000 / fps;
  const timestamps: number[] = [];

  for (let t = effectiveStart * 1000; t < effectiveEnd * 1000; t += intervalMs) {
    timestamps.push(Math.round(t));
    if (timestamps.length >= maxFrames) {
      logger.warn(
        `Limiting to ${maxFrames} frames (video would have ${Math.ceil(
          duration * fps
        )} at ${fps} fps)`
      );
      break;
    }
  }

  if (timestamps.length === 0) {
    return { frames: [], tempDir: "" };
  }

  logger.info(`Extracting ${timestamps.length} frames at ${fps} fps...`);

  // Create temp directory for frames
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "premiere-mcp-frames-")
  );

  try {
    // Extract frames at specific timestamps
    await extractFrames({
      input: videoPath,
      output: path.join(tempDir, "frame-%d.jpg"),
      offsets: timestamps,
    });

    // Build frame list with timestamps
    const frames: ExtractedFrame[] = [];
    const files = await fs.promises.readdir(tempDir);
    const frameFiles = files
      .filter((f) => f.startsWith("frame-") && f.endsWith(".jpg"))
      .sort((a, b) => {
        const numA = parseInt(a.replace("frame-", "").replace(".jpg", ""));
        const numB = parseInt(b.replace("frame-", "").replace(".jpg", ""));
        return numA - numB;
      });

    for (let i = 0; i < frameFiles.length; i++) {
      frames.push({
        timestamp: timestamps[i] / 1000, // Convert back to seconds
        framePath: path.join(tempDir, frameFiles[i]),
      });
    }

    logger.info(`Extracted ${frames.length} frames to ${tempDir}`);
    return { frames, tempDir };
  } catch (error) {
    // Cleanup on error
    try {
      await fs.promises.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

export async function cleanupFrames(tempDir: string): Promise<void> {
  if (tempDir && fs.existsSync(tempDir)) {
    await fs.promises.rm(tempDir, { recursive: true });
    logger.debug("Cleaned up temp directory:", tempDir);
  }
}
