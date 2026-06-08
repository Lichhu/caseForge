export const PROJECT_PLATFORMS = ['case-forge', 'api-test'] as const;
export type ProjectPlatform = (typeof PROJECT_PLATFORMS)[number];
