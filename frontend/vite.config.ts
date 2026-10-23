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
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: ['@ocr-web/shared'],
    exclude: ['onnxruntime-web'],
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('paddleocr') || id.includes('onnxruntime-web')) return 'paddle-ocr';
          if (id.includes('docx') || id.includes('jszip')) return 'export';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('react-window')) return 'virtual';
          if (id.includes('react-dom') || id.includes('react/')) return 'react';
        },
      },
    },
  },
});
