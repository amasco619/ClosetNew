import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, Alert, ActivityIndicator, TextInput } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SwipeToDismiss from '@/components/SwipeToDismiss';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, ItemCategory, OccasionTag, SeasonTag, subTypes, colorFamilies, type WardrobeItem } from '@/contexts/AppContext';
import type { Pattern, PatternScale, Fabric, FabricWeight, Fit, Neckline, SleeveLength, Rise, WarmthBand } from '@/constants/types';
import { ALL_PATTERNS as PATTERNS, ALL_PATTERN_SCALES as PATTERN_SCALES, ALL_FABRICS as FABRICS, ALL_FABRIC_WEIGHTS as FABRIC_WEIGHTS, ALL_FITS as FITS, ALL_NECKLINES as NECKLINES, ALL_SLEEVES as SLEEVES, ALL_RISES as RISES, ALL_WARMTHS as WARMTHS } from '@/constants/types';
import { centroidHsl, centroidLab } from '@/constants/colorPerceptual';
import Colors from '@/constants/colors';
import { wardrobeCategoryLabel } from '@/constants/wardrobeLabels';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withDelay, cancelAnimation, runOnJS, interpolateColor } from 'react-native-reanimated';
import { authenticatedApiRequest } from '@/lib/query-client';
import { removeBackground, resolveClassifyBase64 } from '@/lib/photoroom';
import { classificationImagePayload, resolvePhotoUri } from '@/lib/classifyPath';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { buildGuestPhotoDestPath } from '../constants/guestPhotoCleanup';
import { uploadWardrobeImage, deleteWardrobeImage } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { rs } from '../lib/responsive';
import { selectedSingleAsset } from '../lib/imagePickerSelection';
import { AiProcessingConsent } from '@/components/AiProcessingConsent';
import {
  getAiProcessingPreference,
  setAiProcessingPreference,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreference';

// ─── Option lists ─────────────────────────────────────────────────────────────


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
  { id: 'jewelry',  label: 'Jewelry & accessories', icon: 'diamond-outline' },
];

const OCCASIONS: OccasionTag[] = [
  'casual', 'work', 'brunch', 'active',
  'date-casual', 'date-dressy', 'event',
  'interview', 'travel', 'wedding', 'traditional-event', 'resort', 'night-out',
];
const OCCASION_LABELS: Record<OccasionTag, string> = {
  work: 'Work', casual: 'Casual', 'date-casual': 'Date · Day',
  'date-dressy': 'Date Night', event: 'Event',
  interview: 'Interview', wedding: 'Wedding', 'traditional-event': 'Traditional',
  travel: 'Travel', brunch: 'Brunch', active: 'Active', resort: 'Resort', 'night-out': 'Night Out',
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
  const [segWidth, setSegWidth] = useState(0);
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    if (isActive && segWidth > 0) {
      fillWidth.value = withTiming(segWidth, { duration: 260 });
    }
  }, [isActive, segWidth]);

  const fillStyle = useAnimatedStyle(() => ({ width: fillWidth.value }));

  return (
    <View
      style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' }}
      onLayout={e => {
        setSegWidth(e.nativeEvent.layout.width);
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
  const { addWardrobeItem, replaceWardrobeItem, isPremium, isGuest } = useApp();
  const {
    initialUri,
    preClassified,
    replaceItemId,
    pcCategory,
    pcSubType,
    pcColorFamily,
    pcAccentColor,
    pcDescription,
    pcOccasionTags,
    pcSeasonTags,
    pcPattern,
    pcPatternScale,
    pcFabric,
    pcWeight,
    pcDominantHsl,
    pcDominantLab,
    pcFit,
    pcNeckline,
    pcSleeveLength,
    pcRise,
    pcWarmthBand,
  } = useLocalSearchParams<{
    initialUri?: string;
    preClassified?: string;
    replaceItemId?: string;
    pcCategory?: string;
    pcSubType?: string;
    pcColorFamily?: string;
    pcAccentColor?: string;
    pcDescription?: string;
    pcOccasionTags?: string;
    pcSeasonTags?: string;
    pcPattern?: string;
    pcPatternScale?: string;
    pcFabric?: string;
    pcWeight?: string;
    pcDominantHsl?: string;
    pcDominantLab?: string;
    pcFit?: string;
    pcNeckline?: string;
    pcSleeveLength?: string;
    pcRise?: string;
    pcWarmthBand?: string;
  }>();

  // Parse pre-classified payload once at mount — route params are strings so
  // arrays and objects need JSON.parse. Gracefully falls back to defaults if
  // the param is missing or malformed.
  const hasPreClassified = preClassified === 'true';

  const initCategory = (): ItemCategory => {
    if (hasPreClassified && pcCategory) return pcCategory as ItemCategory;
    return 'top';
  };
  const initSubType = (): string => {
    if (!hasPreClassified || !pcSubType) return '';
    const cat = initCategory();
    return (subTypes[cat] ?? []).includes(pcSubType) ? pcSubType : '';
  };
  const initColorFamily = (): string => {
    if (!hasPreClassified || !pcColorFamily) return '';
    return colorFamilies.includes(pcColorFamily) ? pcColorFamily : '';
  };
  const initOccasions = (): OccasionTag[] => {
    if (hasPreClassified && pcOccasionTags) {
      try { return JSON.parse(pcOccasionTags) as OccasionTag[]; } catch { /* fall through */ }
    }
    return [];
  };
  const initSeasons = (): SeasonTag[] => {
    if (hasPreClassified && pcSeasonTags) {
      try {
        const parsed = JSON.parse(pcSeasonTags) as SeasonTag[];
        if (parsed.length > 0) return parsed;
      } catch { /* fall through */ }
    }
    return [];
  };
  const initDominantHsl = (): { h: number; s: number; l: number } | undefined => {
    if (hasPreClassified && pcDominantHsl) {
      try { return JSON.parse(pcDominantHsl); } catch { /* fall through */ }
    }
    return undefined;
  };
  const initDominantLab = (): { L: number; a: number; b: number } | undefined => {
    if (hasPreClassified && pcDominantLab) {
      try { return JSON.parse(pcDominantLab); } catch { /* fall through */ }
    }
    return undefined;
  };

  const [photoUri,        setPhotoUri]        = useState<string | null>(initialUri ?? null);
  const photoRequestRef = useRef(0);
  const currentPhotoUriRef = useRef<string | null>(initialUri ?? null);
  const correctedFieldsRef = useRef<Set<string>>(new Set());
  const categoryRef = useRef<ItemCategory>(initCategory());
  const subTypeRef = useRef<string>(initSubType());
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [multiplePieces, setMultiplePieces] = useState(false);
  const [category,        setCategory]        = useState<ItemCategory>(initCategory);
  const [subType,         setSubType]         = useState<string>(initSubType);
  const [colorFamily,     setColorFamily]     = useState<string>(initColorFamily);
  const [description,     setDescription]     = useState<string>(hasPreClassified && pcDescription ? pcDescription : '');
  const [classifying,     setClassifying]     = useState(false);
  const [classifyFlash,   setClassifyFlash]   = useState<'none' | 'success' | 'error'>('none');
  const [occasions,       setOccasions]       = useState<OccasionTag[]>(initOccasions);
  const [seasons,         setSeasons]         = useState<SeasonTag[]>(initSeasons);
  const [purchasePrice,   setPurchasePrice]   = useState('');
  const [step,            setStep]            = useState(hasPreClassified && !replaceItemId ? 1 : 0);
  const [pattern,         setPattern]         = useState<string | undefined>(hasPreClassified && pcPattern ? pcPattern : undefined);
  const [patternScale,    setPatternScale]    = useState<string | undefined>(hasPreClassified && pcPatternScale ? pcPatternScale : undefined);
  const [fabric,          setFabric]          = useState<string | undefined>(hasPreClassified && pcFabric ? pcFabric : undefined);
  const [weight,          setWeight]          = useState<string | undefined>(hasPreClassified && pcWeight ? pcWeight : undefined);
  const [accentColor,     setAccentColor]     = useState<string | undefined>(hasPreClassified && pcAccentColor ? pcAccentColor : undefined);
  const [dominantHsl,     setDominantHsl]     = useState<{ h: number; s: number; l: number } | undefined>(initDominantHsl);
  const [dominantLab,     setDominantLab]     = useState<{ L: number; a: number; b: number } | undefined>(initDominantLab);
  const [modelConfidence, setModelConfidence] = useState<number | undefined>(undefined);
  const [formalityLevel, setFormalityLevel] = useState<number | undefined>(undefined);
  const [fit,             setFit]             = useState<string | undefined>(hasPreClassified && pcFit ? pcFit : undefined);
  const [metalTone,       setMetalTone]       = useState<string | undefined>(undefined);
  const [neckline,        setNeckline]        = useState<string | undefined>(hasPreClassified && pcNeckline ? pcNeckline : undefined);
  const [sleeveLength,    setSleeveLength]    = useState<string | undefined>(hasPreClassified && pcSleeveLength ? pcSleeveLength : undefined);
  const [rise,            setRise]            = useState<string | undefined>(
    hasPreClassified && pcRise && !['iro', 'wrapper'].includes(initSubType()) ? pcRise : undefined
  );
  const [warmthBand,      setWarmthBand]      = useState<string | undefined>(hasPreClassified && pcWarmthBand ? pcWarmthBand : undefined);
  const [photoBase64,     setPhotoBase64]     = useState<string | null>(null);
  const [photoBgRemoved,  setPhotoBgRemoved]  = useState<boolean>(false);
  const [bgStatus,        setBgStatus]        = useState<'idle'|'success'|'limit-reached'|'not-authenticated'>('idle');
  const [bgRemaining,     setBgRemaining]     = useState<number | undefined>(undefined);
  const [aiPreference, setAiPreference] = useState<AiProcessingPreference>('not_asked');
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [savingAiPreference, setSavingAiPreference] = useState(false);
  const [aiPreferenceError, setAiPreferenceError] = useState<string | null>(null);
  const [pendingAiAsset, setPendingAiAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const saveConfirmOpenRef = useRef(false);
  const saveMountedRef = useRef(true);
  useEffect(() => {
    saveMountedRef.current = true;
    return () => { saveMountedRef.current = false; };
  }, []);
  const [photoWidth,      setPhotoWidth]      = useState<number>(0);
  const [photoHeight,     setPhotoHeight]     = useState<number>(0);
  const [saving,          setSaving]          = useState(false);
  const [saveStage,       setSaveStage]       = useState<SaveStage>(null);
  const [displayedLabel,  setDisplayedLabel]  = useState<string>('Saving…');
  const stageLabelOpacity = useSharedValue(1);
  const stageLabelStyle   = useAnimatedStyle(() => ({ opacity: stageLabelOpacity.value }));

  const markCorrected = (field: string) => {
    correctedFieldsRef.current.add(field);
    setModelConfidence(undefined);
  };

  useEffect(() => {
    const next = SAVE_STAGES.find(s => s.key === saveStage)?.label ?? 'Saving…';
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue drives the label transition outside React state.
    stageLabelOpacity.value = withTiming(0, { duration: 110 }, (finished) => {
      if (finished) {
        runOnJS(setDisplayedLabel)(next);
        stageLabelOpacity.value = withTiming(1, { duration: 170 });
      }
    });
  }, [saveStage]);

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

  // ─── Completion flash animation ────────────────────────────────────────────
  const completionFillWidth = useSharedValue(0);
  const completionIsError   = useSharedValue(0);   // 0 = gold success, 1 = muted red error
  const cardFadeOpacity     = useSharedValue(1);

  const completionFillStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(completionIsError.value, [0, 1], [Colors.secondary, '#B94040']);
    return {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      bottom: 0,
      width: completionFillWidth.value,
      borderRadius: 2,
      backgroundColor: bg,
    };
  });

  const cardFadeStyle = useAnimatedStyle(() => ({ opacity: cardFadeOpacity.value }));

  /**
   * Called when the Gemini classification settles (success or error path).
   * Plays the 100 % fill flash, holds briefly, then fades the card out.
   */
  const finishClassifying = (success: boolean) => {
    cancelAnimation(shimmerOffset);
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue resets the animation before playing its completion state.
    shimmerOffset.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue sets the completion animation color.
    completionIsError.value = success ? 0 : 1;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue resets the completion animation.
    completionFillWidth.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue resets the completion animation.
    cardFadeOpacity.value = 1;
    setClassifying(false);
    setClassifyFlash(success ? 'success' : 'error');

    Haptics.notificationAsync(
      success
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );

    const trackW = classifyingTrackWidth.value;
    completionFillWidth.value = withTiming(trackW, { duration: 150 }, (filled) => {
      if (!filled) return;
      cardFadeOpacity.value = withDelay(200, withTiming(0, { duration: 150 }, (faded) => {
        if (!faded) return;
        runOnJS(setClassifyFlash)('none');
        cardFadeOpacity.value = 1;
        completionFillWidth.value = 0;
      }));
    });
  };

  // ─── Derived requirements ──────────────────────────────────────────────────

  const isCore       = isCoreCategory(category);
  const showsTextileFields = isCore || (category === 'jewelry' && ['stole', 'gele', 'headwrap', 'head-scarf'].includes(subType));
  const showsMaterialFields = showsTextileFields || category === 'shoes' || category === 'bag';
  const needsFit     = false;
  const needsPattern = false;
  const needsFabric  = false;
  const needsNeckline    = false;
  const needsSleeveLength = false;

  // Subtype is identity, not evidence of fabric, cut, thickness or warmth.
  // Keep known details; leave absent facts unknown rather than saving guesses.
  const handleSubTypeSelect = (st: string) => {
    markCorrected('subType');
    subTypeRef.current = st;
    setSubType(st);

    // A wrapper/iro has no Western trouser-rise semantic. Choosing that
    // subtype is the explicit action that invalidates any earlier rise draft.
    if (['iro', 'wrapper'].includes(st)) {
      setRise(undefined);
      correctedFieldsRef.current.add('rise');
    }
  };

  const handleCategoryChange = (nextCategory: ItemCategory) => {
    if (nextCategory === categoryRef.current) return;
    Alert.alert(
      'Change garment category?',
      'The type and details tied to the current category will be cleared so they can be reviewed for this piece.',
      [
        { text: 'Keep current', style: 'cancel' },
        {
          text: 'Change category',
          onPress: () => {
            markCorrected('category');
            correctedFieldsRef.current.add('subType');
            categoryRef.current = nextCategory;
            subTypeRef.current = '';
            setCategory(nextCategory);
            setSubType('');
            setPattern(undefined);
            setPatternScale(undefined);
            setFabric(undefined);
            setWeight(undefined);
            setFit(undefined);
            setNeckline(undefined);
            setSleeveLength(undefined);
            setRise(undefined);
            setWarmthBand(undefined);
            setMetalTone(undefined);
            for (const field of ['pattern', 'patternScale', 'fabric', 'weight', 'fit', 'neckline', 'sleeveLength', 'rise', 'warmthBand', 'metalTone']) {
              correctedFieldsRef.current.delete(field);
            }
          },
        },
      ],
    );
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
    modelConfidence?: number;
  }> => {
    try {
      const res  = await authenticatedApiRequest('POST', '/api/classify-garment', classificationImagePayload(base64));
      const data = await res.json();
      return {
        category:     (data.category as ItemCategory) || cat,
        subType:      data.subType      || '',
        colorFamily:  data.colorFamily  || '',
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
        modelConfidence: typeof data.modelConfidence === 'number'
          ? Math.min(1, Math.max(0, data.modelConfidence))
          : undefined,
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
    setMetalTone(undefined);
    setDominantHsl(undefined);
    setDominantLab(undefined);
    setPhotoBase64(null);
  };

  const pickImage = async (
    useCamera: boolean,
    existingAsset?: ImagePicker.ImagePickerAsset,
    preferenceChecked = false,
  ) => {
    let requestId = photoRequestRef.current + 1;
    try {
      let asset = existingAsset;
      if (!asset && useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to photograph items');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
        if (!result.canceled) asset = result.assets[0];
      } else if (!asset) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: !multiplePieces,
          selectionLimit: multiplePieces ? 1 : 10,
        });
        if (!result.canceled && result.assets.length > 1) {
          router.push({
            pathname: '/bulk-review',
            params: { uris: JSON.stringify(result.assets.map(a => a.uri)) },
          });
          return;
        }
        asset = selectedSingleAsset(result);
      }

      if (!asset) return;
      requestId = photoRequestRef.current + 1;
      photoRequestRef.current = requestId;
      const isNewPhoto = asset.uri !== currentPhotoUriRef.current;
      if (isNewPhoto) resetAllFields();
      currentPhotoUriRef.current = asset.uri;
      if (multiplePieces) {
        router.push({ pathname: '/multi-item-review', params: { uri: asset.uri } });
        return;
      }
      {
        const categoryWasConfirmed = correctedFieldsRef.current.has('category');
        if (isNewPhoto) correctedFieldsRef.current.clear();
        if (categoryWasConfirmed) correctedFieldsRef.current.add('category');
        categoryRef.current = category;
        if (isNewPhoto) subTypeRef.current = '';
        setClassifying(false);
        setClassifyFlash('none');
        if (isNewPhoto) {
          setSubType('');
          setColorFamily('');
          setDescription('');
          setOccasions([]);
          setSeasons([]);
          setDetailsExpanded(false);
        }
        setModelConfidence(undefined);
        if (isNewPhoto) setFormalityLevel(undefined);
        setPhotoUri(asset.uri);
        setPhotoBgRemoved(false);
        setBgStatus('idle');
        setBgRemaining(undefined);
        setPhotoWidth(asset.width ?? 0);
        setPhotoHeight(asset.height ?? 0);
        setStep(1);

        setClassifyFlash('none');
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues reset the previous completion animation before a new photo is shown.
        cardFadeOpacity.value = 1;
        // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValues reset the previous completion animation before a new photo is shown.
        completionFillWidth.value = 0;
        if (!preferenceChecked) {
          try {
            const preference = await getAiProcessingPreference();
            setAiPreference(preference);
            if (preference !== 'allowed') {
              setPendingAiAsset(asset);
              if (preference === 'not_asked') setShowAiConsent(true);
              return;
            }
          } catch {
            setPendingAiAsset(asset);
            setAiPreferenceError('Your AI preference could not be checked. This photo has not been sent.');
            return;
          }
        }
        setClassifying(true);
        // Obtain base64 from ImageManipulator (picker no longer requests base64 to
        // support multi-select without eagerly decoding multiple full-res images).
        // Downscale to ≤1024 px on the longest edge for Gemini — reduces payload from
        // 4–12 MB to ~100–300 KB with no impact on classification accuracy.
        // The result is also stored in photoBase64 as the fallback for the storage
        // upload step (which re-encodes at ≤1600 px from the URI anyway).
        let classifyBase64: string | undefined;
        let bgUploadBase64: string | null = null;
        let bgFinalUri: string | null = null;
        try {
          const MAX_CLASSIFY_PX = 1024;
          const w = asset.width ?? 0;
          const h = asset.height ?? 0;
          const longestEdge = Math.max(w, h);
          const scale = longestEdge > MAX_CLASSIFY_PX ? MAX_CLASSIFY_PX / longestEdge : 1;
          const resized = await ImageManipulator.manipulateAsync(
            asset.uri,
            longestEdge > MAX_CLASSIFY_PX
              ? [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }]
              : [],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
          );
          if (resized.base64) {
            classifyBase64 = resized.base64;
            setPhotoBase64(resized.base64);

            // Remove background via Photoroom — silent fallback if unavailable.
            // Photoroom returns a PNG; re-encode to JPEG so the classify endpoint
            // normally receives JPEG; the request MIME is checked against the
            // actual submitted bytes, including any PNG result.
            // We store the clean PNG base64 separately for the storage upload
            // (higher quality, transparent background) and update the preview URI.
            // IMPORTANT: use the file URI returned by ImageManipulator (never the
            // raw data URI) so the large base64 string never enters wardrobe state.
            const bgResult = await removeBackground(resized.base64);
            setBgStatus(
              bgResult.status === 'success' ? 'success'
              : bgResult.status === 'limit-reached' ? 'limit-reached'
              : bgResult.status === 'not-authenticated' ? 'not-authenticated'
              : 'idle',
            );
            if (bgResult.status === 'success' && bgResult.remaining !== undefined) {
              setBgRemaining(bgResult.remaining);
            }
            if (bgResult.status === 'success' && bgResult.base64) {
              const cleanPngBase64 = bgResult.base64;
              bgUploadBase64 = cleanPngBase64;
              setPhotoBase64(cleanPngBase64);
              try {
                const reencoded = await ImageManipulator.manipulateAsync(
                  `data:image/png;base64,${cleanPngBase64}`,
                  [],
                  { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
                );
                // resolvePhotoUri guards against data: URIs — only accepts
                // file:// or https:// paths; falls back to original asset URI.
                const resolvedUri = resolvePhotoUri(asset.uri, reencoded.uri);
                bgFinalUri = resolvedUri;
                setPhotoUri(resolvedUri);
                setPhotoBgRemoved(true);
                classifyBase64 = resolveClassifyBase64(classifyBase64, reencoded.base64);
              } catch {
                // Re-encode failed — keep original JPEG for classify;
                // leave photoUri as the original asset URI (no data URI stored)
                bgFinalUri = asset.uri;
              }
            }
          }
        } catch {
          // Resize failed — classifyBase64 stays undefined
        }

        if (classifyBase64) {
          try {
            const classified = await classifyWithServer(classifyBase64, category);
            // A response belongs only to the photo draft that initiated it.
            if (requestId !== photoRequestRef.current) return;
            const categoryWasCorrected = correctedFieldsRef.current.has('category');
            const resultCategory = categoryWasCorrected ? categoryRef.current : classified.category;
            if (!categoryWasCorrected) {
              categoryRef.current = classified.category;
              setCategory(classified.category);
            }

            const modelSub = subTypes[resultCategory]?.includes(classified.subType) ? classified.subType : '';
            const validSub = correctedFieldsRef.current.has('subType')
              ? (subTypes[resultCategory]?.includes(subTypeRef.current) ? subTypeRef.current : '')
              : modelSub;
            const validCol = colorFamilies.includes(classified.colorFamily) ? classified.colorFamily : '';
            if (validSub && !correctedFieldsRef.current.has('subType')) {
              subTypeRef.current = validSub;
              setSubType(validSub);
            }
            if (validCol && !correctedFieldsRef.current.has('colorFamily')) setColorFamily(validCol);
            if (!correctedFieldsRef.current.has('description')) setDescription(classified.description);
            if (classified.occasionTags.length > 0 && !correctedFieldsRef.current.has('occasionTags')) setOccasions(classified.occasionTags);
            if (classified.seasonTags.length > 0 && !correctedFieldsRef.current.has('seasonTags')) setSeasons(classified.seasonTags);

            // Set classifier results — then fire sub-type inference to fill any gaps
            if (classified.pattern && !correctedFieldsRef.current.has('pattern')) setPattern(classified.pattern);
            if (classified.patternScale && !correctedFieldsRef.current.has('patternScale')) setPatternScale(classified.patternScale);
            if (classified.fabric && !correctedFieldsRef.current.has('fabric')) setFabric(classified.fabric);
            if (classified.weight && !correctedFieldsRef.current.has('weight')) setWeight(classified.weight);
            if (classified.accentColor && !correctedFieldsRef.current.has('accentColor')) setAccentColor(classified.accentColor);
            if (!correctedFieldsRef.current.has('colorFamily')) {
              if (classified.dominantHsl) setDominantHsl(classified.dominantHsl);
              if (classified.dominantLab) setDominantLab(classified.dominantLab);
            }
            if (classified.modelConfidence !== undefined && correctedFieldsRef.current.size === 0) setModelConfidence(classified.modelConfidence);

            // Apply Gemini-returned detail fields (fit/neckline/sleeveLength/rise/warmthBand)
            if (classified.fit && !correctedFieldsRef.current.has('fit')) setFit(classified.fit);
            if (classified.neckline && !correctedFieldsRef.current.has('neckline')) setNeckline(classified.neckline);
            if (classified.sleeveLength && !correctedFieldsRef.current.has('sleeveLength')) setSleeveLength(classified.sleeveLength);
            if (classified.rise && !correctedFieldsRef.current.has('rise') && !['iro', 'wrapper'].includes(validSub)) setRise(classified.rise);
            if (classified.warmthBand && !correctedFieldsRef.current.has('warmthBand')) setWarmthBand(classified.warmthBand);

            // Omitted classifier details stay unknown. Frozen recommendation
            // fallbacks remain read-time interpretation, not saved garment facts.
            finishClassifying(true);

          } catch (classifyErr: any) {
            if (requestId !== photoRequestRef.current) return;
            if (classifyErr instanceof ContentGuardrailError) {
              // Photo rejected — reset immediately with no flash (card disappears with the step)
              setClassifying(false);
              setClassifyFlash('none');
              setPhotoUri(null);
              setPhotoBgRemoved(false);
              setStep(0);
              Alert.alert('Photo not accepted', classifyErr.reason);
            } else {
              // API unavailable (quota, rate-limit, or server error) —
              // show error flash, then keep the photo so the user can fill in manually.
              finishClassifying(false);
              Alert.alert(
                'Auto-fill unavailable',
                'The classification service could not complete this request. Your photo is safe; please try again or enter the details manually.',
                [{ text: 'Got it' }],
              );
            }
          }
        } else {
          setDescription('');
          setClassifying(false);
        }
      }
    } catch (e) {
      console.error('Image pick error:', e);
      if (requestId === photoRequestRef.current) setClassifying(false);
    }
  };

  const allowAiForCurrentPhoto = async () => {
    const asset = pendingAiAsset;
    if (!asset || savingAiPreference) return;
    setSavingAiPreference(true);
    setAiPreferenceError(null);
    try {
      await setAiProcessingPreference('allowed');
      setAiPreference('allowed');
      setShowAiConsent(false);
      await pickImage(false, asset, true);
    } catch {
      setAiPreferenceError('AI processing could not be enabled. Your photo has not been sent.');
    } finally {
      setSavingAiPreference(false);
    }
  };

  const declineAiForCurrentPhoto = () => {
    setShowAiConsent(false);
    setAiPreference('declined');
    setClassifying(false);
    setAiPreferenceError(null);
    setSavingAiPreference(true);
    void setAiProcessingPreference('declined')
      .catch(() => {
        setAiPreferenceError('Your choice could not be saved. AI processing remains unavailable until it can be checked.');
      })
      .finally(() => setSavingAiPreference(false));
  };

  const retryAiForCurrentPhoto = async () => {
    const asset = pendingAiAsset;
    if (!asset || savingAiPreference) return;
    setAiPreferenceError(null);
    try {
      const preference = await getAiProcessingPreference();
      setAiPreference(preference);
      if (preference === 'allowed') {
        await pickImage(false, asset, true);
      } else {
        setShowAiConsent(true);
      }
    } catch {
      setAiPreferenceError('Your AI preference could not be checked. This photo has not been sent.');
    }
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const saveConfirmed = async () => {
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    setSaveStage('resizing');
    let uploadedPhoto: { userId: string; itemId: string } | null = null;
    let dbStarted = false;
    try {
      const parsedPrice = parseFloat(purchasePrice.replace(/[^0-9.]/g, ''));

      const itemId = Crypto.randomUUID();
      let finalUri = photoUri;
      let finalStoragePath: string | undefined;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user || !isGuest) {
        if (!session?.user || !photoBase64) {
          throw new Error('Cloud photo upload is required to save an authenticated wardrobe item.');
        }
          // Resize to ≤1600 px on the longest edge before uploading to Storage.
          // Cuts a typical 12 MP upload from 6–12 MB to ~300–600 KB with no
          // visible quality loss in wardrobe thumbnails.
          // When background removal succeeded, photoBase64 is already the clean
          // PNG — skip ImageManipulator resize and upload directly as PNG.
          const MAX_STORAGE_PX = 1600;
          let uploadBase64 = photoBase64;
          let uploadMime: 'image/jpeg' | 'image/png' = photoBgRemoved ? 'image/png' : 'image/jpeg';
          if (!photoBgRemoved) {
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
          }
          setSaveStage('uploading');
          const { signedUrl: _signedUrl, storagePath: _sp } = await uploadWardrobeImage(session.user.id, uploadBase64, itemId, uploadMime);
          finalUri = _signedUrl;
          finalStoragePath = _sp;
          uploadedPhoto = { userId: session.user.id, itemId };
      } else {
        // Guest user — copy the photo from the temp cache to the document directory
        // so the thumbnail survives an app restart (temp files are purged by the OS).
        // buildGuestPhotoDestPath produces a path under documentDirectory so that
        // the deleteGuestPhoto cleanup guard (startsWith check) will always match.
        const ext = photoBgRemoved ? 'png' : 'jpg';
        const dest = buildGuestPhotoDestPath(FileSystem.documentDirectory!, itemId, ext);
        try {
          await FileSystem.copyAsync({ from: photoUri, to: dest });
          finalUri = dest;
        } catch (copyErr) {
          console.error('[add-item] Guest photo copy failed:', copyErr);
          throw new Error('Could not save photo to device storage — please try again.');
        }
      }
      if (uploadedPhoto && !saveMountedRef.current) throw new Error('Save cancelled before wardrobe persistence.');
      setSaveStage('saving');
      const wardrobeItem: Omit<WardrobeItem, 'id' | 'createdAt'> = {
        photoUri: finalUri,
        storagePath: finalStoragePath,
        category,
        subType,
        colorFamily,
        description: description || undefined,
        occasionTags: occasions,
        seasonTags: seasons,
        formalityLevel,
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
        modelConfidence,
        confirmedFields: Array.from(correctedFieldsRef.current),
      };
      dbStarted = true;
      if (replaceItemId) {
        await replaceWardrobeItem(replaceItemId, wardrobeItem);
      } else {
        await addWardrobeItem({ id: itemId, ...wardrobeItem });
      }
      uploadedPhoto = null;
      router.back();
    } catch (e) {
      // A lost RPC response does not prove the DB rolled back; do not delete
      // a photo that could belong to a committed row.
      const dbCode = (e as { code?: string })?.code;
      if (uploadedPhoto && (!dbStarted || (dbCode && dbCode !== 'INVALID_RPC_RESULT'))) {
        await deleteWardrobeImage(uploadedPhoto.userId, uploadedPhoto.itemId)
          .catch(cleanupError => console.warn('[add-item] Could not clean up unsaved photo:', cleanupError));
      }
      console.error('[add-item] Save failed:', e);
      setSaving(false);
      setSaveStage(null);
      const errorCode = (e as { code?: string })?.code;
      if (errorCode === 'WARDROBE_CAPACITY_REACHED') {
        Alert.alert(
          'Wardrobe is full',
          'Choose which 30 items to keep in your free wardrobe, then try again.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Choose your 30', onPress: () => router.push('/choose-30') },
          ],
        );
      } else {
        Alert.alert('Could not save this item', 'Your photo is safe. Please try again.');
      }
    }
  };

  const handleSave = () => {
    if (saving || saveConfirmOpenRef.current) return;
    saveConfirmOpenRef.current = true;
    Alert.alert(
      'Add this item?',
      'Save this piece to your wardrobe now?',
      [
        { text: 'Keep editing', style: 'cancel', onPress: () => { saveConfirmOpenRef.current = false; } },
        {
          text: 'Save item',
          onPress: () => {
            saveConfirmOpenRef.current = false;
            void saveConfirmed();
          },
        },
      ],
      { onDismiss: () => { saveConfirmOpenRef.current = false; } },
    );
  };

  const toggleOccasion = (tag: OccasionTag) => {
    markCorrected('occasionTags');
    setOccasions(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const toggleSeason = (tag: SeasonTag) => {
    markCorrected('seasonTags');
    setSeasons(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // ─── Whether the form is complete enough to save ──────────────────────────

  const canSave =
    !!photoUri && !classifying && classifyFlash === 'none' && !saving && !!subType && !!colorFamily;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SwipeToDismiss>
    <StatusBar style="dark" />
    <View style={[styles.container, { paddingTop: (Platform.OS === 'android' ? 0 : insets.top) + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.topTitle}>Add Item</Text>
        <View style={{ width: 56 }} />
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
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: multiplePieces }}
              onPress={() => setMultiplePieces(value => !value)}
              style={[styles.categoryChip, { marginTop: 16, alignSelf: 'flex-start' }, multiplePieces && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryLabel, multiplePieces && styles.categoryLabelActive]}>
                {multiplePieces ? '✓ ' : '○ '}Several pieces in one photo
              </Text>
            </Pressable>
            {multiplePieces && <Text style={{ color: Colors.textSecondary, marginTop: 8 }}>Choose one photo of 2–6 separate garments to review as a set.</Text>}

            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat.id}
                  style={[styles.categoryChip, category === cat.id && styles.categoryChipActive]}
                  onPress={() => {
                    categoryRef.current = cat.id;
                    setCategory(cat.id);
                    markCorrected('category');
                    Haptics.selectionAsync();
                  }}
                >
                  <Ionicons name={cat.icon as any} size={18} color={category === cat.id ? Colors.white : Colors.textSecondary} />
                  <Text style={[styles.categoryLabel, category === cat.id && styles.categoryLabelActive]}>{category === cat.id && subType === 'stole' ? wardrobeCategoryLabel(category, subType) : cat.label}</Text>
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

            {photoUri && aiPreference !== 'allowed' && !classifying && (
              <View style={styles.aiPausedCard}>
                <Text style={styles.aiPausedTitle}>AI processing is paused</Text>
                <Text style={styles.aiPausedCopy}>
                  Your selected photo stays here. You can enter item details yourself or choose to use AI for this photo.
                </Text>
                {aiPreferenceError && <Text style={styles.aiPausedError}>{aiPreferenceError}</Text>}
                <Pressable
                  accessibilityRole="button"
                  disabled={savingAiPreference || !pendingAiAsset}
                  onPress={retryAiForCurrentPhoto}
                  style={({ pressed }) => [styles.aiPausedAction, (savingAiPreference || !pendingAiAsset) && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.aiPausedActionText}>Use AI for this photo</Text>
                </Pressable>
              </View>
            )}

            {/* ── Remaining removals count ───────────────────────────────── */}
            {bgStatus === 'success' && !isPremium && bgRemaining !== undefined && !classifying && (
              <Animated.View entering={FadeInDown.duration(260)}>
                <View style={styles.bgRemainingPill}>
                  <Ionicons name="images-outline" size={14} color={Colors.sage} />
                  <Text style={styles.bgRemainingText}>
                    {bgRemaining} of 20 background removals left
                  </Text>
                  {bgRemaining <= 3 && (
                    <Pressable
                      onPress={() => router.push('/premium')}
                      style={({ pressed }) => [styles.bgRemainingCta, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={styles.bgRemainingCtaText}>Upgrade</Text>
                    </Pressable>
                  )}
                </View>
              </Animated.View>
            )}

            {/* ── Guest upsell: sign in to unlock BG removal ─────────────── */}
            {bgStatus === 'not-authenticated' && !classifying && (
              <Animated.View entering={FadeInDown.duration(260)}>
                <Pressable
                  style={({ pressed }) => [styles.bgUpsellPill, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push('/sign-in')}
                >
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.secondary} />
                  <Text style={styles.bgUpsellText}>Sign in to unlock automatic background removal</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                </Pressable>
              </Animated.View>
            )}

            {/* ── Limit-reached: BG removal quota exhausted ──────────────── */}
            {bgStatus === 'limit-reached' && !classifying && (
              isPremium ? (
                <Animated.View entering={FadeInDown.duration(260)} style={styles.bgLimitPill}>
                  <Ionicons name="hourglass-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.bgLimitText}>Background removal limit reached — your photo was saved as-is</Text>
                </Animated.View>
              ) : (
                <Animated.View entering={FadeInDown.duration(260)}>
                  <Pressable
                    style={({ pressed }) => [styles.bgLimitPill, styles.bgLimitPillUpgrade, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push('/premium')}
                  >
                    <Ionicons name="hourglass-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.bgLimitText}>Background removal limit reached — your photo was saved as-is</Text>
                    <View style={styles.bgLimitCta}>
                      <Text style={styles.bgLimitCtaText}>Upgrade</Text>
                      <Ionicons name="chevron-forward" size={12} color={Colors.secondary} />
                    </View>
                  </Pressable>
                </Animated.View>
              )
            )}

            {/* Classifier status / description */}
            {(classifying || classifyFlash !== 'none') ? (
              <Animated.View style={[styles.classifyingCard, cardFadeStyle]}>
                <View style={styles.classifyingRow}>
                  {classifying ? (
                    <ActivityIndicator size="small" color={Colors.secondary} />
                  ) : classifyFlash === 'success' ? (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.secondary} />
                  ) : (
                    <Ionicons name="alert-circle" size={18} color="#B94040" />
                  )}
                  <Text style={styles.classifyingText}>
                    {classifying
                      ? 'Analysing photo…'
                      : classifyFlash === 'success'
                      ? 'Analysis complete'
                      : 'Auto-fill unavailable'}
                  </Text>
                </View>
                <View
                  style={styles.classifyingTrack}
                  onLayout={e => { classifyingTrackWidth.value = e.nativeEvent.layout.width; }}
                >
                  {classifying ? (
                    <Animated.View style={[styles.classifyingFill, shimmerStyle]} />
                  ) : (
                    <Animated.View style={completionFillStyle} />
                  )}
                </View>
                <Text style={styles.classifyingHint}>
                  {classifying
                    ? 'Reading colour, fabric and style details'
                    : classifyFlash === 'success'
                    ? 'Details filled in below'
                    : 'Please fill in the details below'}
                </Text>
              </Animated.View>
            ) : description ? (
              <View style={styles.descriptionCard}>
                <Ionicons name="sparkles" size={15} color={Colors.secondary} />
                <Text style={styles.descriptionText}>{"Looks like " + description.charAt(0).toLowerCase() + description.slice(1)}</Text>
              </View>
            ) : null}

            <View style={styles.reviewIntro}>
              <Text style={styles.eyebrow}>THE STYLIST&apos;S READ</Text>
              <Text style={styles.reviewTitle}>A first impression, not a final word.</Text>
              <Text style={styles.reviewCopy}>Check the piece and colour. Keep details you know; leave anything uncertain blank.</Text>
            </View>

            <View style={styles.semanticSummary}>
              <View style={[styles.summarySwatch, colorFamily ? { backgroundColor: colorDots[colorFamily] || Colors.border } : null]} />
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>
                  {subType ? subType.replace(/-/g, ' ') : 'Garment type to review'}
                </Text>
                <Text style={styles.summaryMeta}>
                  {[wardrobeCategoryLabel(category, subType), colorFamily || 'Colour to review'].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
              <Ionicons name="sparkles-outline" size={17} color={Colors.secondary} />
            </View>
            <Text style={styles.draftHint}>Suggestions are a starting point. Your selections are the authority.</Text>

            {/* ── Category ────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat.id}
                    style={[styles.chipSmall, category === cat.id && styles.chipSmallActive]}
                    onPress={() => handleCategoryChange(cat.id)}
                  >
                    <Text style={[styles.chipSmallText, category === cat.id && styles.chipSmallTextActive]}>{category === cat.id && subType === 'stole' ? wardrobeCategoryLabel(category, subType) : cat.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* ── Type * ──────────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>
              Type <Text style={styles.requiredAsterisk}>*</Text>
            </Text>
            {!subType && !classifying && classifyFlash === 'none' && (
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
            {!colorFamily && !classifying && classifyFlash === 'none' && (
              <Text style={styles.requiredHint}>Pick the dominant color family.</Text>
            )}
            <View style={styles.colorGrid}>
              {colorFamilies.map(cf => (
                <Pressable
                  key={cf}
                  style={[styles.colorChip, colorFamily === cf && styles.colorChipActive]}
                  onPress={() => {
                    markCorrected('colorFamily');
                    // Family corrections must not keep perceptual coordinates
                    // from the previous image suggestion.
                    setDominantHsl(centroidHsl(cf));
                    setDominantLab(centroidLab(cf));
                    setColorFamily(cf);
                  }}
                >
                  <View style={[styles.colorDot, { backgroundColor: colorDots[cf] || '#ccc' }]} />
                  <Text style={[styles.colorLabel, colorFamily === cf && { color: Colors.primary }]}>{cf}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsExpanded }}
              onPress={() => setDetailsExpanded(value => !value)}
              style={({ pressed }) => [styles.detailsToggle, pressed && { opacity: 0.82, transform: [{ scale: 0.99 }] }]}
            >
              <View style={styles.detailsToggleCopy}>
                <Text style={styles.detailsToggleTitle}>Refine styling details</Text>
                <Text style={styles.detailsToggleHint}>
                  {detailsExpanded ? 'Only details relevant to this piece are shown' : 'Optional · fabric, silhouette, wear occasions'}
                </Text>
              </View>
              <Ionicons name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primary} />
            </Pressable>

            {detailsExpanded && (
            <View style={styles.detailsPanel}>
            <Text style={styles.detailsIntro}>Add only what you can confidently recognise. These help the stylist balance texture, proportion and occasion.</Text>

            {/* ── Fit (core garments) ─────────────────────────────────────── */}
            {isCore && <>
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
                    markCorrected('fit');
                    setFit(fit === f ? undefined : f);
                  }}
                >
                  <Text style={[styles.chipSmallText, fit === f && styles.chipSmallTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
            </>}

            {/* Textile accessories can record a pattern without guessing one. */}
            {showsMaterialFields && (
              <>
                <Text style={styles.sectionTitle}>
                  Pattern {needsPattern
                    ? <Text style={styles.requiredAsterisk}>*</Text>
                    : <Text style={styles.optionalLabel}>(optional)</Text>}
                </Text>
                {needsPattern && !pattern && (
                  <Text style={styles.requiredHint}>Select a pattern — choose Solid if the item has no print.</Text>
                )}
                <View style={styles.chipRowWrap}>
                  {PATTERNS.map(p => (
                    <Pressable
                      key={p}
                      style={[styles.chipSmall, pattern === p && styles.chipSmallActive]}
                      onPress={() => {
                        const next = pattern === p ? undefined : p;
                        markCorrected('pattern');
                        setPattern(next);
                        if (!next || next === 'solid') {
                          setPatternScale(undefined);
                          correctedFieldsRef.current.add('patternScale');
                        }
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
                          onPress={() => {
                            markCorrected('patternScale');
                            setPatternScale(patternScale === s ? undefined : s);
                          }}
                        >
                          <Text style={[styles.chipSmallText, patternScale === s && styles.chipSmallTextActive]}>{s}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* Fabric is optional for a stole: a visual motif cannot prove fiber. */}
            {showsTextileFields && (
              <>
                <Text style={styles.sectionTitle}>
                  Fabric {needsFabric
                    ? <Text style={styles.requiredAsterisk}>*</Text>
                    : <Text style={styles.optionalLabel}>(optional)</Text>}
                </Text>
                {needsFabric && !fabric && (
                  <Text style={styles.requiredHint}>Fabric drives texture-harmony scoring. Pick the closest match.</Text>
                )}
                <View style={styles.chipRowWrap}>
                  {FABRICS.map(f => (
                    <Pressable
                      key={f}
                      style={[styles.chipSmall, fabric === f && styles.chipSmallActive]}
                      onPress={() => {
                        markCorrected('fabric');
                        setFabric(fabric === f ? undefined : f);
                      }}
                    >
                      <Text style={[styles.chipSmallText, fabric === f && styles.chipSmallTextActive]}>{f}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Weight (layering signal for core garments) ──────────────── */}
            {isCore && (
              <>
                <Text style={styles.sectionTitle}>
                  Weight <Text style={styles.optionalLabel}>(optional)</Text>
                </Text>
                <Text style={styles.detailsIntro}>A visual estimate can help balance layers; leave it unset if unclear.</Text>
                <View style={styles.chipRow}>
                  {FABRIC_WEIGHTS.map(w => (
                    <Pressable
                      key={w}
                      style={[styles.chipSmall, weight === w && styles.chipSmallActive]}
                      onPress={() => {
                        markCorrected('weight');
                        setWeight(weight === w ? undefined : w);
                      }}
                    >
                      <Text style={[styles.chipSmallText, weight === w && styles.chipSmallTextActive]}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Neckline (tops, dresses and outerwear) ──────────────────── */}
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
                        markCorrected('neckline');
                        setNeckline(neckline === n ? undefined : n);
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

            {/* ── Sleeve (garments with sleeves) ──────────────────────────── */}
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
                        markCorrected('sleeveLength');
                        setSleeveLength(sleeveLength === s ? undefined : s);
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

            {/* ── Rise (optional, conventional bottoms only) ──────────────── */}
            {category === 'bottom' && (
              <>
                <Text style={styles.sectionTitle}>
                  Rise <Text style={styles.optionalLabel}>(optional)</Text>
                </Text>
                {!rise && <Text style={styles.detailsIntro}>Leave unset if rise is unclear or not applicable to the construction.</Text>}
                <View style={styles.chipRow}>
                  {RISES.map(r => (
                    <Pressable
                      key={r}
                      style={[styles.chipSmall, rise === r && styles.chipSmallActive]}
                      onPress={() => {
                        markCorrected('rise');
                        setRise(rise === r ? undefined : r);
                      }}
                    >
                      <Text style={[styles.chipSmallText, rise === r && styles.chipSmallTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {/* ── Warmth (weather-relevant layer) ─────────────────────────── */}
            {category === 'outerwear' && (
              <>
                <Text style={styles.sectionTitle}>Warmth <Text style={styles.optionalLabel}>(optional)</Text></Text>
                <View style={styles.chipRowWrap}>
                  {WARMTHS.map(w => (
                    <Pressable
                      key={w}
                      style={[styles.chipSmall, warmthBand === w && styles.chipSmallActive]}
                      onPress={() => {
                        markCorrected('warmthBand');
                        setWarmthBand(warmthBand === w ? undefined : w);
                      }}
                    >
                      <Text style={[styles.chipSmallText, warmthBand === w && styles.chipSmallTextActive]}>{WARMTH_LABELS[w]}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Formality <Text style={styles.optionalLabel}>(optional)</Text></Text>
            <Text style={styles.detailsIntro}>A personal rating from 1 to 10. Leave blank if you would rather not label it.</Text>
            <View style={styles.formalityRow}>
              <TextInput
                accessibilityLabel="Formality level from 1 to 10, optional"
                style={styles.formalityInput}
                placeholder="Not set"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={formalityLevel === undefined ? '' : String(formalityLevel)}
                onChangeText={value => {
                  setModelConfidence(undefined);
                  if (!value.trim()) {
                    setFormalityLevel(undefined);
                    correctedFieldsRef.current.add('formalityLevel');
                    return;
                  }
                  const numeric = Number(value);
                  if (Number.isFinite(numeric)) {
                    correctedFieldsRef.current.add('formalityLevel');
                    setFormalityLevel(Math.min(10, Math.max(1, numeric)));
                  }
                }}
              />
              <Text style={styles.formalityScale}>1 · relaxed     10 · formal</Text>
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
                      onPress={() => {
                        markCorrected('metalTone');
                        setMetalTone(metalTone === m ? undefined : m);
                      }}
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
                  onPress={() => {
                    markCorrected('accentColor');
                    setAccentColor(accentColor === cf ? undefined : cf);
                  }}
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

            </View>
            )}

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
                <Animated.Text style={[styles.stageLabelText, stageLabelStyle]}>
                  {displayedLabel}
                </Animated.Text>
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
      <AiProcessingConsent
        visible={showAiConsent}
        busy={savingAiPreference}
        onAllow={allowAiForCurrentPhoto}
        onCancel={declineAiForCurrentPhoto}
      />
    </View>
    </SwipeToDismiss>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.background },
  topBar:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  closeBtn:          { minWidth: 56, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  cancelText:        { fontFamily: 'Inter_400Regular', fontSize: rs(16), color: Colors.textSecondary, letterSpacing: -0.1 },
  topTitle:          { fontFamily: 'Inter_600SemiBold', fontSize: rs(17), color: Colors.primary },
  scrollContent:     { paddingHorizontal: 20, paddingBottom: 24 },
  reviewIntro:       { marginTop: 4, marginBottom: 14 },
  eyebrow:           { fontFamily: 'Inter_500Medium', fontSize: rs(10), letterSpacing: 1, color: Colors.sage, marginBottom: 7 },
  reviewTitle:       { fontFamily: 'Inter_600SemiBold', fontSize: rs(21), color: Colors.primary, letterSpacing: -0.5, marginBottom: 5 },
  reviewCopy:        { fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary, lineHeight: 19 },
  semanticSummary:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 6, shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  summarySwatch:     { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  summaryCopy:       { flex: 1, gap: 3 },
  summaryTitle:      { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary, textTransform: 'capitalize' },
  summaryMeta:       { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textSecondary, textTransform: 'capitalize' },
  draftHint:         { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight, marginBottom: 19 },
  detailsToggle:    { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, marginTop: 19, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  detailsToggleCopy: { gap: 3 },
  detailsToggleTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.primary },
  detailsToggleHint: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary },
  detailsPanel:     { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8 },
  detailsIntro:     { fontFamily: 'Inter_400Regular', fontSize: rs(12), lineHeight: 18, color: Colors.textSecondary, marginBottom: 12 },
  formalityRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  formalityInput:   { width: 98, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 13, backgroundColor: Colors.background, fontFamily: 'Inter_500Medium', fontSize: rs(15), color: Colors.primary },
  formalityScale:   { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary, flex: 1 },
  sectionTitle:      { fontFamily: 'Inter_600SemiBold', fontSize: rs(15), color: Colors.primary, marginBottom: 12, letterSpacing: -0.3, marginTop: 4 },
  photoActions:      { flexDirection: 'row', gap: 14 },
  photoBtn:          { flex: 1, backgroundColor: Colors.white, borderRadius: 16, padding: 24, alignItems: 'center' },
  photoBtnIcon:      { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  photoBtnLabel:     { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.primary },
  categoryGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  categoryChipActive:{ backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryLabel:     { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary },
  categoryLabelActive:{ color: Colors.white },
  photoPreview:      { width: '100%', aspectRatio: 0.75, borderRadius: 16, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  previewImage:      { width: '100%', height: '100%' },
  changePhoto:       { position: 'absolute', bottom: 12, right: 12, width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  aiPausedCard:      { backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  aiPausedTitle:     { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.primary },
  aiPausedCopy:      { fontFamily: 'Inter_400Regular', fontSize: rs(13), color: Colors.textSecondary, lineHeight: 20 },
  aiPausedError:     { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.error },
  aiPausedAction:    { minHeight: 42, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 2 },
  aiPausedActionText:{ fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.primary },
  classifyingCard:   { backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  classifyingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classifyingText:   { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.primary },
  classifyingTrack:  { height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  classifyingFill:   { width: '38%', height: '100%', borderRadius: 2, backgroundColor: Colors.secondary },
  classifyingHint:   { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight, letterSpacing: 0.1 },
  savingContainer:   { alignItems: 'center', paddingVertical: 8, gap: 10 },
  stageTrack:        { flexDirection: 'row', gap: 6, width: '100%' },
  stageLabelRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageLabelText:    { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary },
  descriptionCard:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  descriptionText:   { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.primary, flex: 1 },
  chipSmall:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipSmallActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipSmallText:     { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary, textTransform: 'capitalize' },
  chipSmallTextActive:{ color: Colors.white },
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chipRowWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  colorGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  colorChip:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  colorChipActive:   { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '10' },
  colorDot:          { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: Colors.border },
  colorLabel:        { fontFamily: 'Inter_500Medium', fontSize: rs(12), color: Colors.textSecondary, textTransform: 'capitalize' },
  footer:            { paddingHorizontal: 20, paddingTop: 12, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
  saveButton:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16 },
  saveButtonText:    { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.white },
  addedBanner:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.secondary, shadowColor: Colors.secondary, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  addedBannerIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.secondary, alignItems: 'center', justifyContent: 'center' },
  addedBannerText:   { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.primary, flex: 1 },
  bgUpsellPill:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.secondary, shadowColor: Colors.secondary, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bgUpsellText:      { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.primary, flex: 1 },
  bgLimitPill:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.textSecondary, shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bgLimitPillUpgrade: { borderLeftColor: Colors.secondary },
  bgLimitText:       { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary, flex: 1 },
  bgLimitCta:        { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bgLimitCtaText:    { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.secondary },
  bgRemainingPill:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, borderLeftColor: Colors.sage, shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bgRemainingText:   { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.textSecondary, flex: 1 },
  bgRemainingCta:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: Colors.secondary + '18', borderWidth: 1, borderColor: Colors.secondary + '40' },
  bgRemainingCtaText:{ fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.secondary },
  optionalLabel:     { fontFamily: 'Inter_400Regular', color: Colors.textLight, fontSize: rs(13), fontWeight: '400' },
  requiredAsterisk:  { fontFamily: 'Inter_700Bold', color: Colors.error, fontSize: rs(15) },
  requiredHint:      { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.error, marginTop: -8, marginBottom: 10, lineHeight: 17 },
  priceInputRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: 'hidden' },
  priceCurrencyWrap: { paddingHorizontal: 12, paddingVertical: 13, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.background },
  priceInput:        { flex: 1, fontFamily: 'Inter_500Medium', fontSize: rs(15), color: Colors.primary, paddingHorizontal: 14, paddingVertical: 13 },
  priceHint:         { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.textLight, marginBottom: 24, lineHeight: 17 },
});
