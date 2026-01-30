/**
 * ExtendScript commands for Premiere Pro MCP Bridge
 * These functions are called from the CEP panel via CSInterface.evalScript
 */

// Create namespace to avoid conflicts
$._PPRO_MCP_ = {
    /**
     * Find a project item by path (e.g., "Footage/interview.mp4")
     */
    findProjectItem: function(itemPath) {
        if (!app.project) return null;

        var parts = itemPath.split("/");
        var current = app.project.rootItem;

        for (var i = 0; i < parts.length; i++) {
            var found = false;
            for (var j = 0; j < current.children.numItems; j++) {
                if (current.children[j].name === parts[i]) {
                    current = current.children[j];
                    found = true;
                    break;
                }
            }
            if (!found) return null;
        }

        return current;
    },

    /**
     * Check if a project item exists
     */
    findProjectItemExists: function(itemPath) {
        var item = this.findProjectItem(itemPath);
        return item !== null ? "true" : "false";
    },

    /**
     * Insert clip to timeline (shifts existing clips)
     */
    insertClipToTimeline: function(itemPath, inPoint, outPoint, timelinePos, vTrack, aTrack) {
        try {
            var item = this.findProjectItem(itemPath);
            if (!item) {
                return JSON.stringify({
                    success: false,
                    error: "Project item not found: " + itemPath
                });
            }

            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({
                    success: false,
                    error: "No active sequence"
                });
            }

            // Set in/out points on the project item (time in seconds)
            item.setInPoint(inPoint, 4); // 4 = seconds
            item.setOutPoint(outPoint, 4);

            // Convert timeline position to ticks
            var ticksPerSecond = 254016000000;
            var timelineTicks = timelinePos * ticksPerSecond;

            // Insert the clip
            var result = seq.insertClip(item, timelineTicks.toFixed(0), vTrack, aTrack);

            return JSON.stringify({
                success: result,
                clipName: item.name,
                timelinePosition: timelinePos,
                duration: outPoint - inPoint,
                trackInfo: { video: vTrack, audio: aTrack }
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Overwrite clip to timeline (replaces existing clips)
     */
    overwriteClipToTimeline: function(itemPath, inPoint, outPoint, timelinePos, vTrack, aTrack) {
        try {
            var item = this.findProjectItem(itemPath);
            if (!item) {
                return JSON.stringify({
                    success: false,
                    error: "Project item not found: " + itemPath
                });
            }

            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({
                    success: false,
                    error: "No active sequence"
                });
            }

            // Set in/out points
            item.setInPoint(inPoint, 4);
            item.setOutPoint(outPoint, 4);

            // Get the video track
            if (vTrack >= seq.videoTracks.numTracks) {
                return JSON.stringify({
                    success: false,
                    error: "Video track " + vTrack + " does not exist"
                });
            }

            var videoTrack = seq.videoTracks[vTrack];

            // Overwrite the clip
            var result = videoTrack.overwriteClip(item, timelinePos);

            return JSON.stringify({
                success: result,
                clipName: item.name,
                timelinePosition: timelinePos,
                duration: outPoint - inPoint,
                trackInfo: { video: vTrack, audio: aTrack }
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Get project information
     */
    getProjectInfo: function() {
        try {
            var proj = app.project;
            if (!proj) {
                return JSON.stringify({
                    success: false,
                    error: "No project open"
                });
            }

            var result = {
                name: proj.name,
                path: proj.path,
                activeSequence: null,
                sequences: [],
                projectItems: []
            };

            // Get active sequence info
            if (proj.activeSequence) {
                var seq = proj.activeSequence;
                result.activeSequence = {
                    name: seq.name,
                    id: seq.sequenceID,
                    duration: seq.end / 254016000000, // Convert ticks to seconds
                    videoTrackCount: seq.videoTracks.numTracks,
                    audioTrackCount: seq.audioTracks.numTracks,
                    frameRate: seq.timebase
                };
            }

            // Collect all sequences
            for (var i = 0; i < proj.sequences.numSequences; i++) {
                var seq = proj.sequences[i];
                result.sequences.push({
                    name: seq.name,
                    id: seq.sequenceID,
                    duration: seq.end / 254016000000
                });
            }

            // Recursively collect project items
            this._collectItems(proj.rootItem, "", result.projectItems);

            return JSON.stringify(result);

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Helper to recursively collect project items
     */
    _collectItems: function(parent, path, items) {
        for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            var itemPath = path ? path + "/" + child.name : child.name;

            var itemType = "other";
            if (child.type === 1) itemType = "clip";
            else if (child.type === 2) itemType = "bin";
            else if (child.type === 4) itemType = "sequence";

            var itemInfo = {
                name: child.name,
                path: itemPath,
                type: itemType
            };

            // Get duration for clips
            if (itemType === "clip" && child.getOutPoint) {
                try {
                    var outPoint = child.getOutPoint(4); // 4 = seconds
                    var inPoint = child.getInPoint(4);
                    itemInfo.mediaDuration = outPoint - inPoint;
                } catch (e) {
                    // Some items don't have duration
                }
            }

            items.push(itemInfo);

            // Recurse into bins
            if (itemType === "bin" && child.children) {
                this._collectItems(child, itemPath, items);
            }
        }
    },

    /**
     * Get a timeline clip by track and clip index
     */
    _getTimelineClip: function(trackIndex, clipIndex) {
        var seq = app.project.activeSequence;
        if (!seq) return null;

        if (trackIndex >= seq.videoTracks.numTracks) return null;

        var track = seq.videoTracks[trackIndex];
        if (clipIndex >= track.clips.numItems) return null;

        return track.clips[clipIndex];
    },

    /**
     * Find or add Lumetri Color effect to a clip
     */
    _getOrAddLumetriEffect: function(clip) {
        // Check if Lumetri Color already exists
        for (var i = 0; i < clip.components.numItems; i++) {
            var comp = clip.components[i];
            if (comp.displayName === "Lumetri Color") {
                return comp;
            }
        }

        // Add Lumetri Color effect
        var qe = qe || app.enableQE();
        if (qe) {
            // QE is available, use it to add effect
            var effect = qe.project.getVideoEffectByName("Lumetri Color");
            if (effect) {
                clip.addComponent(effect);
                // Return the newly added component
                for (var i = 0; i < clip.components.numItems; i++) {
                    var comp = clip.components[i];
                    if (comp.displayName === "Lumetri Color") {
                        return comp;
                    }
                }
            }
        }

        return null;
    },

    /**
     * Create an adjustment layer in the project
     */
    _createAdjustmentLayer: function(name, width, height, duration, pixelAspectRatio, frameRate) {
        var seq = app.project.activeSequence;
        if (!seq) return null;

        // Use sequence settings if not provided
        width = width || seq.frameSizeHorizontal;
        height = height || seq.frameSizeVertical;
        frameRate = frameRate || seq.timebase;
        pixelAspectRatio = pixelAspectRatio || 1.0;

        // Duration in ticks (default 10 seconds if not specified)
        var ticksPerSecond = 254016000000;
        duration = duration || (10 * ticksPerSecond);

        // Find or create "Adjustment Layers" bin
        var adjustmentBin = null;
        for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
            var child = app.project.rootItem.children[i];
            if (child.name === "Adjustment Layers" && child.type === 2) {
                adjustmentBin = child;
                break;
            }
        }

        if (!adjustmentBin) {
            adjustmentBin = app.project.rootItem.createBin("Adjustment Layers");
        }

        // Create the adjustment layer
        var adjLayer = null;
        if (app.project.createNewAdjustmentLayer) {
            // Premiere Pro 2020+
            adjLayer = app.project.createNewAdjustmentLayer(name, width, height, pixelAspectRatio, duration, frameRate);
        }

        return adjLayer;
    },

    /**
     * Find or create an adjustment layer for color correction
     */
    _getOrCreateColorAdjustmentLayer: function(clip, layerName) {
        var seq = app.project.activeSequence;
        if (!seq) return null;

        var ticksPerSecond = 254016000000;

        // Get clip timing
        var clipStart = clip.start.ticks;
        var clipEnd = clip.end.ticks;
        var clipDuration = clipEnd - clipStart;

        // Calculate which track to use (one above the clip's track)
        var clipTrackIndex = -1;
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                if (track.clips[c].nodeId === clip.nodeId) {
                    clipTrackIndex = t;
                    break;
                }
            }
            if (clipTrackIndex >= 0) break;
        }

        if (clipTrackIndex < 0) return null;

        // Use track above clip, or create one if needed
        var adjTrackIndex = clipTrackIndex + 1;

        // Check if there's already an adjustment layer at this position
        if (adjTrackIndex < seq.videoTracks.numTracks) {
            var adjTrack = seq.videoTracks[adjTrackIndex];
            for (var c = 0; c < adjTrack.clips.numItems; c++) {
                var existingClip = adjTrack.clips[c];
                // Check if it's an adjustment layer that overlaps our clip
                if (existingClip.name && existingClip.name.indexOf("Color") !== -1) {
                    var existingStart = existingClip.start.ticks;
                    var existingEnd = existingClip.end.ticks;
                    // If it covers our clip range, return it
                    if (existingStart <= clipStart && existingEnd >= clipEnd) {
                        return existingClip;
                    }
                }
            }
        }

        // Create new adjustment layer
        var adjLayerName = layerName || ("Color Grade - " + clip.name);
        var adjItem = this._createAdjustmentLayer(adjLayerName, null, null, clipDuration, null, null);

        if (!adjItem) {
            return null;
        }

        // Insert adjustment layer on track above clip
        try {
            // Set in/out on the adjustment layer
            adjItem.setInPoint(0, 4);
            adjItem.setOutPoint(clipDuration / ticksPerSecond, 4);

            // Insert to timeline
            var inserted = seq.insertClip(adjItem, clipStart.toFixed(0), adjTrackIndex, -1);

            // Find the inserted clip
            if (adjTrackIndex < seq.videoTracks.numTracks) {
                var track = seq.videoTracks[adjTrackIndex];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var insertedClip = track.clips[c];
                    if (insertedClip.projectItem && insertedClip.projectItem.nodeId === adjItem.nodeId) {
                        return insertedClip;
                    }
                }
                // Fallback: return the last clip on the track
                if (track.clips.numItems > 0) {
                    return track.clips[track.clips.numItems - 1];
                }
            }
        } catch (e) {
            // Failed to insert
        }

        return null;
    },

    /**
     * Apply Lumetri settings to a component
     */
    _applyLumetriSettings: function(lumetri, corrections) {
        var appliedCorrections = {};

        for (var key in corrections) {
            if (corrections.hasOwnProperty(key) && corrections[key] !== undefined) {
                var value = corrections[key];

                // Find the property by name
                for (var i = 0; i < lumetri.properties.numItems; i++) {
                    var prop = lumetri.properties[i];
                    var propName = prop.displayName.toLowerCase().replace(/ /g, "_");

                    // Match property names
                    if (propName === key ||
                        (key === "exposure" && propName === "exposure") ||
                        (key === "contrast" && propName === "contrast") ||
                        (key === "highlights" && propName === "highlights") ||
                        (key === "shadows" && propName === "shadows") ||
                        (key === "whites" && propName === "whites") ||
                        (key === "blacks" && propName === "blacks") ||
                        (key === "temperature" && propName === "temperature") ||
                        (key === "tint" && propName === "tint") ||
                        (key === "saturation" && propName === "saturation") ||
                        (key === "vibrance" && propName === "vibrance") ||
                        (key === "faded_film" && propName === "faded_film") ||
                        (key === "sharpen" && propName === "sharpen")) {
                        try {
                            prop.setValue(value, true);
                            appliedCorrections[key] = value;
                            break;
                        } catch (e) {
                            // Property might be read-only or invalid
                        }
                    }
                }
            }
        }

        return appliedCorrections;
    },

    /**
     * Apply color correction using an adjustment layer (non-destructive)
     */
    applyColorCorrection: function(targetType, correctionsJson, targetPath, trackIndex, clipIndex, useAdjustmentLayer) {
        try {
            var corrections = JSON.parse(correctionsJson);
            var clip = null;
            var targetName = "";
            var adjustmentLayerUsed = false;

            if (targetType === "timeline_clip") {
                clip = this._getTimelineClip(trackIndex, clipIndex);
                if (!clip) {
                    return JSON.stringify({
                        success: false,
                        error: "Clip not found at track " + trackIndex + ", index " + clipIndex
                    });
                }
                targetName = clip.name;
            } else {
                return JSON.stringify({
                    success: false,
                    error: "Project item color correction requires the clip to be in the timeline. Use timeline_clip targetType."
                });
            }

            var targetClip = clip;
            var lumetri = null;

            // Try to use adjustment layer by default (better workflow)
            if (useAdjustmentLayer !== false) {
                var adjLayer = this._getOrCreateColorAdjustmentLayer(clip, "Color - " + clip.name);
                if (adjLayer) {
                    targetClip = adjLayer;
                    adjustmentLayerUsed = true;
                    targetName = "Adjustment Layer for " + clip.name;
                }
            }

            // Get or add Lumetri Color effect to target
            lumetri = this._getOrAddLumetriEffect(targetClip);
            if (!lumetri) {
                return JSON.stringify({
                    success: false,
                    error: "Could not add Lumetri Color effect. Make sure Lumetri Color is available."
                });
            }

            // Apply corrections
            var appliedCorrections = this._applyLumetriSettings(lumetri, corrections);

            return JSON.stringify({
                success: true,
                target: targetName,
                appliedCorrections: appliedCorrections,
                usedAdjustmentLayer: adjustmentLayerUsed
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Apply color correction to multiple clips using a shared adjustment layer
     */
    applyColorCorrectionToRange: function(startTrack, startClip, endTrack, endClip, correctionsJson, layerName) {
        try {
            var corrections = JSON.parse(correctionsJson);
            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({
                    success: false,
                    error: "No active sequence"
                });
            }

            var ticksPerSecond = 254016000000;

            // Find the range of clips
            var minStart = Number.MAX_VALUE;
            var maxEnd = 0;
            var maxTrack = 0;
            var clipsFound = [];

            for (var t = startTrack; t <= endTrack && t < seq.videoTracks.numTracks; t++) {
                var track = seq.videoTracks[t];
                var startIdx = (t === startTrack) ? startClip : 0;
                var endIdx = (t === endTrack) ? endClip : track.clips.numItems - 1;

                for (var c = startIdx; c <= endIdx && c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    var clipStart = parseFloat(clip.start.ticks);
                    var clipEnd = parseFloat(clip.end.ticks);

                    if (clipStart < minStart) minStart = clipStart;
                    if (clipEnd > maxEnd) maxEnd = clipEnd;
                    if (t > maxTrack) maxTrack = t;

                    clipsFound.push(clip.name);
                }
            }

            if (clipsFound.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: "No clips found in specified range"
                });
            }

            // Create adjustment layer spanning all clips
            var adjDuration = maxEnd - minStart;
            var adjLayerName = layerName || "Color Match - " + clipsFound.length + " clips";
            var adjItem = this._createAdjustmentLayer(adjLayerName, null, null, adjDuration, null, null);

            if (!adjItem) {
                return JSON.stringify({
                    success: false,
                    error: "Could not create adjustment layer"
                });
            }

            // Insert adjustment layer above all clips
            var adjTrackIndex = maxTrack + 1;
            adjItem.setInPoint(0, 4);
            adjItem.setOutPoint(adjDuration / ticksPerSecond, 4);

            seq.insertClip(adjItem, minStart.toFixed(0), adjTrackIndex, -1);

            // Find the inserted adjustment layer clip
            var adjClip = null;
            if (adjTrackIndex < seq.videoTracks.numTracks) {
                var track = seq.videoTracks[adjTrackIndex];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var insertedClip = track.clips[c];
                    if (insertedClip.projectItem && insertedClip.projectItem.nodeId === adjItem.nodeId) {
                        adjClip = insertedClip;
                        break;
                    }
                }
                if (!adjClip && track.clips.numItems > 0) {
                    adjClip = track.clips[track.clips.numItems - 1];
                }
            }

            if (!adjClip) {
                return JSON.stringify({
                    success: false,
                    error: "Could not find inserted adjustment layer"
                });
            }

            // Add Lumetri Color and apply corrections
            var lumetri = this._getOrAddLumetriEffect(adjClip);
            if (!lumetri) {
                return JSON.stringify({
                    success: false,
                    error: "Could not add Lumetri Color effect to adjustment layer"
                });
            }

            var appliedCorrections = this._applyLumetriSettings(lumetri, corrections);

            return JSON.stringify({
                success: true,
                target: adjLayerName,
                clipsAffected: clipsFound,
                appliedCorrections: appliedCorrections,
                adjustmentLayerTrack: adjTrackIndex
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Find a clip by name in the timeline
     */
    _findClipByName: function(clipName) {
        var seq = app.project.activeSequence;
        if (!seq) return null;

        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (clip.name === clipName ||
                    (clip.projectItem && clip.projectItem.name === clipName)) {
                    return { clip: clip, trackIndex: t, clipIndex: c };
                }
            }
        }
        return null;
    },

    /**
     * Match color from a source clip to ALL other clips in timeline
     */
    matchColorToAll: function(sourceClipName) {
        try {
            var seq = app.project.activeSequence;
            if (!seq) {
                return JSON.stringify({
                    success: false,
                    error: "No active sequence"
                });
            }

            // Find source clip
            var sourceInfo = this._findClipByName(sourceClipName);
            if (!sourceInfo) {
                return JSON.stringify({
                    success: false,
                    error: "Source clip '" + sourceClipName + "' not found in timeline"
                });
            }

            var srcClip = sourceInfo.clip;

            // Get Lumetri from source (check clip first, then adjustment layers above it)
            var srcLumetri = null;
            for (var i = 0; i < srcClip.components.numItems; i++) {
                var comp = srcClip.components[i];
                if (comp.displayName === "Lumetri Color") {
                    srcLumetri = comp;
                    break;
                }
            }

            // Check adjustment layers above source clip
            if (!srcLumetri) {
                var srcStart = parseFloat(srcClip.start.ticks);
                var srcEnd = parseFloat(srcClip.end.ticks);

                for (var t = sourceInfo.trackIndex + 1; t < seq.videoTracks.numTracks; t++) {
                    var track = seq.videoTracks[t];
                    for (var c = 0; c < track.clips.numItems; c++) {
                        var adjClip = track.clips[c];
                        var adjStart = parseFloat(adjClip.start.ticks);
                        var adjEnd = parseFloat(adjClip.end.ticks);

                        if (adjStart <= srcStart && adjEnd >= srcEnd) {
                            for (var i = 0; i < adjClip.components.numItems; i++) {
                                var comp = adjClip.components[i];
                                if (comp.displayName === "Lumetri Color") {
                                    srcLumetri = comp;
                                    break;
                                }
                            }
                        }
                        if (srcLumetri) break;
                    }
                    if (srcLumetri) break;
                }
            }

            if (!srcLumetri) {
                return JSON.stringify({
                    success: false,
                    error: "No Lumetri Color effect found on source clip '" + sourceClipName + "' or its adjustment layers"
                });
            }

            // Extract settings from source
            var settings = {};
            for (var i = 0; i < srcLumetri.properties.numItems; i++) {
                var prop = srcLumetri.properties[i];
                try {
                    var value = prop.getValue();
                    if (typeof value === "number") {
                        var propName = prop.displayName.toLowerCase().replace(/ /g, "_");
                        settings[propName] = value;
                    }
                } catch (e) {
                    // Skip unreadable properties
                }
            }

            // Find all clips and their time range (excluding the source)
            var ticksPerSecond = 254016000000;
            var minStart = Number.MAX_VALUE;
            var maxEnd = 0;
            var maxTrack = 0;
            var clipsToMatch = [];

            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                var track = seq.videoTracks[t];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];

                    // Skip the source clip
                    if (clip.nodeId === srcClip.nodeId) continue;

                    // Skip adjustment layers (they don't need color matching)
                    if (clip.name && (clip.name.indexOf("Color") !== -1 || clip.name.indexOf("Adjustment") !== -1)) continue;

                    var clipStart = parseFloat(clip.start.ticks);
                    var clipEnd = parseFloat(clip.end.ticks);

                    if (clipStart < minStart) minStart = clipStart;
                    if (clipEnd > maxEnd) maxEnd = clipEnd;
                    if (t > maxTrack) maxTrack = t;

                    clipsToMatch.push(clip.name);
                }
            }

            if (clipsToMatch.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: "No other clips found to match"
                });
            }

            // Create a single adjustment layer spanning all clips
            var adjDuration = maxEnd - minStart;
            var adjLayerName = "Color Match - " + sourceClipName;
            var adjItem = this._createAdjustmentLayer(adjLayerName, null, null, adjDuration, null, null);

            if (!adjItem) {
                return JSON.stringify({
                    success: false,
                    error: "Could not create adjustment layer"
                });
            }

            // Insert adjustment layer above all clips
            var adjTrackIndex = maxTrack + 1;
            adjItem.setInPoint(0, 4);
            adjItem.setOutPoint(adjDuration / ticksPerSecond, 4);

            seq.insertClip(adjItem, minStart.toFixed(0), adjTrackIndex, -1);

            // Find the inserted adjustment layer clip
            var adjClip = null;
            if (adjTrackIndex < seq.videoTracks.numTracks) {
                var track = seq.videoTracks[adjTrackIndex];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var insertedClip = track.clips[c];
                    if (insertedClip.projectItem && insertedClip.projectItem.nodeId === adjItem.nodeId) {
                        adjClip = insertedClip;
                        break;
                    }
                }
                if (!adjClip && track.clips.numItems > 0) {
                    adjClip = track.clips[track.clips.numItems - 1];
                }
            }

            if (!adjClip) {
                return JSON.stringify({
                    success: false,
                    error: "Could not find inserted adjustment layer"
                });
            }

            // Add Lumetri Color and apply source settings
            var dstLumetri = this._getOrAddLumetriEffect(adjClip);
            if (!dstLumetri) {
                return JSON.stringify({
                    success: false,
                    error: "Could not add Lumetri Color effect to adjustment layer"
                });
            }

            var appliedSettings = this._applyLumetriSettings(dstLumetri, settings);

            return JSON.stringify({
                success: true,
                sourceClip: sourceClipName,
                adjustmentLayer: adjLayerName,
                clipsMatched: clipsToMatch,
                copiedSettings: appliedSettings,
                adjustmentLayerTrack: adjTrackIndex
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Copy color settings from one clip to create a matching adjustment layer for another
     */
    matchColorBetweenClips: function(sourceTrack, sourceClip, destTrack, destClip) {
        try {
            var srcClip = this._getTimelineClip(sourceTrack, sourceClip);
            var dstClip = this._getTimelineClip(destTrack, destClip);

            if (!srcClip) {
                return JSON.stringify({
                    success: false,
                    error: "Source clip not found"
                });
            }

            if (!dstClip) {
                return JSON.stringify({
                    success: false,
                    error: "Destination clip not found"
                });
            }

            // Get Lumetri from source
            var srcLumetri = null;
            for (var i = 0; i < srcClip.components.numItems; i++) {
                var comp = srcClip.components[i];
                if (comp.displayName === "Lumetri Color") {
                    srcLumetri = comp;
                    break;
                }
            }

            // Also check adjustment layers above source clip
            if (!srcLumetri) {
                var seq = app.project.activeSequence;
                var srcStart = parseFloat(srcClip.start.ticks);
                var srcEnd = parseFloat(srcClip.end.ticks);

                for (var t = sourceTrack + 1; t < seq.videoTracks.numTracks; t++) {
                    var track = seq.videoTracks[t];
                    for (var c = 0; c < track.clips.numItems; c++) {
                        var adjClip = track.clips[c];
                        var adjStart = parseFloat(adjClip.start.ticks);
                        var adjEnd = parseFloat(adjClip.end.ticks);

                        if (adjStart <= srcStart && adjEnd >= srcEnd) {
                            for (var i = 0; i < adjClip.components.numItems; i++) {
                                var comp = adjClip.components[i];
                                if (comp.displayName === "Lumetri Color") {
                                    srcLumetri = comp;
                                    break;
                                }
                            }
                        }
                        if (srcLumetri) break;
                    }
                    if (srcLumetri) break;
                }
            }

            if (!srcLumetri) {
                return JSON.stringify({
                    success: false,
                    error: "No Lumetri Color effect found on source clip or its adjustment layers"
                });
            }

            // Extract settings from source
            var settings = {};
            for (var i = 0; i < srcLumetri.properties.numItems; i++) {
                var prop = srcLumetri.properties[i];
                try {
                    var value = prop.getValue();
                    if (typeof value === "number") {
                        var propName = prop.displayName.toLowerCase().replace(/ /g, "_");
                        settings[propName] = value;
                    }
                } catch (e) {
                    // Skip unreadable properties
                }
            }

            // Create adjustment layer for destination
            var adjLayer = this._getOrCreateColorAdjustmentLayer(dstClip, "Match - " + srcClip.name + " to " + dstClip.name);
            if (!adjLayer) {
                return JSON.stringify({
                    success: false,
                    error: "Could not create adjustment layer for destination clip"
                });
            }

            // Apply settings to adjustment layer
            var dstLumetri = this._getOrAddLumetriEffect(adjLayer);
            if (!dstLumetri) {
                return JSON.stringify({
                    success: false,
                    error: "Could not add Lumetri Color to adjustment layer"
                });
            }

            var appliedSettings = this._applyLumetriSettings(dstLumetri, settings);

            return JSON.stringify({
                success: true,
                sourceClip: srcClip.name,
                destinationClip: dstClip.name,
                adjustmentLayer: adjLayer.name,
                copiedSettings: appliedSettings
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Apply a LUT to a timeline clip
     */
    applyLut: function(targetType, lutPath, intensity, targetPath, trackIndex, clipIndex) {
        try {
            var clip = null;
            var targetName = "";

            if (targetType === "timeline_clip") {
                clip = this._getTimelineClip(trackIndex, clipIndex);
                if (!clip) {
                    return JSON.stringify({
                        success: false,
                        error: "Clip not found at track " + trackIndex + ", index " + clipIndex
                    });
                }
                targetName = clip.name;
            } else {
                return JSON.stringify({
                    success: false,
                    error: "LUT application requires the clip to be in the timeline. Use timeline_clip targetType."
                });
            }

            // Get or add Lumetri Color effect
            var lumetri = this._getOrAddLumetriEffect(clip);
            if (!lumetri) {
                return JSON.stringify({
                    success: false,
                    error: "Could not add Lumetri Color effect."
                });
            }

            // Find the Input LUT property in Lumetri
            var lutApplied = false;
            var lutName = lutPath;

            // Extract just the filename for display
            var pathParts = lutPath.split("/");
            if (pathParts.length > 1) {
                lutName = pathParts[pathParts.length - 1];
            }
            pathParts = lutName.split("\\");
            if (pathParts.length > 1) {
                lutName = pathParts[pathParts.length - 1];
            }

            // Look for Input LUT or Creative Look property
            for (var i = 0; i < lumetri.properties.numItems; i++) {
                var prop = lumetri.properties[i];
                var propName = prop.displayName.toLowerCase();

                if (propName.indexOf("input lut") !== -1 || propName.indexOf("look") !== -1) {
                    try {
                        // Set the LUT path
                        prop.setValue(lutPath, true);
                        lutApplied = true;
                        break;
                    } catch (e) {
                        // Continue to try other properties
                    }
                }
            }

            // Apply intensity if available (usually 0-100)
            if (lutApplied && intensity !== 100) {
                for (var i = 0; i < lumetri.properties.numItems; i++) {
                    var prop = lumetri.properties[i];
                    var propName = prop.displayName.toLowerCase();
                    if (propName.indexOf("intensity") !== -1 || propName.indexOf("mix") !== -1) {
                        try {
                            prop.setValue(intensity, true);
                            break;
                        } catch (e) {
                            // Intensity property might not be available
                        }
                    }
                }
            }

            if (!lutApplied) {
                return JSON.stringify({
                    success: false,
                    error: "Could not find LUT property in Lumetri Color effect."
                });
            }

            return JSON.stringify({
                success: true,
                target: targetName,
                lutName: lutName,
                intensity: intensity
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Get current color settings from a clip
     */
    getColorSettings: function(targetType, targetPath, trackIndex, clipIndex) {
        try {
            var clip = null;
            var targetName = "";

            if (targetType === "timeline_clip") {
                clip = this._getTimelineClip(trackIndex, clipIndex);
                if (!clip) {
                    return JSON.stringify({
                        success: false,
                        error: "Clip not found at track " + trackIndex + ", index " + clipIndex
                    });
                }
                targetName = clip.name;
            } else {
                return JSON.stringify({
                    success: false,
                    error: "Getting color settings requires the clip to be in the timeline."
                });
            }

            // Look for Lumetri Color effect
            var lumetri = null;
            for (var i = 0; i < clip.components.numItems; i++) {
                var comp = clip.components[i];
                if (comp.displayName === "Lumetri Color") {
                    lumetri = comp;
                    break;
                }
            }

            if (!lumetri) {
                return JSON.stringify({
                    success: true,
                    target: targetName,
                    hasLumetri: false,
                    settings: {},
                    appliedLut: null
                });
            }

            // Extract settings
            var settings = {};
            var appliedLut = null;

            for (var i = 0; i < lumetri.properties.numItems; i++) {
                var prop = lumetri.properties[i];
                var propName = prop.displayName.toLowerCase().replace(/ /g, "_");

                try {
                    var value = prop.getValue();

                    // Check for LUT
                    if (propName.indexOf("input_lut") !== -1 || propName.indexOf("look") !== -1) {
                        if (value && value !== "") {
                            appliedLut = value;
                        }
                    }

                    // Store numeric values
                    if (typeof value === "number") {
                        settings[propName] = value;
                    }
                } catch (e) {
                    // Some properties might not be readable
                }
            }

            return JSON.stringify({
                success: true,
                target: targetName,
                hasLumetri: true,
                settings: settings,
                appliedLut: appliedLut
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    },

    /**
     * Remove color effects from a clip
     */
    removeColorEffects: function(targetType, effectType, targetPath, trackIndex, clipIndex) {
        try {
            var clip = null;
            var targetName = "";

            if (targetType === "timeline_clip") {
                clip = this._getTimelineClip(trackIndex, clipIndex);
                if (!clip) {
                    return JSON.stringify({
                        success: false,
                        error: "Clip not found at track " + trackIndex + ", index " + clipIndex
                    });
                }
                targetName = clip.name;
            } else {
                return JSON.stringify({
                    success: false,
                    error: "Removing color effects requires the clip to be in the timeline."
                });
            }

            var effectsRemoved = [];

            // Remove effects based on type
            for (var i = clip.components.numItems - 1; i >= 0; i--) {
                var comp = clip.components[i];
                var compName = comp.displayName;
                var shouldRemove = false;

                if (effectType === "all") {
                    if (compName === "Lumetri Color" ||
                        compName.indexOf("LUT") !== -1 ||
                        compName.indexOf("Color") !== -1) {
                        shouldRemove = true;
                    }
                } else if (effectType === "lumetri") {
                    if (compName === "Lumetri Color") {
                        shouldRemove = true;
                    }
                } else if (effectType === "lut") {
                    if (compName.indexOf("LUT") !== -1) {
                        shouldRemove = true;
                    }
                }

                if (shouldRemove) {
                    try {
                        clip.components.removeComponent(comp);
                        effectsRemoved.push(compName);
                    } catch (e) {
                        // Some components might not be removable
                    }
                }
            }

            return JSON.stringify({
                success: true,
                target: targetName,
                effectsRemoved: effectsRemoved
            });

        } catch (e) {
            return JSON.stringify({
                success: false,
                error: e.message || String(e)
            });
        }
    }
};

// Signal that the script is loaded
"ExtendScript loaded";
