/** 跳转统一认证登录入口；入口地址由 VITE_SSO_LOGIN_URL 配置。 */
export function redirectToSsoLogin(returnPath = window.location.pathname) {
  const template = (import.meta.env.VITE_SSO_LOGIN_URL ?? "").trim();
  if (!template) return false;

  const safeReturnPath =
    returnPath.startsWith("/") && !returnPath.startsWith("//")
      ? returnPath
      : "/case-forge";
  const target = template.replace(
    "{returnUrl}",
    encodeURIComponent(safeReturnPath),
  );
  window.location.assign(target);
  return true;
}

export function hasSsoLoginUrl() {
  return Boolean((import.meta.env.VITE_SSO_LOGIN_URL ?? "").trim());
}
