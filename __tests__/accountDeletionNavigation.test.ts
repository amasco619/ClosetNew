import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
assert.match(
  profile,
  /if \(signedOut\) \{\s*\/\/ Remove the old tabs from navigation history so Android Back cannot reopen deleted account UI\.\s*router\.dismissAll\(\);\s*router\.replace\('\/sign-in'\);\s*\}/,
  'successful deletion and sign-out clear the stale tab stack before showing sign-in',
);

console.log('Account deletion navigation clears stale screens before sign-in.');
