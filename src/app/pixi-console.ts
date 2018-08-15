import ConsoleConfig from "./pixi-console-config";

export default class PixiConsole extends PIXI.Container {
    private static readonly SCROLLING_Y_STEP = 40;
    private static readonly TEXT_STARTING_X = 10;
    private static readonly TEXT_STARTING_Y = 10;
    private static readonly TEXT_Y_SPACING = 40;

    private static instance: PixiConsole;

    private _config: ConsoleConfig;
    private _consoleContainer: PIXI.Container;

    private _scrollDownButton: PIXI.Sprite;
    private _scrollUpButton: PIXI.Sprite;
    private _hideButton: PIXI.Sprite;

    private _origConsoleLog: Function;
    private _origConsoleError: Function;

    constructor(config?: ConsoleConfig) {
        super();

        PixiConsole.instance = this;

        this._config = new ConsoleConfig();

        if (config) {
            for (const key in config) {
                if (config.hasOwnProperty(key)) {
                    (this._config as any)[key] = (config as any)[key];
                }
            }
        }

        this._config = config;

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
            wordWrapWidth: this._config.consoleWidth - PixiConsole.TEXT_STARTING_X
        });

        let currentTextHeight = this._consoleContainer.children
            .map(textContainer => (textContainer as PIXI.Container).height + PixiConsole.TEXT_Y_SPACING)
            .reduce((totalHeight, currentHeight) => totalHeight + currentHeight, 0);

        let textContainer = new PIXI.Container();
        textContainer.addChild(text);
        textContainer.x = PixiConsole.TEXT_STARTING_X;
        textContainer.y = PixiConsole.TEXT_STARTING_Y + currentTextHeight;

        this._consoleContainer.addChild(textContainer);

        if (PixiConsole.TEXT_STARTING_Y + currentTextHeight > this._config.consoleHeight) {
            this._consoleContainer.y = -currentTextHeight;
        }

        return this;
    }

    clearConsole(): PixiConsole {
        while (this._consoleContainer.children.length > 0) {
            this._consoleContainer.removeChildAt(0);
        }
        this._consoleContainer.y = 0;

        return this;
    }

    scrollUp(timesScroll: number = 1): PixiConsole {
        if (this._consoleContainer.y < PixiConsole.SCROLLING_Y_STEP) {
            this._consoleContainer.y += PixiConsole.SCROLLING_Y_STEP * timesScroll;
        }

        return this;
    }

    scrollDown(timesScroll: number = 1): PixiConsole {
        this._consoleContainer.y -= PixiConsole.SCROLLING_Y_STEP * timesScroll;

        return this;
    }

    public dispose(): void {
        const self = this;

        console.log = function() {
            self._origConsoleLog.apply(this, arguments);
        };

        console.error = function() {
            self._origConsoleLog.apply(this, arguments);
        };

        this.setupHideButtonEvents(false);
        this.setupScrollButtonsEvents(false);
    }

    private init(): void {
        var background: PIXI.Graphics = new PIXI.Graphics();
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
    }

    private attachToConsole(): void {
        this._origConsoleLog = console.log;
        this._origConsoleError = console.error;
        let self = this;

        if (this._config.attachConsoleLog) {
            console.log = function() {
                this.log(arguments[0]);

                return self._origConsoleLog.apply(this, arguments);
            };
        }

        if (this._config.attachConsoleError) {
            window.addEventListener("error", e => {
                if (self._config.showOnError) {
                    self.show();
                }

                if (e.error.stack) {
                    this.printError(e.message + "\n\t" + e.error.stack.split("@").join("\n\t"));
                } else {
                    this.printError(`Error at line - ${e.lineno}\n\t${e.message}\n\t${e.filename}\n\t`);
                }
            });

            console.error = function() {
                if (self._config.showOnError) {
                    self.show();
                }

                this.error(arguments[0]);
                return self._origConsoleError.apply(this, arguments);
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
            this._scrollUpButton.on("click", this.onScrollUpButtonClicked, this);
            this._scrollUpButton.on("tap", this.onScrollUpButtonClicked, this);
            this._scrollDownButton.on("click", this.onScrollDownButtonClicked, this);
            this._scrollDownButton.on("tap", this.onScrollDownButtonClicked, this);
        } else {
            this._scrollUpButton.off("click", this.onScrollUpButtonClicked, this);
            this._scrollUpButton.off("tap", this.onScrollUpButtonClicked, this);
            this._scrollDownButton.off("click", this.onScrollDownButtonClicked, this);
            this._scrollDownButton.off("tap", this.onScrollDownButtonClicked, this);
        }
    }

    private setupHideButtonEvents(on: boolean = true) {
        if (on) {
            this._hideButton.on("click", this.onHideButtonClicked, this);
            this._hideButton.on("tap", this.onHideButtonClicked, this);
        } else {
            this._hideButton.off("click", this.onHideButtonClicked, this);
            this._hideButton.off("tap", this.onHideButtonClicked, this);
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
