/*import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // أي طلب يبدأ بـ /api سيتم توجيهه إلى الخادم الخلفي
      '/api': {
        target: 'http://localhost:5001', // عنوان الخادم الخلفي
        changeOrigin: true, // ضروري للخوادم الافتراضية
      }
    }
  }
})
*/
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { // <-- إضافة هذا القسم بالكامل
    proxy: {
      // أي طلب يبدأ بـ /api سيتم توجيهه إلى الخادم الخلفي
      '/api': {
        target: 'http://localhost:5002', // عنوان الخادم الخلفي (نستخدم منفذ بديل لتجنب التعارض)
        changeOrigin: true, // ضروري للخوادم الافتراضية
      }
    }
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers', 'onnxruntime-web']
  },
  define: {
    global: 'globalThis'
  },
  worker: {
    format: 'es'
  }
})