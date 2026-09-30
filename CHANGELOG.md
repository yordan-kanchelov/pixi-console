# pixi-console

## 5.1.0

### Minor Changes

- 0f8d336: Add an optional command line (#19).
  
  `prompt: true` shows an input under the log. It is a native `<input>` placed over the canvas, so on-screen keyboards, IME and paste work on phones, tablets and TVs. It has history (↑/↓) and Tab completion, and keys typed into it don't reach your game's `keydown` listeners (capture-phase ones still see them) or the toggle key. Opening the console with the toggle key focuses it when nothing else on the page has focus.
  
  Lines run commands: `help` and `clear` are built in, add your own with the `commands` option or `addCommand()`, and run a line from code with `execute()`. Command-line entries carry `kind: "input" | "result"`, are always displayed and are not counted. `prompt`, `evaluator` and `history` can be changed at runtime, so a saved history can be restored, and `focusPrompt()`, `blurPrompt()`, `promptElement` and `lastResult` round it off.
  
  Evaluating JavaScript is opt-in with `evaluator: createJsEvaluator({ scope })`. It needs a Content-Security-Policy that allows `'unsafe-eval'` (the console explains when it is blocked), and should stay out of production builds, like any evaluator of your own. pixi-console adds no `eval` to bundles that don't import `createJsEvaluator`.
  
  Also fixes typing into an input inside an open shadow root toggling the console.
- 0f8d336: Change more options at runtime, and type entries properly.
  
  **Runtime setters.** `timestamps`, `collapseRepeats`, `maxEntries` and `toolbar` can now be changed after construction, like `filter` already could. Turning on `timestamps` shows the time each entry was logged, lowering `maxEntries` drops the oldest entries right away, and the toolbar can be added or removed at any time.
  
  **Types.** The new `ConsoleEntry` type describes what `entries` holds, including the `color` set by `print()` and the new `kind`. `entries` is documented as a live view: copy it (`[...devConsole.entries]`) to keep a snapshot. `EntryKind` is exported too, and `PixiConsoleInit` is now an interface, so the API reference lists every constructor option with its default.

### Patch Changes

- 0f8d336: Fix input, rendering and formatting issues.
  
  **Input.** Presses, taps and the wheel over the console no longer reach objects underneath it, such as a stage-wide "tap to shoot" handler. A release over the console is only stopped when its press started there too, and a drag that starts on the console and ends outside it still delivers `pointerup` and the click/tap to what is underneath. The wheel no longer scrolls the page while it is over the console; zooming (ctrl+wheel or a trackpad pinch) and sideways scrolling are left to the browser. Drags follow the pointer that started them, ignore right and middle clicks, and end when the browser cancels the pointer.
  
  **Rendering.** The console is now a render group of its own, so a log no longer makes PixiJS rebuild the whole stage. Don't cache it, or an ancestor, with `cacheAsTexture`: it would stop updating. A hidden console skips layout entirely. Glyphs follow the renderer's resolution (unless `resolution` is set) and snap to whole pixels, so text stays sharp on high-DPI screens and after resolution changes. Bitmap fonts are uninstalled once no console uses them (on pixi.js 8.1.6 and later), and `autoResize` positions are rounded. `autoResize` also works on pixi.js 8.0, whose renderer emits no `resize` event (it used to throw there).
  
  **Toolbar.** On narrow consoles the toolbar switches to compact labels (`E 3`) before it hides anything, then hides empty and less severe chips first, so errors and warnings stay in view. The clear and close buttons stay inside the console. Its labels use the bitmap font with `textRenderer: "canvas"` too.
  
  **Scrolling.** Filter changes and re-wrapping after a resize keep the entry you were reading at the top of the view. Wrapped lines are cached per entry, so filter changes no longer wrap every message again.
  
  **Formatting.** Typed arrays, `ArrayBuffer`, `DataView`, boxed primitives and sparse arrays print like in devtools, and large Maps, Sets and typed arrays are no longer read in full. Errors show their `cause` chain, `AggregateError` errors and own properties, and errors from other realms (iframes) are recognised. The formatter never throws: a value that can't be inspected prints as `[Name <unformattable: reason>]` instead of dropping the whole entry. Truncation never leaves half of a surrogate pair, such as half an emoji.
  
  **Capture.** Benign `ResizeObserver loop` notices are no longer reported as uncaught errors (or open the console). Messages no longer read "Uncaught Uncaught", a cross-origin "Script error." explains why it has no details, and errors are also captured in web workers. A failure while capturing is reported with `console.error` instead of being lost.
  
  **Options.** `undefined` values, also inside `colors` and `format`, keep the default: `format: { maxLength: undefined }` no longer turns every message into "…". A `NaN` or non-number `maxEntries` or format limit falls back to its default, and `DEFAULT_OPTIONS.format` no longer shares its object with `DEFAULT_FORMAT_OPTIONS`.
  
  **API.** `onRender` is free for your own code: setting it no longer stops the console from updating. Setters and methods do nothing after `destroy()`; before, `resize()` threw and `captureConsole = true` patched `console` again for good. The `counts` and `LogEntry` docs are corrected.
  
  **Source maps.** The published source maps ignore-list pixi-console, so for `<script>` users DevTools shows where `console.log` was called rather than pixi-console's wrapper.

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
