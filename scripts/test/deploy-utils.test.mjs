/* global process */
/**
 * 部署脚本工具函数回归测试
 *
 * 覆盖：
 *  - L1-22 isOurServiceCmd：进程归属判定不得再用裸子串 `scienceing`
 *    （否则仓库目录下的编辑器/终端会被当成本项目服务进程强杀）
 *  - L1-26 clearDirectoryExcept：构建产物清理须保留 downloads/
 *  - L1-24 ensureNginxPrefix：日志轮转须保留 nginx.pid
 *
 * 运行：node --test scripts/test/deploy-utils.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readdirSync, existsSync, rmSync, rmdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SCRIPTS = join(REPO_ROOT, 'deploy-lan', 'scripts');
const MOD = (name) => `file:///${join(SCRIPTS, name).replace(/\\/g, '/')}`;

// 必须**在 import 之前**设好：NGINX_PREFIX 在 lib.mjs 加载时求值。
// 且 lib.mjs 只能加载一次（nginx-ctl.mjs 会以不带 query 的路径引用它），
// 否则 nginx-ctl 会拿到未隔离的实例、去轮转真实的 deploy-lan/nginx-prefix。
const TMP_ROOT = join(REPO_ROOT, '.workbuddy-ai', 'tmp-test');
const RT = join(TMP_ROOT, 'rt-nginx');
process.env.SCIENCEING_RUNTIME_DIR = RT;

const { isOurServiceCmd, clearDirectoryExcept, NGINX_PREFIX, APP_SERVER } = await import(MOD('lib.mjs'));
const { ensureNginxPrefix } = await import(MOD('nginx-ctl.mjs'));

// 收尾：各用例只清理自己那份，跑完 TMP_ROOT 会剩一个**空目录**。
// 这里用非递归 rmdir 兜一下（非空会抛错，正好说明还有别的测试在用，忽略即可），
// 免得每跑一次测试就在工作区留下一个空壳。
after(() => {
  try {
    rmdirSync(TMP_ROOT);
  } catch {
    /* 目录非空或不存在，均无需处理 */
  }
});

// ───────────────────────── L1-22 ─────────────────────────

test('L1-22: 只把指向本项目产物的进程判为「我们的」', () => {
  const ours = [
    `"C:\\Program Files\\nodejs\\node.exe" ${join(APP_SERVER, 'dist', 'main.js')}`,
    `node ${join(SCRIPTS, 'gateway.mjs')} --port 18080`,
    `nginx.exe -p ${NGINX_PREFIX}`,
  ];
  for (const cmd of ours) {
    assert.equal(isOurServiceCmd(cmd), true, `应判为本项目进程：${cmd}`);
  }

  // 这些命令行只是「提到了仓库路径」，绝不是本项目的服务进程。
  // 旧实现用 /scienceing/ 匹配会把它们全部强杀。
  const notOurs = [
    'node dist/main.js', // 相对路径无法确认项目归属
    'nginx.exe -p D:\\another-project\\nginx-prefix',
    '"C:\\Program Files\\Microsoft VS Code\\Code.exe" D:\\studyspace\\scienceing-account-manager',
    'bash.exe -lc cd /d/studyspace/scienceing-account-manager && pnpm lint',
    'node.exe D:\\studyspace\\scienceing-account-manager\\scripts\\dev.mjs --only=web',
    'explorer.exe D:\\studyspace\\scienceing-account-manager\\data',
    '',
  ];
  for (const cmd of notOurs) {
    assert.equal(isOurServiceCmd(cmd), false, `不应判为本项目进程（会被误杀）：${cmd}`);
  }
});

// ───────────────────────── L1-26 ─────────────────────────

test('L1-26: 清理陈旧产物但保留 downloads/', (t) => {
  const dir = join(TMP_ROOT, 'dist-clean');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'downloads'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), 'new', 'utf8');
  writeFileSync(join(dir, 'assets', 'index-OLD123.js'), 'stale chunk', 'utf8');
  writeFileSync(join(dir, 'downloads', 'scienceing-extension.zip'), 'zip', 'utf8');
  writeFileSync(join(dir, 'favicon.ico'), 'icon', 'utf8');
  // 只清理本用例自己的目录：TMP_ROOT 是与其它测试文件共享的父目录，
  // 整棵删掉会连带删掉别的测试正在用的中间状态（并行跑时表现为互相干扰）。
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const removed = clearDirectoryExcept(dir, ['downloads']);
  assert.ok(removed >= 3, `应清理 assets/index.html/favicon.ico，实际清理 ${removed} 项`);

  assert.deepEqual(readdirSync(dir), ['downloads'], '只应保留 downloads/');
  assert.ok(existsSync(join(dir, 'downloads', 'scienceing-extension.zip')), '扩展 zip 必须保留');
  assert.ok(!existsSync(join(dir, 'assets', 'index-OLD123.js')), '陈旧 chunk 必须被清掉');
});

test('L1-26: 目录不存在时安全返回 0', () => {
  assert.equal(clearDirectoryExcept(join(TMP_ROOT, 'nope'), ['downloads']), 0);
});

// ───────────────────────── L1-24 ─────────────────────────

test('L1-24: ensureNginxPrefix 轮转日志并保留 nginx.pid', (t) => {
  rmSync(RT, { recursive: true, force: true });

  const logsDir = join(NGINX_PREFIX, 'logs');
  const confDir = join(NGINX_PREFIX, 'conf');
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(confDir, { recursive: true });
  // 预置 mime.types，避免函数去 nginx 安装目录复制（测试环境无 nginx）
  writeFileSync(join(confDir, 'mime.types'), 'types { text/html html; }', 'utf8');
  writeFileSync(join(logsDir, 'nginx.pid'), '12345', 'utf8');
  writeFileSync(join(logsDir, 'error.log'), '旧的错误日志内容', 'utf8');
  writeFileSync(join(logsDir, 'access.log'), '旧的访问日志内容', 'utf8');

  t.after(() => rmSync(RT, { recursive: true, force: true }));

  ensureNginxPrefix({
    nginxExe: 'D:/nonexistent/nginx.exe',
    gatewayPort: 18080,
    webDist: join(REPO_ROOT, 'apps', 'web', 'dist'),
    backendPort: 3000,
  });

  const after = readdirSync(logsDir);

  // 核心断言：pid 必须还在 —— 否则 nginx -s quit 退化成强杀
  assert.ok(after.includes('nginx.pid'), `nginx.pid 必须保留，实际：${after.join(', ')}`);
  // 历史日志应归档而非销毁（失败路径指引用户去读 error.log）
  assert.ok(after.some((f) => f.startsWith('error.log') && f.endsWith('.bak')),
    `error.log 应被轮转而非删除，实际：${after.join(', ')}`);
  assert.ok(after.some((f) => f.startsWith('access.log') && f.endsWith('.bak')),
    `access.log 应被轮转，实际：${after.join(', ')}`);
});
