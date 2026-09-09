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
 *   node deploy-lan/scripts/db-doctor.mjs --database <abs.db>   # 指定库（默认自动探测）
 *   node deploy-lan/scripts/db-doctor.mjs --set-must-change all # 补齐后让所有人下次登录改密
 *   node deploy-lan/scripts/db-doctor.mjs --set-must-change a,b # 只让指定用户改密
 *   node deploy-lan/scripts/db-doctor.mjs --quiet               # 只输出结果行（供部署脚本调用）
 *   node deploy-lan/scripts/db-doctor.mjs --json                # JSON 输出
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

function candidateDatabases() {
  const list = [];
  if (process.env.DATABASE_PATH) list.push(resolve(process.env.DATABASE_PATH));
  const dataDir = join(REPO_ROOT, 'data');
  for (const name of ['scienceing.prod.db', 'scienceing.dev.db', 'scienceing.db']) {
    list.push(join(dataDir, name));
  }
  return list;
}

function detectDatabase(explicit) {
  if (explicit) {
    const p = resolve(explicit);
    if (!existsSync(p)) throw new Error(`指定的数据库不存在：${p}`);
    return p;
  }
  const hit = candidateDatabases().find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      `未找到数据库，已尝试：\n  ${candidateDatabases().join('\n  ')}\n`
      + '  请用 --database <绝对路径> 指定，或先部署一次生成数据库。',
    );
  }
  return hit;
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
  const dbPath = detectDatabase(opts.database);
  const db = new DatabaseSync(dbPath);
  const report = {
    database: dbPath,
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
