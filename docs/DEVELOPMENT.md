# 科应共享账号管理平台 —— 开发文档

> 版本：v1.0  
> 适用范围：本地开发、功能迭代、Bug 修复

---

## 1. 环境要求

| 组件 | 最低版本 | 说明 |
|---|---|---|
| Node.js | >= 22.5 | 需要内置 `node:sqlite`（22.5+ 无需 flag） |
| pnpm | >= 8.0 | 使用 pnpm workspace，**禁止用 npm/yarn** |
| Git | 任意 | 发版依赖 Tag 管理 |

**校验命令**：

```bash
node -v   # 应输出 v22.x 或 v24.x
pnpm -v   # 应输出 8.x 或更高
```

Windows 开发机已验证通过；WSL / macOS / Linux 理论兼容，未实测。

---

## 2. 项目结构

Monorepo，pnpm workspace 管理：

```text
scienceing-account-manager/
├── apps/
│   ├── server/          NestJS 后端（SQLite + Playwright Worker 子进程）
│   ├── web/             Vue 3 + Vite 前端看板
│   └── extension/       Chrome 扩展（MV3，content script + service worker）
├── packages/
│   └── shared/          前后端共享代码（密码策略、常量、类型）
├── playwright/
│   └── worker/          改密 Worker（独立进程，被后端 spawn 拉起）
├── scripts/
│   ├── dev.mjs          本地开发一键启动
│   └── lib/             dev.mjs 依赖的辅助模块
├── deploy-lan/          Windows LAN 部署脚本（PowerShell）
├── deploy-cloud/        Linux 云服务器 Docker 部署制品
└── docs/                设计文档与操作手册
```

### 2.1 后端模块（`apps/server/src/modules/`）

| 模块 | 职责 |
|---|---|
| `auth` | 登录/改密/会话/token 解析 |
| `users` | 用户 CRUD、密码重置 |
| `accounts` | 科应账号池管理 |
| `leases` | 租约（借用/归还/凭据下发） |
| `reset` | 改密队列（两阶段：重置 → 改密） |
| `automation` | Worker 生命周期管理（spawn / 监控 / 回收） |
| `extension` | 扩展配置/一次性领取证明 |
| `admin` | 管理员操作（强制回收/系统设置/审计查看） |
| `audit` | 审计日志写入 |
| `manual` | 用户手册内容管理 |
| `dashboard` | 看板统计指标 |
| `settings` | 系统设置（不活跃超时、租约规则） |
| `activity` | 用户活动心跳 |

---

## 3. 分支策略

```
main              唯一长期分支，始终可部署
  ↑
feature/xxx       功能分支，从 main 切出，PR 合并回 main
  ↑
hotfix/xxx        紧急修复，从 main 切出，合并后立即发版
```

### 3.1 分支命名

```text
feature/<模块>-<简述>       例：feature/leases-batch-return
fix/<模块>-<问题简述>       例：fix/auth-timing-sidechannel
refactor/<范围>-<简述>      例：refactor/db-extract-connection
```

### 3.2 提交规范

```text
<type>(<scope>): <subject>

<body>

<footer>
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变行为） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `docs` | 文档更新 |
| `chore` | 构建/工具链/依赖 |
| `security` | 安全修复（独立 type，便于审计追溯） |

**示例**：

```bash
git commit -m "fix(auth): 消除登录时序侧信道

用户不存在时也执行 bcrypt.compare(dummy hash)，
使 401 两条路径耗时一致，防止账号枚举。

fixes #8"
```

### 3.3 禁止直接推 main

main 分支受保护，所有改动通过 PR 合并。合并前必须：

1. `pnpm typecheck` 通过（TypeScript 零报错）
2. `pnpm lint` 通过（ESLint 零报错）
3. 相关测试通过（`pnpm test:*`）
4. PR 描述说明改动范围与回滚方案

---

## 4. 本地开发启动

### 4.1 首次启动

```bash
# 1. 克隆仓库（或已在本机）
cd scienceing-account-manager

# 2. 安装依赖（monorepo 全量）
pnpm install

# 3. 一键启动（后端 + 前端 + 数据库迁移 + 种子 + 扩展打包）
pnpm dev
```

首次执行 `pnpm dev` 会自动完成：

- 生成 `.env`（含 `SCIENCEING_MASTER_KEY`、`ADMIN_INITIAL_PASSWORD`、`PORT`）
- 生成 `apps/web/.env.local`（`VITE_USE_MOCK=false`，关闭 mock 直连后端）
- 编译后端 `apps/server/dist`
- 执行数据库迁移（SQLite，`data/scienceing.dev.db`）
- 种子数据（admin 账号 + KY-01~KY-10 科应账号）
- 打包浏览器扩展 ZIP 到 `apps/web/public/downloads/`
- 启动后端 `:3000` + 前端 `:5173`

就绪后控制台输出：

```text
✔ 全部就绪（xx.xs）
  账号池看板   http://localhost:5173
  管理后台     http://localhost:5173/admin
  后端 API     http://localhost:3000/api
  扩展 ZIP     http://localhost:5173/downloads/scienceing-extension.zip
  管理员账号   admin / admin12345
```

### 4.2 常用开发命令

```bash
# 只起后端（前端用已运行的实例）
pnpm dev --only=server

# 只起前端（后端必须已在运行）
pnpm dev --only=web

# 删库重来（迁移 + 种子，保留 .env 中的密钥）
pnpm dev --reset

# 强制重新编译后端
pnpm dev --rebuild

# 重置 admin 口令为 .env 中的 ADMIN_INITIAL_PASSWORD
pnpm dev --reset-admin

# 跳过依赖检查（node_modules 已就绪时更快）
pnpm dev --no-install
```

### 4.3 停止服务

终端按 `Ctrl+C`，`dev.mjs` 会连带终止子进程树（后端 + 前端 + vite HMR 子进程）。

若端口残留（Windows 偶发）：

```bash
# 查占 3000 / 5173 的进程
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### 4.4 环境变量（本地开发）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SCIENCEING_MASTER_KEY` | 自动生成 | **绝不能改**，否则已存密码密文全部无法解密 |
| `ADMIN_INITIAL_PASSWORD` | `admin12345` | 种子 admin 初始口令，可通过 `.env` 覆盖 |
| `PORT` | `3000` | 后端端口 |
| `WEB_PORT` | `5173` | 前端端口（vite 默认，冲突时临时改） |

文件位置：

- `.env` —— 仓库根，已 gitignore，首次 `pnpm dev` 自动生成
- `apps/web/.env.local` —— 前端本地配置，`VITE_USE_MOCK=false`

---

## 5. 数据库

### 5.1 技术选型

SQLite（`node:sqlite`），单机部署，零外部依赖。

- 开发库：`data/scienceing.dev.db`（+ `-wal` / `-shm`）
- 生产库：`/data/scienceing.prod.db`（Docker volume 挂载）

### 5.2 Schema 版本管理

迁移文件位于 `apps/server/src/db/migrations/`，按 `00X_描述.ts` 命名：

```text
001_init_schema.ts
002_add_sessions.ts
003_settings_inactivity_minutes.ts
004_add_manuals.ts
005_add_first_login_flag.ts
006_add_extension_claim_proofs.ts
007_settings_lease_rule_hours.ts
```

每个迁移导出 `Migration` 接口：

```typescript
export interface Migration {
  version: number;   // 严格递增，与 compiled schema-version.ts 一致
  name: string;      // 英文描述
  sql: string;       // 纯 SQL，幂等（IF NOT EXISTS / OR IGNORE）
}
```

### 5.3 新增数据库字段（标准流程）

**Step 1：写新迁移文件**

复制 `apps/server/src/db/migrations/00X_xxx.ts`，版本号 = 当前最大 + 1。

```typescript
// 008_add_user_phone.ts
import type { Migration } from './migration';

export const migration008: Migration = {
  version: 8,
  name: 'add_user_phone',
  sql: `
    ALTER TABLE users ADD COLUMN phone TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  `,
};
```

**Step 2：注册到迁移列表**

编辑 `apps/server/src/db/migrations.ts`，导入并追加到 `MIGRATIONS` 数组末尾：

```typescript
// apps/server/src/db/migrations.ts
import { migration008 } from './migrations/008_add_user_phone';

export const MIGRATIONS: readonly Migration[] = [
  migration001, migration002, ...,
  migration008,
];
export const CURRENT_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0; // = 8
```

**Step 3：更新 TypeScript 类型**

编辑 `apps/server/src/modules/auth/auth.types.ts`（或对应模块的 types 文件），给 `UserRow` 加字段：

```typescript
export interface UserRow {
  id: number;
  username: string;
  // ...
  phone: string;   // ← 新增
}
```

**Step 4：执行迁移**

```bash
# 开发环境（自动）
pnpm dev              # dev.mjs 自动跑 migrate.js

# 手动执行
pnpm db:migrate       # = pnpm --filter @scienceing/server db:migrate
```

**Step 5：验证**

```bash
# 查看当前 schema 版本
node apps/server/dist/db/schema-version.js

# 开发环境可直接用 DB Browser for SQLite 打开 data/scienceing.dev.db 查看
```

### 5.4 回滚策略

SQLite 不支持 `ALTER TABLE DROP COLUMN`，因此：

- **开发环境**：`pnpm dev --reset` 删库重来（丢失数据，仅开发用）
- **生产环境**：通过 `backup-offsite.sh` 预部署备份 + `db:doctor --fix` 结构兜底；若必须回滚字段，写反向迁移（`ALTER TABLE ... RENAME TO ...`，重建表结构并导数据）

---

## 6. 新增 API（标准流程）

后端采用 NestJS，API 路径统一前缀 `/api`。

### 6.1 场景判断

| 场景 | 操作 |
|---|---|
| 在现有模块加接口 | 直接编辑该模块的 `*.controller.ts` + `*.service.ts` |
| 新增业务模块 | 按「Step 1~6」完整走一遍 |

### 6.2 新增模块完整流程

以新增 `reports`（报表模块）为例：

**Step 1：创建模块目录**

```bash
mkdir apps/server/src/modules/reports
```

**Step 2：定义 DTO / Types**

`apps/server/src/modules/reports/reports.types.ts`：

```typescript
export interface ReportRow {
  id: number;
  name: string;
  data: string;
  created_at: string;
}

export interface CreateReportDto {
  name: string;
  data: string;
}
```

**Step 3：编写 Service**

`apps/server/src/modules/reports/reports.service.ts`：

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../db/database.service';
import type { ReportRow, CreateReportDto } from './reports.types';

@Injectable()
export class ReportsService {
  constructor(private readonly dbService: DatabaseService) {}

  findAll(): ReportRow[] {
    return this.dbService.db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as ReportRow[];
  }

  create(dto: CreateReportDto): { id: number } {
    const now = new Date().toISOString();
    const result = this.dbService.db
      .prepare('INSERT INTO reports (name, data, created_at) VALUES (?, ?, ?)')
      .run(dto.name, dto.data, now);
    return { id: Number(result.lastInsertRowid) };
  }
}
```

**Step 4：编写 Controller**

`apps/server/src/modules/reports/reports.controller.ts`：

```typescript
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guards/auth.guard';
import { AdminGuard } from '../../guards/admin.guard';
import { ReportsService } from './reports.service';
import type { CreateReportDto } from './reports.types';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  list() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateReportDto) {
    return this.service.create(dto);
  }
}
```

**Step 5：注册模块**

编辑 `apps/server/src/app.module.ts`，在 `providers` 和 `controllers` 数组中追加：

```typescript
import { ReportsController } from './modules/reports/reports.controller';
import { ReportsService } from './modules/reports/reports.service';

@Module({
  controllers: [
    // ... 现有 controller ...
    ReportsController,
  ],
  providers: [
    // ... 现有 provider ...
    ReportsService,
  ],
})
```

**Step 6：数据库迁移（若需新表）**

按 §5.3 写迁移文件 `009_add_reports_table.ts`，包含 `CREATE TABLE reports (...)`。

**Step 7：编译验证**

```bash
pnpm typecheck          # 全量 TypeScript 检查
pnpm --filter @scienceing/server build   # 单独编译后端
```

### 6.3 权限守卫速查

| 守卫 | 用途 | 使用位置 |
|---|---|---|
| `AuthGuard` | 校验 session token，提取当前用户 | 绝大多数 Controller |
| `AdminGuard` | 在 AuthGuard 基础上要求 `role === 'ADMIN'` | 管理操作 |

**示例**：

```typescript
@Controller('sensitive')
@UseGuards(AuthGuard)      // 先过登录校验
export class SensitiveController {
  @Post('action')
  @UseGuards(AdminGuard)   // 再限制管理员
  action() { /* ... */ }
}
```

### 6.4 API 命名规范

| 操作 | HTTP | 路径示例（Controller 内） | 实际 URL |
|---|---|---|---|
| 列表 | GET | `/leases` | `/api/leases` |
| 单条 | GET | `/leases/:id` | `/api/leases/:id` |
| 创建 | POST | `/leases` | `/api/leases` |
| 更新 | PATCH | `/leases/:id` | `/api/leases/:id` |
| 删除 | DELETE | `/leases/:id` | `/api/leases/:id` |
| 动作 | POST | `/leases/:id/return` | `/api/leases/:id/return` |

---

## 7. 新增前端页面/组件

### 7.1 技术栈

- Vue 3（Composition API）
- Vue Router 4
- Tailwind CSS 4
- Vite 6（`--configLoader native`）
- 图标：lucide-vue-next

### 7.2 新增页面流程

**Step 1：创建组件**

```bash
# 按功能域放目录
touch apps/web/src/views/reports/ReportList.vue
```

**Step 2：注册路由**

编辑 `apps/web/src/router/index.ts`：

```typescript
import ReportList from '../views/reports/ReportList.vue';

const routes = [
  // ...
  { path: '/reports', component: ReportList, meta: { requiresAuth: true } },
];
```

**Step 3：在导航菜单注册**

编辑 `apps/web/src/layouts/DashboardLayout.vue`（或对应菜单组件），加入新路由链接。

**Step 4：对接 API**

前端请求统一用封装好的 `fetch` 辅助函数（`apps/web/src/lib/api.js`），已自动携带 Cookie：

```typescript
import { get, post } from '../lib/api.js';

const reports = await get('/api/reports');
await post('/api/reports', { name: '月报', data: '...' });
```

### 7.3 前端 Mock 模式

`apps/web/.env.local` 中 `VITE_USE_MOCK=true` 时，前端不连后端，用内存 mock 数据开发 UI。适合纯 UI 调整或后端未就绪时并行开发。

切换命令：

```bash
# 关闭 mock（默认）
echo "VITE_USE_MOCK=false" > apps/web/.env.local

# 开启 mock
echo "VITE_USE_MOCK=true" > apps/web/.env.local
```

---

## 8. 测试

### 8.1 测试分类

```bash
# 开发环境扩展包一致性
pnpm test:dev-package

# PowerShell 编码/兼容性
pnpm test:release-scripts

# 网关容错
pnpm test:deploy-gateway

# 部署工具函数
pnpm test:deploy-utils

# 数据库诊断（doctor）目标库兼容性
pnpm test:db-doctor

# 安全头（nginx add_header 不继承回归）
pnpm test:security-headers

# 账号密码加密/解密
pnpm test:account-crypto

# 后端不变量（session/lease/reset 状态机）
pnpm test:backend-invariants
```

### 8.2 后端单元测试

```bash
cd apps/server
pnpm test       # crypto + db config + migrate + backup + seed
pnpm test:e2e   # auth + leases + admin + reset 端到端
```

### 8.3 新增测试

后端测试用 Node.js 原生 `node --test`，文件命名 `*.test.js`（编译后跑 dist 里的）：

```javascript
// apps/server/src/modules/reports/reports.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ReportsService', () => {
  it('should create a report', () => {
    // ...
    assert.strictEqual(result.id, 1);
  });
});
```

然后在 `apps/server/package.json` 的 `test` 脚本中追加对应编译后的路径。

---

## 9. 代码质量

### 9.1 TypeScript

```bash
pnpm typecheck      # 全量检查，零报错才能合并
```

### 9.2 ESLint

```bash
pnpm lint           # 全量检查
pnpm lint --fix     # 自动修复可修复项
```

配置：`eslint.config.mjs`，已启用 `@typescript-eslint/recommended`。

---

## 10. 发版流程

### 10.1 开发机执行（Windows + PowerShell）

```powershell
# 自动计算下一个 patch 版本（如 v1.2.3 → v1.2.4）
.\make-release.ps1

# 指定版本号
.\make-release.ps1 -Tag v1.3.0

# 指定级别（patch/minor/major）
.\make-release.ps1 -Bump minor

# 跳过测试（不推荐）
.\make-release.ps1 -SkipTests

# 工作区有未提交改动时强制发版（不推荐）
.\make-release.ps1 -AllowDirty
```

执行内容：

1. 校验工作区干净（或 `-AllowDirty`）
2. 打 Git Tag（如 `v1.2.4`）
3. 推送 Tag 到 LAN bare 仓库（`lan` remote）
4. 调用 `create-release.ps1` 构建 Release ZIP

### 10.2 Release ZIP 内容

```text
scienceing-v1.2.4.zip
├── apps/server/dist/         后端编译产物
├── apps/web/dist/            前端构建产物
├── playwright/worker/dist/   Worker 编译产物
├── deploy-lan/               LAN 部署脚本
├── release.json              版本元数据（version / commit / schemaVersion）
└── ... 源码（用于二次编译/调试）
```

### 10.3 部署到生产

见《部署文档》（`docs/DEPLOYMENT.md`）。

---

## 11. 常见开发问题

### Q1：`pnpm dev` 报「端口被占用」

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# 或改端口
echo "PORT=3001" >> .env
```

### Q2：登录报「用户名或密码错误」

```bash
# 重置 admin 口令为 .env 中的值
pnpm dev --reset-admin
```

### Q3：`node:sqlite` 不可用

升级 Node.js 到 >= 22.5。Node 20/21 需要 `--experimental-sqlite` flag，不支持。

### Q4：扩展 CORS 报错

确认 `apps/web/.env.local` 中 `VITE_USE_MOCK=false`。mock 模式下扩展不会真正连接后端。

### Q5：依赖安装后仍报错「Cannot find module」

```bash
# 清除 pnpm 状态缓存后重装
rm node_modules/.pnpm-workspace-state-v1.json
rm node_modules/.modules.yaml
pnpm install
```

---

## 附录 A：数据库表结构速查

### users（员工账号）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 自增 |
| username | TEXT UNIQUE | 登录名 |
| display_name | TEXT | 显示名 |
| department | TEXT | 部门 |
| password_hash | TEXT | bcrypt hash |
| role | TEXT | `USER` / `ADMIN` |
| enabled | INTEGER | 0=禁用，1=启用 |
| first_login_at | TEXT | 首次登录时间（首次登录后强制改密） |
| created_at / updated_at | TEXT | ISO 8601 |

### scienceing_accounts（科应账号池）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | 自增 |
| code | TEXT UNIQUE | 编号（如 KY-01） |
| username | TEXT | 科应登录名 |
| current_password_ciphertext | TEXT | AES-256-GCM 密文（含 v1/v2 载荷） |
| pending_password_ciphertext | TEXT | 待生效密码（改密中） |
| status | TEXT | AVAILABLE/IN_USE/RECYCLING/ERROR |
| last_password_changed_at | TEXT | |
| enabled | INTEGER | |
| created_at / updated_at | TEXT | |

### leases（租约）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| lease_token_hash | TEXT UNIQUE | SHA-256 |
| account_id | INTEGER FK | |
| user_id | INTEGER FK | |
| status | TEXT | ACTIVE/RELEASE_REQUESTED/RECYCLING/RELEASED/FAILED |
| started_at / last_activity_at | TEXT | |
| release_requested_at / released_at | TEXT | |
| release_reason | TEXT | USER_RETURN/INACTIVITY_TIMEOUT/ADMIN_FORCE/RESET_ERROR |
| extension_version | TEXT | 扩展版本 |
| created_at / updated_at | TEXT | |

### sessions（登录会话）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| token_hash | TEXT | SHA-256 |
| user_id | INTEGER FK | |
| created_at | TEXT | |
| expires_at | TEXT | 7 天有效期 |

### reset_jobs（改密任务队列）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| account_id | INTEGER FK | |
| lease_id | INTEGER FK | 可为 null |
| status | TEXT | PENDING/RUNNING/SUCCESS/FAILED |
| attempt_count | INTEGER | 重试次数 |
| error_message | TEXT | |
| created_at / started_at / finished_at | TEXT | |

### audit_logs（审计日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| user_id / account_id / lease_id | INTEGER FK | 可选 |
| action | TEXT | 操作类型 |
| result | TEXT | SUCCESS/FAILED |
| ip / user_agent | TEXT | |
| metadata | TEXT | JSON |
| created_at | TEXT | |

### extension_proofs（扩展一次性领取证明）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INTEGER PK | |
| proof_hash | TEXT | SHA-256 |
| user_id | INTEGER FK | |
| account_id | INTEGER FK | |
| expires_at | TEXT | 30 秒 TTL |
| consumed_at | TEXT | 消费时间 |
| created_at | TEXT | |

### system_settings（系统设置）

| 字段 | 类型 | 说明 |
|---|---|---|
| key | TEXT PK | |
| value | TEXT | |

---

## 附录 B：项目脚本速查

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 全量启动 |
| `pnpm dev --only=server` | 只起后端 |
| `pnpm dev --only=web` | 只起前端 |
| `pnpm dev --reset` | 删库重来 |
| `pnpm dev --rebuild` | 强制重编后端 |
| `pnpm dev --reset-admin` | 重置 admin 口令 |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:seed` | 执行种子 |
| `pnpm typecheck` | TypeScript 检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm build:shared` | 编译共享包 |
| `pnpm test:*` | 各类测试（见 §8） |
