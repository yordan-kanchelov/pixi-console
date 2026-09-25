# pixi-console

**An in-canvas developer console for PixiJS v8.** It shows `console.log`, warnings and uncaught errors on top of your scene, so you can debug on phones, tablets and TVs without devtools.

### [▶ Live preview](https://yordan-kanchelov.github.io/pixi-console/) · [API reference](https://yordan-kanchelov.github.io/pixi-console/api/)

[![pixi-console demo](https://raw.githubusercontent.com/yordan-kanchelov/pixi-console/master/img/demo.gif)](https://yordan-kanchelov.github.io/pixi-console/)

## Features

- Captures `log`, `info`, `debug`, `warn`, `error`, `console.clear()`, uncaught errors and unhandled rejections. Devtools keep working as usual.
- Formats output like devtools: `%s %d %o` substitutions, pretty-printed objects (circular references included) and errors with stacks.
- Stays fast with thousands of logs. Only the visible lines are drawn, using `BitmapText`, and repeated messages collapse into `message (×12)`.
- Includes a toolbar with level filters and counters. Scroll with the wheel or by dragging. It opens on errors, and <kbd>&#96;</kbd> toggles it.
- `autoResize` follows window resizes and orientation changes.
- No dependencies besides `pixi.js`. Ships ESM, CommonJS and a `<script>` build, with TypeScript types.

## Quick start

```sh
npm install pixi-console
```

```ts
import { Application } from "pixi.js";
import { PixiConsole } from "pixi-console";

const app = new Application();
await app.init({ resizeTo: window });
document.body.appendChild(app.canvas);

const devConsole = new PixiConsole({ autoResize: { renderer: app.renderer } });
app.stage.addChild(devConsole); // add it last so it renders on top

console.log("Hello from the canvas!", { answer: 42 });
devConsole.show(); // hidden until shown, toggled with ` or an error
```

<details>
<summary><b>Script tag</b></summary>

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-console@5"></script>
<script type="module">
  const app = new PIXI.Application();
  await app.init({ resizeTo: window });
  document.body.appendChild(app.canvas);

  const devConsole = new PixiConsole.PixiConsole({ visible: true, autoResize: { renderer: app.renderer } });
  app.stage.addChild(devConsole);
</script>
```

</details>

<details>
<summary><b>Development builds only</b></summary>

With Vite (use your bundler's flag elsewhere, e.g. `process.env.NODE_ENV !== "production"`):

```ts
if (import.meta.env.DEV) {
  const { PixiConsole } = await import("pixi-console");
  app.stage.addChild(new PixiConsole({ autoResize: { renderer: app.renderer } }));
}
```

</details>

## Options

Every option is optional. These are the common ones:

| Option           | Default       | Description                                                                                       |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `width`/`height` | `800`/`400`   | Size in pixels. Change it later with `resize()`.                                                  |
| `autoResize`     | `null`        | `{ renderer, layout? }` follows the screen. `layout(screen)` returns `{ x?, y?, width, height }`. |
| `visible`        | `false`       | Start visible.                                                                                    |
| `captureConsole` | `true`        | `true`, `false` or a list of levels to capture.                                                   |
| `showOnError`    | `true`        | Show the console when an error is logged or thrown.                                               |
| `toggleKey`      | `"Backquote"` | Key that toggles the console, or `null`.                                                          |
| `textRenderer`   | `"bitmap"`    | `"canvas"` uses `Text`, which is better for CJK and colour emoji.                                 |

<details>
<summary><b>All options</b></summary>

| Option            | Default              | Description                                                                              |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `captureErrors`   | `true`               | Capture uncaught errors and unhandled rejections.                                        |
| `captureClear`    | `true`               | Clear when `console.clear()` is called.                                                  |
| `filter`          | all levels           | Levels that are displayed.                                                               |
| `maxEntries`      | `1000`               | History size. The oldest entries are dropped first.                                      |
| `collapseRepeats` | `true`               | Merge consecutive identical messages.                                                    |
| `timestamps`      | `false`              | Prefix entries with `HH:MM:SS.mmm`.                                                      |
| `format`          | `{ depth: 2, … }`    | `depth`, `indent`, `maxItems`, `maxLength` for formatting values.                        |
| `fontFamily`      | `Menlo, Consolas, …` | Monospace font stack.                                                                    |
| `fontSize`        | `14`                 |                                                                                          |
| `lineHeight`      | `fontSize * 1.4`     |                                                                                          |
| `resolution`      | `devicePixelRatio`   | Glyph resolution.                                                                        |
| `padding`         | `8`                  |                                                                                          |
| `colors`          | GitHub-dark palette  | Text colour per level.                                                                   |
| `backgroundColor` | `0x0d1117`           |                                                                                          |
| `backgroundAlpha` | `0.85`               |                                                                                          |
| `toolbar`         | `true`               | Level filters with counters, clear and close buttons.                                    |
| `interactive`     | `true`               | Wheel/drag scrolling and buttons. `false` lets pointer events pass through to your game. |

</details>

## API

`PixiConsole` is a PixiJS `Container`. Besides the container API, it has:

```ts
devConsole.log("fps", 60).warn("careful").error(new Error("boom")); // log without the browser console
devConsole.print("custom colour", "hotpink");
devConsole.clear();
devConsole.show() / hide() / toggle();
devConsole.scrollUp(3) / scrollDown() / scrollBy(-120) / scrollToTop() / scrollToBottom();
devConsole.resize(1024, 300);
devConsole.filter = ["warn", "error"]; // also: captureConsole, captureErrors, showOnError, toggleKey, autoResize
devConsole.entries; // [{ id, level, message, timestamp, count }]
devConsole.destroy(); // restores console and removes every listener
```

You can create several consoles at once. See the [API reference](https://yordan-kanchelov.github.io/pixi-console/api/) for everything else.

## Migrating from v4

v5 is a rewrite for PixiJS v8. Stay on `pixi-console@4` for PixiJS v6 or v7 (v5 → 3.x, v4 → 2.5.x).

<details>
<summary><b>v4 → v5 changes</b></summary>

| v4                                                | v5                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `new PixiConsole(new PixiConsoleConfig())`        | `new PixiConsole({ ...options })`                                       |
| Singleton, `getInstance()`                        | Any number of instances. Keep a reference yourself.                     |
| `consoleWidth` / `consoleHeight` options          | `width` / `height` and `resize()`                                       |
| `fontColor`, `fontWarningColor`, `fontErrorColor` | `colors: { log, info, debug, warn, error }`                             |
| `eventsConfig: { log, warn, error }`              | `captureConsole: true \| LogLevel[]`                                    |
| `stringifyObjects`, `showCaller`                  | Objects are always formatted. `showCaller` is removed.                  |
| `print(message, color?, fontSize?)`               | `print(message, color?)`                                                |
| `clearConsole()`, `dispose()`                     | `clear()`, `destroy()`                                                  |
| `scrollUp(times, step)`                           | `scrollUp(lines)`, `scrollBy(px)`                                       |
| `isHidden`                                        | `visible`                                                               |
| `dist/pixi-console.umd.js`                        | `dist/pixi-console.iife.js` (global `PixiConsole`, needs global `PIXI`) |

</details>

## Contributing

```sh
npm install
npm run dev    # playground at http://localhost:5173
npm test       # unit tests + rendering tests in headless Chromium
npm run lint
```

Every PR that changes the package needs a [changeset](https://github.com/changesets/changesets) (`npx changeset`). Merging the "chore: version packages" PR publishes to npm.

## License

[MIT](./LICENSE)
