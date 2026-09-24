# pixi-console

[![npm](https://img.shields.io/npm/v/pixi-console?color=ff4f9a)](https://www.npmjs.com/package/pixi-console)
[![CI](https://github.com/yordan-kanchelov/pixi-console/actions/workflows/pr.yml/badge.svg)](https://github.com/yordan-kanchelov/pixi-console/actions/workflows/pr.yml)
[![pixi.js](https://img.shields.io/npm/dependency-version/pixi-console/peer/pixi.js?label=pixi.js)](https://pixijs.com)
[![bundle size](https://img.shields.io/bundlephobia/minzip/pixi-console)](https://bundlephobia.com/package/pixi-console)
[![license](https://img.shields.io/npm/l/pixi-console)](./LICENSE)

**An in-canvas developer console for PixiJS v8.** It captures `console.log`, warnings and uncaught errors and draws them on top of your scene. Use it to debug games on phones, tablets and TVs where you can't open devtools.

![pixi-console demo](https://raw.githubusercontent.com/yordan-kanchelov/pixi-console/master/img/demo.gif)

**[Live playground](https://yordan-kanchelov.github.io/pixi-console/)** · **[API reference](https://yordan-kanchelov.github.io/pixi-console/api/)**

## Features

- **Captures everything.** It captures `log`, `info`, `debug`, `warn` and `error`, plus uncaught errors, unhandled promise rejections and `console.clear()`. Your devtools keep working as usual.
- **Reads like devtools.** It supports `%s %d %i %f %o %O %c` substitutions. Objects, arrays, `Map`s and `Set`s are pretty-printed with circular-reference protection, and errors print with their stack.
- **Collapses repeats.** Consecutive identical messages are merged into a single `message (×12)` line.
- **Fast.** Rendering is virtualized: only the visible lines exist as display objects. They are drawn with `BitmapText` from a single glyph atlas and laid out at most once per frame, so thousands of logs cost the same as a screenful.
- **Touch friendly.** You can scroll with the wheel or by dragging. The toolbar has per-level filters with counters, a clear button and a close button. It sticks to the newest line until you scroll up.
- **Opens on errors.** The console shows itself when an error is logged or thrown. Press <kbd>`</kbd> to toggle it.
- **Fits any screen.** `autoResize` follows the renderer across window resizes and orientation changes.
- **Tiny and typed.** It has no runtime dependencies besides `pixi.js`, and ships ESM, CommonJS and a `<script>` build with TypeScript types.

## Installation

```sh
npm install pixi-console
```

`pixi.js` v8 is a peer dependency. For older PixiJS versions, see [compatibility](#compatibility).

## Quick start

```ts
import { Application } from "pixi.js";
import { PixiConsole } from "pixi-console";

const app = new Application();
await app.init({ resizeTo: window });
document.body.appendChild(app.canvas);

const devConsole = new PixiConsole({
  autoResize: { renderer: app.renderer }, // cover the screen and follow resizes
});
app.stage.addChild(devConsole); // add it last so it renders on top

console.log("Hello from the canvas!", { answer: 42 });
devConsole.show(); // it's hidden until shown, toggled with ` or an error happens
```

Only enable it in development builds:

```ts
if (import.meta.env.DEV) {
  const { PixiConsole } = await import("pixi-console");
  app.stage.addChild(new PixiConsole({ autoResize: { renderer: app.renderer } }));
}
```

### Placing the console

Pass a `layout` to put the console anywhere. It runs on every renderer resize:

```ts
new PixiConsole({
  autoResize: {
    renderer: app.renderer,
    // bottom 40% of the screen
    layout: (screen) => ({ y: screen.height * 0.6, width: screen.width, height: screen.height * 0.4 }),
  },
});
```

Or position it yourself: it is a regular `Container`.

```ts
const devConsole = new PixiConsole({ width: 600, height: 300 });
devConsole.position.set(20, 20);
devConsole.resize(800, 400); // later, re-wraps text
```

### Script tag

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-console@5"></script>
<script>
  const devConsole = new PixiConsole.PixiConsole({ visible: true });
  app.stage.addChild(devConsole);
</script>
```

## Options

All options are optional.

| Option            | Type                                     | Default              | Description                                                                                                           |
| ----------------- | ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `width`, `height` | `number`                                 | `800`, `400`         | Size in pixels. Change it later with `resize()`.                                                                      |
| `visible`         | `boolean`                                | `false`              | Start visible.                                                                                                        |
| `captureConsole`  | `boolean \| LogLevel[]`                  | `true`               | Which `console` methods to capture.                                                                                   |
| `captureErrors`   | `boolean`                                | `true`               | Capture uncaught errors and unhandled rejections.                                                                     |
| `captureClear`    | `boolean`                                | `true`               | Clear when `console.clear()` is called.                                                                               |
| `showOnError`     | `boolean`                                | `true`               | Show the console when an error is logged or thrown.                                                                   |
| `filter`          | `LogLevel[]`                             | all levels           | Levels that are displayed.                                                                                            |
| `maxEntries`      | `number`                                 | `1000`               | History size. The oldest entries are dropped first.                                                                   |
| `collapseRepeats` | `boolean`                                | `true`               | Merge consecutive identical messages.                                                                                 |
| `timestamps`      | `boolean`                                | `false`              | Prefix entries with `HH:MM:SS.mmm`.                                                                                   |
| `format`          | `{ depth, indent, maxItems, maxLength }` | `{ 2, 0, 50, 4000 }` | How values are turned into text. `indent > 0` pretty-prints objects over several lines.                               |
| `textRenderer`    | `"bitmap" \| "canvas"`                   | `"bitmap"`           | `BitmapText` (fast) or `Text` (better for CJK and colour emoji).                                                      |
| `fontFamily`      | `string`                                 | `Menlo, Consolas, …` | Monospace font stack.                                                                                                 |
| `fontSize`        | `number`                                 | `14`                 |                                                                                                                       |
| `lineHeight`      | `number`                                 | `fontSize * 1.4`     |                                                                                                                       |
| `resolution`      | `number`                                 | `devicePixelRatio`   | Glyph resolution.                                                                                                     |
| `padding`         | `number`                                 | `8`                  |                                                                                                                       |
| `colors`          | `Partial<Record<LogLevel, ColorSource>>` | GitHub-dark palette  | Text colour per level.                                                                                                |
| `backgroundColor` | `ColorSource`                            | `0x0d1117`           |                                                                                                                       |
| `backgroundAlpha` | `number`                                 | `0.85`               |                                                                                                                       |
| `toolbar`         | `boolean`                                | `true`               | Show level filters with counters, clear and close buttons.                                                            |
| `interactive`     | `boolean`                                | `true`               | Wheel/drag scrolling and toolbar buttons. `false` lets pointer events pass through to your game.                      |
| `toggleKey`       | `string \| null`                         | `"Backquote"`        | `KeyboardEvent.code` or `.key` that toggles the console.                                                              |
| `autoResize`      | `{ renderer, layout? } \| null`          | `null`               | Follow the renderer's screen size. `layout(screen)` returns `{ x?, y?, width, height }`, and defaults to full screen. |

`LogLevel` is `"log" | "info" | "debug" | "warn" | "error"`.

## API

`PixiConsole` extends PixiJS's `Container`, so everything a container can do works too.

```ts
// write without touching the browser console
devConsole.log("fps", 60).info("ready").debug({ x: 1 }).warn("careful").error(new Error("boom"));
devConsole.print("custom colour", "hotpink");
devConsole.clear();

// visibility
devConsole.show();
devConsole.hide();
devConsole.toggle();

// scrolling
devConsole.scrollUp(3); // lines
devConsole.scrollDown();
devConsole.scrollBy(-120); // pixels
devConsole.scrollToTop();
devConsole.scrollToBottom(); // and keep following new entries

// runtime configuration
devConsole.filter = ["warn", "error"];
devConsole.captureConsole = ["error"]; // or true / false
devConsole.captureErrors = false;
devConsole.showOnError = false;
devConsole.toggleKey = "F2";
devConsole.autoResize = { renderer: app.renderer };
devConsole.resize(1024, 300);

// state
devConsole.entries; // [{ id, level, message, timestamp, count }]
devConsole.counts; // { log: 3, info: 0, debug: 0, warn: 1, error: 0 }
devConsole.isFollowing;

// restores console, removes listeners and frees GPU resources
devConsole.destroy();
```

You can create several consoles. Each one captures independently, and `console` is only restored when the last one is destroyed. The formatter is exported as well, for reuse: `formatArgs(["%s is %d", "x", 1])` returns `"x is 1"`.

## Migrating from v4

v5 is a rewrite for PixiJS v8. The main changes:

| v4                                                       | v5                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| pixi.js v6 / v7                                          | pixi.js **v8** only                                                                    |
| `new PixiConsole(config)` with `new PixiConsoleConfig()` | `new PixiConsole({ ...options })` with a plain object. `PixiConsoleConfig` is removed. |
| Singleton: a second instance threw, `getInstance()`      | Create as many as you like. Keep a reference yourself.                                 |
| `consoleWidth` / `consoleHeight` options and setters     | `width` / `height` options and `resize(width, height)`. The getters still exist.       |
| `fontColor`, `fontWarningColor`, `fontErrorColor`        | `colors: { log, info, debug, warn, error }`                                            |
| `eventsConfig: { log, warn, error }`                     | `captureConsole: true \| LogLevel[]` (also settable at runtime)                        |
| `stringifyObjects`                                       | Always on: objects are formatted like devtools. Tune it with `format`.                 |
| `showCaller`                                             | Removed. It was unreliable across browsers and bundlers.                               |
| `scrollingYStep`, `textStartingX/Y`, `textYSpacing`      | `padding`, `lineHeight`. Scrolling is by lines or pixels.                              |
| `print(message, color?, fontSize?)`                      | `print(message, color?)`                                                               |
| `clearConsole()`                                         | `clear()`                                                                              |
| `scrollUp(times, step)` / `scrollDown(times, step)`      | `scrollUp(lines)` / `scrollDown(lines)`, `scrollBy(px)`, `scrollToTop/Bottom()`        |
| `dispose()`                                              | `destroy()`. It also restores `console` and removes listeners.                         |
| `isHidden` (returned the wrong value)                    | `visible`                                                                              |
| `dist/pixi-console.umd.js`                               | `dist/pixi-console.iife.js` (global `PixiConsole`, needs global `PIXI`)                |

## Compatibility

| pixi.js | pixi-console                                                                              |
| ------- | ----------------------------------------------------------------------------------------- |
| v8      | 5.x                                                                                       |
| v6, v7  | 4.x                                                                                       |
| v5      | 3.x                                                                                       |
| v4      | 2.5.x ([`pixi-v4` branch](https://github.com/yordan-kanchelov/pixi-console/tree/pixi-v4)) |

## Development

```sh
npm install
npm run dev          # playground at http://localhost:5173
npm test             # unit tests (jsdom) + rendering tests in headless Chromium
npm run lint         # eslint + prettier
npm run build        # dist/: ESM, CJS, IIFE and types
npm run build:site   # site/dist: playground + API reference (deployed to GitHub Pages)
npm run record:gif   # re-record img/demo.gif
```

The browser tests and the GIF recorder need Chromium: run `npx playwright install chromium`, or point `PW_CHROMIUM_PATH` at an existing binary.

Releases use [Changesets](https://github.com/changesets/changesets). Every PR that changes the package needs a changeset: run `npx changeset`, or `npx changeset --empty` for changes that don't need a release. The Release workflow keeps a "chore: version packages" PR up to date, and merging it publishes to npm and creates the GitHub release.

## Contributing

Issues and pull requests are welcome. Please [open an issue](https://github.com/yordan-kanchelov/pixi-console/issues/new/choose) first for larger changes.

## License

[MIT](./LICENSE)
