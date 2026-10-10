"""临时库 + 真实 Bash 控制流 + 真实 SQLite CLI；Docker、TLS 与外部服务均为替身。"""
import hashlib
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which('node')
BASH = os.environ.get('SCIENCEING_TEST_BASH') or (str(Path(shutil.which('git')).parents[1] / 'bin/bash.exe') if os.name == 'nt' else shutil.which('bash'))


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='scienceing-cloud-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.environment = dict(os.environ, DEPLOY_ROOT=str(self.root), SCIENCEING_TEST_ROOT=str(self.root),
                                PYTHONUTF8='1',
                                SCIENCEING_TEST_NODE=NODE, SCIENCEING_TEST_NODE_PATH=str(ROOT / 'apps/server/node_modules'),
                                SCIENCEING_TEST_CYGPATH=str(Path(BASH).parents[1] / 'usr/bin/cygpath.exe'))
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        for command in ('docker', 'curl', 'openssl', 'sleep', 'flock'):
            body = f'#!/usr/bin/env bash\nMSYS2_ARG_CONV_EXCL="*" exec "{Path(sys.executable).as_posix()}" "{(ROOT / "scripts/test/cloud-command-fixture.py").as_posix()}" {command} "$@"\n'
            (self.bin / command).write_text(body, newline='\n')
            (self.bin / command).chmod(0o755)
        (self.bin / 'python3').write_text(f'#!/usr/bin/env bash\nMSYS2_ARG_CONV_EXCL="/backups/" exec "{Path(sys.executable).as_posix()}" "$@"\n', newline='\n')
        (self.bin / 'python3').chmod(0o755)
        self.environment['PATH'] = str(self.bin) + os.pathsep + os.environ['PATH']
        environment_file = self.root / 'test-env.sh'
        if os.name == 'nt':
            environment_file.write_text(f'export PATH="$(cygpath -u \'{self.bin.as_posix()}\'):$PATH"\n', newline='\n')
            self.environment['BASH_ENV'] = str(environment_file)
        selected = subprocess.check_output([BASH, '-c', 'command -v docker'], env=self.environment, text=True).strip()
        if os.name == 'nt':
            selected = subprocess.check_output([self.environment['SCIENCEING_TEST_CYGPATH'], '-w', selected], text=True).strip()
        self.assertEqual(Path(selected).resolve(), (self.bin / 'docker').resolve(), '必须使用命令替身，禁止调用真实 Docker')
        self.root.joinpath('state.json').write_text(json.dumps(dict(events=[], running=True, app_starts=0, renewed=False)))
        shutil.copytree(ROOT / 'deploy-cloud/scripts', self.root / 'scripts')
        shutil.copytree(ROOT / 'deploy-cloud/nginx', self.root / 'nginx')
        shutil.copyfile(ROOT / 'deploy-cloud/docker-compose.yml', self.root / 'docker-compose.yml')
        self.root.joinpath('.env').write_text('DASHBOARD_HOST=dashboard.test\nSCIENCEING_EXTENSION_IDS=' + 'a' * 32 + '\nCORS_ORIGINS=https://dashboard.test,chrome-extension://' + 'a' * 32 + '\n')
        self.old = self.root / 'images/v1.0.0'
        self.bundle(self.old, 'v1.0.0')
        shutil.copytree(self.old, self.root / 'release')
        self.root.joinpath('current.json').write_text(json.dumps(dict(tag='v1.0.0')))
        self.root.joinpath('data').mkdir()
        self.database = self.root / 'data/scienceing.prod.db'
        script = f"const{{DatabaseSync}}=require('node:sqlite');const{{migrate}}=require({json.dumps(str(ROOT / 'apps/server/dist/db/migrate.js'))});const db=new DatabaseSync({json.dumps(str(self.database))});migrate(db);db.exec(\"INSERT INTO users(id,username,display_name,password_hash,created_at,updated_at) VALUES(42,'business','original-record','synthetic','2026-01-01','2026-01-01')\");db.close();"
        subprocess.run([NODE, '-e', script], check=True, capture_output=True)
        self.new = self.root / 'incoming'
        self.bundle(self.new, 'v2.0.0')
        self.zip = self.root / 'scienceing-v2.0.0.zip'
        with zipfile.ZipFile(self.zip, 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in self.new.rglob('*'):
                if file.is_file():
                    archive.write(file, file.relative_to(self.new).as_posix())
        Path(str(self.zip) + '.sha256').write_text(hashlib.sha256(self.zip.read_bytes()).hexdigest())

    def bundle(self, directory, tag):
        shutil.copytree(ROOT / 'apps/server/dist', directory / 'apps/server/dist')
        shutil.copytree(ROOT / 'deploy-cloud', directory / 'deploy-cloud', ignore=shutil.ignore_patterns('*.pem', '.env', '.ext-staging'))
        downloads = directory / 'apps/web/dist/downloads'
        downloads.mkdir(parents=True)
        with zipfile.ZipFile(downloads / 'scienceing-extension.zip', 'w') as archive:
            archive.writestr('manifest.json', json.dumps(dict(version='1.3.0', key='synthetic-public-key')))
        meta = dict(version='1.3.0', fileName='scienceing-extension.zip', size=(downloads / 'scienceing-extension.zip').stat().st_size,
                    downloadPath='/downloads/scienceing-extension.zip', dashboardOrigin='https://dashboard.test', extensionId='a' * 32,
                    sha256=hashlib.sha256((downloads / 'scienceing-extension.zip').read_bytes()).hexdigest())
        downloads.joinpath('extension.json').write_text(json.dumps(meta))
        directory.joinpath('release.json').write_text(json.dumps(dict(version=tag, commit='a' * 40, schemaVersion=8 if tag == 'v2.0.0' else 7, cloudHost='dashboard.test', extensionId='a' * 32)))
        if tag == 'v2.0.0':
            with directory.joinpath('apps/server/dist/db/migrations.js').open('a') as f:
                f.write("\nexports.MIGRATIONS.push({version:8,name:'fixture_add_table',sql:'CREATE TABLE deployment_probe(id INTEGER);'});exports.CURRENT_SCHEMA_VERSION=8;\n")

    def run_script(self, name='deploy.sh', args=None, failure=''):
        environment = dict(self.environment, SCIENCEING_TEST_FAILURE=failure)
        # Windows 禁止移动 Bash 正在读取的目录；从独立入口运行同一脚本验证 Linux 控制流。
        runner = self.root / 'runner'
        runner.mkdir(exist_ok=True)
        for file in (name, 'operations.sh'):
            # Windows Bash 子进程很慢；仅在临时入口缩短重试次数，生产仍为 30 次。
            body = (self.root / 'scripts' / file).read_text().replace('for _ in {1..30}', 'for _ in {1..2}')
            (runner / file).write_text(body, encoding='utf-8', newline='\n')
        try:
            result = subprocess.run([BASH, str(runner / name), *(args if args is not None else [str(self.zip)])],
                                    cwd=self.root, env=environment, capture_output=True, text=True, encoding='utf-8', timeout=180)
        except subprocess.TimeoutExpired as error:
            raise AssertionError(f'脚本超时：{error.stdout!r}\n{error.stderr!r}') from error
        self.output = result.stdout + result.stderr
        return result.returncode

    def state(self):
        return json.loads(self.root.joinpath('state.json').read_text())

    def schema(self):
        with closing(sqlite3.connect(self.database)) as connection:
            return connection.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0]

    def original_record(self):
        with closing(sqlite3.connect(self.database)) as connection:
            return connection.execute('SELECT display_name FROM users WHERE id=42').fetchone()[0]

    def test_success_preserves_data_and_pairs_snapshot(self):
        self.assertEqual(self.run_script(), 0, self.output)
        self.assertEqual(self.original_record(), 'original-record')
        self.assertEqual(self.schema(), 8)
        events = self.state()['events']
        self.assertNotIn('seed', [e['event'] for e in events])
        self.assertLess(next(i for i,e in enumerate(events) if e['event']=='stop'), next(i for i,e in enumerate(events) if e['event']=='backup'))
        self.assertEqual(json.loads(self.root.joinpath('current.json').read_text())['tag'], 'v2.0.0')
        paired = json.loads(self.root.joinpath('rollback.json').read_text())
        self.assertTrue(Path(paired['release']).is_dir())
        self.assertTrue((self.root / 'backups' / paired['snapshot'].removeprefix('/backups/')).is_file())
        before = len(events)
        self.assertNotEqual(self.run_script(), 0)
        self.assertEqual(len(self.state()['events']), before)

    def test_pre_activation_failures_restore_database_and_old_version(self):
        for failure in ('migration', 'verify', 'startup', 'tls', 'redirect', 'html', 'zip'):
            with self.subTest(failure=failure):
                self.assertNotEqual(self.run_script(failure=failure), 0, self.output)
                self.assertEqual(self.schema(), 7, self.output)
                self.assertEqual(self.original_record(), 'original-record')
                self.assertEqual(json.loads(self.root.joinpath('current.json').read_text())['tag'], 'v1.0.0')
                self.assertTrue(self.state()['running'], self.output)
                self.assertFalse(self.root.joinpath('deployment.pending.json').exists())
                # 每个子场景独立，避免镜像与失败留存相互影响。
                self.temporary.cleanup()
                self.setUp()

    def test_build_backup_and_stop_failures_never_migrate(self):
        for failure in ('build', 'backup', 'stop'):
            with self.subTest(failure=failure):
                self.assertNotEqual(self.run_script(failure=failure), 0, self.output)
                self.assertEqual(self.schema(), 7)
                self.assertNotIn('migrate', [e['event'] for e in self.state()['events']])
                self.temporary.cleanup()
                self.setUp()

    def test_restore_failure_keeps_service_stopped_and_new_database(self):
        self.assertNotEqual(self.run_script(failure='verify,restore'), 0)
        self.assertFalse(self.state()['running'], self.output)
        self.assertEqual(self.schema(), 8)
        self.assertTrue(self.root.joinpath('deployment.pending.json').exists())

    def test_activation_failure_never_overwrites_new_database(self):
        self.assertNotEqual(self.run_script(failure='activation'), 0)
        self.assertFalse(self.state()['running'], self.output)
        self.assertEqual(self.schema(), 8)
        self.assertNotIn('restore', [e['event'] for e in self.state()['events']])

    def test_old_version_health_failure_keeps_service_stopped(self):
        self.assertNotEqual(self.run_script(failure='verify,rollback-health'), 0)
        self.assertEqual(self.schema(), 7)
        self.assertFalse(self.state()['running'], self.output)
        self.assertTrue(self.root.joinpath('deployment.pending.json').exists())

    def test_initialize_is_explicit_and_cannot_overwrite_existing_data(self):
        self.assertNotEqual(self.run_script(args=[str(self.zip),'--initialize']), 0)
        self.assertEqual(self.original_record(), 'original-record')
        self.database.unlink()
        self.root.joinpath('current.json').unlink()
        self.assertNotEqual(self.run_script(), 0)
        wal = self.database.with_name(self.database.name + '-wal')
        wal.write_bytes(b'preserved fixture WAL')
        self.assertNotEqual(self.run_script(args=[str(self.zip),'--initialize']), 0)
        wal.unlink()
        self.assertEqual(self.run_script(args=[str(self.zip),'--initialize']), 0, self.output)
        self.assertIn('seed', [e['event'] for e in self.state()['events']])
        self.assertEqual(self.schema(), 8)

    def test_manual_restore_stops_before_restoring_and_uses_paired_code(self):
        self.assertEqual(self.run_script(), 0, self.output)
        self.root.joinpath('.env').write_text('DASHBOARD_HOST=changed.test\n')
        self.assertEqual(self.run_script('restore.sh',['--previous']), 0, self.output)
        self.assertEqual(self.schema(), 7)
        self.assertEqual(self.original_record(), 'original-record')
        self.assertEqual(json.loads(self.root.joinpath('current.json').read_text())['tag'], 'v1.0.0')
        self.assertIn('DASHBOARD_HOST=dashboard.test', self.root.joinpath('.env').read_text())
        self.assertEqual(self.root.joinpath('current.env').read_text(), self.root.joinpath('.env').read_text())

    def test_certificate_renewal_does_not_restart_or_retag_app(self):
        certificate = self.root / 'certs/live/dashboard.test/fullchain.pem'
        certificate.parent.mkdir(parents=True)
        certificate.write_text('synthetic certificate')
        self.assertEqual(self.run_script('renew-cert.sh',[]), 0, self.output)
        events = self.state()['events']
        up = next(e for e in events if e['event']=='up')
        self.assertEqual(up['tag'], 'v1.0.0')
        self.assertIn('--no-deps', up['args'])
        self.assertEqual(self.state()['app_starts'], 0)
        self.root.joinpath('current.json').unlink()
        count = len(events)
        self.assertNotEqual(self.run_script('renew-cert.sh',[]), 0)
        self.assertEqual(len(self.state()['events']), count)


if __name__ == '__main__':
    unittest.main(verbosity=2)
