/** 当前登录用户的最小身份信息。平台不维护本地用户表，用户资料由统一认证提供。 */
export interface AuthUser {
  userName: string;
}

/** `/api/v1/auth/me` 返回的本地登录会话信息。 */
export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
}
