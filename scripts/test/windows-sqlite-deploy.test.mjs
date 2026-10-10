/* global process */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { writeZip, dirFilesRecursive, waitPort } from '../../deploy-lan/scripts/lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const { MIGRATIONS } = require(join(ROOT, 'apps/server/dist/db/migrations.js'));

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** 应用进程替身；数据库备份、迁移、密钥校验及恢复均执行真实编译产物。 */
function serviceCli(tag, failure = '') {
  return `import {appendFileSync,existsSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionEnv} from './lib.mjs';
const command=process.argv[2];
appendFileSync(process.env.SCIENCEING_TEST_EVENTS, '${tag}:'+command+'\\n');
const root=process.env.SCIENCEING_RUNTIME_DIR || resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const marker=join(root,'test-service.running');
const fail='${failure}';
if(command==='stop') { if(fail==='stop') process.exit(5); if(existsSync(marker)) rmSync(marker); }
else if(command==='start') { writeFileSync(marker,'running'); if(fail==='start'||fail==='stop') process.exit(6); }
else if(command==='status') { if(!existsSync(marker)) process.exit(7); }
else if(command==='extension:pack') {}
else {
  const scripts={'db:migrate':'migrate.js','db:verify':'verify.js','db:seed':'seed.js'};
  const file=join(dirname(fileURLToPath(import.meta.url)),'../../apps/server/dist/db',scripts[command]);
  const child=spawnSync(process.execPath,[file,...process.argv.slice(3)],{env:productionEnv(),stdio:'inherit',windowsHide:true});
  process.exit(child.status ?? 1);
}
`;
}

function makeRelease(source, tag, failure = '') {
  const bundle = join(source, 'bundle-' + tag);
  mkdirSync(join(bundle, 'apps/server'), { recursive: true });
  cpSync(join(ROOT, 'apps/server/dist'), join(bundle, 'apps/server/dist'), { recursive: true });
  mkdirSync(join(bundle, 'deploy-lan/scripts'), { recursive: true });
  cpSync(join(ROOT, 'deploy-lan/scripts/lib.mjs'), join(bundle, 'deploy-lan/scripts/lib.mjs'));
  cpSync(join(ROOT, 'deploy-lan/config.env'), join(bundle, 'deploy-lan/config.env'));
  writeFileSync(join(bundle, 'deploy-lan/scripts/deploy.mjs'), serviceCli(tag, failure));
  const maintenance = join(bundle, 'apps/server/dist/db/maintenance.js');
  cpSync(maintenance, maintenance.replace('.js', '.impl.js'));
  writeFileSync(maintenance, `const fs=require('node:fs');
fs.appendFileSync(process.env.SCIENCEING_TEST_EVENTS,'${tag}:'+process.argv[2]+'\\n');
const r=require('node:child_process').spawnSync(process.execPath,[__dirname+'/maintenance.impl.js',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
process.exit(r.status ?? 1);`);
  let schemaVersion = 7;
  if (failure === 'migration') {
    const migrations = join(bundle, 'apps/server/dist/db/migrations.js');
    writeFileSync(migrations, readFileSync(migrations, 'utf8') + `\nexports.MIGRATIONS.push({version:8,name:'broken',sql:'CREATE TABLE partial(id INTEGER); INSERT INTO missing_table VALUES(1)'}); exports.CURRENT_SCHEMA_VERSION=8;`);
    schemaVersion = 8;
  }
  writeFileSync(join(bundle, 'release.json'), JSON.stringify({ version: tag, commit: 'a'.repeat(40), schemaVersion }));
  const zip = join(source, 'scienceing-' + tag + '.zip');
  writeZip(zip, dirFilesRecursive(bundle));
  writeFileSync(zip + '.sha256', createHash('sha256').update(readFileSync(zip)).digest('hex'));
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-deploy-'));
  const source = join(root, 'incoming');
  const install = join(root, 'production');
  const legacy = join(root, 'old-app');
  const events = join(root, 'events.log');
  mkdirSync(source);
  mkdirSync(join(legacy, 'data'), { recursive: true });
  mkdirSync(join(legacy, 'deploy-lan/scripts'), { recursive: true });
  cpSync(join(ROOT, 'deploy-lan/scripts/lib.mjs'), join(legacy, 'deploy-lan/scripts/lib.mjs'));
  writeFileSync(join(legacy, 'deploy-lan/scripts/deploy.mjs'), serviceCli('legacy'));
  writeFileSync(join(legacy, '.env'), `SCIENCEING_MASTER_KEY=${randomBytes(32).toString('hex')}\nPORT=${await freePort()}\n`);
  writeFileSync(join(legacy, 'deploy-lan/config.env'), `GATEWAY_PORT=${await freePort()}\nGATEWAY_MODE=node\n`);
  writeFileSync(events, '');
  const database = join(legacy, 'data/scienceing.db');
  const db = new DatabaseSync(database);
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)');
  for (const migration of MIGRATIONS.slice(0, 4)) {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(migration.version, migration.name, '2026-01-01');
  }
  db.exec("INSERT INTO users(id,username,display_name,password_hash,created_at,updated_at) VALUES(42,'business-user','Existing business user','synthetic-hash','2026-01-01','2026-01-01')");
  db.close();
  makeRelease(source, 'v1.0.0');
  return { root, source, install, database, events };
}

function deploy(f, tag = 'latest', extra = []) {
  const env = { ...process.env, DEPLOY_NODE: process.execPath, NODE_PATH: join(ROOT, 'apps/server/node_modules'), SCIENCEING_TEST_EVENTS: f.events };
  for (const key of ['DATABASE_PATH', 'NODE_ENV', 'SCIENCEING_RUNTIME_DIR', 'SCIENCEING_BACKUP_DIR', 'SCIENCEING_MASTER_KEY']) delete env[key];
  return spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'deploy-release.ps1'),
    '-ReleaseDirectory', f.source, '-InstallRoot', f.install, '-Tag', tag, ...extra,
  ], { env, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
}

function productionVersion(f) {
  const db = new DatabaseSync(join(f.install, 'data/scienceing.prod.db'), { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT username FROM users WHERE id=42').get().username, 'business-user');
    return db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version;
  } finally { db.close(); }
}

test('Windows 本地 ZIP 部署、重复部署、迁移失败、启动失败及停止失败保护', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture();
  try {
    let result = deploy(f, 'latest', ['-LegacyDatabasePath', f.database]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(productionVersion(f), 7);
    const sourceDb = new DatabaseSync(f.database, { readOnly: true });
    try { assert.equal(sourceDb.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, 4); } finally { sourceDb.close(); }
    assert.deepEqual(readFileSync(f.events, 'utf8').trim().split('\n'), [
      'legacy:stop', 'v1.0.0:import', 'v1.0.0:backup', 'v1.0.0:db:migrate',
      'v1.0.0:db:verify', 'v1.0.0:extension:pack', 'v1.0.0:start', 'v1.0.0:status',
    ]);
    const pointer = readFileSync(join(f.install, 'current.json'), 'utf8');
    const backupCount = readdirSync(join(f.install, 'backups')).length;
    result = deploy(f, 'v1.0.0');
    assert.notEqual(result.status, 0);
    assert.equal(readdirSync(join(f.install, 'backups')).length, backupCount);

    makeRelease(f.source, 'v1.0.4');
    const previousCli = join(f.install, 'releases/v1.0.0/deploy-lan/scripts/deploy.mjs');
    writeFileSync(previousCli, serviceCli('v1.0.0', 'stop'));
    writeFileSync(f.events, '');
    result = deploy(f, 'v1.0.4');
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(f.events, 'utf8').trim().split('\n'), ['v1.0.0:stop']);
    assert.equal(readdirSync(join(f.install, 'backups')).length, backupCount);
    assert.equal(readFileSync(join(f.install, 'current.json'), 'utf8'), pointer);
    assert.equal(productionVersion(f), 7);
    writeFileSync(previousCli, serviceCli('v1.0.0'));

    for (const [tag, failure] of [['v1.0.1', 'migration'], ['v1.0.2', 'start'], ['v1.0.3', 'stop']]) {
      makeRelease(f.source, tag, failure);
      writeFileSync(f.events, '');
      const beforePreserved = readdirSync(join(f.install, 'data')).filter((name) => name.includes('.failed-')).length;
      result = deploy(f, tag);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      assert.equal(readFileSync(join(f.install, 'current.json'), 'utf8'), pointer);
      assert.equal(productionVersion(f), 7);
      const events = readFileSync(f.events, 'utf8').trim().split('\n');
      if (failure === 'migration') assert.ok(!events.includes(tag + ':start'));
      if (failure === 'stop') {
        assert.ok(!events.includes(tag + ':restore'), '停止失败时禁止恢复数据库');
        assert.ok(!events.includes('v1.0.0:start'), '停止失败时禁止重新启动旧版本');
        assert.equal(readdirSync(join(f.install, 'data')).filter((name) => name.includes('.failed-')).length, beforePreserved);
      } else {
        assert.ok(events.includes(tag + ':restore'), `${failure}: ${events.join(', ')}\n${result.stdout}${result.stderr}`);
        assert.equal(events.at(-1), 'v1.0.0:start');
      }
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('Windows 停止命令拒绝错误 PID，并能停止自己的临时网关', { skip: process.platform !== 'win32' }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scienceing-stop-'));
  mkdirSync(join(root, 'run'));
  const backendPort = await freePort();
  const gatewayPort = await freePort();
  writeFileSync(join(root, '.env'), `PORT="${backendPort}"\n`);
  writeFileSync(join(root, 'config.env'), `GATEWAY_PORT='${gatewayPort}'\nLAN_IP=127.0.0.1\nGATEWAY_MODE=node\n`);
  writeFileSync(join(root, 'foreign.mjs'), 'setInterval(() => {}, 1000);');
  const foreign = spawn(process.execPath, [join(root, 'foreign.mjs')], { stdio: 'ignore', windowsHide: true });
  let gateway;
  t.after(() => {
    foreign.kill();
    gateway?.kill();
    rmSync(root, { recursive: true, force: true });
  });
  const pidFile = join(root, 'run/gateway-node.pid');
  writeFileSync(pidFile, JSON.stringify({ pid: foreign.pid }));
  const stop = () => spawnSync(process.execPath, [join(ROOT, 'deploy-lan/scripts/deploy.mjs'), 'stop'], {
    env: { ...process.env, DEPLOY_NODE: process.execPath, SCIENCEING_RUNTIME_DIR: root },
    encoding: 'utf8', windowsHide: true, timeout: 45_000,
  });
  let result = stop();
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /非本项目进程/);
  assert.doesNotThrow(() => process.kill(foreign.pid, 0));
  assert.equal(JSON.parse(readFileSync(pidFile, 'utf8')).pid, foreign.pid);

  gateway = spawn(process.execPath, [join(ROOT, 'deploy-lan/scripts/gateway.mjs'), '--root', root,
    '--api', `http://127.0.0.1:${backendPort}`, '--port', String(gatewayPort)], { stdio: 'ignore', windowsHide: true });
  assert.equal(await waitPort(gatewayPort, 10_000), true);
  writeFileSync(pidFile, JSON.stringify({ pid: gateway.pid }));
  result = stop();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.throws(() => process.kill(gateway.pid, 0));
  assert.doesNotThrow(() => process.kill(foreign.pid, 0));
});
