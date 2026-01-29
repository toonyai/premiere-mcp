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
    }
};

// Signal that the script is loaded
"ExtendScript loaded";
