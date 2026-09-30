import { describe, expect, it, vi } from "vitest";

import {
    COMMAND_NAME,
    CommandRegistry,
    builtinCommands,
    isEvalBlocked,
    isThenable,
    parseCommandLine,
    type CommandContext,
    type ConsoleEvaluator,
} from "../src/core/commands";
import type { PixiConsole } from "../src/PixiConsole";

/** A context whose console only has what the built-in commands use. */
function stubContext(registry: CommandRegistry, evaluator: ConsoleEvaluator | null = null) {
    const pixiConsole = { commands: registry.entries(), evaluator, clear: vi.fn() };
    const context: CommandContext = {
        pixiConsole: pixiConsole as unknown as PixiConsole,
        line: "",
        lastResult: undefined,
    };

    return { context, pixiConsole };
}

function registryWithBuiltins(): CommandRegistry {
    const registry = new CommandRegistry();

    for (const [name, command] of Object.entries(builtinCommands())) registry.add(name, command);

    return registry;
}

describe("parseCommandLine", () => {
    it("splits on any whitespace and ignores surrounding whitespace", () => {
        expect(parseCommandLine("  spawn   3\tfast  ")).toEqual({ name: "spawn", args: ["3", "fast"] });
        expect(parseCommandLine("help")).toEqual({ name: "help", args: [] });
        expect(parseCommandLine("")).toEqual({ name: "", args: [] });
    });

    it("groups double- and single-quoted words", () => {
        expect(parseCommandLine(`spawn "big boss" 3`).args).toEqual(["big boss", "3"]);
        expect(parseCommandLine(`say 'hello world' "it's"`).args).toEqual(["hello world", "it's"]);
    });

    it("unescapes characters inside quotes only", () => {
        expect(parseCommandLine(String.raw`say "a \"quoted\" word" 'it\'s' "back\\slash"`).args).toEqual([
            'a "quoted" word',
            "it's",
            "back\\slash",
        ]);
        expect(parseCommandLine(String.raw`path C:\games\pixi`).args).toEqual([String.raw`C:\games\pixi`]);
    });

    it("keeps empty quoted arguments", () => {
        expect(parseCommandLine(`set name "" ''`).args).toEqual(["name", "", ""]);
    });

    it("lower-cases the raw first word", () => {
        expect(parseCommandLine("Help Clear").name).toBe("help");
        expect(parseCommandLine("Help Clear").args).toEqual(["Clear"]);
        expect(parseCommandLine(`"help" x`).name).toBe(`"help"`);
        expect(parseCommandLine("foo.bar(1)").name).toBe("foo.bar(1)");
    });

    it("takes an unterminated quote literally", () => {
        expect(parseCommandLine(`say "big boss`).args).toEqual([`"big`, "boss"]);
        expect(parseCommandLine(`say it's fine`).args).toEqual(["it's", "fine"]);
    });
});

describe("COMMAND_NAME", () => {
    it("accepts one word starting with a letter", () => {
        for (const name of ["help", "Spawn", "a", "god-mode", "net:ping", "level_2"]) {
            expect(COMMAND_NAME.test(name), name).toBe(true);
        }
        for (const name of ["", "two words", "1abc", "a.b", "_x", "-x", "(help)", "a/b"]) {
            expect(COMMAND_NAME.test(name), name).toBe(false);
        }
    });
});

describe("CommandRegistry", () => {
    it("normalises a function to { run } and keeps command objects", () => {
        const registry = new CommandRegistry();
        const fps = () => 60;
        const spawn = { run: vi.fn(), usage: "<count>", description: "Spawn enemies" };

        registry.add("fps", fps).add("spawn", spawn);

        expect(registry.get("fps")).toEqual({ run: fps });
        expect(registry.get("spawn")).toBe(spawn);
    });

    it("replaces a command registered under the same name, case-insensitively", () => {
        const registry = new CommandRegistry();
        const first = () => 1;
        const second = () => 2;

        registry.add("go", first);
        registry.add("GO", second);

        expect(registry.get("go")?.run).toBe(second);
        expect(Object.keys(registry.entries())).toEqual(["go"]);
    });

    it("looks commands up case-insensitively", () => {
        const registry = new CommandRegistry().add("Spawn", () => undefined);

        expect(registry.get("spawn")).toBeDefined();
        expect(registry.get("SPAWN")).toBe(registry.get("spawn"));
        expect(Object.keys(registry.entries())).toEqual(["spawn"]);
    });

    it("removes commands, ignoring unknown names", () => {
        const registry = new CommandRegistry().add("a", () => 1).add("b", () => 2);

        expect(registry.remove("A")).toBe(true);
        expect(registry.remove("nope")).toBe(false);
        expect(registry.get("a")).toBeUndefined();
        expect(Object.keys(registry.entries())).toEqual(["b"]);

        registry.clear();
        expect(registry.entries()).toEqual({});
    });

    it("rejects names that are not one word starting with a letter", () => {
        const registry = new CommandRegistry();

        for (const name of ["", "two words", "1abc", "a.b"]) {
            expect(() => registry.add(name, () => undefined)).toThrow(TypeError);
        }
        expect(() => registry.add("a.b", () => undefined)).toThrow(
            'Invalid command name "a.b": use one word starting with a letter',
        );
        expect(registry.entries()).toEqual({});
    });

    it("completes command names by prefix, sorted", () => {
        const registry = registryWithBuiltins().add("hello", () => "hi");

        expect(registry.complete("he")).toEqual(["hello", "help"]);
        expect(registry.complete("HEL")).toEqual(["hello", "help"]);
        expect(registry.complete("c")).toEqual(["clear"]);
        expect(registry.complete("x")).toEqual([]);
        expect(registry.complete("")).toEqual(["clear", "hello", "help"]);
    });

    it("returns a sorted snapshot from entries()", () => {
        const registry = new CommandRegistry().add("zoom", () => 1).add("alpha", () => 2);
        const entries = registry.entries();

        expect(Object.keys(entries)).toEqual(["alpha", "zoom"]);

        registry.add("beta", () => 3);
        delete entries.alpha;

        expect(Object.keys(entries)).toEqual(["zoom"]);
        expect(Object.keys(registry.entries())).toEqual(["alpha", "beta", "zoom"]);
    });
});

describe("isThenable", () => {
    it("detects promises and promise-like values", () => {
        expect(isThenable(Promise.resolve(1))).toBe(true);
        expect(isThenable({ then() {} })).toBe(true);

        const callable = Object.assign(() => undefined, { then: () => undefined });

        expect(isThenable(callable)).toBe(true);
    });

    it("rejects everything else", () => {
        expect(isThenable({ then: 1 })).toBe(false);
        expect(isThenable(null)).toBe(false);
        expect(isThenable(undefined)).toBe(false);
        expect(isThenable("then")).toBe(false);
        expect(isThenable(() => undefined)).toBe(false);
    });
});

describe("isEvalBlocked", () => {
    it("recognises EvalError, also from another realm", () => {
        expect(isEvalBlocked(new EvalError("Refused to evaluate a string as JavaScript"))).toBe(true);
        expect(isEvalBlocked({ name: "EvalError", message: "blocked" })).toBe(true);
    });

    it("ignores other errors and values", () => {
        expect(isEvalBlocked(new TypeError("x"))).toBe(false);
        expect(isEvalBlocked(new SyntaxError("x"))).toBe(false);
        expect(isEvalBlocked("EvalError")).toBe(false);
        expect(isEvalBlocked(null)).toBe(false);
    });
});

describe("builtinCommands", () => {
    it("provides help and clear with help texts", () => {
        const { help, clear } = builtinCommands();

        expect(help).toMatchObject({ usage: "[command]", description: "Lists commands, or describes one" });
        expect(clear).toMatchObject({ description: "Removes every entry" });
        expect(builtinCommands().help).not.toBe(help);
    });

    it("lists every command with aligned usage and descriptions", () => {
        const registry = registryWithBuiltins()
            .add("spawn", { usage: "<count> [type]", description: "Spawn enemies", run: () => undefined })
            .add("fps", () => 60);
        const { context } = stubContext(registry);

        expect(builtinCommands().help.run([], context)).toBe(
            [
                "Commands:",
                "  clear                 Removes every entry",
                "  fps",
                "  help [command]        Lists commands, or describes one",
                "  spawn <count> [type]  Spawn enemies",
            ].join("\n"),
        );
    });

    it("mentions JavaScript only when an evaluator is set", () => {
        const registry = registryWithBuiltins();
        const without = builtinCommands().help.run([], stubContext(registry).context) as string;
        const withEvaluator = builtinCommands().help.run([], stubContext(registry, () => 1).context) as string;

        expect(without).not.toContain("JavaScript");
        expect(withEvaluator.split("\n").at(-1)).toBe("Anything else runs as JavaScript. $_ is the last result.");
        expect(withEvaluator.startsWith(without)).toBe(true);
    });

    it("describes one command, case-insensitively", () => {
        const registry = registryWithBuiltins().add("fps", () => 60);
        const { context } = stubContext(registry);
        const { help } = builtinCommands();

        expect(help.run(["clear"], context)).toBe("clear\n  Removes every entry");
        expect(help.run(["HELP"], context)).toBe("help [command]\n  Lists commands, or describes one");
        expect(help.run(["fps"], context)).toBe("fps");
    });

    it("reports unknown commands", () => {
        const { context } = stubContext(registryWithBuiltins());
        const { help } = builtinCommands();

        expect(help.run(["nope"], context)).toBe('Unknown command "nope".');
        expect(help.run(["constructor"], context)).toBe('Unknown command "constructor".');
    });

    it("clear clears the console and prints nothing", () => {
        const { context, pixiConsole } = stubContext(registryWithBuiltins());

        expect(builtinCommands().clear.run([], context)).toBeUndefined();
        expect(pixiConsole.clear).toHaveBeenCalledTimes(1);
    });
});
