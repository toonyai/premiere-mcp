// Speech Analysis Types
export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SpeechAnalysisResult {
  analysisId: string;
  videoPath: string;
  duration: number;
  language: string;
  segments: TranscriptSegment[];
  words: WordTimestamp[];
  createdAt: number;
}

// Visual Analysis Types
export interface FrameAnalysis {
  timestamp: number;
  framePath: string;
  description: string;
  objects: string[];
  scene: string;
}

export interface VisualAnalysisResult {
  analysisId: string;
  videoPath: string;
  duration: number;
  fps: number;
  framesAnalyzed: number;
  frames: FrameAnalysis[];
  createdAt: number;
}

// Segment Finding Types
export interface FoundSegment {
  start: number;
  end: number;
  duration: number;
  matchType: "speech" | "visual";
  matchedContent: string;
  confidence: number;
  context: string;
}

// Premiere Pro Types
export interface ProjectItemInfo {
  name: string;
  path: string;
  type: "clip" | "sequence" | "bin" | "other";
  mediaDuration?: number;
  mediaPath?: string;
}

export interface SequenceInfo {
  name: string;
  id: string;
  duration: number;
  videoTrackCount: number;
  audioTrackCount: number;
  frameRate: number;
}

export interface ProjectInfo {
  name: string;
  path: string;
  activeSequence: SequenceInfo | null;
  sequences: SequenceInfo[];
  projectItems: ProjectItemInfo[];
}

export interface TimelineInsertResult {
  success: boolean;
  clipName: string;
  timelinePosition: number;
  duration: number;
  trackInfo: { video: number; audio: number };
  error?: string;
}

// Analysis Status Types
export interface AnalysisStatus {
  analysisId: string;
  videoPath: string;
  type: "speech" | "visual";
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

// Premiere Bridge Types
export interface PremiereCommand {
  id: string;
  type:
    | "insertClip"
    | "overwriteClip"
    | "getProjectInfo"
    | "getSequenceInfo"
    | "findProjectItem"
    | "ping";
  params: Record<string, unknown>;
}

export interface PremiereResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Video Info Types
export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audioCodec?: string;
}
