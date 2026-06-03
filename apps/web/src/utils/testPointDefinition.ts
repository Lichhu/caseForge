export function isTestPointDefinitionComplete(item: {
  system?: string;
  featureModule?: string;
  testPoint?: string;
}) {
  return Boolean(
    item.system?.trim() && item.featureModule?.trim() && item.testPoint?.trim(),
  );
}

export function testPointDefinitionLabel(item: {
  testPoint?: string;
  featureModule?: string;
  system?: string;
}) {
  return item.testPoint?.trim() || item.featureModule?.trim() || item.system?.trim() || '未命名测试要点';
}
