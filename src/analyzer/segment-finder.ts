import type {
  SpeechAnalysisResult,
  VisualAnalysisResult,
  FoundSegment,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

export interface FindSegmentsOptions {
  query: string;
  searchType: "speech" | "visual" | "both";
  maxResults?: number;
  minDuration?: number;
  expandBy?: number;
  caseSensitive?: boolean;
}

function getTranscriptContext(
  segments: SpeechAnalysisResult["segments"],
  segmentId: number,
  contextSize: number = 1
): string {
  const contextParts: string[] = [];

  for (
    let i = Math.max(0, segmentId - contextSize);
    i <= Math.min(segments.length - 1, segmentId + contextSize);
    i++
  ) {
    contextParts.push(segments[i].text);
  }

  return contextParts.join(" ");
}

function mergeOverlappingSegments(segments: FoundSegment[]): FoundSegment[] {
  if (segments.length <= 1) return segments;

  // Sort by start time
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: FoundSegment[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if segments overlap
    if (next.start <= current.end) {
      // Merge segments
      current = {
        start: current.start,
        end: Math.max(current.end, next.end),
        duration: Math.max(current.end, next.end) - current.start,
        matchType: current.matchType === next.matchType ? current.matchType : "speech",
        matchedContent: current.matchedContent + " | " + next.matchedContent,
        confidence: Math.max(current.confidence, next.confidence),
        context: current.context,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);
  return merged;
}

export function findSegments(
  speechAnalysis: SpeechAnalysisResult | null,
  visualAnalysis: VisualAnalysisResult | null,
  options: FindSegmentsOptions
): FoundSegment[] {
  const {
    query,
    searchType,
    maxResults = 10,
    minDuration = 1,
    expandBy = 0.5,
    caseSensitive = false,
  } = options;

  const segments: FoundSegment[] = [];
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  logger.info(`Searching for "${query}" in ${searchType} data...`);

  // Search speech transcription
  if (speechAnalysis && (searchType === "speech" || searchType === "both")) {
    // Search in full transcript segments
    for (const segment of speechAnalysis.segments) {
      const text = caseSensitive ? segment.text : segment.text.toLowerCase();

      if (text.includes(searchQuery)) {
        const start = Math.max(0, segment.start - expandBy);
        const end = segment.end + expandBy;

        segments.push({
          start,
          end,
          duration: end - start,
          matchType: "speech",
          matchedContent: segment.text,
          confidence: 1.0,
          context: getTranscriptContext(speechAnalysis.segments, segment.id),
        });
      }
    }

    // Also search word-by-word for more precise matches
    if (speechAnalysis.words.length > 0) {
      for (const word of speechAnalysis.words) {
        const wordText = caseSensitive ? word.word : word.word.toLowerCase();

        if (wordText.includes(searchQuery)) {
          // Find containing segment for context
          const containingSegment = speechAnalysis.segments.find(
            (s) => word.start >= s.start && word.end <= s.end
          );

          const start = Math.max(0, word.start - expandBy);
          const end = word.end + expandBy;

          segments.push({
            start,
            end,
            duration: end - start,
            matchType: "speech",
            matchedContent: word.word,
            confidence: word.confidence,
            context: containingSegment?.text || "",
          });
        }
      }
    }

    logger.info(`Found ${segments.length} speech matches`);
  }

  // Search visual analysis
  if (visualAnalysis && (searchType === "visual" || searchType === "both")) {
    const visualMatchesBefore = segments.length;

    for (const frame of visualAnalysis.frames) {
      const description = caseSensitive
        ? frame.description
        : frame.description.toLowerCase();
      const scene = caseSensitive ? frame.scene : frame.scene.toLowerCase();
      const objects = frame.objects.map((o) =>
        caseSensitive ? o : o.toLowerCase()
      );

      const matchInDescription = description.includes(searchQuery);
      const matchInObjects = objects.some((o) => o.includes(searchQuery));
      const matchInScene = scene.includes(searchQuery);

      if (matchInDescription || matchInObjects || matchInScene) {
        // Estimate segment around this frame based on fps
        const frameInterval = 1 / visualAnalysis.fps;

        const start = Math.max(0, frame.timestamp - expandBy);
        const end = frame.timestamp + frameInterval + expandBy;

        segments.push({
          start,
          end,
          duration: end - start,
          matchType: "visual",
          matchedContent: frame.description,
          confidence: 0.8, // Visual matches get slightly lower confidence
          context: `Scene: ${frame.scene}, Objects: ${frame.objects.join(", ")}`,
        });
      }
    }

    logger.info(`Found ${segments.length - visualMatchesBefore} visual matches`);
  }

  // Filter by minimum duration
  let filtered = segments.filter((s) => s.duration >= minDuration);

  // Merge overlapping segments
  filtered = mergeOverlappingSegments(filtered);

  // Sort by confidence and limit results
  const results = filtered
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);

  logger.info(`Returning ${results.length} segments after filtering and merging`);
  return results;
}
