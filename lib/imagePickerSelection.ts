export function selectedSingleAsset<T>(
  result: { canceled: boolean; assets?: T[] | null },
): T | undefined {
  return !result.canceled && result.assets?.length === 1 ? result.assets[0] : undefined;
}