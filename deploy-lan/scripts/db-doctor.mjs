#!/usr/bin/env node
/* global process, console */
/**
 * db-doctor.mjs —— 生产数据库结构 诊断 / 自愈（不依赖编译产物）
 *
 * 背景：dist/ 与 node_modules/ 都在 .gitignore 中，通过 git（bare repo / clone / pull）
 * 同步到生产机时只带源码。若生产机没有重新编译后端就启动旧 dist，migrate() 仍按旧版本
 * 列表执行，新功能（v4 使用手册、v5 首次登录强制改密、v6 扩展认领、v7 小时级超时参数）
 * 的表/列就永远不会创建 —— 表现为"代码是新的，功能却不生效"。
 *
 * 本脚本直接读取 apps/server/src/db/migrations/*.ts（源码，永远最新）解析迁移 SQL，
 * 对目标库做幂等补齐，因此即使 dist 是旧的也能把库结构修到最新。
 *
 * 用法（生产机、无需管理员权限）：
 *   node deploy-lan/scripts/db-doctor.mjs                       # 仅诊断（结构不一致时退出码 1）
 *   node deploy-lan/scripts/db-doctor.mjs --fix                 # 备份后补齐缺失表/列并登记迁移
 *   node deploy-lan/scripts/db-doctor.mjs --fix --no-backup     # 不备份直接修
 *   node deploy-lan/scripts/db-doctor.mjs --database <abs.db>   # 指定库（最明确，优先）
 *   node deploy-lan/scripts/db-doctor.mjs --set-must-change all # 补齐后让所有人下次登录改密
 *   node deploy-lan/scripts/db-doctor.mjs --set-must-change a,b # 只让指定用户改密
 *   node deploy-lan/scripts/db-doctor.mjs --quiet               # 只输出结果行（供部署脚本调用）
 *   node deploy-lan/scripts/db-doctor.mjs --json                # JSON 输出
 *
 * 目标库如何确定（**绝不猜测**，详见 detectDatabase）：
 *   1) --database <绝对路径>；2) DATABASE_PATH 环境变量；3) 按 NODE_ENV 推导
 *      （production → data/scienceing.prod.db，否则 data/scienceing.dev.db）。
 *   三者都要求文件**确实存在**；不满足即报错退出，不会改用其它库。
 *   历史库 data/scienceing.db 仅可经 --database 显式使用，不参与自动选择。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..', '..');
const SRC_MIGRATIONS_DIR = join(REPO_ROOT, 'apps', 'server', 'src', 'db', 'migrations');
const DIST_MIGRATIONS = join(REPO_ROOT, 'apps', 'server', 'dist', 'db', 'migrations.js');

// ───────────────────────── 参数 ─────────────────────────

function parseArgv(argv) {
  const opts = {
    fix: false, backup: true, database: null, quiet: false, json: false,
    setMustChange: null, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fix' || a === '-f') opts.fix = true;
    else if (a === '--no-backup') opts.backup = false;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--database' || a === '--db') { opts.database = argv[i + 1]; i += 1; }
    else if (a === '--set-must-change') { opts.setMustChange = argv[i + 1]; i += 1; }
    else throw new Error(`未知参数：${a}`);
  }
  return opts;
}

function say(opts, ...parts) {
  if (!opts.quiet && !opts.json) console.log(...parts);
}

// ───────────────────────── 迁移解析 ─────────────────────────

/**
 * 从源码 TS 解析迁移。文件形如：
 *   export const migration005: Migration = { version: 5, name: 'x', sql: `...` };
 * 源码缺失时（例如只部署了 release 包）回退到 dist 编译产物。
 */
function loadMigrations() {
  const files = existsSync(SRC_MIGRATIONS_DIR)
    ? readdirSync(SRC_MIGRATIONS_DIR).filter((f) => /^\d+_.*\.ts$/.test(f)).sort()
    : [];
  if (files.length > 0) {
    const list = files.map((file) => {
      const text = readFileSync(join(SRC_MIGRATIONS_DIR, file), 'utf8');
      const version = Number((/version:\s*(\d+)/.exec(text) || [])[1]);
      const name = (/name:\s*'([^']+)'/.exec(text) || [])[1];
      const sql = (/sql:\s*`([\s\S]*?)`\s*,?\s*\};?/.exec(text) || [])[1] ?? '';
      if (!Number.isSafeInteger(version) || !name || !sql.trim()) {
        throw new Error(`无法解析迁移文件 ${file}（缺 version/name/sql）`);
      }
      return { version, name, sql };
    }).sort((a, b) => a.version - b.version);
    return { source: 'src', migrations: list };
  }
  if (existsSync(DIST_MIGRATIONS)) {
    const require = createRequire(import.meta.url);
    const mod = require(DIST_MIGRATIONS);
    const list = (mod.MIGRATIONS || []).map((m) => ({ version: m.version, name: m.name, sql: m.sql }));
    if (list.length > 0) return { source: 'dist', migrations: list };
  }
  throw new Error(`未找到迁移定义：${SRC_MIGRATIONS_DIR} 与 ${DIST_MIGRATIONS} 都不可用`);
}

/** SQL → 语句数组（迁移里不含字符串内分号与 -- 注释，按 ; 切分安全）。 */
function splitStatements(sql) {
  return sql.split(';').map((s) => s.trim()).filter(Boolean);
}

// ───────────────────────── 库探测 ─────────────────────────

/**
 * 探测到的候选路径 —— **仅用于报错时提示**，不再参与「自动选中」。
 */
function candidateDatabases() {
  const list = [];
  if (process.env.DATABASE_PATH) list.push(resolve(process.env.DATABASE_PATH));
  const dataDir = join(REPO_ROOT, 'data');
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  list.push(join(dataDir, env === 'production' ? 'scienceing.prod.db' : 'scienceing.dev.db'));
  for (const name of ['scienceing.prod.db', 'scienceing.dev.db', 'scienceing.db']) {
    list.push(join(dataDir, name));
  }
  return [...new Set(list)];
}

/** 已存在的候选（供报错时列出，让操作者一眼看到「它本来会去改哪个库」）。 */
function existingCandidates() {
  return candidateDatabases().filter((p) => existsSync(p));
}

/**
 * 解析目标数据库。返回 { path, how }，how 用于在输出里说明「为什么是它」。
 *
 * **绝不再「挑一个存在的库」。** db-doctor --fix 会写库；若在调用者未指定的情况下
 * 静默换到另一个库，就会把迁移应用到错误的数据库（生产机改到 dev 库，或反之），
 * 而输出里那句「结构已是最新」还会让人以为检查过了 —— 这比直接报错危险得多。
 *
 * 因此三条路径都要求「显式、且确实存在」；无法确定时立刻失败。
 * 注意部署流程不受影响：deploy.mjs 与 deploy-release.ps1 都会先设置 DATABASE_PATH
 * 与 NODE_ENV，且 db:migrate / setupDatabase 已先建库，走到这里时文件必然存在。
 */
function detectDatabase(explicit) {
  // 1) --database 最明确
  if (explicit) {
    const p = resolve(explicit);
    if (!existsSync(p)) throw new Error(`指定的数据库不存在：${p}`);
    return { path: p, how: '--database 显式指定' };
  }

  // 2) DATABASE_PATH 是部署脚本注入的显式指令。文件缺失时必须报错，
  //    不能顺延到别的库 —— 那正是本函数此前最危险的行为。
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv) {
    const p = resolve(fromEnv);
    if (!existsSync(p)) {
      throw new Error(
        `DATABASE_PATH 指向的数据库不存在：${p}\n`
          + '  该变量属显式指定，db-doctor 不会改用其它库（避免把修复应用到错误的数据库）。\n'
          + '  请先完成数据库初始化，或改用 --database <绝对路径>。',
      );
    }
    return { path: p, how: 'DATABASE_PATH 环境变量' };
  }

  // 3) 无任何显式指定：按 NODE_ENV 推导唯一目标，不做猜测。
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const p = join(REPO_ROOT, 'data', env === 'production' ? 'scienceing.prod.db' : 'scienceing.dev.db');
  if (!existsSync(p)) {
    const seen = existingCandidates();
    throw new Error(
      `未指定目标数据库，且按 NODE_ENV=${env} 推导的路径不存在：${p}\n`
        + '  db-doctor 不会自动改用其它库（例如把生产修复打到 dev 库上）。请显式指定：\n'
        + '    --database <绝对路径>\n'
        + `  已探测到的现存库：\n${seen.length ? seen.map((x) => `    ${x}`).join('\n') : '    （无）'}`,
    );
  }
  return { path: p, how: `NODE_ENV=${env} 推导` };
}

// ───────────────────────── 结构检查 ─────────────────────────

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function indexExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name));
}

function columnsOf(db, table) {
  if (!tableExists(db, table)) return null;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.map((r) => String(r.name));
}

/** 从迁移 SQL 中抽取 "表.列" 期望清单（ALTER TABLE ... ADD COLUMN）。 */
function expectedColumns(migrations) {
  const map = new Map();
  const re = /ALTER\s+TABLE\s+([A-Za-z0-9_"]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_"]+)/gi;
  for (const m of migrations) {
    for (const match of m.sql.matchAll(re)) {
      const table = match[1].replace(/"/g, '');
      const column = match[2].replace(/"/g, '');
      if (!map.has(table)) map.set(table, new Set());
      map.get(table).add(column);
    }
  }
  return map;
}

function appliedVersions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  return new Map(rows.map((r) => [Number(r.version), String(r.name)]));
}

/** 判断一条语句是否可安全跳过（对象已存在）。返回跳过原因或 null。 */
function skipReason(db, stmt) {
  const addCol = /^ALTER\s+TABLE\s+([A-Za-z0-9_"]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_"]+)/i.exec(stmt);
  if (addCol) {
    const table = addCol[1].replace(/"/g, '');
    const column = addCol[2].replace(/"/g, '');
    const cols = columnsOf(db, table);
    if (cols === null) return null;                 // 表都没有，交给 SQLite 报错
    return cols.includes(column) ? `列已存在 ${table}.${column}` : null;
  }
  const createTable = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_"]+)/i.exec(stmt);
  if (createTable) {
    const table = createTable[1].replace(/"/g, '');
    return tableExists(db, table) ? `表已存在 ${table}` : null;
  }
  const createIndex = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_"]+)/i.exec(stmt);
  if (createIndex) {
    const index = createIndex[1].replace(/"/g, '');
    return indexExists(db, index) ? `索引已存在 ${index}` : null;
  }
  return null;
}

/**
 * 已人工复核「重复执行安全」的非 DDL 迁移白名单（key = 迁移版本）。
 *
 * 为什么需要它：`db-doctor --fix` **每次部署都会跑**，而 skipReason 只对 DDL
 * （CREATE TABLE / CREATE INDEX / ALTER ADD COLUMN）做了「对象已存在则跳过」的守卫——
 * DML 是无条件重放的。当前 003 / 007 的 DML 恰好靠自身 WHERE 条件天然幂等，
 * 但下一个没有守卫的 UPDATE、或非 OR IGNORE 的 INSERT，会被每次部署重复应用，
 * 造成难以察觉的数据漂移（例如计数器被反复累加）。
 *
 * 判据（新增迁移要进这个表，必须先满足其一）：
 *   a) 语句自带幂等子句：INSERT OR IGNORE / INSERT OR REPLACE；
 *   b) WHERE 条件在首轮执行后不再命中（如把旧 key 改成新 key、或直接删除该行）；
 *   c) 本身是 DELETE，重复执行等价于空操作。
 */
const DML_REPLAY_SAFE = new Map([
  [3, 'UPDATE/DELETE 均以 key = 旧值 为条件；首轮后旧 key 已不存在，重放为空操作'],
  [7, 'INSERT OR IGNORE + DELETE ... WHERE key IN (...)；按主键收敛，重放为空操作'],
]);

/** 去掉语句开头的 -- 注释行，便于判定首关键字。 */
function stripLeadingComments(stmt) {
  return stmt.replace(/^(?:\s*--[^\n]*\n)+/, '').trim();
}

/**
 * 非 DDL 语句的安全网：只有登记在白名单里的版本才允许被重放 DML。
 * 未登记则**抛错中止**，而不是静默跳过——静默跳过会让迁移半应用，比直接失败更危险。
 */
function assertDmlReplaySafe(version, stmt) {
  const bare = stripLeadingComments(stmt);
  if (!/^(UPDATE|INSERT|REPLACE|DELETE)\b/i.test(bare)) return; // 非 DML：DDL 已由 skipReason 处理
  if (DML_REPLAY_SAFE.has(version)) return;

  throw new Error(
    `迁移 v${version} 含非 DDL 语句，但未登记为「可安全重放」：\n`
    + `    ${bare.replace(/\s+/g, ' ').slice(0, 160)}\n`
    + '  db-doctor --fix 每次部署都会执行它，无幂等守卫的 UPDATE/INSERT 会被重复应用。\n'
    + '  处理方式：确认重复执行等价于空操作（自带 INSERT OR IGNORE，或 WHERE 在首轮后不再命中），\n'
    + `  然后在 deploy-lan/scripts/db-doctor.mjs 的 DML_REPLAY_SAFE 里登记 v${version} 并写明理由。`,
  );
}

// ───────────────────────── 备份 ─────────────────────────

function backupDatabase(db, dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* 非 WAL 时忽略 */ }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = `${dbPath}.doctor-backup-${stamp}`;
  copyFileSync(dbPath, target);
  for (const suffix of ['-wal', '-shm']) {
    const src = `${dbPath}${suffix}`;
    if (existsSync(src)) copyFileSync(src, `${target}${suffix}`);
  }
  return target;
}

// ───────────────────────── 主流程 ─────────────────────────

function setMustChangeFlag(db, value, dryRun) {
  const cols = columnsOf(db, 'users');
  if (!cols || !cols.includes('must_change_password')) {
    throw new Error('users 缺少 must_change_password 列，请先执行 --fix');
  }
  if (value === 'all') {
    const row = db.prepare('SELECT COUNT(1) AS n FROM users WHERE enabled = 1').get();
    if (!dryRun) {
      db.prepare('UPDATE users SET must_change_password = 1, updated_at = ? WHERE enabled = 1')
        .run(new Date().toISOString());
    }
    return { scope: 'all(enabled)', matched: Number(row?.n ?? 0) };
  }
  const names = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const found = [];
  const missing = [];
  for (const name of names) {
    const row = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
    if (!row) { missing.push(name); continue; }
    found.push(name);
    if (!dryRun) {
      db.prepare('UPDATE users SET must_change_password = 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);
    }
  }
  return { scope: names.join(','), matched: found.length, missing };
}

function main() {
  let opts;
  try { opts = parseArgv(process.argv.slice(2)); }
  catch (err) { console.error(`[db-doctor] ${err.message}`); process.exit(2); }

  if (opts.help) {
    console.log(readFileSync(SELF, 'utf8').split('*/')[0].split('/**')[1]);
    process.exit(0);
  }

  const { source, migrations } = loadMigrations();
  const expectedVersion = migrations.at(-1).version;

  // 目标库在解析阶段就确定，且必须存在；确定不了就直接退出，
  // 绝不带着「未知目标」继续往下走。
  let target;
  try { target = detectDatabase(opts.database); }
  catch (err) { console.error(`[db-doctor] ${err.message}`); process.exit(2); }

  const dbPath = target.path;
  const db = new DatabaseSync(dbPath);
  const report = {
    database: dbPath,
    databaseSource: target.how,
    size: statSync(dbPath).size,
    migrationsSource: source,
    expectedVersion,
    applied: [],
    pendingMigrations: [],
    missingColumns: [],
    fixed: [],
    backup: null,
    mustChange: null,
    ok: true,
  };

  try {
    const applied = appliedVersions(db);
    report.applied = [...applied.keys()].sort((a, b) => a - b);
    const expected = expectedColumns(migrations);

    // 1) 迁移版本差异
    for (const m of migrations) {
      if (!applied.has(m.version)) report.pendingMigrations.push({ version: m.version, name: m.name });
    }
    for (const version of applied.keys()) {
      if (!migrations.some((m) => m.version === version)) {
        report.pendingMigrations.push({ version, name: `数据库中存在但源码没有：${applied.get(version)}` });
      }
    }

    // 2) 关键列差异（即使迁移被登记过也检查，防止"标记已应用但列没建"）
    for (const [table, columns] of expected) {
      const cols = columnsOf(db, table);
      for (const column of columns) {
        if (!cols) report.missingColumns.push(`${table}（整表缺失）`);
        else if (!cols.includes(column)) report.missingColumns.push(`${table}.${column}`);
      }
    }
    report.ok = report.pendingMigrations.length === 0 && report.missingColumns.length === 0;

    // 3) 修复
    if (opts.fix && !report.ok) {
      if (opts.backup) report.backup = backupDatabase(db, dbPath);
      for (const m of report.pendingMigrations) {
        if (typeof m.name === 'string' && m.name.startsWith('数据库中存在但源码没有')) continue;
        const migration = migrations.find((x) => x.version === m.version);
        if (!migration) continue;
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const stmt of splitStatements(migration.sql)) {
            const reason = skipReason(db, stmt);
            if (reason) { report.fixed.push(`v${migration.version} 跳过：${reason}`); continue; }
            // DML 必须已登记为可安全重放，否则中止（详见 assertDmlReplaySafe）。
            assertDmlReplaySafe(migration.version, stmt);
            db.exec(stmt);
          }
          db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
            .run(migration.version, migration.name, new Date().toISOString());
          db.exec('COMMIT');
          report.fixed.push(`v${migration.version} ${migration.name} 已应用`);
        } catch (err) {
          try { db.exec('ROLLBACK'); } catch { /* 已结束事务 */ }
          throw new Error(`应用迁移 v${migration.version} 失败：${err.message}`);
        }
      }
      // 补登记后仍缺的列（迁移被误标记过的场景）
      for (const m of migrations) {
        for (const stmt of splitStatements(m.sql)) {
          const addCol = /^ALTER\s+TABLE\s+([A-Za-z0-9_"]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_"]+)/i.exec(stmt);
          if (!addCol) continue;
          const table = addCol[1].replace(/"/g, '');
          const column = addCol[2].replace(/"/g, '');
          const cols = columnsOf(db, table);
          if (cols && !cols.includes(column)) {
            db.exec(stmt);
            report.fixed.push(`补列 ${table}.${column}`);
          }
        }
      }
      // 复检
      const after = appliedVersions(db);
      report.applied = [...after.keys()].sort((a, b) => a - b);
      report.pendingMigrations = migrations.filter((m) => !after.has(m.version))
        .map((m) => ({ version: m.version, name: m.name }));
      const still = [];
      for (const [table, columns] of expected) {
        const cols = columnsOf(db, table);
        for (const column of columns) {
          if (!cols || !cols.includes(column)) still.push(`${table}.${column}`);
        }
      }
      report.missingColumns = still;
      report.ok = still.length === 0;
    }

    // 4) 可选：置位强制改密
    if (opts.setMustChange) {
      report.mustChange = setMustChangeFlag(db, opts.setMustChange, !opts.fix);
    }
  } finally {
    db.close();
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (opts.quiet) {
    console.log(report.ok
      ? `[db-doctor] ${dbPath} 结构已是最新（v${expectedVersion}）`
      : `[db-doctor] ${dbPath} 结构落后：待应用迁移 ${report.pendingMigrations.map((m) => m.version).join(',') || '无'}，缺列 ${report.missingColumns.join(',') || '无'}`);
  } else {
    console.log('');
    console.log('═'.repeat(60));
    console.log('  数据库结构体检（db-doctor）');
    console.log('═'.repeat(60));
    console.log(`  数据库       : ${dbPath}（${(report.size / 1024).toFixed(0)} KB）`);
    console.log(`  目标来源     : ${report.databaseSource}`);
    console.log(`  迁移来源     : ${source === 'src' ? '源码 src/db/migrations（最新）' : 'dist 编译产物'}`);
    console.log(`  期望版本     : v${expectedVersion}`);
    console.log(`  已应用版本   : ${report.applied.join(', ') || '（无）'}`);
    console.log(`  待应用迁移   : ${report.pendingMigrations.map((m) => `v${m.version}(${m.name})`).join(', ') || '（无）'}`);
    console.log(`  缺失列       : ${report.missingColumns.join(', ') || '（无）'}`);
    if (report.backup) console.log(`  修复前备份   : ${report.backup}`);
    if (report.fixed.length > 0) {
      console.log('  本次修复     :');
      for (const line of report.fixed) console.log(`    · ${line}`);
    }
    if (report.mustChange) {
      console.log(`  强制改密置位 : 范围 ${report.mustChange.scope}，影响 ${report.mustChange.matched} 人`
        + (report.mustChange.missing?.length ? `，不存在的用户：${report.mustChange.missing.join(',')}` : '')
        + (opts.fix ? '' : '（未加 --fix，仅试算未写入）'));
    }
    console.log(report.ok ? '  结论         : ✔ 结构已是最新' : '  结论         : ✘ 结构落后');
    console.log('═'.repeat(60));
    if (!report.ok && !opts.fix) {
      console.log('  修复命令：node deploy-lan/scripts/db-doctor.mjs --fix');
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main();
