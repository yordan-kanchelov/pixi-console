[![Build Status](https://travis-ci.com/jkanchelov/pixi-console.svg?branch=master)](https://travis-ci.com/jkanchelov/pixi-console) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

# Pixi-console

Console class for PIXI useful for developing mobile game.

By default attaches itself to console log and error and will show itself if error is occurred.

![](https://github.com/jkanchelov/pixi-console/blob/master/img/example.png?raw=true)

## Table of Contents

- [Pixi-console](#pixi-console)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Documentation](#documentation)
  - [Support](#support)
  - [Contributing](#contributing)

## Installation

```javascript
npm install pixi-console
```
- If you want > pixi.js 5.0.0 support go with pixi-console 3.0.0 or greater version
- For backward compatibility ( pixi.js v4.0.0 ) go with pixi-console 2.5.0 or greater version 


## Usage

```javascript
import { PixiConsole, PixiConsoleConfig } from "pixi-console";

// customize default values of PixiConsole
const consoleConfig = new PixiConsoleConfig();
consoleConfig.consoleWidth = 800;
consoleConfig.consoleHeight = 600;

const pixiConsole = new PixiConsole(consoleConfig);
stage.addChild(pixiConsole);

const secondConsole = new PixiConsole(consoleConfig); // Error PixiConsole is singleton..
pixiConsole == PixiConsole.getInstance(); // true
```

## [Documentation](https://jkanchelov.github.io/pixi-console/classes/pixiconsole.html)

## Support

Please [open an issue](https://github.com/jkanchelov/pixi-console/issues/new) for support.

## Contributing

Please contribute using [Github Flow](https://guides.github.com/introduction/flow/). Create a branch, add commits, and [open a pull request](https://github.com/jkanchelov/pixi-console/compare/).
