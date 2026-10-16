import assert from 'node:assert/strict';
import {
  isAiProcessingPreference,
  isAiProcessingSwitchOn,
  normalizeAiProcessingPreference,
  requireAiProcessingPreference,
} from '../lib/aiProcessingPreferenceState';

assert.equal(normalizeAiProcessingPreference('not_asked'), 'not_asked');
assert.equal(normalizeAiProcessingPreference('allowed'), 'allowed');
assert.equal(normalizeAiProcessingPreference('declined'), 'declined');
assert.equal(isAiProcessingPreference('not_asked'), true);
assert.equal(isAiProcessingPreference('allowed'), true);
assert.equal(isAiProcessingPreference('declined'), true);
assert.equal(requireAiProcessingPreference('not_asked'), 'not_asked');
assert.equal(requireAiProcessingPreference('allowed'), 'allowed');
assert.equal(requireAiProcessingPreference('declined'), 'declined');
for (const malformed of [undefined, null, '', 'yes', true, {}, 1]) {
  assert.equal(normalizeAiProcessingPreference(malformed), 'not_asked');
  assert.equal(isAiProcessingPreference(malformed), false);
  assert.throws(() => requireAiProcessingPreference(malformed), /preference response was invalid/);
}

const readySignedIn = { loading: false, unavailable: false, guest: false };
assert.equal(normalizeAiProcessingPreference(undefined), 'not_asked');
assert.equal(isAiProcessingSwitchOn('not_asked', readySignedIn), true,
  'no saved choice displays the default-on switch without becoming consent');
assert.equal(isAiProcessingSwitchOn('allowed', readySignedIn), true);
assert.equal(isAiProcessingSwitchOn('declined', readySignedIn), false,
  'an explicit saved OFF choice is never overridden by the default');
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, loading: true }), false);
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, unavailable: true }), false);
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, guest: true }), false);

console.log('AI processing preference: default-on display, explicit OFF, and unknown/loading states passed');