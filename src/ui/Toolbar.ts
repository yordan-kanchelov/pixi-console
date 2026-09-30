import { BitmapText, Container, Rectangle, type ColorSource, type TextStyle } from "pixi.js";

import { LOG_LEVELS, type LogLevel } from "../core/types";

/** What the toolbar buttons do. */
export interface ToolbarHandlers {
    toggle(level: LogLevel): void;
    clear(): void;
    close(): void;
}

/** Everything the toolbar layout depends on. */
export interface ToolbarState {
    counts: Readonly<Record<LogLevel, number>>;
    filter: ReadonlySet<LogLevel>;
    width: number;
    height: number;
    padding: number;
}

/** Which chips are shown, and whether the clear button is. */
interface Arrangement {
    shown: readonly LogLevel[];
    withClear: boolean;
}

const DISABLED_ALPHA = 0.35;

/** Levels from least to most severe: when chips must be hidden, the least severe go first. */
const HIDE_ORDER: readonly LogLevel[] = ["debug", "log", "info", "warn", "error"];

/**
 * Level chips (filter toggles with counts), a clear button and a close button.
 *
 * The labels are always `BitmapText`, whatever the console's text renderer: they are ASCII and change
 * with every log, so re-rasterizing canvas text for them would double the cost of each log.
 *
 * On narrow consoles the chips switch to compact labels (`E 3`). If they still don't fit, enabled
 * chips without entries are hidden, then the clear button, then more enabled chips, least severe
 * first. The close button always stays, and so does the chip of a filtered-out level, so that it can
 * be turned back on.
 */
export class Toolbar extends Container {
    private readonly _style: TextStyle;
    private readonly _chips: Readonly<Record<LogLevel, BitmapText>>;
    private readonly _clearButton: BitmapText;
    private readonly _closeButton: BitmapText;
    private _key = "";

    constructor(style: TextStyle, colors: Readonly<Record<LogLevel, ColorSource>>, handlers: ToolbarHandlers) {
        super({ label: "toolbar" });

        this._style = style;
        this._chips = Object.fromEntries(
            LOG_LEVELS.map((level) => {
                const chip = this._createButton(level, () => handlers.toggle(level));

                chip.tint = colors[level];

                return [level, chip];
            }),
        ) as Record<LogLevel, BitmapText>;

        this._clearButton = this._createButton("clear", () => handlers.clear());
        this._clearButton.text = "clear";
        this._closeButton = this._createButton("close", () => handlers.close());
        this._closeButton.text = "×";
    }

    /** Makes the next {@link update} lay the toolbar out even if nothing it depends on changed. */
    invalidate(): void {
        this._key = "";
    }

    /** Updates the chip labels and fits everything into the width. Cheap when nothing changed. */
    update(state: ToolbarState): void {
        const { counts, filter, width, height, padding } = state;
        const key = `${LOG_LEVELS.map((level) => `${counts[level]}${+filter.has(level)}`).join()}|${width}|${height}|${padding}`;

        if (key === this._key) return;
        this._key = key;

        const gap = this._style.fontSize;
        const close = this._closeButton;
        const clear = this._clearButton;

        close.position.set(Math.max(padding, width - padding - close.width), center(close, height));

        const clearX = close.x - gap - clear.width;
        const label = (compact: boolean) => {
            for (const level of LOG_LEVELS) {
                const name = compact ? level.charAt(0).toUpperCase() : level;

                this._chips[level].text = `${name} ${formatCount(counts[level])}`;
            }
        };
        // Chips fit when they end a gap before the clear button, or before the close button without it.
        const fits = ({ shown, withClear }: Arrangement) => {
            const right = (withClear ? clearX : close.x) - gap;
            const total = shown.reduce((sum, level) => sum + this._chips[level].width + gap, -gap);

            return (!withClear || clearX >= padding) && (shown.length === 0 || padding + total <= right);
        };

        // Chips that may be hidden, in the order they go: enabled levels without entries, then the others.
        const enabled = HIDE_ORDER.filter((level) => filter.has(level));
        const empty = enabled.filter((level) => counts[level] === 0);
        const hideable = [...empty, ...enabled.filter((level) => counts[level] > 0)];
        const hiding = (count: number, withClear: boolean): Arrangement => ({
            shown: LOG_LEVELS.filter((level) => !hideable.slice(0, count).includes(level)),
            withClear,
        });
        const compact: Arrangement[] = [];

        for (let i = 0; i <= empty.length; i++) compact.push(hiding(i, true));
        for (let i = 0; i <= hideable.length; i++) compact.push(hiding(i, false));

        let chosen = hiding(0, true);

        label(false);

        if (!fits(chosen)) {
            label(true);
            // The last resort keeps the chips of filtered-out levels, even if they overflow.
            chosen = compact.find(fits) ?? hiding(hideable.length, false);
        }

        let x = padding;

        for (const level of LOG_LEVELS) {
            const chip = this._chips[level];

            chip.alpha = filter.has(level) ? 1 : DISABLED_ALPHA;
            chip.visible = chosen.shown.includes(level);

            if (!chip.visible) continue;

            chip.position.set(x, center(chip, height));
            x += chip.width + gap;
        }

        clear.visible = chosen.withClear;
        clear.position.set(clearX, center(clear, height));

        for (const button of this.children as BitmapText[]) {
            button.hitArea = new Rectangle(-gap / 2, -button.y, button.width + gap, height);
        }
    }

    private _createButton(label: string, onTap: () => void): BitmapText {
        const button = this.addChild(new BitmapText({ label, text: "", style: this._style, roundPixels: true }));

        button.eventMode = "static";
        button.cursor = "pointer";
        // The console stops the tap from reaching objects underneath.
        button.on("pointertap", onTap);

        return button;
    }
}

function center(label: BitmapText, height: number): number {
    return Math.round((height - label.height) / 2);
}

function formatCount(count: number): string {
    return count > 9999 ? `${Math.floor(count / 1000)}k` : String(count);
}
