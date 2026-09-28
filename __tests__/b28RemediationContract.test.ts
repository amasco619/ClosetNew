import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const context = readFileSync('contexts/AppContext.tsx', 'utf8');
const addItem = readFileSync('app/add-item.tsx', 'utf8');
const wardrobe = readFileSync('app/(tabs)/wardrobe.tsx', 'utf8');
const choose = readFileSync('app/choose-30.tsx', 'utf8');
const storage = readFileSync('lib/storage.ts', 'utf8');
const rls = readFileSync('scripts/test-rls-409-2.ts', 'utf8');
const between = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

// Hydration can merge selected rows from outside page one, but those rows
// must never count toward the contiguous page offset.
const hydration = between(context, 'const wardrobeRows = [', 'const entitlement = await fetchAuthoritativeEntitlement()');
assert.match(hydration, /setWardrobeItems\(mapped\);\s*updateWardrobePagination\(wardrobePage\.totalCount, wardrobePage\.items\.length\)/);
assert.doesNotMatch(hydration, /updateWardrobePagination\(wardrobePage\.totalCount, mapped\.length\)/);
assert.match(context, /const offset = wardrobeLoadedCountRef\.current/);

// Free inserts are already selected in the RPC; reflect that after DB success.
const commit = between(context, 'const commitAddedWardrobeItems =', 'const addWardrobeItem =');
assert.match(commit, /userId !== null && !isPremiumRef\.current[\s\S]*setFreeSelectedItemIds\(prev => \[\.\.\.new Set\(\[\.\.\.prev, \.\.\.items\.map\(item => item\.id\)\]\)\]\)/);
assert.match(context, /await insertWardrobeItem\(payload\)[\s\S]*commitAddedWardrobeItems\(\[newItem\]/);
assert.match(context, /await insertWardrobeItems\(payloads\)[\s\S]*commitAddedWardrobeItems\(prepared/);

// A downgraded account with <=30 retained rows and no selected IDs can
// reach the selector from the empty wardrobe, then confirm all retained rows.
assert.match(wardrobe, /!isPremium && wardrobeTotalCount > 0 && \(wardrobeTotalCount > 30 \|\| activeWardrobeItems\.length === 0\)/);
assert.match(wardrobe, /hiddenBanner[\s\S]*router\.push\('\/choose-30'\)/);
assert.match(choose, /validSelectedIds\.length !== Math\.min\(30, wardrobeTotalCount\)/);
assert.match(choose, /await setFreeWardrobeSelection\(validSelectedIds\)/);

// Signed-in users cannot fall back to a device URI, including when the
// photo bytes or session are missing.
const authenticatedUpload = between(addItem, 'if (session?.user || !isGuest)', '} else {\n        // Guest user');
assert.match(authenticatedUpload, /if \(!session\?\.user \|\| !photoBase64\)[\s\S]*throw new Error/);
assert.match(authenticatedUpload, /await uploadWardrobeImage/);
assert.doesNotMatch(authenticatedUpload, /FileSystem\.copyAsync/);
assert.match(context, /Authenticated wardrobe images must be uploaded before saving/g);

// An uploaded single item is cleaned up after a DB error or an abandoned
// screen; only successful persistence clears the cleanup marker.
assert.match(addItem, /uploadedPhoto = \{ userId: session\.user\.id, itemId \}/);
assert.match(addItem, /uploadedPhoto && !saveMountedRef\.current[\s\S]*throw new Error/);
assert.match(addItem, /await addWardrobeItem\(\{ id: itemId, \.\.\.wardrobeItem \}\);\s*}\s*uploadedPhoto = null;\s*router\.back\(\);\s*} catch \(e\) \{[\s\S]*if \(uploadedPhoto && \(!dbStarted \|\| \(dbCode && dbCode !== 'INVALID_RPC_RESULT'\)\)\)[\s\S]*deleteWardrobeImage/);
assert.match(storage, /catch \(signedUrlError\)[\s\S]*await deleteWardrobeImage\(userId, itemId\)/);

// Fixture setup uses RPC; direct inserts remain only as denied attack cases.
assert.ok((rls.match(/userAClient\.rpc\('insert_wardrobe_item'/g) ?? []).length >= 4);
assert.match(rls, /Direct INSERT own wardrobe_item[\s\S]*direct INSERT denied/);
assert.doesNotMatch(rls, /\.from\('wardrobe_items'\)\s*\.insert\(\{ user_id: userA_id, garment_type: '(?:top|bottom|accessory|shoes)', (?:color_family|description): (?!'ATTACK)/);

console.log('B2.8 remediation contract checks passed.');