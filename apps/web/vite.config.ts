import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@anyit/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    // Bind on all interfaces so phones/PCs on the same LAN can open the app
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/uploads': 'http://127.0.0.1:4000',
    },
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
