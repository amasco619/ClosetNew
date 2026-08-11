/**
 * Confirms the correct cancel-dialog message is selected for every batch state
 * in the bulk-review flow.
 *
 * The branching logic is extracted as selectCancelDialogBody() in
 * lib/bulkClassifyCore so it can be tested in pure Node.js without any
 * React Native / Expo imports.
 *
 * Batch states covered:
 *   A. All items settled / errored / saved → null (immediate router.back, no dialog)
 *   B. Some in-progress, none auto-saved   → "AI analysis still running" message
 *   C. Some in-progress, some auto-saved   → "Some already saved" message
 *   D. Mixed states including auto-saved   → C wins (auto-saved message takes priority)
 *   E. Empty items array                   → null (no items to worry about)
 *
 * Run: `npx tsx __tests__/cancelDialogMessages.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { selectCancelDialogBody } from '../lib/bulkClassifyCore';
import type { BulkItemCore } from '../lib/bulkClassifyCore';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

function section(label: string): void {
  console.log(`\n${label}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function item(status: string): BulkItemCore {
  return { uri: `file:///photo-${status}.jpg`, status, classification: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  section('A. All settled / errored / saved → null (no dialog, immediate back)');
  {
    const settled  = [item('settled'), item('settled')];
    const errored  = [item('error'),   item('error')];
    const saved    = [item('saved'),   item('saved')];
    const autoSaved = [item('auto-saved'), item('saved')];
    const mixed    = [item('settled'), item('error'), item('saved'), item('auto-saved')];

    assert(selectCancelDialogBody(settled)   === null, 'all settled   → null');
    assert(selectCancelDialogBody(errored)   === null, 'all errored   → null');
    assert(selectCancelDialogBody(saved)     === null, 'all saved     → null');
    assert(selectCancelDialogBody(autoSaved) === null, 'auto-saved only → null');
    assert(selectCancelDialogBody(mixed)     === null, 'no in-progress items → null');
  }

  section('B. Some in-progress, none auto-saved → "AI analysis still running" message');
  {
    const pending    = [item('pending')];
    const classifying = [item('classifying')];
    const pendingAndSettled = [item('pending'), item('settled'), item('error')];

    const msgB = 'AI analysis is still running. Leaving now will discard all pending results and you will need to re-upload the photos.';

    assert(selectCancelDialogBody(pending)    === msgB, 'pending only → running message');
    assert(selectCancelDialogBody(classifying) === msgB, 'classifying only → running message');
    assert(selectCancelDialogBody(pendingAndSettled) === msgB,
      'pending + settled → running message (no auto-saved)');
  }

  section('C. Some in-progress + some auto-saved → "Some already saved" message');
  {
    const withAutoSaved = [
      item('pending'),
      item('auto-saved'),
      item('settled'),
    ];
    const classifyingAndAutoSaved = [
      item('classifying'),
      item('auto-saved'),
    ];

    const msgC = 'Some items have already been saved to your wardrobe. Any items still analysing will be discarded.';

    assert(selectCancelDialogBody(withAutoSaved) === msgC,
      'pending + auto-saved → auto-saved message');
    assert(selectCancelDialogBody(classifyingAndAutoSaved) === msgC,
      'classifying + auto-saved → auto-saved message');
  }

  section('D. auto-saved takes priority over generic running message');
  {
    const complex = [
      item('pending'),
      item('classifying'),
      item('settled'),
      item('error'),
      item('auto-saved'),
      item('saved'),
    ];

    const msgC = 'Some items have already been saved to your wardrobe. Any items still analysing will be discarded.';
    const result = selectCancelDialogBody(complex);

    assert(result === msgC,
      'complex mix with auto-saved → auto-saved message wins');
    assert(result !== null, 'complex mix with in-progress → dialog IS shown');
  }

  section('E. Edge cases');
  {
    assert(selectCancelDialogBody([]) === null, 'empty items → null (no dialog)');

    // Only removed items
    const removed = [item('removed'), item('removed')];
    assert(selectCancelDialogBody(removed) === null, 'all removed → null');

    // Only saving / auto-saving (in-flight, not "in-progress" per pending/classifying)
    const saving = [item('saving'), item('auto-saving')];
    assert(selectCancelDialogBody(saving) === null,
      'saving / auto-saving (not pending/classifying) → null');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n=== cancelDialogMessages: ${failed === 0 ? 'all passed' : `${failed} FAILED`} ===`);
  if (failed > 0) process.exit(1);

})();
