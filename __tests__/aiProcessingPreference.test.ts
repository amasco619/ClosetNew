import assert from 'node:assert/strict';
import { normalizeAiProcessingPreference } from '../lib/aiProcessingPreferenceState';

assert.equal(normalizeAiProcessingPreference('not_asked'), 'not_asked');
assert.equal(normalizeAiProcessingPreference('allowed'), 'allowed');
assert.equal(normalizeAiProcessingPreference('declined'), 'declined');
for (const malformed of [undefined, null, '', 'yes', true, {}, 1]) {
  assert.equal(normalizeAiProcessingPreference(malformed), 'not_asked');
}

console.log('AI processing preference: valid states preserved, malformed states fail closed');