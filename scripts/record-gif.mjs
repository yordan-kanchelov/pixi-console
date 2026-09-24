#!/usr/bin/env node
// Records the site's deterministic demo mode headlessly and writes img/demo.gif.
// Pure Node: Playwright screenshots + gifenc, no ffmpeg needed.
//
// Usage: npm run record:gif -- [--out img/demo.gif] [--fps 12] [--seconds 9] [--width 800] [--height 450]
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium instead of `npx playwright install chromium`.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import gifenc from "gifenc";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { createServer } from "vite";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const { values } = parseArgs({
    options: {
        out: { type: "string", default: "img/demo.gif" },
        fps: { type: "string", default: "12" },
        seconds: { type: "string", default: "9" },
        width: { type: "string", default: "800" },
        height: { type: "string", default: "450" },
    },
});

const fps = Number(values.fps);
const width = Number(values.width);
const height = Number(values.height);
const frames = Math.round(Number(values.seconds) * fps);
const root = resolve(import.meta.dirname, "..");

const server = await createServer({
    configFile: resolve(root, "site/vite.config.ts"),
    server: { port: 0 },
    logLevel: "warn",
});
await server.listen();

// Software WebGL so recording works without a GPU (CI, containers).
const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

    page.on("pageerror", (error) => {
        if (process.env.DEBUG) console.log("[pageerror]", error.message);
    });

    await page.goto(`${server.resolvedUrls.local[0]}?record&w=${width}&h=${height}`);
    await page.waitForFunction(() => "__demo" in window, null, { timeout: 30_000 });

    const canvas = page.locator("canvas");
    const delay = Math.round(1000 / fps);
    const captured = [];

    for (let i = 0; i < frames; i++) {
        await page.evaluate((ms) => window.__demo.step(ms), delay);
        // Let queued tasks (e.g. a scripted `setTimeout(() => { throw ... })`) run before capturing.
        await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
        captured.push(PNG.sync.read(await canvas.screenshot()).data);
        if (process.stdout.isTTY) process.stdout.write(`\rcaptured ${i + 1}/${frames}`);
    }

    // One palette for the whole animation, sampled from frames across the timeline...
    const samples = captured.filter((_, i) => i % Math.ceil(frames / 12) === 0 || i === frames - 1);
    const sampled = new Uint8Array(samples.reduce((size, frame) => size + frame.length, 0));
    samples.reduce((offset, frame) => (sampled.set(frame, offset), offset + frame.length), 0);
    const palette = quantize(sampled, 255, { format: "rgb565" });
    const transparentIndex = palette.length;
    palette.push([0, 0, 0]);

    // ...so unchanged pixels can be written as transparent, which compresses far better.
    const gif = GIFEncoder();
    let previous;

    for (const data of captured) {
        const indexed = applyPalette(data, palette, "rgb565");
        let pixels = indexed;

        if (previous) {
            pixels = indexed.map((index, i) => (index === previous[i] ? transparentIndex : index));
        }

        gif.writeFrame(pixels, width, height, {
            palette: previous ? undefined : palette,
            delay,
            transparent: previous !== undefined,
            transparentIndex,
            dispose: 1,
        });
        previous = indexed;
    }

    gif.finish();

    const out = resolve(root, values.out);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, gif.bytes());
    console.log(`\nwrote ${values.out} (${Math.round(gif.bytes().length / 1024)} kB)`);
} finally {
    await browser.close();
    await server.close();
}
