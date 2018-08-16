/// <reference types="pixi.js" />
declare module "app/pixi-console-config" {
    export class PixiConsoleConfig {
        consoleWidth: number;
        consoleHeight: number;
        consoleAlpha: number;
        addHideButton: boolean;
        addScrollButtons: boolean;
        attachConsoleLog: boolean;
        attachConsoleError: boolean;
        backgroundColor: number;
        scrollButtonsColor: number;
        showOnError: boolean;
    }
}
declare module "app/pixi-console" {
    import { PixiConsoleConfig } from "app/pixi-console-config";
    export class PixiConsole extends PIXI.Container {
        private static readonly SCROLLING_Y_STEP;
        private static readonly TEXT_STARTING_X;
        private static readonly TEXT_STARTING_Y;
        private static readonly TEXT_Y_SPACING;
        private static instance;
        private _config;
        private _consoleContainer;
        private _scrollDownButton;
        private _scrollUpButton;
        private _hideButton;
        private _origConsoleLog;
        private _origConsoleError;
        constructor(config?: PixiConsoleConfig);
        static getInstance(): PixiConsole;
        show(): PixiConsole;
        hide(): PixiConsole;
        print(message: string, color?: number, fontSize?: number): PixiConsole;
        clearConsole(): PixiConsole;
        scrollUp(timesScroll?: number): PixiConsole;
        scrollDown(timesScroll?: number): PixiConsole;
        dispose(): void;
        private init;
        private attachToConsole;
        private printLog;
        private printError;
        private setupScrollButtonsEvents;
        private setupHideButtonEvents;
        private onHideButtonClicked;
        private onScrollDownButtonClicked;
        private onScrollUpButtonClicked;
        private getTriangle;
        private getRect;
    }
}
declare module "index" {
    import { PixiConsole } from "app/pixi-console";
    import { PixiConsoleConfig } from "app/pixi-console-config";
    const _default: {
        PixiConsole: typeof PixiConsole;
        PixiConsoleConfig: typeof PixiConsoleConfig;
    };
    export default _default;
}
