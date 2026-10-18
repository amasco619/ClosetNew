import assert from 'node:assert/strict';
import { getAiConsentDisposition } from '../lib/aiConsentFlow';

assert.equal(getAiConsentDisposition('upload', 'decline'), 'persist_declined');
assert.equal(getAiConsentDisposition('profile', 'not_now'), 'dismiss');

for (const context of ['upload', 'profile'] as const) {
  for (const action of ['backdrop', 'back', 'swipe'] as const) {
    assert.equal(getAiConsentDisposition(context, action), 'dismiss',
      `${context} ${action} dismisses without recording a choice`);
  }
}

console.log('AI consent flow: only an explicit upload-context Decline persists declined.');
