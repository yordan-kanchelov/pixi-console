/// <reference types="pixi.js" />
import { PixiConsoleConfig } from "./pixi-console-config";
export declare class PixiConsole extends PIXI.Container {
    private static readonly SCROLLING_Y_STEP;
    private static readonly TEXT_STARTING_X;
    private static readonly TEXT_STARTING_Y;
    private static readonly TEXT_Y_SPACING;
    private static instance;
    private _config;
    private _consoleContainer;
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
}
