# pixi-console

## 5.0.0

### Major Changes

- 5274ef0: **Breaking: pixi-console is rewritten for PixiJS v8.** `pixi.js` ^8 is now the only supported peer dependency. Stay on `pixi-console@4` for PixiJS v6 or v7.
  
  **New API.** The constructor takes a plain options object (`new PixiConsole({ width, height, colors, ... })`) instead of a `PixiConsoleConfig` instance. The singleton is gone: create as many consoles as you like, and each one captures independently. `destroy()` replaces `dispose()`. It restores `console`, removes every listener and frees the console's display objects. `clearConsole()` is now `clear()`. `scrollUp`/`scrollDown` take a number of lines, and `scrollBy`, `scrollTo`, `scrollToTop` and `scrollToBottom` are new. `isHidden` returned the wrong value and is removed; use `visible`. The README has a full v4 → v5 migration table.
  
  **Capture.** `log`, `info`, `debug`, `warn` and `error` are captured, along with `console.clear()`, uncaught errors and unhandled promise rejections. Several consoles, or another library, can patch `console` at the same time without clobbering each other. Logging never throws into your code any more. v4 crashed on `null`, symbols and null-prototype objects.
  
  **Formatting like devtools.** It supports `%s %d %i %f %o %O %c` substitutions. Objects, arrays, Maps and Sets are printed with circular-reference and depth protection, and errors print with their stack. Consecutive identical messages collapse into `message (×N)`, and timestamps are optional.
  
  **Rendering.** Output is virtualized, with a pool of `BitmapText` rows sized to one screenful (`textRenderer: "canvas"` switches to `Text`). History is bounded by `maxEntries`, and layout happens at most once per frame. A toolbar has per-level filters with counters, clear and close buttons. Scrolling works with the wheel or by dragging and sticks to the newest line. It also adds a toggle key (<kbd>&#96;</kbd>), opening on errors, and `autoResize`, which follows the renderer across resizes and orientation changes.
  
  **Packaging.** The package ships ESM, CommonJS and type declarations through an `exports` map, plus `dist/pixi-console.iife.js` for `<script>` tags. The IIFE exposes the global `PixiConsole` and needs the global `PIXI`. It replaces `pixi-console.umd.js`, whose `pixi.js` lookup never worked outside a bundler.

## [4.0.0] - 25.12.2023
### Changed
- Pixi.js v7 support alongside v6.
- Build moved from rollup to webpack.

## [3.0.1] - 11.05.2019
- Update README.md with more information about versioning and pixi.js compatibility
 
## [3.0.0] - 11.05.2019
### Changed 
- Pixi.js v5 is now supported. 
- Pixi.js v4 support code is now in separate [branch](https://github.com/jkanchelov/pixi-console/tree/pixi-v4).
