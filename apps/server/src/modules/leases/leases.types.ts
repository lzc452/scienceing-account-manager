/** scienceing_accounts 表行（snake_case，与 DB 一致） */
export interface AccountRow {
  id: number;
  code: string;
  username: string;
  current_password_ciphertext: string | null;
  pending_password_ciphertext: string | null;
  status: string;
  last_password_changed_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
  /** 进入 DIRTY 的时间（迁移 008 新增），用于 ack 超时判定与排障。 */
  dirty_since: string | null;
  /** 清理确认失败次数（只统计客户端自报失败，用于告警与人工判断）。 */
  purge_attempts: number;
  /** 最近一次确认清理完成的时间；与 release_requested_at 比较构成"已清理"不变式。 */
  last_purge_ack_at: string | null;
  /** 非空表示"欠一次改密"，取值见迁移 008 的 CHECK。 */
  rotation_due_reason: string | null;
  /** 24h 频次护栏的解禁时间；空表示立即可改。 */
  rotation_not_before: string | null;
}

/** leases 表行（snake_case，与 DB 一致） */
export interface LeaseRow {
  id: number;
  lease_token_hash: string;
  account_id: number;
  user_id: number;
  status: string;
  started_at: string;
  last_activity_at: string;
  release_requested_at: string | null;
  released_at: string | null;
  release_reason: string | null;
  extension_version: string | null;
  created_at: string;
  updated_at: string;
  /** 客户端回执收到时间（迁移 008 新增）。 */
  purge_ack_at: string | null;
  /** 清理通道：PAGE（有页面，可回读）/ BROWSING_DATA（无页面，不可回读）/ FAILED。 */
  purge_method: string | null;
  /** 清理回执的补充信息（JSON 字符串，已截断）。 */
  purge_detail: string | null;
}

/** 租约对外视图（camelCase，对应 @scienceing/shared LeaseDto） */
export interface LeaseView {
  id: number;
  accountId: number;
  accountCode: string;
  accountUsername: string;
  userId: number;
  status: string;
  startedAt: string;
  lastActivityAt: string;
  releaseRequestedAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  expiresAt: string;
  remainingSeconds: number;
  /** 无操作超时租期（秒，配置小时数×3600）——前端进度条/倒计时满刻度以此为准，勿本地硬编码。 */
  timeoutSeconds: number;
}

export interface AccountCredentialsView {
  accountId: number;
  code: string;
  username: string;
  password: string;
}
