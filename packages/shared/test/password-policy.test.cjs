'use strict';
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  isPasswordAllowed,
  passwordCharacterLength,
  passwordUtf8ByteLength,
} = require('../password-policy.cjs');

test('密码最少按 Unicode 字符计数、bcrypt 上限按 UTF-8 字节计数', () => {
  assert.equal(passwordCharacterLength('😀'.repeat(8)), 8);
  assert.equal(passwordUtf8ByteLength('密'.repeat(24)), 72);
  assert.equal(passwordUtf8ByteLength('密'.repeat(25)), 75);
  assert.equal(isPasswordAllowed('密'.repeat(24)), true);
  assert.equal(isPasswordAllowed('密'.repeat(25)), false);
});

test('ASCII 密码仍遵循至少 8 字符、最多 72 字节', () => {
  assert.equal(isPasswordAllowed('a'.repeat(7)), false);
  assert.equal(isPasswordAllowed('a'.repeat(8)), true);
  assert.equal(isPasswordAllowed('a'.repeat(72)), true);
  assert.equal(isPasswordAllowed('a'.repeat(73)), false);
});
