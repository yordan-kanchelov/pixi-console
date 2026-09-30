import type { ColorSource } from "pixi.js";

/** Console levels pixi-console can capture and display. */
export const LOG_LEVELS = ["log", "info", "debug", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Where an entry written by the command line comes from: the echoed line, or what it produced. */
export type EntryKind = "input" | "result";

/**
 * A console entry, already formatted to text. With {@link PixiConsoleOptions.collapseRepeats},
 * one entry stands for several consecutive identical calls.
 */
export interface LogEntry {
    /** Monotonically increasing id, unique per console instance. */
    id: number;
    /** Level of the call. {@link PixiConsole.print} writes `"log"` entries. */
    level: LogLevel;
    /** The formatted message text (without timestamp / level prefix). */
    message: string;
    /** `Date.now()` when the entry was captured. For a collapsed entry, the time of its last repeat. */
    timestamp: number;
    /**
     * Set on entries written by the command line: `"input"` for the echoed line, `"result"` for what
     * it returned or threw. These entries are displayed whatever the {@link PixiConsole.filter}, are
     * not included in {@link PixiConsole.counts} and never trigger `showOnError`.
     */
    kind?: EntryKind;
}

/**
 * An entry as exposed by {@link PixiConsole.entries}. The console keeps updating it: a collapsed
 * repeat bumps `count` and `timestamp` in place.
 */
export interface ConsoleEntry extends Readonly<LogEntry> {
    /** How many consecutive identical calls this entry stands for: `1` unless repeats were collapsed. */
    readonly count: number;
    /** Text colour overriding the level colour, set by {@link PixiConsole.print}. */
    readonly color?: ColorSource;
}
