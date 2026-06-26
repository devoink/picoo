import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['picoo'],
  },
  server: {
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
});
