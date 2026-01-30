import { z } from "zod";
import { premiereBridge } from "../premiere/bridge.js";
import { logger } from "../utils/logger.js";

// Schema for basic color corrections
export const applyColorCorrectionSchema = {
  targetType: z
    .enum(["timeline_clip", "project_item"])
    .describe("Whether to apply to a clip in the timeline or a project item"),
  targetPath: z
    .string()
    .optional()
    .describe("Path to project item (e.g., 'Footage/interview.mp4') - required for project_item type"),
  trackIndex: z
    .number()
    .optional()
    .describe("Video track index (0-based) - required for timeline_clip type"),
  clipIndex: z
    .number()
    .optional()
    .describe("Clip index on the track (0-based) - required for timeline_clip type"),
  corrections: z
    .object({
      // Basic Correction
      exposure: z.number().min(-5).max(5).optional().describe("Exposure adjustment (-5 to 5)"),
      contrast: z.number().min(-100).max(100).optional().describe("Contrast adjustment (-100 to 100)"),
      highlights: z.number().min(-100).max(100).optional().describe("Highlights adjustment (-100 to 100)"),
      shadows: z.number().min(-100).max(100).optional().describe("Shadows adjustment (-100 to 100)"),
      whites: z.number().min(-100).max(100).optional().describe("Whites adjustment (-100 to 100)"),
      blacks: z.number().min(-100).max(100).optional().describe("Blacks adjustment (-100 to 100)"),
      // Color
      temperature: z.number().min(-100).max(100).optional().describe("Temperature/warmth (-100 cold to 100 warm)"),
      tint: z.number().min(-100).max(100).optional().describe("Tint (-100 green to 100 magenta)"),
      saturation: z.number().min(-100).max(100).optional().describe("Saturation adjustment (-100 to 100)"),
      vibrance: z.number().min(-100).max(100).optional().describe("Vibrance adjustment (-100 to 100)"),
      // Creative
      faded_film: z.number().min(0).max(100).optional().describe("Faded film amount (0 to 100)"),
      sharpen: z.number().min(0).max(100).optional().describe("Sharpen amount (0 to 100)"),
    })
    .describe("Color correction parameters to apply"),
  useAdjustmentLayer: z
    .boolean()
    .default(true)
    .describe("Use an adjustment layer for non-destructive editing (default: true)"),
};

// Schema for applying color corrections to a range of clips
export const applyColorCorrectionToRangeSchema = {
  startTrack: z.number().describe("Starting video track index (0-based)"),
  startClip: z.number().describe("Starting clip index on the start track (0-based)"),
  endTrack: z.number().describe("Ending video track index (0-based)"),
  endClip: z.number().describe("Ending clip index on the end track (0-based)"),
  corrections: z
    .object({
      exposure: z.number().min(-5).max(5).optional(),
      contrast: z.number().min(-100).max(100).optional(),
      highlights: z.number().min(-100).max(100).optional(),
      shadows: z.number().min(-100).max(100).optional(),
      whites: z.number().min(-100).max(100).optional(),
      blacks: z.number().min(-100).max(100).optional(),
      temperature: z.number().min(-100).max(100).optional(),
      tint: z.number().min(-100).max(100).optional(),
      saturation: z.number().min(-100).max(100).optional(),
      vibrance: z.number().min(-100).max(100).optional(),
      faded_film: z.number().min(0).max(100).optional(),
      sharpen: z.number().min(0).max(100).optional(),
    })
    .describe("Color correction parameters to apply to all clips in range"),
  layerName: z.string().optional().describe("Custom name for the adjustment layer"),
};

// Schema for color matching between clips
export const matchColorSchema = {
  sourceTrack: z.number().describe("Source clip video track index (0-based)"),
  sourceClip: z.number().describe("Source clip index on the track (0-based)"),
  destTrack: z.number().describe("Destination clip video track index (0-based)"),
  destClip: z.number().describe("Destination clip index on the track (0-based)"),
};

// Schema for matching one clip's color to ALL other clips
export const matchColorToAllSchema = {
  sourceClipName: z.string().describe("Name of the source clip to match from (e.g., 'c7121.mp4')"),
};

// Schema for applying LUTs
export const applyLutSchema = {
  targetType: z
    .enum(["timeline_clip", "project_item"])
    .describe("Whether to apply to a clip in the timeline or a project item"),
  targetPath: z
    .string()
    .optional()
    .describe("Path to project item - required for project_item type"),
  trackIndex: z
    .number()
    .optional()
    .describe("Video track index (0-based) - required for timeline_clip type"),
  clipIndex: z
    .number()
    .optional()
    .describe("Clip index on the track (0-based) - required for timeline_clip type"),
  lutPath: z
    .string()
    .describe("Absolute path to the LUT file (.cube, .3dl, etc.) or name of built-in LUT"),
  intensity: z
    .number()
    .min(0)
    .max(100)
    .default(100)
    .describe("LUT intensity/mix (0-100, default 100)"),
};

// Schema for getting current color settings
export const getColorSettingsSchema = {
  targetType: z
    .enum(["timeline_clip", "project_item"])
    .describe("Whether to get settings from a timeline clip or project item"),
  targetPath: z
    .string()
    .optional()
    .describe("Path to project item - required for project_item type"),
  trackIndex: z
    .number()
    .optional()
    .describe("Video track index (0-based) - required for timeline_clip type"),
  clipIndex: z
    .number()
    .optional()
    .describe("Clip index on the track (0-based) - required for timeline_clip type"),
};

// Schema for removing color effects
export const removeColorEffectsSchema = {
  targetType: z
    .enum(["timeline_clip", "project_item"])
    .describe("Whether to remove from a timeline clip or project item"),
  targetPath: z
    .string()
    .optional()
    .describe("Path to project item - required for project_item type"),
  trackIndex: z
    .number()
    .optional()
    .describe("Video track index (0-based) - required for timeline_clip type"),
  clipIndex: z
    .number()
    .optional()
    .describe("Clip index on the track (0-based) - required for timeline_clip type"),
  effectType: z
    .enum(["lumetri", "lut", "all"])
    .default("all")
    .describe("Which color effects to remove"),
};

interface ColorCorrections {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  temperature?: number;
  tint?: number;
  saturation?: number;
  vibrance?: number;
  faded_film?: number;
  sharpen?: number;
}

export async function handleApplyColorCorrection(params: {
  targetType: "timeline_clip" | "project_item";
  targetPath?: string;
  trackIndex?: number;
  clipIndex?: number;
  corrections: ColorCorrections;
  useAdjustmentLayer?: boolean;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { targetType, targetPath, trackIndex, clipIndex, corrections, useAdjustmentLayer = true } = params;

  logger.info(`Applying color correction to ${targetType}: ${targetPath || `track ${trackIndex}, clip ${clipIndex}`} (adjustment layer: ${useAdjustmentLayer})`);

  try {
    // Validate parameters based on target type
    if (targetType === "project_item" && !targetPath) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "targetPath is required when targetType is 'project_item'",
          }, null, 2),
        }],
      };
    }

    if (targetType === "timeline_clip" && (trackIndex === undefined || clipIndex === undefined)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "trackIndex and clipIndex are required when targetType is 'timeline_clip'",
          }, null, 2),
        }],
      };
    }

    // Check if connected to Premiere
    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.applyColorCorrection(
      targetType,
      corrections,
      targetPath,
      trackIndex,
      clipIndex,
      useAdjustmentLayer
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to apply color correction",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          target: result.target,
          appliedCorrections: result.appliedCorrections,
          usedAdjustmentLayer: result.usedAdjustmentLayer,
          message: result.usedAdjustmentLayer
            ? "Color corrections applied via adjustment layer (non-destructive)"
            : "Color corrections applied directly to clip",
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleApplyColorCorrectionToRange(params: {
  startTrack: number;
  startClip: number;
  endTrack: number;
  endClip: number;
  corrections: ColorCorrections;
  layerName?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { startTrack, startClip, endTrack, endClip, corrections, layerName } = params;

  logger.info(`Applying color correction to range: track ${startTrack}:${startClip} to track ${endTrack}:${endClip}`);

  try {
    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.applyColorCorrectionToRange(
      startTrack,
      startClip,
      endTrack,
      endClip,
      corrections,
      layerName
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to apply color correction to range",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          adjustmentLayer: result.target,
          clipsAffected: result.clipsAffected,
          appliedCorrections: result.appliedCorrections,
          adjustmentLayerTrack: result.adjustmentLayerTrack,
          message: `Color corrections applied to ${result.clipsAffected?.length || 0} clips via shared adjustment layer`,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleMatchColor(params: {
  sourceTrack: number;
  sourceClip: number;
  destTrack: number;
  destClip: number;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sourceTrack, sourceClip, destTrack, destClip } = params;

  logger.info(`Matching color from track ${sourceTrack}:${sourceClip} to track ${destTrack}:${destClip}`);

  try {
    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.matchColor(
      sourceTrack,
      sourceClip,
      destTrack,
      destClip
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to match color between clips",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          sourceClip: result.sourceClip,
          destinationClip: result.destinationClip,
          adjustmentLayer: result.adjustmentLayer,
          copiedSettings: result.copiedSettings,
          message: `Color matched from "${result.sourceClip}" to "${result.destinationClip}" via adjustment layer`,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleMatchColorToAll(params: {
  sourceClipName: string;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sourceClipName } = params;

  logger.info(`Matching color from "${sourceClipName}" to all other clips`);

  try {
    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.matchColorToAll(sourceClipName);

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to match color to all clips",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          sourceClip: result.sourceClip,
          adjustmentLayer: result.adjustmentLayer,
          clipsMatched: result.clipsMatched,
          copiedSettings: result.copiedSettings,
          adjustmentLayerTrack: result.adjustmentLayerTrack,
          message: `Color from "${result.sourceClip}" matched to ${result.clipsMatched?.length || 0} clips via adjustment layer "${result.adjustmentLayer}"`,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleApplyLut(params: {
  targetType: "timeline_clip" | "project_item";
  targetPath?: string;
  trackIndex?: number;
  clipIndex?: number;
  lutPath: string;
  intensity?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { targetType, targetPath, trackIndex, clipIndex, lutPath, intensity = 100 } = params;

  logger.info(`Applying LUT ${lutPath} to ${targetType}`);

  try {
    // Validate parameters
    if (targetType === "project_item" && !targetPath) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "targetPath is required when targetType is 'project_item'",
          }, null, 2),
        }],
      };
    }

    if (targetType === "timeline_clip" && (trackIndex === undefined || clipIndex === undefined)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "trackIndex and clipIndex are required when targetType is 'timeline_clip'",
          }, null, 2),
        }],
      };
    }

    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.applyLut(
      targetType,
      lutPath,
      intensity,
      targetPath,
      trackIndex,
      clipIndex
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to apply LUT",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          target: result.target,
          lutApplied: result.lutName,
          intensity: result.intensity,
          message: "LUT applied successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleGetColorSettings(params: {
  targetType: "timeline_clip" | "project_item";
  targetPath?: string;
  trackIndex?: number;
  clipIndex?: number;
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { targetType, targetPath, trackIndex, clipIndex } = params;

  logger.info(`Getting color settings from ${targetType}`);

  try {
    if (targetType === "project_item" && !targetPath) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "targetPath is required when targetType is 'project_item'",
          }, null, 2),
        }],
      };
    }

    if (targetType === "timeline_clip" && (trackIndex === undefined || clipIndex === undefined)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "trackIndex and clipIndex are required when targetType is 'timeline_clip'",
          }, null, 2),
        }],
      };
    }

    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.getColorSettings(
      targetType,
      targetPath,
      trackIndex,
      clipIndex
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to get color settings",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          target: result.target,
          hasLumetri: result.hasLumetri,
          currentSettings: result.settings,
          appliedLut: result.appliedLut,
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}

export async function handleRemoveColorEffects(params: {
  targetType: "timeline_clip" | "project_item";
  targetPath?: string;
  trackIndex?: number;
  clipIndex?: number;
  effectType?: "lumetri" | "lut" | "all";
}): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { targetType, targetPath, trackIndex, clipIndex, effectType = "all" } = params;

  logger.info(`Removing ${effectType} color effects from ${targetType}`);

  try {
    if (targetType === "project_item" && !targetPath) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "targetPath is required when targetType is 'project_item'",
          }, null, 2),
        }],
      };
    }

    if (targetType === "timeline_clip" && (trackIndex === undefined || clipIndex === undefined)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "trackIndex and clipIndex are required when targetType is 'timeline_clip'",
          }, null, 2),
        }],
      };
    }

    const connected = await premiereBridge.isConnected();
    if (!connected) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Not connected to Premiere Pro. Make sure the MCP Bridge panel is open.",
            hint: "Open Premiere Pro, then go to Window > Extensions > MCP Bridge",
          }, null, 2),
        }],
      };
    }

    const result = await premiereBridge.removeColorEffects(
      targetType,
      effectType,
      targetPath,
      trackIndex,
      clipIndex
    );

    if (!result.success) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: result.error || "Failed to remove color effects",
          }, null, 2),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          target: result.target,
          effectsRemoved: result.effectsRemoved,
          message: "Color effects removed successfully",
        }, null, 2),
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2),
      }],
    };
  }
}
