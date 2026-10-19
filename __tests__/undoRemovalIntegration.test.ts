import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { undoSavedItems } from '../lib/bulkClassifyCore';
import {
  getGuestPhotoRelativePath,
  retryPhotoCleanups,
  runGuestRemoval,
  type PendingPhotoCleanup,
} from '../constants/guestPhotoCleanup';

const contextSource = readFileSync('contexts/AppContext.tsx', 'utf8');
const removalCallback = contextSource.match(
  /const removeWardrobeItem = useCallback\(async \([\s\S]*?\n  \}, \[profile, isPremium, freeSelectedItemIds, updateWardrobePagination, rememberPhotoCleanup\]\);/,
);
assert.ok(removalCallback, 'the actual AppContext removal callback is available for integration coverage');
const pendingCleanupRetryCallback = contextSource.match(
  /const retryPendingPhotoCleanup = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[profile\.isGuest, readPendingPhotoCleanups, rememberPhotoCleanup\]\);/,
);
assert.ok(pendingCleanupRetryCallback, 'the actual AppContext cleanup retry callback is available for integration coverage');

const feedbackSource = readFileSync('components/LuxuryFeedbackProvider.tsx', 'utf8');
const toastActionCallback = feedbackSource.match(
  /const actOnToast = useCallback\(async \(\) => \{[\s\S]*?\n  \}, \[dismissToast, showToast, hasPendingPhotoCleanup, retryPendingPhotoCleanup\]\);/,
);
assert.ok(toastActionCallback, 'the actual Undo toast action callback is available for integration coverage');

const asyncStorage = new Map<string, string>();
const STORAGE_KEYS = {
  wardrobe: '@amodka_wardrobe',
  slots: '@amodka_slots',
  pendingPhotoCleanups: '@amodka_pending_photo_cleanups',
};
const documentDirectory = 'file:///documents/';
const removeCalls: Array<{ userId: string; id: string }> = [];
const storageCalls: Array<{ userId: string; id: string; storagePath?: string }> = [];
const guestFileCalls: string[] = [];
const selectedIds: string[] = [];
const appState = {
  userId: 'owner-a' as string | null,
  accountGeneration: 1,
  startupGeneration: 1,
  items: [] as Array<{ id: string; photoUri?: string }>,
  dbRows: new Map<string, string>(),
  failDbId: null as string | null,
  failStorageId: null as string | null,
  failGuestPhotoUri: null as string | null,
  pendingCleanups: [] as PendingPhotoCleanup[],
  holdDbDelete: null as (() => void) | null,
  pendingDbDelete: null as (() => void) | null,
  lastPagination: { total: 0, loaded: 0 },
  cachedItems: [] as Array<{ id: string; photoUri?: string }>,
};

const deps = {
  useCallback: (callback: unknown) => callback,
  currentUserIdRef: { get current() { return appState.userId; } },
  accountGenerationRef: { get current() { return appState.accountGeneration; } },
  startupGenerationRef: { get current() { return appState.startupGeneration; } },
  wardrobeItemsRef: { get current() { return appState.items; }, set current(value: typeof appState.items) { appState.items = value; } },
  wardrobeTotalCountRef: { get current() { return appState.lastPagination.total; } },
  wardrobeLoadedCountRef: { get current() { return appState.lastPagination.loaded; } },
  profile: { isGuest: false },
  isPremium: false,
  freeSelectedItemIds: selectedIds,
  updateWardrobePagination: (total: number, loaded: number) => {
    appState.lastPagination = { total, loaded };
  },
  isCurrentAccountRequest: (userId: string, accountGeneration: number, startupGeneration: number) =>
    appState.userId === userId &&
    appState.accountGeneration === accountGeneration &&
    appState.startupGeneration === startupGeneration,
  deleteWardrobeItem: async (userId: string, id: string) => {
    removeCalls.push({ userId, id });
    if (appState.pendingDbDelete) {
      const resolve = appState.pendingDbDelete;
      appState.pendingDbDelete = null;
      await new Promise<void>(done => {
        appState.holdDbDelete = () => { resolve(); done(); };
      });
    }
    if (appState.failDbId === id) throw new Error('database delete failed');
    if (appState.dbRows.get(id) !== userId) return null;
    appState.dbRows.delete(id);
    // Recovery deliberately uses an object ID different from the garment ID.
    return { image_url: `${userId}/${id}-photo.png` };
  },
  deleteWardrobeImage: async (userId: string, id: string, storagePath?: string) => {
    storageCalls.push({ userId, id, storagePath });
    if (appState.failStorageId === id) throw new Error('storage delete failed');
  },
  getWardrobeItems: async () => ({
    items: [...appState.dbRows.keys()].map(id => ({ id })),
    totalCount: appState.dbRows.size,
  }),
  getFreeWardrobeSelection: async () => [...selectedIds],
  persistFreeWardrobeSelection: async () => undefined,
  setFreeSelectedItemIds: () => undefined,
  runGuestRemoval: (
    id: string,
    items: typeof appState.items,
    directory: string | null,
    removeFile: (uri: string, options: { idempotent: boolean }) => Promise<void>,
  ) =>
    runGuestRemoval(id, items, directory, removeFile),
  FileSystem: {
    documentDirectory,
    deleteAsync: async (uri: string) => {
      guestFileCalls.push(uri);
      if (appState.failGuestPhotoUri === uri) throw new Error('file delete failed');
    },
  },
  AsyncStorage: {
    setItem: async (key: string, value: string) => { asyncStorage.set(key, value); },
  },
  STORAGE_KEYS,
  rememberPhotoCleanup: async (cleanup: PendingPhotoCleanup) => {
    appState.pendingCleanups = [
      ...appState.pendingCleanups.filter(entry =>
        entry.ownerKey !== cleanup.ownerKey || entry.itemId !== cleanup.itemId,
      ),
      cleanup,
    ];
  },
  getGuestPhotoRelativePath,
  initializeSlots: () => [],
  selectActiveWardrobeItems: (items: typeof appState.items) => items,
  getProfileBlueprint: () => ({}),
  setWardrobeItems: (itemsOrUpdater: typeof appState.items | ((items: typeof appState.items) => typeof appState.items)) => {
    appState.cachedItems = typeof itemsOrUpdater === 'function'
      ? itemsOrUpdater(appState.cachedItems)
      : itemsOrUpdater;
  },
  setRecommendationSlots: () => undefined,
};

const transformedRemoval = transformSync(
  `${removalCallback[0]}\nreturn removeWardrobeItem;`,
  { loader: 'ts' },
);
const removeWardrobeItem = new Function(
  ...Object.keys(deps),
  transformedRemoval.code,
)(...Object.values(deps)) as (
  id: string,
  photoUriHint?: string,
  expectedUserId?: string | null,
) => Promise<boolean>;

const transformedPendingCleanupRetry = transformSync(
  `${pendingCleanupRetryCallback[0]}\nreturn retryPendingPhotoCleanup;`,
  { loader: 'ts' },
);

const transformedToastAction = transformSync(
  `${toastActionCallback[0]}\nreturn actOnToast;`,
  { loader: 'ts' },
);

function resetState(userId: string | null, items: Array<{ id: string; photoUri?: string }>): void {
  appState.userId = userId;
  appState.accountGeneration = 1;
  appState.startupGeneration = 1;
  appState.items = items;
  appState.cachedItems = items;
  appState.dbRows = new Map(items.map(item => [item.id, userId ?? '']));
  appState.failDbId = null;
  appState.failStorageId = null;
  appState.failGuestPhotoUri = null;
  appState.pendingCleanups = [];
  appState.holdDbDelete = null;
  appState.pendingDbDelete = null;
  appState.lastPagination = { total: items.length, loaded: items.length };
  removeCalls.length = 0;
  storageCalls.length = 0;
  guestFileCalls.length = 0;
  asyncStorage.clear();
  selectedIds.splice(0, selectedIds.length);
}

async function testAuthenticatedCleanup(): Promise<void> {
  resetState('owner-a', [{ id: 'auth-1', photoUri: 'https://signed.example/auth-1' }]);
  const done = await removeWardrobeItem('auth-1', undefined, 'owner-a');

  assert.equal(done, true);
  assert.deepEqual(removeCalls, [{ userId: 'owner-a', id: 'auth-1' }], 'database removal carries the authenticated owner id');
  assert.deepEqual(storageCalls, [{
    userId: 'owner-a', id: 'auth-1', storagePath: 'owner-a/auth-1-photo.png',
  }], 'Storage removal uses the authenticated owner and persisted replacement path');
  assert.equal(appState.dbRows.has('auth-1'), false);
  assert.deepEqual(appState.cachedItems, [], 'authenticated in-memory wardrobe cache drops the removed row');
  assert.equal(appState.lastPagination.total, 0);
  assert.deepEqual(appState.pendingCleanups, [], 'successful photo cleanup does not leave a retry record');
  await removeWardrobeItem('auth-1', undefined, 'owner-a');
  assert.equal(storageCalls.length, 1, 'a missing row returns no receipt and cannot trigger another Storage deletion');
}

async function testFailedPhotoCleanupIsRetainedAndRetryable(): Promise<void> {
  resetState('owner-a', [{ id: 'storage-fails', photoUri: 'https://signed.example/storage-fails' }]);
  appState.failStorageId = 'storage-fails';
  assert.equal(await removeWardrobeItem('storage-fails', undefined, 'owner-a'), false);
  assert.equal(appState.dbRows.has('storage-fails'), false, 'the wardrobe row is still removed after a photo cleanup failure');
  assert.deepEqual(appState.pendingCleanups, [
    { ownerKey: 'owner-a', itemId: 'storage-fails', storagePath: 'owner-a/storage-fails-photo.png' },
  ], 'failed authenticated cleanup retains its owner, garment ID and exact photo path');

  const storageRetryCalls: Array<{ userId: string; id: string; storagePath?: string }> = [];
  const otherOwnerRecord = { ownerKey: 'owner-b', itemId: 'other-account-item' };
  const stillPending = await retryPhotoCleanups(
    [...appState.pendingCleanups, otherOwnerRecord],
    'owner-a',
    documentDirectory,
    async () => undefined,
    async (userId, itemId, storagePath) => { storageRetryCalls.push({ userId, id: itemId, storagePath }); },
  );
  assert.deepEqual(storageRetryCalls, [{
    userId: 'owner-a', id: 'storage-fails', storagePath: 'owner-a/storage-fails-photo.png',
  }], 'retry deletes only the active owner’s persisted replacement photo');
  assert.deepEqual(stillPending, [otherOwnerRecord], 'another owner’s pending cleanup remains untouched');

  const guestPhoto = `${documentDirectory}wardrobe_guest-fails.jpg`;
  resetState(null, [{ id: 'guest-fails', photoUri: guestPhoto }]);
  deps.profile.isGuest = true;
  appState.failGuestPhotoUri = guestPhoto;
  asyncStorage.set(STORAGE_KEYS.wardrobe, JSON.stringify(appState.items));
  assert.equal(await removeWardrobeItem('guest-fails', undefined, null), false);
  assert.equal(appState.cachedItems.length, 0, 'guest wardrobe row is removed after local photo cleanup fails');
  assert.deepEqual(appState.pendingCleanups, [
    { ownerKey: 'guest', itemId: 'guest-fails', guestPath: 'wardrobe_guest-fails.jpg' },
  ], 'guest cleanup stores a relative document path, not an absolute URI');

  const guestCalls: string[] = [];
  const retryResult = await retryPhotoCleanups(
    appState.pendingCleanups,
    'guest',
    documentDirectory,
    async uri => { guestCalls.push(uri); },
    async () => assert.fail('guest retry must not call authenticated Storage'),
  );
  assert.deepEqual(guestCalls, [guestPhoto], 'guest retry reconstructs the file path inside documentDirectory');
  assert.deepEqual(retryResult, [], 'successful guest retry clears the pending record');

  resetState('owner-a', []);
  appState.pendingCleanups = [{
    ownerKey: 'owner-a', itemId: 'retry-success', storagePath: 'owner-a/retry-success-photo.png',
  }];
  const retryRecords = [...appState.pendingCleanups];
  const retryRef = { current: retryRecords };
  const retryQueue = { current: Promise.resolve() };
  const retryStorageCalls: Array<{ userId: string; itemId: string; storagePath?: string }> = [];
  const retryDeps = {
    useCallback: (callback: unknown) => callback,
    profile: { isGuest: false },
    currentUserIdRef: { get current() { return appState.userId; } },
    accountGenerationRef: { get current() { return appState.accountGeneration; } },
    startupGenerationRef: { get current() { return appState.startupGeneration; } },
    readPendingPhotoCleanups: async () => retryRef.current,
    pendingPhotoCleanupsRef: retryRef,
    pendingPhotoCleanupQueueRef: retryQueue,
    isCurrentAccountRequest: (userId: string, generation: number, startup: number) =>
      appState.userId === userId &&
      appState.accountGeneration === generation &&
      appState.startupGeneration === startup,
    FileSystem: { documentDirectory, deleteAsync: async () => undefined },
    deleteWardrobeImage: async (userId: string, itemId: string, storagePath?: string) => {
      retryStorageCalls.push({ userId, itemId, storagePath });
    },
    retryPhotoCleanups,
    getActiveManagedPhotoReferences: () => new Set<string>(),
    getReclaimableGuestPhotoSources: () => [],
    rebaseGuestPhotoUri: (uri: string) => uri,
    getGuestPhotoRelativePath,
    guestWardrobeSync: {
      list: async () => [],
      markSourceReclaimed: async () => undefined,
    },
    rememberPhotoCleanup: async () => undefined,
    AsyncStorage: {
      getItem: async (key: string) => asyncStorage.get(key) ?? null,
      setItem: async (key: string, value: string) => { asyncStorage.set(key, value); },
    },
    STORAGE_KEYS,
  };
  const retryPendingPhotoCleanup = new Function(
    ...Object.keys(retryDeps),
    transformedPendingCleanupRetry.code,
  )(...Object.values(retryDeps)) as () => Promise<boolean>;
  assert.equal(await retryPendingPhotoCleanup(), true, 'the context retry succeeds for its active owner');
  assert.deepEqual(retryStorageCalls, [{
    userId: 'owner-a', itemId: 'retry-success', storagePath: 'owner-a/retry-success-photo.png',
  }]);
  assert.deepEqual(retryRef.current, [], 'successful context retry clears in-memory cleanup state');
  assert.deepEqual(
    JSON.parse(asyncStorage.get(STORAGE_KEYS.pendingPhotoCleanups) ?? 'null'),
    [],
    'successful context retry clears persisted cleanup state',
  );
}

async function testGuestCleanupAndManagedDirectoryGuard(): Promise<void> {
  const guestPhoto = `${documentDirectory}wardrobe_guest-1.jpg`;
  resetState(null, [{ id: 'guest-1', photoUri: guestPhoto }]);
  deps.profile.isGuest = true;
  asyncStorage.set(STORAGE_KEYS.wardrobe, JSON.stringify(appState.items));

  assert.equal(await removeWardrobeItem('guest-1', undefined, null), true);
  assert.deepEqual(guestFileCalls, [guestPhoto], 'Undo deletes the guest photo from document storage');
  assert.deepEqual(JSON.parse(asyncStorage.get(STORAGE_KEYS.wardrobe) ?? 'null'), [], 'Undo updates the persisted guest wardrobe cache');
  assert.deepEqual(appState.cachedItems, [], 'Undo updates the in-memory guest wardrobe cache');
  assert.equal(removeCalls.length + storageCalls.length, 0, 'guest cleanup never calls authenticated database or Storage deletion');

  const managedPhoto = 'file:///managed/another-app/photo.jpg';
  resetState(null, [{ id: 'guest-managed', photoUri: managedPhoto }]);
  deps.profile.isGuest = true;
  assert.equal(await removeWardrobeItem('guest-managed', undefined, null), false, 'managed-directory rejection reports incomplete cleanup');
  assert.deepEqual(guestFileCalls, [], 'a file outside documentDirectory is never deleted');
  assert.deepEqual(JSON.parse(asyncStorage.get(STORAGE_KEYS.wardrobe) ?? 'null'), [], 'the guest row/cache is still removed after refusing an unsafe file delete');
}

async function testPartialBatchAndQuota(): Promise<void> {
  resetState('owner-a', [
    { id: 'db-fails', photoUri: 'https://signed.example/db-fails' },
    { id: 'delete-succeeds', photoUri: 'https://signed.example/delete-succeeds' },
  ]);
  deps.profile.isGuest = false;
  appState.failDbId = 'db-fails';

  let batchComplete: boolean | undefined;
  const action = async () => {
    batchComplete = await undoSavedItems([
      { id: 'db-fails', photoUri: 'https://signed.example/db-fails' },
      { id: 'delete-succeeds', photoUri: 'https://signed.example/delete-succeeds' },
    ], (id, uri) => removeWardrobeItem(id, uri, 'owner-a'));
    return batchComplete;
  };

  const shown: Array<{ message: string; actionLabel?: string }> = [];
  const toastRef = { current: { id: 7, ownerKey: 'screen-a', onAction: action } };
  const toastDeps = {
    useCallback: (callback: unknown) => callback,
    toastRef,
    undoingRef: { current: false },
    toastTimer: { current: null as ReturnType<typeof setTimeout> | null },
    setUndoing: () => undefined,
    dismissToast: () => undefined,
    showToast: (toast: { message: string; actionLabel?: string }) => shown.push(toast),
    ownerKeyRef: { current: 'screen-a' },
    hasPendingPhotoCleanup: async () => appState.pendingCleanups.length > 0,
    retryPendingPhotoCleanup: async () => false,
  };
  const actOnToast = new Function(
    ...Object.keys(toastDeps),
    transformedToastAction.code,
  )(...Object.values(toastDeps)) as () => Promise<void>;
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await actOnToast();
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(batchComplete, false, 'Undo reports partial failure to the toast layer');
  assert.deepEqual(removeCalls.map(call => call.id), ['db-fails', 'delete-succeeds'], 'every row is attempted after a database failure');
  assert.deepEqual(storageCalls, [{
    userId: 'owner-a', id: 'delete-succeeds', storagePath: 'owner-a/delete-succeeds-photo.png',
  }], 'Storage cleanup runs only for the row whose database deletion succeeded');
  assert.equal(appState.dbRows.get('db-fails'), 'owner-a', 'the failed row remains owned by its account');
  assert.equal(appState.lastPagination.total, 1, 'the failed row continues to consume one wardrobe slot; Undo does not refund its quota');
  assert.deepEqual(shown.map(toast => toast.message), ['Undo could not be confirmed. Check your wardrobe before trying again.'], 'partial database failure displays the existing Undo failure message');
}

async function testFailedUndoOffersPhotoCleanupRetry(): Promise<void> {
  resetState('owner-a', [{ id: 'retry-toast', photoUri: 'https://signed.example/retry-toast' }]);
  appState.failStorageId = 'retry-toast';
  const action = () => removeWardrobeItem('retry-toast', undefined, 'owner-a');
  const toastRef = { current: { id: 9, ownerKey: 'screen-a', actionLabel: 'Undo', onAction: action } };
  const shown: Array<{ message: string; actionLabel?: string; onAction?: () => Promise<boolean | void> }> = [];
  const toastDeps = {
    useCallback: (callback: unknown) => callback,
    toastRef,
    undoingRef: { current: false },
    toastTimer: { current: null as ReturnType<typeof setTimeout> | null },
    setUndoing: () => undefined,
    dismissToast: () => undefined,
    showToast: (toast: typeof shown[number]) => shown.push(toast),
    ownerKeyRef: { current: 'screen-a' },
    hasPendingPhotoCleanup: async () => appState.pendingCleanups.length > 0,
    retryPendingPhotoCleanup: async () => false,
  };
  const actOnToast = new Function(
    ...Object.keys(toastDeps),
    transformedToastAction.code,
  )(...Object.values(toastDeps)) as () => Promise<void>;
  await actOnToast();
  assert.equal(shown[0]?.actionLabel, 'Retry cleanup', 'failed Undo offers an explicit photo-cleanup retry action');
  assert.equal(appState.pendingCleanups.length, 1, 'retry action is offered only after cleanup details are retained');
}

async function testAccountSwitchDuringUndo(): Promise<void> {
  resetState('owner-a', [{ id: 'account-a-item', photoUri: 'https://signed.example/a' }]);
  appState.pendingDbDelete = () => undefined;
  const undo = undoSavedItems(
    [{ id: 'account-a-item', photoUri: 'https://signed.example/a' }],
    (id, uri) => removeWardrobeItem(id, uri, 'owner-a'),
  );
  await Promise.resolve();
  await Promise.resolve();
  appState.userId = 'owner-b';
  appState.accountGeneration++;
  appState.holdDbDelete?.();

  assert.equal(await undo, false, 'an account switch makes the in-flight Undo incomplete');
  assert.deepEqual(removeCalls, [{ userId: 'owner-a', id: 'account-a-item' }], 'the database delete stays scoped to the original owner');
  assert.deepEqual(storageCalls, [], 'no Storage cleanup runs after switching accounts');
  assert.deepEqual(appState.cachedItems, [{ id: 'account-a-item', photoUri: 'https://signed.example/a' }], 'the new account cache is not changed by the stale Undo');
  assert.equal(appState.lastPagination.total, 1);
}

async function run(): Promise<void> {
  await testAuthenticatedCleanup();
  await testFailedPhotoCleanupIsRetainedAndRetryable();
  await testGuestCleanupAndManagedDirectoryGuard();
  await testPartialBatchAndQuota();
  await testFailedUndoOffersPhotoCleanupRetry();
  await testAccountSwitchDuringUndo();
  console.log('Undo removal integration checks passed.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
