
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base relativa para que funcione en subdirectorios (ej: GitHub Pages)
  base: './', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // Aumentamos el límite de advertencia a 1000kb (1MB) para evitar alertas innecesarias
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Esta configuración separa las librerías pesadas en archivos independientes
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'xlsx': ['xlsx'],
          'icons': ['lucide-react']
        }
      }
    }
  },
});
