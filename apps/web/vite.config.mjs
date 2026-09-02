import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 注：使用 .mjs 配置，避免 Vite 用 esbuild 打包配置文件的子进程 spawn。
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // 沙箱限制：禁用 esbuild 变换（其 spawn 子进程被 EPERM 拦截）。纯 JS 源码
  // 不依赖 esbuild 的 TS/JSX 转换，define 替换与 CSS 压缩已另行走无 spawn 路径。
  esbuild: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 沙箱限制：esbuild 的 CSS 压缩同样需要 spawn 子进程，改用关闭压缩。
    cssMinify: false,
  },
  server: {
    port: 5173,
    host: true,
    // 联调真实后端：将 /api 代理到 NestJS（默认 3000）。
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
