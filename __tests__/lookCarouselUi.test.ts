import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildLookPages, lockedLookCount, pageIndexForDot, pageIndexFromOffset, runLookOverflowAction,
} from '../lib/lookCarousel';
import type { OutfitSet } from '../constants/types';

const look = (id: string): OutfitSet => ({
  id, scenario: 'casual', components: [], rationale: 'Easy, considered layers',
});

const pages = buildLookPages([look('look-a'), look('look-b')], 0);
assert.equal(pages.length, 2, 'each actual look receives one carousel page');
assert.deepEqual(pages.map(page => page?.id), ['look-a', 'look-b']);
assert.equal(pageIndexFromOffset(384, 384), 1, 'paging offset advances to the next page');
assert.equal(pageIndexFromOffset(0, 384), 0);
assert.equal(buildLookPages([look('look-a')], 2).length, 2, 'locked page follows real looks, not fake look cards');
assert.equal(buildLookPages([], 2).length, 0, 'empty state does not expose a locked look page');

assert.equal(lockedLookCount(true, false, false, false, 2), 2, 'signed-in Free users see Premium capacity after using the Free allowance');
assert.equal(lockedLookCount(true, false, false, false, 1), 0, 'do not promise more looks when the Free allowance is not filled');
assert.equal(lockedLookCount(false, true, false, false, 2), 0, 'Guests never see a locked page');
assert.equal(lockedLookCount(true, false, true, false, 2), 0, 'Premium users never see a locked page');
assert.equal(lockedLookCount(true, false, false, true, 2), 0, 'unknown entitlement does not expose locked content');
assert.equal(pageIndexForDot(2, 2), 2, 'first locked dot points to the single static locked page');
assert.equal(pageIndexForDot(3, 2), 2, 'additional locked dots also point to the static locked page');

const actions: string[] = [];
const callbacks = {
  notToday: () => actions.push('not-today'),
  exportLook: () => actions.push('export'),
};
runLookOverflowAction('not-today', callbacks);
runLookOverflowAction('export', callbacks);
assert.deepEqual(actions, ['not-today', 'export'], 'overflow actions invoke their existing look callbacks');

const screen = readFileSync('app/(tabs)/outfits.tsx', 'utf8');
assert.match(screen, /pagingEnabled/);
assert.match(screen, /scrollToOffset/);
assert.doesNotMatch(screen, /outfitRotation|outfitScoring|outfitGenerator/, 'Looks UI does not import recommendation engine modules');

console.log('Looks carousel page count/paging, Free-only lock, overflow callbacks and engine-import boundary passed');
