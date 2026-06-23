import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  // esnext target is required: main.jsx uses top-level await to initialize MSAL
  // before the app renders.
  build: { target: 'esnext' },
  esbuild: { target: 'esnext' },
});
