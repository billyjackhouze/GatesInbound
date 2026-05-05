import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 56', 'samsung >= 8', 'safari >= 11'],
    }),
  ],

  server: {
    port: 5173,
    // In dev, proxy all /api calls to the Express server so you don't hit CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir:     'dist',
    emptyOutDir: true,
  },
})
