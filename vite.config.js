import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the production build works from any static host or subpath.
  base: './',
  server: { open: false },
  build: {
    // Transpiled down for the iOS 14/15 Safari and older Android Chrome the room
    // still has to open on — newer syntax there is a parse error and a black page.
    target: ['es2019', 'safari13', 'chrome80'],
    rollupOptions: {
      // Two pages: the room, and the error document the bucket serves in its place.
      input: { main: 'index.html', error: 'error.html' },
    },
  },
});
