/** 用户本人修改登录密码（首次登录强制改密 / 主动改密共用）：POST /auth/change-password */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
