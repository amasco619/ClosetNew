/**
 * Behavioral regression coverage for the SIGNED_IN startup race.
 *
 * The deferred completions model the two async loadUserDataFromDB calls:
 * completion is checked only when the promise settles, after a retry may have
 * claimed a newer generation.
 */
import assert from 'node:assert/strict';
import {
  canCommitStartupHydration,
  shouldClaimStartupHydration,
} from '../shared/reliability-guards';

let currentUserId: string | null = null;
let currentGeneration: number | null = null;
let activeGeneration = 1;
const userId = 'user-1';

const claim = (generation: number) => {
  const shouldClaim = shouldClaimStartupHydration(
    currentUserId,
    currentGeneration,
    userId,
    generation,
  );
  if (shouldClaim) {
    currentUserId = userId;
    currentGeneration = generation;
  }
  return shouldClaim;
};

// Normal SIGNED_IN startup claims and its deferred completion can commit.
assert.equal(claim(1), true, 'initial SIGNED_IN must claim hydration');
assert.equal(
  canCommitStartupHydration(userId, 1, currentUserId, currentGeneration, activeGeneration),
  true,
  'current SIGNED_IN completion must commit',
);

// A duplicate event for the same user in the same generation is suppressed.
assert.equal(claim(1), false, 'duplicate same-generation hydration must be suppressed');

// A retry claims the same user again. The old deferred completion is stale.
activeGeneration = 2;
assert.equal(claim(2), true, 'retry must claim a new hydration generation');
assert.equal(
  canCommitStartupHydration(userId, 1, currentUserId, currentGeneration, activeGeneration),
  false,
  'stale deferred completion must not commit after retry',
);
assert.equal(
  canCommitStartupHydration(userId, 2, currentUserId, currentGeneration, activeGeneration),
  true,
  'current retry completion must commit',
);

// Sign-out clears the claim, allowing a later sign-in to hydrate again.
currentUserId = null;
currentGeneration = null;
activeGeneration = 3;
assert.equal(
  canCommitStartupHydration(userId, 2, currentUserId, currentGeneration, activeGeneration),
  false,
  'in-flight pre-sign-out completion must not repopulate signed-out state',
);
assert.equal(claim(3), true, 'sign-out reset must allow a future claim');
assert.equal(
  canCommitStartupHydration(userId, 3, currentUserId, currentGeneration, activeGeneration),
  true,
  'future sign-in may claim and commit after sign-out reset',
);

console.log('AppContext startup-generation deferred-race checks passed.');