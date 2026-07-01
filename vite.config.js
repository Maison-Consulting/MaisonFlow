import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

// GitHub Pages has no SPA rewrite: a refresh on /MaisonFlow/projects 404s.
// Serving a copy of index.html as 404.html lets the client router handle it.
function spaFallback() {
  return {
    name: 'spa-404-fallback',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback()],
  server: { port: 5173, open: true },
  // esnext target is required: main.jsx uses top-level await to initialize MSAL
  // before the app renders.
  build: { target: 'esnext' },
  esbuild: { target: 'esnext' },
  base : "/MaisonFlow"
});
