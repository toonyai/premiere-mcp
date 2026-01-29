import ffmpeg from "fluent-ffmpeg";
import type { VideoInfo } from "../types/index.js";
import { logger } from "./logger.js";

export function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error("Failed to probe video", videoPath, err.message);
        reject(new Error(`Failed to get video info: ${err.message}`));
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      const audioStream = metadata.streams.find((s) => s.codec_type === "audio");

      if (!videoStream) {
        reject(new Error("No video stream found in file"));
        return;
      }

      // Parse frame rate (could be "30/1" or "29.97")
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split("/");
        if (parts.length === 2) {
          fps = parseInt(parts[0]) / parseInt(parts[1]);
        } else {
          fps = parseFloat(parts[0]);
        }
      }

      const duration = metadata.format.duration || 0;

      resolve({
        duration,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps,
        codec: videoStream.codec_name || "unknown",
        audioCodec: audioStream?.codec_name,
      });
    });
  });
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}
