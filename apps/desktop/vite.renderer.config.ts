import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { preserveSymlinks: false, dedupe: ['pixi.js', 'react', 'react-dom'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5173; object-src 'none'; frame-src 'none'; base-uri 'none'",
    },
  },
});
