import { describe, expect, it } from "vitest";

import { formatArgs, formatValue } from "../src/core/format";

describe("formatArgs", () => {
    it("joins arguments with spaces like the browser console", () => {
        expect(formatArgs(["hello", 42, true, null, undefined])).toBe("hello 42 true null undefined");
    });

    it("applies printf-style substitutions", () => {
        expect(formatArgs(["%s has %d lives and %f hp", "hero", 3.7, 99.5])).toBe("hero has 3 lives and 99.5 hp");
        expect(formatArgs(["%o", { a: 1 }])).toBe("{ a: 1 }");
        expect(formatArgs(["100%% done", "!"])).toBe("100% done !");
    });

    it("prints NaN for numeric specifiers that cannot convert", () => {
        const throwing = {
            valueOf(): number {
                throw new Error("nope");
            },
        };

        expect(formatArgs(["%d %i %f", Symbol("s"), Object.create(null), throwing])).toBe("NaN NaN NaN");
        expect(formatArgs(["%d", 10n])).toBe("10n");
    });

    it("drops %c styling arguments", () => {
        expect(formatArgs(["%cstyled", "color: red", "tail"])).toBe("styled tail");
    });

    it("leaves unmatched specifiers intact and appends extra args", () => {
        expect(formatArgs(["%s and %s", "one"])).toBe("one and %s");
        expect(formatArgs(["%s", "one", "two"])).toBe("one two");
    });

    it("truncates very long messages", () => {
        const message = formatArgs(["x".repeat(100)], { maxLength: 10 });
        expect(message).toHaveLength(10);
        expect(message.endsWith("…")).toBe(true);
    });
});

describe("formatValue", () => {
    it("formats primitives", () => {
        expect(formatValue(10n)).toBe("10n");
        expect(formatValue(-0)).toBe("-0");
        expect(formatValue(Symbol("s"))).toBe("Symbol(s)");
        expect(formatValue(function named() {})).toBe("[Function: named]");
    });

    it("quotes nested strings but not top-level ones", () => {
        expect(formatValue("top")).toBe("top");
        expect(formatValue({ s: "nested" })).toBe('{ s: "nested" }');
    });

    it("formats arrays, maps, sets and class instances", () => {
        class Point {
            constructor(
                public x: number,
                public y: number,
            ) {}
        }

        expect(formatValue([1, "a", [2]])).toBe('[1, "a", [2]]');
        expect(formatValue(new Map([["k", 1]]))).toBe('Map(1) { "k" => 1 }');
        expect(formatValue(new Set([1, 2]))).toBe("Set(2) { 1, 2 }");
        expect(formatValue(new Point(1, 2))).toBe("Point { x: 1, y: 2 }");
        expect(formatValue({ "needs-quotes": 1 })).toBe('{ "needs-quotes": 1 }');
    });

    it("handles circular references", () => {
        const obj: Record<string, unknown> = { name: "loop" };
        obj.self = obj;

        expect(formatValue(obj)).toBe('{ name: "loop", self: [Circular] }');
    });

    it("prints repeated (non-circular) references in full", () => {
        const shared = { v: 1 };
        expect(formatValue({ a: shared, b: shared })).toBe("{ a: { v: 1 }, b: { v: 1 } }");
    });

    it("summarizes objects deeper than the depth limit", () => {
        expect(formatValue({ a: { b: { c: { d: 1 } } } }, { depth: 1 })).toBe("{ a: { b: [Object] } }");
        expect(formatValue([[[1, 2]]], { depth: 0 })).toBe("[[Array(1)]]");
    });

    it("limits the number of printed items", () => {
        expect(formatValue([1, 2, 3, 4], { maxItems: 2 })).toBe("[1, 2, ... 2 more]");
    });

    it("pretty prints with indentation", () => {
        expect(formatValue({ a: 1, b: [1] }, { indent: 2 })).toBe("{\n  a: 1,\n  b: [\n    1\n  ]\n}");
    });

    it("formats errors with their stack", () => {
        const error = new TypeError("boom");
        error.stack = "TypeError: boom\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)";

        expect(formatValue(error)).toBe("TypeError: boom\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)");
    });

    it("drops the V8 header of errors without a message", () => {
        const error = new Error();
        error.stack = "Error\n    at foo (app.js:1:1)";

        expect(formatValue(error)).toBe("Error\n    at foo (app.js:1:1)");
    });

    it("drops a V8 header that no longer matches the error name", () => {
        const error = new Error("boom");
        error.name = "CustomError";
        error.stack = "Error: boom\n    at foo (app.js:1:1)";

        expect(formatValue(error)).toBe("CustomError: boom\n    at foo (app.js:1:1)");
    });

    it("keeps multi-line messages out of the frames", () => {
        const error = new Error("line one\nline two");
        error.stack = "Error: line one\nline two\n    at foo (app.js:1:1)";

        expect(formatValue(error)).toBe("Error: line one\nline two\n    at foo (app.js:1:1)");
    });

    it("normalizes Firefox-style stacks", () => {
        const error = new Error("boom");
        error.stack = "foo@app.js:1:1\nbar@app.js:2:2\n";

        expect(formatValue(error)).toBe("Error: boom\n    at foo@app.js:1:1\n    at bar@app.js:2:2");
    });

    it("survives throwing getters", () => {
        const obj = {
            get bad(): number {
                throw new Error("nope");
            },
        };

        expect(formatValue(obj)).toBe('{ bad: "[Getter threw]" }');
    });

    it("formats dates and null-prototype objects", () => {
        expect(formatValue(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
        expect(formatValue(Object.create(null))).toBe("[Object: null prototype] {}");
    });
});
