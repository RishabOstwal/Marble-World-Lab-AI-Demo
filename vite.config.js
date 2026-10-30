import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:4174',
    },
  },
});
