![](https://github.com/jkanchelov/pixi-console/blob/master/img/example.png?raw=true)

# Pixi-console

Console class for PIXI useful for developing mobile game.

By default attaches itself to console log and error and will show itself if error is occurred.

## Table of Contents

- [Pixi-console](#pixi-console)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Support](#support)
  - [Contributing](#contributing)

## Installation

```javascript
npm install pixi-console
```

## Usage

```javascript
import { PixiConsole, PixiConsoleConfig } from "pixi-console";

const consoleConfig = new PixiConsoleConfig();
consoleConfig.consoleWidth = 800;
consoleConfig.consoleHeight = 600;

const pixiConsole = new PixiConsole(consoleConfig);

stage.addChild(pixiConsole);

pixiConsole == PixiConsole.getInstance(); // true

const secondConsole = new PixiConsole(consoleConfig); // Error - pixi console is designed with the singleton pattern only one instance is allowed
```

## Support

Please [open an issue](https://github.com/jkanchelov/pixi-console/issues/new) for support.

## Contributing

Please contribute using [Github Flow](https://guides.github.com/introduction/flow/). Create a branch, add commits, and [open a pull request](https://github.com/jkanchelov/pixi-console/compare/).
