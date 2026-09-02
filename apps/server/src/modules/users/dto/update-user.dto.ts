export interface UpdateUserDto {
  displayName?: string;
  department?: string;
  role?: 'USER' | 'ADMIN';
  enabled?: boolean;
  /** 重置登录密码（可选）；重置后该用户所有旧会话立即失效 */
  password?: string;
}
