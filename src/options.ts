import type { ColorSource, Rectangle, Renderer } from "pixi.js";

import type { CommandHandler, ConsoleCommand, ConsoleEvaluator } from "./core/commands";
import { DEFAULT_FORMAT_OPTIONS, numberOr, resolveFormatOptions, type FormatOptions } from "./core/format";
import { DEFAULT_MAX_ENTRIES } from "./core/store";
import { LOG_LEVELS, type LogLevel } from "./core/types";

/** Position and size of the console, as returned by {@link AutoResizeOptions.layout}. */
export interface ConsoleLayout {
    x?: number;
    y?: number;
    width: number;
    height: number;
}

export interface AutoResizeOptions {
    /** Usually `app.renderer`. The console follows its `screen` whenever it emits `resize`. */
    renderer: Renderer;
    /**
     * Maps the renderer screen to the console bounds. Defaults to covering the whole screen.
     * @example (screen) => ({ y: screen.height * 0.6, width: screen.width, height: screen.height * 0.4 })
     */
    layout?: (screen: Rectangle) => ConsoleLayout;
}

export interface PixiConsoleOptions {
    /** Width of the console in pixels. @default 800 */
    width: number;
    /** Height of the console in pixels. @default 400 */
    height: number;
    /** Whether the console starts visible. @default false */
    visible: boolean;

    /**
     * Which `console` methods are captured. `true` captures every level, `false` none.
     * Can be changed later via {@link PixiConsole.captureConsole}.
     * @default true
     */
    captureConsole: boolean | readonly LogLevel[];
    /** Capture uncaught errors and unhandled promise rejections. @default true */
    captureErrors: boolean;
    /** Clear the console when `console.clear()` is called. @default true */
    captureClear: boolean;
    /** Show the console automatically when an error is logged or thrown. @default true */
    showOnError: boolean;

    /**
     * Levels that are displayed. Hidden levels are still recorded and can be re-enabled later.
     * Command-line input and results are always displayed.
     * @default all levels
     */
    filter: readonly LogLevel[];
    /**
     * Maximum number of entries kept in memory. Oldest entries are dropped first.
     * Can be changed later via {@link PixiConsole.maxEntries}.
     * @default 1000
     */
    maxEntries: number;
    /**
     * Merge consecutive identical messages into one line with a `(×N)` counter.
     * Can be changed later via {@link PixiConsole.collapseRepeats}.
     * @default true
     */
    collapseRepeats: boolean;
    /**
     * Prefix every entry with its time (`HH:MM:SS.mmm`).
     * Can be changed later via {@link PixiConsole.timestamps}.
     * @default false
     */
    timestamps: boolean;
    /** Options for turning logged values into text. @default {@link DEFAULT_FORMAT_OPTIONS} */
    format: Partial<FormatOptions>;

    /**
     * How text is rendered.
     * - `"bitmap"`: `BitmapText` using a glyph atlas generated on the fly. Cheap to update, recommended.
     * - `"canvas"`: `Text`, better for scripts with huge glyph sets (CJK) or colour emoji.
     * @default "bitmap"
     */
    textRenderer: "bitmap" | "canvas";
    /** @default "Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace" */
    fontFamily: string;
    /** @default 14 */
    fontSize: number;
    /** Height of one line of text. @default round(fontSize * 1.4) */
    lineHeight?: number;
    /**
     * Resolution of the rendered glyphs. By default they follow the renderer's resolution (before the
     * console is first rendered, the {@link autoResize} renderer's or `window.devicePixelRatio`).
     * @default the renderer's resolution
     */
    resolution?: number;
    /** Inner padding in pixels. @default 8 */
    padding: number;
    /** Text colour per level. @default {@link DEFAULT_COLORS} */
    colors: Record<LogLevel, ColorSource>;
    /** @default 0x0d1117 */
    backgroundColor: ColorSource;
    /** @default 0.85 */
    backgroundAlpha: number;

    /**
     * Show the toolbar with per-level filter toggles, clear and close buttons.
     * Can be changed later via {@link PixiConsole.toolbar}.
     * @default true
     */
    toolbar: boolean;
    /**
     * Enable wheel and drag scrolling and toolbar buttons. Set to `false` to let pointer events pass
     * through. The command line stays tappable when {@link prompt} is on.
     * @default true
     */
    interactive: boolean;
    /**
     * `KeyboardEvent.code` or `KeyboardEvent.key` that toggles the console, or `null` to disable.
     * Ignored while typing in a text field. With {@link prompt}, opening the console with it focuses
     * the command line.
     * @default "Backquote"
     */
    toggleKey: string | null;
    /** Keep the console sized to the renderer screen, e.g. across orientation changes. @default null */
    autoResize: AutoResizeOptions | null;

    /**
     * Show a command line under the log. Entering a line runs a {@link commands | command} or, when
     * no command matches, the {@link evaluator}. It is a native `<input>` placed over the canvas, so
     * on-screen keyboards, IME, autocorrect and paste work as usual. Keys typed into it do not reach
     * `window` keydown listeners: they neither toggle the console nor move your game. Opening the
     * console with {@link toggleKey} focuses it. Needs pixi.js 8.7+ or {@link autoResize} to find
     * the canvas. Can be changed later via {@link PixiConsole.prompt}.
     * @default false
     */
    prompt: boolean;
    /**
     * Commands for the command line and {@link PixiConsole.execute}, by name, added to the built-in
     * `help` and `clear`. A function is shorthand for `{ run }`. Names are one word
     * (`/^[a-z][\w:-]*$/i`) and case-insensitive; a command named like a built-in replaces it.
     * @example { spawn: { usage: "<count>", description: "Spawn enemies", run: ([count = "1"]) => game.spawn(Number(count)) } }
     * @default {}
     */
    commands: Readonly<Record<string, ConsoleCommand | CommandHandler>>;
    /**
     * Runs lines whose first word is not a command, e.g. {@link createJsEvaluator} to evaluate
     * JavaScript. `null` answers "Unknown command" instead. Whoever can type into the console can run
     * it: keep JavaScript evaluation out of production builds.
     * Can be changed later via {@link PixiConsole.evaluator}.
     * @default null
     */
    evaluator: ConsoleEvaluator | null;
}

/** Default text colour per level. */
export const DEFAULT_COLORS: Readonly<Record<LogLevel, ColorSource>> = {
    log: 0xe6edf3,
    info: 0x58a6ff,
    debug: 0x8b949e,
    warn: 0xe3b341,
    error: 0xff7b72,
};

/** Default value of every option. */
export const DEFAULT_OPTIONS: Readonly<PixiConsoleOptions> = {
    width: 800,
    height: 400,
    visible: false,
    captureConsole: true,
    captureErrors: true,
    captureClear: true,
    showOnError: true,
    filter: LOG_LEVELS,
    maxEntries: DEFAULT_MAX_ENTRIES,
    collapseRepeats: true,
    timestamps: false,
    // A copy, so that mutating one of them never changes the other.
    format: { ...DEFAULT_FORMAT_OPTIONS },
    textRenderer: "bitmap",
    fontFamily: "Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace",
    fontSize: 14,
    padding: 8,
    colors: DEFAULT_COLORS,
    backgroundColor: 0x0d1117,
    backgroundAlpha: 0.85,
    toolbar: true,
    interactive: true,
    toggleKey: "Backquote",
    autoResize: null,
    prompt: false,
    commands: {},
    evaluator: null,
};

/** Options accepted by the {@link PixiConsole} constructor. Every field is optional. */
export interface PixiConsoleInit extends Partial<Omit<PixiConsoleOptions, "colors" | "format">> {
    /** Text colour per level. Levels left out keep their colour from {@link DEFAULT_COLORS}. */
    colors?: Partial<Record<LogLevel, ColorSource>>;
    /** Options for turning logged values into text. Fields left out keep their {@link DEFAULT_FORMAT_OPTIONS | default}. */
    format?: Partial<FormatOptions>;
}

/**
 * Fills in `init` over {@link DEFAULT_OPTIONS}, `colors` and `format` field by field. `undefined`
 * values are ignored at every level, and a `NaN` or non-number `maxEntries` or format limit falls
 * back to its default (`Infinity` is kept).
 */
export function resolveOptions(init: PixiConsoleInit = {}): PixiConsoleOptions {
    const defined = definedOnly(init);

    return {
        ...DEFAULT_OPTIONS,
        ...defined,
        maxEntries: numberOr(defined.maxEntries, DEFAULT_OPTIONS.maxEntries),
        colors: { ...DEFAULT_COLORS, ...definedOnly(init.colors) },
        format: resolveFormatOptions(init.format),
    };
}

export function toLevels(value: boolean | readonly LogLevel[]): LogLevel[] {
    if (value === true) return [...LOG_LEVELS];
    if (value === false) return [];

    return LOG_LEVELS.filter((level) => value.includes(level));
}

/** A copy of `object` without its `undefined` values, so spreading it never overrides a default with `undefined`. */
function definedOnly<T extends object>(object: T | undefined): Partial<T> {
    return Object.fromEntries(Object.entries(object ?? {}).filter(([, value]) => value !== undefined)) as Partial<T>;
}
