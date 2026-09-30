import type { LogLevel } from "./types";

type ConsoleMethod = (...args: unknown[]) => void;

/** `console` methods that can be intercepted. */
export type InterceptedMethod = LogLevel | "clear";

export type ConsoleListener = (method: InterceptedMethod, args: unknown[]) => void;

interface Subscription {
    levels: ReadonlySet<InterceptedMethod>;
    listener: ConsoleListener;
}

interface Patch {
    original: ConsoleMethod;
    patched: ConsoleMethod;
}

const subscriptions = new Set<Subscription>();
const patches = new Map<InterceptedMethod, Patch>();
let dispatching = false;

/**
 * Starts forwarding calls of the given `console` methods to `listener`.
 * The original console methods are always still called.
 *
 * Any number of listeners can be registered: `console` is patched once and restored when the last
 * listener interested in a method unsubscribes, so several consoles can coexist and none of them
 * clobbers another's (or a third party's) patch.
 *
 * @returns A function that stops forwarding and restores `console` when nobody else listens.
 */
export function interceptConsole(levels: Iterable<InterceptedMethod>, listener: ConsoleListener): () => void {
    const subscription: Subscription = { levels: new Set(levels), listener };

    subscriptions.add(subscription);
    sync();

    return () => {
        if (subscriptions.delete(subscription)) sync();
    };
}

/** Returns the un-patched console method, useful for logging without being captured. */
export function originalConsole(level: InterceptedMethod): ConsoleMethod {
    return patches.get(level)?.original ?? (console[level] as ConsoleMethod).bind(console);
}

function sync(): void {
    const needed = new Set<InterceptedMethod>();

    for (const { levels } of subscriptions) {
        for (const level of levels) needed.add(level);
    }

    for (const level of needed) {
        // (Re-)patch when the method was replaced since we patched it. If the replacement still calls
        // our old patch, the `dispatching` guard keeps listeners from being notified twice.
        if (console[level] !== patches.get(level)?.patched) patch(level);
    }

    for (const [level, { original, patched }] of patches) {
        // Only restore when nobody patched on top of us, otherwise we would drop their patch.
        // An orphaned patch keeps forwarding to the original method.
        if (!needed.has(level) && console[level] === patched) {
            console[level] = original;
            patches.delete(level);
        }
    }
}

function patch(level: InterceptedMethod): void {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- always invoked with an explicit receiver
    const original = console[level] as ConsoleMethod;

    const patched: ConsoleMethod = function (this: unknown, ...args: unknown[]) {
        // Listeners that log, or chained patches calling back into an older patch of ours,
        // must reach the original method without notifying listeners again.
        if (dispatching) return original.apply(this ?? console, args);

        const failures: unknown[] = [];

        dispatching = true;
        try {
            for (const subscription of subscriptions) {
                if (!subscription.levels.has(level)) continue;
                try {
                    subscription.listener(level, args);
                } catch (error) {
                    failures.push(error);
                }
            }

            return original.apply(this ?? console, args);
        } finally {
            try {
                // Through console.error, not `original`: debug() is hidden by default and clear() prints
                // nothing. After the original call, so that clear() does not wipe the report.
                // `dispatching` is still set, so our own patch forwards it without notifying.
                for (const error of failures) console.error("[pixi-console] listener failed", error);
            } finally {
                dispatching = false;
            }
        }
    };

    console[level] = patched;
    patches.set(level, { original, patched });
}

export type GlobalErrorListener = (error: unknown, kind: "error" | "unhandledrejection") => void;

/** Hint appended to the opaque message browsers report for errors thrown by cross-origin scripts. */
const CROSS_ORIGIN_HINT = " (cross-origin script: add the crossorigin attribute and CORS headers to see details)";

/**
 * Listens for uncaught errors and unhandled promise rejections on `window`, or on the global scope
 * of a worker.
 *
 * @returns A function that removes the listeners.
 */
export function interceptGlobalErrors(listener: GlobalErrorListener): () => void {
    const scope: Partial<typeof globalThis> = typeof window !== "undefined" ? window : globalThis;

    if (typeof scope.addEventListener !== "function" || typeof scope.removeEventListener !== "function") {
        return () => undefined;
    }

    const target = scope as typeof globalThis;

    const onError = (event: ErrorEvent) => {
        if (event.error != null) {
            listener(event.error, "error");
            return;
        }

        // Also survives a plain `Event("error")` dispatched on `window`.
        const message = (event.message as string | undefined) ?? "";

        // Chrome reports these benign notifications to `window` (not to devtools) when a
        // ResizeObserver callback changes the observed layout, e.g. by resizing the renderer.
        if (message.startsWith("ResizeObserver loop")) return;

        const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
        // `throw null` yields message "Uncaught null" (Chrome) or "uncaught exception: null" (Firefox);
        // the console adds its own "Uncaught".
        const text = message.replace(/^uncaught(?: exception:)?\s+/i, "");

        listener(`${text}${location}${message === "Script error." ? CROSS_ORIGIN_HINT : ""}`, "error");
    };
    const onRejection = (event: PromiseRejectionEvent) => listener(event.reason, "unhandledrejection");

    target.addEventListener("error", onError);
    target.addEventListener("unhandledrejection", onRejection);

    return () => {
        target.removeEventListener("error", onError);
        target.removeEventListener("unhandledrejection", onRejection);
    };
}
