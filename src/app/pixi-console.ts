import * as PIXI from "pixi.js";

import PixiConsoleConfig from "./models/config";
import PixiConsoleEventsConfig from "./models/events-config";
import ErrorListener from "./utils/error-listener";

export default class PixiConsole extends PIXI.Container {
    private static instance: PixiConsole;

    private static readonly ORIG_CONSOLE_FUNCTIONS = {
        log: console.log,
        error: console.error,
        warn: console.warn,
    };

    static getInstance(): PixiConsole {
        if (!this.instance) {
            this.instance = new PixiConsole();
        }

        return PixiConsole.instance;
    }

    private _background: PIXI.Graphics;
    private _config: PixiConsoleConfig;
    private _consoleContainer: PIXI.Container;

    private _errorListener: ErrorListener;

    /**
     * Pixi-console
     *
     * @param config PixiConsole settings.
     * You can provide some of them and they will be merged with the defaults.
     * If none, the defaults will be used.
     */
    constructor(config?: PixiConsoleConfig) {
        super();

        if (PixiConsole.instance) {
            throw new Error(
                `PixiConsole has been initialized once.
                Use PixiConsole.getInstance() to work with it`
            );
        }

        PixiConsole.instance = this;

        let defaultConfig = new PixiConsoleConfig();
        this._config = { ...defaultConfig, ...config };

        if (config && config.eventsConfig) {
            this._config.eventsConfig = { ...defaultConfig.eventsConfig, ...config.eventsConfig };
        }

        this._updateBackground();

        this._consoleContainer = new PIXI.Container();
        this.addChild(this._consoleContainer);

        this._setupErrorListener();
        this._updateConsoleEvents();

        this.hide();
    }

    get isHidden(): boolean {
        return this.visible;
    }

    get consoleWidth(): number {
        return this._config.consoleWidth;
    }

    set consoleWidth(width: number) {
        this._config.consoleWidth = width;

        this._updateBackground();
    }

    get consoleHeight(): number {
        return this._config.consoleHeight;
    }

    set consoleHeight(height: number) {
        this._config.consoleHeight = height;

        this._updateBackground();
    }

    get backgroundAlpha(): number {
        return this._config.backgroundAlpha;
    }

    set backgroundAlpha(alpha: number) {
        this._config.backgroundAlpha = alpha;
        this._background.alpha = alpha;
    }

    get showOnError(): boolean {
        return this._config.showOnError;
    }

    set showOnError(value: boolean) {
        this._config.showOnError = value;
    }

    get consoleConfig(): PixiConsoleConfig {
        return this._config;
    }

    set consoleConfig(config: PixiConsoleConfig) {
        this._config = { ...this._config, ...config };

        if (config.eventsConfig) {
            this._config.eventsConfig = { ...this._config.eventsConfig, ...config.eventsConfig };
        }

        this._updateBackground();
    }

    get eventsConfig(): PixiConsoleEventsConfig {
        return this._config.eventsConfig;
    }

    /**
     * Provide option to change dynamically which console functions PixiConsole would be attached to;
     */
    set eventsConfig(value: PixiConsoleEventsConfig) {
        this._config.eventsConfig = { ...this._config.eventsConfig, ...value };

        this._updateConsoleEvents();
    }

    show(): PixiConsole {
        this.visible = true;

        return this;
    }

    hide(): PixiConsole {
        this.visible = false;

        return this;
    }

    print(
        message: string,
        color: number = this._config.fontColor,
        fontSize: number = this._config.fontSize
    ): PixiConsole {
        let text = new PIXI.Text(message, {
            fill: color,
            fontSize: fontSize,
            wordWrap: true,
            wordWrapWidth: this._config.consoleWidth - this._config.textStartingX,
        });

        let totalTextsHeight = this._consoleContainer.children
            .map((textContainer) => (textContainer as PIXI.Container).height + this._config.textYSpacing)
            .reduce((totalHeight, currentHeight) => totalHeight + currentHeight, 0);

        text.x = this._config.textStartingX;
        text.y = this._config.textStartingY + totalTextsHeight;

        this._consoleContainer.addChild(text);

        const timesCoveredScreen = Math.floor(-this._consoleContainer.y / this._config.consoleHeight) + 1;
        const updatedTotalTextsHeight = this._config.textStartingY + totalTextsHeight + text.height;

        if (updatedTotalTextsHeight > this._config.consoleHeight * timesCoveredScreen) {
            this._consoleContainer.y = -totalTextsHeight;
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

    dispose(): void {
        for (const consoleFunction in PixiConsole.ORIG_CONSOLE_FUNCTIONS) {
            (console as any)[consoleFunction] = (PixiConsole.ORIG_CONSOLE_FUNCTIONS as any)[consoleFunction];
        }

        this._errorListener.dispose();
    }

    private _updateBackground(): void {
        if (this._background) {
            this.removeChildAt(0);
        }

        this._background = new PIXI.Graphics();
        this._background.beginFill(this._config.backgroundColor, 1);
        this._background.drawRect(0, 0, this._config.consoleWidth, this._config.consoleHeight);
        this._background.endFill();
        this._background.alpha = this._config.backgroundAlpha;

        this.addChildAt(this._background, 0);
    }

    private _setupErrorListener(): void {
        this._errorListener = new ErrorListener((e) => {
            if (this._config.showOnError) {
                this.show();
            }

            let errorMessage = e.message;

            if (e.error.stack) {
                errorMessage += "\n\t" + e.error.stack.split("@").join("\n\t");
            }

            this._error(errorMessage);
        });
    }

    private _updateConsoleEvents(): void {
        let self = this;

        const eventsConfig = this._config.eventsConfig;

        for (const event in eventsConfig) {
            if (eventsConfig[event]) {
                console[event] = function () {
                    self["_" + event](...Array.from(arguments));

                    return PixiConsole.ORIG_CONSOLE_FUNCTIONS[event].apply(this, arguments);
                };
            } else {
                console[event] = PixiConsole.ORIG_CONSOLE_FUNCTIONS[event];
            }
        }

        if (eventsConfig.error) {
            this._errorListener.startListening();
        } else {
            this._errorListener.stopListening();
        }
    }

    private _log(...messages: string[]): void {
        messages.forEach((message) => {
            this.print(message, this._config.fontColor, this._config.fontSize);
        });
    }

    private _warn(...messages: string[]): void {
        messages.forEach((message) => {
            this.print(message, this._config.fontWarningColor, this._config.fontSize);
        });
    }

    private _error(...messages: string[]): void {
        messages.forEach((message) => {
            this.print(message, this._config.fontErrorColor, this._config.fontSize);
        });
    }
}
