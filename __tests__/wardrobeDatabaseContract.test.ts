import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('lib/database.ts', 'utf8');
const context = readFileSync('contexts/AppContext.tsx', 'utf8');
const mapper = readFileSync('lib/wardrobeMapper.ts', 'utf8');

assert.match(source, /rpc\('insert_wardrobe_item',\s*\{\s*p_item:\s*item\s*\}\)/);
assert.match(source, /rpc\('insert_wardrobe_items',\s*\{\s*p_items:\s*items\s*\}\)/);
assert.match(source, /rpc\('set_free_wardrobe_selection',\s*\{\s*p_ids:\s*ids\s*\}\)/);
assert.match(source, /export async function replaceWardrobeItem\([\s\S]*?\.from\('wardrobe_items'\)[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\('id', itemId\)[\s\S]*?\.eq\('user_id', userId\)[\s\S]*?\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/);
assert.match(source, /error\.code === 'P0001'.*WARDROBE_CAPACITY_REACHED/s);
assert.match(source, /class WardrobeCapacityError/);
assert.match(source, /class WardrobeDatabaseError/);
assert.doesNotMatch(source, /\.from\(['"]wardrobe_items['"]\)\s*\.insert/);
const dbReplaceStart = source.indexOf('export async function replaceWardrobeItem(');
const dbReplaceEnd = source.indexOf('function normalizeWardrobeError', dbReplaceStart);
const dbReplace = source.slice(dbReplaceStart, dbReplaceEnd);
assert.match(dbReplace, /garment_type:[\s\S]*sub_type:[\s\S]*color_family:[\s\S]*description:[\s\S]*occasion:[\s\S]*image_url:[\s\S]*cleaned_image_url:/);
assert.match(dbReplace, /if \(!data \|\| data\.id !== itemId\)/);
assert.doesNotMatch(dbReplace, /\.delete\(|\.insert\(/);
const replacementPayload = dbReplace.match(/const payload = \{([\s\S]*?)\n  \}/)?.[1] ?? '';
assert.deepEqual(
  [...replacementPayload.matchAll(/^\s{4}([a-z_]+):/gm)].map(([, column]) => column),
  ['garment_type', 'sub_type', 'color_family', 'description', 'occasion', 'image_url', 'cleaned_image_url', 'fabric', 'fit', 'pattern', 'pattern_scale', 'recommendation_semantics'],
  'replacement persists every mutable wardrobe_items field hydrated by the wardrobe mapper, without unsupported columns',
);
assert.match(mapper, /category:\s+it\.garment_type/);
assert.match(mapper, /subType:\s+it\.sub_type/);
assert.match(mapper, /colorFamily:\s+it\.color_family/);
assert.match(mapper, /description:\s+it\.description/);
assert.match(mapper, /occasionTags:\s+\(it\.occasion/);
assert.match(mapper, /photoUri:\s+it\.cleaned_image_url \|\| it\.image_url/);

assert.match(source, /WARDROBE_PAGE_SIZE = 100/);
assert.match(source, /\.order\('created_at', \{ ascending: false \}\)[\s\S]*\.order\('id', \{ ascending: false \}\)[\s\S]*\.range\(offset, offset \+ WARDROBE_PAGE_SIZE - 1\)/);
assert.match(source, /\.select\('id', \{ count: 'exact', head: true \}\)/);
assert.match(source, /from\('wardrobe_free_selections'\)[\s\S]*select\('item_id'\)/);
assert.doesNotMatch(source, /@amodka_item_ids/);
const selectedRowsStart = source.indexOf('export async function getSelectedWardrobeItems');
const selectedRowsEnd = source.indexOf('export async function setFreeWardrobeSelection', selectedRowsStart);
const selectedRows = source.slice(selectedRowsStart, selectedRowsEnd);
assert.match(selectedRows, /ids\.length > WARDROBE_FREE_SELECTION_MAX/);
assert.match(selectedRows, /\.eq\('user_id', userId\)[\s\S]*\.in\('id', ids\)/);
assert.doesNotMatch(selectedRows, /\.range\(/);

assert.match(context, /addWardrobeItem: .*Promise<void>/);
assert.match(context, /addWardrobeItems: .*Promise<void>/);
assert.match(context, /replaceWardrobeItem: \(existingId: string, replacement: WardrobeItemReplacement\) => Promise<void>/);
assert.match(context, /loadMoreWardrobeItems: \(\) => Promise<void>/);
assert.match(context, /loadAllWardrobeItems: \(\) => Promise<void>/);
assert.match(context, /wardrobeHasMore: boolean/);
assert.match(context, /const selected = new Set\(selectedIds\)/);
assert.match(context, /await insertWardrobeItem\(payload\)[\s\S]*commitAddedWardrobeItems\(\[newItem\], userId, accountGeneration, startupGeneration\)/);
assert.match(context, /await insertWardrobeItems\(payloads\)[\s\S]*commitAddedWardrobeItems\(prepared, userId, accountGeneration, startupGeneration\)/);
assert.match(context, /currentUserIdRef\.current === userId[\s\S]*accountGenerationRef\.current === accountGeneration[\s\S]*isCurrentStartupGeneration/);
assert.match(context, /accountGenerationRef\.current \+= 1;[\s\S]*SIGNED_OUT/);
assert.match(context, /wardrobeLoadPromiseRef\.current/);

const loadMoreStart = context.indexOf('const loadMoreWardrobeItems =');
const loadAllStart = context.indexOf('const loadAllWardrobeItems =', loadMoreStart);
const selectionStart = context.indexOf('const setFreeWardrobeSelection =', loadAllStart);
const loadMore = context.slice(loadMoreStart, loadAllStart);
const loadAll = context.slice(loadAllStart, selectionStart);
assert.match(loadMore, /const accountGeneration = accountGenerationRef\.current/);
assert.match(loadMore, /await getWardrobeItems\(userId, offset\)[\s\S]*isCurrentAccountRequest/);
assert.match(loadMore, /setWardrobeItems\(prev => \{[\s\S]*isCurrentAccountRequest/);
assert.match(loadMore, /offset \+ page\.items\.length/);
assert.match(loadMore, /new Set\(prev\.map\(item => item\.id\)\)/);
assert.doesNotMatch(loadMore, /AsyncStorage\.setItem/);
assert.match(loadAll, /while \(wardrobeLoadPromiseRef\.current\)[\s\S]*await wardrobeLoadPromiseRef\.current/);
assert.match(loadAll, /await getWardrobeItems\(userId, offset\)[\s\S]*isCurrentAccountRequest/);
assert.match(loadAll, /setWardrobeItems\(prev =>[\s\S]*isCurrentAccountRequest/);
assert.doesNotMatch(loadAll, /AsyncStorage\.setItem/);

assert.match(context, /mayLoadGuestCache = !initSession\?\.user && !currentUserIdRef\.current && loadedProfile\.isGuest === true/);
assert.match(context, /mayLoadGuestCache \? await AsyncStorage\.getItem\(STORAGE_KEYS\.wardrobe\) : null/);
assert.match(context, /\(JSON\.parse\(wardrobeData\) as WardrobeItem\[\]\)\.slice\(0, GUEST_ITEM_CAP\)/);
assert.match(context, /accountGenerationRef\.current !== recoveryAccountGeneration[\s\S]*currentUserIdRef\.current !== recoveryUserId/);
assert.doesNotMatch(context, /initialSelection/);
assert.match(context, /const canAddItem = isPremium[\s\S]*profile\.isGuest[\s\S]*: true/);
assert.match(context, /: profile\.isGuest\s*\?\s*wardrobeTotalCount < GUEST_ITEM_CAP\s*:\s*true/);
const loadDataInnerStart = context.indexOf('const loadDataInner =');
const loadUserDataStart = context.indexOf('const loadUserDataFromDB =', loadDataInnerStart);
const startupHydration = context.slice(loadDataInnerStart, loadUserDataStart);
assert.match(startupHydration, /getSession\(\)[\s\S]*mayLoadGuestCache/);
assert.doesNotMatch(startupHydration.slice(0, startupHydration.indexOf('const wardrobeData')), /getItem\(STORAGE_KEYS\.wardrobe\)/);
assert.match(startupHydration, /const recoveryAccountGeneration = accountGenerationRef\.current/);
assert.match(startupHydration, /if \(recoveryUserId === null\) AsyncStorage\.setItem\(STORAGE_KEYS\.wardrobe/);
assert.doesNotMatch(context.slice(loadUserDataStart, context.indexOf('const updateProfile =', loadUserDataStart)), /AsyncStorage\.setItem\(STORAGE_KEYS\.wardrobe/);
const userDataHydration = context.slice(loadUserDataStart, context.indexOf('const updateProfile =', loadUserDataStart));
assert.match(userDataHydration, /missingSelectionIds = freeSelection\.filter/);
assert.match(userDataHydration, /getSelectedWardrobeItems\(userId, missingSelectionIds\)/);
assert.match(userDataHydration, /wardrobeRows = \[[\s\S]*wardrobePage\.items[\s\S]*selectedRows/);
assert.match(userDataHydration, /updateWardrobePagination\(wardrobePage\.totalCount, wardrobePage\.items\.length\)/);

const tokenRefreshStart = context.indexOf("if (event === 'TOKEN_REFRESHED'");
const tokenRefreshEnd = context.indexOf('// Merge stored profile', tokenRefreshStart);
const tokenRefresh = context.slice(tokenRefreshStart, tokenRefreshEnd);
const deferredEntitlementRead = tokenRefresh.indexOf('setTimeout(() => {');
assert.ok(deferredEntitlementRead >= 0, 'token-refresh entitlement work is deferred outside the Supabase auth callback');
assert.ok(tokenRefresh.indexOf('fetchAuthoritativeEntitlement()', deferredEntitlementRead) > deferredEntitlementRead);
assert.doesNotMatch(tokenRefresh.slice(0, deferredEntitlementRead), /fetchAuthoritativeEntitlement\(\)/);
assert.match(tokenRefresh, /if \(!entitlement\.isPremium\)[\s\S]*missingSelectionIds = selection\.filter[\s\S]*getSelectedWardrobeItems\(userId, missingSelectionIds\)/);
assert.match(tokenRefresh, /updateWardrobePagination\(page\.totalCount, page\.items\.length\)/);
assert.doesNotMatch(tokenRefresh, /for \(let offset/);

const removeStart = context.indexOf('const removeWardrobeItem =');
const removeEnd = context.indexOf('const resolveOrphan =', removeStart);
const removeBlock = context.slice(removeStart, removeEnd);
assert.match(removeBlock, /const currentItems = wardrobeItemsRef\.current;\s*const currentItemWasLoaded = currentItems\.some/);
assert.match(removeBlock, /wardrobeLoadedCountRef\.current - \(currentItemWasLoaded \? 1 : 0\)/);
assert.match(removeBlock, /const remaining = currentItems\.filter\(loaded => loaded\.id !== id\)/);
assert.doesNotMatch(removeBlock, /setWardrobeItems\(mapped\)/);

const replaceStart = context.indexOf('const replaceWardrobeItem =');
const replaceEnd = context.indexOf('const removeWardrobeItem =', replaceStart);
const replaceBlock = context.slice(replaceStart, replaceEnd);
assert.match(replaceBlock, /await replaceWardrobeItemInDB\(userId, existingId/);
assert.match(replaceBlock, /await replaceWardrobeItemInDB\(userId, existingId[\s\S]*if \(!isCurrent\(\)\) return;[\s\S]*setWardrobeItems/);
assert.match(replaceBlock, /id: item\.id,[\s\S]*createdAt: item\.createdAt/);
assert.match(replaceBlock, /await AsyncStorage\.setItem\(STORAGE_KEYS\.wardrobe, JSON\.stringify\(nextItems\)\)/);
assert.doesNotMatch(replaceBlock, /updateWardrobePagination|setFreeSelectedItemIds|insertWardrobeItem/);

console.log('Wardrobe DB migration contract source checks passed.');