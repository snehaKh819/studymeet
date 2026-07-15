import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://gateway',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/chat': {
        target: process.env.VITE_API_TARGET || 'http://gateway',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/rtc': {
        target: process.env.VITE_API_TARGET || 'http://gateway',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  }
})
