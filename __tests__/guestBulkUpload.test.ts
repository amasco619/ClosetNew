import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getInitialBulkCardStatus,
  limitGuestBulkSelection,
  runBulkAiProcessing,
} from '../lib/guestBulkUpload';
import { runRedirectSingle } from '../lib/bulkClassifyCore';

(async () => {
  assert.deepEqual(limitGuestBulkSelection(3, 0, 8), { acceptedCount: 3, omittedCount: 0 });
  assert.deepEqual(limitGuestBulkSelection(6, 5, 8), { acceptedCount: 3, omittedCount: 3 });
  assert.deepEqual(limitGuestBulkSelection(2, 8, 8), { acceptedCount: 0, omittedCount: 2 });
  assert.deepEqual(limitGuestBulkSelection(10, 3, 8), { acceptedCount: 5, omittedCount: 5 });
  assert.equal(getInitialBulkCardStatus(true), 'manual');
  assert.equal(getInitialBulkCardStatus(false), 'pending');

  const calls = { classify: 0, removeBackground: 0 };
  const simulatedAiPipeline = async () => {
    calls.removeBackground++;
    calls.classify++;
  };

  await runBulkAiProcessing(true, 'allowed', simulatedAiPipeline);
  assert.deepEqual(calls, { classify: 0, removeBackground: 0 },
    'guest bulk selection must not call classification or background removal, even if the preference says allowed');
  await runBulkAiProcessing(false, 'not_asked', simulatedAiPipeline);
  assert.deepEqual(calls, { classify: 0, removeBackground: 0 },
    'signed-in bulk selection must wait for explicit AI permission');
  await runBulkAiProcessing(false, 'allowed', simulatedAiPipeline);
  assert.deepEqual(calls, { classify: 1, removeBackground: 1 },
    'permitted signed-in bulk processing still runs its normal AI pipeline');

  const routes: Array<{ pathname: string; params: Record<string, string> }> = [];
  runRedirectSingle(
    { uri: 'file:///staged-photo.jpg', status: 'manual', classification: null },
    false,
    { current: true },
    { current: false },
    {
      bulkSelectionId: 'opaque-selection',
      manualPhotoIndex: 0,
      manualOnly: true,
      replace: route => routes.push(route),
    },
  );
  assert.deepEqual(routes[0]?.params, {
    bulkSelectionId: 'opaque-selection',
    bulkPhotoIndex: '0',
    manualEntry: 'true',
    returnToBulk: 'true',
    manualOnly: 'true',
  }, 'guest manual route uses the opaque selection ID and never serializes a photo URI');

  const bulkReview = readFileSync('app/bulk-review.tsx', 'utf8');
  assert.match(bulkReview, /getInitialBulkCardStatus\(selectionStartedAsGuest\)/);
  assert.match(bulkReview, /runBulkAiProcessing\(\s*isGuest \|\| selectionStartedAsGuest,\s*aiPreference,\s*async \(\) => \{[\s\S]*removeBg:[\s\S]*authenticatedApiRequest\('POST', '\/api\/classify-garment'/);
  assert.match(bulkReview, /manualOnly: selectionStartedAsGuest/);
  assert.match(bulkReview, /selectionMissing \|\| isGuest \|\| selectionStartedAsGuest/);
  assert.match(bulkReview, /Sign in to let Amodka identify and prepare these photos for you\./);
  assert.match(bulkReview, /Add details/);
  const addItem = readFileSync('app/add-item.tsx', 'utf8');
  assert.match(addItem, /result\.assets\.slice\(0, guestLimit\.acceptedCount\)/,
    'guest cap retains the first eligible photos in the user-selected order');

  console.log('Guest bulk upload cap, manual-card state, and no-AI processing contracts passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
