import * as PIXI from "pixi.js";
import ConsoleConfig from "./pixi-console-config";

export default class PixiConsole extends PIXI.Container {
    private static readonly SCROLLING_Y_STEP = 40;
    private static readonly TEXT_STARTING_X = 10;
    private static readonly TEXT_STARTING_Y = 10;
    private static readonly TEXT_Y_SPACING = 40;

    private static instance: PixiConsole;

    private consoleContainer: PIXI.Container;

    private config: ConsoleConfig;

    private scrollDownButton: PIXI.Sprite;
    private scrollUpButton: PIXI.Sprite;
    private hideButton: PIXI.Sprite;

    constructor(config?: ConsoleConfig) {
        super();

        PixiConsole.instance = this;

        if (!config) {
            config = new ConsoleConfig();
        }

        this.config = config;

        this.init();
        this.hide();
        this.attachToConsole();
    }

    static getInstance(): PixiConsole {
        if (!this.instance) {
            this.instance = new PixiConsole();
        }

        return PixiConsole.instance;
    }

    show(): PixiConsole {
        this.visible = true;

        return this;
    }

    hide(): PixiConsole {
        this.visible = false;

        return this;
    }

    print(message: string, color: number = 0xffffff, fontSize: number = 30): PixiConsole {
        let text = new PIXI.Text(message, {
            fill: color,
            fontSize: fontSize,
            wordWrap: true,
            wordWrapWidth: this.config.consoleWidth - PixiConsole.TEXT_STARTING_X
        });

        let currentTextHeight = this.consoleContainer.children
            .map(textContainer => (textContainer as PIXI.Container).height + PixiConsole.TEXT_Y_SPACING)
            .reduce((totalHeight, currentHeight) => totalHeight + currentHeight, 0);

        let textContainer = new PIXI.Container();
        textContainer.addChild(text);
        textContainer.x = PixiConsole.TEXT_STARTING_X;
        textContainer.y = PixiConsole.TEXT_STARTING_Y + currentTextHeight;

        this.consoleContainer.addChild(textContainer);

        if (PixiConsole.TEXT_STARTING_Y + currentTextHeight > this.config.consoleHeight) {
            this.consoleContainer.y = -currentTextHeight;
        }

        return this;
    }

    clearConsole(): PixiConsole {
        while (this.consoleContainer.children.length > 0) {
            this.consoleContainer.removeChildAt(0);
        }
        this.consoleContainer.y = 0;

        return this;
    }

    scrollUp(timesScroll: number = 1): PixiConsole {
        if (this.consoleContainer.y < PixiConsole.SCROLLING_Y_STEP) {
            this.consoleContainer.y += PixiConsole.SCROLLING_Y_STEP * timesScroll;
        }

        return this;
    }

    scrollDown(timesScroll: number = 1): PixiConsole {
        this.consoleContainer.y -= PixiConsole.SCROLLING_Y_STEP * timesScroll;

        return this;
    }

    public dispose(): void {
        // TODO:
        // return the default behavior of console.log & error

        this.setupHideButtonEvents(false);
        this.setupScrollButtonsEvents(false);
    }

    private init(): void {
        var background: PIXI.Graphics = new PIXI.Graphics();
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
    }

    private attachToConsole(): void {
        let origLog = console.log;
        let origError = console.error;
        let self = this;

        if (this.config.attachConsoleLog) {
            console.log = function() {
                this.log(arguments[0]);

                return origLog.apply(this, arguments);
            };
        }

        if (this.config.attachConsoleError) {
            window.addEventListener("error", e => {
                if (self.config.showOnError) {
                    self.show();
                }

                if (e.error.stack) {
                    this.printError(e.message + "\n\t" + e.error.stack.split("@").join("\n\t"));
                } else {
                    this.printError(`Error at line - ${e.lineno}\n\t${e.message}\n\t${e.filename}\n\t`);
                }
            });

            console.error = function() {
                if (self.config.showOnError) {
                    self.show();
                }

                this.error(arguments[0]);
                return origError.apply(this, arguments);
            };
        }
    }

    private printLog(message: string): void {
        this.print(message);
    }

    private printError(message: string): void {
        this.print(message, 0xff0000);
    }

    private setupScrollButtonsEvents(on: boolean = true) {
        // TODO:
        // attach the proper event depending if the device is mobile or desktop

        if (on) {
            this.scrollUpButton.on("click", this.onScrollUpButtonClicked, this);
            this.scrollUpButton.on("tap", this.onScrollUpButtonClicked, this);
            this.scrollDownButton.on("click", this.onScrollDownButtonClicked, this);
            this.scrollDownButton.on("tap", this.onScrollDownButtonClicked, this);
        } else {
            this.scrollUpButton.off("click", this.onScrollUpButtonClicked, this);
            this.scrollUpButton.off("tap", this.onScrollUpButtonClicked, this);
            this.scrollDownButton.off("click", this.onScrollDownButtonClicked, this);
            this.scrollDownButton.off("tap", this.onScrollDownButtonClicked, this);
        }
    }

    private setupHideButtonEvents(on: boolean = true) {
        if (on) {
            this.hideButton.on("click", this.onHideButtonClicked, this);
            this.hideButton.on("tap", this.onHideButtonClicked, this);
        } else {
            this.hideButton.off("click", this.onHideButtonClicked, this);
            this.hideButton.off("tap", this.onHideButtonClicked, this);
        }
    }

    private onHideButtonClicked() {
        this.hide();
    }

    private onScrollDownButtonClicked() {
        this.scrollDown(2);
    }

    private onScrollUpButtonClicked() {
        this.scrollUp(2);
    }

    private getTriangle(color: number): PIXI.Sprite {
        const triangle: PIXI.Graphics = new PIXI.Graphics();
        triangle.beginFill(color);
        triangle.moveTo(25, 0);
        triangle.lineTo(0, 75);
        triangle.lineTo(50, 75);
        triangle.endFill();

        let result = new PIXI.Sprite(triangle.generateCanvasTexture());
        result.interactive = true;

        return result;
    }

    private getRect(color: number, width: number, height: number): PIXI.Sprite {
        const rect: PIXI.Graphics = new PIXI.Graphics();
        rect.beginFill(color, 1);
        rect.drawRect(0, 0, width, height);
        rect.endFill();

        let result = new PIXI.Sprite(rect.generateCanvasTexture());
        result.interactive = true;

        return result;
    }
}
