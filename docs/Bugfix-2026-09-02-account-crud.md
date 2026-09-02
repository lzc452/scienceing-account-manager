# Bug 修复记录：首页「新增/删除科应账号」接口报错

> 日期：2026-09-02 ｜ 修复人：Code Reviewer Agent ｜ 状态：✅ 已修复并验证

## 现象

首页账号卡片两个管理操作全部失败：

```
Cannot POST   /api/admin/accounts      （HTTP 404）
Cannot DELETE /api/admin/accounts/1    （HTTP 404）
```

## 根因 ①：后端运行的是旧编译产物（404 的直接原因）

| 文件 | 时间 |
|---|---|
| `src/modules/admin/admin.controller.ts`（新增 POST/DELETE/bulk 路由） | 14:46 |
| `src/modules/admin/admin.service.ts`（新增 createAccount/deleteAccount/bulk） | 14:57 |
| `dist/modules/admin/admin.controller.js`（**旧产物，缺 3 个路由**） | 13:58 |

- 源码 14:40+ 新增的 `POST /admin/accounts`、`DELETE /admin/accounts/:id`、`POST /admin/accounts/bulk` 从未编译进 `dist`，正在运行的进程也从未重启。
- 探测佐证：重启前 `POST/DELETE → 404`，而 `GET /api/admin/accounts → 401`（旧产物仅有 GET 路由，AuthGuard 正常）。

**处理**：`node_modules/typescript/bin/tsc -p apps/server/tsconfig.json` 重新编译 + 重启后端。Nest 启动日志确认新路由已映射：

```
Mapped {/api/admin/accounts, POST} route
Mapped {/api/admin/accounts/bulk, POST} route
Mapped {/api/admin/accounts/:id, DELETE} route
```

## 根因 ②：删除账号后写审计违反外键约束（重启后暴露的 500）

404 修复后删除真实执行报 `500 FOREIGN KEY constraint failed`，堆栈指向 `AdminService.deleteAccount` 中事务之后的 `audit.record(...)`：

- `deleteAccount` 在事务里删除账号行（COMMIT 成功）**之后**，才写 `ACCOUNT_DELETE` 审计，且 `accountId` 仍引用刚删除的账号 id → `audit_logs.account_id` 外键引用落空（`createAccount` 的审计在账号存在时写入，故无此问题）。
- 附带隐患：原删除顺序为 `leases → reset_jobs → audit_logs`，而 `reset_jobs.lease_id` / `audit_logs.lease_id` 都引用 `leases(id)`——遇历史数据时同样会触发外键失败。

### 改动：`apps/server/src/modules/admin/admin.service.ts`（`deleteAccount`）

```ts
db.exec('BEGIN IMMEDIATE');
try {
  // 子表先删、父表后删：reset_jobs / audit_logs 的 lease_id 都引用 leases(id)
  db.prepare('DELETE FROM reset_jobs WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM audit_logs WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM leases WHERE account_id = ?').run(accountId);
  db.prepare('DELETE FROM scienceing_accounts WHERE id = ?').run(accountId);
  db.exec('COMMIT');
} catch (err) { /* ROLLBACK ... */ }

// 账号行已删除，audit 的 account_id 无法再引用它 → 置 NULL，原 ID 存入 metadata 追溯
this.audit.record({
  action: AUDIT_ACTION.ACCOUNT_DELETE,
  result: AUDIT_RESULT.SUCCESS,
  userId: adminUser.id,
  accountId: null,
  metadata: { accountId, accountCode: account.code, username: account.username },
});
```

## 验证

| 项目 | 结果 |
|---|---|
| 管理员登录 → 新增账号（T-02, id=12） | ✅ 201，返回完整账号视图 |
| 删除该账号 | ✅ `{"accountId":12} HTTP 200` |
| 账号列表恢复 10 条（KY-01 ~ KY-10） | ✅ |
| 审计留痕 | ✅ `ACCOUNT_DELETE`（account_id=null，metadata 含 accountId/code） |
| e2e 回归（admin / leases / auth / reset） | ✅ 20/20 PASS |

## 遗留建议

1. **补 e2e**：`admin.e2e.ts` 目前无「新增/删除账号」覆盖，本次 FK bug 因此漏网。建议新增用例：admin 新增 → 删除 → 断言列表少 1 条、audit_logs 留有 ACCOUNT_DELETE 行。
2. **本机 pnpm 不可用**：corepack 垫片路径漂移（`Cannot find module 'D:\d\Applications\nodejs\...\corepack\dist\pnpm.js'`）。改源码后可用
   `node node_modules/typescript/bin/tsc -p apps/server/tsconfig.json` 直接编译；
   建议修复 corepack（`corepack enable` 或重装 pnpm），否则 `pnpm dev` 的自动编译步骤会失败。
3. **修改后端源码后必须重启进程**：dev 环境无热更新（node dist/main.js），且 `dev.mjs` 仅在端口空闲时才拉起后端——改完请重启，勿只重编译。
