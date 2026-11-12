/** 当前登录用户的最小身份信息。平台不维护本地用户表，用户资料由统一认证提供。 */
export interface AuthUser {
  userName: string;
}

/** `/api/v1/auth/me` 返回的本地登录会话信息。 */
export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
  /** 当前身份是否具备切换账号权限，仅用于前端展示；后端会再次校验。 */
  canImpersonate: boolean;
  /** 当前身份是否具备登录审计查看/导出权限，仅用于前端展示。 */
  canAudit?: boolean;
  /** 当前被代登录目标账号背后的原始操作人。 */
  impersonatedBy?: string;
  /** 当前代登录开始时间。 */
  impersonationStartedAt?: string;
}

/** 可供 SYSTEM 账号切换的有效用户。 */
export interface AuthImpersonationUser {
  userName: string;
  nickName: string;
}
