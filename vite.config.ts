import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Listen on IPv4: on this machine Node resolves "localhost" to ::1 only, which some browsers
  // (e.g. VS Code's built-in one) can't reach, so http://localhost:5173 was refused.
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  // Three.js makes one big bundle; that's fine for a desktop game that loads from disk.
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'node',
  },
});
