import EventsConfig from "./events-config";

export default class PixiConsoleConfig {
    consoleWidth = 1280;
    consoleHeight = 720;
    fontSize = 30;
    fontColor = 0xffffff;
    fontErrorColor = 0xff0000;
    fontWarningColor = 0xf0e68c;
    stringifyObjects = false;
    showCaller = false;

    // events options
    eventsConfig = new EventsConfig();
    showOnError = true;

    // customization
    backgroundAlpha = 0.2;
    backgroundColor = 0x000000;

    scrollingYStep = 40;
    textStartingX = 10;
    textStartingY = 10;
    textYSpacing = 10;
}
