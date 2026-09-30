import type { ColorSource } from "pixi.js";

import { LOG_LEVELS, type EntryKind, type LogEntry, type LogLevel } from "./types";

/** Default of {@link StoreOptions.maxEntries}, also used when it is `NaN`. */
export const DEFAULT_MAX_ENTRIES = 1000;

/** A captured entry as stored by the console. */
export interface StoredEntry extends LogEntry {
    /** How many consecutive identical messages this entry represents. */
    count: number;
    /** Overrides the level colour, set by {@link PixiConsole.print}. */
    color?: ColorSource;
}

export interface StoreOptions {
    maxEntries: number;
    collapseRepeats: boolean;
}

/**
 * Bounded, ordered history of log entries with optional collapsing of consecutive repeats.
 * Pure data structure: no rendering, no pixi objects.
 */
export class LogStore {
    readonly entries: StoredEntry[] = [];
    /**
     * Calls per level that the retained entries stand for (collapsed repeats included). Evicted
     * entries are subtracted, and entries with a `kind` are never counted.
     */
    readonly counts: Record<LogLevel, number> = zeroCounts();

    options: StoreOptions;

    private _nextId = 0;

    constructor(options: StoreOptions) {
        this.options = { ...options };
    }

    /** Id of the oldest retained entry, or the next id when empty. */
    get firstId(): number {
        return this.entries[0]?.id ?? this._nextId;
    }

    /**
     * Appends an entry, or with `collapseRepeats` bumps the last one when it has the same level,
     * message, colour and kind. Entries with a `kind` (command-line input and results) are not counted.
     */
    add(level: LogLevel, message: string, color?: ColorSource, timestamp = Date.now(), kind?: EntryKind): StoredEntry {
        const last = this.entries.at(-1);

        if (!kind) this.counts[level]++;

        if (
            this.options.collapseRepeats &&
            last?.level === level &&
            last.message === message &&
            last.color === color &&
            last.kind === kind
        ) {
            last.count++;
            last.timestamp = timestamp;

            return last;
        }

        const entry: StoredEntry = { id: this._nextId++, level, message, timestamp, count: 1, color };

        if (kind) entry.kind = kind;

        this.entries.push(entry);
        this.trim();

        return entry;
    }

    clear(): void {
        this.entries.length = 0;
        Object.assign(this.counts, zeroCounts());
    }

    /** Drops the oldest entries above `maxEntries`. */
    trim(): void {
        const { maxEntries } = this.options;
        // A NaN limit would never trim, so the history would grow without bound.
        const max = Number.isNaN(maxEntries) ? DEFAULT_MAX_ENTRIES : Math.max(1, Math.floor(maxEntries));
        const excess = this.entries.length - max;

        if (excess <= 0) return;

        for (const removed of this.entries.splice(0, excess)) {
            if (!removed.kind) this.counts[removed.level] -= removed.count;
        }
    }
}

function zeroCounts(): Record<LogLevel, number> {
    return Object.fromEntries(LOG_LEVELS.map((level) => [level, 0])) as Record<LogLevel, number>;
}
