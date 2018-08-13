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
        this.attachConsoleLog = false;
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
        if (!config) {
            config = new pixi_console_config_1.default();
        }
        _this.config = config;
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
            wordWrapWidth: this.config.consoleWidth - PixiConsole.TEXT_STARTING_X
        });
        var currentTextHeight = this.consoleContainer.children
            .map(function (textContainer) { return textContainer.height + PixiConsole.TEXT_Y_SPACING; })
            .reduce(function (totalHeight, currentHeight) { return totalHeight + currentHeight; }, 0);
        var textContainer = new PIXI.Container();
        textContainer.addChild(text);
        textContainer.x = PixiConsole.TEXT_STARTING_X;
        textContainer.y = PixiConsole.TEXT_STARTING_Y + currentTextHeight;
        this.consoleContainer.addChild(textContainer);
        if (PixiConsole.TEXT_STARTING_Y + currentTextHeight > this.config.consoleHeight) {
            this.consoleContainer.y = -currentTextHeight;
        }
        return this;
    };
    PixiConsole.prototype.clearConsole = function () {
        while (this.consoleContainer.children.length > 0) {
            this.consoleContainer.removeChildAt(0);
        }
        this.consoleContainer.y = 0;
        return this;
    };
    PixiConsole.prototype.scrollUp = function (timesScroll) {
        if (timesScroll === void 0) { timesScroll = 1; }
        if (this.consoleContainer.y < PixiConsole.SCROLLING_Y_STEP) {
            this.consoleContainer.y += PixiConsole.SCROLLING_Y_STEP * timesScroll;
        }
        return this;
    };
    PixiConsole.prototype.scrollDown = function (timesScroll) {
        if (timesScroll === void 0) { timesScroll = 1; }
        this.consoleContainer.y -= PixiConsole.SCROLLING_Y_STEP * timesScroll;
        return this;
    };
    PixiConsole.prototype.dispose = function () {
        // TODO:
        // return the default behavior of console.log & error
        this.setupHideButtonEvents(false);
        this.setupScrollButtonsEvents(false);
    };
    PixiConsole.prototype.init = function () {
        var background = new PIXI.Graphics();
        background.beginFill(this.config.backgroundColor, this.config.consoleAlpha);
        background.drawRect(0, 0, this.config.consoleWidth, this.config.consoleHeight);
        background.endFill();
        this.addChild(background);
        this.consoleContainer = new PIXI.Container();
        this.addChild(this.consoleContainer);
        if (this.config.addHideButton) {
            this.hideButton = this.getRect(0x68efad, 70, 70);
            this.hideButton.y = this.config.consoleHeight - this.hideButton.height - 80;
            this.hideButton.x = this.config.consoleWidth - this.hideButton.width - 150;
            this.addChild(this.hideButton);
            this.setupHideButtonEvents();
        }
        // scroll buttons
        if (this.config.addScrollButtons) {
            this.scrollDownButton = this.getTriangle(this.config.scrollButtonsColor);
            this.scrollUpButton = this.getTriangle(this.config.scrollButtonsColor);
            this.scrollUpButton.anchor.x = this.scrollUpButton.anchor.y = this.scrollDownButton.anchor.x = this.scrollDownButton.anchor.y = 0.5;
            this.scrollDownButton.x = this.config.consoleWidth - this.scrollDownButton.width - 20;
            this.scrollUpButton.x = this.config.consoleWidth - this.scrollUpButton.width - 20;
            this.scrollDownButton.y = this.config.consoleHeight - this.scrollDownButton.height;
            this.scrollUpButton.y = this.config.consoleHeight - this.scrollUpButton.height - 80;
            this.scrollDownButton.rotation += 3.15;
            this.addChild(this.scrollDownButton);
            this.addChild(this.scrollUpButton);
            this.setupScrollButtonsEvents();
        }
    };
    PixiConsole.prototype.attachToConsole = function () {
        var _this = this;
        var origLog = console.log;
        var origError = console.error;
        var self = this;
        if (this.config.attachConsoleLog) {
            console.log = function () {
                this.log(arguments[0]);
                return origLog.apply(this, arguments);
            };
        }
        if (this.config.attachConsoleError) {
            window.addEventListener("error", function (e) {
                if (self.config.showOnError) {
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
                if (self.config.showOnError) {
                    self.show();
                }
                this.error(arguments[0]);
                return origError.apply(this, arguments);
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
            this.scrollUpButton.on("click", this.onScrollUpButtonClicked, this);
            this.scrollUpButton.on("tap", this.onScrollUpButtonClicked, this);
            this.scrollDownButton.on("click", this.onScrollDownButtonClicked, this);
            this.scrollDownButton.on("tap", this.onScrollDownButtonClicked, this);
        }
        else {
            this.scrollUpButton.off("click", this.onScrollUpButtonClicked, this);
            this.scrollUpButton.off("tap", this.onScrollUpButtonClicked, this);
            this.scrollDownButton.off("click", this.onScrollDownButtonClicked, this);
            this.scrollDownButton.off("tap", this.onScrollDownButtonClicked, this);
        }
    };
    PixiConsole.prototype.setupHideButtonEvents = function (on) {
        if (on === void 0) { on = true; }
        if (on) {
            this.hideButton.on("click", this.onHideButtonClicked, this);
            this.hideButton.on("tap", this.onHideButtonClicked, this);
        }
        else {
            this.hideButton.off("click", this.onHideButtonClicked, this);
            this.hideButton.off("tap", this.onHideButtonClicked, this);
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

},{"./app/pixi-console":2,"./app/pixi-console-config":1}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYXBwL3BpeGktY29uc29sZS1jb25maWcudHMiLCJzcmMvYXBwL3BpeGktY29uc29sZS50cyIsInNyYy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O0FDQUE7SUFBQTtRQUNJLGlCQUFZLEdBQVcsSUFBSSxDQUFDO1FBQzVCLGtCQUFhLEdBQVcsR0FBRyxDQUFDO1FBQzVCLGlCQUFZLEdBQVcsR0FBRyxDQUFDO1FBQzNCLGtCQUFhLEdBQVksSUFBSSxDQUFDO1FBQzlCLHFCQUFnQixHQUFZLEtBQUssQ0FBQztRQUNsQyxxQkFBZ0IsR0FBWSxLQUFLLENBQUM7UUFDbEMsdUJBQWtCLEdBQVksSUFBSSxDQUFDO1FBQ25DLG9CQUFlLEdBQVcsT0FBTyxDQUFDO1FBQ2xDLHVCQUFrQixHQUFXLFFBQVEsQ0FBQztRQUN0QyxnQkFBVyxHQUFZLElBQUksQ0FBQztJQUNoQyxDQUFDO0lBQUQsMEJBQUM7QUFBRCxDQVhBLEFBV0MsSUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ1hELDhFQUFrRDtBQUVsRDtJQUF5QywrQkFBYztJQWdCbkQscUJBQVksTUFBc0I7UUFBbEMsWUFDSSxpQkFBTyxTQWFWO1FBWEcsV0FBVyxDQUFDLFFBQVEsR0FBRyxLQUFJLENBQUM7UUFFNUIsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNULE1BQU0sR0FBRyxJQUFJLDZCQUFhLEVBQUUsQ0FBQztTQUNoQztRQUVELEtBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLEtBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNaLEtBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNaLEtBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzs7SUFDM0IsQ0FBQztJQUVNLHVCQUFXLEdBQWxCO1FBQ0ksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDaEIsSUFBSSxDQUFDLFFBQVEsR0FB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QUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBRTFCLE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFoUXVCLDRCQUFnQixHQUFHLEVBQUUsQ0FBQztJQUN0QiwyQkFBZSxHQUFHLEVBQUUsQ0FBQztJQUNyQiwyQkFBZSxHQUFHLEVBQUUsQ0FBQztJQUNyQiwwQkFBYyxHQUFHLEVBQUUsQ0FBQztJQThQaEQsa0JBQUM7Q0FsUUQsQUFrUUMsQ0FsUXdDLElBQUksQ0FBQyxTQUFTLEdBa1F0RDtrQkFsUW9CLFdBQVc7Ozs7Ozs7O0FDRmhDLG9FQUE2QztBQUM3QyxrRkFBMEQ7QUFFMUQsa0JBQWU7SUFDWCxXQUFXLHdCQUFBO0lBQ1gsaUJBQWlCLCtCQUFBO0NBQ3BCLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBDYW52YXNDb25zb2xlQ29uZmlnIHtcbiAgICBjb25zb2xlV2lkdGg6IG51bWJlciA9IDEyODA7XG4gICAgY29uc29sZUhlaWdodDogbnVtYmVyID0gNzIwO1xuICAgIGNvbnNvbGVBbHBoYTogbnVtYmVyID0gMC4yO1xuICAgIGFkZEhpZGVCdXR0b246IGJvb2xlYW4gPSB0cnVlO1xuICAgIGFkZFNjcm9sbEJ1dHRvbnM6IGJvb2xlYW4gPSBmYWxzZTtcbiAgICBhdHRhY2hDb25zb2xlTG9nOiBib29sZWFuID0gZmFsc2U7XG4gICAgYXR0YWNoQ29uc29sZUVycm9yOiBib29sZWFuID0gdHJ1ZTtcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IG51bWJlciA9IDB4ZmZmZmY7XG4gICAgc2Nyb2xsQnV0dG9uc0NvbG9yOiBudW1iZXIgPSAweGZmZmYwMDtcbiAgICBzaG93T25FcnJvcjogYm9vbGVhbiA9IHRydWU7XG59XG4iLCJpbXBvcnQgQ29uc29sZUNvbmZpZyBmcm9tIFwiLi9waXhpLWNvbnNvbGUtY29uZmlnXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFBpeGlDb25zb2xlIGV4dGVuZHMgUElYSS5Db250YWluZXIge1xuICAgIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNDUk9MTElOR19ZX1NURVAgPSA0MDtcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhUX1NUQVJUSU5HX1ggPSAxMDtcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhUX1NUQVJUSU5HX1kgPSAxMDtcbiAgICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhUX1lfU1BBQ0lORyA9IDQwO1xuXG4gICAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IFBpeGlDb25zb2xlO1xuXG4gICAgcHJpdmF0ZSBjb25zb2xlQ29udGFpbmVyOiBQSVhJLkNvbnRhaW5lcjtcblxuICAgIHByaXZhdGUgY29uZmlnOiBDb25zb2xlQ29uZmlnO1xuXG4gICAgcHJpdmF0ZSBzY3JvbGxEb3duQnV0dG9uOiBQSVhJLlNwcml0ZTtcbiAgICBwcml2YXRlIHNjcm9sbFVwQnV0dG9uOiBQSVhJLlNwcml0ZTtcbiAgICBwcml2YXRlIGhpZGVCdXR0b246IFBJWEkuU3ByaXRlO1xuXG4gICAgY29uc3RydWN0b3IoY29uZmlnPzogQ29uc29sZUNvbmZpZykge1xuICAgICAgICBzdXBlcigpO1xuXG4gICAgICAgIFBpeGlDb25zb2xlLmluc3RhbmNlID0gdGhpcztcblxuICAgICAgICBpZiAoIWNvbmZpZykge1xuICAgICAgICAgICAgY29uZmlnID0gbmV3IENvbnNvbGVDb25maWcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgICAgIHRoaXMuaW5pdCgpO1xuICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICAgICAgdGhpcy5hdHRhY2hUb0NvbnNvbGUoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogUGl4aUNvbnNvbGUge1xuICAgICAgICBpZiAoIXRoaXMuaW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRoaXMuaW5zdGFuY2UgPSBuZXcgUGl4aUNvbnNvbGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBQaXhpQ29uc29sZS5pbnN0YW5jZTtcbiAgICB9XG5cbiAgICBzaG93KCk6IFBpeGlDb25zb2xlIHtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gdHJ1ZTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBoaWRlKCk6IFBpeGlDb25zb2xlIHtcbiAgICAgICAgdGhpcy52aXNpYmxlID0gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcHJpbnQobWVzc2FnZTogc3RyaW5nLCBjb2xvcjogbnVtYmVyID0gMHhmZmZmZmYsIGZvbnRTaXplOiBudW1iZXIgPSAzMCk6IFBpeGlDb25zb2xlIHtcbiAgICAgICAgbGV0IHRleHQgPSBuZXcgUElYSS5UZXh0KG1lc3NhZ2UsIHtcbiAgICAgICAgICAgIGZpbGw6IGNvbG9yLFxuICAgICAgICAgICAgZm9udFNpemU6IGZvbnRTaXplLFxuICAgICAgICAgICAgd29yZFdyYXA6IHRydWUsXG4gICAgICAgICAgICB3b3JkV3JhcFdpZHRoOiB0aGlzLmNvbmZpZy5jb25zb2xlV2lkdGggLSBQaXhpQ29uc29sZS5URVhUX1NUQVJUSU5HX1hcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGN1cnJlbnRUZXh0SGVpZ2h0ID0gdGhpcy5jb25zb2xlQ29udGFpbmVyLmNoaWxkcmVuXG4gICAgICAgICAgICAubWFwKHRleHRDb250YWluZXIgPT4gKHRleHRDb250YWluZXIgYXMgUElYSS5Db250YWluZXIpLmhlaWdodCArIFBpeGlDb25zb2xlLlRFWFRfWV9TUEFDSU5HKVxuICAgICAgICAgICAgLnJlZHVjZSgodG90YWxIZWlnaHQsIGN1cnJlbnRIZWlnaHQpID0+IHRvdGFsSGVpZ2h0ICsgY3VycmVudEhlaWdodCwgMCk7XG5cbiAgICAgICAgbGV0IHRleHRDb250YWluZXIgPSBuZXcgUElYSS5Db250YWluZXIoKTtcbiAgICAgICAgdGV4dENvbnRhaW5lci5hZGRDaGlsZCh0ZXh0KTtcbiAgICAgICAgdGV4dENvbnRhaW5lci54ID0gUGl4aUNvbnNvbGUuVEVYVF9TVEFSVElOR19YO1xuICAgICAgICB0ZXh0Q29udGFpbmVyLnkgPSBQaXhpQ29uc29sZS5URVhUX1NUQVJUSU5HX1kgKyBjdXJyZW50VGV4dEhlaWdodDtcblxuICAgICAgICB0aGlzLmNvbnNvbGVDb250YWluZXIuYWRkQ2hpbGQodGV4dENvbnRhaW5lcik7XG5cbiAgICAgICAgaWYgKFBpeGlDb25zb2xlLlRFWFRfU1RBUlRJTkdfWSArIGN1cnJlbnRUZXh0SGVpZ2h0ID4gdGhpcy5jb25maWcuY29uc29sZUhlaWdodCkge1xuICAgICAgICAgICAgdGhpcy5jb25zb2xlQ29udGFpbmVyLnkgPSAtY3VycmVudFRleHRIZWlnaHQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBjbGVhckNvbnNvbGUoKTogUGl4aUNvbnNvbGUge1xuICAgICAgICB3aGlsZSAodGhpcy5jb25zb2xlQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuY29uc29sZUNvbnRhaW5lci5yZW1vdmVDaGlsZEF0KDApO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY29uc29sZUNvbnRhaW5lci55ID0gMDtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBzY3JvbGxVcCh0aW1lc1Njcm9sbDogbnVtYmVyID0gMSk6IFBpeGlDb25zb2xlIHtcbiAgICAgICAgaWYgKHRoaXMuY29uc29sZUNvbnRhaW5lci55IDwgUGl4aUNvbnNvbGUuU0NST0xMSU5HX1lfU1RFUCkge1xuICAgICAgICAgICAgdGhpcy5jb25zb2xlQ29udGFpbmVyLnkgKz0gUGl4aUNvbnNvbGUuU0NST0xMSU5HX1lfU1RFUCAqIHRpbWVzU2Nyb2xsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2Nyb2xsRG93bih0aW1lc1Njcm9sbDogbnVtYmVyID0gMSk6IFBpeGlDb25zb2xlIHtcbiAgICAgICAgdGhpcy5jb25zb2xlQ29udGFpbmVyLnkgLT0gUGl4aUNvbnNvbGUuU0NST0xMSU5HX1lfU1RFUCAqIHRpbWVzU2Nyb2xsO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOlxuICAgICAgICAvLyByZXR1cm4gdGhlIGRlZmF1bHQgYmVoYXZpb3Igb2YgY29uc29sZS5sb2cgJiBlcnJvclxuXG4gICAgICAgIHRoaXMuc2V0dXBIaWRlQnV0dG9uRXZlbnRzKGZhbHNlKTtcbiAgICAgICAgdGhpcy5zZXR1cFNjcm9sbEJ1dHRvbnNFdmVudHMoZmFsc2UpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5pdCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGJhY2tncm91bmQ6IFBJWEkuR3JhcGhpY3MgPSBuZXcgUElYSS5HcmFwaGljcygpO1xuICAgICAgICBiYWNrZ3JvdW5kLmJlZ2luRmlsbCh0aGlzLmNvbmZpZy5iYWNrZ3JvdW5kQ29sb3IsIHRoaXMuY29uZmlnLmNvbnNvbGVBbHBoYSk7XG4gICAgICAgIGJhY2tncm91bmQuZHJhd1JlY3QoMCwgMCwgdGhpcy5jb25maWcuY29uc29sZVdpZHRoLCB0aGlzLmNvbmZpZy5jb25zb2xlSGVpZ2h0KTtcbiAgICAgICAgYmFja2dyb3VuZC5lbmRGaWxsKCk7XG4gICAgICAgIHRoaXMuYWRkQ2hpbGQoYmFja2dyb3VuZCk7XG5cbiAgICAgICAgdGhpcy5jb25zb2xlQ29udGFpbmVyID0gbmV3IFBJWEkuQ29udGFpbmVyKCk7XG5cbiAgICAgICAgdGhpcy5hZGRDaGlsZCh0aGlzLmNvbnNvbGVDb250YWluZXIpO1xuXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5hZGRIaWRlQnV0dG9uKSB7XG4gICAgICAgICAgICB0aGlzLmhpZGVCdXR0b24gPSB0aGlzLmdldFJlY3QoMHg2OGVmYWQsIDcwLCA3MCk7XG4gICAgICAgICAgICB0aGlzLmhpZGVCdXR0b24ueSA9IHRoaXMuY29uZmlnLmNvbnNvbGVIZWlnaHQgLSB0aGlzLmhpZGVCdXR0b24uaGVpZ2h0IC0gODA7XG4gICAgICAgICAgICB0aGlzLmhpZGVCdXR0b24ueCA9IHRoaXMuY29uZmlnLmNvbnNvbGVXaWR0aCAtIHRoaXMuaGlkZUJ1dHRvbi53aWR0aCAtIDE1MDtcbiAgICAgICAgICAgIHRoaXMuYWRkQ2hpbGQodGhpcy5oaWRlQnV0dG9uKTtcblxuICAgICAgICAgICAgdGhpcy5zZXR1cEhpZGVCdXR0b25FdmVudHMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHNjcm9sbCBidXR0b25zXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5hZGRTY3JvbGxCdXR0b25zKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbERvd25CdXR0b24gPSB0aGlzLmdldFRyaWFuZ2xlKHRoaXMuY29uZmlnLnNjcm9sbEJ1dHRvbnNDb2xvcik7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFVwQnV0dG9uID0gdGhpcy5nZXRUcmlhbmdsZSh0aGlzLmNvbmZpZy5zY3JvbGxCdXR0b25zQ29sb3IpO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxVcEJ1dHRvbi5hbmNob3IueCA9IHRoaXMuc2Nyb2xsVXBCdXR0b24uYW5jaG9yLnkgPSB0aGlzLnNjcm9sbERvd25CdXR0b24uYW5jaG9yLnggPSB0aGlzLnNjcm9sbERvd25CdXR0b24uYW5jaG9yLnkgPSAwLjU7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsRG93bkJ1dHRvbi54ID0gdGhpcy5jb25maWcuY29uc29sZVdpZHRoIC0gdGhpcy5zY3JvbGxEb3duQnV0dG9uLndpZHRoIC0gMjA7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFVwQnV0dG9uLnggPSB0aGlzLmNvbmZpZy5jb25zb2xlV2lkdGggLSB0aGlzLnNjcm9sbFVwQnV0dG9uLndpZHRoIC0gMjA7XG5cbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsRG93bkJ1dHRvbi55ID0gdGhpcy5jb25maWcuY29uc29sZUhlaWdodCAtIHRoaXMuc2Nyb2xsRG93bkJ1dHRvbi5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFVwQnV0dG9uLnkgPSB0aGlzLmNvbmZpZy5jb25zb2xlSGVpZ2h0IC0gdGhpcy5zY3JvbGxVcEJ1dHRvbi5oZWlnaHQgLSA4MDtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsRG93bkJ1dHRvbi5yb3RhdGlvbiArPSAzLjE1O1xuXG4gICAgICAgICAgICB0aGlzLmFkZENoaWxkKHRoaXMuc2Nyb2xsRG93bkJ1dHRvbik7XG4gICAgICAgICAgICB0aGlzLmFkZENoaWxkKHRoaXMuc2Nyb2xsVXBCdXR0b24pO1xuXG4gICAgICAgICAgICB0aGlzLnNldHVwU2Nyb2xsQnV0dG9uc0V2ZW50cygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhdHRhY2hUb0NvbnNvbGUoKTogdm9pZCB7XG4gICAgICAgIGxldCBvcmlnTG9nID0gY29uc29sZS5sb2c7XG4gICAgICAgIGxldCBvcmlnRXJyb3IgPSBjb25zb2xlLmVycm9yO1xuICAgICAgICBsZXQgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmF0dGFjaENvbnNvbGVMb2cpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2coYXJndW1lbnRzWzBdKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnTG9nLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmF0dGFjaENvbnNvbGVFcnJvcikge1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCBlID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZi5jb25maWcuc2hvd09uRXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5zaG93KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGUuZXJyb3Iuc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmludEVycm9yKGUubWVzc2FnZSArIFwiXFxuXFx0XCIgKyBlLmVycm9yLnN0YWNrLnNwbGl0KFwiQFwiKS5qb2luKFwiXFxuXFx0XCIpKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByaW50RXJyb3IoYEVycm9yIGF0IGxpbmUgLSAke2UubGluZW5vfVxcblxcdCR7ZS5tZXNzYWdlfVxcblxcdCR7ZS5maWxlbmFtZX1cXG5cXHRgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc29sZS5lcnJvciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmIChzZWxmLmNvbmZpZy5zaG93T25FcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLnNob3coKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmVycm9yKGFyZ3VtZW50c1swXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdFcnJvci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgcHJpbnRMb2cobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMucHJpbnQobWVzc2FnZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBwcmludEVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLnByaW50KG1lc3NhZ2UsIDB4ZmYwMDAwKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNldHVwU2Nyb2xsQnV0dG9uc0V2ZW50cyhvbjogYm9vbGVhbiA9IHRydWUpIHtcbiAgICAgICAgLy8gVE9ETzpcbiAgICAgICAgLy8gYXR0YWNoIHRoZSBwcm9wZXIgZXZlbnQgZGVwZW5kaW5nIGlmIHRoZSBkZXZpY2UgaXMgbW9iaWxlIG9yIGRlc2t0b3BcblxuICAgICAgICBpZiAob24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVXBCdXR0b24ub24oXCJjbGlja1wiLCB0aGlzLm9uU2Nyb2xsVXBCdXR0b25DbGlja2VkLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVXBCdXR0b24ub24oXCJ0YXBcIiwgdGhpcy5vblNjcm9sbFVwQnV0dG9uQ2xpY2tlZCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbERvd25CdXR0b24ub24oXCJjbGlja1wiLCB0aGlzLm9uU2Nyb2xsRG93bkJ1dHRvbkNsaWNrZWQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxEb3duQnV0dG9uLm9uKFwidGFwXCIsIHRoaXMub25TY3JvbGxEb3duQnV0dG9uQ2xpY2tlZCwgdGhpcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFVwQnV0dG9uLm9mZihcImNsaWNrXCIsIHRoaXMub25TY3JvbGxVcEJ1dHRvbkNsaWNrZWQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxVcEJ1dHRvbi5vZmYoXCJ0YXBcIiwgdGhpcy5vblNjcm9sbFVwQnV0dG9uQ2xpY2tlZCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbERvd25CdXR0b24ub2ZmKFwiY2xpY2tcIiwgdGhpcy5vblNjcm9sbERvd25CdXR0b25DbGlja2VkLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsRG93bkJ1dHRvbi5vZmYoXCJ0YXBcIiwgdGhpcy5vblNjcm9sbERvd25CdXR0b25DbGlja2VkLCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgc2V0dXBIaWRlQnV0dG9uRXZlbnRzKG9uOiBib29sZWFuID0gdHJ1ZSkge1xuICAgICAgICBpZiAob24pIHtcbiAgICAgICAgICAgIHRoaXMuaGlkZUJ1dHRvbi5vbihcImNsaWNrXCIsIHRoaXMub25IaWRlQnV0dG9uQ2xpY2tlZCwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmhpZGVCdXR0b24ub24oXCJ0YXBcIiwgdGhpcy5vbkhpZGVCdXR0b25DbGlja2VkLCB0aGlzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuaGlkZUJ1dHRvbi5vZmYoXCJjbGlja1wiLCB0aGlzLm9uSGlkZUJ1dHRvbkNsaWNrZWQsIHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5oaWRlQnV0dG9uLm9mZihcInRhcFwiLCB0aGlzLm9uSGlkZUJ1dHRvbkNsaWNrZWQsIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkhpZGVCdXR0b25DbGlja2VkKCkge1xuICAgICAgICB0aGlzLmhpZGUoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uU2Nyb2xsRG93bkJ1dHRvbkNsaWNrZWQoKSB7XG4gICAgICAgIHRoaXMuc2Nyb2xsRG93bigyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uU2Nyb2xsVXBCdXR0b25DbGlja2VkKCkge1xuICAgICAgICB0aGlzLnNjcm9sbFVwKDIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0VHJpYW5nbGUoY29sb3I6IG51bWJlcik6IFBJWEkuU3ByaXRlIHtcbiAgICAgICAgY29uc3QgdHJpYW5nbGU6IFBJWEkuR3JhcGhpY3MgPSBuZXcgUElYSS5HcmFwaGljcygpO1xuICAgICAgICB0cmlhbmdsZS5iZWdpbkZpbGwoY29sb3IpO1xuICAgICAgICB0cmlhbmdsZS5tb3ZlVG8oMjUsIDApO1xuICAgICAgICB0cmlhbmdsZS5saW5lVG8oMCwgNzUpO1xuICAgICAgICB0cmlhbmdsZS5saW5lVG8oNTAsIDc1KTtcbiAgICAgICAgdHJpYW5nbGUuZW5kRmlsbCgpO1xuXG4gICAgICAgIGxldCByZXN1bHQgPSBuZXcgUElYSS5TcHJpdGUodHJpYW5nbGUuZ2VuZXJhdGVDYW52YXNUZXh0dXJlKCkpO1xuICAgICAgICByZXN1bHQuaW50ZXJhY3RpdmUgPSB0cnVlO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRSZWN0KGNvbG9yOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogUElYSS5TcHJpdGUge1xuICAgICAgICBjb25zdCByZWN0OiBQSVhJLkdyYXBoaWNzID0gbmV3IFBJWEkuR3JhcGhpY3MoKTtcbiAgICAgICAgcmVjdC5iZWdpbkZpbGwoY29sb3IsIDEpO1xuICAgICAgICByZWN0LmRyYXdSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICByZWN0LmVuZEZpbGwoKTtcblxuICAgICAgICBsZXQgcmVzdWx0ID0gbmV3IFBJWEkuU3ByaXRlKHJlY3QuZ2VuZXJhdGVDYW52YXNUZXh0dXJlKCkpO1xuICAgICAgICByZXN1bHQuaW50ZXJhY3RpdmUgPSB0cnVlO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxufVxuIiwiaW1wb3J0IFBpeGlDb25zb2xlIGZyb20gXCIuL2FwcC9waXhpLWNvbnNvbGVcIjtcbmltcG9ydCBQaXhpQ29uc29sZUNvbmZpZyBmcm9tIFwiLi9hcHAvcGl4aS1jb25zb2xlLWNvbmZpZ1wiO1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gICAgUGl4aUNvbnNvbGUsXG4gICAgUGl4aUNvbnNvbGVDb25maWdcbn07XG4iXX0=
