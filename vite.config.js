import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or subpath.
  base: './',
  server: { open: false },
});
