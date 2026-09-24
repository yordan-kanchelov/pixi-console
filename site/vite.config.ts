import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "./",
    resolve: {
        alias: { "pixi-console": fileURLToPath(new URL("../src/index.ts", import.meta.url)) },
    },
    server: { forwardConsole: false },
    build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
