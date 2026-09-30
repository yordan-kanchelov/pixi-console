import { describe, expect, it } from "vitest";

import { DEFAULT_FORMAT_OPTIONS } from "../src/core/format";
import { DEFAULT_COLORS, DEFAULT_OPTIONS, resolveOptions, toLevels, type PixiConsoleInit } from "../src/options";

describe("resolveOptions", () => {
    it("returns the defaults", () => {
        expect(resolveOptions()).toEqual(DEFAULT_OPTIONS);
    });

    it("merges colours and format options instead of replacing them", () => {
        const options = resolveOptions({ colors: { error: "red" }, format: { depth: 5 } });

        expect(options.colors.error).toBe("red");
        expect(options.colors.warn).toBe(DEFAULT_OPTIONS.colors.warn);
        expect(options.format.depth).toBe(5);
        expect(options.format.maxItems).toBe(DEFAULT_OPTIONS.format.maxItems);
    });

    it("ignores explicitly undefined values", () => {
        expect(resolveOptions({ width: undefined }).width).toBe(DEFAULT_OPTIONS.width);
    });

    it("ignores explicitly undefined colours and format options", () => {
        const options = resolveOptions({
            colors: { error: undefined, warn: "yellow" },
            format: { depth: undefined, indent: undefined, maxItems: undefined, maxLength: undefined },
        });

        expect(options.colors).toEqual({ ...DEFAULT_COLORS, warn: "yellow" });
        expect(options.format).toEqual(DEFAULT_FORMAT_OPTIONS);
    });

    it("falls back to the defaults for NaN and non-number limits, but keeps Infinity", () => {
        expect(resolveOptions({ maxEntries: Number.NaN }).maxEntries).toBe(DEFAULT_OPTIONS.maxEntries);
        expect(resolveOptions({ maxEntries: "5" as unknown as number }).maxEntries).toBe(DEFAULT_OPTIONS.maxEntries);
        expect(resolveOptions({ maxEntries: Infinity }).maxEntries).toBe(Infinity);
        expect(resolveOptions({ format: { depth: Number.NaN, maxLength: Infinity } }).format).toEqual({
            ...DEFAULT_FORMAT_OPTIONS,
            maxLength: Infinity,
        });
    });

    it("tolerates null nested options from JavaScript callers", () => {
        const options = resolveOptions({ colors: null, format: null } as unknown as PixiConsoleInit);

        expect(options.colors).toEqual(DEFAULT_COLORS);
        expect(options.format).toEqual(DEFAULT_FORMAT_OPTIONS);
    });

    it("never shares or mutates the default objects", () => {
        const options = resolveOptions();

        expect(DEFAULT_OPTIONS.format).not.toBe(DEFAULT_FORMAT_OPTIONS);
        expect(DEFAULT_OPTIONS.format).toEqual(DEFAULT_FORMAT_OPTIONS);
        expect(options.colors).not.toBe(DEFAULT_COLORS);
        expect(options.format).not.toBe(DEFAULT_FORMAT_OPTIONS);

        options.colors.error = "red";
        options.format.depth = 10;

        expect(DEFAULT_COLORS.error).not.toBe("red");
        expect(DEFAULT_FORMAT_OPTIONS.depth).toBe(2);
    });
});

describe("toLevels", () => {
    it("expands booleans and keeps a stable order", () => {
        expect(toLevels(true)).toEqual(["log", "info", "debug", "warn", "error"]);
        expect(toLevels(false)).toEqual([]);
        expect(toLevels(["error", "log"])).toEqual(["log", "error"]);
    });
});
