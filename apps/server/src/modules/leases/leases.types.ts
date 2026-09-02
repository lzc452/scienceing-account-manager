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
}

export interface AccountCredentialsView {
  accountId: number;
  code: string;
  username: string;
  password: string;
}
