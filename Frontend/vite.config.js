import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, /api is forwarded to the FastAPI backend, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        timeout: 35 * 60 * 1000, // analyses can take several minutes
        proxyTimeout: 35 * 60 * 1000,
      },
    },
  },
})
