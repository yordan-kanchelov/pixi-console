"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PixiConsoleConfig = /** @class */ (function () {
    function PixiConsoleConfig() {
        this.consoleWidth = 1280;
        this.consoleHeight = 720;
        this.consoleAlpha = 0.2;
        this.addHideButton = true;
        this.addScrollButtons = false;
        this.attachConsoleLog = true;
        this.attachConsoleError = true;
        this.backgroundColor = 0xfffff;
        this.scrollButtonsColor = 0xffff00;
        this.showOnError = true;
    }
    return PixiConsoleConfig;
}());
exports.PixiConsoleConfig = PixiConsoleConfig;
