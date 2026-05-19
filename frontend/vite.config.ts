import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@ocr-web/shared'],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('tesseract.js')) return 'tesseract';
          if (id.includes('docx') || id.includes('jszip')) return 'export';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('react-window')) return 'virtual';
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
});
