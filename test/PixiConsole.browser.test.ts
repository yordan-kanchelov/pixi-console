import { Application, BitmapText, Text, type Container } from "pixi.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PixiConsole, type PixiConsoleInit } from "../src";

let app: Application;
const consoles: PixiConsole[] = [];

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

/** Text of the visible rows, top to bottom. */
function visibleLines(pixiConsole: PixiConsole): string[] {
    const lines = pixiConsole.getChildByLabel("lines") as Container;

    return (lines.children as (Text | BitmapText)[])
        .filter((row) => row.visible)
        .sort((a, b) => a.y - b.y)
        .map((row) => row.text);
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

        app.renderer.resize(400, 800);

        expect(pixiConsole.consoleWidth).toBe(400);
        expect(pixiConsole.consoleHeight).toBe(400);
        expect(pixiConsole.y).toBe(400);

        app.renderer.resize(800, 600);
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
        const pixiConsole = new PixiConsole({ toggleKey: "Backquote" });

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
