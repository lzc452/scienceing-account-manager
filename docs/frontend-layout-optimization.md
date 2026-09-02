# 前端布局与样式优化说明

> 科应共享账号管理平台（apps/web）— Vue3 + Vite + Tailwind v4 + shadcn 组件
> 优化范围：**仅布局与样式**，未改动任何业务逻辑、接口与路由；技术栈保持不变。

---

## 一、解决的问题与方案

### 1. 响应式布局（移动端 / 平板 / 桌面）
| 断点 | 关键行为 |
|---|---|
| < 640px（手机） | 管理侧边栏转为抽屉（汉堡 + 遮罩 + 关闭按钮），表格在卡片内部横向滚动，表单行纵向堆叠，顶栏导航只留图标 |
| 640–1023px（平板） | 统计指标 2→4 列过渡，字号 28→32px，工具行允许换行 |
| ≥ 1024px（桌面） | 侧边栏常驻 240px，内容区最大宽度 1280px 并居中，字号回到设计稿 36px |

- 根因级防溢出：`.page-container { min-width: 0 }`、`img/svg { max-width: 100% }`、长文本 `overflow-wrap: break-word`，页面本身在任何断点都不出现横向滚动条。
- 表格溢出限制在卡片内部：`Table` 组件新增 `minWidth` prop（各页按列数声明 720–880px 舒适最小宽度），窄于此值时内部滚动。

### 2. 大屏内容稀少的排版
- 统一留白节奏：`--layout-rhythm: clamp(1.5rem, 3vw, 2.5rem)`，页面纵向呼吸感一致。
- 内容少时垂直居中：`.app-main > * { margin-block: auto }`（比 `justify-content:center` 更安全，内容超高时不会裁掉顶部）。
- 「我的账号 / 系统参数」等稀疏页收窄为 768px 居中窄栏（`contentWidth="narrow"`），不再被拉满 1280px 造成失衡留白。

### 3. 背景与层次
- **三级灰阶递进，级间必有边界**：页面底 `canvas #f5f5f5` → 侧边栏/分区 `surface-alt #fafafa` + 1px hairline → 卡片 `paper #ffffff` + hairline + `shadow-subtle`。
- 顶栏与页面同底色（canvas），不再有大面积白块与灰块生硬拼接；白色只留给被容器承载的内容面。
- 新增阴影层级 `shadow-raised`（卡片内浮层）/ `shadow-overlay`（模态、抽屉、移动端侧边栏）。
- 表格表头带 `surface-band`（#fafafa + 上下 hairline）作为明确分区。

### 4. 视觉重心
- 内容容器（`.page-container`）是唯一视觉主体：最大宽度 + 水平居中，页面背景统一。
- 首页统计从「散落在灰底上的文字」收进卡片内 2/4 列 hairline 网格，指标成为稳定的视觉锚点。

---

## 二、改动文件清单

**样式层**
- `apps/web/src/assets/index.css` — 布局令牌 + 工具类 + 阴影层级（含设计意图注释）

**布局/组件层**
- `apps/web/src/components/layout/AppShell.vue` — 响应式抽屉侧边栏、canvas 顶栏、page-container
- `apps/web/src/layouts/PublicLayout.vue`、`AdminLayout.vue` — 容器化与 contentWidth 透传
- `apps/web/src/components/ui/Table.vue`、`TableHeader.vue`、`TableCell.vue`、`TableHead.vue` — 表格溢出控制与表头分区
- `apps/web/src/components/ui/Dialog.vue`、`Toaster.vue`、`StatBlock.vue`、`ErrorCard.vue` — 移动端适配

**页面层**
- `HomePage.vue`、`MyAccountPage.vue`、`LoginPage.vue`、`ComponentShowcase.vue`
- `admin/AccountsPage.vue`、`UsersPage.vue`、`LeasesPage.vue`、`LogsPage.vue`、`SettingsPage.vue`

**仓库层**
- 根 `.gitignore`（node_modules / dist / 数据库 / Playwright 认证 / 环境变量 / 辅助目录等）

---

## 三、验证与交付

- `vite build`：1636 个模块编译通过（沙箱安全删除钩子会拦截 vite 清空 `dist`，本地用 `--outDir` 外部目录验证）。
- 已推送远程仓库 `https://github.com/lzc452/scienceing-account-manager.git` **main** 分支：
  - 提交 `bbfbe76`（188 文件，根提交）
  - `origin/main = bbfbe76`，`git status` 干净
- 备注：JS 包体 612KB 的 chunk 体积警告为既有问题，未纳入本次改动范围。

---

## 四、设计意图速查（关键样式处已注释）

| 位置 | 意图 |
|---|---|
| `.page-container` | 大屏限宽居中、小屏安全边距、min-width:0 防溢出 |
| `.app-main > *` | 内容稀少时垂直居中，不拉伸 |
| `.table-scroll` | 溢出限制在卡片内，页面永不横向滚动 |
| `.surface-band` | 卡片内分区用色阶递进，不新增色块 |
| 表格 `minWidth` | 列数多时优先内部滚动而非挤压单元格 |
| 抽屉侧边栏 | <1024px 时 `fixed` + 位移 + `inert`，桌面回归 `static` |
