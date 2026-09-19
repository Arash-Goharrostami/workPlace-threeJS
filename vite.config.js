import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or subpath.
  base: './',
  server: { open: false },
  build: {
    rollupOptions: {
      // Two pages: the room, and the error document the bucket serves in its place.
      input: { main: 'index.html', error: 'error.html' },
    },
  },
});
