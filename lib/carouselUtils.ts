/**
 * Pure carousel navigation utilities — no Expo/React dependencies.
 * Exported here so they can be tested directly in Node.
 */

/**
 * Compute the next carousel index given a direction and the total item count.
 * Clamps at both boundaries (no wrap-around).
 */
export function stepCarousel(
  currentIndex: number,
  direction: 'prev' | 'next',
  total: number,
): number {
  if (total <= 0) return 0;
  if (direction === 'prev') return Math.max(0, currentIndex - 1);
  return Math.min(total - 1, currentIndex + 1);
}

/** Returns true when Previous is available (not at first item). */
export function canGoPrev(index: number): boolean {
  return index > 0;
}

/** Returns true when Next is available (not at last item). */
export function canGoNext(index: number, total: number): boolean {
  return index < total - 1;
}
