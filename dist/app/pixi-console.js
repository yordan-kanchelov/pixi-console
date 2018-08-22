"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var pixi_console_config_1 = require("./pixi-console-config");
var PixiConsole = /** @class */ (function (_super) {
    __extends(PixiConsole, _super);
    function PixiConsole(config) {
        var _this = _super.call(this) || this;
        PixiConsole.instance = _this;
        _this._config = new pixi_console_config_1.PixiConsoleConfig();
        if (config) {
            for (var key in config) {
                if (config.hasOwnProperty(key)) {
                    _this._config[key] = config[key];
                }
            }
        }
        _this.init();
        _this.hide();
        _this.attachToConsole();
        return _this;
    }
    PixiConsole.getInstance = function () {
        if (!this.instance) {
            this.instance = new PixiConsole();
        }
        return PixiConsole.instance;
    };
    PixiConsole.prototype.show = function () {
        this.visible = true;
        return this;
    };
    PixiConsole.prototype.hide = function () {
        this.visible = false;
        return this;
    };
    // TODO:
    // default color and fontsize params should come from the config object
    PixiConsole.prototype.print = function (message, color, fontSize) {
        if (color === void 0) { color = 0xffffff; }
        if (fontSize === void 0) { fontSize = 30; }
        var text = new PIXI.Text(message, {
            fill: color,
            fontSize: fontSize,
            wordWrap: true,
            wordWrapWidth: this._config.consoleWidth - PixiConsole.TEXT_STARTING_X
        });
        var currentTextHeight = this._consoleContainer.children
            .map(function (textContainer) { return textContainer.height + PixiConsole.TEXT_Y_SPACING; })
            .reduce(function (totalHeight, currentHeight) { return totalHeight + currentHeight; }, 0);
        var textContainer = new PIXI.Container();
        textContainer.addChild(text);
        textContainer.x = PixiConsole.TEXT_STARTING_X;
        textContainer.y = PixiConsole.TEXT_STARTING_Y + currentTextHeight;
        this._consoleContainer.addChild(textContainer);
        if (PixiConsole.TEXT_STARTING_Y + currentTextHeight > this._config.consoleHeight) {
            this._consoleContainer.y = -currentTextHeight;
        }
        return this;
    };
    PixiConsole.prototype.clearConsole = function () {
        while (this._consoleContainer.children.length > 0) {
            this._consoleContainer.removeChildAt(0);
        }
        this._consoleContainer.y = 0;
        return this;
    };
    // TODO:
    // make scrollUP/Down functions pure
    PixiConsole.prototype.scrollUp = function (timesScroll) {
        if (timesScroll === void 0) { timesScroll = 1; }
        if (this._consoleContainer.y < PixiConsole.SCROLLING_Y_STEP) {
            this._consoleContainer.y += PixiConsole.SCROLLING_Y_STEP * timesScroll;
        }
        return this;
    };
    PixiConsole.prototype.scrollDown = function (timesScroll) {
        if (timesScroll === void 0) { timesScroll = 1; }
        this._consoleContainer.y -= PixiConsole.SCROLLING_Y_STEP * timesScroll;
        return this;
    };
    PixiConsole.prototype.dispose = function () {
        var self = this;
        console.log = function () {
            self._origConsoleLog.apply(this, arguments);
        };
        console.error = function () {
            self._origConsoleLog.apply(this, arguments);
        };
    };
    PixiConsole.prototype.init = function () {
        var background = new PIXI.Graphics();
        background.beginFill(this._config.backgroundColor, this._config.consoleAlpha);
        background.drawRect(0, 0, this._config.consoleWidth, this._config.consoleHeight);
        background.endFill();
        this.addChild(background);
        this._consoleContainer = new PIXI.Container();
        this.addChild(this._consoleContainer);
    };
    PixiConsole.prototype.attachToConsole = function () {
        var _this = this;
        this._origConsoleLog = console.log;
        this._origConsoleError = console.error;
        var self = this;
        if (this._config.attachConsoleLog) {
            console.log = function () {
                this.printLog.apply(this, Array.from(arguments));
                return self._origConsoleLog.apply(this, arguments);
            };
        }
        if (this._config.attachConsoleError) {
            window.addEventListener("error", function (e) {
                if (self._config.showOnError) {
                    self.show();
                }
                if (e.error.stack) {
                    _this.printError(e.message + "\n\t" + e.error.stack.split("@").join("\n\t"));
                }
                else {
                    _this.printError("Error at line - " + e.lineno + "\n\t" + e.message + "\n\t" + e.filename + "\n\t");
                }
            });
            console.error = function () {
                if (self._config.showOnError) {
                    self.show();
                }
                this.error(arguments[0]);
                return self._origConsoleError.apply(this, arguments);
            };
        }
    };
    PixiConsole.prototype.printLog = function () {
        var _this = this;
        var messages = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            messages[_i] = arguments[_i];
        }
        messages.forEach(function (message) {
            _this.print(message, 0xffffff, _this._config.fontSize);
        });
    };
    PixiConsole.prototype.printError = function (message) {
        this.print(message, 0xff0000, this._config.fontSize);
    };
    // TODO:
    // make those properties editable
    PixiConsole.SCROLLING_Y_STEP = 40;
    PixiConsole.TEXT_STARTING_X = 10;
    PixiConsole.TEXT_STARTING_Y = 10;
    PixiConsole.TEXT_Y_SPACING = 10;
    return PixiConsole;
}(PIXI.Container));
exports.PixiConsole = PixiConsole;
