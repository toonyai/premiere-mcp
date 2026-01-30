#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeCache, closeCache } from "./cache/store.js";
import { initializePremiereBridge, premiereBridge } from "./premiere/bridge.js";
import { logger } from "./utils/logger.js";

// Import tool handlers and schemas
import { analyzeSpeechSchema, handleAnalyzeSpeech } from "./tools/analyze-speech.js";
import { analyzeVisualSchema, handleAnalyzeVisual } from "./tools/analyze-visual.js";
import { findSegmentsSchema, handleFindSegments } from "./tools/find-segments.js";
import { addToTimelineSchema, handleAddToTimeline } from "./tools/add-to-timeline.js";
import { getProjectInfoSchema, handleGetProjectInfo } from "./tools/get-project-info.js";
import { getAnalysisStatusSchema, handleGetAnalysisStatus } from "./tools/get-analysis-status.js";
import {
  applyColorCorrectionSchema,
  handleApplyColorCorrection,
  applyColorCorrectionToRangeSchema,
  handleApplyColorCorrectionToRange,
  matchColorSchema,
  handleMatchColor,
  matchColorToAllSchema,
  handleMatchColorToAll,
  applyLutSchema,
  handleApplyLut,
  getColorSettingsSchema,
  handleGetColorSettings,
  removeColorEffectsSchema,
  handleRemoveColorEffects,
} from "./tools/color-correction.js";

async function main() {
  logger.info("Starting Premiere MCP Server...");

  // Initialize components
  initializeCache();
  await initializePremiereBridge();

  // Create MCP server
  const server = new McpServer({
    name: "premiere-video-editor",
    version: "1.0.0",
  });

  // Register tools
  server.tool(
    "analyze_video_speech",
    "Transcribe video audio using Whisper with word-level timestamps. Returns transcript segments and word timings.",
    analyzeSpeechSchema,
    async (params) => handleAnalyzeSpeech(params)
  );

  server.tool(
    "analyze_video_visual",
    "Extract frames and analyze visual content using Claude Vision. Returns scene descriptions, objects, and classifications.",
    analyzeVisualSchema,
    async (params) => handleAnalyzeVisual(params)
  );

  server.tool(
    "find_video_segments",
    "Search analyzed video data to find specific segments by speech content or visual description. Requires running analyze_video_speech or analyze_video_visual first.",
    findSegmentsSchema,
    async (params) => handleFindSegments(params)
  );

  server.tool(
    "add_segment_to_timeline",
    "Add a video segment to the Premiere Pro timeline. Requires the MCP Bridge panel to be open in Premiere Pro.",
    addToTimelineSchema,
    async (params) => handleAddToTimeline(params)
  );

  server.tool(
    "get_premiere_project_info",
    "Get information about the current Premiere Pro project, including sequences and project items.",
    getProjectInfoSchema,
    async (params) => handleGetProjectInfo(params)
  );

  server.tool(
    "get_analysis_status",
    "Check the status of video analysis operations. Can query by analysis ID or video path.",
    getAnalysisStatusSchema,
    async (params) => handleGetAnalysisStatus(params)
  );

  // Color Correction Tools
  server.tool(
    "apply_color_correction",
    "Apply color corrections (exposure, contrast, saturation, temperature, etc.) to a clip using an adjustment layer for non-destructive editing.",
    applyColorCorrectionSchema,
    async (params) => handleApplyColorCorrection(params)
  );

  server.tool(
    "apply_color_correction_to_range",
    "Apply color corrections to multiple clips at once using a shared adjustment layer spanning all clips.",
    applyColorCorrectionToRangeSchema,
    async (params) => handleApplyColorCorrectionToRange(params)
  );

  server.tool(
    "match_color",
    "Copy color settings from a source clip to a destination clip using an adjustment layer. Useful for matching looks across clips.",
    matchColorSchema,
    async (params) => handleMatchColor(params)
  );

  server.tool(
    "match_color_to_all",
    "Match the color of ALL clips in the timeline to a source clip by name. Creates one adjustment layer spanning the entire timeline.",
    matchColorToAllSchema,
    async (params) => handleMatchColorToAll(params)
  );

  server.tool(
    "apply_lut",
    "Apply a LUT (Look Up Table) to a clip in the timeline for color grading.",
    applyLutSchema,
    async (params) => handleApplyLut(params)
  );

  server.tool(
    "get_color_settings",
    "Get the current color correction settings from a clip in the timeline.",
    getColorSettingsSchema,
    async (params) => handleGetColorSettings(params)
  );

  server.tool(
    "remove_color_effects",
    "Remove color correction effects (Lumetri Color, LUTs) from a clip in the timeline.",
    removeColorEffectsSchema,
    async (params) => handleRemoveColorEffects(params)
  );

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("Shutting down...");
    premiereBridge.disconnect();
    closeCache();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    premiereBridge.disconnect();
    closeCache();
    process.exit(0);
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Premiere MCP Server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
