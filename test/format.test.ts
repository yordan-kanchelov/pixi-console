import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FORMAT_OPTIONS, formatArgs, formatValue, resolveFormatOptions } from "../src/core/format";

/** A lone (unpaired) UTF-16 surrogate. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

afterEach(() => {
    vi.restoreAllMocks();
});

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

    it("never splits a surrogate pair when truncating", () => {
        const message = formatArgs(["a" + "😀".repeat(10)], { maxLength: 3 });

        expect(message).toBe("a…");
        expect(message).not.toMatch(LONE_SURROGATE);

        for (let maxLength = 1; maxLength < 12; maxLength++) {
            expect(formatArgs(["😀".repeat(10)], { maxLength })).not.toMatch(LONE_SURROGATE);
        }
    });

    it("ignores explicitly undefined options", () => {
        const undefinedOptions = { depth: undefined, indent: undefined, maxItems: undefined, maxLength: undefined };

        expect(formatArgs(["hello world"], { maxLength: undefined })).toBe("hello world");
        expect(formatArgs(["x".repeat(5000)], undefinedOptions)).toHaveLength(DEFAULT_FORMAT_OPTIONS.maxLength);
        expect(formatArgs(["%o", { a: { b: { c: { d: 1 } } } }], undefinedOptions)).toBe(
            "{ a: { b: { c: [Object] } } }",
        );
    });

    it("keeps nested strings intact up to the truncation", () => {
        const long = "x".repeat(10_000);
        const stringify = vi.spyOn(JSON, "stringify");
        const message = formatArgs(["value", { s: long }], { maxLength: 100 });

        expect(message).toBe(`value { s: "${long}" }`.slice(0, 99) + "…");
        for (const [value] of stringify.mock.calls) {
            if (typeof value === "string") expect(value.length).toBeLessThanOrEqual(101);
        }
    });

    it("keeps the other arguments when one cannot be formatted", () => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();

        expect(formatArgs(["before", proxy, { nested: proxy }, "after"])).toBe(
            "before [Proxy (revoked)] { nested: [Proxy (revoked)] } after",
        );
        expect(formatArgs(["%o and %s", proxy, "text"])).toBe("[Proxy (revoked)] and text");
    });
});

describe("resolveFormatOptions", () => {
    it("falls back to the defaults for undefined, NaN and non-number values", () => {
        expect(resolveFormatOptions()).toEqual(DEFAULT_FORMAT_OPTIONS);
        expect(
            resolveFormatOptions({ depth: undefined, indent: Number.NaN, maxItems: "5" as unknown as number }),
        ).toEqual(DEFAULT_FORMAT_OPTIONS);
        expect(resolveFormatOptions(null as unknown as undefined)).toEqual(DEFAULT_FORMAT_OPTIONS);
    });

    it("keeps Infinity as no limit, but not as an indent", () => {
        expect(
            resolveFormatOptions({ depth: Infinity, maxItems: Infinity, maxLength: Infinity, indent: Infinity }),
        ).toEqual({ depth: Infinity, maxItems: Infinity, maxLength: Infinity, indent: DEFAULT_FORMAT_OPTIONS.indent });
    });

    it("never returns the shared defaults object", () => {
        expect(resolveFormatOptions()).not.toBe(DEFAULT_FORMAT_OPTIONS);
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
        expect(formatValue(new Date(Number.NaN))).toBe("Invalid Date");
        expect(formatValue(Object.create(null))).toBe("[Object: null prototype] {}");
    });

    it("formats regular expressions and boxed primitives", () => {
        expect(formatValue({ re: /a+/gi })).toBe("{ re: /a+/gi }");
        expect(
            formatValue([new String("ab"), new Number(-0), new Boolean(false), Object(1n), Object(Symbol("s"))]),
        ).toBe('[[String: "ab"], [Number: -0], [Boolean: false], [BigInt: 1n], [Symbol: Symbol(s)]]');
    });

    it("ignores explicitly undefined and NaN options", () => {
        const value = { a: 1, b: { c: { d: { e: 2 } } } };

        expect(formatValue(value, { indent: undefined, depth: undefined })).toBe("{ a: 1, b: { c: { d: [Object] } } }");
        expect(formatValue(value, { indent: Number.NaN, depth: Number.NaN })).toBe(
            "{ a: 1, b: { c: { d: [Object] } } }",
        );
        expect(formatValue([1, 2, 3], { maxItems: undefined })).toBe("[1, 2, 3]");
        expect(
            formatValue(
                Array.from({ length: 60 }, () => 0),
                { maxItems: Number.NaN },
            ),
        ).toContain("... 10 more");
    });

    it("treats Infinity as no limit", () => {
        const deep = { a: { b: { c: { d: { e: 1 } } } } };

        expect(formatValue(deep, { depth: Infinity })).toBe("{ a: { b: { c: { d: { e: 1 } } } } }");
        expect(
            formatValue(
                Array.from({ length: 60 }, () => 0),
                { maxItems: Infinity },
            ),
        ).not.toContain("more");
        expect(formatArgs(["x".repeat(5000)], { maxLength: Infinity })).toHaveLength(5000);
    });

    it("does not apply maxLength", () => {
        expect(formatValue({ s: "x".repeat(50) }, { maxLength: 10 })).toBe(`{ s: "${"x".repeat(50)}" }`);
    });

    describe("binary data and collections", () => {
        it("formats typed arrays like arrays", () => {
            expect(formatValue(new Float32Array([1, 2.5, -0]))).toBe("Float32Array(3) [1, 2.5, -0]");
            expect(formatValue(new BigInt64Array([1n, -2n]))).toBe("BigInt64Array(2) [1n, -2n]");
            expect(formatValue(new Uint8Array(4), { maxItems: 2 })).toBe("Uint8Array(4) [0, 0, ... 2 more]");
            expect(formatValue({ a: { b: { c: new Float32Array(3) } } })).toBe(
                "{ a: { b: { c: [Float32Array(3)] } } }",
            );

            class Positions extends Float32Array {}
            expect(formatValue(new Positions(2))).toBe("Positions(2) [0, 0]");
        });

        it("formats array buffers and data views by size", () => {
            expect(formatValue(new ArrayBuffer(8))).toBe("ArrayBuffer { byteLength: 8 }");
            expect(formatValue(new DataView(new ArrayBuffer(8), 2, 4))).toBe(
                "DataView { byteLength: 4, byteOffset: 2 }",
            );
        });

        it("reads only maxItems elements of a huge typed array", () => {
            const keys = vi.spyOn(Object, "keys");
            const big = new Float32Array(1_000_000);

            expect(formatValue({ big }, { maxItems: 3 })).toBe(
                "{ big: Float32Array(1000000) [0, 0, 0, ... 999997 more] }",
            );
            expect(keys.mock.calls.some(([target]) => target === big)).toBe(false);
        });

        it("iterates only maxItems entries of a huge Map or Set", () => {
            const map = new Map(Array.from({ length: 10_000 }, (_, i) => [i, i] as const));
            const set = new Set(map.keys());
            const mapNext = vi.spyOn(Object.getPrototypeOf(map.entries()) as Iterator<unknown>, "next");
            const setNext = vi.spyOn(Object.getPrototypeOf(set.values()) as Iterator<unknown>, "next");

            expect(formatValue(map, { maxItems: 2 })).toBe("Map(10000) { 0 => 0, 1 => 1, ... 9998 more }");
            expect(formatValue(set, { maxItems: 2 })).toBe("Set(10000) { 0, 1, ... 9998 more }");
            expect(mapNext.mock.calls.length).toBeLessThanOrEqual(3);
            expect(setNext.mock.calls.length).toBeLessThanOrEqual(3);
        });

        it("formats sparse arrays with runs of empty items", () => {
            // eslint-disable-next-line no-sparse-arrays -- the point of the test
            const holey = [1, , 3];

            expect(formatValue(holey)).toBe("[1, <1 empty item>, 3]");
            expect(formatValue(new Array(3))).toBe("[<3 empty items>]");
            expect(formatValue(holey, { indent: 2 })).toBe("[\n  1,\n  <1 empty item>,\n  3\n]");
            // eslint-disable-next-line no-sparse-arrays -- the point of the test
            expect(formatValue([1, , , 4, 5], { maxItems: 2 })).toBe("[1, <2 empty items>, ... 2 more]");
            expect(formatValue(new Array(1e9))).toBe("[<1000000000 empty items>]");
        });

        it("does not list the indices of a huge array to skip a short run of holes", () => {
            const tiles = Array.from({ length: 1e6 }, (_, i) => i);
            // eslint-disable-next-line @typescript-eslint/no-array-delete -- the hole is the point of the test
            delete tiles[3];
            const ownKeys = vi.fn(Reflect.ownKeys);
            const counted = new Proxy(tiles, { ownKeys });

            expect(formatValue(counted, { maxItems: 5 })).toBe("[0, 1, 2, <1 empty item>, 4, ... 999995 more]");
            expect(ownKeys).not.toHaveBeenCalled();
        });

        it("still jumps over long runs of holes, whatever order the keys come in", () => {
            const sparse: unknown[] = [];
            sparse[0] = "a";
            sparse[1500] = "b";
            sparse[1502] = "c";
            sparse.length = 3000;
            const reversed = new Proxy(sparse, { ownKeys: (target) => Reflect.ownKeys(target).reverse() });
            const expected = '["a", <1499 empty items>, "b", <1 empty item>, "c", <1497 empty items>]';

            expect(formatValue(sparse)).toBe(expected);
            expect(formatValue(reversed)).toBe(expected);
        });
    });

    describe("exotic values", () => {
        it("formats revoked proxies", () => {
            const { proxy, revoke } = Proxy.revocable({}, {});
            revoke();

            expect(formatValue(proxy)).toBe("[Proxy (revoked)]");
            expect(formatValue([proxy])).toBe("[[Proxy (revoked)]]");
        });

        it("formats built-in subclass prototypes as plain objects", () => {
            class MyMap extends Map {}
            class MySet extends Set {}
            class MyDate extends Date {}
            class MyRegExp extends RegExp {}

            expect(formatValue(MyMap.prototype)).toBe("Map {}");
            expect(formatValue(MySet.prototype)).toBe("Set {}");
            expect(formatValue(MyDate.prototype)).toBe("Date {}");
            expect(formatValue(MyRegExp.prototype)).toBe("RegExp {}");
        });

        it("marks objects whose inspection throws", () => {
            const trap = new Proxy(
                {},
                {
                    getPrototypeOf() {
                        throw new Error("nope");
                    },
                },
            );

            expect(formatValue({ trap })).toBe("{ trap: [Object <unformattable: nope>] }");
        });

        it("summarizes objects whose keys cannot be listed", () => {
            const hidden = new Proxy(
                {},
                {
                    ownKeys() {
                        throw new Error("no keys");
                    },
                },
            );

            expect(formatValue({ hidden })).toBe("{ hidden: [Object] }");
        });

        it("survives errors that cannot be described", () => {
            const { proxy: reason, revoke } = Proxy.revocable({}, {});
            revoke();
            const trap = new Proxy(
                {},
                {
                    getPrototypeOf() {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown value that can't even be inspected
                        throw reason;
                    },
                },
            );

            expect(formatValue(trap)).toBe("[Object <unformattable: unknown error>]");
        });

        it("survives structures deeper than the call stack", () => {
            let deep: Record<string, unknown> = {};
            for (let i = 0; i < 100_000; i++) deep = { deep };

            // Several runs, so the result doesn't depend on what earlier tests warmed up: an error
            // raised at the stack limit (e.g. while compiling a regexp) must not change the label.
            for (let run = 0; run < 3; run++) {
                const message = formatArgs(["deep", deep], { depth: Infinity, maxLength: 0 });

                expect(message.startsWith("deep { deep: { deep: ")).toBe(true);
                expect(message).toContain("<unformattable: ");
                expect(message).not.toContain("[Proxy (revoked)]");
            }
        });

        it("labels only TypeErrors about revoked proxies as revoked proxies", () => {
            const throwing = (error: Error) =>
                new Proxy(
                    {},
                    {
                        getPrototypeOf() {
                            throw error;
                        },
                    },
                );

            expect(
                formatValue(throwing(new SyntaxError("Invalid regular expression: /revoked/: Stack overflow"))),
            ).toBe("[Object <unformattable: Invalid regular expression: /revoked/: Stack overflow>]");
            expect(formatValue(throwing(new TypeError("proxy has been revoked")))).toBe("[Proxy (revoked)]");
        });

        it("survives a throwing Symbol.toStringTag and function name", () => {
            const tagged = {
                a: 1,
                get [Symbol.toStringTag](): string {
                    throw new Error("tag");
                },
            };
            const fn = Object.defineProperty(() => undefined, "name", {
                get() {
                    throw new Error("name");
                },
            });

            expect(formatValue(tagged)).toBe("{ a: 1 }");
            expect(formatValue(fn)).toBe("[Function (anonymous)]");
        });
    });
});

describe("formatValue errors", () => {
    function withStack<T extends Error>(error: T, stack: string): T {
        error.stack = stack;
        return error;
    }

    it("recognizes errors from another realm", () => {
        const foreign: unknown = runInNewContext(
            "const e = new TypeError('x'); e.stack = 'TypeError: x\\n    at f (a.js:1:1)'; e",
        );

        expect(foreign instanceof Error).toBe(false);
        expect(formatValue(foreign)).toBe("TypeError: x\n    at f (a.js:1:1)");
        expect(formatValue(runInNewContext("new Map([[1, new Date(0)]])"))).toBe(
            "Map(1) { 1 => 1970-01-01T00:00:00.000Z }",
        );
    });

    it("prints the cause chain", () => {
        const inner = withStack(new Error("inner"), "Error: inner\n    at x (a.js:1:1)");
        const outer = withStack(new Error("outer", { cause: inner }), "Error: outer\n    at y (a.js:2:2)");

        expect(formatValue(outer)).toBe(
            "Error: outer\n    at y (a.js:2:2)\nCaused by: Error: inner\n    at x (a.js:1:1)",
        );
        expect(
            formatValue(new Error("x", { cause: { code: 1 } }), { depth: 0 })
                .split("\n")
                .at(-1),
        ).toBe("Caused by: [Object]");
        expect(formatValue(withStack(new Error("x", { cause: "reason" }), "Error: x"))).toBe(
            'Error: x\nCaused by: "reason"',
        );
    });

    it("stops the cause chain at the depth limit and on cycles", () => {
        const inner = withStack(new Error("inner"), "Error: inner\n    at x (a.js:1:1)");
        const outer = withStack(new Error("outer", { cause: inner }), "Error: outer");
        const loop = withStack(new Error("loop"), "Error: loop") as Error & { cause?: unknown };
        loop.cause = loop;

        expect(formatValue(outer, { depth: 0 })).toBe("Error: outer\nCaused by: [Error: inner]");
        expect(formatValue(loop)).toBe("Error: loop\nCaused by: [Circular]");
    });

    it("prints the errors of an AggregateError", () => {
        const a = withStack(new Error("a"), "Error: a\n    at g (a.js:3:3)");
        const b = withStack(new TypeError("b"), "TypeError: b");
        const aggregate = withStack(
            new AggregateError([a, b, "c"], "many"),
            "AggregateError: many\n    at f (a.js:4:4)",
        );

        expect(formatValue(aggregate)).toBe(
            [
                "AggregateError: many",
                "    at f (a.js:4:4)",
                "  [0]: Error: a",
                "        at g (a.js:3:3)",
                "  [1]: TypeError: b",
                '  [2]: "c"',
            ].join("\n"),
        );
        expect(formatValue(aggregate, { maxItems: 1 }).split("\n").slice(2)).toEqual([
            "  [0]: Error: a",
            "        at g (a.js:3:3)",
            "  ... 2 more",
        ]);
    });

    it("prints own enumerable properties", () => {
        const error = withStack(Object.assign(new Error("e"), { code: "E_X" }), "Error: e\n    at f (a.js:1:1)");

        expect(formatValue(error)).toBe('Error: e\n    at f (a.js:1:1) { code: "E_X" }');
    });

    it("prints an own errors property that is not an array like any other property", () => {
        const validation = withStack(
            Object.assign(new Error("Validation failed"), { errors: { email: "is invalid" }, code: 422 }),
            "Error: Validation failed\n    at x (a.js:1:1)",
        );
        const listed = withStack(Object.assign(new Error("many"), { errors: ["a"] }), "Error: many");

        expect(formatValue(validation)).toBe(
            'Error: Validation failed\n    at x (a.js:1:1) { errors: { email: "is invalid" }, code: 422 }',
        );
        expect(formatValue(listed)).toBe('Error: many\n  [0]: "a"');
    });

    it("does not take message lines that look like frames for frames", () => {
        const error = withStack(
            new Error("fail:\n    at position 5"),
            "Error: fail:\n    at position 5\n    at foo (a.js:1:1)",
        );

        expect(formatValue(error)).toBe("Error: fail:\n    at position 5\n    at foo (a.js:1:1)");
    });

    it("survives throwing and odd error properties", () => {
        const error = new Error("boom");
        Object.defineProperty(error, "stack", {
            get() {
                throw new Error("no stack");
            },
        });

        expect(formatValue(error)).toBe("Error: boom");
        expect(formatValue(Object.assign(new Error(), { message: Symbol("m"), stack: undefined }))).toBe(
            "Error: Symbol(m)",
        );
        expect(formatValue(Object.assign(new Error("m"), { name: "", stack: undefined }))).toBe("m");
    });
});
