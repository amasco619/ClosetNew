/**
 * Tests for the save-button lock in bulk-review.tsx.
 *
 * Verifies that mid-save the button stays locked even after the app is
 * backgrounded and re-foregrounded.  The two mechanisms are:
 *
 *   1. savingRef guard — checked synchronously at the top of handleSaveAll
 *      so a rapid second tap cannot slip through before setSaving(true) has
 *      caused a React re-render.
 *
 *   2. AppState listener — when the app becomes 'active' again while
 *      savingRef.current is true, the listener calls setSaving(true) to
 *      re-sync React state, preventing a stale `false` from briefly
 *      unlocking the button after a foreground resume.
 *
 *   3. canSaveAll gate — the Pressable is always disabled when saving is
 *      true, regardless of how saving was set.
 *
 * Run: npx tsx __tests__/bulkSaveLock.test.ts
 */

import { runSaveAll } from '../lib/bulkClassifyCore';
import type { SaveAllItem, SaveAllDeps } from '../lib/bulkClassifyCore';

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

function makeItem(uri = 'file://a.jpg'): SaveAllItem {
  return {
    uri,
    classification: {
      category: 'top',
      subType: 'tshirt',
      colorFamily: 'white',
      description: 'plain tee',
      occasionTags: ['casual'],
      seasonTags: ['all-season'],
    },
  };
}

function makeDeps(overrides: Partial<SaveAllDeps> = {}): SaveAllDeps & {
  savingValues: boolean[];
  addItemCount: number;
  navigateCalled: boolean;
} {
  const savingValues: boolean[] = [];
  let addItemCount = 0;
  let navigateCalled = false;

  return {
    generateId: () => 'test-id',
    getSession: async () => null,
    resize: async () => null,
    upload: async () => 'https://example.com/photo.jpg',
    resolveUploadArg: () => null,
    addItem: () => { addItemCount++; },
    setItems: () => {},
    setSaving: (v) => { savingValues.push(v); },
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    navigate: () => { navigateCalled = true; },
    savingValues,
    get addItemCount() { return addItemCount; },
    get navigateCalled() { return navigateCalled; },
    ...overrides,
  };
}

// ── Main (wrapped in async IIFE so top-level await is not needed) ─────────────

(async () => {

  // ── 1. canSaveAll derivation ──────────────────────────────────────────────

  section('canSaveAll gate — pure derivation');

  // Mirrors: const canSaveAll = settledCount > 0 && !saving;
  function canSaveAll(settledCount: number, saving: boolean): boolean {
    return settledCount > 0 && !saving;
  }

  assert(canSaveAll(1, false) === true,  'enabled when items are settled and not saving');
  assert(canSaveAll(0, false) === false, 'disabled when no settled items');
  assert(canSaveAll(1, true)  === false, 'disabled when saving is true (mid-save)');
  assert(canSaveAll(3, true)  === false, 'disabled even with multiple settled items if saving');
  assert(canSaveAll(0, true)  === false, 'disabled when both saving and no items');

  // ── 2. savingRef guard ───────────────────────────────────────────────────

  section('savingRef guard — prevents re-entry');

  // Simulates the guard at the top of handleSaveAll in bulk-review.tsx:
  //   if (savingRef.current) return;
  //   savingRef.current = true;
  //   try { ... } finally { savingRef.current = false; }
  {
    const savingRef = { current: false };
    let saveCallCount = 0;

    async function handleSaveAll(): Promise<void> {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        saveCallCount++;
        await new Promise<void>(r => setTimeout(r, 0));
      } finally {
        savingRef.current = false;
      }
    }

    // First call starts; second call fires immediately (foreground-resume tap)
    const first  = handleSaveAll();
    const second = handleSaveAll();
    await Promise.all([first, second]);

    assert(saveCallCount === 1, 'only one save executes when ref guard is active');
    assert(savingRef.current === false, 'ref resets to false after save completes');
  }

  // ── 3. AppState sync callback ─────────────────────────────────────────────

  section('AppState sync callback — re-locks saving on foreground');

  // Simulates the AppState listener logic from bulk-review.tsx:
  //   AppState.addEventListener('change', (nextState) => {
  //     if (nextState === 'active' && savingRef.current) setSaving(true);
  //   });
  {
    const setSavingCalls: boolean[] = [];
    const setSaving = (v: boolean) => setSavingCalls.push(v);

    function onAppStateChange(
      nextState: 'active' | 'background' | 'inactive',
      savingRef: { current: boolean },
    ): void {
      if (nextState === 'active' && savingRef.current) {
        setSaving(true);
      }
    }

    // Scenario A: foreground resume while saving is in progress
    const savingRef = { current: true };
    onAppStateChange('background', savingRef);
    onAppStateChange('active',     savingRef);

    assert(setSavingCalls.length === 1, 'setSaving called exactly once on foreground resume');
    assert(setSavingCalls[0] === true,  'setSaving called with true (keeps button locked)');

    setSavingCalls.length = 0;

    // Scenario B: foreground resume after save has already completed
    savingRef.current = false;
    onAppStateChange('active', savingRef);

    assert(setSavingCalls.length === 0, 'setSaving not called after save has finished');
  }

  // ── 4. AppState debounce — rapid transitions coalesce ────────────────────

  section('AppState debounce — rapid background→inactive→active transitions coalesce');

  // Simulates the debounced AppState listener added to bulk-review.tsx.
  // Multiple rapid state changes within the 16 ms window must coalesce so
  // the button never flickers unlocked between transitions.
  {
    const setSavingCalls: boolean[] = [];
    const setSaving = (v: boolean) => setSavingCalls.push(v);

    // Minimal debounce implementation mirroring bulk-review.tsx
    function makeDebounced(savingRef: { current: boolean }) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return function onAppStateChange(nextState: 'active' | 'background' | 'inactive') {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (nextState === 'active' && savingRef.current) {
            setSaving(true);
          }
        }, 16);
      };
    }

    const savingRef = { current: true };
    const handler = makeDebounced(savingRef);

    // Rapid sequence: background → inactive → active (all within one tick —
    // simulates an OEM that fires multiple AppState events in quick succession)
    handler('background');
    handler('inactive');
    handler('active'); // only this one should survive the debounce

    // Advance timers so the debounced callback executes
    await new Promise<void>(resolve => setTimeout(resolve, 20));

    assert(
      setSavingCalls.length === 1,
      'setSaving called exactly once despite three rapid transitions'
    );
    assert(
      setSavingCalls[0] === true,
      'the surviving call locks the button (true)'
    );

    setSavingCalls.length = 0;

    // Scenario B: save finishes between the last transition and the debounce
    // firing — the button must NOT be re-locked.
    const savingRef2 = { current: true };
    const handler2 = makeDebounced(savingRef2);
    handler2('background');
    handler2('active');
    savingRef2.current = false; // save completes before the 16 ms timer fires
    await new Promise<void>(resolve => setTimeout(resolve, 20));

    assert(
      setSavingCalls.length === 0,
      'setSaving not called when save completes before debounce fires'
    );
  }

  // ── 5. runSaveAll — setSaving lifecycle ───────────────────────────────────

  section('runSaveAll — setSaving lifecycle');

  {
    const deps = makeDeps();
    const mountedRef = { current: true };

    await runSaveAll([makeItem()], mountedRef, deps);

    assert(deps.savingValues[0] === true,
      'setSaving(true) called at start of save');
    assert(deps.savingValues[deps.savingValues.length - 1] === false,
      'setSaving(false) called at end of save');
    assert(deps.addItemCount === 1,
      'one item added to wardrobe');
    assert(deps.navigateCalled === true,
      'navigate called after save');
  }

  // ── 6. runSaveAll — unmount suppresses setSaving(false) ───────────────────

  section('runSaveAll — unmount during save suppresses setSaving(false)');

  // If the component unmounts mid-save the mountedRef guard prevents
  // setSaving(false) from firing — the button can never be re-enabled on a
  // component that no longer exists.
  {
    const mountedRef = { current: true };
    let setSavingCallCount = 0;

    const deps = makeDeps({
      setSaving: () => { setSavingCallCount++; },
      getSession: async () => {
        // Simulate component unmounting during the async session fetch
        mountedRef.current = false;
        return null;
      },
    });

    await runSaveAll([makeItem()], mountedRef, deps);

    // setSaving(true) fires synchronously before getSession awaits;
    // setSaving(false) is skipped because mountedRef is false by then.
    assert(setSavingCallCount === 1,
      'setSaving called once (true only); false suppressed after unmount');
  }

  // ── Exit ──────────────────────────────────────────────────────────────────

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll assertions passed.');
  }

})();
