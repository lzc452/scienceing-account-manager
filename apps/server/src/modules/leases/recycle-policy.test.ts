import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRecycleMode } from './recycle-policy';

test('回收模式：显式 ROTATE 无条件生效，无视版本', () => {
  assert.deepEqual(
    resolveRecycleMode({ configuredMode: 'ROTATE', extensionVersion: '9.9.9', gateVersion: '1.5.0' }),
    { mode: 'ROTATE', reason: 'CONFIG_ROTATE' },
  );
});

test('回收模式：没有扩展版本时退回改密', () => {
  // 不知道对面能不能清理，等到 ack 超时只会让账号白锁 120 秒
  for (const version of [null, undefined, '', '   ']) {
    assert.deepEqual(
      resolveRecycleMode({ configuredMode: 'PURGE', extensionVersion: version, gateVersion: '1.5.0' }),
      { mode: 'ROTATE', reason: 'EXTENSION_UNKNOWN' },
      `version=${JSON.stringify(version)} 应退回 ROTATE`,
    );
  }
});

test('回收模式：版本低于门槛退回改密', () => {
  assert.deepEqual(
    resolveRecycleMode({ configuredMode: 'PURGE', extensionVersion: '1.4.0', gateVersion: '1.5.0' }),
    { mode: 'ROTATE', reason: 'EXTENSION_OUTDATED' },
  );
});

test('回收模式：版本达到门槛走清理', () => {
  assert.deepEqual(
    resolveRecycleMode({ configuredMode: 'PURGE', extensionVersion: '1.5.0', gateVersion: '1.5.0' }),
    { mode: 'PURGE', reason: 'CONFIG_PURGE' },
  );
  assert.deepEqual(
    resolveRecycleMode({ configuredMode: 'PURGE', extensionVersion: '1.6.2', gateVersion: '1.5.0' }),
    { mode: 'PURGE', reason: 'CONFIG_PURGE' },
  );
});

test('回收模式：门槛值非法时回落默认，而不是放行全体', () => {
  // 配置写错（'abc' / 空）时若当成 0.0.0，会让所有扩展都判为「够新」→ 全走 PURGE，
  // 而老扩展根本不会回执，等于把整池账号锁在 DIRTY
  for (const gate of ['abc', '', null, undefined]) {
    assert.deepEqual(
      resolveRecycleMode({ configuredMode: 'PURGE', extensionVersion: '1.4.0', gateVersion: gate }),
      { mode: 'ROTATE', reason: 'EXTENSION_OUTDATED' },
      `gate=${JSON.stringify(gate)} 应回落默认 1.5.0`,
    );
  }
});

test('回收模式：配置脏值不当作 ROTATE，交给版本判定', () => {
  // 小写 'rotate'、拼错的 'ROTAT' 都不该被猜成止血开关
  for (const mode of ['rotate', 'ROTAT', 'PURGE_', null, undefined, '']) {
    assert.deepEqual(
      resolveRecycleMode({ configuredMode: mode, extensionVersion: '1.5.0', gateVersion: '1.5.0' }),
      { mode: 'PURGE', reason: 'CONFIG_PURGE' },
      `mode=${JSON.stringify(mode)} 不应触发 CONFIG_ROTATE`,
    );
  }
});
