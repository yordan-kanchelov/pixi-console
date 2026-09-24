/** Console levels pixi-console can capture and display. */
export const LOG_LEVELS = ["log", "info", "debug", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** A single captured console call, already formatted to text. */
export interface LogEntry {
    /** Monotonically increasing id, unique per console instance. */
    id: number;
    level: LogLevel;
    /** The formatted message text (without timestamp / level prefix). */
    message: string;
    /** `Date.now()` when the entry was captured. */
    timestamp: number;
}
