import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The production build is one self-contained dist/index.html (code, styles and music inlined),
// so it can be opened by double-clicking it — no server needed.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', assetsInlineLimit: Number.MAX_SAFE_INTEGER, chunkSizeWarningLimit: 20000 },
  plugins: [viteSingleFile()],
});
