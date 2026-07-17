import { StyleSheet, Text, View, FlatList, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useApp, WardrobeItem } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rs } from '../../lib/responsive';

type ViewMode = 'list' | 'grid';

const STORAGE_KEY = '@auracloset_wardrobe_view';

const categoryFilters = ['all', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'] as const;
const categoryLabels: Record<string, string> = {
  all: 'All', top: 'Tops', bottom: 'Bottoms', dress: 'Dresses',
  outerwear: 'Outerwear', shoes: 'Shoes', bag: 'Bags', jewelry: 'Jewelry',
};

const colorDots: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', grey: '#8B8B8B', cream: '#FFFDD0',
  beige: '#D4C5A9', camel: '#C19A6B', brown: '#6B4226', khaki: '#BDB76B',
  mustard: '#C9A227', gold: '#C8A951', silver: '#BFC1C2',
  red: '#C0392B', maroon: '#800000', burgundy: '#7D2027',
  coral: '#FF7F50', orange: '#E67E22', yellow: '#F4C542',
  olive: '#556B2F', green: '#27AE60', mint: '#98D8B9', teal: '#1F7A7A',
  blue: '#3498DB', navy: '#1B2A4A',
  lavender: '#B57EDC', purple: '#7D3C98', pink: '#E8A0BF',
};

const categoryInitial: Record<string, string> = {
  top: 'T', bottom: 'B', dress: 'D', outerwear: 'O', shoes: 'S', bag: 'G', jewelry: 'J',
};

const formatSeasonTag = (tag: string) =>
  tag === 'all-season' ? 'All season' : tag.charAt(0).toUpperCase() + tag.slice(1);

export default function WardrobeScreen() {
  const insets = useSafeAreaInsets();
  const { wardrobeItems, activeWardrobeItems, canAddItem, isPremium, isGuest, itemCap } = useApp();
  const [filter, setFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'grid' || val === 'list') setViewMode(val);
    });
  }, []);

  const switchView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const hiddenCount = wardrobeItems.length - activeWardrobeItems.length;
  const filteredItems = filter === 'all'
    ? activeWardrobeItems
    : activeWardrobeItems.filter(item => item.category === filter);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (canAddItem) {
      router.push('/add-item');
    } else {
      router.push('/premium');
    }
  };

  const renderListItem = ({ item, index }: { item: WardrobeItem; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(400)}>
      <Pressable
        style={({ pressed }) => [styles.listCard, pressed && { opacity: 0.72 }]}
        onPress={() => router.push(`/item-detail?id=${item.id}`)}
      >
        <Image
          source={{ uri: item.photoUri }}
          style={[styles.listThumb, { backgroundColor: colorDots[item.colorFamily] || Colors.border }]}
          contentFit="cover"
        />
        <View style={styles.listMeta}>
          <Text style={styles.listItemType} numberOfLines={1}>
            {item.subType.replace(/-/g, ' ')}
          </Text>
          <View style={styles.listColorRow}>
            <View style={[styles.colorDot, { backgroundColor: colorDots[item.colorFamily] || '#ccc' }]} />
            <Text style={styles.listColorText}>{item.colorFamily}</Text>
          </View>
          <View style={styles.pillRow}>
            {item.seasonTags.slice(0, 1).map(s => (
              <View key={s} style={styles.sagePill}>
                <Text style={styles.sagePillText}>{formatSeasonTag(s)}</Text>
              </View>
            ))}
            {item.occasionTags.slice(0, 1).map(t => (
              <View key={t} style={styles.blushPill}>
                <Text style={styles.blushPillText}>{t.replace(/-/g, ' ')}</Text>
              </View>
            ))}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={14} color={Colors.border} style={styles.listChevron} />
      </Pressable>
    </Animated.View>
  );

  const renderGridItem = ({ item, index }: { item: WardrobeItem; index: number }) => {
    const initial = categoryInitial[item.category] || item.category[0].toUpperCase();
    return (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(350)} style={styles.gridCell}>
        <Pressable
          style={({ pressed }) => [styles.gridPressable, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
          onPress={() => router.push(`/item-detail?id=${item.id}`)}
        >
          <Image
            source={{ uri: item.photoUri }}
            style={[styles.gridImage, { backgroundColor: colorDots[item.colorFamily] || Colors.border }]}
            contentFit="cover"
          />
          <View style={styles.gridBadge}>
            <Text style={styles.gridBadgeText}>{initial}</Text>
          </View>
          <View style={styles.gridLabel}>
            <Text style={styles.gridLabelText} numberOfLines={1}>
              {item.subType.replace(/-/g, ' ')}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const isEmpty = filteredItems.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.subtitle}>
            {activeWardrobeItems.length} items{!isPremium ? ` · ${itemCap} max` : ''}
          </Text>
          <Text style={styles.title}>Wardrobe</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.viewToggle}>
            <Pressable
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => switchView('list')}
              hitSlop={4}
            >
              <Ionicons
                name="list-outline"
                size={18}
                color={viewMode === 'list' ? Colors.white : Colors.textSecondary}
              />
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
              onPress={() => switchView('grid')}
              hitSlop={4}
            >
              <Ionicons
                name="grid-outline"
                size={16}
                color={viewMode === 'grid' ? Colors.white : Colors.textSecondary}
              />
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.8 }]}
            onPress={handleAdd}
          >
            <Ionicons name="add" size={24} color={Colors.white} />
          </Pressable>
        </View>
      </View>

      {/* Category filter chips */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categoryFilters}
          keyExtractor={item => item}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          renderItem={({ item: cat }) => (
            <Pressable
              style={[styles.filterChip, filter === cat && styles.filterChipActive]}
              onPress={() => { setFilter(cat); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.filterText, filter === cat && styles.filterTextActive]}>
                {categoryLabels[cat]}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Hidden items banner */}
      {hiddenCount > 0 && (
        <Pressable style={styles.hiddenBanner} onPress={() => router.push('/premium')}>
          <Ionicons name="lock-closed" size={13} color={Colors.secondary} />
          <Text style={styles.hiddenBannerText}>
            {hiddenCount} item{hiddenCount > 1 ? 's' : ''} hidden — upgrade to show all
          </Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.secondary} />
        </Pressable>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="shirt-outline" size={40} color={Colors.secondary} />
          </View>
          <Text style={styles.emptyTitle}>
            {activeWardrobeItems.length === 0 ? 'Start your closet' : 'No items here yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeWardrobeItems.length === 0
              ? 'Add your first piece to begin building your wardrobe'
              : 'Try a different category, or add an item here'}
          </Text>
          {activeWardrobeItems.length === 0 && (
            <Pressable
              style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] }]}
              onPress={handleAdd}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyActionText}>Add First Item</Text>
            </Pressable>
          )}
        </View>
      ) : viewMode === 'list' ? (
        <FlatList
          key="list"
          data={filteredItems}
          renderItem={renderListItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="grid"
          data={filteredItems}
          renderItem={renderGridItem}
          keyExtractor={item => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 12, marginBottom: 14,
  },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: rs(30), color: Colors.primary, letterSpacing: -0.8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // View toggle
  viewToggle: {
    flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  toggleBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: { backgroundColor: Colors.primary },

  // Add button
  addButton: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  // Filters
  filterRow: { marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.white, marginRight: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  // Hidden banner
  hiddenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.secondary + '10', borderRadius: 12,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  hiddenBannerText: { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.secondary, flex: 1 },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.secondary + '12', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, borderWidth: 1, borderColor: Colors.secondary + '20',
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(18), color: Colors.primary,
    marginTop: 16, textAlign: 'center', letterSpacing: -0.2,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular', fontSize: rs(14), color: Colors.textSecondary,
    marginTop: 8, textAlign: 'center', lineHeight: 21,
  },
  emptyAction: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 13, marginTop: 24,
    shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  emptyActionText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.white },

  // ─── List view ───────────────────────────────────────────
  listContent: { paddingHorizontal: 20, paddingBottom: 120, gap: 10 },
  listCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  listThumb: { width: 76, height: 92 },
  listMeta: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  listItemType: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary,
    textTransform: 'capitalize', letterSpacing: -0.1,
  },
  listColorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 0.5, borderColor: Colors.border },
  listColorText: {
    fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, textTransform: 'capitalize',
  },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  sagePill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
    backgroundColor: Colors.sage + '20',
  },
  sagePillText: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10), color: Colors.sage, textTransform: 'capitalize',
  },
  blushPill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
    backgroundColor: Colors.blush + '45',
  },
  blushPillText: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10), color: '#A67B82', textTransform: 'capitalize',
  },
  listChevron: { paddingHorizontal: 14 },

  // ─── Grid view ───────────────────────────────────────────
  gridContent: { paddingHorizontal: 14, paddingBottom: 120 },
  gridRow: { gap: 6, marginBottom: 6 },
  gridCell: { flex: 1 },
  gridPressable: { flex: 1, borderRadius: 12, overflow: 'hidden', aspectRatio: 0.9 },
  gridImage: { width: '100%', height: '100%' },
  gridBadge: {
    position: 'absolute', top: 6, left: 6,
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(16,24,38,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  gridBadgeText: {
    fontFamily: 'Inter_700Bold', fontSize: rs(9), color: Colors.white,
  },
  gridLabel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingVertical: 6, paddingHorizontal: 6,
    backgroundColor: 'rgba(16,24,38,0.45)',
  },
  gridLabelText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(9), color: Colors.white,
    textAlign: 'center', textTransform: 'capitalize', letterSpacing: 0.2,
  },
});
