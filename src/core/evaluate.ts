import type { ConsoleEvaluator } from "./commands";

export interface JsEvaluatorOptions {
    /**
     * Values available to evaluated code by name, looked up before globals. Read on every line, so
     * later changes to the object are picked up.
     * @example { app, player: game.player }
     */
    scope?: Readonly<Record<string, unknown>>;
}

/** Temporary global holding the scope object while a line is evaluated. */
const SCOPE_KEY = "__pixiConsoleScope__";

/**
 * Creates an evaluator that runs lines as JavaScript, much like the devtools console: the value of
 * the last statement is printed, `{ a: 1 }` is an object literal, `$_` is the previous result and
 * `scope` values are in scope. `var` and function declarations persist between lines as globals;
 * `let`/`const` do not. Lines run in sloppy mode.
 *
 * `await` works at the top level when the line is a single expression (`await Assets.load(url)`).
 * Any other line with an `await` (several statements, or a declaration like `var tex = await …`)
 * runs inside an async function: its result is `undefined` and its declarations don't persist, so
 * write `globalThis.tex = await …` to keep a value.
 *
 * Uses indirect `eval`, so a page whose Content-Security-Policy lacks `'unsafe-eval'` (or that
 * enforces Trusted Types for scripts) refuses it: the console then prints a hint and commands keep
 * working. `import "pixi.js/unsafe-eval"` makes PixiJS itself work under a strict CSP; it does not
 * make this work.
 *
 * Security: anyone who can type into the console can run any code in your page, and players can be
 * talked into pasting some. Use it in development builds or behind your own gate, never
 * unconditionally in production.
 * @example
 * new PixiConsole({ prompt: true, evaluator: import.meta.env.DEV ? createJsEvaluator({ scope: { app } }) : null });
 */
export function createJsEvaluator(options: JsEvaluatorOptions = {}): ConsoleEvaluator {
    return (line, context) => {
        // No prototype: `constructor` or `toString` must not resolve to Object.prototype's through `with`.
        const scope = Object.assign(Object.create(null) as Record<string, unknown>, options.scope, {
            $_: context.lastResult,
        });

        return evaluate(line.trim(), scope);
    };
}

/**
 * Runs `code` with `scope` in front of the globals, retrying as an object literal or an async body
 * when that is what the line means.
 */
function evaluate(code: string, scope: object): unknown {
    // `with (SCOPE_KEY)` reads the global once, when the code starts running: closures and async
    // continuations keep the scope after the global is gone, and nested lines cannot swap it.
    // The read also tells a SyntaxError thrown while parsing (nothing ran, retrying is safe) from one
    // thrown by the code itself (e.g. `JSON.parse`), which must not run the line a second time.
    let started = false;

    Object.defineProperty(globalThis, SCOPE_KEY, {
        configurable: true,
        get: () => {
            started = true;

            return scope;
        },
    });

    const run = (source: string): unknown => {
        const indirectEval: (code: string) => unknown = globalThis.eval; // looked up per call (spy-able in tests)

        started = false;

        return indirectEval(`with (${SCOPE_KEY}) {\n${source}\n}`);
    };
    // `started` first: what the code threw is never retried, and `instanceof` throws for some values
    // (revoked proxies), which would replace the thrown value with a TypeError.
    const unparsable = (error: unknown) => !started && error instanceof SyntaxError;

    try {
        if (/^\{[\s\S]*\}$/.test(code)) {
            try {
                return run(`(${code}\n)`);
            } catch (error) {
                if (!unparsable(error)) throw error;
            }
        }

        try {
            return run(code);
        } catch (error) {
            if (!unparsable(error) || !/\bawait\b/.test(code)) throw error;
        }

        try {
            // Without trailing `;`, so `await x;` is still one expression and its value is printed.
            return run(`(async () => (\n${trimTrailingSemicolons(code)}\n))()`);
        } catch (error) {
            if (!unparsable(error)) throw error;
        }

        return run(`(async () => {\n${code}\n})()`);
    } finally {
        Reflect.deleteProperty(globalThis, SCOPE_KEY);
    }
}

/** `code` without trailing `;` and whitespace. A loop, since `/[\s;]+$/` is quadratic on long runs. */
function trimTrailingSemicolons(code: string): string {
    let end = code.length;

    while (end > 0 && /[\s;]/.test(code.charAt(end - 1))) end--;

    return code.slice(0, end);
}
