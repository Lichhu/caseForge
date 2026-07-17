import { AsyncLocalStorage } from "node:async_hooks";

const DEFAULT_USER = "system";

const storage = new AsyncLocalStorage<{ userName: string }>();

/** 在异步调用链中保存当前操作用户 */
export class RequestContext {
  static run<T>(userName: string, fn: () => T): T {
    return storage.run({ userName: userName || DEFAULT_USER }, fn);
  }

  static getUserName() {
    return storage.getStore()?.userName || DEFAULT_USER;
  }
}

/** 解析请求中的用户名（路径 > 请求头 > query，缺省 system） */
export function resolveUserNameFromRequest(input: {
  path?: string;
  header?: string | string[];
  query?: string | string[];
}) {
  if (input.path?.trim()) {
    return decodeUserName(input.path.trim());
  }

  const rawHeader = Array.isArray(input.header)
    ? input.header[0]
    : input.header;
  const rawQuery = Array.isArray(input.query) ? input.query[0] : input.query;
  const raw = (rawHeader || rawQuery || "").trim();
  if (!raw) {
    return DEFAULT_USER;
  }
  return decodeUserName(raw);
}

function decodeUserName(raw: string) {
  try {
    return decodeURIComponent(raw).trim() || DEFAULT_USER;
  } catch {
    return raw.trim() || DEFAULT_USER;
  }
}

/** 更新操作时附带 modifiedBy */
export function auditFieldsForUpdate() {
  return { modifiedBy: RequestContext.getUserName() };
}

/** 创建操作时附带 createdBy / modifiedBy */
export function auditFieldsForCreate() {
  const userName = RequestContext.getUserName();
  return { createdBy: userName, modifiedBy: userName };
}
