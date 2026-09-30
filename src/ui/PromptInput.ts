import type { PointData } from "pixi.js";

/** What the command line asks of its console. */
export interface PromptHandlers {
    /** A non-blank line was entered. The input is already empty. */
    submit(line: string): void;
    /** ↑ was pressed with `current` in the input. Returns the line to show, or `undefined` to leave the key alone. */
    historyPrevious(current: string): string | undefined;
    /** ↓ was pressed. Returns the line to show, or `undefined` to leave the key alone. */
    historyNext(): string | undefined;
    /** Tab was pressed with the caret at the end. Returns the new value, or `null` to let Tab move focus. */
    complete(value: string): string | null;
    /** PageUp (`-1`) or PageDown (`1`) was pressed. */
    page(direction: -1 | 1): void;
    /** The input gained or lost focus. */
    focusChange(focused: boolean): void;
}

/** How the typed text looks. Colours are CSS colours. */
export interface PromptStyle {
    fontFamily: string;
    color: string;
    caretColor: string;
    placeholder: string;
}

/**
 * Where the prompt row is on the renderer screen. Positions are global pixi coordinates (what
 * `toGlobal` returns); sizes are in console-local units.
 */
export interface PromptGeometry {
    /** `renderer.screen.width`: the canvas content box in global units. */
    screenWidth: number;
    /** `renderer.screen.height`. */
    screenHeight: number;
    /** Global position of the row's top-left corner. */
    origin: Readonly<PointData>;
    /** Global offset of one console-local unit along x. */
    xAxis: Readonly<PointData>;
    /** Global offset of one console-local unit along y. */
    yAxis: Readonly<PointData>;
    /** Row width. */
    width: number;
    /** Row height. */
    height: number;
    /** Space before the typed text (padding and the `>` glyph). */
    textInset: number;
    /** Space after the typed text. */
    endInset: number;
    fontSize: number;
    /** Product of `alpha` up the scene graph. */
    opacity: number;
}

/** The canvas box as {@link measureCanvas} reads it. Lengths are CSS pixels. */
export interface CanvasBox {
    /** Position the host needs to share the canvas's containing block. */
    position: "absolute" | "fixed";
    /** Border box of the canvas, in its containing block (host `left`, `top`, `width`, `height`). */
    left: number;
    top: number;
    width: number;
    height: number;
    /** Computed transform properties of the canvas, copied to the host. */
    transform: string;
    transformOrigin: string;
    translate: string;
    rotate: string;
    scale: string;
    /** Computed `z-index`, or `""` for `auto`. */
    zIndex: string;
    /** Content box (where pixi draws) inside the border box. */
    contentX: number;
    contentY: number;
    contentWidth: number;
    contentHeight: number;
    /**
     * What the host must clip off each side of the border box: parts of the canvas that overflow
     * containers between it and the host's containing block clip away, but the host is outside of.
     */
    clip: Insets;
}

/** Distances from the top, right, bottom and left edges of a box. */
export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

type HostProperty =
    | "position"
    | "left"
    | "top"
    | "width"
    | "height"
    | "transform"
    | "transform-origin"
    | "translate"
    | "rotate"
    | "scale"
    | "z-index"
    | "opacity"
    | "clip-path";

type InputProperty = "width" | "height" | "line-height" | "font-size" | "padding-left" | "padding-right" | "transform";

/** Inline styles placing the host and the input, by CSS property name. `""` removes a property. */
export interface OverlayStyles {
    host: Record<HostProperty, string>;
    input: Record<InputProperty, string>;
}

/** Marks the host element, e.g. for `document.querySelectorAll("[data-pixi-console]")`. */
const HOST_ATTRIBUTE = "data-pixi-console";

/** Inputs whose font is smaller than this make iOS zoom in on focus. */
const MIN_INPUT_FONT_SIZE = 16;

/** Keeps page stylesheets (`div { … }`, `input { … }` rules) from moving or resizing the overlay. */
const SHIELD_STYLES = { "min-width": "0", "max-width": "none", "min-height": "0", "max-height": "none" };

/** Host `clip-path` showing the whole canvas box. */
const NO_CLIP = "inset(0)";

const HOST_STYLES: Readonly<Record<string, string>> = {
    position: "absolute",
    // Not `auto`: measureCanvas needs the host at a known offset from its containing block's origin.
    left: "0",
    top: "0",
    display: "block",
    margin: "0",
    border: "0",
    padding: "0",
    "box-sizing": "border-box",
    "pointer-events": "none",
    // Clips the input to the canvas without creating a scroll container that focusing could scroll.
    "clip-path": NO_CLIP,
    ...SHIELD_STYLES,
};

const FORM_STYLES: Readonly<Record<string, string>> = { display: "block", margin: "0", border: "0", padding: "0" };

const INPUT_STYLES: Readonly<Record<string, string>> = {
    position: "absolute",
    left: "0",
    top: "0",
    display: "block",
    margin: "0",
    border: "0",
    padding: "0",
    outline: "none",
    "box-sizing": "border-box",
    background: "transparent",
    "-webkit-appearance": "none",
    appearance: "none",
    "border-radius": "0",
    "box-shadow": "none",
    "transform-origin": "0 0",
    "pointer-events": "auto",
    "touch-action": "manipulation",
    "-webkit-tap-highlight-color": "transparent",
    "font-style": "normal",
    "font-weight": "normal",
    "letter-spacing": "normal",
    "text-align": "start",
    "text-indent": "0",
    "text-transform": "none",
    ...SHIELD_STYLES,
};

/** Set as attributes rather than properties, which older browsers don't reflect. */
const INPUT_ATTRIBUTES: Readonly<Record<string, string>> = {
    autocapitalize: "off",
    autocorrect: "off",
    enterkeyhint: "go",
    inputmode: "text",
    translate: "no",
    "aria-label": "Console command",
    // Keep password managers from decorating or filling the field.
    "data-1p-ignore": "",
    "data-lpignore": "true",
    "data-bwignore": "",
    "data-form-type": "other",
};

/**
 * The command line's native `<input>`, placed over the canvas with CSS. The browser provides the
 * keyboard, IME, caret, selection, paste and accessibility; this class only positions the input and
 * turns keys into {@link PromptHandlers} calls.
 *
 * The input lives in a form inside a host `<div>` inserted after the canvas. The host copies the
 * canvas's box and transform, so the input can be placed in canvas coordinates whatever the page
 * layout (scroll, positioned or transformed ancestors, CSS scaling, canvas padding and border), and
 * is clipped like the canvas by the overflow containers it is in.
 * Styles are only ever set through CSSOM, never a `style` attribute or a stylesheet, which keeps it
 * working under a strict `style-src` and Trusted Types.
 */
export class PromptInput {
    /** The `<input>` itself. */
    readonly element: HTMLInputElement;

    private readonly _handlers: PromptHandlers;
    private readonly _host: HTMLDivElement;
    /** Style values last written by {@link place}, to skip unchanged writes. */
    private readonly _hostStyles: Record<string, string> = { position: "absolute", "clip-path": NO_CLIP };
    private readonly _inputStyles: Record<string, string> = {};
    private readonly _removeListeners: (() => void)[] = [];
    private _composing = false;
    private _compositionTimer: ReturnType<typeof setTimeout> | undefined;
    private _destroyed = false;

    constructor(handlers: PromptHandlers, style: PromptStyle) {
        this._handlers = handlers;
        this._host = document.createElement("div");
        this.element = document.createElement("input");

        const form = document.createElement("form");
        const input = this.element;

        this._host.setAttribute(HOST_ATTRIBUTE, "");
        setStyles(this._host, HOST_STYLES);

        form.noValidate = true;
        form.autocomplete = "off";
        setStyles(form, FORM_STYLES);

        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.placeholder = style.placeholder;
        for (const [name, value] of Object.entries(INPUT_ATTRIBUTES)) input.setAttribute(name, value);
        setStyles(input, {
            ...INPUT_STYLES,
            "font-family": style.fontFamily,
            color: style.color,
            "caret-color": style.caretColor,
        });

        form.append(input);
        this._host.append(form);

        // Enter and the mobile "Go" key submit the form (implicit submission).
        this._listen(form, "submit", this._onSubmit);
        this._listen(input, "keydown", this._onKeyDown);
        // keyup is left alone, so games tracking key state never see a key stuck down.
        this._listen(input, "keypress", (event) => event.stopPropagation());
        this._listen(input, "compositionstart", this._onCompositionStart);
        this._listen(input, "compositionend", this._onCompositionEnd);
        this._listen(input, "paste", this._onPaste);
        this._listen(input, "focus", () => this._handlers.focusChange(true));
        this._listen(input, "blur", () => this._handlers.focusChange(false));
    }

    /** Whether the input is in the document. */
    get attached(): boolean {
        return this._host.isConnected;
    }

    /** Whether the input has focus. */
    get focused(): boolean {
        // The root is a document, a shadow root when the canvas is in one, or the host when detached.
        const root = this.element.getRootNode();

        return "activeElement" in root && root.activeElement === this.element;
    }

    /** Inserts the input after `canvas` if needed and moves it over the prompt row. */
    place(canvas: HTMLCanvasElement, geometry: PromptGeometry): void {
        if (this._destroyed) return;

        const parent = canvas.parentNode;

        if (!parent) {
            this.detach();

            return;
        }

        // Right after the canvas (or other consoles' hosts there), so it paints over the canvas and
        // under whatever covers it. Only re-inserted when that changes, e.g. the canvas was appended
        // again: moving an element blurs it, and several consoles would keep swapping places.
        if (!followsCanvas(this._host, canvas)) {
            const focused = this.focused;
            let anchor: Element = canvas;

            // After the hosts already there: hosts are in the order they were inserted.
            for (
                let next = anchor.nextElementSibling;
                next?.hasAttribute(HOST_ATTRIBUTE);
                next = next.nextElementSibling
            ) {
                anchor = next;
            }
            anchor.after(this._host);
            if (focused) this.element.focus({ preventScroll: true });
        }

        // All layout reads happen in measureCanvas, before any write.
        let box = measureCanvas(canvas, this._host);

        if (box.position !== this._hostStyles.position) {
            // The canvas became (or stopped being) fixed: the host can only be measured against the
            // canvas's containing block once it shares it.
            writeStyles(this._host, { position: box.position }, this._hostStyles);
            box = measureCanvas(canvas, this._host);
        }

        const styles = overlayStyles(box, geometry);

        writeStyles(this._host, styles.host, this._hostStyles);
        writeStyles(this.element, styles.input, this._inputStyles);
    }

    /** Removes the input from the document, blurring it first. The typed text is kept. */
    detach(): void {
        if (this.focused) this.element.blur();
        this._host.remove();
    }

    /** Focuses the input. Does nothing while it is not in the document. */
    focus(): void {
        if (this.attached) this.element.focus();
    }

    /** Removes focus from the input. */
    blur(): void {
        this.element.blur();
    }

    /** Detaches the input and removes its listeners. Safe to call more than once. */
    destroy(): void {
        if (this._destroyed) return;

        this.detach();
        this._destroyed = true;
        for (const remove of this._removeListeners.splice(0)) remove();
        clearTimeout(this._compositionTimer);
        this._compositionTimer = undefined;
        this._composing = false;
    }

    private _listen<K extends keyof HTMLElementEventMap>(
        target: HTMLElement,
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
    ): void {
        target.addEventListener(type, listener);
        this._removeListeners.push(() => target.removeEventListener(type, listener));
    }

    /** Replaces the value with the caret at the end, notifying `input` listeners like typing would. */
    private _setValue(value: string): void {
        const input = this.element;
        const changed = input.value !== value;

        input.value = value;
        input.setSelectionRange(value.length, value.length);
        if (changed) input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    private readonly _onSubmit = (event: SubmitEvent): void => {
        event.preventDefault();

        if (this._composing) return;

        const line = this.element.value;

        if (line.trim() === "") return;

        this._setValue("");
        this._handlers.submit(line);
    };

    private readonly _onKeyDown = (event: KeyboardEvent): void => {
        // Keys typed here are not for the page: no toggle key, no game hotkeys, no Tab for pixi's
        // AccessibilitySystem. Capture-phase listeners still see them.
        event.stopPropagation();

        if (event.isComposing || this._composing) {
            // Safari sends the Enter committing a composition after `compositionend`: never submit it.
            if (event.key === "Enter") event.preventDefault();

            return;
        }

        if (event.altKey || event.ctrlKey || event.metaKey) return;

        const input = this.element;

        switch (event.key) {
            case "Escape":
                event.preventDefault();
                // Clear, then leave the field (TV Back keys usually map to Escape).
                if (input.value) this._setValue("");
                else input.blur();

                return;
            case "ArrowUp":
            case "ArrowDown": {
                if (event.shiftKey) return;

                const line =
                    event.key === "ArrowUp"
                        ? this._handlers.historyPrevious(input.value)
                        : this._handlers.historyNext();

                // At either end the key is left alone, so spatial navigation (TVs) can leave the field.
                if (line === undefined) return;

                event.preventDefault();
                this._setValue(line);

                return;
            }
            case "Tab": {
                const end = input.value.length;

                if (event.shiftKey || input.selectionStart !== end || input.selectionEnd !== end) return;

                const completed = this._handlers.complete(input.value);

                // Nothing to complete: Tab moves focus as usual, so the field is never a keyboard trap.
                if (completed === null) return;

                event.preventDefault();
                this._setValue(completed);

                return;
            }
            case "PageUp":
            case "PageDown":
                event.preventDefault();
                this._handlers.page(event.key === "PageUp" ? -1 : 1);
        }
    };

    private readonly _onCompositionStart = (): void => {
        clearTimeout(this._compositionTimer);
        this._compositionTimer = undefined;
        this._composing = true;
    };

    private readonly _onCompositionEnd = (): void => {
        clearTimeout(this._compositionTimer);
        // A tick later, so the Enter that committed the composition is still ignored.
        this._compositionTimer = setTimeout(() => {
            this._composing = false;
            this._compositionTimer = undefined;
        }, 0);
    };

    /** Pastes multi-line text as one line, the same in every browser (Chromium already does this). */
    private readonly _onPaste = (event: ClipboardEvent): void => {
        const text = event.clipboardData?.getData("text/plain") ?? "";

        if (!/[\r\n]/.test(text)) return;

        event.preventDefault();

        const input = this.element;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        let flat = text.replace(/\r\n?|\n/g, " ");

        // Unlike a native paste, setRangeText ignores maxLength.
        if (input.maxLength >= 0) {
            flat = flat.slice(0, Math.max(0, input.maxLength - input.value.length + (end - start)));
        }

        input.setRangeText(flat, start, end, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };
}

/**
 * Reads where the canvas is, for a host inserted next to it. Only reads layout: call it before
 * writing any style so the browser lays out once.
 */
export function measureCanvas(canvas: HTMLElement, host: HTMLElement): CanvasBox {
    const style = getComputedStyle(canvas);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const hostLeft = parseFloat(host.style.left) || 0;
    const hostTop = parseFloat(host.style.top) || 0;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const transforms = {
        transform: style.transform || "none",
        translate: style.getPropertyValue("translate") || "none",
        rotate: style.getPropertyValue("rotate") || "none",
        scale: style.getPropertyValue("scale") || "none",
    };
    let left: number;
    let top: number;
    let clip: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

    if (host.offsetParent === canvas.offsetParent) {
        // Same containing block: the bracket is the offset of its origin (a positioned body, borders…).
        const bracketX = host.offsetLeft - hostLeft;
        const bracketY = host.offsetTop - hostTop;
        const inFlow = style.position !== "absolute" && style.position !== "fixed";
        const { scrollX, scrollY, visible } = inFlow ? innerOverflow(canvas) : NO_OVERFLOW;

        left = canvas.offsetLeft - bracketX - scrollX;
        top = canvas.offsetTop - bracketY - scrollY;

        // Insets are in the host's coordinates, before its transform: only mapped without one.
        if (Object.values(transforms).every((value) => value === "none")) {
            clip = {
                top: clamp(visible.top - bracketY - top, height),
                right: clamp(left + width - (visible.right - bracketX), width),
                bottom: clamp(top + height - (visible.bottom - bracketY), height),
                left: clamp(visible.left - bracketX - left, width),
            };
        }
    } else {
        // E.g. a canvas in a static table cell. Converges on the next frame; assumes no rotated ancestor.
        const canvasRect = canvas.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const scale = containingBlockScale(host);

        left = hostLeft + (canvasRect.left - hostRect.left) / scale;
        top = hostTop + (canvasRect.top - hostRect.top) / scale;
    }

    return {
        // A fixed canvas keeps its place while the page scrolls: so must the host.
        position: style.position === "fixed" ? "fixed" : "absolute",
        left,
        top,
        width,
        height,
        ...transforms,
        transformOrigin: style.transformOrigin || "",
        // The host comes after the canvas, so with an equal z-index it paints on top.
        zIndex: style.zIndex === "auto" ? "" : style.zIndex,
        contentX: canvas.clientLeft + paddingLeft,
        contentY: canvas.clientTop + paddingTop,
        contentWidth: Math.max(0, canvas.clientWidth - paddingLeft - paddingRight),
        contentHeight: Math.max(0, canvas.clientHeight - paddingTop - paddingBottom),
        clip,
    };
}

/** Edges of a box, in the coordinates of `offsetLeft` and `offsetTop`. */
interface Edges {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** What overflow containers do to the canvas: how far they scroll it, and what part of it they show. */
interface Overflow {
    scrollX: number;
    scrollY: number;
    visible: Edges;
}

const NO_OVERFLOW: Readonly<Overflow> = {
    scrollX: 0,
    scrollY: 0,
    visible: { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity },
};

/**
 * Scroll offset and visible area of the elements between an in-flow canvas and its offset parent.
 * The canvas scrolls with them and they clip it, but not the host, which is positioned against the
 * offset parent (e.g. `#app { overflow: auto }` without `position`). Offsets leave their scroll out.
 */
function innerOverflow(canvas: HTMLElement): Readonly<Overflow> {
    const offsetParent = canvas.offsetParent;
    const ancestors: HTMLElement[] = [];

    // Without an offset parent (not displayed), the walk would reach the root, whose scroll is the page's.
    if (!offsetParent) return NO_OVERFLOW;

    for (let element = canvas.parentElement; element && element !== offsetParent; element = element.parentElement) {
        ancestors.push(element);
    }

    const visible = { ...NO_OVERFLOW.visible };
    let scrollX = 0;
    let scrollY = 0;

    // Outermost first: each element is moved by the scroll of those around it.
    for (const element of ancestors.reverse()) {
        const { display, overflowX, overflowY } = getComputedStyle(element);

        // Overflow doesn't apply to inline boxes, and `display: contents` has no box.
        if (display !== "inline" && display !== "contents") {
            const left = element.offsetLeft + element.clientLeft - scrollX;
            const top = element.offsetTop + element.clientTop - scrollY;

            if (overflowX !== "visible") {
                visible.left = Math.max(visible.left, left);
                visible.right = Math.min(visible.right, left + element.clientWidth);
            }
            if (overflowY !== "visible") {
                visible.top = Math.max(visible.top, top);
                visible.bottom = Math.min(visible.bottom, top + element.clientHeight);
            }
        }

        scrollX += element.scrollLeft;
        scrollY += element.scrollTop;
    }

    return { scrollX, scrollY, visible };
}

/** `value` within `[0, max]`. */
function clamp(value: number, max: number): number {
    return Math.min(Math.max(value, 0), max);
}

/** Whether `host` is right after `canvas`, or after other hosts that are. */
function followsCanvas(host: Element, canvas: Element): boolean {
    let previous = host.previousElementSibling;

    while (previous?.hasAttribute(HOST_ATTRIBUTE)) previous = previous.previousElementSibling;

    return previous === canvas;
}

/**
 * Styles putting the input over the prompt row. The host becomes a twin of the canvas box; the input
 * is mapped from console-local units into it with one `matrix()`, which follows any move, scale,
 * rotation or skew of the console and its ancestors. Numbers are rounded so the strings only change
 * when the placement does.
 */
export function overlayStyles(box: CanvasBox, geometry: PromptGeometry): OverlayStyles {
    const { origin, xAxis, yAxis, fontSize, opacity } = geometry;
    // Global units to CSS pixels: covers resolution, autoDensity on or off and CSS scaling.
    const sx = geometry.screenWidth > 0 ? box.contentWidth / geometry.screenWidth : 0;
    const sy = geometry.screenHeight > 0 ? box.contentHeight / geometry.screenHeight : 0;
    // iOS zooms into inputs with a font below 16px: lay the input out at 16px and scale it back down.
    const k = fontSize > 0 ? Math.min(1, fontSize / MIN_INPUT_FONT_SIZE) : 1;
    const linear = [sx * xAxis.x * k, sy * xAxis.y * k, sx * yAxis.x * k, sy * yAxis.y * k].map((n) => round(n, 6));
    const offset = [box.contentX + sx * origin.x, box.contentY + sy * origin.y].map((n) => round(n, 3));
    const height = px(geometry.height / k);

    return {
        host: {
            position: box.position,
            left: px(box.left),
            top: px(box.top),
            width: px(box.width),
            height: px(box.height),
            transform: box.transform,
            "transform-origin": box.transformOrigin,
            translate: box.translate,
            rotate: box.rotate,
            scale: box.scale,
            "z-index": box.zIndex,
            opacity: opacity < 1 ? String(round(Math.max(0, opacity), 3)) : "",
            "clip-path": clipPath(box.clip),
        },
        input: {
            width: px(geometry.width / k),
            height,
            "line-height": height,
            "font-size": px(fontSize / k),
            "padding-left": px(geometry.textInset / k),
            "padding-right": px(geometry.endInset / k),
            transform: `matrix(${[...linear, ...offset].join(", ")})`,
        },
    };
}

/** `clip-path` cutting `insets` off the host. */
function clipPath({ top, right, bottom, left }: Insets): string {
    return top || right || bottom || left ? `inset(${[top, right, bottom, left].map(px).join(" ")})` : NO_CLIP;
}

/** CSS pixels of the host's containing block per viewport pixel. */
function containingBlockScale(host: HTMLElement): number {
    const parent = host.offsetParent as HTMLElement | null;

    if (!parent) return 1;

    // Of the containing block, not the host: the host's own copied transform must not count.
    const scale = parent.getBoundingClientRect().width / parent.offsetWidth;

    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function setStyles(element: HTMLElement, styles: Readonly<Record<string, string>>): void {
    for (const [name, value] of Object.entries(styles)) element.style.setProperty(name, value);
}

/** Sets the styles whose value differs from the one last written. */
function writeStyles(
    element: HTMLElement,
    styles: Readonly<Record<string, string>>,
    written: Record<string, string>,
): void {
    for (const [name, value] of Object.entries(styles)) {
        if (written[name] === value) continue;

        written[name] = value;
        element.style.setProperty(name, value);
    }
}

function px(value: number): string {
    return `${round(value, 3)}px`;
}

/** Rounds to `digits` decimals, without `-0`. */
function round(value: number, digits: number): number {
    const factor = 10 ** digits;

    return Math.round(value * factor) / factor + 0;
}
