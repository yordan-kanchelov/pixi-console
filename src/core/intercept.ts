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

        dispatching = true;
        try {
            for (const subscription of subscriptions) {
                if (!subscription.levels.has(level)) continue;
                try {
                    subscription.listener(level, args);
                } catch (error) {
                    original.call(console, "[pixi-console] listener failed", error);
                }
            }

            return original.apply(this ?? console, args);
        } finally {
            dispatching = false;
        }
    };

    console[level] = patched;
    patches.set(level, { original, patched });
}

export type GlobalErrorListener = (error: unknown, kind: "error" | "unhandledrejection") => void;

/**
 * Listens for uncaught errors and unhandled promise rejections on `window`.
 *
 * @returns A function that removes the listeners.
 */
export function interceptGlobalErrors(listener: GlobalErrorListener): () => void {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
        return () => undefined;
    }

    const onError = (event: ErrorEvent) => {
        const location = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
        listener(event.error ?? `${event.message}${location}`, "error");
    };
    const onRejection = (event: PromiseRejectionEvent) => listener(event.reason, "unhandledrejection");

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
    };
}
