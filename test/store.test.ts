import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_ENTRIES, LogStore } from "../src/core/store";

describe("LogStore", () => {
    it("stores entries with increasing ids and counts per level", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: false });

        store.add("log", "a");
        store.add("warn", "b");
        store.add("log", "c");

        expect(store.entries.map((e) => [e.id, e.level, e.message])).toEqual([
            [0, "log", "a"],
            [1, "warn", "b"],
            [2, "log", "c"],
        ]);
        expect(store.counts).toMatchObject({ log: 2, warn: 1, error: 0 });
    });

    it("collapses consecutive identical messages", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: true });

        store.add("log", "tick", undefined, 1);
        store.add("log", "tick", undefined, 2);
        store.add("warn", "tick");
        store.add("log", "tick");

        expect(store.entries.map((e) => [e.level, e.count])).toEqual([
            ["log", 2],
            ["warn", 1],
            ["log", 1],
        ]);
        expect(store.entries[0]?.timestamp).toBe(2);
        expect(store.counts.log).toBe(3);
    });

    it("does not collapse messages with a different custom colour", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: true });

        store.add("log", "x", 0xff0000);
        store.add("log", "x", 0x00ff00);

        expect(store.entries).toHaveLength(2);
    });

    it("drops the oldest entries beyond maxEntries and keeps counts in sync", () => {
        const store = new LogStore({ maxEntries: 2, collapseRepeats: true });

        store.add("error", "e");
        store.add("error", "e");
        store.add("log", "1");
        store.add("log", "2");

        expect(store.entries.map((e) => e.message)).toEqual(["1", "2"]);
        expect(store.firstId).toBe(1);
        expect(store.counts).toMatchObject({ error: 0, log: 2 });
    });

    it("clears entries and counts but keeps ids increasing", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: false });

        store.add("log", "a");
        store.clear();

        expect(store.entries).toHaveLength(0);
        expect(store.counts.log).toBe(0);
        expect(store.firstId).toBe(1);
        expect(store.add("log", "b").id).toBe(1);
    });

    it("does not count command-line entries", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: true });

        store.add("log", "> 1 + 1", undefined, 1, "input");
        store.add("error", "ReferenceError: x", undefined, 2, "result");
        store.add("log", "plain");

        expect(store.counts).toMatchObject({ log: 1, error: 0 });
        expect(store.entries.map((e) => e.kind)).toEqual(["input", "result", undefined]);
        expect("kind" in store.entries[2]!).toBe(false);
    });

    it("collapses command-line entries only with entries of the same kind", () => {
        const store = new LogStore({ maxEntries: 10, collapseRepeats: true });

        store.add("log", "2");
        store.add("log", "2", undefined, 1, "result");
        store.add("log", "2", undefined, 2, "result");
        store.add("log", "2", undefined, 3, "input");
        store.add("log", "2");

        expect(store.entries.map((e) => [e.kind, e.count])).toEqual([
            [undefined, 1],
            ["result", 2],
            ["input", 1],
            [undefined, 1],
        ]);
        expect(store.entries[1]?.timestamp).toBe(2);
        expect(store.counts.log).toBe(2);
    });

    it("keeps counts right when command-line entries are evicted", () => {
        const store = new LogStore({ maxEntries: 2, collapseRepeats: true });

        store.add("error", "e", undefined, 1, "result");
        store.add("error", "e", undefined, 2, "result");
        store.add("error", "e");
        store.add("log", "a");
        store.add("log", "b");

        expect(store.entries.map((e) => e.message)).toEqual(["a", "b"]);
        expect(store.counts).toMatchObject({ error: 0, log: 2 });
    });

    it("falls back to the default limit when maxEntries is NaN", () => {
        const store = new LogStore({ maxEntries: Number.NaN, collapseRepeats: false });

        for (let i = 0; i < DEFAULT_MAX_ENTRIES + 5; i++) store.add("log", String(i));

        expect(store.entries).toHaveLength(DEFAULT_MAX_ENTRIES);
        expect(store.counts.log).toBe(DEFAULT_MAX_ENTRIES);
        expect(store.entries[0]?.message).toBe("5");
    });

    it("keeps at least one entry and whole numbers of them", () => {
        const store = new LogStore({ maxEntries: 0, collapseRepeats: false });

        store.add("log", "a");
        store.add("log", "b");
        expect(store.entries.map((e) => e.message)).toEqual(["b"]);

        store.options.maxEntries = 2.5;
        store.add("log", "c");
        store.add("log", "d");
        expect(store.entries.map((e) => e.message)).toEqual(["c", "d"]);

        store.options.maxEntries = Infinity;
        for (let i = 0; i < 5; i++) store.add("log", String(i));
        expect(store.entries).toHaveLength(7);
    });
});
