export interface FormatOptions {
    /** How deep nested objects/arrays are expanded before being summarized. */
    depth: number;
    /** Spaces used to indent expanded objects. `0` prints objects on a single line. */
    indent: number;
    /** Maximum number of array items / object keys printed per level. */
    maxItems: number;
    /** Maximum length of the final message. Longer messages are truncated with an ellipsis. */
    maxLength: number;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
    depth: 2,
    indent: 0,
    maxItems: 50,
    maxLength: 4000,
};

/**
 * Formats a list of console arguments into a single string, mimicking the browser console:
 * printf-style substitutions (`%s`, `%d`, `%i`, `%f`, `%o`, `%O`, `%j`, `%c`, `%%`) in the first
 * argument, errors printed with their stack, and objects printed with circular-reference and depth protection.
 */
export function formatArgs(args: readonly unknown[], options: Partial<FormatOptions> = {}): string {
    const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };
    const rest = [...args];
    const parts: string[] = [];

    if (typeof rest[0] === "string" && rest.length > 1 && rest[0].includes("%")) {
        parts.push(substitute(rest.shift() as string, rest, opts));
    }

    for (const arg of rest) {
        parts.push(typeof arg === "string" ? arg : formatValue(arg, opts));
    }

    return truncate(parts.join(" "), opts.maxLength);
}

/** Formats a single value (primitive, error, object...) into a readable string. */
export function formatValue(value: unknown, options: Partial<FormatOptions> = {}): string {
    const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };

    return inspect(value, opts, 0, new WeakSet());
}

function substitute(template: string, args: unknown[], opts: FormatOptions): string {
    return template.replace(/%([sdifoOjc%])/g, (match, specifier: string) => {
        if (specifier === "%") return "%";
        if (args.length === 0) return match;

        const arg = args.shift();

        switch (specifier) {
            case "s":
                return typeof arg === "string" ? arg : inspect(arg, { ...opts, depth: 0 }, 0, new WeakSet());
            case "d":
            case "i":
                return typeof arg === "bigint" ? `${arg}n` : String(Math.trunc(toNumber(arg)));
            case "f":
                return String(toNumber(arg));
            case "c":
                // CSS styling has no meaning on canvas, swallow the argument.
                return "";
            default:
                return inspect(arg, opts, 0, new WeakSet());
        }
    });
}

function inspect(value: unknown, opts: FormatOptions, level: number, seen: WeakSet<object>): string {
    switch (typeof value) {
        case "string":
            return level === 0 ? value : JSON.stringify(value);
        case "number":
            return Object.is(value, -0) ? "-0" : String(value);
        case "bigint":
            return `${value}n`;
        case "boolean":
        case "undefined":
            return String(value);
        case "symbol":
            return value.toString();
        case "function":
            return value.name ? `[Function: ${value.name}]` : "[Function (anonymous)]";
    }

    if (value === null) return "null";

    const obj = value as object;

    if (obj instanceof Error) return formatError(obj);
    if (obj instanceof Date) return isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString();
    if (obj instanceof RegExp) return obj.toString();

    if (seen.has(obj)) return "[Circular]";

    const name = constructorName(obj);

    if (level > opts.depth) {
        return Array.isArray(obj) ? `[Array(${obj.length})]` : `[${name ?? "Object"}]`;
    }

    seen.add(obj);

    try {
        if (Array.isArray(obj)) {
            const items = limit(obj, opts.maxItems, (item) => inspect(item, opts, level + 1, seen));
            return wrap("[", items, "]", opts, level);
        }

        if (obj instanceof Map) {
            const items = limit(
                [...obj.entries()],
                opts.maxItems,
                ([k, v]) => `${inspect(k, opts, level + 1, seen)} => ${inspect(v, opts, level + 1, seen)}`,
            );
            return `Map(${obj.size}) ${wrap("{", items, "}", opts, level)}`;
        }

        if (obj instanceof Set) {
            const items = limit([...obj.values()], opts.maxItems, (v) => inspect(v, opts, level + 1, seen));
            return `Set(${obj.size}) ${wrap("{", items, "}", opts, level)}`;
        }

        let keys: string[];
        try {
            keys = Object.keys(obj);
        } catch {
            return `[${name ?? "Object"}]`;
        }

        const items = limit(keys, opts.maxItems, (key) => {
            let prop: unknown;
            try {
                prop = (obj as Record<string, unknown>)[key];
            } catch {
                prop = "[Getter threw]";
            }
            return `${formatKey(key)}: ${inspect(prop, opts, level + 1, seen)}`;
        });
        const prefix = name && name !== "Object" ? `${name} ` : "";

        return prefix + wrap("{", items, "}", opts, level);
    } finally {
        seen.delete(obj);
    }
}

function formatError(error: Error): string {
    const header = error.message ? `${error.name}: ${error.message}` : error.name;
    const stack = typeof error.stack === "string" ? error.stack.trim() : "";

    if (!stack) return header;

    // V8 stacks start with a header (possibly multi-line, possibly without ": message") before the
    // first indented "at" frame. Firefox/Safari stacks have no header and no "at" prefix.
    const rawLines = stack.split("\n");
    let firstFrame = rawLines.findIndex((line) => /^\s+at /.test(line));

    if (firstFrame < 0) firstFrame = stack.startsWith(header) ? header.split("\n").length : 0;

    const lines = rawLines
        .slice(firstFrame)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `    ${line.startsWith("at ") ? line : `at ${line}`}`);

    return lines.length ? `${header}\n${lines.join("\n")}` : header;
}

/** `Number()` that never throws (symbols, objects without a primitive value, throwing `valueOf`). */
function toNumber(value: unknown): number {
    try {
        return Number(value);
    } catch {
        return Number.NaN;
    }
}

function constructorName(obj: object): string | undefined {
    const proto = Object.getPrototypeOf(obj) as { constructor?: { name?: unknown } } | null;

    if (proto === null) return "[Object: null prototype]";

    const ctor = proto.constructor;

    return typeof ctor?.name === "string" && ctor.name ? ctor.name : undefined;
}

function formatKey(key: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function limit<T>(items: readonly T[], max: number, map: (item: T) => string): string[] {
    const out = items.slice(0, max).map(map);

    if (items.length > max) out.push(`... ${items.length - max} more`);

    return out;
}

function wrap(open: string, items: string[], close: string, opts: FormatOptions, level: number): string {
    if (items.length === 0) return open + close;

    if (opts.indent <= 0) {
        return open === "[" ? `[${items.join(", ")}]` : `{ ${items.join(", ")} }`;
    }

    const pad = " ".repeat(opts.indent * (level + 1));
    const closePad = " ".repeat(opts.indent * level);

    return `${open}\n${items.map((item) => pad + item).join(",\n")}\n${closePad}${close}`;
}

function truncate(text: string, maxLength: number): string {
    if (maxLength <= 0 || text.length <= maxLength) return text;

    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
