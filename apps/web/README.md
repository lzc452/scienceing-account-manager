# apps/web — 科应共享账号管理平台（前端）

Vue 3 + Vite 6 + Tailwind CSS v4 + shadcn-vue 风格组件。看板、登录、`/my` 与管理后台。

## 设计系统

- 令牌：`src/assets/index.css`（`@theme`，含 §4.1 语义色 8 令牌；色值源自仓库根 `theme.css`，禁止修改）。
- 字体：Geist（`@fontsource/geist-sans` 400/500/600），中文回退 Noto Sans SC / 苹方 / 微软雅黑（§2.3）。
- shadcn 主题映射：见 `index.css` 中 `--color-background/foreground/card/primary/...`（§2.2）。
- 组件总览（渲染所有基础组件 + 灰度滤镜开关）：`/`（`src/views/ComponentShowcase.vue`）。

## 组件

- UI 原语（`src/components/ui/`）：Button / Badge / Card / Input / Label / Skeleton / Table / Dialog / Select / Switch / Toast。
- 业务组件（`src/components/`）：`StatusDot`（4 态圆点 + 文本，回收中琥珀 ¾ 弧旋转）、`StatBlock`、`Countdown`（tabular-nums）、`PasswordReveal`（30s 自动遮蔽 / 6s 已复制）、`PluginChip`、`ProgressHairline`。
- 布局：`src/components/layout/AppShell.vue`（侧边栏 #fafafa 240px + 内容区 canvas）。

## 构建

```bash
# 在工作区根安装依赖（pnpm monorepo）
pnpm install
# 应用沙箱兼容补丁（见下）
node apps/web/scripts/apply-sandbox-patches.mjs
# 构建
pnpm --filter @scienceing/web build
```

## 联调（mock / 真实后端切换）

默认走内存 mock（无需后端，开发不受影响）。真实联调时：

```bash
# 启动后端（apps/server，默认 3000），再以禁用 mock 的方式启动前端
VITE_USE_MOCK=false pnpm --filter @scienceing/web dev
# 或写入 apps/web/.env：VITE_USE_MOCK=false
```

- `VITE_USE_MOCK` 未设置或非 `false` → 走 mock（`src/api/mock.js` + `src/api/admin-mock.js`）。
- `VITE_USE_MOCK=false` → 走真实 fetch（`/api/**`，dev 代理到 `http://localhost:3000`）。
- 看板账号池列表走 `GET /api/accounts/pool`（`[{ code, status, estimatedReleaseAt }]`，游客可访问）。
- 领取 CTA 会携带 `extensionVersion`（扩展握手返回的 version，配合后端 R3/R4 校验）。
- mock 演示口令为无关占位值（与 seed/生产凭据无关）：`admin/mock-admin`、`zhangsan/mock-user`。

## 沙箱兼容说明（重要）

当前执行环境的文件沙箱禁止 `child_process.spawn` 使用管道 stdio（报 `EPERM`），
vite 构建期有两处因此触发 spawn。已通过以下方式规避（均与业务无关）：

1. `vite.config.mjs`：
   - `--configLoader native`（脚本内）→ 不经过 esbuild 打包配置文件；
   - `esbuild: false` → 关闭 renderChunk 阶段的 esbuild 转译；
   - `build.cssMinify: false` → 关闭 esbuild 的 CSS 压缩。
2. 源码使用纯 JavaScript（不含 TS/JSX），避免 esbuild 的 TS 转换。
3. `scripts/apply-sandbox-patches.mjs` 对 vite 运行时打两处补丁：
   - `replaceDefine` 改用纯字符串替换（不再调用 esbuild transform）；
   - `optimizeSafeRealPathSync` 跳过 `net use` 子进程（本地路径无需 UNC 映射）。

`pnpm install` 会覆盖 node_modules，因此补丁脚本需在每次安装后重跑（幂等）。
后端脚手架已在 `pnpm-workspace.yaml` 通过 `allowBuilds: { esbuild: false }` 跳过
esbuild 的 postinstall（其运行时 spawn 仍需上述补丁规避）。
