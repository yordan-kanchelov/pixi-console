import {
    Application,
    BitmapFontManager,
    BitmapText,
    Cache,
    Container,
    Graphics,
    Point,
    RenderTexture,
    Text,
    type Renderer,
} from "pixi.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";

import {
    createJsEvaluator,
    DEFAULT_OPTIONS,
    LOG_LEVELS,
    PixiConsole,
    type ConsoleEntry,
    type ConsoleEvaluator,
    type EntryKind,
    type LogLevel,
    type PixiConsoleInit,
} from "../src";

let app: Application;
const consoles: PixiConsole[] = [];
/** Undo steps for anything a test changes outside its consoles, run after each test. */
const cleanups: (() => void)[] = [];

beforeAll(async () => {
    app = new Application();
    await app.init({ width: 800, height: 600, preference: "webgl" });
    document.body.appendChild(app.canvas);
});

afterAll(() => {
    app.destroy(true);
});

afterEach(() => {
    for (const c of consoles.splice(0)) c.destroy();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    vi.restoreAllMocks();
});

function create(options: PixiConsoleInit = {}): PixiConsole {
    const pixiConsole = new PixiConsole({ visible: true, toggleKey: null, ...options });

    consoles.push(pixiConsole);
    app.stage.addChild(pixiConsole);

    return pixiConsole;
}

function render(): void {
    app.renderer.render(app.stage);
}

/** Row labels of the pool, visible or not. */
function rows(pixiConsole: PixiConsole): (Text | BitmapText)[] {
    return (pixiConsole.getChildByLabel("lines") as Container).children as (Text | BitmapText)[];
}

/** Text of the visible rows, top to bottom. */
function visibleLines(pixiConsole: PixiConsole): string[] {
    return rows(pixiConsole)
        .filter((row) => row.visible)
        .sort((a, b) => a.y - b.y)
        .map((row) => row.text);
}

function toolbarOf(pixiConsole: PixiConsole): Container | null {
    return pixiConsole.getChildByLabel("toolbar");
}

/** A toolbar button: a level chip (by level), `"clear"` or `"close"`. */
function button(pixiConsole: PixiConsole, label: string): BitmapText {
    const found = toolbarOf(pixiConsole)?.getChildByLabel(label);

    if (!(found instanceof BitmapText)) throw new Error(`No toolbar button "${label}"`);

    return found;
}

/** Centre of a display object, in stage coordinates. */
function centerOf(target: Text | BitmapText): [x: number, y: number] {
    const { x, y } = target.toGlobal(new Point(target.width / 2, target.height / 2));

    return [x, y];
}

/** Name of the bitmap font a console installs with the default font at a resolution. */
function fontName(resolution: number): string {
    return `pixi-console:${DEFAULT_OPTIONS.fontFamily}:${DEFAULT_OPTIONS.fontSize}:${resolution}`;
}

/** Client coordinates of a point on the stage. */
function clientPoint(x: number, y: number): { clientX: number; clientY: number } {
    const rect = app.canvas.getBoundingClientRect();

    return {
        clientX: rect.left + (x * rect.width) / app.screen.width,
        clientY: rect.top + (y * rect.height) / app.screen.height,
    };
}

/** Dispatches a native pointer event on the canvas, as the browser would. */
function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
    const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        ...clientPoint(x, y),
        ...init,
    });

    app.canvas.dispatchEvent(event);

    return event;
}

/** Presses and releases a pointer at the same place: a tap or a click. */
function tap(x: number, y: number, init: PointerEventInit = {}): void {
    pointer("pointerdown", x, y, init);
    pointer("pointerup", x, y, init);
}

/** Dispatches a native wheel event on the canvas and returns it, e.g. to check `defaultPrevented`. */
function wheel(x: number, y: number, deltaY: number, deltaMode = 0): WheelEvent {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, deltaMode, ...clientPoint(x, y) });

    app.canvas.dispatchEvent(event);

    return event;
}

/** Counts events of each type that reach the stage, which covers the whole screen for the test. */
function listenOnStage(types: readonly string[]): Record<string, number> {
    const { eventMode, hitArea } = app.stage;
    const seen: Record<string, number> = {};

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    cleanups.push(() => {
        app.stage.eventMode = eventMode;
        app.stage.hitArea = hitArea;
    });

    for (const type of types) {
        const count = () => (seen[type] = (seen[type] ?? 0) + 1);

        seen[type] = 0;
        app.stage.on(type, count);
        cleanups.push(() => app.stage.off(type, count));
    }

    return seen;
}

/** Logs one message per level, `times` times; messages differ so they don't collapse. */
function logEveryLevel(pixiConsole: PixiConsole, times = 1): void {
    for (let i = 0; i < times; i++) {
        for (const level of LOG_LEVELS) pixiConsole[level](`${level} ${i}`);
    }
}

/** Visible toolbar buttons sit inside the console, left to right, without overlapping. */
function expectToolbarFits(pixiConsole: PixiConsole): void {
    const { padding } = DEFAULT_OPTIONS;
    const buttons = (toolbarOf(pixiConsole)?.children ?? [])
        .filter((child) => child.visible)
        .sort((a, b) => a.x - b.x) as BitmapText[];

    expect(buttons[0]?.x).toBeGreaterThanOrEqual(padding);

    for (const [i, current] of buttons.entries()) {
        const next = buttons[i + 1];

        if (next) expect(current.x + current.width).toBeLessThanOrEqual(next.x);
        else expect(current.x + current.width).toBeLessThanOrEqual(pixiConsole.consoleWidth - padding);
    }
}

/** `HH:MM:SS.mmm`, as the console prints timestamps. */
function time(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number, length = 2) => String(value).padStart(length, "0");

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Height of the command line row with the default font size and padding. */
const PROMPT_HEIGHT = Math.round(DEFAULT_OPTIONS.fontSize * 1.4) + DEFAULT_OPTIONS.padding;

/** The console's command line input; throws when there is none. */
function promptOf(pixiConsole: PixiConsole): HTMLInputElement {
    const input = pixiConsole.promptElement;

    if (!input) throw new Error("No command line");

    return input;
}

/** The `>` in front of the command line. */
function glyphOf(pixiConsole: PixiConsole): Text | BitmapText {
    const glyph = pixiConsole.getChildByLabel("prompt");

    if (!(glyph instanceof Text || glyph instanceof BitmapText)) throw new Error("No prompt glyph");

    return glyph;
}

/** Messages of the entries, oldest first. */
function messages(pixiConsole: PixiConsole): string[] {
    return pixiConsole.entries.map((entry) => entry.message);
}

/** The prompt row, mapped from the scene graph through the canvas content box, is where the input is on the page. */
function expectAligned(pixiConsole: PixiConsole): void {
    const canvas = app.canvas;
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const [paddingLeft, paddingTop, paddingRight, paddingBottom] = [
        style.paddingLeft,
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
    ].map((value) => parseFloat(value));
    // The canvas's own CSS transform, if any, only scales and translates in these tests.
    const scaleX = rect.width / canvas.offsetWidth;
    const scaleY = rect.height / canvas.offsetHeight;
    const left = rect.left + (canvas.clientLeft + paddingLeft!) * scaleX;
    const top = rect.top + (canvas.clientTop + paddingTop!) * scaleY;
    const unitX = ((canvas.clientWidth - paddingLeft! - paddingRight!) * scaleX) / app.screen.width;
    const unitY = ((canvas.clientHeight - paddingTop! - paddingBottom!) * scaleY) / app.screen.height;
    const from = pixiConsole.toGlobal(new Point(0, pixiConsole.consoleHeight - PROMPT_HEIGHT));
    const to = pixiConsole.toGlobal(new Point(pixiConsole.consoleWidth, pixiConsole.consoleHeight));
    const box = promptOf(pixiConsole).getBoundingClientRect();
    const expected = {
        left: left + from.x * unitX,
        top: top + from.y * unitY,
        right: left + to.x * unitX,
        bottom: top + to.y * unitY,
    };

    expect(promptOf(pixiConsole).isConnected).toBe(true);

    for (const side of ["left", "top", "right", "bottom"] as const) {
        expect(Math.abs(box[side] - expected[side]), `${side}: ${box[side]} vs ${expected[side]}`).toBeLessThanOrEqual(
            0.6,
        );
    }
}

/** The host element the console inserted next to the canvas. */
function hostOf(pixiConsole: PixiConsole): Element | null {
    return promptOf(pixiConsole).closest("[data-pixi-console]");
}

/** Moves the keyboard focus back to the page. */
function blurActive(): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Changes the page and undoes it after the test. */
function changePage(change: () => () => void): void {
    cleanups.push(change());
}

/** Sets inline styles on the canvas; returns a function restoring the previous ones. */
function styleCanvas(styles: Partial<CSSStyleDeclaration>): () => void {
    const { cssText } = app.canvas.style;

    Object.assign(app.canvas.style, styles);

    return () => (app.canvas.style.cssText = cssText);
}

describe("PixiConsole", () => {
    it("captures console calls and renders them", () => {
        const pixiConsole = create();

        console.log("hello", { from: "pixi" });
        console.warn("careful");
        render();

        expect(visibleLines(pixiConsole)).toEqual(['hello { from: "pixi" }', "careful"]);
        expect(pixiConsole.counts).toMatchObject({ log: 1, warn: 1 });
    });

    it("renders with canvas Text too", () => {
        const pixiConsole = create({ textRenderer: "canvas" });

        pixiConsole.log("canvas text");
        render();

        expect(visibleLines(pixiConsole)).toEqual(["canvas text"]);
        expect((pixiConsole.getChildByLabel("lines") as Container).children[0]).toBeInstanceOf(Text);
    });

    it("wraps long lines to the console width", () => {
        const pixiConsole = create({ width: 200, fontSize: 14 });

        pixiConsole.log("word ".repeat(40).trim());
        render();

        const lines = visibleLines(pixiConsole);

        expect(lines.length).toBeGreaterThan(3);
        expect(lines.join(" ").replace(/\s+/g, " ")).toBe("word ".repeat(40).trim());
    });

    it("only keeps enough display objects for one screen", () => {
        const pixiConsole = create({ height: 200 });

        for (let i = 0; i < 5000; i++) pixiConsole.log(`line ${i}`);
        render();

        const rows = (pixiConsole.getChildByLabel("lines") as Container).children;

        expect(rows.length).toBeLessThan(20);
        expect(visibleLines(pixiConsole).at(-1)).toBe("line 4999");
        expect(pixiConsole.entries).toHaveLength(1000);
        expect(pixiConsole.entries[0]?.message).toBe("line 4000");
    });

    it("follows new entries until the user scrolls up", () => {
        const pixiConsole = create({ height: 150 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        render();
        expect(pixiConsole.isFollowing).toBe(true);

        pixiConsole.scrollToTop();
        pixiConsole.log("new");
        render();

        expect(pixiConsole.isFollowing).toBe(false);
        expect(visibleLines(pixiConsole)[0]).toBe("line 0");

        pixiConsole.scrollToBottom();
        render();
        expect(visibleLines(pixiConsole).at(-1)).toBe("new");
    });

    it("scrolls by lines and clamps to the content", () => {
        const pixiConsole = create({ height: 150 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        pixiConsole.scrollToTop().scrollDown(3);
        render();

        expect(visibleLines(pixiConsole)[0]).toBe("line 3");

        pixiConsole.scrollUp(100);
        expect(pixiConsole.scrollY).toBe(0);
    });

    it("collapses repeated messages", () => {
        const pixiConsole = create();

        for (let i = 0; i < 3; i++) pixiConsole.log("same");
        render();

        expect(visibleLines(pixiConsole)).toEqual(["same (×3)"]);
    });

    it("filters levels without losing entries", () => {
        const pixiConsole = create();

        pixiConsole.log("a").warn("b").error("c");
        pixiConsole.filter = ["warn", "error"];
        render();
        expect(visibleLines(pixiConsole)).toEqual(["b", "c"]);

        pixiConsole.filter = ["log", "info", "debug", "warn", "error"];
        render();
        expect(visibleLines(pixiConsole)).toEqual(["a", "b", "c"]);
    });

    it("clears on console.clear()", () => {
        vi.spyOn(console, "clear").mockImplementation(() => undefined);
        const pixiConsole = create();

        console.log("soon gone");
        console.clear();
        render();

        expect(pixiConsole.entries).toHaveLength(0);
        expect(visibleLines(pixiConsole)).toEqual([]);
    });

    it("shows itself on errors", () => {
        const pixiConsole = create({ visible: false });

        console.error("boom");

        expect(pixiConsole.visible).toBe(true);
    });

    it("stays hidden on errors when showOnError is off", () => {
        const pixiConsole = create({ visible: false, showOnError: false });

        console.error("boom");

        expect(pixiConsole.visible).toBe(false);
    });

    it("can change captured levels at runtime", () => {
        const pixiConsole = create({ captureConsole: ["error"] });

        console.log("ignored");
        pixiConsole.captureConsole = true;
        console.log("captured");

        expect(pixiConsole.entries.map((e) => e.message)).toEqual(["captured"]);
    });

    it("prints with custom colours and timestamps", () => {
        const pixiConsole = create({ timestamps: true });

        pixiConsole.print("custom", "hotpink");
        render();

        expect(visibleLines(pixiConsole)[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} custom$/);
    });

    it("re-wraps on resize", () => {
        const pixiConsole = create({ width: 800 });

        pixiConsole.log("word ".repeat(10).trim());
        render();
        expect(visibleLines(pixiConsole)).toHaveLength(1);

        pixiConsole.resize(200, 400);
        render();
        expect(visibleLines(pixiConsole).length).toBeGreaterThan(1);
        expect(pixiConsole.consoleWidth).toBe(200);
    });

    it("follows the renderer size with autoResize", () => {
        const pixiConsole = create({
            autoResize: {
                renderer: app.renderer,
                layout: (screen) => ({ y: screen.height / 2, width: screen.width, height: screen.height / 2 }),
            },
        });

        expect(pixiConsole.consoleWidth).toBe(800);
        expect(pixiConsole.y).toBe(300);

        try {
            app.renderer.resize(400, 800);

            expect(pixiConsole.consoleWidth).toBe(400);
            expect(pixiConsole.consoleHeight).toBe(400);
            expect(pixiConsole.y).toBe(400);
        } finally {
            app.renderer.resize(800, 600);
        }
    });

    it("toggles with the toggle key", () => {
        const pixiConsole = create({ toggleKey: "Backquote" });

        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", key: "`" }));
        expect(pixiConsole.visible).toBe(false);

        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", key: "`" }));
        expect(pixiConsole.visible).toBe(true);
    });

    it("supports several consoles at once", () => {
        const a = create();
        const b = create({ captureConsole: ["warn"] });

        console.log("to a");
        console.warn("to both");

        expect(a.entries.map((e) => e.message)).toEqual(["to a", "to both"]);
        expect(b.entries.map((e) => e.message)).toEqual(["to both"]);
    });

    it("restores console and stops listening when destroyed", () => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const pixiConsole = create({ toggleKey: "Backquote" });

        expect(console.log).not.toBe(originalLog);

        pixiConsole.destroy();

        expect(console.log).toBe(originalLog);
        expect(console.warn).toBe(originalWarn);
        expect(pixiConsole.destroyed).toBe(true);
        expect(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote" }))).not.toThrow();
        expect(() => console.log("after destroy")).not.toThrow();
    });

    it("renders non-ASCII glyphs with the bitmap renderer", () => {
        const pixiConsole = create();

        pixiConsole.log("héllo wörld — ✓");
        render();

        expect(visibleLines(pixiConsole)).toEqual(["héllo wörld — ✓"]);
    });
});

describe("rendering", () => {
    it("skips layout while hidden and catches up when shown", () => {
        const pixiConsole = create({ visible: false, height: 150 });

        render();

        const getLayout = vi.spyOn(BitmapFontManager, "getLayout");

        for (let i = 0; i < 30; i++) {
            pixiConsole.log(`line ${i}`);
            render();
        }

        expect(getLayout).not.toHaveBeenCalled();

        pixiConsole.show();
        render();

        expect(visibleLines(pixiConsole).at(-1)).toBe("line 29");
    });

    it("is its own render group, so logging doesn't rebuild the stage", () => {
        const pixiConsole = create();
        const renderGroups = app.renderer.renderGroup as unknown as {
            _buildInstructions(renderGroup: unknown, renderer: unknown): void;
        };

        render();

        const build = vi.spyOn(renderGroups, "_buildInstructions");

        for (let i = 0; i < 5; i++) {
            pixiConsole.log(`line ${i}`);
            render();
        }

        expect(pixiConsole.isRenderGroup).toBe(true);
        expect(build.mock.calls.filter(([renderGroup]) => renderGroup === app.stage.renderGroup)).toHaveLength(0);
        expect(visibleLines(pixiConsole).at(-1)).toBe("line 4");
    });

    it("leaves onRender free for users", () => {
        const pixiConsole = create();
        const onRender = vi.fn();

        pixiConsole.onRender = onRender;
        pixiConsole.log("still updating");
        render();

        expect(onRender).toHaveBeenCalled();
        expect(visibleLines(pixiConsole)).toEqual(["still updating"]);
    });

    it("draws text on whole pixels", () => {
        for (const textRenderer of ["bitmap", "canvas"] as const) {
            const pixiConsole = create({ textRenderer });

            pixiConsole.log("sharp");
            render();

            expect(rows(pixiConsole).every((row) => row.roundPixels)).toBe(true);
            expect((toolbarOf(pixiConsole)?.children as BitmapText[]).every((label) => label.roundPixels)).toBe(true);
        }
    });

    it("rounds the autoResize position to whole pixels", () => {
        const pixiConsole = create({
            autoResize: {
                renderer: app.renderer,
                layout: (screen) => ({ x: 10.4, y: screen.height * 0.6 + 0.3, width: 300.4, height: 100 }),
            },
        });

        expect(pixiConsole.x).toBe(10);
        expect(pixiConsole.y).toBe(360);
        expect(pixiConsole.consoleWidth).toBe(300);
    });

    it("draws the toolbar with bitmap text in canvas mode too", () => {
        const pixiConsole = create({ textRenderer: "canvas" });

        pixiConsole.log("canvas row");
        render();

        expect(rows(pixiConsole)[0]).toBeInstanceOf(Text);
        expect(toolbarOf(pixiConsole)?.children).toHaveLength(7);
        expect(toolbarOf(pixiConsole)?.children.every((label) => label instanceof BitmapText)).toBe(true);
        expect(button(pixiConsole, "log").text).toBe("log 1");
    });

    it("only hit tests the console itself and its toolbar buttons", () => {
        const pixiConsole = create();
        const toolbar = toolbarOf(pixiConsole);
        const content = pixiConsole.getChildByLabel("lines");

        render();

        for (const child of pixiConsole.children) {
            if (child !== toolbar && child !== content?.mask) expect(child.eventMode).toBe("none");
        }

        const boundary = app.renderer.events.rootBoundary;

        boundary.rootTarget = app.stage;
        expect(boundary.hitTest(400, 200)).toBe(pixiConsole);
        expect(boundary.hitTest(...centerOf(button(pixiConsole, "error")))).toBe(button(pixiConsole, "error"));
    });
});

describe("text resolution and fonts", () => {
    it("installs its bitmap font without kerning", () => {
        create();
        render();

        const font = Cache.get<{ _skipKerning?: boolean }>(`${fontName(app.renderer.resolution)}-bitmap`);

        expect(font._skipKerning).toBe(true);
    });

    it("follows the renderer resolution rather than devicePixelRatio", () => {
        vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);

        const bitmap = create();
        const canvas = create({ textRenderer: "canvas" });

        bitmap.log("bitmap");
        canvas.log("canvas");
        render();

        expect((rows(bitmap)[0] as BitmapText).style.fontFamily).toBe(fontName(1));
        expect(button(canvas, "log").style.fontFamily).toBe(fontName(1));
        expect((rows(canvas)[0] as Text).resolution).toBe(1);
        // Installed for devicePixelRatio before the first render, then swapped out and uninstalled.
        expect(Cache.has(`${fontName(3)}-bitmap`)).toBe(false);
    });

    it("keeps an explicit resolution", () => {
        const pixiConsole = create({ textRenderer: "canvas", resolution: 2 });

        pixiConsole.log("fixed");
        render();

        expect((rows(pixiConsole)[0] as Text).resolution).toBe(2);
        expect(button(pixiConsole, "log").style.fontFamily).toBe(fontName(2));
    });

    it("installs the font again when the renderer resolution changes", () => {
        const pixiConsole = create({ autoResize: { renderer: app.renderer } });

        pixiConsole.log("text");
        render();
        expect(Cache.has(`${fontName(1)}-bitmap`)).toBe(true);

        try {
            app.renderer.resize(800, 600, 2);
            render();

            expect((rows(pixiConsole)[0] as BitmapText).style.fontFamily).toBe(fontName(2));
            expect(button(pixiConsole, "clear").style.fontFamily).toBe(fontName(2));
            expect(Cache.has(`${fontName(2)}-bitmap`)).toBe(true);
            expect(Cache.has(`${fontName(1)}-bitmap`)).toBe(false);
            expect(visibleLines(pixiConsole)).toEqual(["text"]);
        } finally {
            app.renderer.resize(800, 600, 1);
        }

        render();

        expect(Cache.has(`${fontName(2)}-bitmap`)).toBe(false);
        expect(visibleLines(pixiConsole)).toEqual(["text"]);
    });

    it("uninstalls its font when the last console using it is destroyed", () => {
        const a = create();
        const b = create({ textRenderer: "canvas" });
        const key = `${fontName(1)}-bitmap`;

        render();
        a.destroy();
        expect(Cache.has(key)).toBe(true);

        b.toolbar = false;
        expect(Cache.has(key)).toBe(false);

        b.toolbar = true;
        expect(Cache.has(key)).toBe(true);

        b.destroy();
        expect(Cache.has(key)).toBe(false);
    });
});

describe("toolbar", () => {
    it("fits every chip on a phone-wide console", () => {
        const pixiConsole = create({ width: 375 });

        logEveryLevel(pixiConsole);
        render();

        for (const level of LOG_LEVELS) expect(button(pixiConsole, level).visible).toBe(true);
        expect(button(pixiConsole, "clear").visible).toBe(true);
        expectToolbarFits(pixiConsole);
    });

    it("uses compact labels, then hides the clear button before any chip", () => {
        const pixiConsole = create({ width: 320 });

        logEveryLevel(pixiConsole, 100);
        render();

        expect(LOG_LEVELS.map((level) => button(pixiConsole, level).text)).toEqual([
            "L 100",
            "I 100",
            "D 100",
            "W 100",
            "E 100",
        ]);
        for (const level of LOG_LEVELS) expect(button(pixiConsole, level).visible).toBe(true);
        expect(button(pixiConsole, "clear").visible).toBe(false);
        expectToolbarFits(pixiConsole);

        pixiConsole.resize(800, 400);
        render();

        expect(button(pixiConsole, "log").text).toBe("log 100");
        expect(button(pixiConsole, "clear").visible).toBe(true);
        expectToolbarFits(pixiConsole);
    });

    it("hides empty chips first and never hides a filtered-out level", () => {
        const pixiConsole = create({ width: 200, filter: ["log", "info", "debug", "warn"] });

        for (let i = 0; i < 100; i++) pixiConsole.log(`log ${i}`).info(`info ${i}`).warn(`warn ${i}`);
        pixiConsole.error("the one error");
        render();

        expect(button(pixiConsole, "debug").visible).toBe(false);
        expect(button(pixiConsole, "error").visible).toBe(true);
        expect(button(pixiConsole, "error").alpha).toBeLessThan(1);
        expectToolbarFits(pixiConsole);
    });

    it("keeps the buttons inside a very narrow console", () => {
        const pixiConsole = create();

        logEveryLevel(pixiConsole);
        pixiConsole.resize(60, 200);
        render();

        expect(button(pixiConsole, "clear").visible).toBe(false);
        expect(button(pixiConsole, "close").visible).toBe(true);
        expectToolbarFits(pixiConsole);

        // Even when nothing fits, a filtered-out level keeps its chip so that it can be turned back on.
        pixiConsole.filter = ["log", "info", "debug", "warn"];
        render();

        expect(LOG_LEVELS.filter((level) => button(pixiConsole, level).visible)).toEqual(["error"]);
    });

    it("abbreviates large counts", () => {
        const pixiConsole = create();

        for (let i = 0; i < 12_345; i++) pixiConsole.log("again");
        render();

        expect(button(pixiConsole, "log").text).toBe("log 12k");
        expect(visibleLines(pixiConsole)).toEqual(["again (×12345)"]);
    });

    it("toggles levels, clears and closes when tapped", () => {
        const pixiConsole = create({ height: 300 });

        pixiConsole.log("a").error("b");
        render();

        tap(...centerOf(button(pixiConsole, "error")));
        render();
        expect(pixiConsole.filter).not.toContain("error");
        expect(visibleLines(pixiConsole)).toEqual(["a"]);

        tap(...centerOf(button(pixiConsole, "error")));
        render();
        expect(pixiConsole.filter).toContain("error");
        expect(visibleLines(pixiConsole)).toEqual(["a", "b"]);

        tap(...centerOf(button(pixiConsole, "clear")));
        render();
        expect(pixiConsole.entries).toHaveLength(0);

        tap(...centerOf(button(pixiConsole, "close")));
        expect(pixiConsole.visible).toBe(false);
    });

    it("works without a toolbar, and can be added and removed later", () => {
        const pixiConsole = create({ toolbar: false });
        const content = pixiConsole.getChildByLabel("lines") as Container;

        pixiConsole.log("row");
        render();

        const top = content.y;

        expect(toolbarOf(pixiConsole)).toBeNull();
        expect(top).toBe(DEFAULT_OPTIONS.padding);
        expect(visibleLines(pixiConsole)).toEqual(["row"]);

        pixiConsole.toolbar = true;
        render();

        expect(pixiConsole.toolbar).toBe(true);
        expect(button(pixiConsole, "log").text).toBe("log 1");
        expect(content.y).toBeGreaterThan(top);
        expect(visibleLines(pixiConsole)).toEqual(["row"]);

        pixiConsole.toolbar = false;
        render();

        expect(toolbarOf(pixiConsole)).toBeNull();
        expect(content.y).toBe(top);
    });
});

describe("scrolling", () => {
    it("keeps the reader's entry at the top when the filter changes and changes back", () => {
        const pixiConsole = create({ height: 200 });

        for (let i = 0; i < 300; i++) {
            if (i % 30 === 0) pixiConsole.error(`error ${i}`);
            else pixiConsole.log(`line ${i}`);
        }

        pixiConsole.scrollTo(150 * 20);
        render();
        expect(visibleLines(pixiConsole)[0]).toBe("error 150");

        // Only 10 errors: the view has to clamp.
        pixiConsole.filter = ["error"];
        render();
        expect(visibleLines(pixiConsole)).toContain("error 150");

        pixiConsole.filter = [...LOG_LEVELS];
        render();
        expect(visibleLines(pixiConsole)[0]).toBe("error 150");
        expect(pixiConsole.isFollowing).toBe(false);

        // Filtered out: the next displayed entry takes its place.
        pixiConsole.scrollTo(151 * 20);
        pixiConsole.filter = ["error"];
        render();
        expect(visibleLines(pixiConsole)).toContain("error 180");
    });

    it("keeps the reader's entry at the top when text is wrapped again", () => {
        const pixiConsole = create({ width: 800, height: 200 });

        for (let i = 0; i < 100; i++) pixiConsole.log(`entry ${i} ${"word ".repeat(10).trim()}`);

        pixiConsole.scrollTo(50 * 20);
        render();
        expect(visibleLines(pixiConsole)[0]).toMatch(/^entry 50 /);

        pixiConsole.resize(300, 200);
        render();
        expect(visibleLines(pixiConsole)[0]).toMatch(/^entry 50 /);
        expect(visibleLines(pixiConsole)[1]).not.toMatch(/^entry/);

        pixiConsole.resize(800, 200);
        render();
        expect(visibleLines(pixiConsole)[0]).toMatch(/^entry 50 /);

        // From an entry's second line: back to its only line, then to its second line again.
        pixiConsole.resize(300, 200);
        pixiConsole.scrollDown();
        render();

        const second = visibleLines(pixiConsole)[0];

        expect(second).not.toMatch(/^entry/);

        pixiConsole.resize(800, 200);
        render();
        expect(visibleLines(pixiConsole)[0]).toMatch(/^entry 50 /);

        pixiConsole.resize(300, 200);
        render();
        expect(visibleLines(pixiConsole)[0]).toBe(second);
    });

    it("drops evicted lines after rendering, following or scrolled up", () => {
        const pixiConsole = create({ height: 200, maxEntries: 50 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        render();
        for (let i = 50; i < 60; i++) pixiConsole.log(`line ${i}`);
        render();

        expect(visibleLines(pixiConsole).at(-1)).toBe("line 59");
        expect(pixiConsole.isFollowing).toBe(true);

        pixiConsole.scrollTo(20 * 20);
        render();
        expect(visibleLines(pixiConsole)[0]).toBe("line 30");

        for (let i = 60; i < 70; i++) pixiConsole.log(`line ${i}`);
        render();

        expect(pixiConsole.entries[0]?.message).toBe("line 20");
        expect(visibleLines(pixiConsole)[0]).toBe("line 30");

        // The top entry itself is evicted: the view moves to the oldest entry left, and stays there.
        for (let i = 70; i < 90; i++) pixiConsole.log(`line ${i}`);
        render();
        expect(visibleLines(pixiConsole)[0]).toBe("line 40");

        pixiConsole.filter = ["log"];
        render();
        expect(visibleLines(pixiConsole)[0]).toBe("line 40");

        // Evicted while the lines are rebuilt.
        for (let i = 90; i < 100; i++) pixiConsole.log(`line ${i}`);
        pixiConsole.timestamps = true;
        render();
        expect(visibleLines(pixiConsole)[0]).toMatch(/ line 50$/);
        expect(pixiConsole.isFollowing).toBe(false);
    });

    it("collapses into a line that is already on screen", () => {
        const pixiConsole = create();

        pixiConsole.log("same");
        render();
        pixiConsole.log("same");
        render();

        expect(visibleLines(pixiConsole)).toEqual(["same (×2)"]);
    });

    it("re-uses wrapped lines when only the filter changes", () => {
        const pixiConsole = create();

        for (let i = 0; i < 10; i++) pixiConsole.log(`message ${i}`);
        render();

        const getLayout = vi.spyOn(BitmapFontManager, "getLayout");
        const wraps = () => getLayout.mock.calls.filter(([text]) => text.includes("message")).length;

        pixiConsole.filter = ["warn"];
        pixiConsole.update();
        pixiConsole.filter = [...LOG_LEVELS];
        pixiConsole.update();

        expect(wraps()).toBe(0);
        expect(visibleLines(pixiConsole)).toHaveLength(10);

        pixiConsole.timestamps = true;
        pixiConsole.update();

        expect(wraps()).toBe(10);
    });
});

describe("pointer input", () => {
    const STAGE_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "pointertap", "wheel"];

    it("scrolls with the wheel and keeps the page from scrolling", () => {
        const pixiConsole = create({ height: 300 });

        for (let i = 0; i < 100; i++) pixiConsole.log(`line ${i}`);
        render();

        const bottom = pixiConsole.scrollY;
        const content = 300 - 32 - 8;

        expect(wheel(400, 200, -2, 1).defaultPrevented).toBe(true);
        expect(pixiConsole.scrollY).toBe(bottom - 2 * 20);

        wheel(400, 200, -10);
        expect(pixiConsole.scrollY).toBe(bottom - 50);

        wheel(400, 200, -1, 2);
        expect(pixiConsole.scrollY).toBe(bottom - 50 - content);

        expect(wheel(400, 450, -1).defaultPrevented).toBe(false);

        pixiConsole.hide();
        expect(wheel(400, 200, -1).defaultPrevented).toBe(false);
    });

    it("lets the page scroll over objects on top of the console, or when it isn't interactive", () => {
        const pixiConsole = create({ height: 300 });
        const cover = app.stage.addChild(new Graphics().rect(0, 0, 100, 100).fill(0xff0000));

        cover.eventMode = "static";
        cleanups.push(() => cover.destroy());
        render();

        expect(wheel(50, 50, 10).defaultPrevented).toBe(false);
        expect(wheel(400, 200, 10).defaultPrevented).toBe(true);

        pixiConsole.eventMode = "none";
        render();

        expect(wheel(400, 200, 10).defaultPrevented).toBe(false);

        // Without pixi wheel events the console can't scroll, so the page may.
        pixiConsole.eventMode = "static";
        render();
        app.renderer.events.features.wheel = false;
        cleanups.push(() => (app.renderer.events.features.wheel = true));

        expect(wheel(400, 200, 10).defaultPrevented).toBe(false);
    });

    it("ignores the wheel when created non-interactive", () => {
        const pixiConsole = create({ height: 300, interactive: false });

        for (let i = 0; i < 100; i++) pixiConsole.log(`line ${i}`);
        render();

        const bottom = pixiConsole.scrollY;

        expect(wheel(400, 200, -10).defaultPrevented).toBe(false);
        expect(pixiConsole.scrollY).toBe(bottom);
    });

    it("updates in RenderTexture passes without taking them for the screen", () => {
        const pixiConsole = create({ height: 300 });
        const texture = RenderTexture.create({ width: 800, height: 600 });

        cleanups.push(() => texture.destroy(true));
        pixiConsole.log("offscreen");
        app.renderer.render({ container: app.stage, target: texture });

        expect(visibleLines(pixiConsole)).toEqual(["offscreen"]);
        // The console only learns which renderer shows it, and so where to take wheel events, on screen.
        expect(wheel(400, 200, 10).defaultPrevented).toBe(false);

        render();

        expect(wheel(400, 200, 10).defaultPrevented).toBe(true);
    });

    it("keeps presses, taps and wheels over the console from reaching the stage", () => {
        const pixiConsole = create({ height: 300 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        render();

        const seen = listenOnStage(STAGE_EVENTS);

        tap(400, 200);
        tap(400, 200, { button: 2, buttons: 2 });
        tap(...centerOf(button(pixiConsole, "warn")));
        wheel(400, 200, 10);

        expect(seen).toEqual(Object.fromEntries(STAGE_EVENTS.map((type) => [type, 0])));

        // A press elsewhere still reaches the stage, and so does its release over the console.
        pointer("pointerdown", 400, 450);
        pointer("pointerup", 400, 200);

        expect(seen).toMatchObject({ pointerdown: 1, mousedown: 1, pointerup: 1, mouseup: 1 });
    });

    it("keeps touches on the console from reaching the stage", () => {
        const pixiConsole = create({ height: 300 });

        render();

        const seen = listenOnStage(["touchstart", "touchend", "tap", "pointertap"]);

        tap(400, 200, { pointerType: "touch", pointerId: 5 });
        tap(...centerOf(button(pixiConsole, "log")), { pointerType: "touch", pointerId: 6 });

        expect(seen).toEqual({ touchstart: 0, touchend: 0, tap: 0, pointertap: 0 });
    });

    it("drags with one pointer while others come and go", () => {
        const pixiConsole = create({ height: 300 });
        const touch = { pointerType: "touch" };

        for (let i = 0; i < 100; i++) pixiConsole.log(`line ${i}`);
        render();

        const bottom = pixiConsole.scrollY;

        pointer("pointerdown", 400, 100, { pointerId: 11, ...touch });
        pointer("pointermove", 400, 150, { pointerId: 11, ...touch });
        expect(pixiConsole.scrollY).toBe(bottom - 50);

        // A second finger taps a chip: its release doesn't end the first finger's drag.
        const [chipX, chipY] = centerOf(button(pixiConsole, "debug"));

        pointer("pointerdown", chipX, chipY, { pointerId: 12, ...touch });
        pointer("pointerup", chipX, chipY, { pointerId: 12, ...touch });
        pointer("pointermove", 400, 200, { pointerId: 11, ...touch });
        expect(pixiConsole.scrollY).toBe(bottom - 100);

        // The browser cancels the first finger: pixi doesn't report it, the console listens itself.
        window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 11 }));
        pointer("pointermove", 400, 250, { pointerId: 11, ...touch });
        expect(pixiConsole.scrollY).toBe(bottom - 100);
    });

    it("drags with the primary mouse button only, and a new press takes over", () => {
        const pixiConsole = create({ height: 300 });

        for (let i = 0; i < 100; i++) pixiConsole.log(`line ${i}`);
        render();

        const bottom = pixiConsole.scrollY;

        pointer("pointerdown", 400, 100, { button: 2, buttons: 2 });
        pointer("pointermove", 400, 150, { buttons: 2 });
        pointer("pointerup", 400, 150, { button: 2 });
        expect(pixiConsole.scrollY).toBe(bottom);

        // A press whose release was lost doesn't block the next drag.
        pointer("pointerdown", 400, 100, { pointerId: 21, pointerType: "pen" });
        pointer("pointerdown", 400, 100, { pointerId: 22, pointerType: "pen" });
        pointer("pointermove", 400, 130, { pointerId: 22, pointerType: "pen" });
        expect(pixiConsole.scrollY).toBe(bottom - 30);

        pointer("pointermove", 400, 200, { pointerId: 21, pointerType: "pen" });
        expect(pixiConsole.scrollY).toBe(bottom - 30);

        pointer("pointerup", 400, 130, { pointerId: 22, pointerType: "pen" });
        pointer("pointermove", 400, 200, { pointerId: 22, pointerType: "pen" });
        expect(pixiConsole.scrollY).toBe(bottom - 30);

        // Released outside the console.
        pointer("pointerdown", 400, 100);
        pointer("pointerup", 400, 450);
        pointer("pointermove", 400, 200, { buttons: 0 });
        expect(pixiConsole.scrollY).toBe(bottom - 30);
    });
});

describe("runtime options", () => {
    it("changes timestamps, collapseRepeats and maxEntries without losing history", () => {
        const pixiConsole = create();

        pixiConsole.print("tinted", "hotpink");
        pixiConsole.log("same").log("same");
        render();

        const [tinted, same] = pixiConsole.entries as [ConsoleEntry, ConsoleEntry];

        pixiConsole.timestamps = true;
        render();

        expect(pixiConsole.timestamps).toBe(true);
        expect(visibleLines(pixiConsole)).toEqual([
            `${time(tinted.timestamp)} tinted`,
            `${time(same.timestamp)} same (×2)`,
        ]);
        expect(tinted.color).toBe("hotpink");

        pixiConsole.timestamps = false;
        pixiConsole.collapseRepeats = false;
        pixiConsole.log("same");
        render();

        expect(pixiConsole.collapseRepeats).toBe(false);
        expect(visibleLines(pixiConsole)).toEqual(["tinted", "same (×2)", "same"]);

        pixiConsole.maxEntries = 2;
        render();

        expect(pixiConsole.maxEntries).toBe(2);
        expect(visibleLines(pixiConsole)).toEqual(["same (×2)", "same"]);
        expect(pixiConsole.counts.log).toBe(3);

        pixiConsole.maxEntries = Number.NaN;
        expect(pixiConsole.maxEntries).toBe(DEFAULT_OPTIONS.maxEntries);
    });

    it("reports its options through getters", () => {
        const originalLog = console.log;
        const pixiConsole = create({
            captureConsole: false,
            captureClear: false,
            captureErrors: false,
            showOnError: false,
            toggleKey: "KeyQ",
            filter: ["warn"],
        });

        // Nothing to capture: console is left alone.
        expect(console.log).toBe(originalLog);
        expect(pixiConsole).toMatchObject({
            captureConsole: [],
            captureErrors: false,
            showOnError: false,
            toggleKey: "KeyQ",
            autoResize: null,
            filter: ["warn"],
            maxEntries: DEFAULT_OPTIONS.maxEntries,
            collapseRepeats: true,
            timestamps: false,
            toolbar: true,
        });
    });

    it("exposes entries as ConsoleEntry", () => {
        const pixiConsole = create();

        pixiConsole.print("typed", 0xff0000);

        const entry: ConsoleEntry | undefined = pixiConsole.entries[0];
        const kind: EntryKind | undefined = entry?.kind;

        expect(entry).toMatchObject({ level: "log", message: "typed", count: 1, color: 0xff0000 });
        expect(kind).toBeUndefined();
    });
});

describe("lifecycle", () => {
    it("captures uncaught errors and shows itself", () => {
        const pixiConsole = create({ visible: false });

        window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaboom"), message: "kaboom" }));

        expect(pixiConsole.visible).toBe(true);
        expect(pixiConsole.entries.some((entry) => entry.message.startsWith("Uncaught Error: kaboom"))).toBe(true);

        window.dispatchEvent(
            new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: new Error("nope") }),
        );

        expect(pixiConsole.entries.some((entry) => entry.message.startsWith("Uncaught (in promise) Error: nope"))).toBe(
            true,
        );
    });

    it("ignores a repeated toggle key and keys typed into text fields", () => {
        const pixiConsole = create({ toggleKey: "Backquote" });
        const input = document.body.appendChild(document.createElement("input"));

        cleanups.push(() => input.remove());

        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", repeat: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote", bubbles: true }));

        expect(pixiConsole.visible).toBe(true);
    });

    it("ignores setters and methods after destroy", async () => {
        const originalLog = console.log;
        const pixiConsole = create({ autoResize: { renderer: app.renderer } });
        const levels: LogLevel[] = ["log"];

        pixiConsole.destroy();

        const resizeListeners = app.renderer.listenerCount("resize");
        const addEventListener = vi.spyOn(window, "addEventListener");

        expect(() => {
            pixiConsole.captureConsole = true;
            pixiConsole.captureErrors = true;
            pixiConsole.toggleKey = "KeyX";
            pixiConsole.autoResize = { renderer: app.renderer };
            pixiConsole.filter = levels;
            pixiConsole.maxEntries = 5;
            pixiConsole.collapseRepeats = false;
            pixiConsole.timestamps = true;
            pixiConsole.toolbar = false;
            pixiConsole.toolbar = true;
            pixiConsole.showOnError = false;
            pixiConsole.prompt = true;
            pixiConsole.evaluator = () => 1;
            pixiConsole.history = ["x"];
            pixiConsole
                .addCommand("late", () => 1)
                .removeCommand("help")
                .focusPrompt()
                .blurPrompt()
                .resize(300, 300)
                .scrollTo(10)
                .scrollBy(5)
                .scrollUp()
                .scrollDown()
                .scrollToTop()
                .scrollToBottom()
                .print("x")
                .log("x")
                .info("x")
                .debug("x")
                .warn("x")
                .error("x")
                .clear()
                .update()
                .show()
                .hide()
                .toggle();
            pixiConsole.destroy();
        }).not.toThrow();

        expect(console.log).toBe(originalLog);
        expect(app.renderer.listenerCount("resize")).toBe(resizeListeners);
        expect(addEventListener).not.toHaveBeenCalled();
        expect(pixiConsole.promptElement).toBeNull();
        await expect(pixiConsole.execute("help")).resolves.toBeUndefined();
        expect(pixiConsole.commands).toEqual({});
        expect(pixiConsole.history).toEqual([]);
        expect(document.querySelector("[data-pixi-console]")).toBeNull();
    });

    it("removes its wheel and pointercancel listeners when destroyed", () => {
        const pixiConsole = create({ height: 300 });
        const removeFromCanvas = vi.spyOn(app.canvas, "removeEventListener");
        const removeFromWindow = vi.spyOn(window, "removeEventListener");

        render();
        pixiConsole.destroy({ children: true });

        expect(removeFromCanvas).toHaveBeenCalledWith("wheel", expect.any(Function));
        expect(removeFromWindow).toHaveBeenCalledWith("pointercancel", expect.any(Function), true);
        expect(wheel(400, 200, 10).defaultPrevented).toBe(false);
    });
});

describe("command line", () => {
    it("is off by default", () => {
        const pixiConsole = create({ height: 300 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        render();

        expect(pixiConsole.prompt).toBe(false);
        expect(pixiConsole.promptElement).toBeNull();
        expect(pixiConsole.getChildByLabel("prompt")).toBeNull();
        expect(document.querySelector("[data-pixi-console]")).toBeNull();
        // Rows fill the space between the toolbar and the bottom padding, as before.
        expect(visibleLines(pixiConsole)).toHaveLength((300 - 32 - 8) / 20);
    });

    it("places the input over the prompt row", async () => {
        const pixiConsole = create({ prompt: true });

        pixiConsole.position.set(50, 40);
        pixiConsole.scale.set(1.25);
        render();

        expectAligned(pixiConsole);
        expect(hostOf(pixiConsole)?.parentNode).toBe(app.canvas.parentNode);
        expect(hostOf(pixiConsole)?.previousElementSibling).toBe(app.canvas);

        const input = promptOf(pixiConsole);

        // Playwright only clicks an element that would get the click, so the input is on top.
        await userEvent.click(input);

        expect(document.activeElement).toBe(input);
        expect(glyphOf(pixiConsole).alpha).toBe(1);

        pixiConsole.blurPrompt();

        expect(document.activeElement).not.toBe(input);
        expect(glyphOf(pixiConsole).alpha).toBe(0.5);
    });

    it.each<[string, () => () => void]>([
        [
            "page scroll and a positioned, bordered wrapper",
            () => {
                const wrapper = document.createElement("div");
                const spacer = document.body.appendChild(document.createElement("div"));

                wrapper.style.cssText = "position: relative; border: 7px solid #333; padding: 5px; margin: 13px";
                spacer.style.height = "3000px";
                app.canvas.replaceWith(wrapper);
                wrapper.append(app.canvas);
                window.scrollTo(0, 120);
                expect(window.scrollY).toBe(120);

                return () => {
                    wrapper.replaceWith(app.canvas);
                    spacer.remove();
                    window.scrollTo(0, 0);
                };
            },
        ],
        [
            "a positioned body with a margin",
            () => {
                const { cssText } = document.body.style;

                document.body.style.position = "relative";
                document.body.style.margin = "30px 0 0 25px";

                return () => (document.body.style.cssText = cssText);
            },
        ],
        ["a canvas scaled by CSS", () => styleCanvas({ width: "400px", height: "300px" })],
        [
            "a canvas with its own transform",
            () => styleCanvas({ transform: "scale(0.75) translate(10px, 5px)", transformOrigin: "20px 30px" }),
        ],
        ["canvas padding and border", () => styleCanvas({ padding: "6px", border: "2px solid red" })],
    ])("stays aligned with %s", (_, change) => {
        const pixiConsole = create({ prompt: true, height: 300 });

        pixiConsole.position.set(30, 100);
        render();
        expectAligned(pixiConsole);

        changePage(change);
        render();

        expectAligned(pixiConsole);
        expect(hostOf(pixiConsole)?.parentNode).toBe(app.canvas.parentNode);
    });

    it("follows scene graph moves in the same frame, and the renderer size", () => {
        const parent = app.stage.addChild(new Container());
        const pixiConsole = create({
            prompt: true,
            autoResize: {
                renderer: app.renderer,
                layout: (screen) => ({ y: screen.height / 2, width: screen.width, height: screen.height / 2 }),
            },
        });

        cleanups.push(() => parent.destroy());
        parent.addChild(pixiConsole);
        render();
        expectAligned(pixiConsole);

        parent.position.set(40, -30);
        parent.scale.set(0.8, 0.9);
        render();
        expectAligned(pixiConsole);

        try {
            app.renderer.resize(400, 800);
            render();

            expect(pixiConsole.consoleWidth).toBe(400);
            expectAligned(pixiConsole);
        } finally {
            app.renderer.resize(800, 600);
        }

        render();
        expectAligned(pixiConsole);
    });

    it("runs what is typed", async () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);

        render();
        await userEvent.click(input);
        await userEvent.keyboard("help{Enter}");
        render();

        expect(pixiConsole.entries.at(-2)).toMatchObject({ kind: "input", level: "log", message: "> help" });
        expect(pixiConsole.entries.at(-1)).toMatchObject({ kind: "result", level: "log" });
        expect(pixiConsole.entries.at(-1)?.message).toMatch(/^Commands:\n {2}clear +Removes every entry\n/);
        expect(input.value).toBe("");
        expect(document.activeElement).toBe(input);
        expect(visibleLines(pixiConsole)).toContain("> help");
        expect(pixiConsole.history).toEqual(["help"]);
    });

    it("displays its entries whatever the filter, without counting them", async () => {
        const pixiConsole = create({ prompt: true, filter: ["error"] });

        await pixiConsole.execute("help");
        render();

        expect(visibleLines(pixiConsole)).toContain("> help");
        expect(visibleLines(pixiConsole)).toContain("Commands:");
        expect(pixiConsole.counts).toEqual({ log: 0, info: 0, debug: 0, warn: 0, error: 0 });
        expect(pixiConsole.visible).toBe(true);

        // Not even errors, which don't show a hidden console either.
        pixiConsole.hide();
        await pixiConsole.execute("nope");
        pixiConsole.addCommand("fail", () => {
            throw new Error("failed");
        });
        await pixiConsole.execute("fail");

        expect(pixiConsole.counts).toEqual({ log: 0, info: 0, debug: 0, warn: 0, error: 0 });
        expect(pixiConsole.visible).toBe(false);
    });

    it("opens and focuses with the toggle key, which can then be typed", async () => {
        const pixiConsole = create({ prompt: true, visible: false, toggleKey: "Backquote" });
        const input = promptOf(pixiConsole);
        const keydown = vi.fn();
        const keyup = vi.fn();

        render();
        blurActive();
        window.addEventListener("keydown", keydown);
        window.addEventListener("keyup", keyup);
        cleanups.push(() => {
            window.removeEventListener("keydown", keydown);
            window.removeEventListener("keyup", keyup);
        });

        await userEvent.keyboard("`");

        expect(pixiConsole.visible).toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe("");

        keydown.mockClear();
        keyup.mockClear();
        await userEvent.keyboard("a`b");

        expect(input.value).toBe("a`b");
        expect(pixiConsole.visible).toBe(true);
        expect(keydown).not.toHaveBeenCalled();
        expect(keyup).toHaveBeenCalled();
    });

    it("clears the line on Escape, then gives the keys back to the page", async () => {
        const pixiConsole = create({ prompt: true, toggleKey: "Backquote" });
        const input = promptOf(pixiConsole);

        render();
        await userEvent.click(input);
        await userEvent.keyboard("abc{Escape}");

        expect(input.value).toBe("");
        expect(document.activeElement).toBe(input);

        await userEvent.keyboard("{Escape}");

        expect(document.activeElement).not.toBe(input);
        expect(pixiConsole.visible).toBe(true);

        await userEvent.keyboard("`");

        expect(pixiConsole.visible).toBe(false);
        expect(input.isConnected).toBe(false);
    });

    it("recalls earlier lines with the arrow keys", async () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);

        render();
        await userEvent.click(input);
        await userEvent.keyboard("a{Enter}  b {Enter}draft{ArrowUp}");
        expect(input.value).toBe("b");

        await userEvent.keyboard("{ArrowUp}");
        expect(input.value).toBe("a");

        await userEvent.keyboard("{ArrowDown}{ArrowDown}");
        expect(input.value).toBe("draft");
        expect(pixiConsole.history).toEqual(["a", "b"]);

        pixiConsole.history = ["x", "y"];
        await userEvent.fill(input, "");
        await userEvent.keyboard("{ArrowUp}");

        expect(pixiConsole.history).toEqual(["x", "y"]);
        expect(input.value).toBe("y");
    });

    it("completes command names with Tab", async () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);
        const prevented: boolean[] = [];

        input.addEventListener("keydown", (event) => {
            if (event.key === "Tab") prevented.push(event.defaultPrevented);
        });
        render();
        await userEvent.click(input);
        await userEvent.keyboard("he{Tab}");

        expect(input.value).toBe("help ");

        pixiConsole.addCommand("hello", () => "hi");
        await userEvent.fill(input, "HE");
        await userEvent.keyboard("{Tab}");

        expect(input.value).toBe("hel");

        await userEvent.keyboard("{Tab}");

        expect(input.value).toBe("hel");
        expect(pixiConsole.entries.at(-1)).toMatchObject({ kind: "result", message: "hello  help" });

        // Nothing to complete: Tab moves the focus as usual.
        await userEvent.fill(input, "");
        await userEvent.keyboard("{Tab}");

        expect(prevented).toEqual([true, true, true, false]);
        expect(document.activeElement).not.toBe(input);
    });

    it("scrolls the log with PageUp and PageDown", async () => {
        const pixiConsole = create({ prompt: true, height: 300 });

        for (let i = 0; i < 100; i++) pixiConsole.log(`line ${i}`);
        render();

        const bottom = pixiConsole.scrollY;
        const content = 300 - 32 - PROMPT_HEIGHT - 4;

        await userEvent.click(promptOf(pixiConsole));
        await userEvent.keyboard("{PageUp}{PageUp}");
        expect(pixiConsole.scrollY).toBe(bottom - 2 * content);

        await userEvent.keyboard("{PageDown}");
        expect(pixiConsole.scrollY).toBe(bottom - content);

        // Entering a line follows the log again.
        await userEvent.keyboard("help{Enter}");
        render();
        expect(pixiConsole.isFollowing).toBe(true);
        expect(visibleLines(pixiConsole).at(-1)).toBe("  help [command]  Lists commands, or describes one");
    });

    it("runs lines from code", async () => {
        const evaluator = vi.fn<ConsoleEvaluator>((line) => {
            switch (line) {
                case "1+1":
                    return 2;
                case "text":
                    return "1";
                case "reject":
                    return Promise.reject(new Error("nope"));
                case "throw":
                    throw new Error("thrown");
                default:
                    return undefined;
            }
        });
        const pixiConsole = create({ evaluator });

        // Synchronous results are printed right away.
        const sum = pixiConsole.execute("  1+1  ");

        expect(messages(pixiConsole)).toEqual(["> 1+1", "< 2"]);
        await expect(sum).resolves.toBe(2);
        expect(pixiConsole.lastResult).toBe(2);
        expect(evaluator).toHaveBeenCalledWith("1+1", { pixiConsole, line: "1+1", lastResult: undefined });

        await pixiConsole.execute("text");
        expect(messages(pixiConsole).at(-1)).toBe('< "1"');

        await pixiConsole.execute("nothing");
        expect(pixiConsole.entries.at(-1)).toMatchObject({
            message: "< undefined",
            color: DEFAULT_OPTIONS.colors.debug,
        });
        expect(pixiConsole.lastResult).toBeUndefined();

        await expect(pixiConsole.execute("reject")).resolves.toBeUndefined();
        expect(pixiConsole.entries.at(-1)).toMatchObject({ kind: "result", level: "error" });
        expect(messages(pixiConsole).at(-1)).toMatch(/^Uncaught \(in promise\) Error: nope\n/);

        await expect(pixiConsole.execute("throw")).resolves.toBeUndefined();
        expect(messages(pixiConsole).at(-1)).toMatch(/^Uncaught Error: thrown\n/);

        // An EvalError whose message can't even be read.
        const unreadable = new Proxy(new EvalError("hidden"), {
            get: (target, key) => {
                if (key === "message") throw new Error("no message");

                return Reflect.get(target, key) as unknown;
            },
        });

        pixiConsole.evaluator = () => {
            throw unreadable;
        };
        await pixiConsole.execute("blocked");
        expect(messages(pixiConsole).at(-1)).toMatch(/^EvalError: \nJavaScript evaluation is blocked/);
        pixiConsole.evaluator = evaluator;

        // Blank lines are ignored.
        const count = pixiConsole.entries.length;

        await expect(pixiConsole.execute("   ")).resolves.toBeUndefined();
        expect(pixiConsole.entries).toHaveLength(count);
        expect(evaluator).toHaveBeenCalledTimes(5);
    });

    it("runs commands and prints what they return", async () => {
        const pixiConsole = create({
            commands: {
                chatty: () => {
                    console.log("said on the way");

                    return { done: true };
                },
                slow: {
                    usage: "<ms>",
                    description: "Answers later",
                    run: async ([ms = "0"], { line, lastResult }) => {
                        await new Promise((resolve) => setTimeout(resolve, Number(ms)));

                        return `${line} after ${JSON.stringify(lastResult)}`;
                    },
                },
                boom: () => {
                    throw new Error("bad");
                },
                later: () => Promise.reject(new Error("rejected")),
            },
        });

        await pixiConsole.execute("chatty");
        expect(messages(pixiConsole)).toEqual(["> chatty", "said on the way", "{ done: true }"]);
        expect(pixiConsole.entries.map((entry) => entry.kind)).toEqual(["input", undefined, "result"]);

        const slow = pixiConsole.execute('SLOW "5"');

        expect(messages(pixiConsole).at(-1)).toBe('> SLOW "5"');
        await expect(slow).resolves.toBe('SLOW "5" after {"done":true}');
        expect(messages(pixiConsole).at(-1)).toBe('SLOW "5" after {"done":true}');

        await expect(pixiConsole.execute("boom")).resolves.toBeUndefined();
        expect(pixiConsole.entries.at(-1)).toMatchObject({ kind: "result", level: "error" });
        expect(messages(pixiConsole).at(-1)).toMatch(/^Error: bad\n\s+at /);

        await expect(pixiConsole.execute("later")).resolves.toBeUndefined();
        expect(messages(pixiConsole).at(-1)).toMatch(/^Error: rejected\n/);

        await pixiConsole.execute("nope --flag");
        expect(pixiConsole.entries.at(-1)).toMatchObject({
            kind: "result",
            level: "warn",
            message: 'Unknown command "nope". Type help to list commands.',
        });
    });

    it("keeps lastResult when a command returns nothing", async () => {
        const pixiConsole = create({ evaluator: (line) => (line === "1+1" ? 2 : undefined) });

        await pixiConsole.execute("1+1");
        await pixiConsole.execute("clear");

        expect(pixiConsole.entries).toHaveLength(0);
        expect(pixiConsole.lastResult).toBe(2);

        const help = await pixiConsole.execute("help");

        expect(typeof help).toBe("string");
        expect(pixiConsole.lastResult).toBe(help);
    });

    it("adds, replaces and removes commands", async () => {
        const commands = { spawn: { usage: "<count>", description: "Spawns", run: () => "spawned" } };
        const pixiConsole = create({ commands });

        expect(Object.keys(pixiConsole.commands)).toEqual(["clear", "help", "spawn"]);
        expect(pixiConsole.commands.spawn).toBe(commands.spawn);

        const clear = vi.fn(() => "custom clear");

        pixiConsole.addCommand("Clear", clear).removeCommand("spawn").removeCommand("unknown");

        expect(Object.keys(pixiConsole.commands)).toEqual(["clear", "help"]);
        expect(await pixiConsole.execute("CLEAR now")).toBe("custom clear");
        expect(clear).toHaveBeenCalledWith(["now"], expect.objectContaining({ line: "CLEAR now" }));

        pixiConsole.removeCommand("clear");
        await pixiConsole.execute("clear");

        expect(pixiConsole.entries.at(-1)?.level).toBe("warn");
        expect(() => pixiConsole.addCommand("two words", () => 1)).toThrow(TypeError);

        // The options object and the defaults are never changed.
        expect(Object.keys(commands)).toEqual(["spawn"]);
        expect(DEFAULT_OPTIONS.commands).toEqual({});
    });

    it("rejects invalid command names before touching the page", () => {
        const originalLog = console.log;

        expect(() => new PixiConsole({ commands: { "a.b": () => 1 } })).toThrow(/Invalid command name "a.b"/);
        expect(console.log).toBe(originalLog);
    });

    it("evaluates JavaScript with createJsEvaluator", async () => {
        const log = vi.spyOn(console, "log");
        const pixiConsole = create({ evaluator: createJsEvaluator({ scope: { app } }) });

        expect(await pixiConsole.execute("app.screen.width")).toBe(800);
        expect(await pixiConsole.execute("$_ / 2")).toBe(400);
        expect(await pixiConsole.execute("await Promise.resolve('x')")).toBe("x");
        expect(messages(pixiConsole)).toEqual([
            "> app.screen.width",
            "< 800",
            "> $_ / 2",
            "< 400",
            "> await Promise.resolve('x')",
            '< "x"',
        ]);

        await pixiConsole.execute("missing + 1");
        expect(messages(pixiConsole).at(-1)).toMatch(/^Uncaught ReferenceError: missing is not defined/);

        // Commands come first; parentheses force JavaScript.
        expect(await pixiConsole.execute("help")).toMatch(
            /\nAnything else runs as JavaScript\. \$_ is the last result\.$/,
        );
        await pixiConsole.execute("(help)");
        expect(messages(pixiConsole).at(-1)).toMatch(/^Uncaught ReferenceError: help is not defined/);

        expect(log).not.toHaveBeenCalled();
    });

    it("explains when the page's Content-Security-Policy blocks evaluation", async () => {
        const iframe = document.createElement("iframe");
        const loaded = new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));

        iframe.srcdoc = `<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'">`;
        document.body.append(iframe);
        cleanups.push(() => iframe.remove());
        await loaded;

        const frame = iframe.contentWindow as unknown as typeof globalThis;
        const pixiConsole = create({ evaluator: (line) => frame.eval(line) as unknown });

        await expect(pixiConsole.execute("1 + 1")).resolves.toBeUndefined();

        const failures = pixiConsole.entries.filter((entry) => entry.level === "error");

        expect(failures).toHaveLength(1);
        expect(failures[0]?.message).toMatch(/^EvalError: /);
        expect(failures[0]?.message).toContain("Content-Security-Policy");
        expect(failures[0]?.message).not.toMatch(/\n\s+at /);

        // Commands still work.
        expect(await pixiConsole.execute("help")).toMatch(/^Commands:/);
    });

    it("swaps the default placeholder when the evaluator changes", () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);

        expect(input.placeholder).toBe("Type help and press Enter");

        pixiConsole.evaluator = createJsEvaluator();
        expect(input.placeholder).toBe("Type a command or JavaScript");

        input.placeholder = "Mine";
        pixiConsole.evaluator = null;
        expect(input.placeholder).toBe("Mine");
        expect(pixiConsole.evaluator).toBeNull();
    });

    it("takes the input out of the page while the console isn't displayed", async () => {
        const parent = app.stage.addChild(new Container());
        const pixiConsole = create({ prompt: true, height: 300 });
        const input = promptOf(pixiConsole);

        cleanups.push(() => parent.destroy());
        parent.addChild(pixiConsole);
        render();
        await userEvent.click(input);
        await userEvent.keyboard("draft");

        pixiConsole.hide();

        expect(input.isConnected).toBe(false);
        expect(document.activeElement).not.toBe(input);

        pixiConsole.show();
        render();

        expect(input.isConnected).toBe(true);
        expect(input.value).toBe("draft");

        const hidden: [string, () => void, () => void][] = [
            ["visible", () => (pixiConsole.visible = false), () => (pixiConsole.visible = true)],
            ["renderable", () => (pixiConsole.renderable = false), () => (pixiConsole.renderable = true)],
            ["parent visible", () => (parent.visible = false), () => (parent.visible = true)],
            ["parent alpha", () => (parent.alpha = 0), () => (parent.alpha = 1)],
        ];

        for (const [name, hide, show] of hidden) {
            hide();
            render();
            expect(input.isConnected, name).toBe(false);

            show();
            render();
            expect(input.isConnected, name).toBe(true);
        }

        parent.alpha = 0.5;
        render();
        expect(getComputedStyle(hostOf(pixiConsole)!).opacity).toBe("0.5");

        pixiConsole.removeFromParent();
        expect(input.isConnected).toBe(false);

        parent.addChild(pixiConsole);
        render();
        expect(input.isConnected).toBe(true);
    });

    it("takes the input out of the page while the canvas is out of it or fullscreen", () => {
        const pixiConsole = create({ prompt: true, height: 300 });
        const input = promptOf(pixiConsole);
        const { parentNode, nextSibling } = app.canvas;

        render();
        expect(input.isConnected).toBe(true);

        app.canvas.remove();
        cleanups.push(() => parentNode?.insertBefore(app.canvas, nextSibling));
        render();
        expect(input.isConnected).toBe(false);

        parentNode?.insertBefore(app.canvas, nextSibling);
        render();
        expect(input.isConnected).toBe(true);

        // Nothing can be drawn over a fullscreen element.
        const fullscreen = vi.spyOn(document, "fullscreenElement", "get").mockReturnValue(app.canvas);

        render();
        expect(input.isConnected).toBe(false);

        fullscreen.mockReturnValue(null);
        render();
        expectAligned(pixiConsole);
    });

    it("works with a canvas in a shadow root", async () => {
        const pixiConsole = create({ prompt: true, height: 300 });
        const shadowHost = document.createElement("div");
        const root = shadowHost.attachShadow({ mode: "open" });
        const input = promptOf(pixiConsole);

        app.canvas.before(shadowHost);
        root.append(app.canvas);
        cleanups.push(() => shadowHost.replaceWith(app.canvas));

        // pixi's renderingToScreen is false for a canvas outside document.body.
        render();
        expect(app.renderer.renderingToScreen).toBe(false);
        expect(hostOf(pixiConsole)?.parentNode).toBe(root);
        expectAligned(pixiConsole);

        await userEvent.click(input);
        await userEvent.keyboard("help{Enter}");

        expect(input.matches(":focus")).toBe(true);
        expect(messages(pixiConsole)).toContain("> help");

        pixiConsole.visible = false;
        render();
        expect(input.isConnected).toBe(false);
    });

    it("isn't moved or detached by RenderTexture passes", () => {
        const pixiConsole = create({ prompt: true, height: 300 });
        const texture = RenderTexture.create({ width: 800, height: 600 });

        cleanups.push(() => texture.destroy(true));
        render();

        const before = promptOf(pixiConsole).getBoundingClientRect();

        pixiConsole.x = 100;
        pixiConsole.visible = false;
        pixiConsole.visible = true;
        app.renderer.render({ container: app.stage, target: texture });

        expect(promptOf(pixiConsole).isConnected).toBe(true);
        expect(promptOf(pixiConsole).getBoundingClientRect().left).toBe(before.left);

        render();
        expectAligned(pixiConsole);
    });

    it("removes the input when destroyed", async () => {
        const pixiConsole = create({ prompt: true, toggleKey: "Backquote" });
        const input = promptOf(pixiConsole);

        render();
        await userEvent.click(input);
        pixiConsole.destroy();

        expect(input.isConnected).toBe(false);
        expect(document.querySelector("[data-pixi-console]")).toBeNull();
        expect(pixiConsole.promptElement).toBeNull();
        expect(() => render()).not.toThrow();
        await expect(userEvent.keyboard("`a{Enter}")).resolves.toBeUndefined();
    });

    it("drops results that arrive after destroy", async () => {
        let resolve!: (value: unknown) => void;
        const pixiConsole = create({ commands: { wait: () => new Promise((done) => (resolve = done)) } });
        const done = pixiConsole.execute("wait");

        pixiConsole.destroy();
        resolve({ big: "object" });

        await expect(done).resolves.toEqual({ big: "object" });
        expect(pixiConsole.lastResult).toBeUndefined();
    });

    it.each(
        (["bitmap", "canvas"] as const).flatMap((textRenderer) =>
            [true, false].flatMap((toolbar) =>
                [true, false].map((interactive) => ({ textRenderer, toolbar, interactive })),
            ),
        ),
    )("works with $textRenderer text, toolbar $toolbar and interactive $interactive", async (options) => {
        const pixiConsole = create({ ...options, prompt: true, height: 300 });
        const input = promptOf(pixiConsole);

        render();
        expectAligned(pixiConsole);

        await userEvent.click(input);
        expect(document.activeElement).toBe(input);

        await userEvent.keyboard("help{Enter}");
        expect(messages(pixiConsole)).toContain("> help");
        expect(glyphOf(pixiConsole)).toBeInstanceOf(options.textRenderer === "bitmap" ? BitmapText : Text);
        expect(glyphOf(pixiConsole).text).toBe(">");
    });

    it("gives each console its own input, history and commands", async () => {
        const a = create({ prompt: true, height: 250 });
        const b = create({ prompt: true, height: 250 });

        b.y = 300;
        render();

        const [inputA, inputB] = [promptOf(a), promptOf(b)];
        const hosts = [...document.querySelectorAll("[data-pixi-console]")];

        expect(hosts).toEqual([hostOf(a), hostOf(b)]);
        expect(hosts.every((host) => host.parentNode === app.canvas.parentNode)).toBe(true);

        await userEvent.click(inputA);
        render();
        render();

        expect(document.activeElement).toBe(inputA);

        await userEvent.keyboard("hi{Enter}typed");
        expect(inputA.value).toBe("typed");
        expect(inputB.value).toBe("");
        expect(a.history).toEqual(["hi"]);
        expect(b.history).toEqual([]);

        a.addCommand("only-a", () => "a");
        await b.execute("only-a");
        expect(b.entries.at(-1)?.level).toBe("warn");
        expect(a.commands).toHaveProperty("only-a");
        expect(b.commands).not.toHaveProperty("only-a");
    });

    it("can be turned on and off at runtime", () => {
        const pixiConsole = create({ height: 300 });

        for (let i = 0; i < 50; i++) pixiConsole.log(`line ${i}`);
        render();

        const rowCount = visibleLines(pixiConsole).length;

        pixiConsole.prompt = true;
        render();

        const input = promptOf(pixiConsole);

        expect(visibleLines(pixiConsole).length).toBeLessThan(rowCount);
        expect(visibleLines(pixiConsole).at(-1)).toBe("line 49");
        expect(input.isConnected).toBe(true);
        expect(glyphOf(pixiConsole).visible).toBe(true);

        // The newest line ends above the prompt row.
        const newest = rows(pixiConsole).find((row) => row.visible && row.text === "line 49");

        expect(newest!.getBounds().bottom).toBeLessThanOrEqual(300 - PROMPT_HEIGHT);

        pixiConsole.prompt = false;
        render();

        expect(input.isConnected).toBe(false);
        expect(pixiConsole.promptElement).toBe(input);
        expect(glyphOf(pixiConsole).visible).toBe(false);
        expect(visibleLines(pixiConsole)).toHaveLength(rowCount);
    });

    it("pastes several lines as one", () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);
        const data = new DataTransfer();

        render();
        data.setData("text/plain", "a\nb\r\nc");
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));

        expect(input.value).toBe("a b c");
    });

    it("doesn't toggle while typing into an input in a shadow root", async () => {
        const pixiConsole = create({ visible: false, toggleKey: "Backquote" });
        const host = document.body.appendChild(document.createElement("div"));
        const field = host.attachShadow({ mode: "open" }).appendChild(document.createElement("input"));

        cleanups.push(() => host.remove());
        field.focus();
        await userEvent.keyboard("`");

        expect(pixiConsole.visible).toBe(false);
        expect(field.value).toBe("`");
    });

    it("focuses from code once it can be placed", () => {
        const parent = app.stage.addChild(new Container());
        // The renderer is known, but the console isn't on the stage yet.
        const pixiConsole = new PixiConsole({ prompt: true, toggleKey: null, autoResize: { renderer: app.renderer } });
        const input = promptOf(pixiConsole);

        consoles.push(pixiConsole);
        cleanups.push(() => parent.destroy());
        blurActive();

        pixiConsole.focusPrompt();

        expect(pixiConsole.visible).toBe(true);
        expect(input.isConnected).toBe(false);

        parent.addChild(pixiConsole);
        render();

        expect(document.activeElement).toBe(input);

        // Placed and focused right away, e.g. inside a click handler on a phone.
        pixiConsole.hide();
        render();
        pixiConsole.focusPrompt();

        expect(document.activeElement).toBe(input);
        expectAligned(pixiConsole);

        // Not while a parent is hidden, and hiding the console cancels the pending focus.
        pixiConsole.blurPrompt().hide();
        parent.visible = false;
        pixiConsole.focusPrompt();

        expect(input.isConnected).toBe(false);

        pixiConsole.hide();
        parent.visible = true;
        pixiConsole.show();
        render();

        expect(input.isConnected).toBe(true);
        expect(document.activeElement).not.toBe(input);

        // Nothing to focus without a prompt.
        const plain = create({ visible: false });

        expect(plain.focusPrompt().visible).toBe(false);
        expect(plain.promptElement).toBeNull();
    });

    it("tells when it can't find the canvas", async () => {
        const pixiConsole = create({ prompt: true });
        const onRender = (pixiConsole.getChildByLabel("lines") as Container).onRender as (renderer?: Renderer) => void;

        // pixi.js before 8.7 calls onRender without the renderer.
        onRender();
        onRender();

        const notices = pixiConsole.entries.filter((entry) => entry.level === "warn");

        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            kind: "result",
            message: "The command line needs pixi.js 8.7+ or the autoResize option to find the canvas.",
        });
        expect(promptOf(pixiConsole).isConnected).toBe(false);
        expect(await pixiConsole.execute("help")).toMatch(/^Commands:/);

        // The renderer passed on 8.7+ is enough.
        render();
        expect(promptOf(pixiConsole).isConnected).toBe(true);
    });

    it("draws the prompt row under the log", () => {
        const pixiConsole = create({ prompt: true, height: 300 });
        const glyph = glyphOf(pixiConsole);

        render();

        expect(glyph.eventMode).toBe("none");
        expect(glyph.tint).toBe(DEFAULT_OPTIONS.colors.info);
        expect(glyph.x).toBe(DEFAULT_OPTIONS.padding);
        expect(glyph.y).toBeGreaterThanOrEqual(300 - PROMPT_HEIGHT);
        expect(glyph.y + glyph.height).toBeLessThanOrEqual(300);
        expect(pixiConsole.getChildIndex(glyph)).toBe(pixiConsole.children.length - 1);

        pixiConsole.resize(500, 200);
        expect(glyph.y).toBeGreaterThanOrEqual(200 - PROMPT_HEIGHT);

        const input = promptOf(pixiConsole);

        expect(input.getAttribute("aria-label")).toBe("Console command");
        expect(getComputedStyle(input).color).toBe("rgb(230, 237, 243)");
        expect(getComputedStyle(input).caretColor).toBe("rgb(88, 166, 255)");
    });

    it("ignores Enter while composing text with an IME", async () => {
        const pixiConsole = create({ prompt: true });
        const input = promptOf(pixiConsole);
        const session = cdp();

        render();
        await userEvent.click(input);
        await session.send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 });

        expect(input.value).toBe("にほん");

        await userEvent.keyboard("{Enter}");

        expect(pixiConsole.entries).toHaveLength(0);

        await session.send("Input.insertText", { text: "にほん" });
        await userEvent.keyboard("{Enter}");

        expect(messages(pixiConsole)[0]).toBe("> にほん");
    });
});
