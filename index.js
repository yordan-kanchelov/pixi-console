(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CanvasConsoleConfig = /** @class */ (function () {
    function CanvasConsoleConfig() {
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
    return CanvasConsoleConfig;
}());
exports.default = CanvasConsoleConfig;

},{}],2:[function(require,module,exports){
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var pixi_console_config_1 = __importDefault(require("./pixi-console-config"));
var PixiConsole = /** @class */ (function (_super) {
    __extends(PixiConsole, _super);
    function PixiConsole(config) {
        var _this = _super.call(this) || this;
        PixiConsole.instance = _this;
        _this._config = new pixi_console_config_1.default();
        if (config) {
            for (var key in config) {
                if (config.hasOwnProperty(key)) {
                    _this._config[key] = config[key];
                }
            }
        }
        _this._config = config;
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
        this.setupHideButtonEvents(false);
        this.setupScrollButtonsEvents(false);
    };
    PixiConsole.prototype.init = function () {
        var background = new PIXI.Graphics();
        background.beginFill(this._config.backgroundColor, this._config.consoleAlpha);
        background.drawRect(0, 0, this._config.consoleWidth, this._config.consoleHeight);
        background.endFill();
        this.addChild(background);
        this._consoleContainer = new PIXI.Container();
        this.addChild(this._consoleContainer);
        if (this._config.addHideButton) {
            this._hideButton = this.getRect(0x68efad, 70, 70);
            this._hideButton.y = this._config.consoleHeight - this._hideButton.height - 80;
            this._hideButton.x = this._config.consoleWidth - this._hideButton.width - 150;
            this.addChild(this._hideButton);
            this.setupHideButtonEvents();
        }
        // scroll buttons
        if (this._config.addScrollButtons) {
            this._scrollDownButton = this.getTriangle(this._config.scrollButtonsColor);
            this._scrollUpButton = this.getTriangle(this._config.scrollButtonsColor);
            this._scrollUpButton.anchor.x = this._scrollUpButton.anchor.y = this._scrollDownButton.anchor.x = this._scrollDownButton.anchor.y = 0.5;
            this._scrollDownButton.x = this._config.consoleWidth - this._scrollDownButton.width - 20;
            this._scrollUpButton.x = this._config.consoleWidth - this._scrollUpButton.width - 20;
            this._scrollDownButton.y = this._config.consoleHeight - this._scrollDownButton.height;
            this._scrollUpButton.y = this._config.consoleHeight - this._scrollUpButton.height - 80;
            this._scrollDownButton.rotation += 3.15;
            this.addChild(this._scrollDownButton);
            this.addChild(this._scrollUpButton);
            this.setupScrollButtonsEvents();
        }
    };
    PixiConsole.prototype.attachToConsole = function () {
        var _this = this;
        this._origConsoleLog = console.log;
        this._origConsoleError = console.error;
        var self = this;
        if (this._config.attachConsoleLog) {
            console.log = function () {
                this.log(arguments[0]);
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
    PixiConsole.prototype.printLog = function (message) {
        this.print(message);
    };
    PixiConsole.prototype.printError = function (message) {
        this.print(message, 0xff0000);
    };
    PixiConsole.prototype.setupScrollButtonsEvents = function (on) {
        // TODO:
        // attach the proper event depending if the device is mobile or desktop
        if (on === void 0) { on = true; }
        if (on) {
            this._scrollUpButton.on("click", this.onScrollUpButtonClicked, this);
            this._scrollUpButton.on("tap", this.onScrollUpButtonClicked, this);
            this._scrollDownButton.on("click", this.onScrollDownButtonClicked, this);
            this._scrollDownButton.on("tap", this.onScrollDownButtonClicked, this);
        }
        else {
            this._scrollUpButton.off("click", this.onScrollUpButtonClicked, this);
            this._scrollUpButton.off("tap", this.onScrollUpButtonClicked, this);
            this._scrollDownButton.off("click", this.onScrollDownButtonClicked, this);
            this._scrollDownButton.off("tap", this.onScrollDownButtonClicked, this);
        }
    };
    PixiConsole.prototype.setupHideButtonEvents = function (on) {
        if (on === void 0) { on = true; }
        if (on) {
            this._hideButton.on("click", this.onHideButtonClicked, this);
            this._hideButton.on("tap", this.onHideButtonClicked, this);
        }
        else {
            this._hideButton.off("click", this.onHideButtonClicked, this);
            this._hideButton.off("tap", this.onHideButtonClicked, this);
        }
    };
    PixiConsole.prototype.onHideButtonClicked = function () {
        this.hide();
    };
    PixiConsole.prototype.onScrollDownButtonClicked = function () {
        this.scrollDown(2);
    };
    PixiConsole.prototype.onScrollUpButtonClicked = function () {
        this.scrollUp(2);
    };
    PixiConsole.prototype.getTriangle = function (color) {
        var triangle = new PIXI.Graphics();
        triangle.beginFill(color);
        triangle.moveTo(25, 0);
        triangle.lineTo(0, 75);
        triangle.lineTo(50, 75);
        triangle.endFill();
        var result = new PIXI.Sprite(triangle.generateCanvasTexture());
        result.interactive = true;
        return result;
    };
    PixiConsole.prototype.getRect = function (color, width, height) {
        var rect = new PIXI.Graphics();
        rect.beginFill(color, 1);
        rect.drawRect(0, 0, width, height);
        rect.endFill();
        var result = new PIXI.Sprite(rect.generateCanvasTexture());
        result.interactive = true;
        return result;
    };
    PixiConsole.SCROLLING_Y_STEP = 40;
    PixiConsole.TEXT_STARTING_X = 10;
    PixiConsole.TEXT_STARTING_Y = 10;
    PixiConsole.TEXT_Y_SPACING = 40;
    return PixiConsole;
}(PIXI.Container));
exports.default = PixiConsole;

},{"./pixi-console-config":1}],3:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var pixi_console_1 = __importDefault(require("./app/pixi-console"));
var pixi_console_config_1 = __importDefault(require("./app/pixi-console-config"));
exports.default = {
    PixiConsole: pixi_console_1.default,
    PixiConsoleConfig: pixi_console_config_1.default
};

},{"./app/pixi-console":2,"./app/pixi-console-config":1}]},{},[3]);
