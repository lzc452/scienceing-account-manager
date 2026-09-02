import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, normalizeVersion, isVersionAtLeast } from '../src/lib/version.js';

test('compareVersions：逐段数值比较（1.10.0 > 1.2.0）', () => {
  assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('compareVersions：基础大小关系', () => {
  assert.equal(compareVersions('1.0.0', '1.1.0'), -1);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  assert.equal(compareVersions('1.2.0', '1.1.9'), 1);
});

test('normalizeVersion：去前导 v 与预发布后缀', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.0.0-beta.1'), '1.0.0');
  assert.equal(normalizeVersion('  1.2.0  '), '1.2.0');
});

test('compareVersions：缺失段视为 0', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.2', '1.2.1'), -1);
  assert.equal(compareVersions('1', '0.9.9'), 1);
});

test('isVersionAtLeast：最低版本门槛（对应 extension_min_version）', () => {
  assert.equal(isVersionAtLeast('1.0.0', '1.0.0'), true);
  assert.equal(isVersionAtLeast('1.1.0', '1.0.0'), true);
  assert.equal(isVersionAtLeast('1.0.0', '1.1.0'), false);
});
