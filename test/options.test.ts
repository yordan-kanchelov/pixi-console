import { describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS, resolveOptions, toLevels } from "../src/options";

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
});

describe("toLevels", () => {
    it("expands booleans and keeps a stable order", () => {
        expect(toLevels(true)).toEqual(["log", "info", "debug", "warn", "error"]);
        expect(toLevels(false)).toEqual([]);
        expect(toLevels(["error", "log"])).toEqual(["log", "error"]);
    });
});
