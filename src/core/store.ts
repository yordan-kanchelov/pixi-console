import type { ColorSource } from "pixi.js";

import { LOG_LEVELS, type LogEntry, type LogLevel } from "./types";

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

    add(level: LogLevel, message: string, color?: ColorSource, timestamp = Date.now()): StoredEntry {
        const last = this.entries.at(-1);

        this.counts[level]++;

        if (this.options.collapseRepeats && last?.level === level && last.message === message && last.color === color) {
            last.count++;
            last.timestamp = timestamp;

            return last;
        }

        const entry: StoredEntry = { id: this._nextId++, level, message, timestamp, count: 1, color };

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
        const excess = this.entries.length - Math.max(1, this.options.maxEntries);

        if (excess <= 0) return;

        for (const removed of this.entries.splice(0, excess)) {
            this.counts[removed.level] -= removed.count;
        }
    }
}

function zeroCounts(): Record<LogLevel, number> {
    return Object.fromEntries(LOG_LEVELS.map((level) => [level, 0])) as Record<LogLevel, number>;
}
