import type { ColorSource, Rectangle, Renderer } from "pixi.js";

import { DEFAULT_FORMAT_OPTIONS, type FormatOptions } from "./core/format";
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

    /** Levels that are displayed. Hidden levels are still recorded and can be re-enabled later. @default all levels */
    filter: readonly LogLevel[];
    /** Maximum number of entries kept in memory. Oldest entries are dropped first. @default 1000 */
    maxEntries: number;
    /** Merge consecutive identical messages into one line with a `(×N)` counter. @default true */
    collapseRepeats: boolean;
    /** Prefix every entry with its time (`HH:MM:SS.mmm`). @default false */
    timestamps: boolean;
    /** Options for turning logged values into text. */
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
    /** Resolution of the rendered glyphs. @default window.devicePixelRatio */
    resolution?: number;
    /** Inner padding in pixels. @default 8 */
    padding: number;
    /** Text colour per level. */
    colors: Record<LogLevel, ColorSource>;
    /** @default 0x0d1117 */
    backgroundColor: ColorSource;
    /** @default 0.85 */
    backgroundAlpha: number;

    /** Show the toolbar with per-level filter toggles, clear and close buttons. @default true */
    toolbar: boolean;
    /** Enable wheel and drag scrolling and toolbar buttons. Set to `false` to let pointer events pass through. @default true */
    interactive: boolean;
    /**
     * `KeyboardEvent.code` or `KeyboardEvent.key` that toggles the console, or `null` to disable.
     * @default "Backquote"
     */
    toggleKey: string | null;
    /** Keep the console sized to the renderer screen, e.g. across orientation changes. @default null */
    autoResize: AutoResizeOptions | null;
}

export const DEFAULT_COLORS: Readonly<Record<LogLevel, ColorSource>> = {
    log: 0xe6edf3,
    info: 0x58a6ff,
    debug: 0x8b949e,
    warn: 0xe3b341,
    error: 0xff7b72,
};

export const DEFAULT_OPTIONS: Readonly<PixiConsoleOptions> = {
    width: 800,
    height: 400,
    visible: false,
    captureConsole: true,
    captureErrors: true,
    captureClear: true,
    showOnError: true,
    filter: LOG_LEVELS,
    maxEntries: 1000,
    collapseRepeats: true,
    timestamps: false,
    format: DEFAULT_FORMAT_OPTIONS,
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
};

/** Options accepted by the {@link PixiConsole} constructor. Every field is optional. */
export type PixiConsoleInit = Partial<Omit<PixiConsoleOptions, "colors" | "format">> & {
    colors?: Partial<Record<LogLevel, ColorSource>>;
    format?: Partial<FormatOptions>;
};

export function resolveOptions(init: PixiConsoleInit = {}): PixiConsoleOptions {
    const defined = Object.fromEntries(
        Object.entries(init as Record<string, unknown>).filter(([, value]) => value !== undefined),
    ) as PixiConsoleInit;

    return {
        ...DEFAULT_OPTIONS,
        ...defined,
        colors: { ...DEFAULT_COLORS, ...init.colors },
        format: { ...DEFAULT_FORMAT_OPTIONS, ...init.format },
    };
}

export function toLevels(value: boolean | readonly LogLevel[]): LogLevel[] {
    if (value === true) return [...LOG_LEVELS];
    if (value === false) return [];

    return LOG_LEVELS.filter((level) => value.includes(level));
}
