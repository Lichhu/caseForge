/** 场景库归属：案例动态指令 vs 接口测试 */
export type ScenarioScope = 'case' | 'api';

export const SCENARIO_SCOPE_CASE: ScenarioScope = 'case';
export const SCENARIO_SCOPE_API: ScenarioScope = 'api';

export function normalizeScenarioScope(
  value?: string | null,
  fallback: ScenarioScope = SCENARIO_SCOPE_CASE,
): ScenarioScope {
  return value === SCENARIO_SCOPE_API ? SCENARIO_SCOPE_API : fallback;
}
