import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canStartSwipeDismiss,
  shouldDismissSwipe,
  SWIPE_DISMISS_THRESHOLD,
} from '../lib/swipeDismiss';

assert.equal(SWIPE_DISMISS_THRESHOLD, 120);
assert.equal(canStartSwipeDismiss(0, 0, 8), true, 'downward drag at the top can capture');
assert.equal(canStartSwipeDismiss(0, 0, -30), false, 'upward movement remains scrolling');
assert.equal(canStartSwipeDismiss(0, 30, 5), false, 'horizontal movement is not a dismiss');
assert.equal(canStartSwipeDismiss(1, 0, 40), false, 'any positive scroll offset keeps control with content');
assert.equal(canStartSwipeDismiss(-1, 0, 40), false, 'only the exact top offset is eligible');
assert.equal(shouldDismissSwipe(0, 120), false, 'threshold requires more than 120 px');
assert.equal(shouldDismissSwipe(0, 121), true, 'downward drag beyond threshold dismisses');
assert.equal(shouldDismissSwipe(2, 500), false, 'release while scrolled cannot dismiss');

const source = readFileSync('components/SwipeToDismiss.tsx', 'utf8');
assert.match(source, /onMoveShouldSetPanResponderCapture:[\s\S]*canStartSwipeDismiss\(scrollTopRef\.current/);
assert.match(source, /onPanResponderMove:[\s\S]*scrollTopRef\.current !== 0/);
assert.match(source, /onPanResponderRelease:[\s\S]*shouldDismissSwipe\(scrollTopRef\.current/);

for (const route of ['app/add-item.tsx', 'app/premium.tsx', 'app/item-detail.tsx']) {
  const screen = readFileSync(route, 'utf8');
  assert.match(screen, /<SwipeToDismiss scrollTopRef=\{sheetScrollTopRef\}(?: onDismiss=\{handleDismiss\})?>/, `${route} passes the live scroll ref`);
  assert.match(screen, /sheetScrollTopRef\.current = Math\.max\(0, event\.nativeEvent\.contentOffset\.y\)/, `${route} tracks its vertical scroll position`);
  assert.match(screen, /accessibilityLabel="Close/, `${route} has an accessible close control`);
}

const premium = readFileSync('app/premium.tsx', 'utf8');
assert.ok((premium.match(/\{ icon: '/g) ?? []).length >= 8, 'Premium supplies a long feature-card list for scroll testing');

console.log('Swipe dismissal scroll gating and 120 px threshold checks passed.');
