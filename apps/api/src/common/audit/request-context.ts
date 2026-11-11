import { AsyncLocalStorage } from "node:async_hooks";

const DEFAULT_USER = "system";

const storage = new AsyncLocalStorage<{ userName: string }>();

/** 在异步调用链中保存当前操作用户 */
export class RequestContext {
  static run<T>(userName: string, fn: () => T): T {
    return storage.run({ userName: userName || DEFAULT_USER }, fn);
  }

  static getUserName() {
    return storage.getStore()?.userName ?? DEFAULT_USER;
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
