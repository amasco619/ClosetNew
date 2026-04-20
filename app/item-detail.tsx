import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Platform, Alert, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, subTypes, colorFamilies } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';

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

function formatCPW(price: number, wears: number): string {
  if (wears === 0) return '—';
  return (price / wears).toFixed(2);
}

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { wardrobeItems, removeWardrobeItem, getItemWearCount, updateWardrobeItem } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const item = wardrobeItems.find(i => i.id === id);

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [editingType, setEditingType] = useState(false);
  const [editingColor, setEditingColor] = useState(false);

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

  const wearCount = getItemWearCount(item.id);
  const cpw = item.purchasePrice ? formatCPW(item.purchasePrice, wearCount) : null;
  const cpwInsight = (() => {
    if (cpw === null || cpw === '—') return null;
    const cpwNumber = parseFloat(cpw);
    if (cpwNumber <= 5) return `Excellent investment — only £${cpw} each time you wear this.`;
    if (cpwNumber <= 15) return `Good value at £${cpw} per wear. Keep reaching for it.`;
    return `At £${cpw} per wear, this piece has room to earn its keep.`;
  })();

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

  const handleSavePrice = () => {
    const parsed = parseFloat(priceInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      updateWardrobeItem(item.id, { purchasePrice: parsed });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (priceInput === '') {
      updateWardrobeItem(item.id, { purchasePrice: undefined });
    }
    setEditingPrice(false);
  };

  const startEditingPrice = () => {
    setPriceInput(item.purchasePrice ? String(item.purchasePrice) : '');
    setEditingPrice(true);
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

      <ScrollView showsVerticalScrollIndicator={false}>
        <Image source={{ uri: item.photoUri }} style={styles.image} contentFit="cover" />

        <View style={styles.details}>
          <Pressable style={styles.itemTypeRow} onPress={() => setEditingType(v => !v)} hitSlop={6}>
            <Text style={styles.itemType}>{item.subType.replace('-', ' ')}</Text>
            <Ionicons name={editingType ? 'chevron-up' : 'pencil-outline'} size={15} color={Colors.textSecondary} />
          </Pressable>
          {editingType && (
            <View style={styles.editChipsWrap}>
              {subTypes[item.category].map(st => (
                <Pressable
                  key={st}
                  style={[styles.editChip, item.subType === st && styles.editChipActive]}
                  onPress={() => {
                    updateWardrobeItem(item.id, { subType: st });
                    Haptics.selectionAsync();
                    setEditingType(false);
                  }}
                >
                  <Text style={[styles.editChipText, item.subType === st && styles.editChipTextActive]}>{st.replace('-', ' ')}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable style={styles.metaRow} onPress={() => setEditingColor(v => !v)} hitSlop={6}>
            <View style={[styles.dot, { backgroundColor: colorDots[item.colorFamily] || '#ccc' }]} />
            <Text style={styles.metaText}>{item.colorFamily}</Text>
            <Text style={styles.metaDivider}>|</Text>
            <Text style={styles.metaText}>{item.category}</Text>
            <Ionicons name={editingColor ? 'chevron-up' : 'pencil-outline'} size={13} color={Colors.textSecondary} style={{ marginLeft: 4 }} />
          </Pressable>
          {editingColor && (
            <View style={styles.editChipsWrap}>
              {colorFamilies.map(cf => (
                <Pressable
                  key={cf}
                  style={[styles.editColorChip, item.colorFamily === cf && styles.editColorChipActive]}
                  onPress={() => {
                    updateWardrobeItem(item.id, { colorFamily: cf });
                    Haptics.selectionAsync();
                    setEditingColor(false);
                  }}
                >
                  <View style={[styles.editColorDot, { backgroundColor: colorDots[cf] || '#ccc' }]} />
                  <Text style={[styles.editChipText, item.colorFamily === cf && styles.editChipTextActive]}>{cf}</Text>
                </Pressable>
              ))}
            </View>
          )}

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

          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Ionicons name="repeat-outline" size={18} color={Colors.secondary} />
              <Text style={styles.statValue}>{wearCount}</Text>
              <Text style={styles.statLabel}>times worn</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Ionicons name="pricetag-outline" size={18} color={Colors.secondary} />
              {item.purchasePrice ? (
                <>
                  <Text style={styles.statValue}>
                    {cpw === '—' ? '—' : `£${cpw}`}
                  </Text>
                  <Text style={styles.statLabel}>cost per wear</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.statValue, { color: Colors.textLight }]}>—</Text>
                  <Text style={styles.statLabel}>cost per wear</Text>
                </>
              )}
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <Ionicons name="cash-outline" size={18} color={Colors.secondary} />
              {item.purchasePrice ? (
                <>
                  <Text style={styles.statValue}>£{item.purchasePrice.toFixed(0)}</Text>
                  <Text style={styles.statLabel}>paid</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.statValue, { color: Colors.textLight }]}>—</Text>
                  <Text style={styles.statLabel}>paid</Text>
                </>
              )}
            </View>
          </View>

          {wearCount > 0 && item.purchasePrice && cpwInsight && (
            <View style={styles.cpwInsight}>
              <Ionicons name="sparkles" size={13} color={Colors.secondary} />
              <Text style={styles.cpwInsightText}>{cpwInsight}</Text>
            </View>
          )}

          <View style={styles.priceSection}>
            <Text style={styles.priceSectionLabel}>Purchase price</Text>
            {editingPrice ? (
              <View style={styles.priceEditRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceCurrencySymbol}>£</Text>
                  <TextInput
                    style={styles.priceTextInput}
                    value={priceInput}
                    onChangeText={setPriceInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textLight}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSavePrice}
                  />
                </View>
                <Pressable style={styles.priceSaveBtn} onPress={handleSavePrice}>
                  <Text style={styles.priceSaveBtnText}>Save</Text>
                </Pressable>
                <Pressable style={styles.priceCancelBtn} onPress={() => setEditingPrice(false)}>
                  <Ionicons name="close" size={16} color={Colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.priceDisplayRow} onPress={startEditingPrice}>
                <Text style={styles.priceDisplayValue}>
                  {item.purchasePrice ? `£${item.purchasePrice.toFixed(2)}` : 'Tap to add price'}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 0.75, backgroundColor: Colors.border },
  details: { padding: 24, paddingBottom: 48 },
  itemTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemType: { fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.primary, textTransform: 'capitalize' },
  editChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  editChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  editChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  editChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  editChipTextActive: { color: Colors.white },
  editColorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  editColorChipActive: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '12' },
  editColorDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 0.5, borderColor: Colors.border },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: Colors.border },
  metaText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary, textTransform: 'capitalize' },
  metaDivider: { color: Colors.textLight },
  tagsRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.sage + '20' },
  tagText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.sage, textTransform: 'capitalize' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.textSecondary, marginTop: 12 },

  statsCard: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 12, marginTop: 24,
    borderWidth: 1, borderColor: Colors.border,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.primary },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 8 },

  cpwInsight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: Colors.secondary + '12', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, marginTop: 12,
    borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  cpwInsightText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary, flex: 1, lineHeight: 18 },

  priceSection: { marginTop: 24 },
  priceSectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  priceDisplayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 14,
  },
  priceDisplayValue: { fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.primary },
  priceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.secondary, paddingHorizontal: 14,
  },
  priceCurrencySymbol: { fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.textSecondary, marginRight: 4 },
  priceTextInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.primary, paddingVertical: 13 },
  priceSaveBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  priceSaveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },
  priceCancelBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
