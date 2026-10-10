"""在临时 Git 仓库构建真实 Tag 制品；不提交、打 Tag 或推送当前项目。"""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which('node')


class ReleaseTests(unittest.TestCase):
    def command(self, args, **options):
        result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', **options)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_extension_identity_is_stable_and_private_key_is_external(self):
        with tempfile.TemporaryDirectory(prefix='scienceing-extension-test-') as raw:
            directory = Path(raw)
            key = directory / 'secrets/extension-key.pem'
            output = directory / 'downloads'
            args = [NODE, str(ROOT / 'deploy-cloud/scripts/patch-extension.mjs'), '--host', 'dashboard.test',
                    '--key-file', str(key), '--output', str(output)]
            self.command(args)
            metadata = json.loads((output / 'extension.json').read_text())
            original_key = key.read_bytes()
            self.command(args)
            self.assertEqual(metadata['extensionId'], json.loads((output / 'extension.json').read_text())['extensionId'])
            self.assertEqual(key.read_bytes(), original_key)
            data = (output / 'scienceing-extension.zip').read_bytes()
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                self.assertIsNone(archive.testzip())
                manifest = json.loads(archive.read('manifest.json'))
                self.assertTrue(manifest['key'])
                self.assertIn('https://dashboard.test/*', manifest['host_permissions'])
                self.assertIn(b"API_BASE = 'https://dashboard.test'", archive.read('src/lib/config.js'))
                for name in archive.namelist():
                    self.assertNotIn(b'PRIVATE KEY', archive.read(name))
            self.assertEqual(hashlib.sha256(data).hexdigest(), json.loads((output / 'extension.json').read_text())['sha256'])
            rejected = subprocess.run([*args[:2], '--host', 'dashboard.test', '--key-file', str(output / 'key.pem'), '--output', str(output)], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            rejected = subprocess.run([*args[:2], '--host', 'dashboard.test', '--key-file', str(output / '..keys/key.pem'), '--output', str(output)], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)

    @unittest.skipUnless(os.name == 'nt', '正式发布入口为 Windows PowerShell')
    def test_tag_release_contains_extension_and_matching_cloud_operations(self):
        with tempfile.TemporaryDirectory(prefix='scienceing-tag-release-test-') as raw:
            directory = Path(raw)
            fixture = directory / 'repository'
            fixture.mkdir()
            files = self.command(['git', '-c', f'safe.directory={ROOT.as_posix()}', 'ls-files', '-co', '--exclude-standard'], cwd=ROOT).splitlines()
            roots = ('apps/', 'packages/', 'playwright/worker/', 'deploy-cloud/', 'deploy-lan/scripts/')
            names = {'.gitignore', '.npmrc', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json',
                     'create-release.ps1', 'deploy-release.ps1', 'make-release.ps1', 'deploy-prod.bat', 'deploy.cmd',
                     'sync-from-dev.ps1', 'DEPLOYMENT.md', 'deploy-lan/config.env'}
            for name in set(files):
                if (name in names or name.startswith(roots)) and (ROOT / name).is_file():
                    destination = fixture / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(ROOT / name, destination)
            self.command(['git', 'init'], cwd=fixture)
            self.command(['git', 'add', '.'], cwd=fixture)
            self.command(['git', '-c', 'user.name=Release Fixture', '-c', 'user.email=fixture@invalid.test', 'commit', '-m', 'Synthetic release fixture'], cwd=fixture)
            self.command(['git', 'tag', 'v0.0.1'], cwd=fixture)
            # 工作区污染应当完全不进入 Tag 快照制品。
            (fixture / 'deploy-cloud/scripts/patch-extension.mjs').write_text("throw new Error('working tree must not be packaged');\n")
            output = directory / 'release'
            environment = dict(os.environ, PYTHONUTF8='1', npm_config_store_dir=str(ROOT / '.pnpm-store'))
            self.command([shutil.which('pwsh') or 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(fixture / 'create-release.ps1'),
                          '-Tag', 'v0.0.1', '-CloudHost', 'dashboard.test', '-ExtensionKeyPath', str(directory / 'secrets/extension-key.pem'),
                          '-OutputDirectory', str(output)], cwd=fixture, env=environment, timeout=900)
            release = output / 'scienceing-v0.0.1.zip'
            self.assertEqual(hashlib.sha256(release.read_bytes()).hexdigest(), Path(str(release) + '.sha256').read_text().split()[0])
            with zipfile.ZipFile(release) as archive:
                names = archive.namelist()
                self.assertIn('deploy-cloud/Dockerfile', names)
                self.assertIn(b'playwright:v1.62.1-noble', archive.read('deploy-cloud/Dockerfile'))
                metadata = json.loads(archive.read('apps/web/dist/downloads/extension.json'))
                release_meta = json.loads(archive.read('release.json'))
                self.assertEqual(release_meta['extensionId'], metadata['extensionId'])
                self.assertEqual(release_meta['cloudHost'], 'dashboard.test')
                extension = archive.read('apps/web/dist/downloads/scienceing-extension.zip')
                self.assertEqual(hashlib.sha256(extension).hexdigest(), metadata['sha256'])
                with zipfile.ZipFile(io.BytesIO(extension)) as inner:
                    self.assertTrue(json.loads(inner.read('manifest.json'))['key'])
                    self.assertIn(b"API_BASE = 'https://dashboard.test'", inner.read('src/lib/config.js'))
                for name in names:
                    if name.endswith('.sh'):
                        self.assertNotIn(b'\r\n', archive.read(name))
                    self.assertFalse(name.endswith(('.pem', '.db', '.key')) or Path(name).name.startswith('.env'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
