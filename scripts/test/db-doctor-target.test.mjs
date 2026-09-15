/**
 * db-doctor 目标库解析回归测试
 *
 * 缺陷背景：detectDatabase() 原实现是「从候选列表里挑第一个**存在**的库」。
 * 于是当 DATABASE_PATH 指向一个还不存在的文件时，它会静默改用别的库——
 * 典型后果是在生产机上把修复打到 dev 库，输出却写着「✔ 结构已是最新」，
 * 让人以为检查过了。db-doctor --fix 会写库，这种静默换目标比直接报错危险得多。
 *
 * 修复后的契约：目标必须是「显式指定 + 确实存在」，确定不了就退出码 2。
 *   1) --database <绝对路径>（必须存在）
 *   2) DATABASE_PATH 环境变量（必须存在，不得顺延）
 *   3) 按 NODE_ENV 推导（production → prod.db，否则 dev.db；必须存在）
 *
 * 运行：node --test scripts/test/db-doctor-target.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DOCTOR = join(REPO_ROOT, 'deploy-lan', 'scripts', 'db-doctor.mjs');

/** 用受控环境运行 db-doctor；env 中值为 undefined 表示「删除该变量」。 */
function runDoctor(args, env = {}) {
  const merged = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return spawnSync(process.execPath, [DOCTOR, ...args], {
    cwd: REPO_ROOT,
    env: merged,
    encoding: 'utf8',
    windowsHide: true,
  });
}

const tmp = mkdtempSync(join(tmpdir(), 'db-doctor-target-'));
const missing = join(tmp, 'does-not-exist.db');
const emptyDb = join(tmp, 'empty.db');
writeFileSync(emptyDb, '');
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

test('DATABASE_PATH 指向不存在的库 → 报错退出，绝不改用其它库', () => {
  const r = runDoctor([], { DATABASE_PATH: missing, NODE_ENV: undefined });

  assert.equal(r.status, 2, `应退出码 2，实际 ${r.status}`);
  assert.match(r.stderr, /DATABASE_PATH 指向的数据库不存在/);
  // 关键：不得出现「已是最新」这类让人误以为检查过的措辞
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /结构已是最新|结构落后/,
    '目标不确定时不得输出任何体检结论');
});

test('NODE_ENV=production 且 prod 库不存在 → 报错，不得回落到 dev 库', () => {
  const r = runDoctor([], { NODE_ENV: 'production', DATABASE_PATH: undefined });

  assert.equal(r.status, 2, `应退出码 2，实际 ${r.status}`);
  assert.match(r.stderr, /NODE_ENV=production/);
  assert.match(r.stderr, /不会自动改用其它库/);
});

test('--database 指向不存在的库 → 报错', () => {
  const r = runDoctor(['--database', missing], { NODE_ENV: undefined, DATABASE_PATH: undefined });

  assert.equal(r.status, 2);
  assert.match(r.stderr, /指定的数据库不存在/);
});

test('--database 指向存在的库 → 使用该库并在输出中标注来源', () => {
  const r = runDoctor(['--database', emptyDb], { NODE_ENV: undefined, DATABASE_PATH: undefined });

  // 空库结构必然落后 → 退出码 1（这是正常体检结果，不是解析失败）
  assert.equal(r.status, 1, `应退出码 1（结构落后），实际 ${r.status}`);
  assert.match(r.stdout, /目标来源\s*:\s*--database 显式指定/);
  assert.ok(r.stdout.includes(emptyDb), '输出必须回显实际使用的库路径');
});

test('DATABASE_PATH 指向存在的库 → 正常体检（部署流程走的就是这条路径）', () => {
  // 不传 --database，只靠 DATABASE_PATH —— deploy.mjs / deploy-release.ps1 正是这样调用
  const r = runDoctor([], { DATABASE_PATH: emptyDb, NODE_ENV: 'production' });

  assert.equal(r.status, 1, `应退出码 1（结构落后），实际 ${r.status}`);
  assert.match(r.stdout, /目标来源\s*:\s*DATABASE_PATH 环境变量/);
  assert.ok(r.stdout.includes(emptyDb), '输出必须回显实际使用的库路径');
});
