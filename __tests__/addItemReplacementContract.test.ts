import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import { serializeRecommendationSemantics } from '../lib/wardrobeSemantics';
import { selectedSingleAsset } from '../lib/imagePickerSelection';
import type { WardrobeItem } from '../constants/types';

const source = readFileSync('app/add-item.tsx', 'utf8');

assert.match(source, /const \{[^}]*addWardrobeItem,[^}]*replaceWardrobeItem,[^}]*isPremium,[^}]*isGuest,[^}]*wardrobeItems,[^}]*\} = useApp\(\);/);
assert.match(source, /<SwipeToDismiss scrollTopRef=\{sheetScrollTopRef\} onDismiss=\{handleDismiss\}>/);
assert.match(source, /await cleanupStagedSelection\(\)/);
assert.match(
  source,
  /if \(replaceItemId\) \{\s*await replaceWardrobeItem\(replaceItemId, wardrobeItem\);\s*\} else \{\s*await addWardrobeItem\(\{ id: itemId, \.\.\.wardrobeItem \}\);\s*\}/,
);
assert.match(source, /removeWardrobeItem\(itemId, finalUri, expectedUserId\)/);

// Execute the real screen callbacks with controlled I/O, not a copied save
// algorithm. These are fixture checks, not native camera or live DB evidence.
const original: WardrobeItem = {
  id: 'owned-garment', createdAt: '2026-01-01T00:00:00Z', photoUri: '',
  category: 'top', subType: 'blouse', colorFamily: 'navy', description: 'Saved blouse',
  occasionTags: ['work'], seasonTags: ['fall'], fabric: 'cotton', fit: 'regular',
  pattern: 'solid', patternScale: 'small', weight: 'mid', neckline: 'collared',
  sleeveLength: 'long', warmthBand: 'mild', accentColor: 'white', metalTone: 'none',
  formalityLevel: 6, purchasePrice: 75, confirmedFields: ['fabric'],
  dominantHsl: { h: 220, s: 0.4, l: 0.3 }, dominantLab: { L: 30, a: 5, b: -20 },
};
const noop = () => {};
const ref = <T>(current: T) => ({ current });
async function execute(code: string, env: Record<string, unknown>) {
  const compiled = await transform(code, { loader: 'ts', target: 'es2022' });
  return runInNewContext(compiled.code, env);
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

async function main() {
  const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
  const actionStart = home.indexOf("pathname: '/add-item',", home.indexOf('Your garment details are still saved'));
  const routeBlock = home.slice(home.lastIndexOf('router.push({', actionStart), home.indexOf('});', actionStart) + 3);
  let route: { params: Record<string, string> } | undefined;
  await execute(routeBlock, { item: original, router: { push: (value: typeof route) => { route = value; } } });
  assert.equal(route!.params.replaceItemId, original.id);
  assert.equal(route!.params.preClassified, 'true');
  assert.equal(route!.params.initialUri, undefined);
  assert.ok(!home.slice(home.lastIndexOf('onPress', actionStart), actionStart).includes('resolveOrphan'),
    'opening recovery cannot dismiss the prompt before cancellation/failure');

  const initialization = source.slice(source.indexOf('const replacementItem = replaceItemId'),
    source.indexOf('const [photoBgRemoved,'));
  const env: Record<string, unknown> = {
    ...route!.params, resolvedInitialUri: null, wardrobeItems: [original],
    useState: (value: unknown) => [typeof value === 'function' ? value() : value, noop],
    useRef: ref, subTypes: { top: ['blouse'] }, colorFamilies: ['navy', 'white'],
    bulkSelectionId: undefined, stagedBulkPhoto: undefined, missingStagedSelection: false,
    stagedSelection: undefined, manualEntry: undefined,
  };
  const initial = plain(await execute(`${initialization}
    ({category,subType,colorFamily,description,occasions,seasons,purchasePrice,step,
      pattern,patternScale,fabric,weight,accentColor,dominantHsl,dominantLab,
      modelConfidence,formalityLevel,fit,metalTone,neckline,sleeveLength,rise,warmthBand,
      confirmedFields:Array.from(correctedFieldsRef.current)});`, env));
  assert.equal(initial.step, 0, 'replacement starts at the picker even without an initial URI');
  for (const key of ['category', 'subType', 'colorFamily', 'description', 'fabric', 'weight',
    'pattern', 'patternScale', 'fit', 'accentColor', 'metalTone', 'neckline', 'sleeveLength',
    'warmthBand', 'formalityLevel', 'dominantHsl', 'dominantLab', 'confirmedFields']) {
    assert.deepEqual(initial[key], plain(original[key as keyof WardrobeItem]), `initialize ${key}`);
  }
  assert.equal(initial.purchasePrice, '75');
  assert.deepEqual(initial.occasions, original.occasionTags);
  assert.deepEqual(initial.seasons, original.seasonTags);

  const changes: Record<string, unknown> = {};
  let pickerResult = { canceled: true, assets: [] as { uri: string; width: number; height: number }[] };
  let pickerOptions: Record<string, unknown> = {};
  const pickerEnv = {
    replaceItemId: original.id, photoRequestRef: ref(0), currentPhotoUriRef: ref(null),
    retryPhotoRef: ref(null), multiplePieces: false,
    ImagePicker: {
      requestMediaLibraryPermissionsAsync: async () => ({ status: 'granted' }),
      launchImageLibraryAsync: async (options: Record<string, unknown>) => { pickerOptions = options; return pickerResult; },
    },
    selectedSingleAsset,
    setBulkStageNotice: noop, setAnalysisFailure: noop,
    resetAllFields: () => assert.fail('recovery must not clear metadata'),
    getAiProcessingPreference: () => assert.fail('recovery must not request AI'),
    setPhotoUri: (value: unknown) => { changes.photoUri = value; },
    setPhotoBgRemoved: noop, setPhotoWidth: noop, setPhotoHeight: noop,
    setStep: (value: unknown) => { changes.step = value; },
    reportUploadError: () => assert.fail('unexpected picker error'),
  };
  const pick = await execute(`${source.slice(source.indexOf('const pickImage = async'),
    source.indexOf('const allowAiForCurrentPhoto = async'))} pickImage;`, pickerEnv);
  await pick(false);
  assert.equal(changes.photoUri, undefined, 'cancelled picker has no draft photo or write');
  pickerResult = { canceled: false, assets: [{ uri: 'file:///synthetic.jpg', width: 100, height: 100 }] };
  await pick(false);
  assert.equal(pickerOptions.allowsMultipleSelection, false);
  assert.equal(pickerOptions.selectionLimit, 1);
  assert.equal(changes.photoUri, 'file:///synthetic.jpg');
  assert.equal(changes.step, 1);

  let failUpload = true;
  const replacements: { id: string; item: WardrobeItem }[] = [];
  const notices: unknown[] = [];
  let backs = 0;
  const saveEnv = {
    ...initial, replaceItemId: original.id, replacementItem: original,
    rise: initial.rise, modelConfidence: initial.modelConfidence,
    photoUri: changes.photoUri, photoBgRemoved: false, photoWidth: 100, photoHeight: 100,
    isGuest: false, authenticatedUserId: 'disposable-owner',
    saveInFlightRef: ref(false), saveMountedRef: ref(true), stagedSaveActiveRef: ref(false),
    stagedSourceUriRef: ref(null), currentPhotoUriRef: ref(changes.photoUri),
    correctedFieldsRef: ref(new Set(original.confirmedFields)), bulkSelectionId: undefined,
    bulkPhotoIndex: undefined, returnToBulk: undefined,
    Crypto: { randomUUID: () => 'new-photo-object' },
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'disposable-owner' } } } }) } },
    readCachedCutout: async () => null,
    ImageManipulator: { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async () => ({ base64: 'synthetic' }) },
    uploadWardrobeImage: async () => {
      if (failUpload) throw new Error('injected upload failure');
      return { signedUrl: 'https://fixture/photo', storagePath: 'disposable-owner/new-photo-object.jpg' };
    },
    deleteWardrobeImage: () => assert.fail('failed upload cannot delete the old photo'),
    replaceWardrobeItem: async (id: string, item: WardrobeItem) => { replacements.push({ id, item }); },
    addWardrobeItem: () => assert.fail('replacement must never insert or consume a slot'),
    Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
    dialog: { notify: (value: unknown) => notices.push(value) }, toast: { show: noop },
    router: { back: () => { backs++; } }, cleanupStagedSelection: async () => {},
    reportUploadError: noop, setSaving: noop, setSaveStage: noop,
    asPattern: (v: unknown) => v, asPatternScale: (v: unknown) => v,
    asFabric: (v: unknown) => v, asWeight: (v: unknown) => v, asFit: (v: unknown) => v,
    asNeckline: (v: unknown) => v, asSleeve: (v: unknown) => v,
    asRise: (v: unknown) => v, asWarmth: (v: unknown) => v, colorFamilies: ['navy', 'white'],
  };
  const save = await execute(`${source.slice(source.indexOf('const saveConfirmed = async'),
    source.indexOf('const handleSave ='))} saveConfirmed;`, saveEnv);
  await save();
  assert.equal(replacements.length, 0, 'upload failure never starts replacement');
  assert.equal(backs, 0, 'failed upload stays retryable on screen');
  assert.equal(notices.length, 1);
  assert.equal(saveEnv.saveInFlightRef.current, false);
  failUpload = false;
  await save();
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].id, original.id);
  assert.equal(backs, 1);
  assert.deepEqual(plain(serializeRecommendationSemantics(replacements[0].item)),
    plain(serializeRecommendationSemantics(original)), 'all persisted semantic metadata survives');
  for (const key of ['category', 'subType', 'colorFamily', 'description', 'occasionTags', 'fabric', 'fit', 'pattern', 'patternScale']) {
    assert.deepEqual(plain(replacements[0].item[key as keyof WardrobeItem]),
      plain(original[key as keyof WardrobeItem]), `save preserves ${key}`);
  }
  console.log('addItemReplacementContract: routing, initialization, picker cancellation, upload failure and retry passed (fixtures)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });