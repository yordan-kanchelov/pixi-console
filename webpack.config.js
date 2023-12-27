const path = require('path');

const mode = process.env.NODE_ENV || 'production';

// Base configuration
const baseConfig = {
  mode: 'production',
  entry: './src/index.ts',
  devtool: mode === 'development' ? 'inline-source-map' : 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  externals: ['pixi.js']
  
};

// Configuration for UMD
const umdConfig = {
  ...baseConfig,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pixi-console.umd.js',
    library: 'PixiConsole',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
};

// Configuration for ES Modules
const esConfig = {
  ...baseConfig,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pixi-console.esm.js',
    libraryTarget: 'module',
  },
  experiments: {
    outputModule: true,
  },
};

// Configuration for CommonJS
const commonJsConfig = {
  ...baseConfig,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pixi-console.cjs.js',
    libraryTarget: 'commonjs2',
  },
};

module.exports = [umdConfig, esConfig, commonJsConfig];
