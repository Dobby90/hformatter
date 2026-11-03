import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// Relative assets also work when dist/ is served directly by Live Server.
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.VITE_APP_VERSION || packageVersion),
  },
  base: process.env.VITE_BASE_PATH || './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
