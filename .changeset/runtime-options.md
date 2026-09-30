---
"pixi-console": minor
---

Change more options at runtime, and type entries properly.

**Runtime setters.** `timestamps`, `collapseRepeats`, `maxEntries` and `toolbar` can now be changed after construction, like `filter` already could. Turning on `timestamps` shows the time each entry was logged, lowering `maxEntries` drops the oldest entries right away, and the toolbar can be added or removed at any time.

**Types.** The new `ConsoleEntry` type describes what `entries` holds, including the `color` set by `print()` and the new `kind`. `entries` is documented as a live view: copy it (`[...devConsole.entries]`) to keep a snapshot. `EntryKind` is exported too, and `PixiConsoleInit` is now an interface, so the API reference lists every constructor option with its default.
