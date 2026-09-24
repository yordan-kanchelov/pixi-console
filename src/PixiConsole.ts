import {
    BitmapFont,
    BitmapFontManager,
    BitmapText,
    Cache,
    CanvasTextMetrics,
    Container,
    Graphics,
    Rectangle,
    Text,
    TextStyle,
    type ColorSource,
    type DestroyOptions,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
} from "pixi.js";

import { formatArgs } from "./core/format";
import { interceptConsole, interceptGlobalErrors, type InterceptedMethod } from "./core/intercept";
import { LogStore, type StoredEntry } from "./core/store";
import { LOG_LEVELS, type LogEntry, type LogLevel } from "./core/types";
import {
    resolveOptions,
    toLevels,
    type AutoResizeOptions,
    type PixiConsoleInit,
    type PixiConsoleOptions,
} from "./options";

type Label = Text | BitmapText;

/** One visual (already wrapped) line of an entry. */
interface Line {
    entry: StoredEntry;
    /** `entry.count` at layout time; a mismatch means the entry was collapsed into again. */
    count: number;
    text: string;
    color: ColorSource;
}

interface Drag {
    pointerId: number;
    startY: number;
    startScroll: number;
}

const SCROLLBAR_WIDTH = 4;
const MIN_THUMB_HEIGHT = 16;
const DISABLED_ALPHA = 0.35;

/**
 * An in-canvas developer console for PixiJS v8.
 *
 * Captures `console.*` calls and uncaught errors and renders them on top of your scene, which is
 * invaluable on devices without devtools. Rendering is virtualized: only the visible lines exist as
 * display objects, so tens of thousands of logs cost the same to draw as a screenful.
 *
 * @example
 * ```ts
 * const app = new Application();
 * await app.init({ resizeTo: window });
 *
 * const devConsole = new PixiConsole({ autoResize: { renderer: app.renderer } });
 * app.stage.addChild(devConsole);
 *
 * console.log("Hello from the canvas!");
 * ```
 */
export class PixiConsole extends Container {
    private readonly _options: PixiConsoleOptions;
    private readonly _store: LogStore;
    private _filter: Set<LogLevel>;
    private _captured: LogLevel[] = [];

    private readonly _background = new Graphics();
    private readonly _toolbar = new Container({ label: "toolbar" });
    private readonly _separator = new Graphics();
    private readonly _content = new Container({ label: "lines" });
    private readonly _mask = new Graphics();
    private readonly _scrollbar = new Graphics();
    private readonly _chips = new Map<LogLevel, Label>();
    private _clearButton!: Label;
    private _closeButton!: Label;

    private readonly _style: TextStyle;
    private readonly _wrapStyle: TextStyle;

    /** Pool of row labels. The line at absolute index `i` is always drawn by `_rows[i % _rows.length]`. */
    private _rows: Label[] = [];
    private _rowLines: (Line | null)[] = [];

    private _lines: Line[] = [];
    /** Number of lines dropped from the front since the last rebuild; keeps absolute line indices stable. */
    private _lineBase = 0;
    private _laidOutUpTo = -1;
    private _needsRebuild = true;
    private _dirty = true;
    private _countsKey = "";

    private _scrollY = 0;
    private _following = true;
    private _drag: Drag | null = null;

    private _unhookConsole?: () => void;
    private _unhookErrors?: () => void;
    private _removeKeyListener?: () => void;
    private _removeAutoResize?: () => void;

    constructor(options: PixiConsoleInit = {}) {
        super({ label: "PixiConsole" });

        this._options = resolveOptions(options);
        this._store = new LogStore(this._options);
        this._filter = new Set(this._options.filter);
        this.visible = this._options.visible;

        const { fontSize, fontFamily, textRenderer } = this._options;
        const family = textRenderer === "bitmap" ? installFont(fontFamily, fontSize, this._resolution) : fontFamily;

        this._style = new TextStyle({ fontFamily: family, fontSize, fill: 0xffffff });
        this._wrapStyle = new TextStyle({
            fontFamily: family,
            fontSize,
            fill: 0xffffff,
            wordWrap: true,
            breakWords: true,
            whiteSpace: "pre",
        });

        this._content.mask = this._mask;
        this.addChild(this._background, this._content, this._mask, this._scrollbar, this._separator, this._toolbar);

        this._createToolbar();
        this._setupPointer();
        this._applySize();

        this.captureConsole = this._options.captureConsole;
        this.captureErrors = this._options.captureErrors;
        this.toggleKey = this._options.toggleKey;
        this.autoResize = this._options.autoResize;

        this.onRender = () => this._update();
    }

    // ------------------------------------------------------------------ state

    /** Width of the console in pixels. Use {@link resize} to change it. */
    get consoleWidth(): number {
        return this._options.width;
    }

    /** Height of the console in pixels. Use {@link resize} to change it. */
    get consoleHeight(): number {
        return this._options.height;
    }

    /** Captured entries, oldest first. Includes entries hidden by the {@link filter}. */
    get entries(): readonly Readonly<LogEntry & { count: number }>[] {
        return this._store.entries;
    }

    /** Number of messages captured per level (collapsed repeats included). */
    get counts(): Readonly<Record<LogLevel, number>> {
        return this._store.counts;
    }

    /** Levels that are currently displayed. */
    get filter(): LogLevel[] {
        return LOG_LEVELS.filter((level) => this._filter.has(level));
    }

    set filter(levels: readonly LogLevel[]) {
        this._filter = new Set(levels);
        this._invalidate(true);
    }

    /** `console` levels currently captured. Assign `true`, `false` or a list of levels to change it. */
    get captureConsole(): LogLevel[] {
        return [...this._captured];
    }

    set captureConsole(value: boolean | readonly LogLevel[]) {
        this._captured = toLevels(value);
        this._options.captureConsole = this._captured;
        this._unhookConsole?.();
        this._unhookConsole = undefined;

        const methods: InterceptedMethod[] = [...this._captured];

        if (this._options.captureClear) methods.push("clear");
        if (methods.length === 0) return;

        this._unhookConsole = interceptConsole(methods, (method, args) => {
            if (method === "clear") this.clear();
            else this._write(method, args);
        });
    }

    /** Whether uncaught errors and unhandled promise rejections are captured. */
    get captureErrors(): boolean {
        return this._unhookErrors !== undefined;
    }

    set captureErrors(value: boolean) {
        this._options.captureErrors = value;
        this._unhookErrors?.();
        this._unhookErrors = undefined;

        if (!value) return;

        this._unhookErrors = interceptGlobalErrors((error, kind) => {
            this._write("error", [kind === "unhandledrejection" ? "Uncaught (in promise)" : "Uncaught", error]);
        });
    }

    /** Show the console automatically when an error is logged or thrown. */
    get showOnError(): boolean {
        return this._options.showOnError;
    }

    set showOnError(value: boolean) {
        this._options.showOnError = value;
    }

    /** Keyboard key (`KeyboardEvent.code` or `.key`) toggling the console, or `null`. */
    get toggleKey(): string | null {
        return this._options.toggleKey;
    }

    set toggleKey(key: string | null) {
        this._options.toggleKey = key;
        this._removeKeyListener?.();
        this._removeKeyListener = undefined;

        if (!key || typeof window === "undefined") return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || (event.code !== key && event.key !== key) || isEditable(event.target)) return;
            this.toggle();
        };

        window.addEventListener("keydown", onKeyDown);
        this._removeKeyListener = () => window.removeEventListener("keydown", onKeyDown);
    }

    /** Keeps the console sized to a renderer, see {@link PixiConsoleOptions.autoResize}. */
    get autoResize(): AutoResizeOptions | null {
        return this._options.autoResize;
    }

    set autoResize(value: AutoResizeOptions | null) {
        this._options.autoResize = value;
        this._removeAutoResize?.();
        this._removeAutoResize = undefined;

        if (!value) return;

        const { renderer, layout = (screen) => ({ x: 0, y: 0, width: screen.width, height: screen.height }) } = value;
        const apply = () => {
            const bounds = layout(renderer.screen);

            if (bounds.x !== undefined) this.x = bounds.x;
            if (bounds.y !== undefined) this.y = bounds.y;
            this.resize(bounds.width, bounds.height);
        };

        renderer.on("resize", apply);
        this._removeAutoResize = () => renderer.off("resize", apply);
        apply();
    }

    // ------------------------------------------------------------------ logging

    /** Adds a `log` entry without writing to the browser console. Accepts the same arguments as `console.log`. */
    log(...args: unknown[]): this {
        return this._write("log", args);
    }

    /** Adds an `info` entry without writing to the browser console. */
    info(...args: unknown[]): this {
        return this._write("info", args);
    }

    /** Adds a `debug` entry without writing to the browser console. */
    debug(...args: unknown[]): this {
        return this._write("debug", args);
    }

    /** Adds a `warn` entry without writing to the browser console. */
    warn(...args: unknown[]): this {
        return this._write("warn", args);
    }

    /** Adds an `error` entry without writing to the browser console. */
    error(...args: unknown[]): this {
        return this._write("error", args);
    }

    /** Prints a message as-is, optionally in a custom colour. */
    print(message: string, color?: ColorSource): this {
        this._store.add("log", message, color);
        this._invalidate();

        return this;
    }

    /** Removes every entry. */
    clear(): this {
        this._store.clear();
        this._scrollY = 0;
        this._following = true;
        this._invalidate(true);

        return this;
    }

    // ------------------------------------------------------------------ visibility

    show(): this {
        this.visible = true;

        return this;
    }

    hide(): this {
        this.visible = false;
        this._drag = null;

        return this;
    }

    toggle(): this {
        return this.visible ? this.hide() : this.show();
    }

    // ------------------------------------------------------------------ scrolling

    /** Scroll offset in pixels from the top of the history. */
    get scrollY(): number {
        return this._scrollY;
    }

    /** Whether the view sticks to the newest entry. */
    get isFollowing(): boolean {
        return this._following;
    }

    scrollTo(y: number): this {
        this._update();

        const max = this._maxScroll();

        this._scrollY = Math.min(Math.max(0, y), max);
        this._following = this._scrollY >= max - 0.5;
        this._dirty = true;

        return this;
    }

    scrollBy(deltaY: number): this {
        return this.scrollTo(this._scrollY + deltaY);
    }

    /** Scrolls up by a number of lines. */
    scrollUp(lines = 1): this {
        return this.scrollBy(-lines * this._lineHeight);
    }

    /** Scrolls down by a number of lines. */
    scrollDown(lines = 1): this {
        return this.scrollBy(lines * this._lineHeight);
    }

    scrollToTop(): this {
        return this.scrollTo(0);
    }

    /** Scrolls to the newest entry and keeps following new ones. */
    scrollToBottom(): this {
        return this.scrollTo(Number.POSITIVE_INFINITY);
    }

    // ------------------------------------------------------------------ layout

    /** Changes the console size. Text is re-wrapped to the new width. */
    resize(width: number, height: number): this {
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));

        if (width === this._options.width && height === this._options.height) return this;

        const previousContentWidth = this._contentRect.width;

        this._options.width = width;
        this._options.height = height;
        this._applySize();
        this._invalidate(this._contentRect.width !== previousContentWidth);

        return this;
    }

    /**
     * Applies pending changes immediately. This happens automatically every frame the console is
     * rendered, call it only when you need up-to-date layout without rendering (e.g. in tests).
     */
    update(): this {
        this._update();

        return this;
    }

    /** Destroys the console, restores `console` and removes every listener it installed. */
    override destroy(options?: DestroyOptions): void {
        if (this.destroyed) return;

        this._unhookConsole?.();
        this._unhookErrors?.();
        this._removeKeyListener?.();
        this._removeAutoResize?.();
        this._unhookConsole = this._unhookErrors = this._removeKeyListener = this._removeAutoResize = undefined;
        this.onRender = null;

        // Text children share our styles: never let pixi destroy them per child.
        super.destroy({
            ...(typeof options === "object" ? options : {}),
            children: true,
            context: true,
            style: false,
            texture: false,
            textureSource: false,
        });
        this._style.destroy();
        this._wrapStyle.destroy();
        this._rows = [];
        this._lines = [];
    }

    // ------------------------------------------------------------------ internals

    private get _lineHeight(): number {
        return this._options.lineHeight ?? Math.round(this._options.fontSize * 1.4);
    }

    private get _resolution(): number {
        return this._options.resolution ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1);
    }

    private get _toolbarHeight(): number {
        return this._options.toolbar ? this._lineHeight + this._options.padding : 0;
    }

    private get _contentRect(): Rectangle {
        const { width, height, padding } = this._options;
        const top = this._toolbarHeight + (this._options.toolbar ? padding / 2 : padding);

        return new Rectangle(
            padding,
            top,
            Math.max(1, width - padding * 2 - SCROLLBAR_WIDTH),
            Math.max(1, height - top - padding),
        );
    }

    private _maxScroll(): number {
        return Math.max(0, this._lines.length * this._lineHeight - this._contentRect.height);
    }

    private _write(level: LogLevel, args: unknown[]): this {
        if (this.destroyed) return this;

        this._store.add(level, formatArgs(args, this._options.format));
        this._invalidate();

        if (level === "error" && this._options.showOnError) this.show();

        return this;
    }

    private _invalidate(rebuild = false): void {
        this._dirty = true;
        if (rebuild) this._needsRebuild = true;
    }

    private _createLabel(): Label {
        return this._options.textRenderer === "bitmap"
            ? new BitmapText({ text: "", style: this._style })
            : new Text({ text: "", style: this._style, resolution: this._resolution });
    }

    /** Re-creates everything that depends on the console size. */
    private _applySize(): void {
        const { width, height, backgroundColor, backgroundAlpha, padding } = this._options;
        const content = this._contentRect;

        this.boundsArea = new Rectangle(0, 0, width, height);
        this.hitArea = this.boundsArea;

        this._background.clear().rect(0, 0, width, height).fill({ color: backgroundColor, alpha: backgroundAlpha });
        this._mask.clear().rect(content.x, content.y, content.width, content.height).fill(0xffffff);
        this._content.position.set(content.x, content.y);
        this._wrapStyle.wordWrapWidth = content.width;

        this._separator.clear();
        if (this._options.toolbar) {
            this._separator
                .rect(padding / 2, this._toolbarHeight, width - padding, 1)
                .fill({ color: 0xffffff, alpha: 0.12 });
        }

        const poolSize = Math.ceil(content.height / this._lineHeight) + 1;

        for (const row of this._rows.splice(poolSize)) row.destroy();
        while (this._rows.length < poolSize) this._rows.push(this._content.addChild(this._createLabel()));

        this._rowLines = this._rows.map(() => null);
        this._countsKey = "";
    }

    private _createToolbar(): void {
        if (!this._options.toolbar) return;

        for (const level of LOG_LEVELS) {
            const chip = this._createButton(() => {
                if (this._filter.has(level)) this._filter.delete(level);
                else this._filter.add(level);
                this._invalidate(true);
            });

            chip.tint = this._options.colors[level];
            this._chips.set(level, chip);
        }

        this._clearButton = this._createButton(() => this.clear());
        this._clearButton.text = "clear";
        this._closeButton = this._createButton(() => this.hide());
        this._closeButton.text = "×";
    }

    private _createButton(onTap: () => void): Label {
        const button = this._toolbar.addChild(this._createLabel());

        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointertap", (event: FederatedPointerEvent) => {
            event.stopPropagation();
            onTap();
        });
        button.on("pointerdown", (event: FederatedPointerEvent) => event.stopPropagation());

        return button;
    }

    private _setupPointer(): void {
        this.eventMode = this._options.interactive ? "static" : "none";

        this.on("wheel", (event: FederatedWheelEvent) => {
            const unit =
                event.deltaMode === 1 ? this._lineHeight : event.deltaMode === 2 ? this._contentRect.height : 1;
            this.scrollBy(event.deltaY * unit);
        });

        this.on("pointerdown", (event: FederatedPointerEvent) => {
            this._drag = {
                pointerId: event.pointerId,
                startY: this.toLocal(event.global).y,
                startScroll: this._scrollY,
            };
        });

        this.on("globalpointermove", (event: FederatedPointerEvent) => {
            if (this._drag?.pointerId !== event.pointerId) return;
            this.scrollTo(this._drag.startScroll - (this.toLocal(event.global).y - this._drag.startY));
        });

        const endDrag = () => (this._drag = null);

        this.on("pointerup", endDrag);
        this.on("pointerupoutside", endDrag);
        this.on("pointercancel", endDrag);
    }

    private _update(): void {
        if (this.destroyed || !this._dirty) return;

        this._layoutLines();

        const max = this._maxScroll();

        this._scrollY = this._following ? max : Math.min(Math.max(0, this._scrollY), max);

        this._renderRows();
        this._renderScrollbar();
        this._renderToolbar();
        this._dirty = false;
    }

    /** Turns new entries into wrapped lines, incrementally when possible. */
    private _layoutLines(): void {
        const entries = this._store.entries;

        if (this._needsRebuild) {
            this._lines = [];
            this._lineBase = 0;
            this._laidOutUpTo = -1;
            this._rowLines.fill(null);
            this._needsRebuild = false;
        } else {
            // Entries evicted by `maxEntries` sit at the front.
            const firstId = this._store.firstId;
            let evicted = 0;

            while ((this._lines[evicted]?.entry.id ?? firstId) < firstId) evicted++;

            if (evicted > 0) {
                this._lines.splice(0, evicted);
                this._lineBase += evicted;
                this._scrollY = Math.max(0, this._scrollY - evicted * this._lineHeight);
            }

            // The newest entry may have been collapsed into since it was laid out.
            const tail = this._lines.at(-1);

            if (tail && tail.count !== tail.entry.count) {
                while (this._lines.at(-1)?.entry === tail.entry) this._lines.pop();
                this._laidOutUpTo = Math.min(this._laidOutUpTo, tail.entry.id - 1);
            }
        }

        let start = entries.length;

        while (start > 0 && (entries[start - 1]?.id ?? -1) > this._laidOutUpTo) start--;

        for (const entry of entries.slice(start)) this._layoutEntry(entry);

        this._laidOutUpTo = entries.at(-1)?.id ?? this._laidOutUpTo;
    }

    private _layoutEntry(entry: StoredEntry): void {
        if (!this._filter.has(entry.level)) return;

        let text = entry.count > 1 ? `${entry.message} (×${entry.count})` : entry.message;

        if (this._options.timestamps) text = `${formatTime(entry.timestamp)} ${text}`;

        const color = entry.color ?? this._options.colors[entry.level];

        for (const line of this._wrap(text)) {
            this._lines.push({ entry, count: entry.count, text: line, color });
        }
    }

    private _wrap(text: string): string[] {
        const clean = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
        let lines: string[];

        if (this._options.textRenderer === "bitmap") {
            lines = BitmapFontManager.getLayout(clean, this._wrapStyle).lines.map((line) => line.chars.join(""));
        } else {
            lines = CanvasTextMetrics.measureText(clean, this._wrapStyle, undefined, true).lines;
        }

        // Bitmap layouts end with an empty line; trailing blank lines carry no information anyway.
        while (lines.length > 1 && lines.at(-1)?.trim() === "") lines.pop();

        return lines.length > 0 ? lines : [""];
    }

    private _renderRows(): void {
        const lineHeight = this._lineHeight;
        const poolSize = this._rows.length;
        const first = Math.floor(this._scrollY / lineHeight);
        const offsetY = Math.round((lineHeight - this._options.fontSize * 1.2) / 2);

        for (let i = first; i < first + poolSize; i++) {
            const slot = (this._lineBase + i) % poolSize;
            const row = this._rows[slot];
            const line = this._lines[i];

            if (!row) continue;

            if (!line) {
                row.visible = false;
                this._rowLines[slot] = null;
                continue;
            }

            if (this._rowLines[slot] !== line) {
                row.text = line.text;
                row.tint = line.color;
                this._rowLines[slot] = line;
            }

            row.visible = true;
            row.y = Math.round(i * lineHeight - this._scrollY + offsetY);
        }
    }

    private _renderScrollbar(): void {
        const content = this._contentRect;
        const total = this._lines.length * this._lineHeight;

        this._scrollbar.clear();

        if (total <= content.height) return;

        const thumbHeight = Math.max(MIN_THUMB_HEIGHT, (content.height * content.height) / total);
        const progress = this._scrollY / this._maxScroll();
        const x = this._options.width - SCROLLBAR_WIDTH - this._options.padding / 2;

        this._scrollbar
            .roundRect(x, content.y + (content.height - thumbHeight) * progress, SCROLLBAR_WIDTH, thumbHeight, 2)
            .fill({ color: 0xffffff, alpha: 0.35 });
    }

    private _renderToolbar(): void {
        if (!this._options.toolbar) return;

        const counts = this._store.counts;
        const key = `${LOG_LEVELS.map((level) => `${counts[level]}${+this._filter.has(level)}`).join()}|${this._options.width}`;

        if (key === this._countsKey) return;
        this._countsKey = key;

        const { padding, width, fontSize } = this._options;
        const gap = fontSize;
        const centerY = (label: Label) => Math.round((this._toolbarHeight - label.height) / 2);

        this._closeButton.position.set(width - padding - this._closeButton.width, centerY(this._closeButton));
        this._clearButton.position.set(this._closeButton.x - gap - this._clearButton.width, centerY(this._clearButton));

        let x = padding;

        for (const [level, chip] of this._chips) {
            chip.text = `${level} ${formatCount(counts[level])}`;
            chip.alpha = this._filter.has(level) ? 1 : DISABLED_ALPHA;
            chip.position.set(x, centerY(chip));
            chip.visible = x + chip.width <= this._clearButton.x - gap;
            x += chip.width + gap;
        }

        for (const label of this._toolbar.children as Label[]) {
            label.hitArea = new Rectangle(-gap / 2, -label.y, label.width + gap, this._toolbarHeight);
        }
    }
}

function installFont(fontFamily: string, fontSize: number, resolution: number): string {
    const name = `pixi-console:${fontFamily}:${fontSize}:${resolution}`;

    if (!Cache.has(`${name}-bitmap`)) {
        BitmapFont.install({
            name,
            style: { fontFamily, fontSize, fill: 0xffffff },
            chars: BitmapFontManager.ASCII,
            resolution,
            dynamicFill: true,
        });
    }

    return name;
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number, length = 2) => String(value).padStart(length, "0");

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatCount(count: number): string {
    return count > 9999 ? `${Math.floor(count / 1000)}k` : String(count);
}

function isEditable(target: EventTarget | null): boolean {
    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;

    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
