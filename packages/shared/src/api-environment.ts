export type ApiEnvironmentScope = 'global' | 'system' | 'personal';

export const API_ENVIRONMENT_SCOPE_LABEL: Record<ApiEnvironmentScope, string> = {
  global: '全局环境',
  system: '系统环境',
  personal: '个人环境',
};

export const API_ENVIRONMENT_PRESET_NAMES = [
  '投产验证测试环境',
  'UAT测试环境',
  'SIT测试环境',
  'REL测试环境',
] as const;

export const API_ENVIRONMENT_SCOPES: ApiEnvironmentScope[] = [
  'global',
  'system',
  'personal',
];
