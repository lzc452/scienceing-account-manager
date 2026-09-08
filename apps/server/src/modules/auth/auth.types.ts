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
  /** 首次成功登录时间（NULL = 从未登录，t14） */
  first_login_at: string | null;
  /** 1 = 本次登录须先修改初始/临时密码（未清除前业务接口被 AuthGuard 拒绝，t14） */
  must_change_password: number;
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
  /** 首次登录时间（t14；登录/me 返回，NULL = 从未登录过） */
  firstLoginAt: string | null;
  /** 是否需先修改初始/临时密码（t14；前端据此强制弹改密窗） */
  mustChangePassword: boolean;
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
    firstLoginAt: row.first_login_at ?? null,
    mustChangePassword: row.must_change_password === 1,
  };
}
