---
"pixi-console": patch
---

Fix input, rendering and formatting issues.

**Input.** Presses, taps and the wheel over the console no longer reach objects underneath it, such as a stage-wide "tap to shoot" handler. A release is only stopped when its press started on the console. The wheel no longer scrolls the page while it is over the console. Drags follow the pointer that started them, ignore right and middle clicks, and end when the browser cancels the pointer.

**Rendering.** The console is now a render group of its own, so a log no longer makes PixiJS rebuild the whole stage. Don't cache it, or an ancestor, with `cacheAsTexture`: it would stop updating. A hidden console skips layout entirely. Glyphs follow the renderer's resolution (unless `resolution` is set) and snap to whole pixels, so text stays sharp on high-DPI screens and after resolution changes. Bitmap fonts are uninstalled once no console uses them, and `autoResize` positions are rounded.

**Toolbar.** On narrow consoles the toolbar switches to compact labels (`E 3`) before it hides anything, then hides empty and less severe chips first, so errors and warnings stay in view. The clear and close buttons stay inside the console. Its labels use the bitmap font with `textRenderer: "canvas"` too.

**Scrolling.** Filter changes and re-wrapping after a resize keep the entry you were reading at the top of the view. Wrapped lines are cached per entry, so filter changes no longer wrap every message again.

**Formatting.** Typed arrays, `ArrayBuffer`, `DataView`, boxed primitives and sparse arrays print like in devtools, and large Maps, Sets and typed arrays are no longer read in full. Errors show their `cause` chain, `AggregateError` errors and own properties, and errors from other realms (iframes) are recognised. The formatter never throws: a value that can't be inspected prints as `[Name <unformattable: reason>]` instead of dropping the whole entry. Truncation never leaves half of a surrogate pair, such as half an emoji.

**Capture.** Benign `ResizeObserver loop` notices are no longer reported as uncaught errors (or open the console). Messages no longer read "Uncaught Uncaught", a cross-origin "Script error." explains why it has no details, and errors are also captured in web workers. A failure while capturing is reported with `console.error` instead of being lost.

**Options.** `undefined` values, also inside `colors` and `format`, keep the default: `format: { maxLength: undefined }` no longer turns every message into "…". A `NaN` or non-number `maxEntries` or format limit falls back to its default, and `DEFAULT_OPTIONS.format` no longer shares its object with `DEFAULT_FORMAT_OPTIONS`.

**API.** `onRender` is free for your own code: setting it no longer stops the console from updating. Setters and methods do nothing after `destroy()`; before, `resize()` threw and `captureConsole = true` patched `console` again for good. The `counts` and `LogEntry` docs are corrected.

**Source maps.** The published source maps ignore-list pixi-console, so for `<script>` users DevTools shows where `console.log` was called rather than pixi-console's wrapper.
