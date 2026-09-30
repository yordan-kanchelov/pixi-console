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
        // Ignore-list every source (`x_google_ignoreList`), so DevTools show the caller of a captured console call
        // instead of pixi-console's wrapper. Applies when the app's bundler chains these source maps.
        outputOptions: { sourcemapIgnoreList: true },
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
        // Same ignore list. <script> users load this map directly, so it always applies.
        outputOptions: { globals: { "pixi.js": "PIXI" }, sourcemapIgnoreList: true },
    },
]);
