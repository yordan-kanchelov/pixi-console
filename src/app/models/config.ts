import EventsConfig from "./events-config";

export default class PixiConsoleConfig {
    consoleWidth: number = 1280;
    consoleHeight: number = 720;
    fontSize: number = 30;
    fontColor: number = 0xffffff;
    fontErrorColor: number = 0xff0000;
    fontWarningColor: number = 0xf0e68c;
    stringifyObjects: boolean = false;
    showCaller: boolean = false;

    // events options
    eventsConfig: EventsConfig = new EventsConfig();
    showOnError: boolean = true;

    // customization
    backgroundAlpha: number = 0.2;
    backgroundColor: number = 0x000000;

    scrollingYStep = 40;
    textStartingX = 10;
    textStartingY = 10;
    textYSpacing = 10;
}
