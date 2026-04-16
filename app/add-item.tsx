import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useApp, ItemCategory, OccasionTag, SeasonTag, subTypes, colorFamilies } from '@/contexts/AppContext';
import type { Pattern, PatternScale, Fabric, Fit } from '@/constants/types';

const PATTERNS: readonly Pattern[] = ['solid','stripe','floral','check','print','color-block','geometric','animal'] as const;
const PATTERN_SCALES: readonly PatternScale[] = ['small','medium','large'] as const;
const FABRICS: readonly Fabric[] = ['cotton','silk','denim','wool','linen','synthetic','leather','knit','satin','cashmere'] as const;
const FITS: readonly Fit[] = ['slim','regular','loose','oversized','tailored'] as const;
const asPattern = (v: string | undefined): Pattern | undefined =>
  v && (PATTERNS as readonly string[]).includes(v) ? (v as Pattern) : undefined;
const asPatternScale = (v: string | undefined): PatternScale | undefined =>
  v && (PATTERN_SCALES as readonly string[]).includes(v) ? (v as PatternScale) : undefined;
const asFabric = (v: string | undefined): Fabric | undefined =>
  v && (FABRICS as readonly string[]).includes(v) ? (v as Fabric) : undefined;
const asFit = (v: string | undefined): Fit | undefined =>
  v && (FITS as readonly string[]).includes(v) ? (v as Fit) : undefined;
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { apiRequest } from '@/lib/query-client';

const CATEGORIES: { id: ItemCategory; label: string; icon: string }[] = [
  { id: 'top', label: 'Top', icon: 'shirt-outline' },
  { id: 'bottom', label: 'Bottom', icon: 'resize-outline' },
  { id: 'dress', label: 'Dress', icon: 'body-outline' },
  { id: 'outerwear', label: 'Outerwear', icon: 'cloudy-outline' },
  { id: 'shoes', label: 'Shoes', icon: 'footsteps-outline' },
  { id: 'bag', label: 'Bag', icon: 'bag-handle-outline' },
  { id: 'jewelry', label: 'Jewelry', icon: 'diamond-outline' },
];

const OCCASIONS: OccasionTag[] = ['work', 'casual', 'date', 'event'];
const SEASONS: SeasonTag[] = ['all-season', 'spring', 'summer', 'fall', 'winter'];

const colorDots: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', navy: '#1B2A4A', beige: '#D4C5A9',
  grey: '#8B8B8B', brown: '#6B4226', red: '#C0392B', pink: '#E8A0BF',
  blue: '#3498DB', green: '#27AE60', burgundy: '#7D2027', cream: '#FFFDD0',
  olive: '#556B2F', camel: '#C19A6B', lavender: '#B57EDC', coral: '#FF7F50',
};

function localClassifyFallback(category: ItemCategory): { subType: string; colorFamily: string } {
  const types = subTypes[category];
  const randomType = types[Math.floor(Math.random() * types.length)];
  const randomColor = colorFamilies[Math.floor(Math.random() * colorFamilies.length)];
  return { subType: randomType, colorFamily: randomColor };
}

export default function AddItemScreen() {
  const insets = useSafeAreaInsets();
  const { addWardrobeItem } = useApp();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [category, setCategory] = useState<ItemCategory>('top');
  const [subType, setSubType] = useState<string>('');
  const [colorFamily, setColorFamily] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [classifying, setClassifying] = useState(false);
  const [occasions, setOccasions] = useState<OccasionTag[]>([]);
  const [seasons, setSeasons] = useState<SeasonTag[]>(['all-season']);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [step, setStep] = useState(0);
  const [pattern, setPattern] = useState<string | undefined>(undefined);
  const [patternScale, setPatternScale] = useState<string | undefined>(undefined);
  const [fabric, setFabric] = useState<string | undefined>(undefined);
  const [accentColor, setAccentColor] = useState<string | undefined>(undefined);
  const [fit, setFit] = useState<string | undefined>(undefined);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const classifyWithServer = async (base64: string, cat: ItemCategory): Promise<{ category: ItemCategory; subType: string; colorFamily: string; accentColor?: string; description: string; occasionTags: OccasionTag[]; pattern?: string; patternScale?: string; fabric?: string }> => {
    try {
      const res = await apiRequest('POST', '/api/classify-garment', { imageBase64: base64 });
      const data = await res.json();
      const fallback = localClassifyFallback(cat);
      return {
        category: (data.category as ItemCategory) || cat,
        subType: data.subType || fallback.subType,
        colorFamily: data.colorFamily || fallback.colorFamily,
        accentColor: data.accentColor,
        description: data.description || '',
        occasionTags: Array.isArray(data.occasionTags) ? data.occasionTags : [],
        pattern: data.pattern,
        patternScale: data.patternScale,
        fabric: data.fabric,
      };
    } catch {
      const fallback = localClassifyFallback(cat);
      return { category: cat, subType: fallback.subType, colorFamily: fallback.colorFamily, description: '', occasionTags: [] };
    }
  };

  const pickImage = async (useCamera: boolean) => {
    setPattern(undefined);
    setPatternScale(undefined);
    setFabric(undefined);
    setAccentColor(undefined);
    setFit(undefined);
    try {
      let result: ImagePicker.ImagePickerResult;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        quality: 0.8,
        allowsEditing: true,
        base64: true,
      };
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to photograph items');
          return;
        }
        result = await ImagePicker.launchCameraAsync(pickerOptions);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      }
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setStep(1);

        if (asset.base64) {
          setClassifying(true);
          const classified = await classifyWithServer(asset.base64, category);
          setCategory(classified.category);
          setSubType(classified.subType);
          setColorFamily(classified.colorFamily);
          setDescription(classified.description);
          if (classified.occasionTags.length > 0) {
            setOccasions(classified.occasionTags);
          }
          if (classified.pattern) setPattern(classified.pattern);
          if (classified.patternScale) setPatternScale(classified.patternScale);
          if (classified.fabric) setFabric(classified.fabric);
          if (classified.accentColor) setAccentColor(classified.accentColor);
          setClassifying(false);
        } else {
          const fallback = localClassifyFallback(category);
          setSubType(fallback.subType);
          setColorFamily(fallback.colorFamily);
          setDescription('');
        }
      }
    } catch (e) {
      console.error('Image pick error:', e);
      setClassifying(false);
    }
  };

  const handleSave = () => {
    if (!photoUri) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const parsedPrice = parseFloat(purchasePrice.replace(/[^0-9.]/g, ''));
    addWardrobeItem({
      photoUri,
      category,
      subType: subType || subTypes[category][0],
      colorFamily: colorFamily || 'black',
      description: description || undefined,
      occasionTags: occasions,
      seasonTags: seasons,
      formalityLevel: 3,
      purchasePrice: isNaN(parsedPrice) || parsedPrice <= 0 ? undefined : parsedPrice,
      pattern: asPattern(pattern),
      patternScale: asPatternScale(patternScale),
      fabric: asFabric(fabric),
      fit: asFit(fit),
      accentColor: accentColor && colorFamilies.includes(accentColor) ? accentColor : undefined,
    });
    router.back();
  };

  const toggleOccasion = (tag: OccasionTag) => {
    setOccasions(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const toggleSeason = (tag: SeasonTag) => {
    setSeasons(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topTitle}>Add Item</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={styles.sectionTitle}>Choose Photo</Text>
            <View style={styles.cropTip}>
              <Ionicons name="crop-outline" size={14} color={Colors.secondary} />
              <Text style={styles.cropTipText}>Crop tightly around the garment and remove any background for the most accurate results.</Text>
            </View>
            <View style={styles.photoActions}>
              <Pressable
                style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.7 }]}
                onPress={() => pickImage(true)}
              >
                <View style={styles.photoBtnIcon}>
                  <Ionicons name="camera" size={28} color={Colors.secondary} />
                </View>
                <Text style={styles.photoBtnLabel}>Take Photo</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.photoBtn, pressed && { opacity: 0.7 }]}
                onPress={() => pickImage(false)}
              >
                <View style={styles.photoBtnIcon}>
                  <Ionicons name="images" size={28} color={Colors.sage} />
                </View>
                <Text style={styles.photoBtnLabel}>From Gallery</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat.id}
                  style={[styles.categoryChip, category === cat.id && styles.categoryChipActive]}
                  onPress={() => { setCategory(cat.id); Haptics.selectionAsync(); }}
                >
                  <Ionicons name={cat.icon as any} size={18} color={category === cat.id ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.categoryLabel, category === cat.id && styles.categoryLabelActive]}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.duration(400)}>
            {photoUri && (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} contentFit="cover" />
                <Pressable style={styles.changePhoto} onPress={() => setStep(0)}>
                  <Ionicons name="camera-reverse" size={18} color={Colors.white} />
                </Pressable>
              </View>
            )}

            {classifying ? (
              <View style={styles.classifyingRow}>
                <ActivityIndicator size="small" color={Colors.secondary} />
                <Text style={styles.classifyingText}>Analysing your item…</Text>
              </View>
            ) : description ? (
              <View style={styles.descriptionCard}>
                <Ionicons name="sparkles" size={15} color={Colors.secondary} />
                <Text style={styles.descriptionText}>{"Looks like " + description.charAt(0).toLowerCase() + description.slice(1)}</Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.id}
                    style={[styles.chipSmall, category === cat.id && styles.chipSmallActive]}
                    onPress={() => {
                      setCategory(cat.id);
                      const c = localClassifyFallback(cat.id);
                      setSubType(c.subType);
                    }}
                  >
                    <Text style={[styles.chipSmallText, category === cat.id && styles.chipSmallTextActive]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.sectionTitle}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {subTypes[category].map(st => (
                  <Pressable
                    key={st}
                    style={[styles.chipSmall, subType === st && styles.chipSmallActive]}
                    onPress={() => setSubType(st)}
                  >
                    <Text style={[styles.chipSmallText, subType === st && styles.chipSmallTextActive]}>{st.replace('-', ' ')}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.sectionTitle}>Color</Text>
            <View style={styles.colorGrid}>
              {colorFamilies.map(cf => (
                <Pressable
                  key={cf}
                  style={[styles.colorChip, colorFamily === cf && styles.colorChipActive]}
                  onPress={() => setColorFamily(cf)}
                >
                  <View style={[styles.colorDot, { backgroundColor: colorDots[cf] || '#ccc' }]} />
                  <Text style={[styles.colorLabel, colorFamily === cf && { color: Colors.primary }]}>{cf}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Occasion</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {OCCASIONS.map(o => (
                <Pressable
                  key={o}
                  style={[styles.chipSmall, occasions.includes(o) && styles.chipSmallActive]}
                  onPress={() => toggleOccasion(o)}
                >
                  <Text style={[styles.chipSmallText, occasions.includes(o) && styles.chipSmallTextActive]}>{o}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Season</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {SEASONS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.chipSmall, seasons.includes(s) && styles.chipSmallActive]}
                  onPress={() => toggleSeason(s)}
                >
                  <Text style={[styles.chipSmallText, seasons.includes(s) && styles.chipSmallTextActive]}>{s.replace('-', ' ')}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Pattern <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {PATTERNS.map(p => (
                <Pressable key={p}
                  style={[styles.chipSmall, pattern === p && styles.chipSmallActive]}
                  onPress={() => {
                    const next = pattern === p ? undefined : p;
                    setPattern(next);
                    if (!next || next === 'solid') setPatternScale(undefined);
                  }}>
                  <Text style={[styles.chipSmallText, pattern === p && styles.chipSmallTextActive]}>{p.replace('-', ' ')}</Text>
                </Pressable>
              ))}
            </View>
            {pattern && pattern !== 'solid' && (
              <>
                <Text style={styles.sectionTitle}>Pattern scale</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {PATTERN_SCALES.map(s => (
                    <Pressable key={s}
                      style={[styles.chipSmall, patternScale === s && styles.chipSmallActive]}
                      onPress={() => setPatternScale(patternScale === s ? undefined : s)}>
                      <Text style={[styles.chipSmallText, patternScale === s && styles.chipSmallTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.sectionTitle}>Fabric <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {FABRICS.map(f => (
                <Pressable key={f}
                  style={[styles.chipSmall, fabric === f && styles.chipSmallActive]}
                  onPress={() => setFabric(fabric === f ? undefined : f)}>
                  <Text style={[styles.chipSmallText, fabric === f && styles.chipSmallTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionTitle}>Fit <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {FITS.map(f => (
                <Pressable key={f}
                  style={[styles.chipSmall, fit === f && styles.chipSmallActive]}
                  onPress={() => setFit(fit === f ? undefined : f)}>
                  <Text style={[styles.chipSmallText, fit === f && styles.chipSmallTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Purchase Price <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <View style={styles.priceInputRow}>
              <View style={styles.priceCurrencyWrap}>
                <Ionicons name="pricetag-outline" size={15} color={Colors.textSecondary} />
              </View>
              <TextInput
                style={styles.priceInput}
                placeholder="e.g. 45.00"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                returnKeyType="done"
              />
            </View>
            <Text style={styles.priceHint}>Used to calculate cost per wear as you log outfits</Text>
          </Animated.View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {step === 1 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}>
          <Pressable
            style={[styles.saveButton, (!photoUri || classifying) && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={!photoUri || classifying}
          >
            <Ionicons name="checkmark" size={22} color={Colors.white} />
            <Text style={styles.saveButtonText}>Save to Wardrobe</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: Colors.primary },
  scrollContent: { paddingHorizontal: 20 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary, marginBottom: 12, letterSpacing: -0.3 },
  cropTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.secondary + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14, borderWidth: 1, borderColor: Colors.secondary + '30' },
  cropTipText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  photoActions: { flexDirection: 'row', gap: 14 },
  photoBtn: { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 24, alignItems: 'center' },
  photoBtnIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  photoBtnLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  categoryLabelActive: { color: Colors.white },
  photoPreview: { width: '100%', aspectRatio: 0.75, borderRadius: 16, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  changePhoto: { position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  classifyingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  classifyingText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  descriptionCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  descriptionText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary, flex: 1 },
  chipSmall: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipSmallActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipSmallText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, textTransform: 'capitalize' },
  chipSmallTextActive: { color: Colors.white },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  colorChipActive: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '10' },
  colorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: Colors.border },
  colorLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16 },
  saveButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
  optionalLabel: { fontFamily: 'Inter_400Regular', color: Colors.textLight, fontSize: 13 },
  priceInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: 'hidden' },
  priceCurrencyWrap: { paddingHorizontal: 12, paddingVertical: 13, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.background },
  priceInput: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.primary, paddingHorizontal: 14, paddingVertical: 13 },
  priceHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, marginBottom: 24, lineHeight: 17 },
});
