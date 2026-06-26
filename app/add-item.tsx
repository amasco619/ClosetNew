import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useApp, ItemCategory, OccasionTag, SeasonTag, subTypes, colorFamilies } from '@/contexts/AppContext';
import type { Pattern, PatternScale, Fabric, FabricWeight, Fit, Neckline, SleeveLength, Rise, WarmthBand } from '@/constants/types';
import { SUBTYPE_FORMALITY, inferFabric, inferFabricWeight } from '@/constants/outfitScoring';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withRepeat, cancelAnimation } from 'react-native-reanimated';
import { apiRequest } from '@/lib/query-client';
import * as Crypto from 'expo-crypto';
import { uploadWardrobeImage } from '../lib/storage';
import { supabase } from '../lib/supabase';

// ─── Option lists ─────────────────────────────────────────────────────────────

const PATTERNS: readonly Pattern[] = ['solid','stripe','floral','check','print','color-block','geometric','animal'] as const;
const PATTERN_SCALES: readonly PatternScale[] = ['small','medium','large'] as const;
const FABRICS: readonly Fabric[] = [
  'chiffon','silk','satin','linen','cotton','jersey','synthetic',
  'knit','denim','tweed','wool','cashmere','suede',
  'leather','velvet','corduroy',
] as const;
const FABRIC_WEIGHTS: readonly FabricWeight[] = ['light','mid','heavy'] as const;
const FITS: readonly Fit[] = ['slim','regular','loose','oversized','tailored'] as const;
const NECKLINES: readonly Neckline[] = ['crew','v-neck','scoop','turtleneck','boat','square','halter','off-shoulder','collared'] as const;
const SLEEVES: readonly SleeveLength[] = ['sleeveless','short','three-quarter','long'] as const;
const RISES: readonly Rise[] = ['low','mid','high'] as const;
const WARMTHS: readonly WarmthBand[] = ['cold','cool','mild','warm','hot'] as const;

const WARMTH_LABELS: Record<WarmthBand, string> = {
  cold: 'cold (heavy coat)',
  cool: 'cool (jacket)',
  mild: 'mild (blazer)',
  warm: 'warm (light layer)',
  hot: 'hot (vest)',
};

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES: { id: ItemCategory; label: string; icon: string }[] = [
  { id: 'top',      label: 'Top',      icon: 'shirt-outline' },
  { id: 'bottom',   label: 'Bottom',   icon: 'resize-outline' },
  { id: 'dress',    label: 'Dress',    icon: 'body-outline' },
  { id: 'outerwear',label: 'Outerwear',icon: 'cloudy-outline' },
  { id: 'shoes',    label: 'Shoes',    icon: 'footsteps-outline' },
  { id: 'bag',      label: 'Bag',      icon: 'bag-handle-outline' },
  { id: 'jewelry',  label: 'Jewelry',  icon: 'diamond-outline' },
];

const OCCASIONS: OccasionTag[] = [
  'casual', 'work', 'brunch', 'active',
  'date-casual', 'date-dressy', 'event',
  'interview', 'travel', 'wedding', 'resort', 'night-out',
];
const OCCASION_LABELS: Record<OccasionTag, string> = {
  work: 'Work', casual: 'Casual', 'date-casual': 'Date · Day',
  'date-dressy': 'Date Night', event: 'Event',
  interview: 'Interview', wedding: 'Wedding', travel: 'Travel',
  brunch: 'Brunch', active: 'Active', resort: 'Resort', 'night-out': 'Night Out',
} satisfies Record<OccasionTag, string>;
const SEASONS: SeasonTag[] = ['all-season','spring','summer','fall','winter'];

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

// ─── Sub-type inference maps (UI-level, used for smart defaults) ──────────────

/** Obvious neckline for a given sub-type — reduces required-field friction. */
const SUBTYPE_NECKLINE: Partial<Record<string, Neckline>> = {
  'turtleneck':   'turtleneck',
  'polo-shirt':   'collared',
  'rugby-shirt':  'collared',
  'shirt':        'collared',
  'button-down':  'collared',
  't-shirt':      'crew',
  'long-sleeve':  'crew',
  'henley':       'crew',
  'hoodie':       'crew',
  'sweatshirt':   'crew',
  'sweater':      'crew',
  'knit-top':     'crew',
  'camisole':     'scoop',
  'tank-top':     'scoop',
  'crop-top':     'crew',
  'cardigan':     'v-neck',
  'wrap-dress':   'v-neck',
  'shirt-dress':  'collared',
};

/** Typical rise for a given bottom sub-type. */
const SUBTYPE_RISE: Partial<Record<string, Rise>> = {
  'jeans':        'mid',
  'chinos':       'mid',
  'shorts':       'mid',
  'leggings':     'high',
  'joggers':      'mid',
  'trousers':     'high',
  'wide-leg':     'high',
  'midi-skirt':   'mid',
  'maxi-skirt':   'mid',
  'mini-skirt':   'mid',
  'pencil-skirt': 'high',
};

/** Warmth band implied by outerwear sub-type. */
const SUBTYPE_WARMTH: Partial<Record<string, WarmthBand>> = {
  'puffer':           'cold',
  'coat':             'cold',
  'peacoat':          'cold',
  'raincoat':         'cool',
  'leather-jacket':   'cool',
  'bomber-jacket':    'cool',
  'jacket':           'mild',
  'trench':           'mild',
  'denim-jacket':     'mild',
  'blazer':           'mild',
  'vest':             'mild',
  'hoodie':           'cool',
};

// ─── Category-level requirement logic ────────────────────────────────────────

const CORE_CATEGORIES = new Set<ItemCategory>(['top','bottom','dress','outerwear']);

function isCoreCategory(cat: ItemCategory) { return CORE_CATEGORIES.has(cat); }

// ─── Type guards ──────────────────────────────────────────────────────────────

const asPattern       = (v?: string): Pattern | undefined       => v && (PATTERNS        as readonly string[]).includes(v) ? v as Pattern       : undefined;
const asPatternScale  = (v?: string): PatternScale | undefined  => v && (PATTERN_SCALES  as readonly string[]).includes(v) ? v as PatternScale  : undefined;
const asFabric        = (v?: string): Fabric | undefined        => v && (FABRICS         as readonly string[]).includes(v) ? v as Fabric        : undefined;
const asWeight        = (v?: string): FabricWeight | undefined  => v && (FABRIC_WEIGHTS  as readonly string[]).includes(v) ? v as FabricWeight  : undefined;
const asFit           = (v?: string): Fit | undefined           => v && (FITS            as readonly string[]).includes(v) ? v as Fit           : undefined;
const asNeckline      = (v?: string): Neckline | undefined      => v && (NECKLINES       as readonly string[]).includes(v) ? v as Neckline      : undefined;
const asSleeve        = (v?: string): SleeveLength | undefined  => v && (SLEEVES         as readonly string[]).includes(v) ? v as SleeveLength  : undefined;
const asRise          = (v?: string): Rise | undefined          => v && (RISES           as readonly string[]).includes(v) ? v as Rise          : undefined;
const asWarmth        = (v?: string): WarmthBand | undefined    => v && (WARMTHS         as readonly string[]).includes(v) ? v as WarmthBand    : undefined;

function localClassifyFallback(category: ItemCategory): { subType: string; colorFamily: string } {
  const types = subTypes[category];
  return {
    subType: types[Math.floor(Math.random() * types.length)],
    colorFamily: colorFamilies[Math.floor(Math.random() * colorFamilies.length)],
  };
}

class ContentGuardrailError extends Error {
  constructor(public reason: string) {
    super('content_guardrail');
  }
}

// ─── Save stage tracking ──────────────────────────────────────────────────────

const SAVE_STAGES = [
  { key: 'resizing',  label: 'Preparing photo…'    },
  { key: 'uploading', label: 'Uploading photo…'     },
  { key: 'saving',    label: 'Saving to wardrobe…' },
] as const;

type SaveStage = typeof SAVE_STAGES[number]['key'] | null;

function AnimatedSegment({ isActive }: { isActive: boolean }) {
  const segWidth = useRef(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    if (isActive && segWidth.current > 0) {
      fillWidth.value = withTiming(segWidth.current, { duration: 260 });
    }
  }, [isActive]);

  const fillStyle = useAnimatedStyle(() => ({ width: fillWidth.value }));

  return (
    <View
      style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' }}
      onLayout={e => {
        segWidth.current = e.nativeEvent.layout.width;
        if (isActive) fillWidth.value = withTiming(segWidth.current, { duration: 260 });
      }}
    >
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: Colors.secondary, borderRadius: 2 }, fillStyle]}
      />
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddItemScreen() {
  const insets = useSafeAreaInsets();
  const { addWardrobeItem } = useApp();

  const [photoUri,        setPhotoUri]        = useState<string | null>(null);
  const [category,        setCategory]        = useState<ItemCategory>('top');
  const [subType,         setSubType]         = useState<string>('');
  const [colorFamily,     setColorFamily]     = useState<string>('');
  const [description,     setDescription]     = useState<string>('');
  const [classifying,     setClassifying]     = useState(false);
  const [occasions,       setOccasions]       = useState<OccasionTag[]>([]);
  const [seasons,         setSeasons]         = useState<SeasonTag[]>(['all-season']);
  const [purchasePrice,   setPurchasePrice]   = useState('');
  const [step,            setStep]            = useState(0);
  const [pattern,         setPattern]         = useState<string | undefined>(undefined);
  const [patternScale,    setPatternScale]    = useState<string | undefined>(undefined);
  const [fabric,          setFabric]          = useState<string | undefined>(undefined);
  const [weight,          setWeight]          = useState<string | undefined>(undefined);
  const [accentColor,     setAccentColor]     = useState<string | undefined>(undefined);
  const [dominantHsl,     setDominantHsl]     = useState<{ h: number; s: number; l: number } | undefined>(undefined);
  const [dominantLab,     setDominantLab]     = useState<{ L: number; a: number; b: number } | undefined>(undefined);
  const [fit,             setFit]             = useState<string | undefined>(undefined);
  const [metalTone,       setMetalTone]       = useState<string | undefined>(undefined);
  const [neckline,        setNeckline]        = useState<string | undefined>(undefined);
  const [sleeveLength,    setSleeveLength]    = useState<string | undefined>(undefined);
  const [rise,            setRise]            = useState<string | undefined>(undefined);
  const [warmthBand,      setWarmthBand]      = useState<string | undefined>(undefined);
  const [photoBase64,     setPhotoBase64]     = useState<string | null>(null);
  const [photoWidth,      setPhotoWidth]      = useState<number>(0);
  const [photoHeight,     setPhotoHeight]     = useState<number>(0);
  const [saving,          setSaving]          = useState(false);
  const [saveStage,       setSaveStage]       = useState<SaveStage>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  // ─── Classifying shimmer animation ────────────────────────────────────────
  const shimmerOffset = useSharedValue(0);
  const classifyingTrackWidth = useSharedValue(0);

  useEffect(() => {
    if (classifying) {
      shimmerOffset.value = 0;
      shimmerOffset.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    } else {
      cancelAnimation(shimmerOffset);
      shimmerOffset.value = 0;
    }
  }, [classifying]);

  const shimmerStyle = useAnimatedStyle(() => {
    const trackW = classifyingTrackWidth.value;
    const fillW = trackW * 0.38;
    return {
      transform: [{ translateX: shimmerOffset.value * (trackW + fillW) - fillW }],
    };
  });

  // ─── Derived requirements ──────────────────────────────────────────────────

  const isCore       = isCoreCategory(category);
  const needsFit     = isCore;
  const needsPattern = isCore;
  const needsFabric  = isCore;
  const needsWeight  = isCore;
  const needsNeckline    = category === 'top'    || category === 'dress';
  const needsSleeveLength = category === 'top'   || category === 'dress';
  const needsRise        = category === 'bottom';
  const needsWarmth      = category === 'outerwear';

  // ─── Smart defaults when sub-type is selected ─────────────────────────────

  /**
   * Auto-infer fabric, weight, neckline, rise, warmthBand and default pattern
   * to 'solid' from a chosen sub-type. The user can always override any chip.
   * This fires on every sub-type change so correcting a mis-classified type
   * also updates the inferred fields.
   */
  const handleSubTypeSelect = (st: string) => {
    setSubType(st);

    // Fabric — use existing inference map exported from outfitScoring
    const inferredFabric = inferFabric(st);
    if (inferredFabric) setFabric(inferredFabric);

    // Weight — use existing inference map exported from outfitScoring
    const inferredWeight = inferFabricWeight(st);
    setWeight(inferredWeight);

    // Pattern — default to solid (most items are solid); user overrides if needed
    if (!pattern) setPattern('solid');

    // Neckline — infer for obvious sub-types
    const inferredNeckline = SUBTYPE_NECKLINE[st];
    if (inferredNeckline) setNeckline(inferredNeckline);

    // Rise — infer for obvious bottom sub-types
    const inferredRise = SUBTYPE_RISE[st];
    if (inferredRise) setRise(inferredRise);

    // WarmthBand — infer for obvious outerwear sub-types
    const inferredWarmth = SUBTYPE_WARMTH[st];
    if (inferredWarmth) setWarmthBand(inferredWarmth);
  };

  // ─── Classifier ───────────────────────────────────────────────────────────

  const classifyWithServer = async (
    base64: string,
    cat: ItemCategory,
  ): Promise<{
    category: ItemCategory; subType: string; colorFamily: string;
    accentColor?: string; description: string;
    occasionTags: OccasionTag[]; seasonTags: SeasonTag[];
    pattern?: string; patternScale?: string;
    fabric?: string; weight?: string;
    dominantHsl?: { h: number; s: number; l: number };
    dominantLab?: { L: number; a: number; b: number };
    fit?: string;
    neckline?: string;
    sleeveLength?: string;
    rise?: string;
    warmthBand?: string;
  }> => {
    try {
      const res  = await apiRequest('POST', '/api/classify-garment', { imageBase64: base64 });
      const data = await res.json();
      const fallback = localClassifyFallback(cat);
      return {
        category:     (data.category as ItemCategory) || cat,
        subType:      data.subType      || fallback.subType,
        colorFamily:  data.colorFamily  || fallback.colorFamily,
        accentColor:  data.accentColor,
        description:  data.description  || '',
        occasionTags: Array.isArray(data.occasionTags) ? data.occasionTags : [],
        seasonTags:   Array.isArray(data.seasonTags)   ? data.seasonTags as SeasonTag[] : [],
        pattern:      data.pattern,
        patternScale: data.patternScale,
        fabric:       data.fabric,
        weight:       data.weight,
        dominantHsl:  data.dominantHsl,
        dominantLab:  data.dominantLab,
        fit:          data.fit,
        neckline:     data.neckline,
        sleeveLength: data.sleeveLength,
        rise:         data.rise,
        warmthBand:   data.warmthBand,
      };
    } catch (err: any) {
      // apiRequest throws "<status>: {json body}" for non-2xx responses
      const msg: string = err?.message ?? '';

      if (msg.startsWith('422:')) {
        try {
          const body = JSON.parse(msg.slice(4).trim());
          if (body?.error === 'content_guardrail') {
            throw new ContentGuardrailError(
              body.reason ?? 'This image could not be classified as a clothing item.'
            );
          }
        } catch (parseErr) {
          if (parseErr instanceof ContentGuardrailError) throw parseErr;
        }
      }

      // 429 (rate-limited / quota) or any other server error — signal caller
      throw new Error('classification_unavailable');
    }
  };

  // ─── Image picker ─────────────────────────────────────────────────────────

  const resetAllFields = () => {
    setPattern(undefined);
    setPatternScale(undefined);
    setFabric(undefined);
    setWeight(undefined);
    setAccentColor(undefined);
    setFit(undefined);
    setNeckline(undefined);
    setSleeveLength(undefined);
    setRise(undefined);
    setWarmthBand(undefined);
    setDominantHsl(undefined);
    setDominantLab(undefined);
    setPhotoBase64(null);
  };

  const pickImage = async (useCamera: boolean) => {
    resetAllFields();
    try {
      let result: ImagePicker.ImagePickerResult;
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        quality: 0.8, allowsEditing: true, base64: true,
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
        setPhotoWidth(asset.width ?? 0);
        setPhotoHeight(asset.height ?? 0);
        if (asset.base64) setPhotoBase64(asset.base64);
        setStep(1);

        if (asset.base64) {
          setClassifying(true);
          // Downscale to ≤1024px wide before sending to Gemini — reduces payload from
          // 4–12 MB to ~100–300 KB with no impact on classification accuracy.
          // Full-res asset.base64 is preserved in photoBase64 for the storage upload.
          let classifyBase64 = asset.base64;
          try {
            const resized = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: 1024 } }],
              { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
            );
            if (resized.base64) classifyBase64 = resized.base64;
          } catch {
            // Resize failed — fall back silently to original base64
          }
          let classified;
          try {
            // Resize to ≤1024 px on the longest edge before sending to Gemini.
            // The original full-res base64 (asset.base64) is kept in photoBase64
            // for Supabase Storage upload so thumbnails stay crisp.
            const MAX_CLASSIFY_PX = 1024;
            const w = asset.width ?? 0;
            const h = asset.height ?? 0;
            const longestEdge = Math.max(w, h);
            let classifyBase64 = asset.base64;
            if (longestEdge > MAX_CLASSIFY_PX) {
              const scale = MAX_CLASSIFY_PX / longestEdge;
              const resized = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
              );
              classifyBase64 = resized.base64 ?? asset.base64;
            }
            classified = await classifyWithServer(classifyBase64, category);
          } catch (classifyErr: any) {
            setClassifying(false);
            if (classifyErr instanceof ContentGuardrailError) {
              setPhotoUri(null);
              setStep(0);
              Alert.alert('Photo not accepted', classifyErr.reason);
            } else {
              // API unavailable (quota, rate-limit, or server error) —
              // keep the photo and stay on step 1 so the user can fill in manually.
              Alert.alert(
                'Auto-fill unavailable',
                'We couldn\'t identify this item automatically. Please fill in the details below.',
                [{ text: 'Got it' }],
              );
            }
            return;
          }
          setCategory(classified.category);

          const validSub = subTypes[classified.category]?.includes(classified.subType) ? classified.subType : '';
          const validCol = colorFamilies.includes(classified.colorFamily) ? classified.colorFamily : '';
          setSubType(validSub);
          setColorFamily(validCol);
          setDescription(classified.description);
          if (classified.occasionTags.length > 0) setOccasions(classified.occasionTags);
          if (classified.seasonTags.length > 0)   setSeasons(classified.seasonTags);

          // Set classifier results — then fire sub-type inference to fill any gaps
          if (classified.pattern)      setPattern(classified.pattern);
          if (classified.patternScale) setPatternScale(classified.patternScale);
          if (classified.fabric)       setFabric(classified.fabric);
          if (classified.weight)       setWeight(classified.weight);
          if (classified.accentColor)  setAccentColor(classified.accentColor);
          if (classified.dominantHsl)  setDominantHsl(classified.dominantHsl);
          if (classified.dominantLab)  setDominantLab(classified.dominantLab);

          // Apply Gemini-returned detail fields (fit/neckline/sleeveLength/rise/warmthBand)
          if (classified.fit)          setFit(classified.fit);
          if (classified.neckline)     setNeckline(classified.neckline);
          if (classified.sleeveLength) setSleeveLength(classified.sleeveLength);
          if (classified.rise)         setRise(classified.rise);
          if (classified.warmthBand)   setWarmthBand(classified.warmthBand);

          // Fill any gaps from sub-type inference (only fires when classifier
          // didn't return a value — fabric/weight are checked inside the setter)
          if (validSub) {
            if (!classified.fabric)       { const f = inferFabric(validSub);       if (f) setFabric(f); }
            if (!classified.weight)       { setWeight(inferFabricWeight(validSub)); }
            if (!classified.pattern)      setPattern('solid');
            if (!classified.neckline)   { const inf = SUBTYPE_NECKLINE[validSub]; if (inf) setNeckline(inf); }
            if (!classified.rise)       { const inf = SUBTYPE_RISE[validSub];     if (inf) setRise(inf);     }
            if (!classified.warmthBand) { const inf = SUBTYPE_WARMTH[validSub];   if (inf) setWarmthBand(inf); }
          }

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

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!photoUri) return;

    if (!subType) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Type required', 'Choose the specific type for this item before saving.');
      return;
    }
    if (!colorFamily) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Color required', 'Choose the dominant color family before saving.');
      return;
    }
    if (needsFit && !fit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Fit required', 'Fit (slim, regular, loose…) is used to balance proportions across your outfit. Please pick one.');
      return;
    }
    if (needsPattern && !pattern) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Pattern required', 'Select a pattern — choose Solid if the item has no print.');
      return;
    }
    if (needsFabric && !fabric) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Fabric required', 'Fabric drives texture harmony in your outfits. Please pick the closest match.');
      return;
    }
    if (needsWeight && !weight) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Weight required', 'Weight (light / mid / heavy) helps balance layering across seasons. Please pick one.');
      return;
    }
    if (needsNeckline && !neckline) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Neckline required', 'Neckline is used to coordinate jewelry and flatter your face shape. Please pick one.');
      return;
    }
    if (needsSleeveLength && !sleeveLength) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Sleeve length required', 'Sleeve length lets the engine honour your no-sleeveless setting and balance proportions. Please pick one.');
      return;
    }
    if (needsRise && !rise) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Rise required', 'Rise (low / mid / high) affects proportion balance. Please pick one.');
      return;
    }
    if (needsWarmth && !warmthBand) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Warmth required', 'Warmth level helps the engine decide when to suggest this layer based on today\'s forecast.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    setSaveStage('resizing');
    try {
      const parsedPrice = parseFloat(purchasePrice.replace(/[^0-9.]/g, ''));
      const itemId = Crypto.randomUUID();
      let finalUri = photoUri;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && photoBase64) {
        try {
          // Resize to ≤1600 px on the longest edge before uploading to Storage.
          // Cuts a typical 12 MP upload from 6–12 MB to ~300–600 KB with no
          // visible quality loss in wardrobe thumbnails.
          const MAX_STORAGE_PX = 1600;
          let uploadBase64 = photoBase64;
          try {
            const w = photoWidth;
            const h = photoHeight;
            const longestEdge = Math.max(w, h);
            if (longestEdge > MAX_STORAGE_PX) {
              const scale = MAX_STORAGE_PX / longestEdge;
              const shrunk = await ImageManipulator.manipulateAsync(
                photoUri,
                [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }],
                { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
              );
              if (shrunk.base64) uploadBase64 = shrunk.base64;
            } else {
              // Already within the limit — still re-encode as JPEG for consistent format
              const reencoded = await ImageManipulator.manipulateAsync(
                photoUri,
                [],
                { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
              );
              if (reencoded.base64) uploadBase64 = reencoded.base64;
            }
          } catch {
            // Resize failed — fall back silently to original base64
          }
          setSaveStage('uploading');
          finalUri = await uploadWardrobeImage(session.user.id, uploadBase64, itemId, 'image/jpeg');
        } catch (uploadErr) {
          console.warn('[add-item] Storage upload failed, using local URI:', uploadErr);
        }
      }
      setSaveStage('saving');
      addWardrobeItem({
        id: itemId,
        photoUri: finalUri,
        category,
        subType,
        colorFamily,
        description: description || undefined,
        occasionTags: occasions,
        seasonTags: seasons,
        formalityLevel: SUBTYPE_FORMALITY[subType] ?? 5,
        purchasePrice: isNaN(parsedPrice) || parsedPrice <= 0 ? undefined : parsedPrice,
        pattern:      asPattern(pattern),
        patternScale: asPatternScale(patternScale),
        fabric:       asFabric(fabric),
        weight:       asWeight(weight),
        fit:          asFit(fit),
        accentColor:  accentColor && colorFamilies.includes(accentColor) ? accentColor : undefined,
        metalTone:    (metalTone === 'gold' || metalTone === 'silver' || metalTone === 'rose-gold' || metalTone === 'mixed' || metalTone === 'none') ? metalTone : undefined,
        neckline:     asNeckline(neckline),
        sleeveLength: asSleeve(sleeveLength),
        rise:         asRise(rise),
        warmthBand:   asWarmth(warmthBand),
        dominantHsl,
        dominantLab,
      });
      router.back();
    } catch (e) {
      console.error('[add-item] Save failed:', e);
      setSaving(false);
      setSaveStage(null);
    }
  };

  const toggleOccasion = (tag: OccasionTag) =>
    setOccasions(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const toggleSeason = (tag: SeasonTag) =>
    setSeasons(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  // ─── Whether the form is complete enough to save ──────────────────────────

  const canSave =
    !!photoUri && !classifying && !saving && !!subType && !!colorFamily &&
    (!needsFit          || !!fit) &&
    (!needsPattern      || !!pattern) &&
    (!needsFabric       || !!fabric) &&
    (!needsWeight       || !!weight) &&
    (!needsNeckline     || !!neckline) &&
    (!needsSleeveLength || !!sleeveLength) &&
    (!needsRise         || !!rise) &&
    (!needsWarmth       || !!warmthBand);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topTitle}>Add Item</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 0: pick photo + category ─────────────────────────────── */}
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
          /* ── Step 1: details ────────────────────────────────────────────── */
          <Animated.View entering={FadeInDown.duration(400)}>

            {/* Photo preview */}
            {photoUri && (
              <View style={styles.photoPreview}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} contentFit="cover" />
                <Pressable style={styles.changePhoto} onPress={() => setStep(0)}>
                  <Ionicons name="camera-reverse" size={18} color={Colors.white} />
                </Pressable>
              </View>
            )}

            {/* Classifier status / description */}
            {classifying ? (
              <View style={styles.classifyingCard}>
                <View style={styles.classifyingRow}>
                  <ActivityIndicator size="small" color={Colors.secondary} />
                  <Text style={styles.classifyingText}>Analysing photo…</Text>
                </View>
                <View
                  style={styles.classifyingTrack}
                  onLayout={e => { classifyingTrackWidth.value = e.nativeEvent.layout.width; }}
                >
                  <Animated.View style={[styles.classifyingFill, shimmerStyle]} />
                </View>
                <Text style={styles.classifyingHint}>Reading colour, fabric and style details</Text>
              </View>
            ) : description ? (
              <View style={styles.descriptionCard}>
                <Ionicons name="sparkles" size={15} color={Colors.secondary} />
                <Text style={styles.descriptionText}>{"Looks like " + description.charAt(0).toLowerCase() + description.slice(1)}</Text>
              </View>
            ) : null}

            {/* ── Category ────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.id}
                    style={[styles.chipSmall, category === cat.id && styles.chipSmallActive]}
                    onPress={() => {
                      setCategory(cat.id);
                      setSubType('');
                      // Reset category-specific required fields so they are
                      // re-inferred when the user picks a new sub-type
                      setNeckline(undefined);
                      setRise(undefined);
                      setWarmthBand(undefined);
                    }}
                  >
                    <Text style={[styles.chipSmallText, category === cat.id && styles.chipSmallTextActive]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* ── Type * ──────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>
              Type <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            {!subType && !classifying && (
              <Text style={styles.requiredHint}>Pick the specific type so your blueprint matches accurately.</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {subTypes[category].map(st => (
                  <Pressable
                    key={st}
                    style={[styles.chipSmall, subType === st && styles.chipSmallActive]}
                    onPress={() => handleSubTypeSelect(st)}
                  >
                    <Text style={[styles.chipSmallText, subType === st && styles.chipSmallTextActive]}>
                      {st.replace(/-/g, ' ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* ── Color * ─────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>
              Color <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            {!colorFamily && !classifying && (
              <Text style={styles.requiredHint}>Pick the dominant color family.</Text>
            )}
            <View style={styles.colorGrid}>
              {colorFamilies.map(cf => (
                <Pressable
                  key={cf}
                  style={[styles.colorChip, colorFamily === cf && styles.colorChipActive]}
                  onPress={() => {
                    if (cf !== colorFamily) {
                      setDominantHsl(undefined);
                      setDominantLab(undefined);
                    }
                    setColorFamily(cf);
                  }}
                >
                  <View style={[styles.colorDot, { backgroundColor: colorDots[cf] || '#ccc' }]} />
                  <Text style={[styles.colorLabel, colorFamily === cf && { color: Colors.primary }]}>{cf}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Fit * (required for core categories) ────────────────────── */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
              Fit{' '}
              {needsFit
                ? <Text style={styles.requiredAsterisk}>*</Text>
                : <Text style={styles.optionalLabel}>(optional)</Text>
              }
            </Text>
            {needsFit && !fit && (
              <Text style={styles.requiredHint}>
                Fit drives proportion-balance scoring — slim under loose, tailored under boxy.
              </Text>
            )}
            <View style={styles.chipRow}>
              {FITS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.chipSmall, fit === f && styles.chipSmallActive]}
                  onPress={() => {
                    // Required field: allow selecting but not de-selecting to blank
                    if (needsFit) {
                      setFit(f);
                    } else {
                      setFit(fit === f ? undefined : f);
                    }
                  }}
                >
                  <Text style={[styles.chipSmallText, fit === f && styles.chipSmallTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Pattern * (required for core, hidden for shoes/bag/jewelry) */}
            {isCore && (
              <>
                <Text style={styles.sectionTitle}>
                  Pattern <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                {!pattern && (
                  <Text style={styles.requiredHint}>Select a pattern — choose Solid if the item has no print.</Text>
                )}
                <View style={styles.chipRowWrap}>
                  {PATTERNS.map(p => (
                    <Pressable
                      key={p}
                      style={[styles.chipSmall, pattern === p && styles.chipSmallActive]}
                      onPress={() => {
                        const next = pattern === p ? 'solid' : p;
                        setPattern(next);
                        if (next === 'solid') setPatternScale(undefined);
                      }}
                    >
                      <Text style={[styles.chipSmallText, pattern === p && styles.chipSmallTextActive]}>
                        {p.replace(/-/g, ' ')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {pattern && pattern !== 'solid' && (
                  <>
                    <Text style={styles.sectionTitle}>
                      Pattern scale <Text style={styles.optionalLabel}>(optional)</Text>
                    </Text>
                    <View style={styles.chipRow}>
                      {PATTERN_SCALES.map(s => (
                        <Pressable
                          key={s}
                          style={[styles.chipSmall, patternScale === s && styles.chipSmallActive]}
                          onPress={() => setPatternScale(patternScale === s ? undefined : s)}
                        >
                          <Text style={[styles.chipSmallText, patternScale === s && styles.chipSmallTextActive]}>{s}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* ── Fabric * (required for core, hidden for shoes/bag/jewelry) */}
            {isCore && (
              <>
                <Text style={styles.sectionTitle}>
                  Fabric <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                {!fabric && (
                  <Text style={styles.requiredHint}>Fabric drives texture-harmony scoring. Pick the closest match.</Text>
                )}
                <View style={styles.chipRowWrap}>
                  {FABRICS.map(f => (
                    <Pressable
                      key={f}
                      style={[styles.chipSmall, fabric === f && styles.chipSmallActive]}
                      onPress={() => setFabric(f)}
                    >
                      <Text style={[styles.chipSmallText, fabric === f && styles.chipSmallTextActive]}>{f}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Weight * (required for core, hidden for shoes/bag/jewelry) */}
            {isCore && (
              <>
                <Text style={styles.sectionTitle}>
                  Weight <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                {!weight && (
                  <Text style={styles.requiredHint}>Weight helps balance layering — light tee under heavy coat.</Text>
                )}
                <View style={styles.chipRow}>
                  {FABRIC_WEIGHTS.map(w => (
                    <Pressable
                      key={w}
                      style={[styles.chipSmall, weight === w && styles.chipSmallActive]}
                      onPress={() => setWeight(w)}
                    >
                      <Text style={[styles.chipSmallText, weight === w && styles.chipSmallTextActive]}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Neckline * (required for top / dress) ───────────────────── */}
            {(category === 'top' || category === 'dress' || category === 'outerwear') && (
              <>
                <Text style={styles.sectionTitle}>
                  Neckline{' '}
                  {needsNeckline
                    ? <Text style={styles.requiredAsterisk}>*</Text>
                    : <Text style={styles.optionalLabel}>(optional)</Text>
                  }
                </Text>
                {needsNeckline && !neckline && (
                  <Text style={styles.requiredHint}>
                    Neckline coordinates jewelry placement and flatters your face shape.
                  </Text>
                )}
                <View style={styles.chipRowWrap}>
                  {NECKLINES.map(n => (
                    <Pressable
                      key={n}
                      style={[styles.chipSmall, neckline === n && styles.chipSmallActive]}
                      onPress={() => {
                        if (needsNeckline) {
                          setNeckline(n);
                        } else {
                          setNeckline(neckline === n ? undefined : n);
                        }
                      }}
                    >
                      <Text style={[styles.chipSmallText, neckline === n && styles.chipSmallTextActive]}>
                        {n.replace(/-/g, ' ')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Sleeve (required for top/dress; optional for outerwear) ──── */}
            {(category === 'top' || category === 'dress' || category === 'outerwear') && (
              <>
                <Text style={styles.sectionTitle}>
                  Sleeve{' '}
                  {needsSleeveLength
                    ? <Text style={styles.requiredAsterisk}>*</Text>
                    : <Text style={styles.optionalLabel}>(optional)</Text>
                  }
                </Text>
                {needsSleeveLength && !sleeveLength && (
                  <Text style={styles.requiredHint}>Needed to honour your no-sleeveless setting and balance proportions.</Text>
                )}
                <View style={styles.chipRow}>
                  {SLEEVES.map(s => (
                    <Pressable
                      key={s}
                      style={[styles.chipSmall, sleeveLength === s && styles.chipSmallActive]}
                      onPress={() => {
                        if (needsSleeveLength) {
                          setSleeveLength(s);
                        } else {
                          setSleeveLength(sleeveLength === s ? undefined : s);
                        }
                      }}
                    >
                      <Text style={[styles.chipSmallText, sleeveLength === s && styles.chipSmallTextActive]}>
                        {s.replace(/-/g, ' ')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Rise * (required for bottom) ─────────────────────────────── */}
            {category === 'bottom' && (
              <>
                <Text style={styles.sectionTitle}>
                  Rise <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                {!rise && (
                  <Text style={styles.requiredHint}>Rise affects waist-definition and proportion balance.</Text>
                )}
                <View style={styles.chipRow}>
                  {RISES.map(r => (
                    <Pressable
                      key={r}
                      style={[styles.chipSmall, rise === r && styles.chipSmallActive]}
                      onPress={() => setRise(r)}
                    >
                      <Text style={[styles.chipSmallText, rise === r && styles.chipSmallTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Warmth * (required for outerwear, optional elsewhere) ────── */}
            <Text style={styles.sectionTitle}>
              Warmth{' '}
              {needsWarmth
                ? <Text style={styles.requiredAsterisk}>*</Text>
                : <Text style={styles.optionalLabel}>(optional)</Text>
              }
            </Text>
            {needsWarmth && !warmthBand && (
              <Text style={styles.requiredHint}>
                {"Warmth level lets the engine match this layer to today's forecast."}
              </Text>
            )}
            <View style={styles.chipRowWrap}>
              {WARMTHS.map(w => (
                <Pressable
                  key={w}
                  style={[styles.chipSmall, warmthBand === w && styles.chipSmallActive]}
                  onPress={() => {
                    if (needsWarmth) {
                      setWarmthBand(w);
                    } else {
                      setWarmthBand(warmthBand === w ? undefined : w);
                    }
                  }}
                >
                  <Text style={[styles.chipSmallText, warmthBand === w && styles.chipSmallTextActive]}>
                    {needsWarmth ? WARMTH_LABELS[w] : w}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Metal tone (optional — jewelry / bag / shoes) ────────────── */}
            {(category === 'jewelry' || category === 'bag' || category === 'shoes') && (
              <>
                <Text style={styles.sectionTitle}>
                  Metal tone <Text style={styles.optionalLabel}>(optional)</Text>
                </Text>
                <View style={styles.chipRowWrap}>
                  {(['gold','silver','rose-gold','mixed','none'] as const).map(m => (
                    <Pressable
                      key={m}
                      style={[styles.chipSmall, metalTone === m && styles.chipSmallActive]}
                      onPress={() => setMetalTone(metalTone === m ? undefined : m)}
                    >
                      <Text style={[styles.chipSmallText, metalTone === m && styles.chipSmallTextActive]}>
                        {m === 'rose-gold' ? 'Rose gold' : m}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Occasion ─────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>Occasion</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {OCCASIONS.map(o => (
                <Pressable
                  key={o}
                  style={[styles.chipSmall, occasions.includes(o) && styles.chipSmallActive]}
                  onPress={() => toggleOccasion(o)}
                >
                  <Text style={[styles.chipSmallText, occasions.includes(o) && styles.chipSmallTextActive]}>
                    {OCCASION_LABELS[o]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Season ───────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>Season</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {SEASONS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.chipSmall, seasons.includes(s) && styles.chipSmallActive]}
                  onPress={() => toggleSeason(s)}
                >
                  <Text style={[styles.chipSmallText, seasons.includes(s) && styles.chipSmallTextActive]}>
                    {s.replace(/-/g, ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Accent color (optional) ──────────────────────────────────── */}
            <Text style={styles.sectionTitle}>
              Accent color <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {colorFamilies.map(cf => (
                <Pressable
                  key={cf}
                  style={[styles.chipSmall, accentColor === cf && styles.chipSmallActive]}
                  onPress={() => setAccentColor(accentColor === cf ? undefined : cf)}
                >
                  <Text style={[styles.chipSmallText, accentColor === cf && styles.chipSmallTextActive]}>{cf}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Purchase price (optional) ────────────────────────────────── */}
            <Text style={styles.sectionTitle}>
              Purchase Price <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>
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

      {/* ── Save button / progress ──────────────────────────────────────────── */}
      {step === 1 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}>
          {saving ? (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.savingContainer}>
              <View style={styles.stageTrack}>
                {SAVE_STAGES.map((s, i) => {
                  const currentIdx = SAVE_STAGES.findIndex(st => st.key === saveStage);
                  return (
                    <AnimatedSegment key={s.key} isActive={i <= currentIdx} />
                  );
                })}
              </View>
              <View style={styles.stageLabelRow}>
                <ActivityIndicator size="small" color={Colors.secondary} />
                <Text style={styles.stageLabelText}>
                  {SAVE_STAGES.find(s => s.key === saveStage)?.label ?? 'Saving…'}
                </Text>
              </View>
            </Animated.View>
          ) : (
            <Pressable
              style={[styles.saveButton, !canSave && { opacity: 0.4 }]}
              onPress={handleSave}
              disabled={!canSave}
            >
              <Ionicons name="checkmark" size={22} color={Colors.white} />
              <Text style={styles.saveButtonText}>Save to Wardrobe</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.background },
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn:          { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle:          { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: Colors.primary },
  scrollContent:     { paddingHorizontal: 20 },
  sectionTitle:      { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary, marginBottom: 12, letterSpacing: -0.3, marginTop: 4 },
  cropTip:           { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.secondary + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14, borderWidth: 1, borderColor: Colors.secondary + '30' },
  cropTipText:       { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  photoActions:      { flexDirection: 'row', gap: 14 },
  photoBtn:          { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 24, alignItems: 'center' },
  photoBtnIcon:      { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  photoBtnLabel:     { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },
  categoryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  categoryChipActive:{ backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryLabel:     { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  categoryLabelActive:{ color: Colors.white },
  photoPreview:      { width: '100%', aspectRatio: 0.75, borderRadius: 16, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  previewImage:      { width: '100%', height: '100%' },
  changePhoto:       { position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  classifyingCard:   { backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  classifyingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classifyingText:   { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary },
  classifyingTrack:  { height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  classifyingFill:   { width: '38%', height: '100%', borderRadius: 2, backgroundColor: Colors.secondary },
  classifyingHint:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight, letterSpacing: 0.1 },
  savingContainer:   { alignItems: 'center', paddingVertical: 8, gap: 10 },
  stageTrack:        { flexDirection: 'row', gap: 6, width: '100%' },
  stageLabelRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageLabelText:    { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  descriptionCard:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  descriptionText:   { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary, flex: 1 },
  chipSmall:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipSmallActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipSmallText:     { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, textTransform: 'capitalize' },
  chipSmallTextActive:{ color: Colors.white },
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chipRowWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  colorGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  colorChip:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  colorChipActive:   { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '10' },
  colorDot:          { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: Colors.border },
  colorLabel:        { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, textTransform: 'capitalize' },
  footer:            { paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  saveButton:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16 },
  saveButtonText:    { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
  optionalLabel:     { fontFamily: 'Inter_400Regular', color: Colors.textLight, fontSize: 13, fontWeight: '400' },
  requiredAsterisk:  { fontFamily: 'Inter_700Bold', color: Colors.error, fontSize: 15 },
  requiredHint:      { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.error, marginTop: -8, marginBottom: 10, lineHeight: 17 },
  priceInputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: 'hidden' },
  priceCurrencyWrap: { paddingHorizontal: 12, paddingVertical: 13, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.background },
  priceInput:        { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15, color: Colors.primary, paddingHorizontal: 14, paddingVertical: 13 },
  priceHint:         { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, marginBottom: 24, lineHeight: 17 },
});
