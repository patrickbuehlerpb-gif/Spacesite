import { defineConfig } from 'vite';

// base './' keeps the build relocatable (GitHub Pages sub-paths, Vercel, any static host).
// Routing is hash-based (#/sterne), so no server rewrites are needed.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
