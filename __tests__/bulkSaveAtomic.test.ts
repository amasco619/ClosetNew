import { runSaveAll } from '../lib/bulkClassifyCore';
import type { SaveAllDeps, SaveAllItem } from '../lib/bulkClassifyCore';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const items: SaveAllItem[] = ['file://one.jpg', 'file://two.jpg'].map(uri => ({
  uri,
  cleanBase64: 'clean-image',
  classification: {
    category: 'top',
    subType: 'tee',
    colorFamily: 'black',
    description: '',
    occasionTags: [],
    seasonTags: [],
  },
}));

async function testBatchCommitsOnceAfterUploads(): Promise<void> {
  const events: string[] = [];
  let committedCount = 0;
  const deps: SaveAllDeps = {
    generateId: (() => { let id = 0; return () => `item-${++id}`; })(),
    getSession: async () => 'user-1',
    resize: async () => null,
    upload: async (_user, _base64, id) => {
      events.push(`upload:${id}`);
      return `https://storage/${id}.jpg`;
    },
    resolveUploadArg: () => ({ base64: 'clean-image', mimeType: 'image/png' }),
    addItems: async payloads => {
      events.push('commit');
      committedCount = payloads.length;
    },
    setItems: () => {},
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    navigate: () => events.push('navigate'),
  };

  await runSaveAll(items, { current: true }, deps);
  assert(committedCount === 2, 'both records are committed in one batch');
  assert(events.filter(event => event === 'commit').length === 1, 'database batch is invoked once');
  assert(events.indexOf('commit') > events.indexOf('upload:item-2'), 'all uploads finish before commit');
  assert(events[events.length - 1] === 'navigate', 'navigation follows successful batch commit');
}

async function testCommitFailureDoesNotNavigate(): Promise<void> {
  const events: string[] = [];
  const statuses: string[] = [];
  let surfaced: unknown;
  const capacityError = Object.assign(new Error('capacity'), { code: 'WARDROBE_CAPACITY_REACHED' });
  const deps: SaveAllDeps = {
    generateId: () => 'item-1',
    getSession: async () => null,
    resize: async () => null,
    upload: async () => 'unused',
    resolveUploadArg: () => null,
    addItems: async () => { throw capacityError; },
    setItems: updater => {
      const result = updater([{ uri: items[0].uri, status: 'saving', classification: items[0].classification }]);
      statuses.push(result[0].status);
    },
    setSaving: value => events.push(value ? 'saving' : 'idle'),
    onItemHaptic: () => {},
    onDoneHaptic: () => events.push('success'),
    onSaveError: error => { surfaced = error; },
    navigate: () => events.push('navigate'),
  };

  await runSaveAll([items[0]], { current: true }, deps);
  assert(surfaced === capacityError, 'capacity commit failure is surfaced to the screen');
  assert(!events.includes('navigate'), 'failed database commit never navigates');
  assert(!events.includes('success'), 'failed database commit never reports success');
  assert(statuses[statuses.length - 1] === 'settled', 'uncommitted item remains retryable');
}

async function testCommitFailureCleansUploadsWithoutMaskingError(): Promise<void> {
  const commitError = Object.assign(new Error('capacity rejected'), { code: 'WARDROBE_CAPACITY_REACHED' });
  const cleanupCalls: string[] = [];
  let surfaced: unknown;
  const deps: SaveAllDeps = {
    generateId: () => 'uploaded-item',
    getSession: async () => 'user-1',
    resize: async () => null,
    upload: async () => 'https://storage/uploaded-item.jpg',
    resolveUploadArg: () => ({ base64: 'clean-image', mimeType: 'image/jpeg' }),
    addItems: async () => { throw commitError; },
    deleteUploaded: async (userId, itemId) => {
      cleanupCalls.push(`${userId}/${itemId}`);
      throw new Error('cleanup unavailable');
    },
    setItems: () => {},
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    onSaveError: error => { surfaced = error; },
    navigate: () => {},
  };

  await runSaveAll([items[0]], { current: true }, deps);
  assert(cleanupCalls.length === 1 && cleanupCalls[0] === 'user-1/uploaded-item',
    'uploaded image is deleted after the database batch fails');
  assert(surfaced === commitError, 'cleanup failure does not mask the database error');
}

async function testUncertainCommitDoesNotDeletePossibleSavedPhoto(): Promise<void> {
  let cleanupCalls = 0;
  const deps: SaveAllDeps = {
    generateId: () => 'uncertain-item',
    getSession: async () => 'user-1',
    resize: async () => null,
    upload: async () => 'https://storage/uncertain-item.jpg',
    resolveUploadArg: () => ({ base64: 'clean-image', mimeType: 'image/jpeg' }),
    addItems: async () => { throw new Error('response lost'); },
    deleteUploaded: async () => { cleanupCalls++; },
    setItems: () => {},
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    navigate: () => {},
  };
  await runSaveAll([items[0]], { current: true }, deps);
  assert(cleanupCalls === 0, 'a lost RPC response cannot prove whether the row committed');
}

async function testAuthenticatedUploadFailureSkipsCommit(): Promise<void> {
  let commitCalls = 0;
  let navigateCalls = 0;
  let localOnlyUris: string[] = [];
  const statuses: Record<string, string> = {};
  const deps: SaveAllDeps = {
    generateId: (() => { let id = 0; return () => `retry-${++id}`; })(),
    getSession: async () => 'user-1',
    resize: async () => null,
    upload: async (_user, _base64, id) => {
      if (id === 'retry-1') throw new Error('offline');
      return `https://storage/${id}.jpg`;
    },
    resolveUploadArg: () => ({ base64: 'clean-image', mimeType: 'image/png' }),
    addItems: async () => { commitCalls++; },
    setItems: updater => {
      const previous = items.map(item => ({
        uri: item.uri,
        status: statuses[item.uri] ?? 'settled',
        classification: item.classification,
      }));
      for (const item of updater(previous)) statuses[item.uri] = item.status;
    },
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    onLocalOnlyComplete: uris => { localOnlyUris = uris; },
    navigate: () => { navigateCalls++; },
  };

  await runSaveAll(items, { current: true }, deps);
  assert(commitCalls === 0, 'authenticated upload failure prevents all database commits');
  assert(navigateCalls === 0, 'failed upload batch stays on review screen');
  assert(statuses[items[0].uri] === 'local-only', 'failed upload remains marked for retry');
  assert(statuses[items[1].uri] === 'settled', 'successful upload is not falsely marked saved');
  assert(localOnlyUris.includes(items[0].uri), 'failed item is included in retry notice');
}

async function testAuthenticatedLocalUriCannotCommit(): Promise<void> {
  let commitCalls = 0;
  const statuses: string[] = [];
  const deps: SaveAllDeps = {
    generateId: () => 'item-local-url',
    getSession: async () => 'user-1',
    resize: async () => null,
    upload: async () => 'file:///private/photo.jpg',
    resolveUploadArg: () => ({ base64: 'clean-image', mimeType: 'image/jpeg' }),
    addItems: async () => { commitCalls++; },
    setItems: updater => {
      const next = updater([{ uri: items[0].uri, status: 'saving', classification: items[0].classification }]);
      statuses.push(next[0].status);
    },
    setSaving: () => {},
    onItemHaptic: () => {},
    onDoneHaptic: () => {},
    navigate: () => {},
  };

  await runSaveAll([items[0]], { current: true }, deps);
  assert(commitCalls === 0, 'authenticated file:// upload result is never committed');
  assert(statuses[statuses.length - 1] === 'local-only', 'local URI upload result remains retryable');
}

void (async () => {
  await testBatchCommitsOnceAfterUploads();
  await testCommitFailureDoesNotNavigate();
  await testCommitFailureCleansUploadsWithoutMaskingError();
  await testUncertainCommitDoesNotDeletePossibleSavedPhoto();
  await testAuthenticatedUploadFailureSkipsCommit();
  await testAuthenticatedLocalUriCannotCommit();
  console.log('bulkSaveAtomic: all assertions passed');
})();