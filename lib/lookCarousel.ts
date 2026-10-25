import type { OccasionTag, OutfitSet } from '../constants/types';

export const FREE_LOOKS_PER_SCENARIO = 2;
export const PREMIUM_LOOKS_PER_SCENARIO = 4;

export function lockedLookCount(
  isAuthenticated: boolean,
  isGuest: boolean,
  isPremium: boolean,
  entitlementUnavailable: boolean,
  visibleLookCount: number,
) {
  return isAuthenticated && !isGuest && !isPremium && !entitlementUnavailable
    && visibleLookCount >= FREE_LOOKS_PER_SCENARIO
    ? PREMIUM_LOOKS_PER_SCENARIO - FREE_LOOKS_PER_SCENARIO
    : 0;
}

export function buildLookPages(looks: OutfitSet[], lockedCount: number): (OutfitSet | null)[] {
  return [...looks, ...(looks.length > 0 && lockedCount > 0 ? [null] : [])];
}

export function pageIndexFromOffset(offset: number, pageWidth: number) {
  return pageWidth > 0 ? Math.max(0, Math.round(offset / pageWidth)) : 0;
}

export function pageIndexForDot(dotIndex: number, visibleLookCount: number) {
  return dotIndex < visibleLookCount ? dotIndex : visibleLookCount;
}

export function runLookOverflowAction(
  action: 'not-today' | 'export',
  callbacks: { notToday: () => void; exportLook: () => void },
) {
  if (action === 'not-today') callbacks.notToday();
  else callbacks.exportLook();
}

export function lockedLookTitle(count: number, occasion: string) {
  if (count === 2) return `Two more ${occasion} looks`;
  return count > 0 ? `${count} more ${occasion} looks` : `More ${occasion} looks`;
}

