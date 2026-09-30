import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
    PromptInput,
    measureCanvas,
    overlayStyles,
    type CanvasBox,
    type PromptGeometry,
    type PromptHandlers,
} from "../src/ui/PromptInput";

type MockHandlers = { [K in keyof PromptHandlers]: Mock<PromptHandlers[K]> };

const STYLE = {
    fontFamily: "Menlo, monospace",
    color: "#e6edf3",
    caretColor: "#58a6ff",
    placeholder: "Type help and press Enter",
};

function geometry(overrides: Partial<PromptGeometry> = {}): PromptGeometry {
    return {
        screenWidth: 800,
        screenHeight: 600,
        origin: { x: 0, y: 560 },
        xAxis: { x: 1, y: 0 },
        yAxis: { x: 0, y: 1 },
        width: 800,
        height: 30,
        textInset: 30,
        endInset: 8,
        fontSize: 16,
        opacity: 1,
        ...overrides,
    };
}

function canvasBox(overrides: Partial<CanvasBox> = {}): CanvasBox {
    return {
        position: "absolute",
        left: 10,
        top: 20,
        width: 800,
        height: 600,
        transform: "none",
        transformOrigin: "400px 300px",
        translate: "none",
        rotate: "none",
        scale: "none",
        zIndex: "",
        contentX: 0,
        contentY: 0,
        contentWidth: 800,
        contentHeight: 600,
        clip: { top: 0, right: 0, bottom: 0, left: 0 },
        ...overrides,
    };
}

function stub<T extends object>(target: T, values: Record<string, unknown>): T {
    for (const [key, value] of Object.entries(values))
        Object.defineProperty(target, key, { configurable: true, value });

    return target;
}

describe("overlayStyles", () => {
    it("maps an unscaled row straight into the canvas box", () => {
        expect(overlayStyles(canvasBox(), geometry())).toEqual({
            host: {
                position: "absolute",
                left: "10px",
                top: "20px",
                width: "800px",
                height: "600px",
                transform: "none",
                "transform-origin": "400px 300px",
                translate: "none",
                rotate: "none",
                scale: "none",
                "z-index": "",
                opacity: "",
                "clip-path": "inset(0)",
            },
            input: {
                width: "800px",
                height: "30px",
                "line-height": "30px",
                "font-size": "16px",
                "padding-left": "30px",
                "padding-right": "8px",
                transform: "matrix(1, 0, 0, 1, 0, 560)",
            },
        });
    });

    it("scales global units to CSS pixels", () => {
        // Canvas CSS-scaled to half its size.
        const half = overlayStyles(canvasBox({ contentWidth: 400, contentHeight: 300 }), geometry());

        expect(half.input.transform).toBe("matrix(0.5, 0, 0, 0.5, 0, 280)");
        expect(half.input.width).toBe("800px");

        // Resolution 2 without autoDensity: the canvas is twice the screen size.
        const hiDpi = overlayStyles(
            canvasBox(),
            geometry({ screenWidth: 400, screenHeight: 300, origin: { x: 5, y: 270 } }),
        );

        expect(hiDpi.input.transform).toBe("matrix(2, 0, 0, 2, 10, 540)");
    });

    it("follows rotated and scaled axes", () => {
        const cos = Math.cos(Math.PI / 6);
        const sin = Math.sin(Math.PI / 6);
        const styles = overlayStyles(
            canvasBox(),
            geometry({
                origin: { x: 100, y: 50 },
                xAxis: { x: 2 * cos, y: 2 * sin },
                yAxis: { x: -2 * sin, y: 2 * cos },
            }),
        );

        expect(styles.input.transform).toBe("matrix(1.732051, 1, -1, 1.732051, 100, 50)");
    });

    it("lays small fonts out at 16px and scales the box back down", () => {
        const styles = overlayStyles(canvasBox(), geometry({ fontSize: 14 }));

        expect(styles.input).toEqual({
            width: "914.286px",
            height: "34.286px",
            "line-height": "34.286px",
            "font-size": "16px",
            "padding-left": "34.286px",
            "padding-right": "9.143px",
            transform: "matrix(0.875, 0, 0, 0.875, 0, 560)",
        });

        // Larger fonts are used as they are.
        expect(overlayStyles(canvasBox(), geometry({ fontSize: 20 })).input["font-size"]).toBe("20px");
    });

    it("offsets the input by the canvas padding and border", () => {
        const box = canvasBox({ contentX: 8, contentY: 8, contentWidth: 784, contentHeight: 584 });
        const styles = overlayStyles(box, geometry({ screenWidth: 784, screenHeight: 584, origin: { x: 0, y: 550 } }));

        expect(styles.input.transform).toBe("matrix(1, 0, 0, 1, 8, 558)");
    });

    it("copies the canvas box, transform and stacking to the host", () => {
        const box = canvasBox({
            position: "fixed",
            transform: "matrix(0.75, 0, 0, 0.75, 10, 5)",
            transformOrigin: "0px 0px",
            translate: "4px 2px",
            rotate: "5deg",
            scale: "1.1",
            zIndex: "3",
        });

        expect(overlayStyles(box, geometry({ opacity: 0.25 })).host).toMatchObject({
            position: "fixed",
            transform: "matrix(0.75, 0, 0, 0.75, 10, 5)",
            "transform-origin": "0px 0px",
            translate: "4px 2px",
            rotate: "5deg",
            scale: "1.1",
            "z-index": "3",
            opacity: "0.25",
        });
    });

    it("clips the host to the given insets", () => {
        const box = canvasBox({ clip: { top: 120, right: 460.25, bottom: 280, left: 0 } });

        expect(overlayStyles(box, geometry()).host["clip-path"]).toBe("inset(120px 460.25px 280px 0px)");
        expect(overlayStyles(canvasBox(), geometry()).host["clip-path"]).toBe("inset(0)");
    });

    it("produces stable strings", () => {
        const noisy = geometry({ origin: { x: 0.1 + 0.2, y: 560.0000001 }, xAxis: { x: 1 - 1e-12, y: -1e-12 } });
        const clean = geometry({ origin: { x: 0.3, y: 560 } });

        expect(overlayStyles(canvasBox(), noisy)).toEqual(overlayStyles(canvasBox(), clean));
        expect(overlayStyles(canvasBox(), clean)).toEqual(overlayStyles(canvasBox(), clean));
        expect(overlayStyles(canvasBox(), noisy).input.transform).toBe("matrix(1, 0, 0, 1, 0.3, 560)");
    });
});

describe("measureCanvas", () => {
    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let host: HTMLDivElement;

    beforeEach(() => {
        container = document.body.appendChild(document.createElement("div"));
        canvas = container.appendChild(document.createElement("canvas"));
        host = container.appendChild(document.createElement("div"));
    });

    afterEach(() => {
        container.remove();
    });

    it("places the host at the canvas's offset within their containing block", () => {
        stub(canvas, { offsetLeft: 30, offsetTop: 40, offsetWidth: 820, offsetHeight: 620 });
        // The containing block's origin is 5px/7px from the offset parent (e.g. a positioned body).
        stub(host, { offsetLeft: 25, offsetTop: 27 });
        host.style.left = "20px";
        host.style.top = "20px";

        expect(measureCanvas(canvas, host)).toMatchObject({
            position: "absolute",
            left: 25,
            top: 33,
            width: 820,
            height: 620,
        });
    });

    it("measures the content box inside padding and border", () => {
        canvas.style.padding = "6px 4px 2px 3px";
        stub(canvas, { clientLeft: 2, clientTop: 1, clientWidth: 807, clientHeight: 608 });

        expect(measureCanvas(canvas, host)).toMatchObject({
            contentX: 5,
            contentY: 7,
            contentWidth: 800,
            contentHeight: 600,
        });
    });

    it("copies transforms and stacking from the computed style", () => {
        canvas.style.transform = "scale(0.75)";
        canvas.style.transformOrigin = "0px 0px";
        canvas.style.zIndex = "4";
        canvas.style.position = "fixed";

        expect(measureCanvas(canvas, host)).toMatchObject({
            position: "fixed",
            transform: "scale(0.75)",
            transformOrigin: "0px 0px",
            zIndex: "4",
        });

        canvas.style.zIndex = "auto";
        canvas.style.transform = "";
        canvas.style.position = "";

        expect(measureCanvas(canvas, host)).toMatchObject({
            position: "absolute",
            transform: "none",
            translate: "none",
            rotate: "none",
            scale: "none",
            zIndex: "",
        });
    });

    describe("overflow containers inside the containing block", () => {
        let inner: HTMLDivElement;

        // Longhands: jsdom doesn't expand the `overflow` shorthand.
        function overflow(element: HTMLElement, x: string, y: string): void {
            element.style.overflowX = x;
            element.style.overflowY = y;
        }

        /** container > inner > [canvas, host], all in the offset parent `body`, the host at its origin. */
        beforeEach(() => {
            inner = container.appendChild(document.createElement("div"));
            inner.append(canvas, host);
            stub(canvas, {
                offsetParent: document.body,
                offsetLeft: 5,
                offsetTop: 5,
                offsetWidth: 800,
                offsetHeight: 600,
            });
            stub(host, { offsetParent: document.body, offsetLeft: 0, offsetTop: 0 });
            stub(container, {
                offsetLeft: 0,
                offsetTop: 0,
                clientLeft: 0,
                clientTop: 0,
                clientWidth: 500,
                clientHeight: 400,
                scrollLeft: 0,
                scrollTop: 30,
            });
            // Offsets leave out the container's scroll.
            stub(inner, {
                offsetLeft: 5,
                offsetTop: 5,
                clientLeft: 0,
                clientTop: 0,
                clientWidth: 350,
                clientHeight: 500,
                scrollLeft: 25,
                scrollTop: 90,
            });
            overflow(container, "auto", "auto");
            overflow(inner, "scroll", "scroll");
        });

        it("subtracts their scroll and clips to what they show", () => {
            expect(measureCanvas(canvas, host)).toMatchObject({
                left: -20,
                top: -115,
                // Shown: x 25 to 375 of the canvas (inner), y 115 to 515 (container).
                clip: { top: 115, right: 425, bottom: 85, left: 25 },
            });

            // Clipping only along the axes that don't overflow visibly.
            overflow(container, "hidden", "visible");
            overflow(inner, "visible", "clip");

            expect(measureCanvas(canvas, host).clip).toEqual({ top: 90, right: 280, bottom: 10, left: 20 });
        });

        it("ignores boxes overflow doesn't apply to", () => {
            const none = { top: 0, right: 0, bottom: 0, left: 0 };

            overflow(container, "visible", "visible");
            inner.style.display = "contents";

            expect(measureCanvas(canvas, host).clip).toEqual(none);

            inner.style.display = "inline";

            expect(measureCanvas(canvas, host).clip).toEqual(none);
        });

        it("leaves a transformed canvas unclipped", () => {
            canvas.style.transform = "scale(0.5)";

            expect(measureCanvas(canvas, host)).toMatchObject({
                left: -20,
                top: -115,
                clip: { top: 0, right: 0, bottom: 0, left: 0 },
            });
        });

        it("leaves out positioned and undisplayed canvases", () => {
            const unaffected = { left: 5, top: 5, clip: { top: 0, right: 0, bottom: 0, left: 0 } };

            // Positioned against the containing block, not scrolled by the containers inside it.
            canvas.style.position = "absolute";
            expect(measureCanvas(canvas, host)).toMatchObject(unaffected);

            canvas.style.position = "fixed";
            stub(canvas, { offsetParent: null });
            stub(host, { offsetParent: null });
            expect(measureCanvas(canvas, host)).toMatchObject(unaffected);

            // No offset parent: nothing is laid out.
            canvas.style.position = "";
            expect(measureCanvas(canvas, host)).toMatchObject(unaffected);
        });
    });

    it("falls back to client rects when the containing blocks differ", () => {
        const cell = document.createElement("td");
        const parent = stub(document.createElement("div"), {
            offsetWidth: 500,
            getBoundingClientRect: () => ({ width: 1000 }),
        });

        stub(canvas, { offsetParent: cell, getBoundingClientRect: () => ({ left: 100, top: 80 }) });
        stub(host, { offsetParent: parent, getBoundingClientRect: () => ({ left: 60, top: 70 }) });
        host.style.left = "3px";
        host.style.top = "4px";

        // The offset parent is drawn at twice its CSS size: 40px on screen are 20 CSS pixels.
        expect(measureCanvas(canvas, host)).toMatchObject({ left: 23, top: 9 });

        stub(host, { offsetParent: null });

        expect(measureCanvas(canvas, host)).toMatchObject({ left: 43, top: 14 });
    });
});

describe("PromptInput", () => {
    let handlers: MockHandlers;
    let prompt: PromptInput;
    let container: HTMLDivElement;
    let canvas: HTMLCanvasElement;

    function key(type: "keydown" | "keypress" | "keyup", init: KeyboardEventInit): KeyboardEvent {
        const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });

        prompt.element.dispatchEvent(event);

        return event;
    }

    function submit(): Event {
        const event = new Event("submit", { bubbles: true, cancelable: true });

        prompt.element.form?.dispatchEvent(event);

        return event;
    }

    function type(value: string): void {
        prompt.element.value = value;
        prompt.element.setSelectionRange(value.length, value.length);
    }

    beforeEach(() => {
        handlers = {
            submit: vi.fn(),
            historyPrevious: vi.fn<PromptHandlers["historyPrevious"]>(() => undefined),
            historyNext: vi.fn<PromptHandlers["historyNext"]>(() => undefined),
            complete: vi.fn<PromptHandlers["complete"]>(() => null),
            page: vi.fn(),
            focusChange: vi.fn(),
        };
        prompt = new PromptInput(handlers, STYLE);
        container = document.body.appendChild(document.createElement("div"));
        canvas = container.appendChild(document.createElement("canvas"));
    });

    afterEach(() => {
        prompt.destroy();
        container.remove();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe("element", () => {
        it("sets the input up as a plain, unassisted text field", () => {
            const input = prompt.element;
            const host = input.closest("[data-pixi-console]");

            expect(input.type).toBe("text");
            expect(input.autocomplete).toBe("off");
            expect(input.spellcheck).toBe(false);
            expect(input.placeholder).toBe(STYLE.placeholder);
            expect(input.form).toMatchObject({ noValidate: true, autocomplete: "off" });
            expect(host?.getAttribute("data-pixi-console")).toBe("");
            expect(host?.contains(input.form)).toBe(true);

            for (const [name, value] of Object.entries({
                autocapitalize: "off",
                autocorrect: "off",
                enterkeyhint: "go",
                inputmode: "text",
                translate: "no",
                "aria-label": "Console command",
                "data-1p-ignore": "",
                "data-lpignore": "true",
                "data-bwignore": "",
                "data-form-type": "other",
            })) {
                expect(input.getAttribute(name), name).toBe(value);
            }
        });

        it("styles through CSSOM only", () => {
            const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
            const other = new PromptInput(handlers, STYLE);

            other.place(canvas, geometry());

            const input = other.element;
            const host = input.closest<HTMLElement>("[data-pixi-console]");

            expect(setAttribute.mock.calls.map(([name]) => name)).not.toContain("style");
            expect(input.style.getPropertyValue("color")).not.toBe("");
            expect(input.style.getPropertyValue("font-family")).toContain("Menlo");
            expect(input.style.getPropertyValue("pointer-events")).toBe("auto");
            expect(input.style.getPropertyValue("width")).toBe("800px");
            expect(host?.style.getPropertyValue("pointer-events")).toBe("none");
            expect(host?.style.getPropertyValue("position")).toBe("absolute");
            expect(input.getAttribute("style")).toContain("pointer-events");

            other.destroy();
        });
    });

    describe("placement", () => {
        it("inserts the host after the canvas and writes only changed styles", () => {
            const host = prompt.element.closest("[data-pixi-console]");

            expect(prompt.attached).toBe(false);

            prompt.place(canvas, geometry());

            expect(prompt.attached).toBe(true);
            expect(canvas.nextSibling).toBe(host);

            const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");

            prompt.place(canvas, geometry());
            expect(setProperty).not.toHaveBeenCalled();

            prompt.place(canvas, geometry({ width: 400 }));
            expect(setProperty.mock.calls).toEqual([["width", "400px"]]);
        });

        it("shares the canvas's containing block, fixed or not", () => {
            const host = prompt.element.closest<HTMLElement>("[data-pixi-console]")!;

            // Before the first placement the host sits at its containing block's origin, not at its
            // static position after the canvas.
            expect([host.style.left, host.style.top]).toEqual(["0px", "0px"]);

            canvas.style.position = "fixed";
            prompt.place(canvas, geometry());

            expect(host.style.position).toBe("fixed");

            canvas.style.position = "static";
            prompt.place(canvas, geometry());

            expect(host.style.position).toBe("absolute");
        });

        it("keeps a focused input in place while it follows the canvas", () => {
            prompt.place(canvas, geometry());
            prompt.focus();

            expect(prompt.focused).toBe(true);

            container.append(document.createElement("span"));
            prompt.place(canvas, geometry({ origin: { x: 5, y: 5 } }));

            expect(prompt.focused).toBe(true);
            // Never blurred: the host was not moved.
            expect(handlers.focusChange.mock.calls).toEqual([[true]]);
        });

        it("moves back right after the canvas, keeping focus", () => {
            const host = prompt.element.closest("[data-pixi-console]");

            prompt.place(canvas, geometry());
            prompt.focus();

            // The canvas appended again, after the host.
            container.append(canvas);
            prompt.place(canvas, geometry());

            expect(canvas.nextElementSibling).toBe(host);
            expect(prompt.focused).toBe(true);

            // Something inserted in between.
            canvas.after(document.createElement("span"));
            prompt.place(canvas, geometry());

            expect(canvas.nextElementSibling).toBe(host);
            expect(prompt.focused).toBe(true);
            expect(handlers.focusChange.mock.calls.at(-1)).toEqual([true]);
        });

        it("orders the hosts of several consoles by first placement", () => {
            const other = new PromptInput(handlers, STYLE);

            prompt.place(canvas, geometry());
            other.place(canvas, geometry());

            const hosts = [...container.children].slice(1);

            expect(hosts.map((element) => element.contains(prompt.element))).toEqual([true, false]);
            expect(hosts.map((element) => element.contains(other.element))).toEqual([false, true]);

            // Moved back behind the canvas in the same order.
            container.append(canvas);
            prompt.place(canvas, geometry());
            other.place(canvas, geometry());

            expect([...container.children]).toEqual([canvas, ...hosts]);

            other.destroy();
        });

        it("follows the canvas to another parent and detaches when it has none", () => {
            prompt.place(canvas, geometry());

            const elsewhere = document.body.appendChild(document.createElement("section"));

            elsewhere.append(canvas);
            prompt.place(canvas, geometry());

            expect(canvas.nextSibling).toBe(prompt.element.closest("[data-pixi-console]"));

            canvas.remove();
            prompt.place(canvas, geometry());

            expect(prompt.attached).toBe(false);
            elsewhere.remove();
        });
    });

    describe("keys", () => {
        beforeEach(() => {
            prompt.place(canvas, geometry());
            prompt.focus();
        });

        it("submits the line on form submit and clears the input", () => {
            type("help");

            const event = submit();

            expect(event.defaultPrevented).toBe(true);
            expect(handlers.submit).toHaveBeenCalledWith("help");
            expect(prompt.element.value).toBe("");
            expect(prompt.focused).toBe(true);
        });

        it("ignores a blank submit", () => {
            type("   ");

            expect(submit().defaultPrevented).toBe(true);
            expect(handlers.submit).not.toHaveBeenCalled();
        });

        it("never submits the Enter that ends a composition", () => {
            vi.useFakeTimers();
            type("ni");

            prompt.element.dispatchEvent(new CompositionEvent("compositionstart"));
            expect(key("keydown", { key: "Enter", isComposing: true }).defaultPrevented).toBe(true);
            submit();

            prompt.element.dispatchEvent(new CompositionEvent("compositionend"));
            // Safari: the committing Enter arrives after compositionend, in the same tick.
            expect(key("keydown", { key: "Enter" }).defaultPrevented).toBe(true);
            expect(key("keydown", { key: "ArrowUp" }).defaultPrevented).toBe(false);
            submit();

            expect(handlers.submit).not.toHaveBeenCalled();
            expect(handlers.historyPrevious).not.toHaveBeenCalled();

            vi.runAllTimers();

            expect(key("keydown", { key: "Enter" }).defaultPrevented).toBe(false);
            submit();
            expect(handlers.submit).toHaveBeenCalledWith("ni");
        });

        it("keeps composing when a new composition starts before the timer", () => {
            vi.useFakeTimers();

            prompt.element.dispatchEvent(new CompositionEvent("compositionend"));
            prompt.element.dispatchEvent(new CompositionEvent("compositionstart"));
            vi.runAllTimers();

            expect(key("keydown", { key: "Enter" }).defaultPrevented).toBe(true);
        });

        it("clears the line on Escape, then leaves the field", () => {
            type("abc");

            expect(key("keydown", { key: "Escape" }).defaultPrevented).toBe(true);
            expect(prompt.element.value).toBe("");
            expect(prompt.focused).toBe(true);

            expect(key("keydown", { key: "Escape" }).defaultPrevented).toBe(true);
            expect(prompt.focused).toBe(false);
            expect(handlers.focusChange).toHaveBeenLastCalledWith(false);
        });

        it("recalls history only when a line comes back", () => {
            const onInput = vi.fn();

            prompt.element.addEventListener("input", onInput);
            type("draft");

            expect(key("keydown", { key: "ArrowUp" }).defaultPrevented).toBe(false);
            expect(handlers.historyPrevious).toHaveBeenCalledWith("draft");
            expect(prompt.element.value).toBe("draft");

            handlers.historyPrevious.mockReturnValue("older");
            prompt.element.setSelectionRange(0, 0);

            expect(key("keydown", { key: "ArrowUp" }).defaultPrevented).toBe(true);
            expect(prompt.element.value).toBe("older");
            expect(prompt.element.selectionStart).toBe(5);
            expect(onInput).toHaveBeenCalledTimes(1);

            expect(key("keydown", { key: "ArrowDown" }).defaultPrevented).toBe(false);
            handlers.historyNext.mockReturnValue("draft");
            expect(key("keydown", { key: "ArrowDown" }).defaultPrevented).toBe(true);
            expect(prompt.element.value).toBe("draft");

            handlers.historyPrevious.mockClear();
            key("keydown", { key: "ArrowUp", shiftKey: true });
            key("keydown", { key: "ArrowUp", ctrlKey: true });
            expect(handlers.historyPrevious).not.toHaveBeenCalled();
        });

        it("completes on Tab only when there is a completion", () => {
            type("he");

            expect(key("keydown", { key: "Tab" }).defaultPrevented).toBe(false);
            expect(handlers.complete).toHaveBeenCalledWith("he");

            handlers.complete.mockReturnValue("help ");

            expect(key("keydown", { key: "Tab" }).defaultPrevented).toBe(true);
            expect(prompt.element.value).toBe("help ");

            handlers.complete.mockClear();
            prompt.element.setSelectionRange(1, 1);
            expect(key("keydown", { key: "Tab" }).defaultPrevented).toBe(false);
            type("he");
            prompt.element.setSelectionRange(0, 2);
            expect(key("keydown", { key: "Tab" }).defaultPrevented).toBe(false);
            type("he");
            expect(key("keydown", { key: "Tab", shiftKey: true }).defaultPrevented).toBe(false);
            expect(handlers.complete).not.toHaveBeenCalled();
        });

        it("pages the log with PageUp and PageDown", () => {
            expect(key("keydown", { key: "PageUp" }).defaultPrevented).toBe(true);
            expect(key("keydown", { key: "PageDown", shiftKey: true }).defaultPrevented).toBe(true);
            expect(handlers.page.mock.calls).toEqual([[-1], [1]]);
        });

        it("keeps keydown and keypress from the page, but not keyup", () => {
            const onKeyDown = vi.fn();
            const onKeyPress = vi.fn();
            const onKeyUp = vi.fn();

            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keypress", onKeyPress);
            window.addEventListener("keyup", onKeyUp);

            try {
                for (const code of ["Backquote", "KeyA", "Enter"]) {
                    key("keydown", { code, key: code === "Backquote" ? "`" : code });
                    key("keypress", { code });
                    key("keyup", { code });
                }
                key("keydown", { key: "c", ctrlKey: true });

                expect(onKeyDown).not.toHaveBeenCalled();
                expect(onKeyPress).not.toHaveBeenCalled();
                expect(onKeyUp).toHaveBeenCalledTimes(3);
            } finally {
                window.removeEventListener("keydown", onKeyDown);
                window.removeEventListener("keypress", onKeyPress);
                window.removeEventListener("keyup", onKeyUp);
            }
        });
    });

    describe("paste", () => {
        function paste(text: string): Event {
            const event = new Event("paste", { bubbles: true, cancelable: true });

            Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
            prompt.element.dispatchEvent(event);

            return event;
        }

        it("flattens multi-line text into the selection", () => {
            const onInput = vi.fn();

            prompt.element.addEventListener("input", onInput);
            prompt.element.value = "x = [0];";
            prompt.element.setSelectionRange(5, 6);

            expect(paste("1,\r\n2,\r3,\n4").defaultPrevented).toBe(true);
            expect(prompt.element.value).toBe("x = [1, 2, 3, 4];");
            expect(prompt.element.selectionStart).toBe(15);
            expect(onInput).toHaveBeenCalledTimes(1);
        });

        it("leaves single-line text to the browser", () => {
            expect(paste("one line").defaultPrevented).toBe(false);
            expect(prompt.element.value).toBe("");
        });

        it("respects maxLength", () => {
            prompt.element.maxLength = 5;
            type("ab");

            paste("c\nd\ne\nf");

            expect(prompt.element.value).toBe("abc d");
        });
    });

    describe("focus and lifecycle", () => {
        it("reports focus changes", () => {
            prompt.place(canvas, geometry());
            prompt.focus();

            expect(prompt.focused).toBe(true);
            expect(handlers.focusChange).toHaveBeenLastCalledWith(true);

            prompt.blur();

            expect(prompt.focused).toBe(false);
            expect(handlers.focusChange).toHaveBeenLastCalledWith(false);
        });

        it("cannot focus while detached", () => {
            prompt.focus();

            expect(prompt.focused).toBe(false);
            expect(handlers.focusChange).not.toHaveBeenCalled();
        });

        it("detach() blurs and removes the host, keeping the text", () => {
            prompt.place(canvas, geometry());
            prompt.focus();
            type("draft");
            prompt.detach();

            expect(prompt.attached).toBe(false);
            expect(prompt.focused).toBe(false);
            expect(handlers.focusChange).toHaveBeenLastCalledWith(false);
            expect(document.querySelector("[data-pixi-console]")).toBeNull();
            expect(prompt.element.value).toBe("draft");

            prompt.place(canvas, geometry());

            expect(prompt.attached).toBe(true);
            expect(prompt.element.value).toBe("draft");
        });

        it("destroy() detaches, stops listening and is idempotent", () => {
            vi.useFakeTimers();
            prompt.place(canvas, geometry());
            prompt.focus();

            // jsdom may schedule timers of its own on focus: only count the composition timer.
            const timers = vi.getTimerCount();

            prompt.element.dispatchEvent(new CompositionEvent("compositionend"));
            expect(vi.getTimerCount()).toBe(timers + 1);

            prompt.destroy();
            prompt.destroy();

            expect(vi.getTimerCount()).toBe(timers);
            expect(prompt.attached).toBe(false);
            expect(handlers.focusChange).toHaveBeenLastCalledWith(false);

            type("help");
            submit();
            prompt.place(canvas, geometry());
            prompt.focus();

            expect(handlers.submit).not.toHaveBeenCalled();
            expect(prompt.attached).toBe(false);
            expect(prompt.focused).toBe(false);
        });
    });
});
