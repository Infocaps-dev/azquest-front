import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      scss: {
        // Silencia avisos de depreciação vindos do Carbon (node_modules)
        quietDeps: true,
        silenceDeprecations: ['if-function'],
      },
    },
  },
})
