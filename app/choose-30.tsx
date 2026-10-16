import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp, type WardrobeItem } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import { GarmentTile } from '@/components/GarmentTile';

export default function ChooseThirtyScreen() {
  const insets = useSafeAreaInsets();
  const {
    authenticatedUserId, wardrobeItems, wardrobeTotalCount, wardrobeHasMore, freeSelectedItemIds,
    loadAllWardrobeItems, setFreeWardrobeSelection,
  } = useApp();
  const selectionKey = JSON.stringify(freeSelectedItemIds);
  const [selectionDraft, setSelectionDraft] = useState({
    source: selectionKey,
    ids: freeSelectedItemIds,
  });
  const selectedIds = selectionDraft.source === selectionKey ? selectionDraft.ids : freeSelectedItemIds;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadRetry, setLoadRetry] = useState(0);
  const dataComplete = !wardrobeHasMore && wardrobeItems.length >= wardrobeTotalCount;
  const loadKey = JSON.stringify([authenticatedUserId, wardrobeItems.length, wardrobeTotalCount, wardrobeHasMore, loadRetry]);
  const [loadedWardrobeKey, setLoadedWardrobeKey] = useState<string | null>(null);
  const [wardrobeLoadFailureKey, setWardrobeLoadFailureKey] = useState<string | null>(null);
  const loading = !dataComplete && loadedWardrobeKey !== loadKey;
  const items = useMemo(
    () => [...wardrobeItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [wardrobeItems],
  );
  const availableIds = useMemo(() => new Set(items.map(item => item.id)), [items]);
  const validSelectedIds = useMemo(
    () => selectedIds.filter(id => availableIds.has(id)),
    [availableIds, selectedIds],
  );
  const visibleError = wardrobeLoadFailureKey === loadKey ? error : null;

  useEffect(() => {
    let active = true;
    if (dataComplete) {
      return () => { active = false; };
    }
    loadAllWardrobeItems()
      .catch(() => {
        if (active) {
          setWardrobeLoadFailureKey(loadKey);
          setError('Your wardrobe could not be loaded. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) {
          if (!dataComplete) {
            setWardrobeLoadFailureKey(loadKey);
            setError(current => current ?? 'Your full wardrobe is not available yet. Tap to retry.');
          }
          setLoadedWardrobeKey(loadKey);
        }
      });
    return () => { active = false; };
  }, [dataComplete, loadAllWardrobeItems, wardrobeHasMore, wardrobeItems.length, loadRetry, wardrobeTotalCount, loadKey]);

  const toggleItem = (item: WardrobeItem) => {
    setError(null);
    setSelectionDraft(current => {
      const source = current.source === selectionKey ? current.ids : freeSelectedItemIds;
      const valid = source.filter(id => availableIds.has(id));
      if (valid.includes(item.id)) {
        return { source: selectionKey, ids: valid.filter(id => id !== item.id) };
      }
      if (valid.length >= 30) return { source: selectionKey, ids: valid };
      return { source: selectionKey, ids: [...valid, item.id] };
    });
  };

  const handleSave = async () => {
    if (validSelectedIds.length !== Math.min(30, wardrobeTotalCount) || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setFreeWardrobeSelection(validSelectedIds);
      router.back();
    } catch {
      setError('Your choices could not be saved. Nothing was removed; please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Your free wardrobe</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>Choose your 30</Text>
        <Text style={styles.description}>
          Keep any 30 pieces active in your free wardrobe. Your other items stay safely saved and can be chosen again anytime.
        </Text>
        <Text style={styles.counter}>{validSelectedIds.length} of {Math.min(30, wardrobeTotalCount)} selected</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.secondary} />
          <Text style={styles.loadingText}>Loading your wardrobe…</Text>
        </View>
      ) : visibleError || !dataComplete ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { setError(null); setLoadRetry(count => count + 1); }}
          style={styles.loadError}
        >
          <Ionicons name="refresh-outline" size={20} color={Colors.secondary} />
          <Text accessibilityRole="alert" style={styles.error}>
            {visibleError ?? 'Your full wardrobe is not available yet.'} Tap to retry.
          </Text>
        </Pressable>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const selected = validSelectedIds.includes(item.id);
            const disabled = !selected && validSelectedIds.length >= 30;
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }}
                style={[styles.item, disabled && styles.itemDisabled]}
                onPress={() => toggleItem(item)}
                disabled={disabled}
              >
                <GarmentTile
                  uri={item.photoUri}
                  storagePath={item.storagePath}
                  colorFamily={item.colorFamily}
                  variant="list"
                  style={styles.photo}
                  accessibilityLabel={`${item.colorFamily} ${item.subType} garment`}
                />
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.subType.replace(/-/g, ' ')}</Text>
                  <Text style={styles.itemColor}>{item.colorFamily}</Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                  color={selected ? Colors.secondary : Colors.border}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Your wardrobe is empty.</Text>}
        />
      )}

      <Pressable
        accessibilityRole="button"
        onPress={handleSave}
        disabled={saving || loading || !dataComplete || validSelectedIds.length !== Math.min(30, wardrobeTotalCount)}
        style={({ pressed }) => [
          styles.saveButton,
          (saving || loading || !dataComplete || validSelectedIds.length !== Math.min(30, wardrobeTotalCount)) && styles.saveDisabled,
          pressed && !saving && { opacity: 0.85 },
        ]}
      >
        {saving
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.saveText}>Save selection</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  intro: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.primary, letterSpacing: -0.5 },
  description: { marginTop: 8, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, color: Colors.textSecondary },
  counter: { marginTop: 15, color: Colors.secondary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  error: { marginHorizontal: 20, marginBottom: 10, color: Colors.error, fontFamily: 'Inter_500Medium', fontSize: 13 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontFamily: 'Inter_400Regular', color: Colors.textSecondary, fontSize: 13 },
  loadError: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  list: { paddingHorizontal: 18, paddingBottom: 14 },
  item: {
    minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  itemDisabled: { opacity: 0.45 },
  photo: { width: 54, height: 58, borderRadius: 8, backgroundColor: Colors.border },
  itemCopy: { flex: 1, gap: 4 },
  itemName: { fontFamily: 'Inter_600SemiBold', color: Colors.primary, fontSize: 14, textTransform: 'capitalize' },
  itemColor: { fontFamily: 'Inter_400Regular', color: Colors.textSecondary, fontSize: 12, textTransform: 'capitalize' },
  empty: { textAlign: 'center', padding: 28, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  saveButton: {
    marginHorizontal: 20, marginTop: 10, minHeight: 50, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.45 },
  saveText: { fontFamily: 'Inter_600SemiBold', color: Colors.white, fontSize: 15 },
});