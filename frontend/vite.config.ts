import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker dev, the backend container is reachable via service name, not localhost.
// Set API_TARGET_URL in the environment to point to the correct backend address.
// e.g. docker-compose sets: API_TARGET_URL=http://backend:3001
const backendTarget = process.env.API_TARGET_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendTarget,
        ws: true,
        changeOrigin: true,
      },
      '/avatars': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
