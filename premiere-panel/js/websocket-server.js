/**
 * WebSocket server for MCP Bridge
 * Runs in the CEP panel's Node.js context
 */

(function() {
    // Node.js modules (available in CEP panels with --enable-nodejs)
    var WebSocket;
    var http;

    try {
        WebSocket = require("ws");
        http = require("http");
    } catch (e) {
        console.warn("Node.js modules not available - running in standalone mode");
        window.MCPBridge = {
            start: function() { console.log("Bridge not available"); },
            stop: function() {},
            isRunning: function() { return false; },
            getCommandCount: function() { return 0; }
        };
        return;
    }

    var DEFAULT_PORT = 8847;
    var server = null;
    var wss = null;
    var clients = new Set();
    var commandCount = 0;
    var csInterface = null;

    // Command handlers
    function handleCommand(command, client) {
        commandCount++;
        updateUI();

        var response = {
            id: command.id,
            success: false,
            data: null,
            error: null
        };

        try {
            switch (command.type) {
                case "ping":
                    response.success = true;
                    response.data = { pong: true };
                    sendResponse(client, response);
                    break;

                case "getProjectInfo":
                    evalScript("getProjectInfo()", function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = true;
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "insertClip":
                    var p = command.params;
                    var script = "insertClipToTimeline('" +
                        escapeString(p.projectItemPath) + "', " +
                        p.inPoint + ", " +
                        p.outPoint + ", " +
                        p.timelinePosition + ", " +
                        p.videoTrack + ", " +
                        p.audioTrack + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "overwriteClip":
                    var p = command.params;
                    var script = "overwriteClipToTimeline('" +
                        escapeString(p.projectItemPath) + "', " +
                        p.inPoint + ", " +
                        p.outPoint + ", " +
                        p.timelinePosition + ", " +
                        p.videoTrack + ", " +
                        p.audioTrack + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "findProjectItem":
                    var script = "findProjectItemExists('" +
                        escapeString(command.params.itemPath) + "')";

                    evalScript(script, function(result) {
                        response.data = result === "true";
                        response.success = true;
                        sendResponse(client, response);
                    });
                    break;

                case "applyColorCorrection":
                    var p = command.params;
                    var script = "applyColorCorrection('" +
                        escapeString(p.targetType) + "', '" +
                        escapeString(JSON.stringify(p.corrections)) + "', " +
                        (p.targetPath ? "'" + escapeString(p.targetPath) + "'" : "null") + ", " +
                        (p.trackIndex !== undefined ? p.trackIndex : "null") + ", " +
                        (p.clipIndex !== undefined ? p.clipIndex : "null") + ", " +
                        (p.useAdjustmentLayer !== false ? "true" : "false") + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "applyColorCorrectionToRange":
                    var p = command.params;
                    var script = "applyColorCorrectionToRange(" +
                        p.startTrack + ", " +
                        p.startClip + ", " +
                        p.endTrack + ", " +
                        p.endClip + ", '" +
                        escapeString(JSON.stringify(p.corrections)) + "', " +
                        (p.layerName ? "'" + escapeString(p.layerName) + "'" : "null") + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "matchColor":
                    var p = command.params;
                    var script = "matchColorBetweenClips(" +
                        p.sourceTrack + ", " +
                        p.sourceClip + ", " +
                        p.destTrack + ", " +
                        p.destClip + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "matchColorToAll":
                    var p = command.params;
                    var script = "matchColorToAll('" +
                        escapeString(p.sourceClipName) + "')";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "applyLut":
                    var p = command.params;
                    var script = "applyLut('" +
                        escapeString(p.targetType) + "', '" +
                        escapeString(p.lutPath) + "', " +
                        (p.intensity || 100) + ", " +
                        (p.targetPath ? "'" + escapeString(p.targetPath) + "'" : "null") + ", " +
                        (p.trackIndex !== undefined ? p.trackIndex : "null") + ", " +
                        (p.clipIndex !== undefined ? p.clipIndex : "null") + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "getColorSettings":
                    var p = command.params;
                    var script = "getColorSettings('" +
                        escapeString(p.targetType) + "', " +
                        (p.targetPath ? "'" + escapeString(p.targetPath) + "'" : "null") + ", " +
                        (p.trackIndex !== undefined ? p.trackIndex : "null") + ", " +
                        (p.clipIndex !== undefined ? p.clipIndex : "null") + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                case "removeColorEffects":
                    var p = command.params;
                    var script = "removeColorEffects('" +
                        escapeString(p.targetType) + "', '" +
                        escapeString(p.effectType || "all") + "', " +
                        (p.targetPath ? "'" + escapeString(p.targetPath) + "'" : "null") + ", " +
                        (p.trackIndex !== undefined ? p.trackIndex : "null") + ", " +
                        (p.clipIndex !== undefined ? p.clipIndex : "null") + ")";

                    evalScript(script, function(result) {
                        try {
                            response.data = JSON.parse(result);
                            response.success = response.data.success !== false;
                            if (!response.success) {
                                response.error = response.data.error;
                            }
                        } catch (e) {
                            response.error = result || e.message;
                        }
                        sendResponse(client, response);
                    });
                    break;

                default:
                    response.error = "Unknown command type: " + command.type;
                    sendResponse(client, response);
            }
        } catch (e) {
            response.error = e.message;
            sendResponse(client, response);
        }
    }

    function evalScript(script, callback) {
        if (csInterface) {
            csInterface.evalScript("$._PPRO_MCP_." + script, callback);
        } else {
            callback("CSInterface not initialized");
        }
    }

    function escapeString(str) {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }

    function sendResponse(client, response) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(response));
        }
    }

    function log(message, type) {
        type = type || "info";
        if (window.addLogEntry) {
            window.addLogEntry(message, type);
        }
        console.log("[MCPBridge]", message);
    }

    function updateUI() {
        if (window.updateCommandCount) {
            window.updateCommandCount(commandCount);
        }
    }

    function setStatus(status) {
        if (window.setConnectionStatus) {
            window.setConnectionStatus(status);
        }
    }

    // Public API
    window.MCPBridge = {
        start: function(cs, port) {
            port = port || DEFAULT_PORT;
            csInterface = cs;

            if (server) {
                log("Server already running", "info");
                return;
            }

            try {
                server = http.createServer();
                wss = new WebSocket.Server({ server: server });

                wss.on("connection", function(ws) {
                    clients.add(ws);
                    log("Client connected (" + clients.size + " total)", "success");
                    setStatus("connected");

                    ws.on("message", function(data) {
                        try {
                            var command = JSON.parse(data.toString());
                            handleCommand(command, ws);
                        } catch (e) {
                            log("Invalid message: " + e.message, "error");
                        }
                    });

                    ws.on("close", function() {
                        clients.delete(ws);
                        log("Client disconnected (" + clients.size + " remaining)", "info");
                        if (clients.size === 0) {
                            setStatus("disconnected");
                        }
                    });

                    ws.on("error", function(err) {
                        log("Client error: " + err.message, "error");
                    });
                });

                server.listen(port, function() {
                    log("WebSocket server started on port " + port, "success");
                    setStatus("connecting");
                });

                server.on("error", function(err) {
                    log("Server error: " + err.message, "error");
                    setStatus("disconnected");
                });

            } catch (e) {
                log("Failed to start server: " + e.message, "error");
                setStatus("disconnected");
            }
        },

        stop: function() {
            if (wss) {
                clients.forEach(function(client) {
                    client.close();
                });
                clients.clear();
                wss.close();
                wss = null;
            }
            if (server) {
                server.close();
                server = null;
            }
            setStatus("disconnected");
            log("Server stopped", "info");
        },

        isRunning: function() {
            return server !== null;
        },

        getCommandCount: function() {
            return commandCount;
        },

        getClientCount: function() {
            return clients.size;
        }
    };
})();
