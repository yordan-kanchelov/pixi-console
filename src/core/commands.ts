import type { PixiConsole } from "../PixiConsole";

/** What a command and the evaluator receive besides their input. */
export interface CommandContext {
    /** The console running the line. Its log()/print() methods write to the canvas console only. */
    readonly pixiConsole: PixiConsole;
    /** The whole line as entered, trimmed. */
    readonly line: string;
    /** What the previous line produced, see {@link PixiConsole.lastResult} (`$_` in {@link createJsEvaluator}). */
    readonly lastResult: unknown;
}

/**
 * Runs a command. `args` are the words after the command name; "double" or 'single' quotes keep
 * spaces and `\` escapes a character inside quotes (`spawn "big boss" 3` → `["big boss", "3"]`).
 * Return a value to print it (`undefined` prints nothing, strings print as-is, other values are
 * formatted like `console.log`). Return a promise to print its value once it settles. Throw to
 * print an error.
 */
export type CommandHandler = (args: string[], context: CommandContext) => unknown;

/** A command with the help text `help` shows. */
export interface ConsoleCommand {
    run: CommandHandler;
    /** One line shown by `help`. */
    description?: string;
    /** Argument syntax shown by `help`, e.g. `"<count> [type]"`. */
    usage?: string;
}

/**
 * Handles lines whose first word is not a registered command, e.g. {@link createJsEvaluator}.
 * Return the value to print (promises are awaited). Throw to print an error.
 */
export type ConsoleEvaluator = (line: string, context: CommandContext) => unknown;

/** Valid command names: one word starting with a letter. No dots, so `foo.bar` always goes to the evaluator. */
export const COMMAND_NAME = /^[a-z][\w:-]*$/i;

/** One argument: a "double" or 'single' quoted string (with `\` escapes) or a run of non-whitespace. */
const ARGUMENT = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

/**
 * Splits a line into the command name (its first word, lower-cased) and the arguments after it.
 * Quotes group words and `\` escapes a character inside quotes; an unterminated quote is literal.
 */
export function parseCommandLine(line: string): { name: string; args: string[] } {
    const trimmed = line.trim();
    const end = trimmed.search(/\s/);
    const name = (end < 0 ? trimmed : trimmed.slice(0, end)).toLowerCase();
    const rest = end < 0 ? "" : trimmed.slice(end);
    const args = Array.from(rest.matchAll(ARGUMENT), ([token, double, single]) => {
        const quoted = double ?? single;

        return quoted === undefined ? token : quoted.replace(/\\(.)/g, "$1");
    });

    return { name, args };
}

/** Whether a value is a promise or promise-like object that `await` would wait for. */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        ((typeof value === "object" && value !== null) || typeof value === "function") &&
        typeof (value as { then?: unknown }).then === "function"
    );
}

/**
 * Whether an error means `eval` was refused, by a Content-Security-Policy without `'unsafe-eval'`
 * or by Trusted Types: engines only throw `EvalError` for those. Checks the name rather than
 * `instanceof`, which fails for errors from another realm (e.g. an iframe).
 */
export function isEvalBlocked(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "EvalError";
}

/**
 * Commands by lower-case name. Pure data structure: parsing and running lines is up to the console.
 */
export class CommandRegistry {
    private readonly _commands = new Map<string, ConsoleCommand>();

    /**
     * Registers or replaces a command. Names are case-insensitive; a function is shorthand for `{ run }`.
     * @throws TypeError when `name` is not one word matching {@link COMMAND_NAME}.
     */
    add(name: string, command: ConsoleCommand | CommandHandler): this {
        if (!COMMAND_NAME.test(name)) {
            throw new TypeError(`Invalid command name "${name}": use one word starting with a letter`);
        }

        this._commands.set(name.toLowerCase(), typeof command === "function" ? { run: command } : command);

        return this;
    }

    /** Unregisters a command. Returns whether it was registered. */
    remove(name: string): boolean {
        return this._commands.delete(name.toLowerCase());
    }

    /** The command registered under `name`, case-insensitively. */
    get(name: string): ConsoleCommand | undefined {
        return this._commands.get(name.toLowerCase());
    }

    /** Unregisters every command. */
    clear(): void {
        this._commands.clear();
    }

    /** A copy of the registered commands, sorted by name. */
    entries(): Record<string, ConsoleCommand> {
        return Object.fromEntries([...this._commands].sort(([a], [b]) => compare(a, b)));
    }

    /** Sorted names of the commands starting with `prefix`, case-insensitively. */
    complete(prefix: string): string[] {
        const start = prefix.toLowerCase();

        return [...this._commands.keys()].filter((name) => name.startsWith(start)).sort(compare);
    }
}

/** The commands every console starts with: `help` and `clear`. */
export function builtinCommands(): Record<"help" | "clear", ConsoleCommand> {
    return {
        help: {
            usage: "[command]",
            description: "Lists commands, or describes one",
            run: ([name], { pixiConsole }) => {
                const { commands } = pixiConsole;

                if (name !== undefined) {
                    const key = name.toLowerCase();
                    // Own properties only: `help constructor` must not find Object.prototype.constructor.
                    const command = Object.prototype.hasOwnProperty.call(commands, key) ? commands[key] : undefined;

                    if (!command) return `Unknown command "${name}".`;

                    const head = signature(key, command);

                    return command.description ? `${head}\n  ${command.description}` : head;
                }

                const rows = Object.entries(commands)
                    .sort(([a], [b]) => compare(a, b))
                    .map(([key, command]) => ({
                        head: `  ${signature(key, command)}`,
                        description: command.description,
                    }));
                const width = Math.max(0, ...rows.map(({ head }) => head.length));
                const lines = rows.map(({ head, description }) =>
                    description ? `${head.padEnd(width)}  ${description}` : head,
                );

                if (pixiConsole.evaluator) lines.push("Anything else runs as JavaScript. $_ is the last result.");

                return ["Commands:", ...lines].join("\n");
            },
        },
        clear: {
            description: "Removes every entry",
            run: (_, { pixiConsole }) => {
                pixiConsole.clear();
            },
        },
    };
}

/** `name usage`, or just the name when the command has no usage. */
function signature(name: string, command: Readonly<ConsoleCommand>): string {
    return command.usage ? `${name} ${command.usage}` : name;
}

/** Code-unit order: stable across locales, unlike `localeCompare`. */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
