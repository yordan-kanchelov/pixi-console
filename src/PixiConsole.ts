import {
    BitmapFont,
    BitmapFontManager,
    BitmapText,
    Cache,
    CanvasTextMetrics,
    Color,
    Container,
    Graphics,
    Point,
    Rectangle,
    Text,
    TextStyle,
    VERSION,
    type ColorSource,
    type DestroyOptions,
    type FederatedEvent,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
    type Renderer,
} from "pixi.js";

import {
    builtinCommands,
    CommandRegistry,
    evalBlockedMessage,
    isThenable,
    parseCommandLine,
    type CommandContext,
    type CommandHandler,
    type ConsoleCommand,
    type ConsoleEvaluator,
} from "./core/commands";
import { formatArgs, numberOr } from "./core/format";
import { InputHistory } from "./core/history";
import { interceptConsole, interceptGlobalErrors, type InterceptedMethod } from "./core/intercept";
import { LogStore, type StoredEntry } from "./core/store";
import { LOG_LEVELS, type ConsoleEntry, type EntryKind, type LogLevel } from "./core/types";
import {
    DEFAULT_OPTIONS,
    resolveOptions,
    toLevels,
    type AutoResizeOptions,
    type PixiConsoleInit,
    type PixiConsoleOptions,
} from "./options";
import { PromptInput, type PromptGeometry } from "./ui/PromptInput";
import { Toolbar } from "./ui/Toolbar";

type Label = Text | BitmapText;

/** One visual (already wrapped) line of an entry. */
interface Line {
    entry: StoredEntry;
    /** `entry.count` at layout time; a mismatch means the entry was collapsed into again. */
    count: number;
    text: string;
    color: ColorSource;
}

/** An entry's wrapped lines, and what they depend on besides the entry's message. */
interface WrappedEntry {
    width: number;
    count: number;
    timestamps: boolean;
    lines: readonly string[];
}

/**
 * Where the reader is while not following. A line of an entry rather than a pixel offset, because
 * filter changes and re-wrapping move every line.
 */
interface ScrollAnchor {
    /** Id of the entry at the top of the view. */
    entryId: number;
    /** Which of the entry's wrapped lines is at the top. */
    lineInEntry: number;
    /** Pixels of that line scrolled out of view. */
    remainder: number;
}

interface Drag {
    pointerId: number;
    startY: number;
    startScroll: number;
}

const SCROLLBAR_WIDTH = 4;
const MIN_THUMB_HEIGHT = 16;

/** Placeholders of the command line, without and with an evaluator. */
const PROMPT_PLACEHOLDER = "Type help and press Enter";
const EVALUATOR_PLACEHOLDER = "Type a command or JavaScript";
/** Alpha of the `>` glyph while the command line doesn't have focus. */
const PROMPT_IDLE_ALPHA = 0.5;
const EVAL_BLOCKED_HINT =
    "JavaScript evaluation is blocked by this page's Content-Security-Policy ('unsafe-eval' is not allowed). " +
    "Commands still work: add them with addCommand().";
const NO_CANVAS_NOTICE = "The command line needs pixi.js 8.7+ or the autoResize option to find the canvas.";
/**
 * How long after a touch or pen press its compatibility mouse events may still come, in ms. They can
 * come about 300 ms late on pages without a mobile viewport meta tag.
 */
const TAP_TIMEOUT = 1000;

/**
 * Pointer events that stop at the console, so that pressing, tapping or wheeling over it doesn't also
 * reach objects underneath, such as a stage-wide "tap to shoot" handler. The console only gets the
 * click family when both the press and the release were on it. Releases are handled separately.
 *
 * Known limitation: a drag that starts on the console and ends outside it still delivers `pointerup`
 * and the click/tap to what is underneath. pixi dispatches the release on its target and the click
 * family on the common ancestor of press and release, usually the stage, and the console is on
 * neither path, so it can't stop them.
 */
const CONSUMED_EVENTS = [
    "wheel",
    "pointerdown",
    "mousedown",
    "rightdown",
    "touchstart",
    "pointertap",
    "click",
    "rightclick",
    "tap",
] as const;

/**
 * An in-canvas developer console for PixiJS v8.
 *
 * Captures `console.*` calls and uncaught errors and renders them on top of your scene, which is
 * invaluable on devices without devtools. Rendering is virtualized: only the visible lines exist as
 * display objects, so tens of thousands of logs cost the same to draw as a screenful.
 *
 * The console is a render group of its own, so its text changing with every log doesn't make pixi
 * rebuild the rest of the stage. Don't cache it, or an ancestor, with `cacheAsTexture`: it would stop
 * updating.
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
    private readonly _separator = new Graphics();
    private readonly _content = new Container({ label: "lines" });
    private readonly _mask = new Graphics();
    private readonly _scrollbar = new Graphics();
    private _toolbar: Toolbar | null = null;

    private readonly _style: TextStyle;
    private readonly _wrapStyle: TextStyle;
    /** Toolbar labels always use the bitmap font, whatever the {@link PixiConsoleOptions.textRenderer}. */
    private readonly _toolbarStyle: TextStyle;
    /** The bitmap font in use, see {@link acquireFont}. `null` with canvas text and no toolbar. */
    private _font: { name: string; resolution: number } | null = null;
    /** The renderer that last drew the console to the screen, or the {@link autoResize} one until then. */
    private _renderer: Renderer | null;

    /** Pool of row labels. The line at absolute index `i` is always drawn by `_rows[i % _rows.length]`. */
    private _rows: Label[] = [];
    private _rowLines: (Line | null)[] = [];

    private _lines: Line[] = [];
    /** Number of lines dropped from the front since the last rebuild; keeps absolute line indices stable. */
    private _lineBase = 0;
    private _laidOutUpTo = -1;
    private _needsRebuild = true;
    private _dirty = true;
    /** Wrapped lines per entry, so that rebuilds (filter changes, collapses) only wrap what changed. */
    private readonly _wrapped = new WeakMap<StoredEntry, WrappedEntry>();

    private _scrollY = 0;
    private _following = true;
    /** Where the reader is while not following. Set by scrolling, never by clamping, see {@link _resolveAnchor}. */
    private _anchor: ScrollAnchor | null = null;
    private _drag: Drag | null = null;
    /** Pointers pressed on the console: their releases don't reach objects underneath either. */
    private readonly _pressed = new Set<number>();
    /** Whether the release being dispatched (`pointerup`, then `mouseup` or `touchend`) is the console's. */
    private _consumeRelease = false;
    /** Element with the non-passive wheel listener, see {@link _syncWheel}. */
    private _wheelTarget: HTMLElement | null = null;
    private readonly _wheelPoint = new Point();

    private readonly _registry = new CommandRegistry();
    private readonly _history = new InputHistory();
    /** The command line's DOM input, created the first time {@link prompt} is enabled. */
    private _promptInput: PromptInput | null = null;
    /** The `>` in front of the command line. */
    private _promptGlyph: Label | null = null;
    private _lastResult: unknown;
    /** Focus the command line as soon as it can be placed, see {@link focusPrompt}. */
    private _pendingFocus = false;
    /** Whether the notice that the canvas can't be found was printed. */
    private _promptNotice = false;
    /** The last press on the page while {@link prompt} is on, see {@link _guardFocus}. */
    private _lastPress: { pointerType: string; timeStamp: number } | null = null;
    /** The prompt row's top-left corner, and the ends of one local unit along x and y from it, in global coordinates. */
    private readonly _rowOrigin = new Point();
    private readonly _rowAlongX = new Point();
    private readonly _rowAlongY = new Point();

    private _unhookConsole?: () => void;
    private _unhookErrors?: () => void;
    private _removeKeyListener?: () => void;
    private _removeAutoResize?: () => void;
    /** Follows the screen size on pixi.js 8.0, whose renderers emit no `resize` event. */
    private _pollAutoResize?: () => void;
    private _removeCancelListener?: () => void;
    private _removePressListener?: () => void;
    private _removeFocusGuard?: () => void;

    constructor(options: PixiConsoleInit = {}) {
        // A render group of its own: text changing with every log then only rebuilds the console's
        // instructions instead of the whole stage's.
        super({ label: "PixiConsole", isRenderGroup: true });

        this._options = resolveOptions(options);
        this._store = new LogStore(this._options);
        this._filter = new Set(this._options.filter);
        this._renderer = this._options.autoResize?.renderer ?? null;
        this.visible = this._options.visible;

        // Before any global hook is installed, since an invalid command name throws.
        for (const [name, command] of Object.entries(builtinCommands())) this._registry.add(name, command);
        for (const [name, command] of Object.entries(this._options.commands)) this._registry.add(name, command);

        const { fontSize, fontFamily } = this._options;

        this._style = new TextStyle({ fontFamily, fontSize, fill: 0xffffff });
        this._wrapStyle = new TextStyle({
            fontFamily,
            fontSize,
            fill: 0xffffff,
            wordWrap: true,
            breakWords: true,
            whiteSpace: "pre",
        });
        this._toolbarStyle = new TextStyle({ fontFamily, fontSize, fill: 0xffffff });

        // Decorative children never take pointer events: hit testing stops at the console's hitArea.
        for (const child of [this._background, this._content, this._separator, this._scrollbar]) {
            child.eventMode = "none";
        }

        this._content.mask = this._mask;
        this.addChild(this._background, this._content, this._mask, this._scrollbar, this._separator);

        this._setupPointer();
        // Also installs the bitmap font and lays everything out.
        this.toolbar = this._options.toolbar;

        this.captureConsole = this._options.captureConsole;
        this.captureErrors = this._options.captureErrors;
        this.toggleKey = this._options.toggleKey;
        this.autoResize = this._options.autoResize;
        this.prompt = this._options.prompt;

        // The command line lives in the document, next to the canvas: it goes when the console leaves
        // the stage, and comes back with the next render after it is added again.
        this.on("removed", () => this._promptInput?.detach());

        // On a private child, so that `onRender` stays free for users.
        this._content.onRender = (renderer?: Renderer) => this._onFrame(renderer);
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

    /**
     * Retained entries, oldest first, including those hidden by the {@link filter}. A live view: it
     * changes as entries are added, collapsed into or dropped. Copy it (`[...devConsole.entries]`) to
     * keep a snapshot.
     */
    get entries(): readonly ConsoleEntry[] {
        return this._store.entries;
    }

    /**
     * Calls per level that the retained {@link entries} stand for, collapsed repeats included. Entries
     * dropped by {@link maxEntries} are subtracted, and entries with a `kind` (command-line input and
     * results) are not counted.
     */
    get counts(): Readonly<Record<LogLevel, number>> {
        return this._store.counts;
    }

    /** Levels that are currently displayed. */
    get filter(): LogLevel[] {
        return LOG_LEVELS.filter((level) => this._filter.has(level));
    }

    set filter(levels: readonly LogLevel[]) {
        if (this.destroyed) return;

        this._filter = new Set(levels);
        this._invalidate(true);
    }

    /**
     * Maximum number of entries kept, see {@link PixiConsoleOptions.maxEntries}. Lowering it drops the
     * oldest entries right away.
     */
    get maxEntries(): number {
        return this._options.maxEntries;
    }

    set maxEntries(value: number) {
        if (this.destroyed) return;

        this._options.maxEntries = this._store.options.maxEntries = numberOr(value, DEFAULT_OPTIONS.maxEntries);
        this._store.trim();
        this._invalidate();
    }

    /** Whether consecutive identical messages are merged, see {@link PixiConsoleOptions.collapseRepeats}. */
    get collapseRepeats(): boolean {
        return this._options.collapseRepeats;
    }

    set collapseRepeats(value: boolean) {
        if (this.destroyed) return;

        this._options.collapseRepeats = this._store.options.collapseRepeats = value;
    }

    /** Whether entries are prefixed with their time, see {@link PixiConsoleOptions.timestamps}. */
    get timestamps(): boolean {
        return this._options.timestamps;
    }

    set timestamps(value: boolean) {
        if (this.destroyed) return;

        this._options.timestamps = value;
        this._invalidate(true);
    }

    /** `console` levels currently captured. Assign `true`, `false` or a list of levels to change it. */
    get captureConsole(): LogLevel[] {
        return [...this._captured];
    }

    set captureConsole(value: boolean | readonly LogLevel[]) {
        if (this.destroyed) return;

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
        if (this.destroyed) return;

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

    /** Whether the toolbar is shown, see {@link PixiConsoleOptions.toolbar}. */
    get toolbar(): boolean {
        return this._options.toolbar;
    }

    set toolbar(value: boolean) {
        if (this.destroyed) return;

        this._options.toolbar = value;

        if (value && !this._toolbar) {
            this._toolbar = new Toolbar(this._toolbarStyle, this._options.colors, {
                toggle: (level) => {
                    if (this._filter.has(level)) this._filter.delete(level);
                    else this._filter.add(level);
                    this._invalidate(true);
                },
                clear: () => this.clear(),
                close: () => this.hide(),
            });
            this.addChildAt(this._toolbar, this.getChildIndex(this._separator) + 1);
        } else if (!value && this._toolbar) {
            this._toolbar.destroy({ children: true });
            this._toolbar = null;
        }

        this._syncFont();
        this._applySize();
        this._invalidate();
    }

    /** Keyboard key (`KeyboardEvent.code` or `.key`) toggling the console, or `null`. */
    get toggleKey(): string | null {
        return this._options.toggleKey;
    }

    set toggleKey(key: string | null) {
        if (this.destroyed) return;

        this._options.toggleKey = key;
        this._removeKeyListener?.();
        this._removeKeyListener = undefined;

        if (!key || typeof window === "undefined") return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || (event.code !== key && event.key !== key) || isEditable(event)) return;

            this.toggle();

            // Only when nothing else has the focus: a text field in a closed shadow root looks like
            // its host from here, and must keep what is typed into it.
            const { target } = event;
            const idle =
                target === document.body || target === document.documentElement || target === this._renderer?.canvas;

            if (this.visible && this._options.prompt && idle) {
                // Otherwise the key would be typed into the command line it focuses.
                event.preventDefault();
                this.focusPrompt();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        this._removeKeyListener = () => window.removeEventListener("keydown", onKeyDown);
    }

    /** Keeps the console sized to a renderer, see {@link PixiConsoleOptions.autoResize}. */
    get autoResize(): AutoResizeOptions | null {
        return this._options.autoResize;
    }

    set autoResize(value: AutoResizeOptions | null) {
        if (this.destroyed) return;

        this._options.autoResize = value;
        this._removeAutoResize?.();
        this._removeAutoResize = undefined;

        if (!value) return;

        const { renderer, layout = (screen) => ({ x: 0, y: 0, width: screen.width, height: screen.height }) } = value;
        const apply = () => {
            const bounds = layout(renderer.screen);

            // Whole pixels: text at a fractional offset is resampled and blurry.
            if (bounds.x !== undefined) this.x = Math.round(bounds.x);
            if (bounds.y !== undefined) this.y = Math.round(bounds.y);
            this.resize(bounds.width, bounds.height);
        };

        this._renderer ??= renderer;

        // pixi.js 8.0 renderers are not event emitters: check the screen size every frame instead.
        if (typeof (renderer as { on?: unknown }).on !== "function") {
            let { width, height } = renderer.screen;

            this._pollAutoResize = () => {
                if (renderer.screen.width === width && renderer.screen.height === height) return;
                ({ width, height } = renderer.screen);
                apply();
            };
            this._removeAutoResize = () => (this._pollAutoResize = undefined);
            apply();

            return;
        }

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
        if (this.destroyed) return this;

        this._store.add("log", message, color);
        this._invalidate();

        return this;
    }

    /** Removes every entry. */
    clear(): this {
        this._store.clear();
        this._scrollY = 0;
        this._following = true;
        this._anchor = null;
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
        this._pressed.clear();
        this._detachWheel();
        // Right away rather than on the next render: blurring closes the on-screen keyboard.
        this._pendingFocus = false;
        this._promptInput?.detach();

        return this;
    }

    toggle(): this {
        return this.visible ? this.hide() : this.show();
    }

    // ------------------------------------------------------------------ command line

    /** Whether the command line is shown, see {@link PixiConsoleOptions.prompt}. */
    get prompt(): boolean {
        return this._options.prompt;
    }

    set prompt(value: boolean) {
        if (this.destroyed) return;

        this._options.prompt = value;

        if (value) {
            this._promptGlyph ??= this._createPromptGlyph();
            this._promptInput ??= this._createPromptInput();
            this._watchPresses();
        } else {
            this._pendingFocus = false;
            this._promptInput?.detach();
            this._removePressListener?.();
            this._removePressListener = undefined;
            this._removeFocusGuard?.();
        }

        // The log makes room for the prompt row. Its width doesn't change, so nothing is wrapped again.
        this._applySize();
        this._invalidate();
    }

    /**
     * The command line's `<input>`, created the first time {@link prompt} is enabled and kept until
     * {@link destroy}; `null` before that. Use it for `placeholder`, `maxLength`, extra listeners or
     * styling. It is only in the document while the console is displayed.
     */
    get promptElement(): HTMLInputElement | null {
        return this._promptInput?.element ?? null;
    }

    /** Runs lines that are not commands, see {@link PixiConsoleOptions.evaluator}. */
    get evaluator(): ConsoleEvaluator | null {
        return this._options.evaluator;
    }

    set evaluator(value: ConsoleEvaluator | null) {
        if (this.destroyed) return;

        this._options.evaluator = value;

        const input = this._promptInput?.element;

        // Only swap a default placeholder, never one the app set.
        if (input && (input.placeholder === PROMPT_PLACEHOLDER || input.placeholder === EVALUATOR_PLACEHOLDER)) {
            input.placeholder = this._placeholder;
        }
    }

    /**
     * Registered commands by lower-case name, built-ins included. A snapshot: change it with
     * {@link addCommand} / {@link removeCommand}.
     */
    get commands(): Readonly<Record<string, Readonly<ConsoleCommand>>> {
        return this._registry.entries();
    }

    /**
     * Registers or replaces a command. Names are case-insensitive.
     * @throws TypeError when `name` is not one word matching `/^[a-z][\w:-]*$/i`.
     * @example devConsole.addCommand("fps", () => app.ticker.FPS.toFixed(1));
     */
    addCommand(name: string, command: ConsoleCommand | CommandHandler): this {
        if (this.destroyed) return this;

        this._registry.add(name, command);

        return this;
    }

    /** Unregisters a command, built-ins included. Unknown names are ignored. */
    removeCommand(name: string): this {
        this._registry.remove(name);

        return this;
    }

    /**
     * Runs a line as if it was entered at the prompt: echoes it as `> line`, runs the matching command
     * or the {@link evaluator}, and prints the result. Works whether or not {@link prompt} is on.
     * Synchronous results are printed before this returns. Not added to {@link history}.
     * @returns The result, awaited when it is a promise; `undefined` when the line was blank or failed.
     * Failures are printed, never thrown or rejected.
     */
    execute(line: string): Promise<unknown> {
        const trimmed = line.trim();

        if (this.destroyed || trimmed === "") return Promise.resolve(undefined);

        this._printLine("input", "log", `> ${trimmed}`, this._options.colors.info);

        const { name, args } = parseCommandLine(trimmed);
        const command = this._registry.get(name);
        const { evaluator } = this._options;

        if (!command && !evaluator) {
            const word = trimmed.split(/\s/, 1)[0] ?? name;

            this._printLine("result", "warn", `Unknown command "${word}". Type help to list commands.`);

            return Promise.resolve(undefined);
        }

        const context: CommandContext = { pixiConsole: this, line: trimmed, lastResult: this._lastResult };
        const fromEvaluator = !command;
        let result: unknown;

        try {
            result = command ? command.run(args, context) : evaluator?.(trimmed, context);

            if (isThenable(result)) {
                // Handled here, so the console's own unhandledrejection capture never reports it again.
                return Promise.resolve(result).then(
                    (value) => {
                        this._printResult(value, fromEvaluator);

                        return value;
                    },
                    (error: unknown) => {
                        this._printFailure(error, fromEvaluator, true);

                        return undefined;
                    },
                );
            }
        } catch (error) {
            this._printFailure(error, fromEvaluator, false);

            return Promise.resolve(undefined);
        }

        this._printResult(result, fromEvaluator);

        return Promise.resolve(result);
    }

    /** What the last line produced: every evaluator result, and command results other than `undefined`. */
    get lastResult(): unknown {
        return this._lastResult;
    }

    /**
     * Lines entered at the prompt, oldest first, at most 100. Assign it to restore a saved history,
     * e.g. from localStorage.
     */
    get history(): readonly string[] {
        return this._history.lines;
    }

    set history(lines: readonly string[]) {
        if (this.destroyed) return;

        this._history.lines = lines;
    }

    /**
     * Shows the console and focuses the command line. Does nothing when {@link prompt} is off. If the
     * input can't be placed yet (renderer not known), it is focused after the next render. On touch
     * devices the on-screen keyboard only opens when this runs inside a user gesture.
     */
    focusPrompt(): this {
        if (this.destroyed || !this._options.prompt || !this._promptInput) return this;

        this.show();
        this._pendingFocus = true;
        // Now rather than on the next render: a user gesture may be needed to open the keyboard.
        this._syncPrompt(false);
        this._guardFocus();

        return this;
    }

    /** Removes focus from the command line, closing the on-screen keyboard and returning keys to the page. */
    blurPrompt(): this {
        this._pendingFocus = false;
        this._promptInput?.blur();

        return this;
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
        if (this.destroyed) return this;

        this._update();

        const max = this._maxScroll();

        this._scrollY = Math.min(Math.max(0, y), max);
        this._following = this._scrollY >= max - 0.5;
        this._anchor = this._following ? null : this._anchorAt(this._scrollY);
        this._dirty = true;

        return this;
    }

    scrollBy(deltaY: number): this {
        // Pending changes can move the view (e.g. a filter change keeps the reader's entry at the top).
        this._update();

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
        if (this.destroyed) return this;

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
        this._removeCancelListener?.();
        this._removePressListener?.();
        this._removeFocusGuard?.();
        this._unhookConsole = this._unhookErrors = this._removeKeyListener = undefined;
        this._removeAutoResize = this._removeCancelListener = this._removePressListener = undefined;
        this._detachWheel();
        this._content.onRender = null;
        this._drag = null;
        this._pressed.clear();
        this._promptInput?.destroy();
        this._promptInput = null;
        this._pendingFocus = false;
        this._registry.clear();
        this._lastResult = undefined;

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
        this._toolbarStyle.destroy();
        if (this._font) releaseFont(this._font.name);
        this._font = null;
        this._toolbar = null;
        this._promptGlyph = null;
        this._renderer = null;
        this._rows = [];
        this._lines = [];
    }

    // ------------------------------------------------------------------ internals

    private get _lineHeight(): number {
        return this._options.lineHeight ?? Math.round(this._options.fontSize * 1.4);
    }

    /** Resolution of the bitmap font atlas: the option, else the renderer's, else the device's. */
    private get _fontResolution(): number {
        return (
            this._options.resolution ??
            this._renderer?.resolution ??
            (typeof window !== "undefined" ? window.devicePixelRatio : 1)
        );
    }

    private get _toolbarHeight(): number {
        return this._options.toolbar ? this._lineHeight + this._options.padding : 0;
    }

    /** Height of the command line row at the bottom. */
    private get _promptHeight(): number {
        return this._options.prompt ? this._lineHeight + this._options.padding : 0;
    }

    private get _contentRect(): Rectangle {
        const { width, height, padding, toolbar, prompt } = this._options;
        const top = this._toolbarHeight + (toolbar ? padding / 2 : padding);
        const bottom = prompt ? this._promptHeight + padding / 2 : padding;

        return new Rectangle(
            padding,
            top,
            Math.max(1, width - padding * 2 - SCROLLBAR_WIDTH),
            Math.max(1, height - top - bottom),
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

    /** A label in the configured text renderer. `roundPixels` keeps glyphs on whole pixels, where they are sharp. */
    private _createLabel(): Label {
        const { textRenderer, resolution } = this._options;

        return textRenderer === "bitmap"
            ? new BitmapText({ text: "", style: this._style, roundPixels: true })
            : // Without an explicit resolution, Text follows the renderer's.
              new Text({ text: "", style: this._style, roundPixels: true, resolution });
    }

    /**
     * Keeps the bitmap font in step: acquired while bitmap rows or the toolbar use it, and installed
     * again under a new name when the resolution it should be rasterized at changes. Glyph advances
     * don't depend on the resolution, so nothing needs to be wrapped again.
     */
    private _syncFont(): void {
        const { textRenderer, toolbar, fontFamily, fontSize } = this._options;
        const needed = textRenderer === "bitmap" || toolbar;
        const resolution = this._fontResolution;
        const previous = this._font;

        if (needed ? previous?.resolution === resolution : previous === null) return;

        this._font = needed ? { name: acquireFont(fontFamily, fontSize, resolution), resolution } : null;

        if (this._font) {
            this._toolbarStyle.fontFamily = this._font.name;
            if (textRenderer === "bitmap") this._style.fontFamily = this._wrapStyle.fontFamily = this._font.name;
        }

        if (previous) releaseFont(previous.name);
    }

    /** Runs every frame the console's render group is rendered, even while it is hidden. */
    private _onFrame(renderer?: Renderer): void {
        // pixi 8.7+ passes the renderer. RenderTexture passes don't say where the console is shown.
        const toScreen = renderer ? drawsToCanvas(renderer) : true;

        if (renderer && toScreen) this._renderer = renderer;

        this._pollAutoResize?.();

        // Hidden, also by a parent: skip the work. Layout catches up once shown, with at most
        // `maxEntries` entries.
        if (!isShown(this)) {
            this._detachWheel();
            // Takes the command line out of the document.
            if (toScreen) this._syncPrompt(true);

            return;
        }

        if (toScreen) {
            this._syncFont();
            this._syncWheel();
        }

        this._update();

        if (toScreen) this._syncPrompt(true);
    }

    /** Keeps a non-passive wheel listener on the renderer's DOM element while the console is interactive. */
    private _syncWheel(): void {
        const interactive = this.eventMode === "static" || this.eventMode === "dynamic";
        const events = this._renderer?.events;
        const target = interactive ? (events?.domElement ?? null) : null;

        if (target === this._wheelTarget) return;

        this._detachWheel();
        target?.addEventListener("wheel", this._onNativeWheel, { passive: false });
        this._wheelTarget = target;
    }

    private _detachWheel(): void {
        this._wheelTarget?.removeEventListener("wheel", this._onNativeWheel);
        this._wheelTarget = null;
    }

    /**
     * pixi listens to `wheel` passively, so the page would scroll along with the console. This cancels
     * wheels over the console, but not over objects on top of it.
     */
    private readonly _onNativeWheel = (event: WheelEvent): void => {
        const renderer = this._renderer;
        const events = renderer?.events;

        // Without pixi wheel events the console doesn't scroll, so the page may. Nor does it zoom
        // (ctrl+wheel, or a trackpad pinch) or scroll sideways: leave those to the browser.
        if (!renderer || !events?.features.wheel || event.ctrlKey || event.deltaY === 0) return;

        // Like pixi does for its own wheel event: hit test what was last rendered to the screen.
        events.rootBoundary.rootTarget = renderer.lastObjectRendered;
        events.mapPositionToPoint(this._wheelPoint, event.clientX, event.clientY);

        let target: Container | null | undefined = events.rootBoundary.hitTest(this._wheelPoint.x, this._wheelPoint.y);

        while (target && target !== this) target = target.parent;
        if (target === this) event.preventDefault();
    };

    /**
     * Places the command line over the prompt row, or takes it out of the document while the console
     * isn't displayed. Runs on every screen render, hidden or not, and from {@link focusPrompt}.
     */
    private _syncPrompt(fromRender: boolean): void {
        const input = this._promptInput;
        const glyph = this._promptGlyph;

        if (!input || !glyph || !this._options.prompt) return;

        const opacity = displayedOpacity(this);
        const renderer = this._renderer;
        const canvas = renderer?.canvas;

        if (opacity <= 0 || !renderer) {
            if (input.attached) input.detach();

            // pixi.js before 8.7 doesn't pass the renderer to onRender, and there is no autoResize one.
            if (opacity > 0 && fromRender && !this._promptNotice) {
                this._promptNotice = true;
                this._printLine("result", "warn", NO_CANVAS_NOTICE);
            }

            return;
        }

        // Nothing to put the input next to (e.g. an OffscreenCanvas, or a canvas not in the page yet).
        // Overlays can't be drawn over a fullscreen canvas either: fullscreen a wrapper element instead.
        if (
            !(canvas instanceof HTMLCanvasElement) ||
            !canvas.isConnected ||
            canvas.ownerDocument.fullscreenElement === canvas
        ) {
            if (input.attached) input.detach();

            return;
        }

        // Outside a render, the console may not be on screen yet: focus it once it is.
        if (!fromRender && rootOf(this) !== renderer.lastObjectRendered) return;

        input.place(canvas, this._promptGeometry(renderer, glyph, opacity));

        if (this._pendingFocus) {
            this._pendingFocus = false;
            input.focus();
        }
    }

    /** Where the prompt row is on the renderer's screen. */
    private _promptGeometry(renderer: Renderer, glyph: Label, opacity: number): PromptGeometry {
        const { width, height, padding, fontSize } = this._options;
        const rowHeight = this._promptHeight;
        const top = height - rowHeight;
        // `toGlobal` works out the transforms up the parents, so moves made this frame count, unlike
        // `worldTransform`, which is only updated after onRender.
        const origin = this.toGlobal(this._rowOrigin.set(0, top), this._rowOrigin);
        const xAxis = this.toGlobal(this._rowAlongX.set(1, top), this._rowAlongX);
        const yAxis = this.toGlobal(this._rowAlongY.set(0, top + 1), this._rowAlongY);

        xAxis.set(xAxis.x - origin.x, xAxis.y - origin.y);
        yAxis.set(yAxis.x - origin.x, yAxis.y - origin.y);

        return {
            screenWidth: renderer.screen.width,
            screenHeight: renderer.screen.height,
            origin,
            xAxis,
            yAxis,
            width,
            height: rowHeight,
            // The input covers the whole row, so tapping the glyph focuses it too.
            textInset: padding + glyph.width + Math.round(fontSize / 2),
            endInset: padding,
            fontSize,
            opacity,
        };
    }

    /** Remembers the last press on the page, for {@link _guardFocus}. */
    private _watchPresses(): void {
        if (this._removePressListener || typeof window === "undefined") return;

        const onPress = ({ pointerType, timeStamp }: PointerEvent) => {
            this._lastPress = { pointerType, timeStamp };
        };

        window.addEventListener("pointerdown", onPress, { capture: true, passive: true });
        this._removePressListener = () => {
            window.removeEventListener("pointerdown", onPress, true);
            this._lastPress = null;
        };
    }

    /**
     * After a touch or pen tap, the browser sends a compatibility `mousedown` to what was tapped, and
     * pixi doesn't cancel the press, so that `mousedown` would move the focus off the command line
     * that a pixi tap handler just focused. When {@link focusPrompt} runs during such a tap, this
     * cancels mousedowns until the tap's `click`, or for {@link TAP_TIMEOUT} ms.
     */
    private _guardFocus(): void {
        const press = this._lastPress;

        if (!press || press.pointerType === "mouse" || performance.now() - press.timeStamp > TAP_TIMEOUT) return;

        this._lastPress = null;
        this._removeFocusGuard?.();

        const prevent = (event: MouseEvent) => event.preventDefault();
        const remove = () => {
            clearTimeout(timeout);
            window.removeEventListener("mousedown", prevent, true);
            window.removeEventListener("click", remove);
            this._removeFocusGuard = undefined;
        };
        const timeout = setTimeout(remove, TAP_TIMEOUT);

        window.addEventListener("mousedown", prevent, true);
        // Not capturing, so that a click being dispatched right now (e.g. to a DOM button whose
        // handler called focusPrompt(), after its mousedown) ends the guard too.
        window.addEventListener("click", remove);
        this._removeFocusGuard = remove;
    }

    private get _placeholder(): string {
        return this._options.evaluator ? EVALUATOR_PLACEHOLDER : PROMPT_PLACEHOLDER;
    }

    private _createPromptGlyph(): Label {
        const glyph = this._createLabel();

        glyph.label = "prompt";
        glyph.text = ">";
        glyph.tint = this._options.colors.info;
        glyph.alpha = PROMPT_IDLE_ALPHA;
        glyph.eventMode = "none";

        // Last, so it is drawn over the toolbar and the log.
        return this.addChild(glyph);
    }

    /** `null` without a document to put the input in, e.g. in a worker: {@link execute} still works. */
    private _createPromptInput(): PromptInput | null {
        if (typeof document === "undefined") return null;

        const { fontFamily, colors } = this._options;

        return new PromptInput(
            {
                submit: (line) => this._onSubmit(line),
                historyPrevious: (current) => this._history.previous(current),
                historyNext: () => this._history.next(),
                complete: (value) => this._complete(value),
                page: (direction) => this.scrollBy(direction * this._contentRect.height),
                // Like a wheel over the log, which a non-interactive console lets through.
                wheel: (deltaY, deltaMode) => {
                    if (this.eventMode !== "static" && this.eventMode !== "dynamic") return false;
                    this._scrollByWheel(deltaY, deltaMode);

                    return true;
                },
                focusChange: (focused) => {
                    if (this._promptGlyph) this._promptGlyph.alpha = focused ? 1 : PROMPT_IDLE_ALPHA;
                },
            },
            {
                fontFamily,
                color: new Color(colors.log).toHex(),
                caretColor: new Color(colors.info).toHex(),
                placeholder: this._placeholder,
            },
        );
    }

    private _onSubmit(line: string): void {
        // As run: `execute` trims the line too.
        this._history.push(line.trim());
        // Follow again, so the echo and the result are in view.
        this.scrollToBottom();
        void this.execute(line);
    }

    /**
     * Completes the command name being typed: to the only match, or to what all matches start with.
     * Otherwise the matches are printed. `null` lets Tab move the focus as usual.
     */
    private _complete(value: string): string | null {
        const word = value.trimStart();

        // Only the first word, the command name, is completed, and only while it is being typed:
        // after a space (e.g. once completed) Tab moves the focus again.
        if (word === "" || /\s/.test(word)) return null;

        const names = this._registry.complete(word);
        const [first, ...others] = names;

        if (first === undefined) return null;
        if (others.length === 0) return `${first} `;

        const common = commonPrefix(names);

        if (common.length > word.length) return common;

        this.scrollToBottom();
        this._printLine("result", "log", names.join("  "), this._options.colors.debug);

        return value;
    }

    /**
     * Adds a command-line entry. Only to the canvas console: logging to the browser console would be
     * captured by every PixiConsole, and devtools has a command line of its own.
     */
    private _printLine(kind: EntryKind, level: LogLevel, message: string, color?: ColorSource): void {
        if (this.destroyed) return;

        this._store.add(level, message, color, Date.now(), kind);
        this._invalidate();
    }

    private _printResult(value: unknown, fromEvaluator: boolean): void {
        // Results that arrive after destroy() are dropped, and must not be kept alive.
        if (this.destroyed) return;

        // `help` or `clear` don't wipe `$_`.
        if (fromEvaluator || value !== undefined) this._lastResult = value;

        const { format, colors } = this._options;

        if (fromEvaluator) {
            // Quoted like devtools does, so "1" and 1 can be told apart.
            const shown = typeof value === "string" ? JSON.stringify(value) : value;

            this._printLine(
                "result",
                "log",
                `< ${formatArgs([shown], format)}`,
                value === undefined ? colors.debug : undefined,
            );
        } else if (value !== undefined) {
            // Strings as they are, anything else like console.log would print it.
            this._printLine("result", "log", formatArgs([value], format));
        }
    }

    private _printFailure(error: unknown, fromEvaluator: boolean, rejected: boolean): void {
        const { format } = this._options;
        const blocked = evalBlockedMessage(error);
        let message: string;

        if (blocked !== undefined) {
            // Without the stack, which would only point into pixi-console: say what to do instead.
            message = formatArgs([`EvalError: ${blocked}\n${EVAL_BLOCKED_HINT}`], format);
        } else if (fromEvaluator) {
            message = formatArgs([rejected ? "Uncaught (in promise)" : "Uncaught", error], format);
        } else {
            message = formatArgs([error], format);
        }

        this._printLine("result", "error", message);
    }

    /** Re-creates everything that depends on the console size. */
    private _applySize(): void {
        const { width, height, backgroundColor, backgroundAlpha, padding, toolbar, prompt } = this._options;
        const content = this._contentRect;

        this.boundsArea = new Rectangle(0, 0, width, height);
        this.hitArea = this.boundsArea;

        this._background.clear().rect(0, 0, width, height).fill({ color: backgroundColor, alpha: backgroundAlpha });
        this._mask.clear().rect(content.x, content.y, content.width, content.height).fill(0xffffff);
        this._content.position.set(content.x, content.y);
        this._wrapStyle.wordWrapWidth = content.width;

        this._separator.clear();
        if (toolbar) {
            this._separator
                .rect(padding / 2, this._toolbarHeight, width - padding, 1)
                .fill({ color: 0xffffff, alpha: 0.12 });
        }

        const promptTop = height - this._promptHeight;

        if (prompt) {
            this._separator.rect(padding / 2, promptTop, width - padding, 1).fill({ color: 0xffffff, alpha: 0.12 });
        }

        if (this._promptGlyph) {
            const glyph = this._promptGlyph;

            glyph.visible = prompt;
            glyph.position.set(padding, promptTop + Math.round((this._promptHeight - glyph.height) / 2));
        }

        const poolSize = Math.ceil(content.height / this._lineHeight) + 1;

        for (const row of this._rows.splice(poolSize)) row.destroy();
        while (this._rows.length < poolSize) this._rows.push(this._content.addChild(this._createLabel()));

        this._rowLines = this._rows.map(() => null);
        this._toolbar?.invalidate();
    }

    /** Scrolls by a wheel delta given in pixels, lines or pages (`WheelEvent.deltaMode` 0, 1 or 2). */
    private _scrollByWheel(deltaY: number, deltaMode: number): void {
        const unit = deltaMode === 1 ? this._lineHeight : deltaMode === 2 ? this._contentRect.height : 1;

        this.scrollBy(deltaY * unit);
    }

    private _setupPointer(): void {
        this.eventMode = this._options.interactive ? "static" : "none";

        const consume = (event: FederatedEvent) => event.stopPropagation();

        for (const type of CONSUMED_EVENTS) this.on(type, consume);

        this.on("wheel", (event: FederatedWheelEvent) => {
            // The browser zooms the page instead.
            if (event.ctrlKey) return;

            this._scrollByWheel(event.deltaY, event.deltaMode);
        });

        this.on("pointerdown", (event: FederatedPointerEvent) => {
            this._pressed.add(event.pointerId);

            // Toolbar buttons are tapped, not dragged, and only the primary mouse button drags. A new
            // press replaces the drag: a drag whose pointer was cancelled must not block scrolling.
            if (event.target !== this || (event.pointerType === "mouse" && event.button !== 0)) return;

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

        // A release stops at the console only when the press was on it: a game drag that ends over the
        // console must still end. `pointerup` comes first, then the `mouseup`, `rightup` or `touchend`
        // of the same release.
        this.on("pointerup", (event: FederatedPointerEvent) => {
            this._consumeRelease = this._pressed.delete(event.pointerId);
            this._endDrag(event.pointerId);
            if (this._consumeRelease) event.stopPropagation();
        });

        for (const type of ["mouseup", "rightup", "touchend"] as const) {
            this.on(type, (event: FederatedPointerEvent) => {
                if (this._consumeRelease) event.stopPropagation();
            });
        }

        this.on("pointerupoutside", (event: FederatedPointerEvent) => {
            this._pressed.delete(event.pointerId);
            this._endDrag(event.pointerId);
        });

        // pixi never emits pointercancel, so listen for the browser's.
        if (typeof window === "undefined") return;

        const onCancel = (event: PointerEvent) => {
            this._pressed.delete(event.pointerId);
            this._endDrag(event.pointerId);
        };

        window.addEventListener("pointercancel", onCancel, true);
        this._removeCancelListener = () => window.removeEventListener("pointercancel", onCancel, true);
    }

    /** Ends the drag if `pointerId` is the pointer dragging: other pointers may come and go meanwhile. */
    private _endDrag(pointerId: number): void {
        if (this._drag?.pointerId === pointerId) this._drag = null;
    }

    private _update(): void {
        if (this.destroyed || !this._dirty) return;

        this._layoutLines();

        const max = this._maxScroll();

        this._scrollY = this._following ? max : Math.min(Math.max(0, this._scrollY), max);

        this._renderRows();
        this._renderScrollbar();
        this._toolbar?.update({
            counts: this._store.counts,
            filter: this._filter,
            width: this._options.width,
            height: this._toolbarHeight,
            padding: this._options.padding,
        });
        this._dirty = false;
    }

    /** Turns new entries into wrapped lines, incrementally when possible. */
    private _layoutLines(): void {
        const entries = this._store.entries;
        const rebuild = this._needsRebuild;

        if (rebuild) {
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

                // The reader's entry is gone: anchor to what is at the top now.
                if (this._anchor && this._anchor.entryId < firstId) this._anchor = this._anchorAt(this._scrollY);
            }

            // The newest entry may have been collapsed into since it was laid out.
            const tail = this._lines.at(-1);

            if (tail && tail.count !== tail.entry.count) {
                while (this._lines.at(-1)?.entry === tail.entry) this._lines.pop();
                this._laidOutUpTo = Math.min(this._laidOutUpTo, tail.entry.id - 1);
            }
        }

        const lineCount = this._lines.length;
        let start = entries.length;

        while (start > 0 && (entries[start - 1]?.id ?? -1) > this._laidOutUpTo) start--;

        for (const entry of entries.slice(start)) this._layoutEntry(entry);

        this._laidOutUpTo = entries.at(-1)?.id ?? this._laidOutUpTo;

        if (rebuild && this._anchor) {
            this._scrollY = this._resolveAnchor(this._anchor);
            // Clamped to the bottom (e.g. few lines left after a filter change): follow new lines
            // from there. The anchor stays, so that changing the filter back returns to the entry.
            this._following = this._scrollY >= this._maxScroll() - 0.5;

            if (this._anchor.entryId < this._store.firstId) this._anchor = this._anchorAt(this._scrollY);
        } else if (this._following && this._lines.length > lineCount) {
            // New lines were followed: the view no longer shows where the reader was.
            this._anchor = null;
        }
    }

    /** Where the reader is when the view starts at `scrollY`; `null` without lines. */
    private _anchorAt(scrollY: number): ScrollAnchor | null {
        const lineHeight = this._lineHeight;
        const index = Math.max(0, Math.min(Math.floor(scrollY / lineHeight), this._lines.length - 1));
        const entry = this._lines[index]?.entry;

        if (!entry) return null;

        let first = index;

        while (this._lines[first - 1]?.entry === entry) first--;

        return { entryId: entry.id, lineInEntry: index - first, remainder: scrollY - index * lineHeight };
    }

    /**
     * Scroll offset that puts the anchor back at the top of rebuilt lines. When its entry is filtered
     * out, the next displayed entry goes at the top instead. The anchor itself is kept, even when the
     * view has to clamp, so that switching the filter back returns to the same entry.
     */
    private _resolveAnchor(anchor: ScrollAnchor): number {
        const lines = this._lines;
        // The first line of the anchor entry, or of a later one: entry ids grow along the lines.
        const found = lines.findIndex((line) => line.entry.id >= anchor.entryId);
        const first = found < 0 ? lines.length : found;
        const entry = lines[first]?.entry;

        if (entry?.id !== anchor.entryId) return first * this._lineHeight;

        let count = 1;

        while (lines[first + count]?.entry === entry) count++;

        return (first + Math.min(anchor.lineInEntry, count - 1)) * this._lineHeight + anchor.remainder;
    }

    private _layoutEntry(entry: StoredEntry): void {
        // Command-line entries are displayed whatever the filter.
        if (!entry.kind && !this._filter.has(entry.level)) return;

        const color = entry.color ?? this._options.colors[entry.level];

        for (const text of this._wrapEntry(entry)) {
            this._lines.push({ entry, count: entry.count, text, color });
        }
    }

    /** The entry's wrapped lines, memoised until its count, the wrap width or the timestamps option changes. */
    private _wrapEntry(entry: StoredEntry): readonly string[] {
        const width = this._wrapStyle.wordWrapWidth;
        const { timestamps } = this._options;
        const memo = this._wrapped.get(entry);

        if (memo?.width === width && memo.count === entry.count && memo.timestamps === timestamps) return memo.lines;

        let text = entry.count > 1 ? `${entry.message} (×${entry.count})` : entry.message;

        if (timestamps) text = `${formatTime(entry.timestamp)} ${text}`;

        const lines = this._wrap(text);

        this._wrapped.set(entry, { width, count: entry.count, timestamps, lines });

        return lines;
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
}

/** Consoles using each installed bitmap font, so that the last one to stop using it can uninstall it. */
const fontUsers = new Map<string, number>();

/**
 * Installs the bitmap font for a family, size and resolution, or reuses the installed one. Every call
 * must be paired with a {@link releaseFont}.
 */
function acquireFont(fontFamily: string, fontSize: number, resolution: number): string {
    const name = `pixi-console:${fontFamily}:${fontSize}:${resolution}`;
    const users = fontUsers.get(name) ?? 0;

    if (users === 0 && !Cache.has(`${name}-bitmap`)) {
        BitmapFont.install({
            name,
            style: { fontFamily, fontSize, fill: 0xffffff },
            chars: BitmapFontManager.ASCII,
            resolution,
            dynamicFill: true,
            // Monospace fonts have no kerning pairs, and looking for them costs O(glyphs²) over time.
            // pixi.js 8.0 to 8.16 look for them when the flag is true (fixed in 8.17): pass what skips
            // them on the installed version.
            skipKerning: pixiAtLeast(8, 17, 0),
        });
    }

    fontUsers.set(name, users + 1);

    return name;
}

/** Undoes an {@link acquireFont}. The last user uninstalls the font, which frees its atlas pages. */
function releaseFont(name: string): void {
    const users = (fontUsers.get(name) ?? 1) - 1;

    if (users > 0) {
        fontUsers.set(name, users);

        return;
    }

    fontUsers.delete(name);

    // pixi.js before 8.1.6 throws while uninstalling a font with a glyph that has no texture, such
    // as the space, halfway through. Keep the font installed there: acquireFont() reuses it.
    if (pixiAtLeast(8, 1, 6)) BitmapFont.uninstall(name);
}

/**
 * Whether the installed pixi.js is `major.minor.patch` or later, to work around bugs of older
 * versions in the peer range.
 * @internal
 */
export function pixiAtLeast(major: number, minor: number, patch: number, version = VERSION): boolean {
    const installed = version.split(".").map((part) => parseInt(part, 10));

    for (const [i, wanted] of [major, minor, patch].entries()) {
        const part = installed[i] ?? 0;

        if (part !== wanted) return part > wanted;
    }

    return true;
}

/**
 * Whether a render pass draws to the renderer's canvas, rather than to a texture. pixi only tells for
 * a canvas in `document.body`: with one elsewhere (in a shadow root, out of the page or offscreen)
 * `renderingToScreen` is always `false`, so every pass counts.
 */
function drawsToCanvas(renderer: Renderer): boolean {
    if (renderer.renderingToScreen) return true;

    const { canvas } = renderer;

    return !(
        typeof HTMLCanvasElement !== "undefined" &&
        canvas instanceof HTMLCanvasElement &&
        document.body.contains(canvas)
    );
}

/** The longest start that every word shares. */
function commonPrefix(words: readonly string[]): string {
    let prefix = words[0] ?? "";

    for (const word of words) {
        while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }

    return prefix;
}

/** Whether `container` and all its parents are visible and renderable. */
function isShown(container: Container): boolean {
    for (let node: Container | null = container; node; node = node.parent) {
        if (!node.visible || !node.renderable) return false;
    }

    return true;
}

/** Product of `alpha` from `container` up its parents, or `0` when it or a parent is hidden. */
function displayedOpacity(container: Container): number {
    let opacity = 1;

    for (let node: Container | null = container; node; node = node.parent) {
        if (!node.visible || !node.renderable) return 0;
        opacity *= node.alpha;
    }

    return opacity;
}

/** The top of the scene graph `container` is in. */
function rootOf(container: Container): Container {
    let root = container;

    while (root.parent) root = root.parent;

    return root;
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number, length = 2) => String(value).padStart(length, "0");

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Whether a key was typed into a text field, including one inside a shadow root. */
function isEditable(event: Event): boolean {
    // Events from a shadow root are retargeted to its host: the path still starts at the real target.
    const target = event.composedPath()[0] ?? event.target;

    if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;

    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
