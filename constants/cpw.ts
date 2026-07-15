import { WardrobeItem } from './types';

export function computeItemCpw(purchasePrice: number, wearCount: number): number | null {
  if (!purchasePrice || purchasePrice <= 0 || wearCount <= 0) return null;
  return purchasePrice / wearCount;
}

export function formatCpw(cpw: number): string {
  if (cpw >= 1000) return `£${Math.round(cpw).toLocaleString()}`;
  if (cpw >= 100) return `£${Math.round(cpw)}`;
  if (cpw >= 10) return `£${cpw.toFixed(1)}`;
  return `£${cpw.toFixed(2)}`;
}

export interface DividendItem {
  item: WardrobeItem;
  wearCount: number;
  cpw: number;
}

export function computeWardrobeDividends(
  items: WardrobeItem[],
  getWearCount: (id: string) => number,
  topN = 3,
): DividendItem[] {
  const results: DividendItem[] = [];
  for (const item of items) {
    if (!item.purchasePrice || item.purchasePrice <= 0) continue;
    const wearCount = getWearCount(item.id);
    const cpw = computeItemCpw(item.purchasePrice, wearCount);
    if (cpw === null) continue;
    results.push({ item, wearCount, cpw });
  }
  return results
    .sort((a, b) => a.cpw - b.cpw)
    .slice(0, topN);
}
