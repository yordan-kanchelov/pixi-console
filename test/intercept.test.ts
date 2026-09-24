import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { interceptConsole, interceptGlobalErrors, originalConsole } from "../src/core/intercept";
import type { InterceptedMethod } from "../src/core/intercept";

describe("interceptConsole", () => {
    let nativeLog: typeof console.log;
    let nativeWarn: typeof console.warn;

    beforeEach(() => {
        nativeLog = vi.fn();
        nativeWarn = vi.fn();
        console.log = nativeLog;
        console.warn = nativeWarn;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forwards calls to the listener and still calls the original", () => {
        const listener = vi.fn();
        const stop = interceptConsole(["log"], listener);

        console.log("hi", 1);

        expect(listener).toHaveBeenCalledWith("log", ["hi", 1]);
        expect(nativeLog).toHaveBeenCalledWith("hi", 1);

        stop();
    });

    it("only patches the requested levels", () => {
        const stop = interceptConsole(["log"], vi.fn());

        expect(console.log).not.toBe(nativeLog);
        expect(console.warn).toBe(nativeWarn);

        stop();
    });

    it("restores the console when the last listener unsubscribes", () => {
        const a = vi.fn();
        const b = vi.fn();
        const stopA = interceptConsole(["log"], a);
        const stopB = interceptConsole(["log", "warn"], b);

        console.log("both");
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);

        stopA();
        expect(console.log).not.toBe(nativeLog);
        console.log("only b");
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(2);

        stopB();
        expect(console.log).toBe(nativeLog);
        expect(console.warn).toBe(nativeWarn);
    });

    it("does not clobber a patch installed on top of it", () => {
        const stop = interceptConsole(["log"], vi.fn());
        const thirdParty = vi.fn();
        console.log = thirdParty;

        stop();

        expect(console.log).toBe(thirdParty);
    });

    it("re-patches a replaced method and notifies once when the replacement chains to it", () => {
        const first = interceptConsole(["log"], vi.fn());
        const ours = console.log;
        const wrapper = vi.fn((...args: unknown[]) => ours(...args));
        console.log = wrapper;
        first();

        const listener = vi.fn();
        const stop = interceptConsole(["log"], listener);

        expect(console.log).not.toBe(wrapper);
        console.log("chained");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(wrapper).toHaveBeenCalledWith("chained");
        expect(nativeLog).toHaveBeenCalledTimes(1);

        stop();
        expect(console.log).toBe(wrapper);
    });

    it("does not recurse when a listener logs", () => {
        const listener = vi.fn((_level: InterceptedMethod, args: unknown[]) => console.log("echo", ...args));
        const stop = interceptConsole(["log"], listener);

        console.log("once");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(nativeLog).toHaveBeenCalledWith("echo", "once");
        stop();
    });

    it("keeps working when a listener throws", () => {
        const stop = interceptConsole(["log"], () => {
            throw new Error("broken listener");
        });
        const good = vi.fn();
        const stopGood = interceptConsole(["log"], good);

        expect(() => console.log("x")).not.toThrow();
        expect(good).toHaveBeenCalled();
        expect(nativeLog).toHaveBeenCalledWith("x");

        stop();
        stopGood();
    });

    it("exposes the original console method", () => {
        const stop = interceptConsole(["log"], vi.fn());

        expect(originalConsole("log")).toBe(nativeLog);

        stop();
    });
});

describe("interceptGlobalErrors", () => {
    function captureWindowListeners() {
        const listeners = new Map<string, EventListener>();
        const add = vi.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
            listeners.set(type, listener as EventListener);
        });
        const remove = vi.spyOn(window, "removeEventListener").mockImplementation((type) => {
            listeners.delete(type);
        });

        return { listeners, add, remove };
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("reports uncaught errors and unhandled rejections", () => {
        const { listeners } = captureWindowListeners();
        const listener = vi.fn();
        const stop = interceptGlobalErrors(listener);
        const error = new Error("uncaught");

        listeners.get("error")!(new ErrorEvent("error", { error, message: "uncaught" }));
        const rejection = new Event("unhandledrejection") as Event & { reason?: unknown };
        rejection.reason = "rejected";
        listeners.get("unhandledrejection")!(rejection);

        expect(listener).toHaveBeenNthCalledWith(1, error, "error");
        expect(listener).toHaveBeenNthCalledWith(2, "rejected", "unhandledrejection");

        stop();
        expect(listeners.size).toBe(0);
    });

    it("falls back to the message and location when there is no error object", () => {
        const { listeners } = captureWindowListeners();
        const listener = vi.fn();
        const stop = interceptGlobalErrors(listener);

        listeners.get("error")!(
            new ErrorEvent("error", { message: "Script error.", filename: "a.js", lineno: 1, colno: 2 }),
        );

        expect(listener).toHaveBeenCalledWith("Script error. (a.js:1:2)", "error");
        stop();
    });
});
