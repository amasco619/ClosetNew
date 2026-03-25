import { StyleSheet, Text, View, Pressable, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

const colorDots: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', navy: '#1B2A4A', beige: '#D4C5A9',
  grey: '#8B8B8B', brown: '#6B4226', red: '#C0392B', pink: '#E8A0BF',
  blue: '#3498DB', green: '#27AE60', burgundy: '#7D2027', cream: '#FFFDD0',
  olive: '#556B2F', camel: '#C19A6B', lavender: '#B57EDC', coral: '#FF7F50',
};

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wardrobeItems, removeWardrobeItem } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const item = wardrobeItems.find(i => i.id === id);

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.primary} />
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyText}>Item not found</Text>
        </View>
      </View>
    );
  }

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      removeWardrobeItem(item.id);
      router.back();
    } else {
      Alert.alert('Remove Item', `Remove this ${item.subType}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: () => {
            removeWardrobeItem(item.id);
            router.back();
          }
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
        <Pressable onPress={handleDelete} style={styles.closeBtn}>
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
        </Pressable>
      </View>

      <Image source={{ uri: item.photoUri }} style={styles.image} contentFit="cover" />

      <View style={styles.details}>
        <Text style={styles.itemType}>{item.subType.replace('-', ' ')}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: colorDots[item.colorFamily] || '#ccc' }]} />
          <Text style={styles.metaText}>{item.colorFamily}</Text>
          <Text style={styles.metaDivider}>|</Text>
          <Text style={styles.metaText}>{item.category}</Text>
        </View>
        {item.occasionTags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.occasionTags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {item.seasonTags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.seasonTags.map(tag => (
              <View key={tag} style={[styles.tag, { backgroundColor: Colors.blush + '30' }]}>
                <Text style={[styles.tagText, { color: Colors.primary }]}>{tag.replace('-', ' ')}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 0.75, backgroundColor: Colors.border },
  details: { padding: 24 },
  itemType: { fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.primary, textTransform: 'capitalize' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: Colors.border },
  metaText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, textTransform: 'capitalize' },
  metaDivider: { color: Colors.textLight },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.sage + '20' },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.sage, textTransform: 'capitalize' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.textSecondary, marginTop: 12 },
});
