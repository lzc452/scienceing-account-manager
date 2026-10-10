import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { assertDatabasePathForEnvironment, assertExternalDatabasePath } from './config';

test('开发与生产数据库后缀严格隔离', () => {
  assert.doesNotThrow(() => assertDatabasePathForEnvironment('D:\\data\\scienceing.dev.db', 'development'));
  assert.doesNotThrow(() => assertDatabasePathForEnvironment('D:\\data\\scienceing.prod.db', 'production'));
  assert.throws(
    () => assertDatabasePathForEnvironment('D:\\data\\scienceing.dev.db', 'production'),
    /开发库与生产库禁止复用/,
  );
  assert.throws(
    () => assertDatabasePathForEnvironment('D:\\data\\scienceing.prod.db', 'development'),
    /开发库与生产库禁止复用/,
  );
});

test('拒绝发布目录内、相对路径及前缀相似的数据库路径', () => {
  const root = resolve(__dirname, '..', '..', '..', '..');
  assert.throws(() => assertExternalDatabasePath(resolve(root, 'data/scienceing.prod.db')), /发布目录之外/);
  assert.throws(() => assertExternalDatabasePath(resolve(root, '..folder/scienceing.prod.db')), /发布目录之外/);
  assert.throws(() => assertExternalDatabasePath('data/scienceing.prod.db'), /绝对路径/);
  assert.doesNotThrow(() => assertExternalDatabasePath(resolve(root, '../separate-data/scienceing.prod.db')));
});
