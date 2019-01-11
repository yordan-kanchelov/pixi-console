export class PixiConsoleConfig {
    consoleWidth: number = 1280;
    consoleHeight: number = 720;
    fontSize: number = 30;
    fontColor: number = 0xffffff;
    fontErrorColor: number = 0xff0000;
    fontWarningColor: number = 	0xF0E68C

    // events options
    showOnError: boolean = true;
    attachConsoleError: boolean = true;
    attachConsoleLog: boolean = true;
    attachConsoleWarn: boolean = true;

    // customization
    consoleAlpha: number = 0.2;
    backgroundColor: number = 0xffffff;

    scrollingYStep = 40;
    textStartingX = 10;
    textStartingY = 10;
    textYSpacing = 10;
}
