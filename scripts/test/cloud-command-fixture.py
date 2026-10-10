"""Docker/HTTPS 命令替身。数据库操作仍运行真实 Node SQLite CLI；不接触 Docker 引擎。"""
import json
from contextlib import closing
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
import sys

root = pathlib.Path(os.environ['SCIENCEING_TEST_ROOT'])
state_file = root / 'state.json'
state = json.loads(state_file.read_text())
program, *args = sys.argv[1:]
failures = os.environ.get('SCIENCEING_TEST_FAILURE', '').split(',')
tag = os.environ.get('RELEASE_TAG', 'local')


def path(value):
    if os.name == 'nt' and value.startswith('/'):
        value = subprocess.check_output([os.environ['SCIENCEING_TEST_CYGPATH'], '-w', value], text=True).strip()
    return pathlib.Path(value)


def event(name, **details):
    state['events'].append(dict(event=name, **details))
    state_file.write_text(json.dumps(state))


def finish(code=0):
    state_file.write_text(json.dumps(state))
    sys.exit(code)


if program in ('sleep', 'flock'):
    finish()
if program == 'openssl':
    if '-enddate' in args:
        print('notAfter=Oct 10 00:00:00 2026 GMT')
        finish()
    finish(0 if state.get('renewed') else 1)
if program == 'curl':
    if tag != 'v2.0.0':
        failures = ['tls'] if 'rollback-health' in failures else []
    url = args[-1]
    destination = path(args[args.index('-o') + 1]) if '-o' in args else None
    if 'tls' in failures:
        finish(60)
    if 'redirect' in failures:
        print('301', end='')
        finish()
    meta_file = root / 'release/apps/web/dist/downloads/extension.json'
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    if url.endswith('/api/extension/config'):
        body = json.dumps(dict(minimumVersion='1.0.0', latestVersion='1.3.0', package=dict(available=True, **meta))).encode()
    elif url.endswith('/extension.json'):
        body = meta_file.read_bytes()
    else:
        body = (meta_file.parent / 'scienceing-extension.zip').read_bytes()
    if 'html' in failures:
        body = b'<html>SPA fallback</html>'
    if 'zip' in failures and url.endswith('.zip'):
        body = b'not a zip'
    if destination:
        destination.write_bytes(body)
    if '-w' in args:
        print('200', end='')
    finish()

tag = os.environ.get('RELEASE_TAG', 'local')
mode = os.environ.get('SCIENCEING_DEPLOY_VERIFY_ONLY', '0')
if args[0] == 'build':
    event('build')
    if 'build' in failures:
        finish(3)
    tag = args[args.index('-t') + 1].split(':')[-1]
    shutil.copytree(path(args[-1]), root / 'images' / tag, dirs_exist_ok=True)
    finish()
if args[:2] == ['image', 'inspect']:
    finish(0 if (root / 'images' / args[2].split(':')[-1]).exists() else 1)
if args[0] != 'compose':
    raise AssertionError(args)
args = args[1:]
while args and args[0] in ('--project-directory', '-f', '--profile'):
    args = args[2:]
command, *args = args
if command == 'stop':
    event('stop', tag=tag, services=args)
    if 'stop' in failures:
        finish(4)
    if 'app' in args:
        state['running'] = False
    finish()
if command == 'ps':
    if '-q' in args and state['running']:
        print('fixture-app')
    finish()
if command == 'up':
    event('up', tag=tag, mode=mode, args=args)
    if 'gateway' in args and '--no-deps' not in args:
        state['app_starts'] += 1
    elif 'app' in args or not any(x in args for x in ('gateway', 'app')):
        state['app_starts'] += 1
    if 'app' in args or '--no-deps' not in args:
        state['running'] = True
    if tag == 'v2.0.0' and (('startup' in failures and mode == '1') or ('activation' in failures and mode == '0')):
        finish(5)
    finish()
if 'certbot' in args:
    event('certbot', tag=tag)
    state['renewed'] = True
    finish()
if 'node' not in args:
    raise AssertionError(args)
node_index = args.index('node')
node_args = args[node_index + 1:]
if node_args[0] == '-e':
    if 'readdirSync' in node_args[1]:
        if (root / 'data/scienceing.prod.db').exists():
            print('existing')
        elif any((root / 'data').iterdir()):
            finish(9)
        else:
            print('empty')
    elif 'activation-health' in failures:
        finish(6)
    finish()

script = pathlib.Path(node_args[0]).name
operation = node_args[1] if script == 'maintenance.js' else script.removesuffix('.js')
event(operation, tag=tag, mode=mode)
image = root / 'images' / tag
if operation == 'migrate' and 'migration' in failures:
    migration_file = image / 'apps/server/dist/db/migrations.js'
    migration_file.write_text(migration_file.read_text().replace('CREATE TABLE deployment_probe(id INTEGER);', 'CREATE TABLE deployment_probe(id INTEGER); INSERT INTO missing_table VALUES(1);'))
if operation in failures and tag == 'v2.0.0':
    if operation == 'verify' and tag == 'v2.0.0':
        with closing(sqlite3.connect(root / 'data/scienceing.prod.db')) as connection:
            connection.execute("UPDATE users SET display_name='transient-change' WHERE id=42")
            connection.commit()
    finish(7)
if operation == 'verify' and tag == 'v1.0.0' and 'rollback-verify' in failures:
    finish(7)
translated = [str(image / node_args[0].removeprefix('/app/'))]
for arg in node_args[1:]:
    translated.append(str(root / 'backups' / arg.removeprefix('/backups/')) if arg.startswith('/backups/') else arg)
environment = dict(os.environ, NODE_ENV='production', DATABASE_PATH=str(root / 'data/scienceing.prod.db'), SCIENCEING_MASTER_KEY='11' * 32,
                   ADMIN_INITIAL_PASSWORD='synthetic-admin-123', NODE_PATH=os.environ['SCIENCEING_TEST_NODE_PATH'])
result = subprocess.run([os.environ['SCIENCEING_TEST_NODE'], *translated], env=environment, capture_output=True, text=True, encoding='utf-8')
if operation == 'backup' and result.returncode == 0:
    payload = json.loads(result.stdout)
    payload['path'] = '/backups/' + pathlib.Path(payload['path']).relative_to(root / 'backups').as_posix()
    print(json.dumps(payload))
else:
    print(result.stdout, end='')
sys.stderr.write(result.stderr)
finish(result.returncode)
