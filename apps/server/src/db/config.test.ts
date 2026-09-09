import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDatabasePathForEnvironment } from './config';

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
