import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    /*
     * Forwards `/api/*` to the FastAPI backend on :8000.
     *
     * A dev-server proxy rather than an absolute API URL in the client: the
     * browser then sees same-origin requests, so no CORS preflight is involved
     * in development and cookie-based auth will work without `SameSite`
     * exemptions later. `apiClient`'s default base URL is already `/api`
     * (frontend/src/services/apiClient.ts), so nothing in the app changes.
     *
     * Deployment overrides this with VITE_API_BASE_URL when the API is served
     * from a different origin.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
