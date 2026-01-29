/**
 * Main panel script for MCP Bridge
 */

(function() {
    var csInterface = new CSInterface();
    var PORT = 8847;

    // UI update functions (called from websocket-server.js)
    window.setConnectionStatus = function(status) {
        var statusEl = document.getElementById("status");
        statusEl.className = "status " + status;
        statusEl.querySelector(".text").textContent =
            status.charAt(0).toUpperCase() + status.slice(1);
    };

    window.updateCommandCount = function(count) {
        document.getElementById("commandCount").textContent = count;
    };

    window.addLogEntry = function(message, type) {
        var log = document.getElementById("log");
        var entry = document.createElement("div");
        entry.className = "log-entry " + (type || "info");

        var time = new Date().toLocaleTimeString();
        entry.textContent = "[" + time + "] " + message;

        log.insertBefore(entry, log.firstChild);

        // Keep only last 50 entries
        while (log.children.length > 50) {
            log.removeChild(log.lastChild);
        }
    };

    // Load ExtendScript
    function loadJSX() {
        var extensionPath = csInterface.getSystemPath("extension");

        // Load the ExtendScript file
        var jsxPath = extensionPath + "/jsx/premiere.jsx";

        csInterface.evalScript('$.evalFile("' + jsxPath.replace(/\\/g, "/") + '")', function(result) {
            if (result === "EvalScript error.") {
                addLogEntry("Failed to load ExtendScript", "error");
            } else {
                addLogEntry("ExtendScript loaded", "success");
            }
        });
    }

    // Initialize
    function init() {
        document.getElementById("port").textContent = PORT;

        // Load ExtendScript
        loadJSX();

        // Start WebSocket server
        setTimeout(function() {
            MCPBridge.start(csInterface, PORT);
        }, 500);

        addLogEntry("Panel initialized", "info");
    }

    // Start when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Cleanup on unload
    window.addEventListener("beforeunload", function() {
        MCPBridge.stop();
    });
})();
