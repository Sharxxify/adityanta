import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Proxy /api requests to EC2 backend during local development
    proxy: {
      '/api': {
        target: 'http://ec2-13-60-248-220.eu-north-1.compute.amazonaws.com:3001',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
