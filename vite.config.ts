import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The app version comes from package.json (shown at the bottom of the help dialog)
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Relative base so the build works on GitHub Pages under any repo path
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(version) },
});
