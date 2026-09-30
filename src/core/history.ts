/** How many lines the command line remembers by default. */
export const HISTORY_SIZE = 100;

/**
 * Lines entered at the command line, oldest first, with shell-like ↑/↓ navigation that keeps the
 * line being typed (the draft) while older lines are recalled. Pure data structure: no DOM.
 */
export class InputHistory {
    /** Maximum number of lines kept; the oldest are dropped first. */
    readonly max: number;

    private _lines: string[] = [];
    /** Index of the recalled line, `_lines.length` while not navigating. */
    private _index = 0;
    /** What was typed before navigating, restored when moving past the newest line. */
    private _draft = "";

    constructor(max = HISTORY_SIZE) {
        this.max = max;
    }

    /** The remembered lines, oldest first. Assigning keeps the last {@link max} non-blank strings and stops navigating. */
    get lines(): readonly string[] {
        return [...this._lines];
    }

    set lines(lines: readonly unknown[]) {
        // Usually restored from storage: tolerate anything, keep only what could have been entered.
        this._lines = this._keepLast(
            lines.filter((line): line is string => typeof line === "string" && !isBlank(line)),
        );
        this.reset();
    }

    /** Remembers an entered line and stops navigating. Blank lines and repeats of the newest line are not added. */
    push(line: string): void {
        if (!isBlank(line) && line !== this._lines.at(-1)) {
            this._lines = this._keepLast([...this._lines, line]);
        }

        this.reset();
    }

    /**
     * Steps to the previous (older) line. `current` is the text in the input: when navigation starts,
     * or when a recalled line was edited, it becomes the draft and navigation restarts from the newest line.
     * @returns The previous line, or `undefined` at the oldest one.
     */
    previous(current: string): string | undefined {
        if (this._index < this._lines.length && current !== this._lines[this._index]) this._index = this._lines.length;
        if (this._index === this._lines.length) this._draft = current;
        if (this._index === 0) return undefined;

        return this._lines[--this._index];
    }

    /**
     * Steps to the next (newer) line.
     * @returns The next line, the draft when moving past the newest line, or `undefined` while not navigating.
     */
    next(): string | undefined {
        if (this._index >= this._lines.length) return undefined;

        this._index++;

        return this._index === this._lines.length ? this._draft : this._lines[this._index];
    }

    /** Stops navigating and forgets the draft. */
    reset(): void {
        this._index = this._lines.length;
        this._draft = "";
    }

    private _keepLast(lines: string[]): string[] {
        return lines.slice(Math.max(0, lines.length - this.max));
    }
}

function isBlank(line: string): boolean {
    return line.trim() === "";
}
