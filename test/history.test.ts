import { describe, expect, it } from "vitest";

import { HISTORY_SIZE, InputHistory } from "../src/core/history";

function historyOf(...lines: string[]): InputHistory {
    const history = new InputHistory();

    for (const line of lines) history.push(line);

    return history;
}

describe("InputHistory", () => {
    it("remembers lines oldest first, skipping blank lines and consecutive duplicates", () => {
        const history = historyOf("a", "", "   ", "b", "b", "a", "b");

        expect(history.lines).toEqual(["a", "b", "a", "b"]);
    });

    it("keeps the last 100 lines by default, or a custom maximum", () => {
        const history = new InputHistory();

        for (let i = 0; i < 150; i++) history.push(`line ${i}`);

        expect(HISTORY_SIZE).toBe(100);
        expect(history.lines).toHaveLength(100);
        expect(history.lines[0]).toBe("line 50");
        expect(history.lines.at(-1)).toBe("line 149");

        const small = new InputHistory(2);

        small.push("a");
        small.push("b");
        small.push("c");

        expect(small.max).toBe(2);
        expect(small.lines).toEqual(["b", "c"]);
    });

    it("walks back and forth and restores the draft", () => {
        const history = historyOf("a", "b");

        expect(history.previous("draft")).toBe("b");
        expect(history.previous("b")).toBe("a");
        expect(history.next()).toBe("b");
        expect(history.next()).toBe("draft");
        expect(history.next()).toBeUndefined();
        expect(history.previous("draft")).toBe("b");
    });

    it("returns undefined past the oldest line and when not navigating", () => {
        const history = historyOf("a");

        expect(history.next()).toBeUndefined();
        expect(history.previous("")).toBe("a");
        expect(history.previous("a")).toBeUndefined();
        expect(history.previous("a")).toBeUndefined();
        expect(history.next()).toBe("");

        expect(new InputHistory().previous("x")).toBeUndefined();
        expect(new InputHistory().next()).toBeUndefined();
    });

    it("treats an edited recalled line as a new draft", () => {
        const history = historyOf("a", "b", "c");

        expect(history.previous("")).toBe("c");
        expect(history.previous("c")).toBe("b");
        // The user edits "b" and presses ↑ again: navigation restarts from the newest line.
        expect(history.previous("b2")).toBe("c");
        expect(history.previous("c")).toBe("b");
        expect(history.next()).toBe("c");
        expect(history.next()).toBe("b2");
    });

    it("stops navigating when a line is pushed or on reset", () => {
        const history = historyOf("a", "b");

        history.previous("draft");
        history.push("c");

        expect(history.next()).toBeUndefined();
        expect(history.previous("")).toBe("c");

        history.reset();

        expect(history.next()).toBeUndefined();
        expect(history.previous("new")).toBe("c");
        expect(history.next()).toBe("new");
    });

    it("filters, trims and resets when lines are assigned", () => {
        const history = new InputHistory(3);

        history.push("old");
        history.previous("draft");
        history.lines = ["a", "", "  ", 42, null, "b", "c", "d"];

        expect(history.lines).toEqual(["b", "c", "d"]);
        expect(history.next()).toBeUndefined();
        expect(history.previous("")).toBe("d");
    });

    it("returns a copy of its lines", () => {
        const history = historyOf("a");
        const lines = history.lines as string[];

        lines.push("b");

        expect(history.lines).toEqual(["a"]);
    });
});
