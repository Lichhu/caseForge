import { AsyncLocalStorage } from "node:async_hooks";

const DEFAULT_USER = "system";

interface RequestContextStore {
  userName: string;
  actorUserName?: string;
  requestId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/** 在异步调用链中保存当前操作用户和请求 ID */
export class RequestContext {
  static run<T>(
    userName: string,
    fn: () => T,
    actorUserName?: string,
    requestId?: string,
  ): T {
    const parent = storage.getStore();
    const inheritedRequestId = requestId ?? parent?.requestId;
    return storage.run(
      {
        userName: userName || DEFAULT_USER,
        ...(actorUserName ? { actorUserName } : {}),
        ...(inheritedRequestId ? { requestId: inheritedRequestId } : {}),
      },
      fn,
    );
  }

  static getUserName() {
    return storage.getStore()?.userName ?? DEFAULT_USER;
  }

  /** 原始操作人；普通登录时与当前用户相同。 */
  static getActorUserName() {
    const store = storage.getStore();
    return store?.actorUserName ?? store?.userName ?? DEFAULT_USER;
  }

  /** 当前请求的全局请求 ID；后台任务返回 undefined。 */
  static getRequestId() {
    return storage.getStore()?.requestId;
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
