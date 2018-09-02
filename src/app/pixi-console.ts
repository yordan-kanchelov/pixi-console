import { PixiConsoleConfig } from "./pixi-console-config";

export class PixiConsole extends PIXI.Container {
    private static instance: PixiConsole;

    private _config: PixiConsoleConfig;
    private _consoleContainer: PIXI.Container;

    private _origConsoleLog: Function;
    private _origConsoleError: Function;

    constructor(config?: PixiConsoleConfig) {
        super();

        PixiConsole.instance = this;

        let defaultConfig = new PixiConsoleConfig();
        this._config = { ...defaultConfig, ...config };

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

    print(message: string, color: number = -1, fontSize: number = -1): PixiConsole {
        if (color === -1) {
            color = this._config.defaultPrintColor;
        }

        if (fontSize === -1) {
            fontSize = this._config.fontSize;
        }

        let text = new PIXI.Text(message, {
            fill: color,
            fontSize: fontSize,
            wordWrap: true,
            wordWrapWidth: this._config.consoleWidth - this._config.textStartingX,
        });

        let currentTextHeight = this._consoleContainer.children
            .map(textContainer => (textContainer as PIXI.Container).height + this._config.textYSpacing)
            .reduce((totalHeight, currentHeight) => totalHeight + currentHeight, 0);

        // TODO:
        // unneeded container ?
        let textContainer = new PIXI.Container();
        textContainer.addChild(text);
        textContainer.x = this._config.textStartingX;
        textContainer.y = this._config.textStartingY + currentTextHeight;

        this._consoleContainer.addChild(textContainer);

        if (this._config.textStartingY + currentTextHeight > this._config.consoleHeight) {
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

    scrollUp(timesScroll: number = 1, yStep: number = this._config.scrollingYStep): PixiConsole {
        if (this._consoleContainer.y < yStep) {
            this._consoleContainer.y += yStep * timesScroll;
        }

        return this;
    }

    scrollDown(timesScroll: number = 1, yStep: number = this._config.scrollingYStep): PixiConsole {
        this._consoleContainer.y -= yStep * timesScroll;

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
    }

    private init(): void {
        var background: PIXI.Graphics = new PIXI.Graphics();
        background.beginFill(this._config.backgroundColor, this._config.consoleAlpha);
        background.drawRect(0, 0, this._config.consoleWidth, this._config.consoleHeight);
        background.endFill();
        this.addChild(background);

        this._consoleContainer = new PIXI.Container();

        this.addChild(this._consoleContainer);
    }

    private attachToConsole(): void {
        this._origConsoleLog = console.log;
        this._origConsoleError = console.error;
        let self = this;

        if (this._config.attachConsoleLog) {
            console.log = function() {
                self.printLog(...Array.from(arguments));

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

    private printLog(...messages: string[]): void {
        messages.forEach(message => {
            this.print(message, 0xffffff, this._config.fontSize);
        });
    }

    private printError(message: string): void {
        this.print(message, 0xff0000, this._config.fontSize);
    }
}
