import { StyleSheet, Text, View, FlatList, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useApp, WardrobeItem } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useState } from 'react';

const categoryFilters = ['all', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'jewelry'] as const;
const categoryLabels: Record<string, string> = {
  all: 'All', top: 'Tops', bottom: 'Bottoms', dress: 'Dresses',
  outerwear: 'Outerwear', shoes: 'Shoes', bag: 'Bags', jewelry: 'Jewelry',
};

const colorDots: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', navy: '#1B2A4A', beige: '#D4C5A9',
  grey: '#8B8B8B', brown: '#6B4226', red: '#C0392B', pink: '#E8A0BF',
  blue: '#3498DB', green: '#27AE60', burgundy: '#7D2027', cream: '#FFFDD0',
  olive: '#556B2F', camel: '#C19A6B', lavender: '#B57EDC', coral: '#FF7F50',
  gold: '#D4AF37', silver: '#C0C0C0',
};

export default function WardrobeScreen() {
  const insets = useSafeAreaInsets();
  const { wardrobeItems, removeWardrobeItem, canAddItem, isPremium } = useApp();
  const [filter, setFilter] = useState<string>('all');
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const filteredItems = filter === 'all' ? wardrobeItems : wardrobeItems.filter(item => item.category === filter);

  const handleDelete = (item: WardrobeItem) => {
    if (Platform.OS === 'web') {
      removeWardrobeItem(item.id);
    } else {
      Alert.alert('Remove Item', `Remove this ${item.subType}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeWardrobeItem(item.id) },
      ]);
    }
  };

  const renderItem = ({ item, index }: { item: WardrobeItem; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(400)} style={styles.itemCard}>
      <Pressable
        style={({ pressed }) => [styles.itemPressable, pressed && { opacity: 0.8 }]}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          handleDelete(item);
        }}
      >
        <Image source={{ uri: item.photoUri }} style={styles.itemImage} contentFit="cover" />
        <View style={styles.itemInfo}>
          <Text style={styles.itemType} numberOfLines={1}>{item.subType.replace('-', ' ')}</Text>
          <View style={styles.itemMeta}>
            <View style={[styles.colorDot, { backgroundColor: colorDots[item.colorFamily] || '#ccc' }]} />
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
        </View>
        {item.occasionTags.length > 0 && (
          <View style={styles.tagRow}>
            {item.occasionTags.slice(0, 2).map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Wardrobe</Text>
          <Text style={styles.subtitle}>
            {wardrobeItems.length} items{!isPremium ? ` / 30 max` : ''}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.8 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (canAddItem) {
              router.push('/add-item');
            } else {
              router.push('/premium');
            }
          }}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </Pressable>
      </View>

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
              onPress={() => setFilter(cat)}
            >
              <Text style={[styles.filterText, filter === cat && styles.filterTextActive]}>
                {categoryLabels[cat]}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {filteredItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="shirt-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>
            {wardrobeItems.length === 0 ? 'Start your closet' : 'No items in this category'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {wardrobeItems.length === 0 ? 'Add your first item to begin building your wardrobe' : 'Try adding items to this category'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!filteredItems.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 8, marginBottom: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterRow: { marginBottom: 16 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.white, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  row: { paddingHorizontal: 20, gap: 12 },
  listContent: { paddingBottom: 120, gap: 12 },
  itemCard: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, overflow: 'hidden' },
  itemPressable: { flex: 1 },
  itemImage: { width: '100%', aspectRatio: 0.85, backgroundColor: Colors.border },
  itemInfo: { padding: 12 },
  itemType: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, textTransform: 'capitalize' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 0.5, borderColor: Colors.border },
  itemCategory: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  tagRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingBottom: 12 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: Colors.sage + '20' },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.sage, textTransform: 'capitalize' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary, marginTop: 16, textAlign: 'center' },
  emptySubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
