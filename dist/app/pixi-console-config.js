"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PixiConsoleConfig = /** @class */ (function () {
    function PixiConsoleConfig() {
        this.consoleWidth = 1280;
        this.consoleHeight = 720;
        this.fontSize = 30;
        // events options
        this.showOnError = true;
        this.attachConsoleError = true;
        this.attachConsoleLog = true;
        // customization
        this.consoleAlpha = 0.2;
        this.backgroundColor = 0xffffff;
        this.defaultPrintColor = 0xffffff;
        this.defaultPrintTextSize = 30;
    }
    return PixiConsoleConfig;
}());
exports.PixiConsoleConfig = PixiConsoleConfig;
