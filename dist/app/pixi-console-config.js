"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PixiConsoleConfig = /** @class */ (function () {
    function PixiConsoleConfig() {
        this.consoleWidth = 1280;
        this.consoleHeight = 720;
        this.fontSize = 30;
        // additional buttons
        this.addScrollButtons = false;
        this.addHideButton = true;
        // events options
        this.showOnError = true;
        this.attachConsoleError = true;
        this.attachConsoleLog = true;
        // customization
        this.consoleAlpha = 0.2;
        this.backgroundColor = 0xfffff;
        this.scrollButtonsColor = 0xffff00;
    }
    return PixiConsoleConfig;
}());
exports.PixiConsoleConfig = PixiConsoleConfig;
