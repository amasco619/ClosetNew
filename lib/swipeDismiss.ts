export const SWIPE_DISMISS_THRESHOLD = 120;

export function canStartSwipeDismiss(scrollTop: number, dx: number, dy: number): boolean {
  return scrollTop === 0 && dy > 4 && Math.abs(dy) > Math.abs(dx) * 1.15;
}

export function shouldDismissSwipe(scrollTop: number, dy: number): boolean {
  return scrollTop === 0 && dy > SWIPE_DISMISS_THRESHOLD;
}
