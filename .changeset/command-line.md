---
"pixi-console": minor
---

Add an optional command line (#19).

`prompt: true` shows an input under the log. It is a native `<input>` placed over the canvas, so on-screen keyboards, IME and paste work on phones, tablets and TVs. It has history (↑/↓) and Tab completion, and keys typed into it never reach your game or the toggle key; opening the console with the toggle key focuses it.

Lines run commands: `help` and `clear` are built in, add your own with the `commands` option or `addCommand()`, and run a line from code with `execute()`. Command-line entries carry `kind: "input" | "result"`, are always displayed and are not counted. `prompt`, `evaluator` and `history` can be changed at runtime, so a saved history can be restored, and `focusPrompt()`, `blurPrompt()`, `promptElement` and `lastResult` round it off.

Evaluating JavaScript is opt-in with `evaluator: createJsEvaluator({ scope })`. It needs a Content-Security-Policy that allows `'unsafe-eval'` (the console explains when it is blocked), and should stay out of production builds. Bundles that don't import `createJsEvaluator` contain no `eval`.

Also fixes typing into an input inside a shadow root toggling the console.
