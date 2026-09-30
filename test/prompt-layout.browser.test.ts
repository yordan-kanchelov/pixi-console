import { Application, Point } from "pixi.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS, PixiConsole, type PixiConsoleInit } from "../src";

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
});

function create(options: PixiConsoleInit = {}): PixiConsole {
    const pixiConsole = new PixiConsole({ visible: true, toggleKey: null, prompt: true, ...options });

    consoles.push(pixiConsole);
    app.stage.addChild(pixiConsole);

    return pixiConsole;
}

function render(): void {
    app.renderer.render(app.stage);
}

/** Height of the command line row with the default font size and padding. */
const PROMPT_HEIGHT = Math.round(DEFAULT_OPTIONS.fontSize * 1.4) + DEFAULT_OPTIONS.padding;

/** The console's command line input; throws when there is none. */
function promptOf(pixiConsole: PixiConsole): HTMLInputElement {
    const input = pixiConsole.promptElement;

    if (!input) throw new Error("No command line");

    return input;
}

/** The host element the console inserted next to the canvas. */
function hostOf(pixiConsole: PixiConsole): Element | null {
    return promptOf(pixiConsole).closest("[data-pixi-console]");
}

/** The prompt row, mapped from the scene graph through the canvas box, is where the input is on the page. */
function expectAligned(pixiConsole: PixiConsole): void {
    const canvas = app.canvas;
    const rect = canvas.getBoundingClientRect();
    const unitX = rect.width / app.screen.width;
    const unitY = rect.height / app.screen.height;
    const from = pixiConsole.toGlobal(new Point(0, pixiConsole.consoleHeight - PROMPT_HEIGHT));
    const to = pixiConsole.toGlobal(new Point(pixiConsole.consoleWidth, pixiConsole.consoleHeight));
    const box = promptOf(pixiConsole).getBoundingClientRect();
    const expected = {
        left: rect.left + from.x * unitX,
        top: rect.top + from.y * unitY,
        right: rect.left + to.x * unitX,
        bottom: rect.top + to.y * unitY,
    };

    expect(promptOf(pixiConsole).isConnected).toBe(true);

    for (const side of ["left", "top", "right", "bottom"] as const) {
        expect(Math.abs(box[side] - expected[side]), `${side}: ${box[side]} vs ${expected[side]}`).toBeLessThanOrEqual(
            0.6,
        );
    }
}

/** What a tap at a point of the input's box, relative to its left and vertical centre, would hit. */
function hitAt(input: HTMLInputElement, x: number): Element | null {
    const box = input.getBoundingClientRect();

    return document.elementFromPoint(box.left + x, box.top + box.height / 2);
}

/** Changes the page and undoes it after the test. */
function changePage(change: () => () => void): void {
    cleanups.push(change());
}

/** Wraps the canvas in a new element styled with `cssText`; undone after the test. */
function wrapCanvas(cssText: string): HTMLDivElement {
    const wrapper = document.createElement("div");

    wrapper.style.cssText = cssText;
    app.canvas.replaceWith(wrapper);
    wrapper.append(app.canvas);
    cleanups.push(() => wrapper.replaceWith(app.canvas));

    return wrapper;
}

/** A block of the given height, to make room to scroll. */
function spacer(height: number): HTMLDivElement {
    const element = document.createElement("div");

    element.style.height = `${height}px`;

    return element;
}

/** Sets inline styles on the canvas and restores the previous ones after the test. */
function styleCanvas(styles: Partial<CSSStyleDeclaration>): void {
    changePage(() => {
        const { cssText } = app.canvas.style;

        Object.assign(app.canvas.style, styles);

        return () => (app.canvas.style.cssText = cssText);
    });
}

describe("scrolled containers", () => {
    it.each<[string, () => void]>([
        [
            "an overflow container that isn't positioned",
            () => {
                const scroller = wrapCanvas("overflow: auto; width: 300px; height: 300px; margin: 13px");

                scroller.scrollTo(40, 120);
            },
        ],
        [
            "nested overflow containers with borders and padding",
            () => {
                const outer = wrapCanvas("overflow: auto; height: 400px; border: 3px solid red; padding: 5px");
                // Wraps the canvas inside `outer`.
                const inner = wrapCanvas("overflow: scroll; width: 350px; height: 500px; border: 2px solid blue");

                outer.scrollTo(0, 30);
                inner.scrollTo(25, 90);
            },
        ],
        [
            "a sticky canvas in an overflow container",
            () => {
                const scroller = wrapCanvas("overflow: auto; height: 300px");

                scroller.append(spacer(2000));
                styleCanvas({ position: "sticky", top: "0px" });
                scroller.scrollTo(0, 700);
            },
        ],
        [
            "a relative canvas in a positioned overflow container",
            () => {
                const scroller = wrapCanvas("position: relative; overflow: auto; height: 300px");

                styleCanvas({ position: "relative", left: "4px", top: "6px" });
                scroller.scrollTo(0, 150);
            },
        ],
    ])("stays aligned with %s", (_, change) => {
        const pixiConsole = create({ height: 300 });

        pixiConsole.position.set(30, 100);
        render();
        expectAligned(pixiConsole);

        change();
        render();

        expectAligned(pixiConsole);
    });

    it("is clipped to what the container shows of the canvas", () => {
        const scroller = wrapCanvas("overflow: auto; width: 300px; height: 300px; margin-top: 100px");
        const pixiConsole = create({ height: 200 });
        const input = promptOf(pixiConsole);

        scroller.append(spacer(1000));
        // The prompt row is at the bottom of the canvas, below what the container shows.
        pixiConsole.position.set(0, 400);
        render();
        expectAligned(pixiConsole);

        expect(input.getBoundingClientRect().top).toBeGreaterThan(scroller.getBoundingClientRect().bottom);
        expect(hitAt(input, 100)).not.toBe(input);

        // Scrolled into view, up to the container's right edge (its scrollbar is not the input).
        scroller.scrollTo(0, 400);
        render();
        expectAligned(pixiConsole);

        expect(hitAt(input, 100)).toBe(input);
        expect(hitAt(input, scroller.clientWidth - 5)).toBe(input);
        expect(hitAt(input, scroller.clientWidth + 5)).not.toBe(input);

        // The top of the row scrolled out.
        const rowTop = input.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop;

        scroller.scrollBy(0, rowTop + 10);
        render();
        expectAligned(pixiConsole);

        const box = input.getBoundingClientRect();

        expect(document.elementFromPoint(box.left + 100, box.top + 5)).not.toBe(input);
        expect(document.elementFromPoint(box.left + 100, box.bottom - 5)).toBe(input);
    });

    it("keeps focus and the typed text while scrolled out of view", () => {
        const scroller = wrapCanvas("overflow: auto; height: 300px; margin-top: 100px");
        const pixiConsole = create({ height: 200 });
        const input = promptOf(pixiConsole);

        render();
        pixiConsole.focusPrompt();
        input.value = "draft";

        scroller.scrollTo(0, 250);
        render();

        expect(input.isConnected).toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe("draft");
        expect(hitAt(input, 100)).not.toBe(input);
    });
});

describe("host order", () => {
    it("moves back after a canvas appended again, keeping focus", () => {
        styleCanvas({ position: "absolute", left: "0px", top: "0px" });

        const pixiConsole = create();
        const input = promptOf(pixiConsole);

        render();
        pixiConsole.focusPrompt();

        expect(hitAt(input, 100)).toBe(input);

        // Idempotent mount code: the canvas now comes after the host and paints over it.
        document.body.appendChild(app.canvas);
        render();

        expect(hostOf(pixiConsole)?.previousElementSibling).toBe(app.canvas);
        expect(hitAt(input, 100)).toBe(input);
        expect(document.activeElement).toBe(input);
        expectAligned(pixiConsole);
    });

    it("moves back when an element comes between the canvas and the host", () => {
        styleCanvas({ position: "absolute", left: "0px", top: "0px" });

        const pixiConsole = create();
        const cover = document.createElement("div");

        cover.style.cssText = "position: absolute; left: 0; top: 0; width: 800px; height: 600px";
        cleanups.push(() => cover.remove());
        render();
        app.canvas.after(cover);
        render();

        expect(hostOf(pixiConsole)?.previousElementSibling).toBe(app.canvas);
        expectAligned(pixiConsole);
        // The input stacks with the canvas: what covers the canvas covers it too.
        expect(hitAt(promptOf(pixiConsole), 100)).toBe(cover);
    });

    it("keeps the hosts of several consoles together after the canvas", () => {
        const first = create();
        const second = create();

        render();

        const hosts = [hostOf(first), hostOf(second)];

        expect(app.canvas.nextElementSibling).toBe(hosts[0]);
        expect(hosts[0]?.nextElementSibling).toBe(hosts[1]);

        // Neither host moves while they follow the canvas, so a focused input keeps its focus.
        second.focusPrompt();
        render();

        expect(app.canvas.nextElementSibling).toBe(hosts[0]);
        expect(document.activeElement).toBe(promptOf(second));

        document.body.appendChild(app.canvas);
        render();

        expect(app.canvas.nextElementSibling).toBe(hosts[0]);
        expect(hosts[0]?.nextElementSibling).toBe(hosts[1]);
        expect(document.activeElement).toBe(promptOf(second));
    });
});
