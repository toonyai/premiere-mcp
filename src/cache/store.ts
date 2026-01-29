import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { v4 as uuidv4 } from "uuid";
import type {
  SpeechAnalysisResult,
  VisualAnalysisResult,
  AnalysisStatus,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

const CACHE_DIR = path.join(os.homedir(), ".premiere-mcp", "cache");
const DB_PATH = path.join(CACHE_DIR, "analysis.db");

let db: Database.Database | null = null;

export function initializeCache(): void {
  if (db) return;

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS speech_analysis (
      analysis_id TEXT PRIMARY KEY,
      video_path TEXT NOT NULL,
      duration REAL NOT NULL,
      language TEXT NOT NULL,
      segments TEXT NOT NULL,
      words TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visual_analysis (
      analysis_id TEXT PRIMARY KEY,
      video_path TEXT NOT NULL,
      duration REAL NOT NULL,
      fps REAL NOT NULL,
      frames_analyzed INTEGER NOT NULL,
      frames TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_status (
      analysis_id TEXT PRIMARY KEY,
      video_path TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL,
      error TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_speech_video_path ON speech_analysis(video_path);
    CREATE INDEX IF NOT EXISTS idx_visual_video_path ON visual_analysis(video_path);
    CREATE INDEX IF NOT EXISTS idx_status_video_path ON analysis_status(video_path);
  `);

  logger.info("Cache initialized at", DB_PATH);
}

export function generateAnalysisId(): string {
  return uuidv4();
}

// Speech Analysis Cache
export function getSpeechAnalysis(
  videoPath: string
): SpeechAnalysisResult | null {
  if (!db) throw new Error("Cache not initialized");

  const row = db
    .prepare("SELECT * FROM speech_analysis WHERE video_path = ? ORDER BY created_at DESC LIMIT 1")
    .get(videoPath) as {
      analysis_id: string;
      video_path: string;
      duration: number;
      language: string;
      segments: string;
      words: string;
      created_at: number;
    } | undefined;

  if (!row) return null;

  return {
    analysisId: row.analysis_id,
    videoPath: row.video_path,
    duration: row.duration,
    language: row.language,
    segments: JSON.parse(row.segments),
    words: JSON.parse(row.words),
    createdAt: row.created_at,
  };
}

export function saveSpeechAnalysis(result: SpeechAnalysisResult): void {
  if (!db) throw new Error("Cache not initialized");

  db.prepare(
    `INSERT OR REPLACE INTO speech_analysis
     (analysis_id, video_path, duration, language, segments, words, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.analysisId,
    result.videoPath,
    result.duration,
    result.language,
    JSON.stringify(result.segments),
    JSON.stringify(result.words),
    result.createdAt
  );

  logger.info("Saved speech analysis", result.analysisId);
}

// Visual Analysis Cache
export function getVisualAnalysis(
  videoPath: string
): VisualAnalysisResult | null {
  if (!db) throw new Error("Cache not initialized");

  const row = db
    .prepare("SELECT * FROM visual_analysis WHERE video_path = ? ORDER BY created_at DESC LIMIT 1")
    .get(videoPath) as {
      analysis_id: string;
      video_path: string;
      duration: number;
      fps: number;
      frames_analyzed: number;
      frames: string;
      created_at: number;
    } | undefined;

  if (!row) return null;

  return {
    analysisId: row.analysis_id,
    videoPath: row.video_path,
    duration: row.duration,
    fps: row.fps,
    framesAnalyzed: row.frames_analyzed,
    frames: JSON.parse(row.frames),
    createdAt: row.created_at,
  };
}

export function saveVisualAnalysis(result: VisualAnalysisResult): void {
  if (!db) throw new Error("Cache not initialized");

  db.prepare(
    `INSERT OR REPLACE INTO visual_analysis
     (analysis_id, video_path, duration, fps, frames_analyzed, frames, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.analysisId,
    result.videoPath,
    result.duration,
    result.fps,
    result.framesAnalyzed,
    JSON.stringify(result.frames),
    result.createdAt
  );

  logger.info("Saved visual analysis", result.analysisId);
}

// Analysis Status
export function getAnalysisStatus(analysisId: string): AnalysisStatus | null {
  if (!db) throw new Error("Cache not initialized");

  const row = db
    .prepare("SELECT * FROM analysis_status WHERE analysis_id = ?")
    .get(analysisId) as {
      analysis_id: string;
      video_path: string;
      type: string;
      status: string;
      progress: number;
      error: string | null;
      started_at: number;
      completed_at: number | null;
    } | undefined;

  if (!row) return null;

  return {
    analysisId: row.analysis_id,
    videoPath: row.video_path,
    type: row.type as "speech" | "visual",
    status: row.status as AnalysisStatus["status"],
    progress: row.progress,
    error: row.error || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
  };
}

export function getAnalysisStatusByVideo(videoPath: string): AnalysisStatus[] {
  if (!db) throw new Error("Cache not initialized");

  const rows = db
    .prepare("SELECT * FROM analysis_status WHERE video_path = ? ORDER BY started_at DESC")
    .all(videoPath) as Array<{
      analysis_id: string;
      video_path: string;
      type: string;
      status: string;
      progress: number;
      error: string | null;
      started_at: number;
      completed_at: number | null;
    }>;

  return rows.map((row) => ({
    analysisId: row.analysis_id,
    videoPath: row.video_path,
    type: row.type as "speech" | "visual",
    status: row.status as AnalysisStatus["status"],
    progress: row.progress,
    error: row.error || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
  }));
}

export function updateAnalysisStatus(status: AnalysisStatus): void {
  if (!db) throw new Error("Cache not initialized");

  db.prepare(
    `INSERT OR REPLACE INTO analysis_status
     (analysis_id, video_path, type, status, progress, error, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    status.analysisId,
    status.videoPath,
    status.type,
    status.status,
    status.progress,
    status.error || null,
    status.startedAt,
    status.completedAt || null
  );
}

export function closeCache(): void {
  if (db) {
    db.close();
    db = null;
    logger.info("Cache closed");
  }
}
