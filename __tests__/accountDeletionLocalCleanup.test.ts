import assert from 'node:assert/strict';
import {
  ACCOUNT_LOCAL_STORAGE_KEYS,
  clearAccountDeviceData,
  deleteAccountThenClearLocalData,
} from '../constants/accountDeletionCleanup';

const DOCUMENT_DIRECTORY = 'file:///documents/';

function makeLocalStore(): Map<string, string> {
  return new Map(ACCOUNT_LOCAL_STORAGE_KEYS.map(key => [key, `private:${key}`]));
}

async function testConfirmedDeletionClearsDeviceData(): Promise<void> {
  const store = makeLocalStore();
  const deletedFiles: string[] = [];
  const order: string[] = [];
  let signedUrlCacheCleared = false;

  const cacheCleared = await deleteAccountThenClearLocalData(
    async () => { order.push('server-deleted'); },
    () => clearAccountDeviceData({
      removeStorageKeys: async keys => {
        order.push('local-cache-cleared');
        keys.forEach(key => store.delete(key));
      },
      photoUris: [
        `${DOCUMENT_DIRECTORY}wardrobe_item-1.jpg`,
        `${DOCUMENT_DIRECTORY}notes/private.jpg`,
        'https://storage.example/wardrobe_item-2.jpg',
      ],
      documentDirectory: DOCUMENT_DIRECTORY,
      deleteAsync: async (uri, options) => {
        assert.equal(options.idempotent, true);
        deletedFiles.push(uri);
      },
      clearSignedPhotoCache: () => { signedUrlCacheCleared = true; },
    }),
  );

  assert.equal(cacheCleared, true);
  assert.deepEqual(order, ['server-deleted', 'local-cache-cleared']);
  assert.equal(store.size, 0, 'all current and legacy account cache keys are removed');
  assert.deepEqual(deletedFiles, [`${DOCUMENT_DIRECTORY}wardrobe_item-1.jpg`]);
  assert.equal(signedUrlCacheCleared, true, 'signed wardrobe photo URLs are forgotten');
}

async function testServerFailurePreservesDeviceData(): Promise<void> {
  const store = makeLocalStore();
  const deletedFiles: string[] = [];
  let localCleanupCalled = false;

  await assert.rejects(
    deleteAccountThenClearLocalData(
      async () => { throw new Error('server deletion failed'); },
      async () => {
        localCleanupCalled = true;
        return clearAccountDeviceData({
          removeStorageKeys: async keys => keys.forEach(key => store.delete(key)),
          photoUris: [`${DOCUMENT_DIRECTORY}wardrobe_item-1.jpg`],
          documentDirectory: DOCUMENT_DIRECTORY,
          deleteAsync: async uri => { deletedFiles.push(uri); },
          clearSignedPhotoCache: () => undefined,
        });
      },
    ),
    /server deletion failed/,
  );

  assert.equal(localCleanupCalled, false, 'local cleanup does not run without confirmed server deletion');
  assert.equal(store.size, ACCOUNT_LOCAL_STORAGE_KEYS.length, 'all saved account data is preserved for retry');
  assert.deepEqual(deletedFiles, [], 'device photos are preserved for retry');
}

async function runTests(): Promise<void> {
  await testConfirmedDeletionClearsDeviceData();
  await testServerFailurePreservesDeviceData();
  console.log('accountDeletionLocalCleanup: success and failed-server deletion cases passed');
}

runTests().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
