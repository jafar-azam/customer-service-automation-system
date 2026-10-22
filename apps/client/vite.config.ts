import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /* Needed for the dev server to be reachable from outside the container. */
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
