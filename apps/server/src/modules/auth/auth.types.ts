/** 12 小时会话（PRD §5.2） */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** users 表行（snake_case，与 DB 一致） */
export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  department: string;
  password_hash: string;
  role: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

/** 对外用户视图（camelCase，对应 @scienceing/shared UserDto） */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  department: string;
  role: string;
  enabled: boolean;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    department: row.department,
    role: row.role,
    enabled: row.enabled === 1,
  };
}
