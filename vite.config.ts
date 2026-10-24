import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two production builds:
//  - `npm run build`     → final/index.html: one self-contained file (code, styles and both music formats
//                           inlined), so it can be opened by double-clicking it — no server needed.
//  - `npm run build:web` → web/: index.html plus separate code and music files, for the website. Each browser
//                           then downloads only the music format it can play (Opus or AAC), and the page
//                           shows up before the music has finished loading.
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    base: './',
    server: { port: 5173 },
    build: web
      ? { outDir: 'web', target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 }
      : { outDir: 'final', target: 'es2022', assetsInlineLimit: Number.MAX_SAFE_INTEGER, chunkSizeWarningLimit: 20000 },
    plugins: web ? [] : [viteSingleFile()],
  };
});
