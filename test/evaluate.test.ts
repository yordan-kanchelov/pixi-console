import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommandContext } from "../src/core/commands";
import { createJsEvaluator } from "../src/core/evaluate";
import type { PixiConsole } from "../src/PixiConsole";

const SCOPE_KEY = "__pixiConsoleScope__";
const globals = globalThis as unknown as Record<string, unknown>;

function context(lastResult?: unknown): CommandContext {
    return { pixiConsole: {} as PixiConsole, line: "", lastResult };
}

describe("createJsEvaluator", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("results", () => {
        const evaluate = createJsEvaluator();

        it("returns the value of the last statement", () => {
            expect(evaluate("1 + 1", context())).toBe(2);
            expect(evaluate("  'padded'  ", context())).toBe("padded");
            expect(evaluate("if (1) 'a'; else 'b'", context())).toBe("a");
            expect(evaluate("const unused = 1", context())).toBeUndefined();
        });

        it("reads a braced line as an object literal when it is one", () => {
            expect(evaluate("{ a: 1 }", context())).toEqual({ a: 1 });
            expect(evaluate("{a:1} // }", context())).toEqual({ a: 1 });
            expect(evaluate("{ let q = 2; q * 2 }", context())).toBe(4);
        });

        it("propagates syntax and reference errors", () => {
            expect(() => evaluate("1 +", context())).toThrow(SyntaxError);
            expect(() => evaluate("await (", context())).toThrow(SyntaxError);
            expect(() => evaluate("definitelyNotDefined", context())).toThrow(ReferenceError);
            expect(() => evaluate("throw new RangeError('boom')", context())).toThrow("boom");
        });
    });

    describe("globals and scope", () => {
        it("persists var and function declarations as globals, but not let", () => {
            const evaluate = createJsEvaluator();

            try {
                evaluate(
                    "var pixiConsoleVar = 5; let pixiConsoleLet = 6; function pixiConsoleFn() { return 7 }",
                    context(),
                );

                expect(globals.pixiConsoleVar).toBe(5);
                expect(evaluate("pixiConsoleVar + pixiConsoleFn()", context())).toBe(12);
                expect(evaluate("typeof pixiConsoleLet", context())).toBe("undefined");
                expect("pixiConsoleLet" in globals).toBe(false);
            } finally {
                delete globals.pixiConsoleVar;
                delete globals.pixiConsoleFn;
            }
        });

        it("resolves scope values before globals and sees later changes", () => {
            const scope: Record<string, unknown> = { player: { hp: 3 }, document: "shadowed" };
            const evaluate = createJsEvaluator({ scope });

            expect(evaluate("player.hp * 2", context())).toBe(6);
            expect(evaluate("document", context())).toBe("shadowed");

            scope.player = { hp: 10 };
            scope.extra = "new";

            expect(evaluate("player.hp", context())).toBe(10);
            expect(evaluate("extra", context())).toBe("new");
        });

        it("provides the last result as $_", () => {
            const evaluate = createJsEvaluator({ scope: { $_: "from scope" } });

            expect(evaluate("$_ * 2", context(21))).toBe(42);
            expect(evaluate("$_", context())).toBeUndefined();
        });

        it("does not resolve Object.prototype members through the scope", () => {
            const evaluate = createJsEvaluator({ scope: { a: 1 } });
            const original = Object.getOwnPropertyDescriptor(globalThis, "constructor");

            // A plain-object scope would answer Object.prototype.constructor instead of the global.
            Object.defineProperty(globalThis, "constructor", {
                configurable: true,
                writable: true,
                value: "global constructor",
            });
            try {
                expect(evaluate("constructor", context())).toBe("global constructor");
            } finally {
                if (original) Object.defineProperty(globalThis, "constructor", original);
                else Reflect.deleteProperty(globalThis, "constructor");
            }
        });
    });

    describe("await", () => {
        const evaluate = createJsEvaluator({ scope: { value: 3 } });

        it("awaits a top-level await expression", async () => {
            const result = evaluate("await Promise.resolve(7)", context());

            expect(result).toBeInstanceOf(Promise);
            expect(await result).toBe(7);
            expect(await (evaluate("{ a: await Promise.resolve(value) }", context()) as Promise<unknown>)).toEqual({
                a: 3,
            });
        });

        it("runs statements with await as an async body", async () => {
            const result = evaluate("const z = await Promise.resolve(3); globalThis.pixiConsoleZ = z; z", context());

            try {
                expect(await (result as Promise<unknown>)).toBeUndefined();
                expect(globals.pixiConsoleZ).toBe(3);
                // Declarations stay inside the async body, as documented.
                expect(
                    await (evaluate("var pixiConsoleAwaited = await 1", context()) as Promise<unknown>),
                ).toBeUndefined();
                expect("pixiConsoleAwaited" in globals).toBe(false);
            } finally {
                delete globals.pixiConsoleZ;
            }
        });

        it("prints the value of an await expression ending in a semicolon", async () => {
            const count = vi.fn(() => 7);
            const counting = createJsEvaluator({ scope: { count } });

            expect(await (evaluate("await Promise.resolve(7);", context()) as Promise<unknown>)).toBe(7);
            expect(await (evaluate("await Promise.resolve(value) ; ;", context()) as Promise<unknown>)).toBe(3);
            // Parsed as an expression without running first, so it runs once.
            expect(await (counting("await count();", context()) as Promise<unknown>)).toBe(7);
            expect(count).toHaveBeenCalledTimes(1);
        });

        it("keeps the scope in async continuations", async () => {
            const result = evaluate("(await null, value)", context()) as Promise<unknown>;

            expect(SCOPE_KEY in globals).toBe(false);
            await expect(result).resolves.toBe(3);
        });
    });

    describe("cleanup", () => {
        it("removes the scope global after success and after a throw", () => {
            const evaluate = createJsEvaluator({ scope: { a: 1 } });

            expect(evaluate(`typeof ${SCOPE_KEY}`, context())).toBe("object");
            expect(SCOPE_KEY in globals).toBe(false);
            expect(() => evaluate("throw new Error('x')", context())).toThrow("x");
            expect(SCOPE_KEY in globals).toBe(false);
            expect(() => evaluate("1 +", context())).toThrow(SyntaxError);
            expect(SCOPE_KEY in globals).toBe(false);
        });

        it("keeps the scope for closures created by a line", () => {
            const evaluate = createJsEvaluator({ scope: { secret: 42 } });
            const read = evaluate("() => secret", context()) as () => unknown;

            expect(SCOPE_KEY in globals).toBe(false);
            expect(read()).toBe(42);
        });

        it("keeps an outer line's scope when a nested line runs", () => {
            const inner = createJsEvaluator({ scope: { value: 2 } });
            const outer = createJsEvaluator({ scope: { value: 5, nested: () => inner("value", context()) } });

            expect(outer("nested() + value", context())).toBe(7);
            expect(SCOPE_KEY in globals).toBe(false);
        });

        it("looks eval up on every call", () => {
            const spy = vi.spyOn(globalThis, "eval");
            const evaluate = createJsEvaluator();

            expect(evaluate("40 + 2", context())).toBe(42);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0]?.[0]).toContain("40 + 2");
        });

        it("reports eval being refused as is", () => {
            const refused = new EvalError("Refused to evaluate a string as JavaScript");

            vi.spyOn(globalThis, "eval").mockImplementation(() => {
                throw refused;
            });

            expect(() => createJsEvaluator()("1", context())).toThrow(refused);
            expect(SCOPE_KEY in globals).toBe(false);
        });
    });

    describe("retries", () => {
        it("never runs a line twice when the code itself throws a SyntaxError", () => {
            const count = vi.fn();
            const evaluate = createJsEvaluator({ scope: { count } });

            // Runs as an object literal, then JSON.parse throws: must not be re-run as a (valid) block.
            expect(() => evaluate('{ a: (count(), JSON.parse("{")) }', context())).toThrow(SyntaxError);
            expect(count).toHaveBeenCalledTimes(1);

            // Contains "await" but parses: must not be re-run as an async body.
            expect(() => evaluate('count(); JSON.parse("await")', context())).toThrow(SyntaxError);
            expect(count).toHaveBeenCalledTimes(2);
        });

        it("rethrows what the code throws, even values instanceof cannot inspect", () => {
            const { proxy, revoke } = Proxy.revocable({}, {});
            const evaluate = createJsEvaluator({ scope: { proxy } });
            let thrown: unknown;

            revoke();
            try {
                evaluate("throw proxy", context());
            } catch (error) {
                thrown = error;
            }

            // Not the TypeError that `proxy instanceof SyntaxError` throws.
            expect(thrown === proxy).toBe(true);
            expect(SCOPE_KEY in globals).toBe(false);
        });

        it("only retries lines that do not parse", () => {
            const spy = vi.spyOn(globalThis, "eval");
            const evaluate = createJsEvaluator();

            evaluate("{ a: 1 }", context());
            expect(spy).toHaveBeenCalledTimes(1);

            spy.mockClear();
            evaluate("{ let q = 1; q }", context());
            expect(spy).toHaveBeenCalledTimes(2);

            spy.mockClear();
            void evaluate("const w = await 1; w", context());
            expect(spy).toHaveBeenCalledTimes(3);
        });
    });
});
