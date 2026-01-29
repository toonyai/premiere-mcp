/**
 * CSInterface - Adobe CEP interface wrapper
 * This is a minimal implementation for the MCP Bridge panel
 */

function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
    if (callback === null || callback === undefined) {
        callback = function() {};
    }

    // Use the native CEP evalScript
    if (typeof __adobe_cep__ !== "undefined") {
        __adobe_cep__.evalScript(script, callback);
    } else {
        console.warn("CEP not available - running in standalone mode");
        callback("CEP not available");
    }
};

CSInterface.prototype.getSystemPath = function(pathType) {
    var path = "";
    if (typeof __adobe_cep__ !== "undefined") {
        path = __adobe_cep__.getSystemPath(pathType);
    }
    return path;
};

CSInterface.prototype.getHostEnvironment = function() {
    if (typeof __adobe_cep__ !== "undefined") {
        return JSON.parse(__adobe_cep__.getHostEnvironment());
    }
    return {
        appName: "PPRO",
        appVersion: "0.0.0",
        appLocale: "en_US"
    };
};

// System path types
CSInterface.EXTENSION_ID = "extensionId";
CSInterface.SYSTEM_PATH = {
    EXTENSION: "extension",
    USER_DATA: "userData",
    HOST_APPLICATION: "hostApplication"
};

// Export for use in other scripts
window.CSInterface = CSInterface;
