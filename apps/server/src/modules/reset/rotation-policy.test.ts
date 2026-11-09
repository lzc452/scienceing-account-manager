import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRotation, type RotationInput } from './rotation-policy';

const NOW = new Date('2026-11-09T12:00:00.000Z');

function input(overrides: Partial<RotationInput> = {}): RotationInput {
  return {
    status: 'AVAILABLE',
    provisioned: true,
    lastChangedAt: '2026-10-01T12:00:00.000Z', // 39 天前
    notBefore: null,
    now: NOW,
    maxAgeDays: 30,
    minIntervalHours: 24,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

test('轮换判定：关闭开关时不做任何事', () => {
  assert.deepEqual(decideRotation(input({ maxAgeDays: 0 })), { kind: 'skip', reason: 'DISABLED' });
  // 非法配置也按关闭处理，避免 NaN 比较恒为 false 导致静默不轮换
  assert.deepEqual(decideRotation(input({ maxAgeDays: Number.NaN })), { kind: 'skip', reason: 'DISABLED' });
});

test('轮换判定：只轮换 AVAILABLE', () => {
  for (const status of ['IN_USE', 'DIRTY', 'RECYCLING', 'ERROR']) {
    assert.deepEqual(
      decideRotation(input({ status })),
      { kind: 'skip', reason: 'NOT_AVAILABLE' },
      `${status} 不应被清扫`,
    );
  }
});

test('轮换判定：未托管密码（占位/解密失败）不排入', () => {
  assert.deepEqual(decideRotation(input({ provisioned: false })), { kind: 'skip', reason: 'NOT_PROVISIONED' });
});

test('轮换判定：已推迟且未到期时跳过', () => {
  const notBefore = new Date(NOW.getTime() + 60_000).toISOString();
  assert.deepEqual(decideRotation(input({ notBefore })), { kind: 'skip', reason: 'NOT_BEFORE' });
});

test('轮换判定：推迟到期后继续正常判定', () => {
  const notBefore = new Date(NOW.getTime() - 60_000).toISOString();
  assert.deepEqual(decideRotation(input({ notBefore })), { kind: 'rotate', reason: 'AGE_EXCEEDED' });
});

test('轮换判定：时间戳缺失或损坏按「从未改过」处理', () => {
  assert.deepEqual(decideRotation(input({ lastChangedAt: null })), {
    kind: 'rotate',
    reason: 'NEVER_ROTATED',
  });
  assert.deepEqual(decideRotation(input({ lastChangedAt: 'not-a-date' })), {
    kind: 'rotate',
    reason: 'NEVER_ROTATED',
  });
});

test('轮换判定：时间戳在未来（时钟回拨）时跳过，不误伤整池', () => {
  const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
  assert.deepEqual(decideRotation(input({ lastChangedAt: future })), { kind: 'skip', reason: 'NOT_DUE' });
});

test('轮换判定：未到 30 天不改', () => {
  assert.deepEqual(decideRotation(input({ lastChangedAt: daysAgo(10) })), { kind: 'skip', reason: 'NOT_DUE' });
  // 恰好 30 天整：边界上不改，等下一轮自然越过
  assert.deepEqual(decideRotation(input({ lastChangedAt: daysAgo(30) })), { kind: 'skip', reason: 'NOT_DUE' });
});

test('轮换判定：超过 30 天排入改密', () => {
  assert.deepEqual(decideRotation(input({ lastChangedAt: daysAgo(31) })), {
    kind: 'rotate',
    reason: 'AGE_EXCEEDED',
  });
});

test('轮换判定：刚改过但远未到期时判「未到期」，不写推迟', () => {
  // 这是最常见的情况（每次部署后整池账号都是「几秒前改过」）：
  // 若在此处返回 defer，每轮清扫都会给每个账号写一条 ROTATION_DEFERRED 审计
  assert.deepEqual(decideRotation(input({ lastChangedAt: hoursAgo(2) })), {
    kind: 'skip',
    reason: 'NOT_DUE',
  });
});

test('轮换判定：配置冲突（minInterval > maxAge）时推迟到解禁时间', () => {
  // maxAge 配成 1 小时、minInterval 24 小时：2 小时前改过的账号确实超期，
  // 但距上次改密不足最小间隔 —— 宁可晚改，也不要在短时间内反复改密
  const changedAt = hoursAgo(2);
  const decision = decideRotation(
    input({ lastChangedAt: changedAt, maxAgeDays: 1 / 24, minIntervalHours: 24 }),
  );
  assert.equal(decision.kind, 'defer');
  if (decision.kind !== 'defer') return;
  assert.equal(decision.reason, 'MIN_INTERVAL');
  assert.equal(decision.until, new Date(Date.parse(changedAt) + 24 * 60 * 60 * 1000).toISOString());
  // 解禁时间必须晚于当前时刻，否则下一轮会立刻重复推迟（死循环）
  assert.ok(Date.parse(decision.until) > NOW.getTime());
});

test('轮换判定：minInterval=0 时超期即改，不做频次限制', () => {
  const decision = decideRotation(
    input({ lastChangedAt: hoursAgo(2), maxAgeDays: 1 / 24, minIntervalHours: 0 }),
  );
  assert.deepEqual(decision, { kind: 'rotate', reason: 'AGE_EXCEEDED' });
});

test('轮换判定：开关关闭优先于状态与托管判断', () => {
  // 三个条件同时不满足时，先返回 DISABLED —— 让「关闭」的语义最明确
  assert.deepEqual(
    decideRotation(input({ maxAgeDays: 0, status: 'IN_USE', provisioned: false })),
    { kind: 'skip', reason: 'DISABLED' },
  );
});
