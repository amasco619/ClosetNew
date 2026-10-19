import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { getGuestPhotoRelativePath } from '../constants/guestPhotoCleanup';
import type { WardrobeItem } from '../constants/types';
import { getFreeWardrobeSelection, getSelectedWardrobeItems, getWardrobeItems, insertWardrobeItems } from './database';
import { fetchAuthoritativeEntitlement } from './entitlements';
import { uploadWardrobeImage } from './storage';
import { supabase } from './supabase';
import { serializeRecommendationSemantics } from './wardrobeSemantics';
import { rebaseGuestPhotoUri } from './rebaseGuestPhotoUri';
import { createGuestWardrobeMigration, GUEST_MIGRATION_KEY, type GuestMigrationEntry } from './guestWardrobeMigration';

const wardrobeKey = '@amodka_wardrobe';
const assertOwner = async (ownerId: string) => {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== ownerId) throw new Error('Guest sync account changed');
};
const expectedPath = (ownerId: string, entry: GuestMigrationEntry) =>
  `${ownerId}/${entry.migrationId}.${/\.png$/i.test(entry.item.photoUri) ? 'png' : 'jpg'}`;

export const guestWardrobeSync = createGuestWardrobeMigration({
  read: async () => {
    const raw = await AsyncStorage.getItem(GUEST_MIGRATION_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.some(entry =>
      !entry.ownerId || !entry.migrationId || !entry.item?.id || typeof entry.synced !== 'boolean')) {
      throw new Error('Guest sync journal is invalid');
    }
    return entries;
  },
  write: entries => AsyncStorage.setItem(GUEST_MIGRATION_KEY, JSON.stringify(entries)),
  newId: () => Crypto.randomUUID(),
  snapshot: async (ownerId, entries) => {
    await assertOwner(ownerId);
    const [rows, page, selected, entitlement] = await Promise.all([
      Promise.all(Array.from({ length: Math.ceil(entries.length / 30) }, (_, index) =>
        getSelectedWardrobeItems(ownerId, entries.slice(index * 30, (index + 1) * 30).map(entry => entry.migrationId)),
      )).then(pages => pages.flat()),
      getWardrobeItems(ownerId), getFreeWardrobeSelection(ownerId), fetchAuthoritativeEntitlement(),
    ]);
    await assertOwner(ownerId);
    return {
      confirmedIds: entries.filter(entry => rows.some(row =>
        row.id === entry.migrationId && row.user_id === ownerId &&
        row.image_url === (entry.storagePath ?? expectedPath(ownerId, entry)),
      )).map(entry => entry.migrationId),
      activeCount: selected.length, totalCount: page.totalCount, premium: entitlement.isPremium,
    };
  },
  upload: async (ownerId, entry) => {
    await assertOwner(ownerId);
    const uri = rebaseGuestPhotoUri(entry.item.photoUri, FileSystem.documentDirectory ?? '');
    if (!getGuestPhotoRelativePath(uri, FileSystem.documentDirectory)) throw new Error('Guest photo is outside managed storage');
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await assertOwner(ownerId);
    const uploaded = await uploadWardrobeImage(ownerId, base64, entry.migrationId, /\.png$/i.test(uri) ? 'image/png' : 'image/jpeg');
    return uploaded.storagePath;
  },
  insert: async (ownerId, entries) => {
    await assertOwner(ownerId);
    return insertWardrobeItems(entries.map(({ item, migrationId, storagePath }) => ({
      id: migrationId, user_id: ownerId, garment_type: item.category,
      sub_type: item.subType, color_family: item.colorFamily,
      description: item.description, occasion: item.occasionTags,
      image_url: storagePath, fabric: item.fabric, fit: item.fit,
      pattern: item.pattern, pattern_scale: item.patternScale,
      recommendation_semantics: serializeRecommendationSemantics(item),
    })));
  },
  confirmed: async entry => {
    const raw = await AsyncStorage.getItem(wardrobeKey);
    if (!raw) return;
    const items: WardrobeItem[] = JSON.parse(raw);
    await AsyncStorage.setItem(wardrobeKey, JSON.stringify(items.filter(item => item.id !== entry.item.id)));
    // Keep the managed original: do not risk removing a file still referenced
    // by an open guest-origin review. Account deletion includes these files.
  },
});
