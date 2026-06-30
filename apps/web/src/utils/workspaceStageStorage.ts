/** 每个 registry 最多保留的工作区阶段缓存条数 */
export const RECENT_WORKSPACE_STAGE_LIMIT = 20;

export const WORKSPACE_STAGE_REGISTRY = {
  caseForgeProject: 'case-forge:registry:workspace-stage',
  apiTestStage: 'case-forge:registry:api-stage',
  apiTestTransaction: 'case-forge:registry:api-active-transaction',
} as const;

function loadRegistry(registryName: string): string[] {
  try {
    const raw = localStorage.getItem(registryName);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRegistry(registryName: string, keys: string[]) {
  localStorage.setItem(registryName, JSON.stringify(keys));
}

function trimRegistry(registryName: string, keys: string[]) {
  const kept = keys.slice(0, RECENT_WORKSPACE_STAGE_LIMIT);
  for (const key of keys.slice(RECENT_WORKSPACE_STAGE_LIMIT)) {
    localStorage.removeItem(key);
  }
  saveRegistry(registryName, kept);
}

function touchRegistry(registryName: string, storageKey: string) {
  const registry = loadRegistry(registryName);
  trimRegistry(registryName, [storageKey, ...registry.filter((key) => key !== storageKey)]);
}

/** 写入工作区阶段，并仅保留最近 N 条 */
export function setRecentWorkspaceEntry(
  registryName: string,
  storageKey: string,
  value: string,
) {
  localStorage.setItem(storageKey, value);
  touchRegistry(registryName, storageKey);
}

/** 读取工作区阶段，命中时刷新 LRU 顺序 */
export function getRecentWorkspaceEntry(
  registryName: string,
  storageKey: string,
): string | null {
  const value = localStorage.getItem(storageKey);
  if (value === null) {
    return null;
  }
  touchRegistry(registryName, storageKey);
  return value;
}

/** 删除单条工作区阶段缓存 */
export function removeRecentWorkspaceEntry(registryName: string, storageKey: string) {
  localStorage.removeItem(storageKey);
  saveRegistry(
    registryName,
    loadRegistry(registryName).filter((key) => key !== storageKey),
  );
}

/** 按条件批量删除（用于项目/交易码删除时清理） */
export function removeRecentWorkspaceEntriesMatching(
  registryName: string,
  predicate: (storageKey: string) => boolean,
) {
  const registry = loadRegistry(registryName);
  for (const key of registry) {
    if (predicate(key)) {
      localStorage.removeItem(key);
    }
  }
  saveRegistry(registryName, registry.filter((key) => !predicate(key)));
}

/** 启动时把历史 localStorage 项纳入 registry，并裁到上限 */
export function syncLegacyWorkspaceRegistry(registryName: string, keyPrefix: string) {
  const registry = new Set(loadRegistry(registryName));
  const legacy: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(keyPrefix)) {
      legacy.push(key);
    }
  }
  if (!legacy.length) {
    return;
  }
  const merged = [...legacy, ...Array.from(registry).filter((key) => !legacy.includes(key))];
  trimRegistry(registryName, merged);
}

export function removeApiTestProjectWorkspaceEntries(projectId: string) {
  const stagePrefix = `case-forge:api-stage:${projectId}:`;
  removeRecentWorkspaceEntriesMatching(WORKSPACE_STAGE_REGISTRY.apiTestStage, (key) =>
    key.startsWith(stagePrefix),
  );
  removeRecentWorkspaceEntry(
    WORKSPACE_STAGE_REGISTRY.apiTestTransaction,
    `case-forge:api-active-transaction:${projectId}`,
  );
}
