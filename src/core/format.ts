export interface FormatOptions {
    /**
     * How deep nested objects/arrays are expanded before being summarized. `Infinity` expands everything.
     * @default 2
     */
    depth: number;
    /**
     * Spaces used to indent expanded objects. `0` prints objects on a single line.
     * @default 0
     */
    indent: number;
    /**
     * Maximum number of array items / object keys printed per level. `Infinity` prints them all.
     * @default 50
     */
    maxItems: number;
    /**
     * Maximum length of the final message. Longer messages are truncated with an ellipsis. `0` or
     * `Infinity` never truncates.
     * @default 4000
     */
    maxLength: number;
}

/** Default {@link FormatOptions}, used for every option that is not given. */
export const DEFAULT_FORMAT_OPTIONS: Readonly<FormatOptions> = {
    depth: 2,
    indent: 0,
    maxItems: 50,
    maxLength: 4000,
};

/** Format options plus what one formatting run derives from them. */
interface InspectOptions extends FormatOptions {
    /** Nested strings are cut to this many characters before being quoted. */
    stringLimit: number;
}

/** `%TypedArray%.prototype`: its getters work on typed arrays of every kind and realm. */
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;

/** `Error.isError()` (ES2026) where available: it also recognizes `DOMException` from other realms. */
const nativeIsError = (Error as unknown as { isError?: (value: unknown) => boolean }).isError;

/** Unwraps boxed primitives by `Object.prototype.toString` tag. Each one throws for other objects. */
const UNBOX = new Map<string, (value: object) => unknown>([
    ["String", (value) => String.prototype.valueOf.call(value)],
    ["Number", (value) => Number.prototype.valueOf.call(value)],
    ["Boolean", (value) => Boolean.prototype.valueOf.call(value)],
    ["BigInt", (value) => BigInt.prototype.valueOf.call(value)],
    ["Symbol", (value) => Symbol.prototype.valueOf.call(value)],
]);

/** Error properties that are printed as part of the error itself, not as extra properties. */
const ERROR_KEYS = new Set(["name", "message", "stack", "cause", "errors"]);

/**
 * Formats a list of console arguments into a single string, mimicking the browser console:
 * printf-style substitutions (`%s`, `%d`, `%i`, `%f`, `%o`, `%O`, `%j`, `%c`, `%%`) in the first
 * argument, errors printed with their stack, and objects printed with circular-reference and depth protection.
 * Never throws: a value that cannot be inspected prints as `[Name <unformattable: reason>]`.
 */
export function formatArgs(args: readonly unknown[], options: Partial<FormatOptions> = {}): string {
    const format = resolveFormatOptions(options);
    // A nested string starts after at least one character (its opening quote), so anything past
    // `maxLength` characters of it is truncated anyway: quoting less keeps huge strings cheap.
    const opts: InspectOptions = { ...format, stringLimit: format.maxLength > 0 ? format.maxLength + 1 : Infinity };
    const rest = [...args];
    const parts: string[] = [];

    if (typeof rest[0] === "string" && rest.length > 1 && rest[0].includes("%")) {
        const template = rest.shift() as string;

        parts.push(guard(() => substitute(template, rest, opts)));
    }

    for (const arg of rest) {
        parts.push(typeof arg === "string" ? arg : guard(() => inspect(arg, opts, 0, new WeakSet())));
    }

    return truncate(parts.join(" "), opts.maxLength);
}

/**
 * Formats a single value (primitive, error, object...) into a readable string. `maxLength` is not
 * applied. Never throws.
 */
export function formatValue(value: unknown, options: Partial<FormatOptions> = {}): string {
    const opts: InspectOptions = { ...resolveFormatOptions(options), stringLimit: Infinity };

    return guard(() => inspect(value, opts, 0, new WeakSet()));
}

/**
 * Fills in `options` over {@link DEFAULT_FORMAT_OPTIONS}. `undefined`, `NaN` and non-number values
 * fall back to the default, while an `Infinity` limit is kept and means "no limit".
 */
export function resolveFormatOptions(options?: Partial<FormatOptions>): FormatOptions {
    const { depth, indent, maxItems, maxLength } = options ?? {};
    const pad = numberOr(indent, DEFAULT_FORMAT_OPTIONS.indent);

    return {
        depth: numberOr(depth, DEFAULT_FORMAT_OPTIONS.depth),
        // Unlike the limits, an infinite indent has no meaning.
        indent: Number.isFinite(pad) ? pad : DEFAULT_FORMAT_OPTIONS.indent,
        maxItems: numberOr(maxItems, DEFAULT_FORMAT_OPTIONS.maxItems),
        maxLength: numberOr(maxLength, DEFAULT_FORMAT_OPTIONS.maxLength),
    };
}

/** `value` if it is a number other than `NaN` (`Infinity` included), otherwise `fallback`. */
export function numberOr(value: unknown, fallback: number): number {
    return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function substitute(template: string, args: unknown[], opts: InspectOptions): string {
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

function inspect(value: unknown, opts: InspectOptions, level: number, seen: WeakSet<object>): string {
    switch (typeof value) {
        case "string":
            return level === 0 ? value : JSON.stringify(value.slice(0, opts.stringLimit));
        case "number":
            return Object.is(value, -0) ? "-0" : String(value);
        case "bigint":
            return `${value}n`;
        case "boolean":
        case "undefined":
            return String(value);
        case "symbol":
            return value.toString();
        case "function": {
            const name = safeGet(value, "name");
            return typeof name === "string" && name ? `[Function: ${name}]` : "[Function (anonymous)]";
        }
    }

    if (value === null) return "null";

    // Proxies, exotic prototypes and throwing accessors can make any step below throw. One such
    // value must not cost the whole entry.
    try {
        return inspectObject(value as object, opts, level, seen);
    } catch (error) {
        return unformattable(value as object, error);
    }
}

function inspectObject(obj: object, opts: InspectOptions, level: number, seen: WeakSet<object>): string {
    if (seen.has(obj)) return "[Circular]";

    const tag = toStringTag(obj);

    if (isError(obj, tag)) return formatError(obj, opts, level, seen);

    // Built-ins are recognized by tag too, so objects from iframes work. Their methods double as
    // brand checks: look-alikes and subclass prototypes fall through to the generic object path.
    if (tag === "Date" || obj instanceof Date) {
        const time = attempt(() => Date.prototype.getTime.call(obj));
        if (time !== undefined) return Number.isNaN(time) ? "Invalid Date" : new Date(time).toISOString();
    }

    if (tag === "RegExp" || obj instanceof RegExp) {
        const source = attempt(() => RegExp.prototype.toString.call(obj));
        if (source !== undefined) return source;
    }

    const unbox = UNBOX.get(tag);
    const primitive = unbox && attempt(() => unbox(obj));

    if (primitive !== undefined) return `[${tag}: ${inspect(primitive, opts, 1, seen)}]`;

    if (tag === "ArrayBuffer" || tag === "SharedArrayBuffer") {
        return `${tag} { byteLength: ${inspect(safeGet(obj, "byteLength"), opts, 1, seen)} }`;
    }

    // `undefined` for a DataView, the element type ("Float32Array"...) for a typed array.
    const arrayType = ArrayBuffer.isView(obj) ? typedArrayName(obj) : undefined;

    if (ArrayBuffer.isView(obj) && !arrayType) {
        return `DataView { byteLength: ${obj.byteLength}, byteOffset: ${obj.byteOffset} }`;
    }

    const name = constructorName(obj);

    if (level > opts.depth) {
        if (Array.isArray(obj)) return `[Array(${obj.length})]`;
        if (arrayType) return `[${name ?? arrayType}(${typedArrayLength(obj)})]`;

        return `[${name ?? "Object"}]`;
    }

    seen.add(obj);

    try {
        if (Array.isArray(obj)) {
            const items = arrayItems(obj, opts.maxItems, (item) => inspect(item, opts, level + 1, seen));

            return wrap("[", items, "]", opts, level);
        }

        if (arrayType) {
            // Read lazily up to maxItems: typed arrays are often millions of elements long.
            const length = typedArrayLength(obj);
            const items = limit(obj as Iterable<unknown>, length, opts.maxItems, (item) =>
                inspect(item, opts, level + 1, seen),
            );

            return `${name ?? arrayType}(${length}) ${wrap("[", items, "]", opts, level)}`;
        }

        if (tag === "Map" || obj instanceof Map) {
            const size = attempt(() => Reflect.get(Map.prototype, "size", obj));

            if (size !== undefined) {
                const entries = Map.prototype.entries.call(obj) as Iterable<[unknown, unknown]>;
                const items = limit(
                    entries,
                    size,
                    opts.maxItems,
                    ([k, v]) => `${inspect(k, opts, level + 1, seen)} => ${inspect(v, opts, level + 1, seen)}`,
                );

                return `Map(${size}) ${wrap("{", items, "}", opts, level)}`;
            }
        }

        if (tag === "Set" || obj instanceof Set) {
            const size = attempt(() => Reflect.get(Set.prototype, "size", obj));

            if (size !== undefined) {
                const values = Set.prototype.values.call(obj) as Iterable<unknown>;
                const items = limit(values, size, opts.maxItems, (v) => inspect(v, opts, level + 1, seen));

                return `Set(${size}) ${wrap("{", items, "}", opts, level)}`;
            }
        }

        let keys: string[];
        try {
            keys = Object.keys(obj);
        } catch {
            return `[${name ?? "Object"}]`;
        }

        const prefix = name && name !== "Object" ? `${name} ` : "";

        return prefix + wrap("{", propertyItems(obj, keys, opts, level, seen), "}", opts, level);
    } finally {
        seen.delete(obj);
    }
}

function formatError(error: object, opts: InspectOptions, level: number, seen: WeakSet<object>): string {
    const header = errorHeader(error);
    const stack = safeGet(error, "stack");
    let text = header + formatFrames(typeof stack === "string" ? stack.trim() : "", header);

    seen.add(error);

    try {
        let keys: string[] = [];
        try {
            // An own `errors` that is not an array (per-field validation errors...) is not printed
            // by the AggregateError block below, so it is printed as a property.
            keys = Object.keys(error).filter(
                (key) => !ERROR_KEYS.has(key) || (key === "errors" && !Array.isArray(safeGet(error, key))),
            );
        } catch {
            // Print the error without its extra properties.
        }

        if (keys.length > 0) text += ` ${wrap("{", propertyItems(error, keys, opts, level, seen), "}", opts, level)}`;

        // AggregateError: one indented block per error.
        const errors = safeGet(error, "errors");

        if (Array.isArray(errors)) {
            const list = errors as unknown[];
            const items = limit(
                list.entries(),
                list.length,
                opts.maxItems,
                ([index, item]) => `[${index}]: ${inspectLinked(item, opts, level + 1, seen)}`,
            );

            text += items.map((item) => `\n  ${item.replaceAll("\n", "\n    ")}`).join("");
        }

        if (attempt(() => "cause" in error) === true) {
            text += `\nCaused by: ${inspectLinked(safeGet(error, "cause"), opts, level + 1, seen)}`;
        }
    } finally {
        seen.delete(error);
    }

    return text;
}

/** Formats a cause or an aggregated error. Past `depth` an error shrinks to its header, which ends long chains. */
function inspectLinked(value: unknown, opts: InspectOptions, level: number, seen: WeakSet<object>): string {
    if (level > opts.depth && typeof value === "object" && value !== null && !seen.has(value)) {
        const header = attempt(() => (isError(value, toStringTag(value)) ? errorHeader(value) : undefined));

        if (header !== undefined) return `[${header}]`;
    }

    return inspect(value, opts, level, seen);
}

/** Native errors are tagged "Error" whatever their realm, unlike `instanceof Error`. */
function isError(obj: object, tag: string): boolean {
    return tag === "Error" || obj instanceof Error || nativeIsError?.(obj) === true;
}

/** `Error.prototype.toString()` rules, which V8 also uses for the first line of `stack`. */
function errorHeader(error: object): string {
    const rawName = safeGet(error, "name");
    const rawMessage = safeGet(error, "message");
    const name = rawName === undefined ? "Error" : safeString(rawName);
    const message = rawMessage === undefined ? "" : safeString(rawMessage);

    return name && message ? `${name}: ${message}` : name || message;
}

/** The stack frames of `stack` as `\n    at ...` lines, without the header. */
function formatFrames(stack: string, header: string): string {
    if (!stack) return "";

    // V8 stacks start with a header (possibly multi-line, possibly without ": message") before the
    // first indented "at" frame. Firefox/Safari stacks have no header and no "at" prefix. Matching
    // the header first keeps a message line that looks like a frame ("    at position 5") out of them.
    const rawLines = stack.split("\n");
    let firstFrame = stack.startsWith(`${header}\n`)
        ? header.split("\n").length
        : rawLines.findIndex((line) => /^\s+at /.test(line));

    if (firstFrame < 0) firstFrame = stack.startsWith(header) ? header.split("\n").length : 0;

    return rawLines
        .slice(firstFrame)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `\n    ${line.startsWith("at ") ? line : `at ${line}`}`)
        .join("");
}

/** Holes probed one by one before {@link arrayItems} lists the indices of the elements instead. */
const HOLE_PROBE_LIMIT = 1024;

/** Array items with runs of holes shown as `<N empty items>`, like the browser console. */
function arrayItems(array: readonly unknown[], max: number, map: (item: unknown) => string): string[] {
    const out: string[] = [];
    const length = array.length;
    const count = Math.max(0, Math.floor(max));
    /** Indices of the elements that exist, looked up once a long run of holes is found. */
    let present: number[] | undefined;
    let next = 0;
    let index = 0;

    while (index < length && out.length < count) {
        if (Object.hasOwn(array, index)) {
            out.push(map(array[index]));
            index++;
            continue;
        }

        // Short runs (one `delete` in a huge array) are cheapest to probe: listing the indices
        // would read every one of them.
        let end = index + 1;
        while (end < length && end - index < HOLE_PROBE_LIMIT && !Object.hasOwn(array, end)) end++;

        if (end < length && end - index >= HOLE_PROBE_LIMIT) {
            // Jump to the next element instead of probing each index: `new Array(1e9)` is one hole.
            // Sorted, as a proxy can list its keys in any order.
            present ??= Object.keys(array)
                .filter((key) => /^(0|[1-9]\d*)$/.test(key))
                .map(Number)
                .sort((a, b) => a - b);

            while (next < present.length && (present[next] ?? length) <= index) next++;

            end = Math.min(present[next] ?? length, length);
        }

        const holes = end - index;

        out.push(`<${holes} empty item${holes === 1 ? "" : "s"}>`);
        index = end;
    }

    if (index < length) out.push(`... ${length - index} more`);

    return out;
}

/** Maps the first `max` of the `total` items and counts the rest. Iteration stops early. */
function limit<T>(items: Iterable<T>, total: number, max: number, map: (item: T) => string): string[] {
    const out: string[] = [];
    const count = Math.min(total, Math.max(0, Math.floor(max)));

    if (count > 0) {
        for (const item of items) {
            out.push(map(item));
            if (out.length >= count) break;
        }
    }

    if (total > out.length) out.push(`... ${total - out.length} more`);

    return out;
}

function propertyItems(
    obj: object,
    keys: readonly string[],
    opts: InspectOptions,
    level: number,
    seen: WeakSet<object>,
): string[] {
    return limit(keys, keys.length, opts.maxItems, (key) => {
        let prop: unknown;
        try {
            prop = (obj as Record<string, unknown>)[key];
        } catch {
            prop = "[Getter threw]";
        }
        return `${formatKey(key)}: ${inspect(prop, opts, level + 1, seen)}`;
    });
}

/** The element type of a typed array ("Float32Array"...), `undefined` for anything else. */
function typedArrayName(obj: object): string | undefined {
    const name: unknown = Reflect.get(TYPED_ARRAY_PROTOTYPE, Symbol.toStringTag, obj);

    return typeof name === "string" ? name : undefined;
}

function typedArrayLength(obj: object): number {
    return Reflect.get(TYPED_ARRAY_PROTOTYPE, "length", obj) as number;
}

/** The `X` of `[object X]`, or `""` when a proxy or a `Symbol.toStringTag` getter throws. */
function toStringTag(obj: object): string {
    try {
        return Object.prototype.toString.call(obj).slice(8, -1);
    } catch {
        return "";
    }
}

/** Output for a value whose inspection threw. Never throws, even at the stack limit. */
function unformattable(obj: object, error: unknown): string {
    try {
        const reason = describeError(error);

        // Every engine throws a TypeError mentioning "revoked" for revoked proxies. Other errors can
        // quote the word too, e.g. V8's SyntaxError for a regexp that it compiles at the stack limit.
        if (error instanceof TypeError && reason.includes("revoked")) return "[Proxy (revoked)]";

        let name: string | undefined;
        try {
            name = constructorName(obj);
        } catch {
            // The prototype chain itself is broken, keep the generic name.
        }

        return `[${name ?? "Object"} <unformattable: ${reason}>]`;
    } catch {
        return "[Object <unformattable: unknown error>]";
    }
}

/** Last resort for a whole argument: one bad value never costs the others. */
function guard(format: () => string): string {
    try {
        return format();
    } catch (error) {
        return `[unformattable: ${describeError(error)}]`;
    }
}

function describeError(error: unknown): string {
    try {
        return error instanceof Error ? error.message : String(error);
    } catch {
        return "unknown error";
    }
}

/** `fn()`, or `undefined` when it throws. */
function attempt<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

/** `obj[key]`, or `undefined` when a getter or proxy trap throws. */
function safeGet(obj: object, key: PropertyKey): unknown {
    return attempt((): unknown => (obj as Record<PropertyKey, unknown>)[key]);
}

/** `String(value)` that never throws (symbols are fine, throwing `toString` gives `""`). */
function safeString(value: unknown): string {
    return attempt(() => String(value)) ?? "";
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

    let end = Math.max(0, Math.floor(maxLength) - 1);

    // Never split a surrogate pair: a lone high surrogate renders as a replacement glyph.
    if (isHighSurrogate(text.charCodeAt(end - 1))) end--;

    return `${text.slice(0, end)}…`;
}

function isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
}
