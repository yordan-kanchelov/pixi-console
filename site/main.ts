import "./style.css";

import { Application, VERSION } from "pixi.js";
import { PixiConsole, type LogLevel } from "pixi-console";

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
    toolbar: boolean;
}

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

    const settings: Settings = { textRenderer: "bitmap", timestamps: false, collapseRepeats: true, toolbar: true };
    let pixiConsole: PixiConsole | undefined;

    const mount = () => {
        const history = pixiConsole?.entries.map(({ level, message }) => ({ level, message })) ?? [];

        pixiConsole?.destroy();
        pixiConsole = new PixiConsole({
            visible: true,
            ...settings,
            autoResize: { renderer: app.renderer, layout: consoleLayout },
        });
        app.stage.addChild(pixiConsole);

        for (const { level, message } of history) pixiConsole[level](message);
        renderSnippet(settings);
    };

    mount();

    console.log(`pixi-console is capturing this page. PixiJS v${VERSION}, renderer: ${app.renderer.name}`);
    console.info("Press ` to toggle the console, scroll it with the wheel or by dragging.");

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

    document.querySelector("#settings")?.addEventListener("change", (event) => {
        const input = event.target as HTMLInputElement;

        if (input.name === "textRenderer") settings.textRenderer = input.value as Settings["textRenderer"];
        else if (input.name in settings) (settings as unknown as Record<string, boolean>)[input.name] = input.checked;

        mount();
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

function consoleLayout(screen: { width: number; height: number }) {
    const height = Math.round(screen.height * 0.55);

    return { x: 0, y: screen.height - height, width: screen.width, height };
}

function renderSnippet(settings: Settings): void {
    const target = document.querySelector("#snippet");

    if (!target) return;

    const options: string[] = [];

    if (settings.textRenderer !== "bitmap") options.push(`textRenderer: "${settings.textRenderer}",`);
    if (settings.timestamps) options.push("timestamps: true,");
    if (!settings.collapseRepeats) options.push("collapseRepeats: false,");
    if (!settings.toolbar) options.push("toolbar: false,");
    options.push("autoResize: { renderer: app.renderer },");

    const code = [
        `import { PixiConsole } from "pixi-console";`,
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
        /("[^"]*")|\b(import|from|const|new|true|false)\b|\b([A-Z]\w+)\b/g,
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
        autoResize: { renderer: app.renderer, layout: consoleLayout },
    });
    app.stage.addChild(pixiConsole);

    const bossError = new TypeError("Cannot read properties of undefined (reading 'hp')");
    bossError.stack = `${bossError.name}: ${bossError.message}\n    at Boss.update (boss.ts:42:17)\n    at Game.tick (game.ts:118:9)`;

    const timeline: [number, () => void][] = [
        [300, () => console.log(`Game booted with PixiJS v${VERSION} (${app.renderer.name})`)],
        [900, () => console.info("Assets loaded", { textures: 42, sounds: 7 })],
        [1500, () => console.log("player", { name: "bunny", hp: 100, pos: { x: 12, y: 34 } })],
        ...Array.from({ length: 6 }, (_, i): [number, () => void] => [2100 + i * 120, () => console.log("tick")]),
        [3000, () => console.warn("Texture atlas is %d%% full", 92)],
        [3600, () => console.debug("pointerdown at", { x: 312, y: 188 })],
        [
            4300,
            () =>
                setTimeout(() => {
                    throw bossError;
                }),
        ],
        [5400, () => (pixiConsole.filter = ["warn", "error"] satisfies LogLevel[])],
        [6600, () => (pixiConsole.filter = ["log", "info", "debug", "warn", "error"])],
        [7200, () => console.log("Recovered. Still running at 60 fps")],
    ];

    let elapsed = 0;
    let next = 0;

    const step = (ms: number) => {
        elapsed += ms;
        while (next < timeline.length && elapsed >= (timeline[next]?.[0] ?? Infinity)) timeline[next++]?.[1]();
        updateScene(elapsed);
        app.render();
    };

    step(0);
    Object.assign(window, { __demo: { step } });
}
