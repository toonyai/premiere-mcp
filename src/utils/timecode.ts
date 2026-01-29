// Timecode conversion utilities for Premiere Pro

// Premiere Pro uses ticks internally (254016000000 ticks per second)
const TICKS_PER_SECOND = 254016000000;

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

export function parseTimecode(
  timecode: string,
  fps: number = 30
): number | null {
  // Supports formats: HH:MM:SS:FF, HH:MM:SS.mmm, MM:SS, SS.mmm
  const parts = timecode.split(/[:;]/);

  if (parts.length === 4) {
    // HH:MM:SS:FF (frames)
    const [hours, minutes, seconds, frames] = parts.map(Number);
    return hours * 3600 + minutes * 60 + seconds + frames / fps;
  } else if (parts.length === 3) {
    // HH:MM:SS or MM:SS.mmm
    if (parts[2].includes(".")) {
      const [seconds, ms] = parts[2].split(".").map(Number);
      const [hours, minutes] = parts.slice(0, 2).map(Number);
      return hours * 3600 + minutes * 60 + seconds + ms / 1000;
    }
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts.map(Number);
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    // Just seconds (possibly with decimal)
    return parseFloat(parts[0]);
  }

  return null;
}

export function formatTimecode(
  seconds: number,
  fps: number = 30,
  dropFrame: boolean = false
): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);

  const separator = dropFrame ? ";" : ":";

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
    frames.toString().padStart(2, "0"),
  ].join(separator);
}

export function secondsToSRT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
  ].join(":") + "," + ms.toString().padStart(3, "0");
}
