import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 端口与环境来自环境变量：
//   WEB_PORT  前端开发服务器端口（一键脚本支持 --only=web 避让占用时设置）
//   PORT      后端端口，用于反向代理 /api（与 .env 保持一致，默认 3000）
// 设计意图：让启动脚本只设环境变量、不转发 CLI 参数——避免 pnpm 在 Git Bash
// 下对 `--` 的 corepack 垫片路径转换破坏端口覆盖。
const webPort = Number(process.env.WEB_PORT) || 5173
const backendPort = Number(process.env.PORT) || 3000

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
    port: webPort,
    // 端口被占用时严格报错（不自动漂移），否则就绪探测会误判到错误端口。
    strictPort: true,
    host: true,
    // 联调真实后端：将 /api 代理到后端（默认 3000，跟随 .env 的 PORT）。
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})

