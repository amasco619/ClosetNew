import assert from 'node:assert/strict';
import {
  isAiProcessingPreference,
  isAiProcessingSwitchOn,
  normalizeAiProcessingPreference,
  requireAiProcessingPreference,
  getAiProcessingSwitchAction,
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
assert.equal(isAiProcessingSwitchOn('not_asked', readySignedIn), false,
  'no saved choice keeps the switch off until the user opts in');
assert.equal(isAiProcessingSwitchOn('allowed', readySignedIn), true);
assert.equal(isAiProcessingSwitchOn('declined', readySignedIn), false,
  'an explicit saved OFF choice remains off');
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, loading: true }), false);
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, unavailable: true }), false);
assert.equal(isAiProcessingSwitchOn('not_asked', { ...readySignedIn, guest: true }), false);

assert.deepEqual(
  (['not_asked', 'declined', 'allowed'] as const).map(preference => [
    preference,
    getAiProcessingSwitchAction(preference, true),
    getAiProcessingSwitchAction(preference, false),
  ]),
  [
    ['not_asked', 'request_consent', 'save_declined'],
    ['declined', 'request_consent', 'unchanged'],
    ['allowed', 'unchanged', 'save_declined'],
  ],
  'turning ON from no-choice or declined opens disclosure; turning OFF records declined',
);

console.log('AI processing preference: opt-in default, explicit ON/OFF, and unknown/loading states passed');