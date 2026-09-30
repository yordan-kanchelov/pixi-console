import "./style.css";

import { Application, VERSION } from "pixi.js";
import { createJsEvaluator, DEFAULT_OPTIONS, PixiConsole, type ConsoleCommand, type LogLevel } from "pixi-console";

import { createScene } from "./scene";

const params = new URLSearchParams(location.search);

if (params.has("record")) {
    await startRecording(Number(params.get("w") ?? 800), Number(params.get("h") ?? 450));
} else {
    await startPlayground();
}

// ---------------------------------------------------------------- playground

interface Settings {
    textRenderer: "bitmap" | "canvas";
    timestamps: boolean;
    collapseRepeats: boolean;
    maxEntries: number;
    toolbar: boolean;
    prompt: boolean;
    /** Whether lines that aren't commands run as JavaScript. */
    evaluator: boolean;
}

/** Settings the console can change at runtime, through the setter of the same name. */
type RuntimeSetting = Exclude<keyof Settings, "textRenderer">;

async function startPlayground(): Promise<void> {
    const host = document.querySelector<HTMLElement>("#stage");

    if (!host) return;

    const app = new Application();
    await app.init({
        resizeTo: host,
        background: "#0b0d14",
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
    });
    host.appendChild(app.canvas);

    const updateScene = createScene(app);
    let elapsed = 0;
    app.ticker.add((ticker) => {
        updateScene((elapsed += ticker.deltaMS));
    });

    const settings: Settings = {
        textRenderer: "bitmap",
        timestamps: false,
        collapseRepeats: true,
        maxEntries: DEFAULT_OPTIONS.maxEntries,
        toolbar: true,
        prompt: true,
        evaluator: true,
    };
    const evaluator = createJsEvaluator({ scope: { app } });
    // JavaScript only runs from the prompt here, so "evaluate JS" is disabled while the prompt is off.
    const activeEvaluator = () => (settings.prompt && settings.evaluator ? evaluator : null);
    const commands: Record<string, ConsoleCommand> = {
        ...demoCommands(app),
        boom: {
            description: "Throws an error",
            run: () => {
                throw new Error("Boom! Commands can fail too");
            },
        },
    };
    let pixiConsole: PixiConsole | undefined;

    // Only the text renderer can't change at runtime, so changing it creates a new console. That one
    // takes over the old one's log (with fresh timestamps), its filter and its command history. The
    // command-line transcript is dropped: its entries can't be written back with their `kind`, and as
    // ordinary entries they would be counted and could be filtered out.
    const mount = () => {
        const previous = pixiConsole;
        const entries = [...(previous?.entries ?? [])];
        const history = previous?.history ?? [];

        previous?.destroy();
        pixiConsole = new PixiConsole({
            visible: true,
            ...settings,
            evaluator: activeEvaluator(),
            commands,
            filter: previous?.filter,
            autoResize: { renderer: app.renderer, layout: consoleLayout },
        });
        app.stage.addChild(pixiConsole);

        for (const { level, message, color, count, kind } of entries) {
            if (kind) continue;

            // Repeated, so collapsed entries collapse again. "%s" keeps a "%" in the message as it is.
            for (let i = 0; i < count; i++) {
                if (color === undefined) pixiConsole[level]("%s", message);
                else pixiConsole.print(message, color);
            }
        }

        pixiConsole.history = history;
    };

    const apply = (name: RuntimeSetting) => {
        if (!pixiConsole) return;

        if (name === "maxEntries") pixiConsole.maxEntries = settings.maxEntries;
        else if (name !== "evaluator") pixiConsole[name] = settings[name];

        if (name === "evaluator" || name === "prompt") pixiConsole.evaluator = activeEvaluator();
    };

    const syncControls = () => {
        const evaluatorSwitch = document.querySelector<HTMLInputElement>("#settings [name='evaluator']");
        const focusButton = document.querySelector<HTMLButtonElement>("#command-line [data-focus]");
        const hint = document.querySelector<HTMLElement>("#stage-hint");

        // The playground only sends JavaScript through the command line, and focusPrompt() needs it too.
        // execute() works without it, so the other command-line buttons stay enabled.
        if (evaluatorSwitch) evaluatorSwitch.disabled = !settings.prompt;
        if (focusButton) focusButton.disabled = !settings.prompt;
        if (hint) hint.hidden = !settings.prompt;
        renderSnippet(settings);
    };

    mount();
    syncControls();

    console.log(`pixi-console is capturing this page. PixiJS v${VERSION}, renderer: ${app.renderer.name}`);
    console.info("Press ` to toggle the console, scroll it with the wheel or by dragging.");
    console.info("Type help in the command line below, or some JavaScript like app.stage.children.length");

    const actions: Record<string, () => void> = {
        log: () => {
            console.log("Hello from console.log", { frame: Math.round(elapsed / 16.67) });
        },
        info: () => {
            console.info("Assets loaded", { textures: 42, sounds: 7, fonts: ["Inter"] });
        },
        debug: () => {
            console.debug("pointer at %d, %d", Math.round(Math.random() * 800), Math.round(Math.random() * 450));
        },
        warn: () => {
            console.warn("Texture atlas is %d%% full", 80 + Math.round(Math.random() * 19));
        },
        error: () => {
            console.error(new TypeError("Cannot read properties of undefined (reading 'hp')"));
        },
        object: () => {
            const player = {
                name: "bunny",
                hp: 100,
                position: { x: 12, y: 34 },
                inventory: ["sword", "potion", "key"],
                stats: new Map([
                    ["str", 7],
                    ["dex", 12],
                ]),
                self: null as unknown,
            };
            player.self = player;
            console.log("player", player);
        },
        binary: () => {
            const scores: number[] = [];
            scores[0] = 1200;
            scores[3] = 900;
            const header = new ArrayBuffer(16);

            console.log("quad", new Float32Array([0, 0, 64, 0, 64, 64, 0, 64]), new Uint16Array([0, 1, 2, 0, 2, 3]));
            console.log("save file", header, new DataView(header, 4, 8));
            console.log("high scores", scores);
        },
        cause: () => {
            // One made-up frame per stack, so the whole chain fits in the console.
            const at = <T extends Error>(error: T, frame: string): T =>
                Object.assign(error, { stack: `${error.name}: ${error.message}\n    at ${frame}` });
            const mirrors = new AggregateError(
                [
                    at(new Error("cdn-a.example.com answered 503"), "fetchLevel (net.ts:8:11)"),
                    at(new Error("cdn-b.example.com timed out"), "fetchLevel (net.ts:8:11)"),
                ],
                "All mirrors failed",
            );
            const error = new Error("Could not load level 3", { cause: at(mirrors, "loadMirrors (levels.ts:14:9)") });

            console.error(Object.assign(at(error, "loadLevel (levels.ts:27:11)"), { code: "LEVEL_LOAD" }));
        },
        throw: () => {
            setTimeout(() => {
                throw new Error("Boss is not defined");
            });
        },
        reject: () => {
            void Promise.reject(new Error("Network request failed (503)"));
        },
        repeat: () => {
            for (let i = 0; i < 10; i++) console.log("tick");
        },
        spam: () => {
            const start = performance.now();
            for (let i = 0; i < 5000; i++) console.debug(`particle #${i}`, { x: i % 800, y: (i * 7) % 450 });
            console.info(`5000 logs in ${Math.round(performance.now() - start)} ms, only one screenful is drawn`);
        },
        clear: () => {
            console.clear();
        },
        toggle: () => {
            pixiConsole?.toggle();
        },
    };

    document.querySelector("#controls")?.addEventListener("click", (event) => {
        const action = (event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
        if (action) actions[action]?.();
    });

    // Plain execute() and focusPrompt() calls, as the caption says. execute() doesn't open a closed
    // console, so show() does, or the output would stay hidden. focusPrompt() opens it by itself, and
    // runs inside the click handler, so phones open the on-screen keyboard.
    document.querySelector("#command-line")?.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");

        if (!button || !pixiConsole) return;

        if (button.dataset.line) {
            pixiConsole.show();
            void pixiConsole.execute(button.dataset.line);
        } else if ("focus" in button.dataset) {
            pixiConsole.focusPrompt();
        }
    });

    document.querySelector("#settings")?.addEventListener("change", (event) => {
        const input = event.target as HTMLInputElement;

        if (input.name === "textRenderer") {
            settings.textRenderer = input.value as Settings["textRenderer"];
            mount();
        } else if (input.name === "maxEntries") {
            settings.maxEntries = Number(input.value);
            apply("maxEntries");
        } else if (input.name in settings) {
            const name = input.name as Exclude<RuntimeSetting, "maxEntries">;

            settings[name] = input.checked;
            apply(name);
        }

        syncControls();
    });

    document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
            void navigator.clipboard.writeText(button.dataset.copy ?? "").then(() => {
                button.classList.add("copied");
                setTimeout(() => button.classList.remove("copied"), 1200);
            });
        });
    });
}

/** The commands both the playground and the GIF use. */
function demoCommands(app: Application): Record<string, ConsoleCommand> {
    return {
        speed: {
            usage: "[multiplier]",
            description: "Shows or sets the animation speed",
            run: ([multiplier]) => {
                if (multiplier === undefined) return `Speed is ${app.ticker.speed}`;

                const speed = Number(multiplier);

                if (!Number.isFinite(speed) || speed < 0) throw new RangeError(`"${multiplier}" is not a speed`);

                app.ticker.speed = speed;

                return `Speed set to ${speed}`;
            },
        },
        fps: { description: "Shows the frame rate", run: () => app.ticker.FPS.toFixed(1) },
    };
}

function consoleLayout(screen: { width: number; height: number }) {
    const height = Math.round(screen.height * 0.55);

    return { x: 0, y: screen.height - height, width: screen.width, height };
}

function renderSnippet(settings: Settings): void {
    const target = document.querySelector("#snippet");

    if (!target) return;

    const options: string[] = [];
    const evaluate = settings.prompt && settings.evaluator;

    if (settings.textRenderer !== "bitmap") options.push(`textRenderer: "${settings.textRenderer}",`);
    if (settings.timestamps) options.push("timestamps: true,");
    if (!settings.collapseRepeats) options.push("collapseRepeats: false,");
    if (settings.maxEntries !== DEFAULT_OPTIONS.maxEntries) options.push(`maxEntries: ${settings.maxEntries},`);
    if (!settings.toolbar) options.push("toolbar: false,");
    if (settings.prompt) options.push("prompt: true,");
    // The command-line buttons run these through execute(), which works with the prompt off too.
    options.push(
        "commands: {",
        '    speed: ([x = "1"]) => (app.ticker.speed = Number(x)),',
        "    fps: () => app.ticker.FPS.toFixed(1),",
        "},",
    );
    if (evaluate) {
        options.push("evaluator: import.meta.env.DEV", "    ? createJsEvaluator({ scope: { app } })", "    : null,");
    }
    options.push("autoResize: { renderer: app.renderer },");

    const code = [
        `import { ${evaluate ? "createJsEvaluator, " : ""}PixiConsole } from "pixi-console";`,
        ``,
        `const devConsole = new PixiConsole({`,
        ...options.map((line) => `    ${line}`),
        `});`,
        `app.stage.addChild(devConsole);`,
    ].join("\n");

    target.innerHTML = highlight(code);
}

function highlight(code: string): string {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return escaped.replace(
        /("[^"]*")|\b(import|from|const|new|true|false|null)\b|\b([A-Z][a-z]\w*|createJsEvaluator)\b/g,
        (match, string: string | undefined, keyword: string | undefined) => {
            if (string) return `<span class="tok-string">${match}</span>`;
            if (keyword) return `<span class="tok-keyword">${match}</span>`;
            return `<span class="tok-type">${match}</span>`;
        },
    );
}

// ---------------------------------------------------------------- GIF recording mode

/**
 * Deterministic mode used by `scripts/record-gif.mjs`: the ticker is stopped and the recorder
 * advances time frame by frame through `window.__demo.step(ms)`.
 */
async function startRecording(width: number, height: number): Promise<void> {
    document.body.className = "recording";
    document.body.replaceChildren();

    const app = new Application();
    await app.init({ width, height, background: "#0b0d14", antialias: true, autoStart: false, preference: "webgl" });
    document.body.appendChild(app.canvas);

    const updateScene = createScene(app);
    const pixiConsole = new PixiConsole({
        visible: true,
        toggleKey: null,
        fontSize: 15,
        prompt: true,
        commands: demoCommands(app),
        autoResize: { renderer: app.renderer, layout: consoleLayout },
    });
    app.stage.addChild(pixiConsole);

    const bossError = new TypeError("Cannot read properties of undefined (reading 'hp')");
    bossError.stack = `${bossError.name}: ${bossError.message}\n    at Boss.update (boss.ts:42:17)\n    at Game.tick (game.ts:118:9)`;

    type Cue = [at: number, run: () => void];

    const setPrompt = (value: string) => {
        if (pixiConsole.promptElement) pixiConsole.promptElement.value = value;
    };
    // Types a line into the command line, a key every 80 ms, then runs it the way Enter does.
    const type = (at: number, line: string): Cue[] => [
        ...Array.from(line, (_, i): Cue => [at + i * 80, () => setPrompt(line.slice(0, i + 1))]),
        [
            at + line.length * 80 + 250,
            () => {
                setPrompt("");
                void pixiConsole.execute(line);
            },
        ],
    ];

    const timeline: Cue[] = [
        [300, () => console.log(`Game booted with PixiJS v${VERSION} (${app.renderer.name})`)],
        [800, () => console.info("Assets loaded", { textures: 42, sounds: 7 })],
        [1300, () => console.log("player", { name: "bunny", hp: 100, pos: { x: 12, y: 34 } })],
        ...Array.from({ length: 6 }, (_, i): Cue => [1800 + i * 120, () => console.log("tick")]),
        [2700, () => console.warn("Texture atlas is %d%% full", 92)],
        [3200, () => console.debug("pointerdown at", { x: 312, y: 188 })],
        [
            3800,
            () =>
                setTimeout(() => {
                    throw bossError;
                }),
        ],
        [4700, () => (pixiConsole.filter = ["warn", "error"] satisfies LogLevel[])],
        [5700, () => (pixiConsole.filter = ["log", "info", "debug", "warn", "error"])],
        ...type(5900, "help"),
        ...type(7000, "speed 0.5"),
    ];

    let elapsed = 0;
    let sceneTime = 0;
    let next = 0;

    const step = (ms: number) => {
        elapsed += ms;
        // The `speed` command sets the ticker's speed. The ticker is stopped here, so apply it by hand.
        sceneTime += ms * app.ticker.speed;
        while (next < timeline.length && elapsed >= (timeline[next]?.[0] ?? Infinity)) timeline[next++]?.[1]();
        updateScene(sceneTime);
        app.render();
    };

    step(0);
    Object.assign(window, { __demo: { step } });
}
