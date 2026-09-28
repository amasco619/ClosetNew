export function shouldShowFreeWardrobeChooser(
  isAuthenticated: boolean,
  isPremium: boolean,
  isGuest: boolean,
  totalCount: number,
  selectedCount: number,
): boolean {
  return isAuthenticated && !isPremium && !isGuest && totalCount > selectedCount;
}