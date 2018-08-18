export class PixiConsoleConfig {
    consoleWidth: number = 1280;
    consoleHeight: number = 720;
    fontSize: number = 30;

    // additional buttons
    addScrollButtons: boolean = false;
    addHideButton: boolean = true;

    // events options
    showOnError: boolean = true;
    attachConsoleError: boolean = true;
    attachConsoleLog: boolean = true;

    // customization
    consoleAlpha: number = 0.2;
    backgroundColor: number = 0xfffff;
    scrollButtonsColor: number = 0xffff00;
}
