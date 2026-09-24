import { defineConfig } from "tsdown";

export default defineConfig([
    // npm consumers: ESM + CJS with type declarations. pixi.js is a peer dependency and stays external.
    {
        entry: ["src/index.ts"],
        format: ["esm", "cjs"],
        platform: "browser",
        target: "es2022",
        dts: true,
        sourcemap: true,
        clean: true,
    },
    // <script> / CDN build: exposes `window.PixiConsole` and expects pixi.js as the global `PIXI`.
    {
        entry: { "pixi-console": "src/index.ts" },
        format: ["iife"],
        platform: "browser",
        target: "es2022",
        globalName: "PixiConsole",
        minify: true,
        sourcemap: true,
        dts: false,
        clean: false,
        outputOptions: { globals: { "pixi.js": "PIXI" } },
    },
]);
