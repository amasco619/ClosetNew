import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import type { ItemCategory, OccasionTag, SeasonTag } from '@/constants/types';
import BulkItemEditPanel from '@/components/BulkItemEditPanel';
import Colors from '@/constants/colors';
import { SUBTYPE_FORMALITY } from '@/constants/outfitScoring';
import { apiRequest } from '@/lib/query-client';
import { removeBackground } from '@/lib/photoroom';
import { resolvePhotoUri } from '@/lib/classifyPath';
import { uploadWardrobeImage } from '@/lib/storage';
import { resolveWardrobeUploadArg } from '@/lib/uploadArg';
import { supabase } from '@/lib/supabase';
import {
  runClassifyUri,
  runRedirectSingle,
  runSaveAll,
  type ClassifyResult,
  type ClassifyDeps,
} from '@/lib/bulkClassifyCore';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COPIES = [
  'REVIEWING SILHOUETTE',
  'DERIVING OCCASION TAGS',
  'CURATING COLOUR HARMONY',
  'EXTRACTING FABRIC WEAVE',
] as const;

const STAGGER_MS = 150;
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const SCREEN_PAD = 20;
const CARD_WIDTH = (SCREEN_W - SCREEN_PAD * 2 - CARD_GAP) / 2;
const PHOTO_HEIGHT = CARD_WIDTH; // square thumbnail

// ─── Types ────────────────────────────────────────────────────────────────────

// ClassifyResult is imported from lib/bulkClassifyCore.

type ItemStatus =
  | 'pending'
  | 'classifying'
  | 'settled'
  | 'saving'
  | 'saved'
  | 'error'
  | 'removed';

interface BulkItem {
  uri: string;
  displayUri?: string;
  cleanBase64?: string;
  status: ItemStatus;
  classification: ClassifyResult | null;
}

// ─── Type guards (mirrors add-item.tsx) ──────────────────────────────────────

const PATTERNS       = ['solid','stripe','floral','check','print','color-block','geometric','animal'];
const PATTERN_SCALES = ['small','medium','large'];
const FABRICS        = ['chiffon','silk','satin','linen','cotton','jersey','synthetic','knit','denim','tweed','wool','cashmere','suede','leather','velvet','corduroy'];
const FABRIC_WEIGHTS = ['light','mid','heavy'];
const FITS           = ['slim','regular','loose','oversized','tailored'];
const NECKLINES      = ['crew','v-neck','scoop','turtleneck','boat','square','halter','off-shoulder','collared'];
const SLEEVES        = ['sleeveless','short','three-quarter','long'];
const RISES          = ['low','mid','high'];
const WARMTHS        = ['cold','cool','mild','warm','hot'];

const asPattern      = (v?: string) => v && PATTERNS.includes(v)       ? v as any : undefined;
const asPatternScale = (v?: string) => v && PATTERN_SCALES.includes(v) ? v as any : undefined;
const asFabric       = (v?: string) => v && FABRICS.includes(v)        ? v as any : undefined;
const asWeight       = (v?: string) => v && FABRIC_WEIGHTS.includes(v) ? v as any : undefined;
const asFit          = (v?: string) => v && FITS.includes(v)           ? v as any : undefined;
const asNeckline     = (v?: string) => v && NECKLINES.includes(v)      ? v as any : undefined;
const asSleeve       = (v?: string) => v && SLEEVES.includes(v)        ? v as any : undefined;
const asRise         = (v?: string) => v && RISES.includes(v)          ? v as any : undefined;
const asWarmth       = (v?: string) => v && WARMTHS.includes(v)        ? v as any : undefined;

// ─── Gold pulse overlay (shown while classifying) ─────────────────────────────

function GoldOverlay({
  isActive,
  statusPhase,
}: {
  isActive: boolean;
  statusPhase: number;
}) {
  const opacity = useSharedValue(isActive ? 0.45 : 0);

  useEffect(() => {
    if (isActive) {
      opacity.value = withRepeat(withTiming(0.80, { duration: 900 }), -1, true);
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(0, { duration: 260 });
    }
  }, [isActive]);

  const washStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.goldWash, washStyle]} pointerEvents="none">
      <Text style={styles.goldSymbol}>◆</Text>
      <Text style={styles.goldStatus}>{STATUS_COPIES[statusPhase]}</Text>
    </Animated.View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function BulkCard({
  item,
  statusPhase,
  onRemove,
  onRetry,
  onPress,
}: {
  item: BulkItem;
  statusPhase: number;
  onRemove: (uri: string) => void;
  onRetry: (uri: string) => void;
  onPress?: () => void;
}) {
  const isActive   = item.status === 'pending' || item.status === 'classifying';
  const isSettled  = item.status === 'settled' || item.status === 'saving' || item.status === 'saved';
  const isSaved    = item.status === 'saved';
  const isSaving   = item.status === 'saving';
  const isError    = item.status === 'error';

  // Always use the original picker URI for the preview thumbnail.
  //
  // Background: displayUri points to NSTemporaryDirectory (iOS) / Android
  // tmp cache — both are volatile and can be evicted by the OS at any time,
  // including while the app is in the foreground under memory pressure.
  // Using item.uri (the original ImagePicker result, in the app-managed
  // Library/Caches) is both more stable and guarantees the user sees their
  // own recognisable photo rather than a transparent-background re-encode
  // that may render as white on white for light-coloured garments.
  //
  // displayUri / cleanBase64 are still used exclusively by the upload path.
  const [photoErrored, setPhotoErrored] = useState(false);
  const previewUri = item.uri;
  const fallbackUri = item.uri; // same source; kept separate for readability

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSettled && onPress && pressed && styles.cardPressed,
      ]}
      onPress={isSettled ? onPress : undefined}
    >
      {/* Photo — always visible; overlay sits on top */}
      <View style={styles.photoWrap}>
        <Image
          source={{ uri: photoErrored ? fallbackUri : previewUri }}
          style={styles.photo}
          contentFit="contain"
          transition={200}
          recyclingKey={item.uri}
          onError={() => {
            if (!photoErrored) setPhotoErrored(true);
          }}
        />

        <GoldOverlay isActive={isActive} statusPhase={statusPhase} />

        {isError && (
          <Pressable
            onPress={() => onRetry(item.uri)}
            style={[StyleSheet.absoluteFill, styles.errorOverlay]}
          >
            <Ionicons name="refresh-outline" size={20} color={Colors.white} />
            <Text style={styles.errorLabel}>Tap to retry</Text>
          </Pressable>
        )}

        {isSaved && (
          <Animated.View
            entering={FadeInDown.duration(220)}
            style={[StyleSheet.absoluteFill, styles.savedOverlay]}
            pointerEvents="none"
          >
            <Ionicons name="checkmark-circle" size={28} color={Colors.white} />
            <Text style={styles.savedOverlayLabel}>Saved</Text>
          </Animated.View>
        )}

        {isSaving && (
          <View style={[StyleSheet.absoluteFill, styles.savingOverlay]} pointerEvents="none">
            <ActivityIndicator size="small" color={Colors.white} />
          </View>
        )}

        {!isSaved && (
          <Pressable
            onPress={() => onRemove(item.uri)}
            style={styles.removeBtn}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color={Colors.white} />
          </Pressable>
        )}
      </View>

      {/* Classification info or shimmer placeholder */}
      <View style={styles.cardInfo}>
        {isSettled && item.classification ? (
          <Animated.View key="settled-info" entering={FadeInDown.duration(280)}>
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {item.classification.category}
                </Text>
              </View>
              {item.classification.colorFamily ? (
                <View style={styles.tagGold}>
                  <Text style={styles.tagGoldText} numberOfLines={1}>
                    {item.classification.colorFamily}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.subTypeText} numberOfLines={1}>
              {item.classification.subType
                ? item.classification.subType.replace(/-/g, ' ')
                : 'Item'}
            </Text>
          </Animated.View>
        ) : (
          <View key="shimmer-info">
            <View style={styles.shimmerTagRow}>
              <View style={styles.shimmerPill} />
              <View style={[styles.shimmerPill, { width: 44 }]} />
            </View>
            <View style={styles.shimmerName} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BulkReviewScreen() {
  const insets = useSafeAreaInsets();
  const { addWardrobeItem } = useApp();

  const { uris: urisParam } = useLocalSearchParams<{ uris: string }>();
  const uris = useMemo<string[]>(() => {
    try { return JSON.parse(urisParam || '[]'); }
    catch { return []; }
  }, [urisParam]);

  const [items, setItems] = useState<BulkItem[]>(() =>
    uris.map(uri => ({ uri, status: 'pending' as ItemStatus, classification: null }))
  );
  const [statusPhase, setStatusPhase] = useState(0);
  const [saving, setSaving] = useState(false);
  // URI-based identity for the open panel — stable across status transitions.
  // An integer index into a dynamically-filtered list would drift as items settle.
  const [editingUri, setEditingUri] = useState<string | null>(null);

  // Redirect if no URIs were passed — single-item redirect is handled below.
  useEffect(() => {
    if (uris.length === 0) {
      router.back();
    }
  }, []);

  // ─── Single-item redirect ──────────────────────────────────────────────────
  // When exactly one URI is passed, let classification run and redirect to
  // add-item only once the result settles (with pre-filled params) or errors
  // (without params). A 12-second timeout guards against slow networks:
  // after it fires the user is redirected immediately without pre-fill,
  // identical to the previous behaviour.
  //
  // Implemented as two co-operating effects:
  //  1. Items watcher  — redirects as soon as the item settles or errors.
  //  2. Timeout guard  — redirects without params after SINGLE_REDIRECT_TIMEOUT_MS.
  //
  // A ref gates both paths so only the first one to fire navigates.

  const singleRedirectedRef = useRef(false);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);

  // Mark unmounted so async callbacks don't touch state or navigate after the
  // component has been torn down (e.g. user presses back mid-classification).
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const SINGLE_REDIRECT_TIMEOUT_MS = 12_000;

  const redirectSingle = useCallback((item: BulkItem, settled: boolean) => {
    runRedirectSingle(item, settled, mountedRef, singleRedirectedRef, { replace: router.replace });
  }, []);

  // Effect 1: watch items; redirect as soon as the sole item settles or errors.
  useEffect(() => {
    if (uris.length !== 1) return;
    const item = items[0];
    if (!item) return;
    if (item.status === 'settled') redirectSingle(item, true);
    else if (item.status === 'error') redirectSingle(item, false);
  }, [items, uris.length, redirectSingle]);

  // Effect 2: timeout guard — redirects without params if classification is
  // still running after SINGLE_REDIRECT_TIMEOUT_MS.
  useEffect(() => {
    if (uris.length !== 1) return;
    const id = setTimeout(() => {
      const item = items[0];
      if (item) redirectSingle(item, false);
    }, SINGLE_REDIRECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  // Cycle status micro-copy every 450ms while items are still classifying
  useEffect(() => {
    const hasActive = items.some(it => it.status === 'pending' || it.status === 'classifying');
    if (!hasActive) return;
    const id = setInterval(() => setStatusPhase(p => (p + 1) % STATUS_COPIES.length), 450);
    return () => clearInterval(id);
  }, [items]);

  // Classify one URI: resize → background removal → POST /api/classify-garment → settle card.
  // Core guard logic lives in lib/bulkClassifyCore.runClassifyUri (tested directly in Node).
  const classifyUri = useCallback(async (uri: string) => {
    await runClassifyUri(uri, mountedRef, {
      resize: (u) => ImageManipulator.manipulateAsync(
        u,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      ),
      removeBg: (b64) => removeBackground(b64),
      reencodeAsJpeg: (pngB64) => ImageManipulator.manipulateAsync(
        `data:image/png;base64,${pngB64}`,
        [],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      ),
      resolvePhotoUri,
      classify: async (imageBase64) => {
        const res = await apiRequest('POST', '/api/classify-garment', { imageBase64 });
        return res.json();
      },
      setItems: setItems as unknown as ClassifyDeps['setItems'],
      onHaptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    });
  }, []);

  // Kick off staggered classify tasks on mount
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    uris.forEach((uri, i) => {
      timers.push(setTimeout(() => classifyUri(uri), i * STAGGER_MS));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleRemove = useCallback((uri: string) => {
    Haptics.selectionAsync();
    setItems(prev => prev.map(it => it.uri === uri ? { ...it, status: 'removed' } : it));
  }, []);

  const handleRetry = useCallback((uri: string) => {
    classifyUri(uri);
  }, [classifyUri]);

  // Patch a classification field on a single item (called from BulkItemEditPanel)
  const handlePatchItem = useCallback((uri: string, updates: Partial<import('@/lib/bulkClassifyCore').ClassifyResult>) => {
    setItems(prev => prev.map(it =>
      it.uri === uri && it.classification
        ? { ...it, classification: { ...it.classification, ...updates } }
        : it
    ));
  }, []);

  // Save all settled items to wardrobe sequentially.
  // savingRef is checked synchronously so a rapid second tap cannot slip
  // through the gap before the first call's setSaving(true) completes a
  // React render cycle.  The state guard is kept as a belt-and-suspenders
  // check; the ref is the primary race-condition lock.
  const handleSaveAll = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    if (saving) { savingRef.current = false; return; }
    const toSave = items
      .filter(it => it.status === 'settled' && it.classification != null)
      .map(it => ({ uri: it.uri, cleanBase64: it.cleanBase64, classification: it.classification! }));
    if (toSave.length === 0) { savingRef.current = false; return; }

    try {
    await runSaveAll(toSave, mountedRef, {
      generateId: () => Crypto.randomUUID(),
      getSession: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user?.id ?? null;
      },
      // Upload to Supabase Storage.
      // If background removal produced a clean PNG, use it directly.
      // Otherwise resize the original to ≤1600 px for a smaller JPEG.
      resize: (uri) => ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      ),
      upload: (userId, base64, itemId, mimeType) =>
        uploadWardrobeImage(userId, base64, itemId, mimeType as 'image/jpeg' | 'image/png'),
      // resolveWardrobeUploadArg selects the correct base64 + mimeType and
      // guards against accidental data: URI strings or empty values.
      resolveUploadArg: (cleanBase64, shrunkBase64) =>
        resolveWardrobeUploadArg(cleanBase64, shrunkBase64),
      addItem: ({ id: itemId, photoUri: finalUri, classification: c }) => {
        addWardrobeItem({
          id: itemId,
          photoUri:      finalUri,
          category:      c.category,
          subType:       c.subType      || 'top',
          colorFamily:   c.colorFamily  || 'black',
          description:   c.description  || undefined,
          occasionTags:  c.occasionTags,
          seasonTags:    c.seasonTags.length ? c.seasonTags : ['all-season'],
          formalityLevel: SUBTYPE_FORMALITY[c.subType] ?? 5,
          pattern:       asPattern(c.pattern),
          patternScale:  asPatternScale(c.patternScale),
          fabric:        asFabric(c.fabric),
          weight:        asWeight(c.weight),
          fit:           asFit(c.fit),
          neckline:      asNeckline(c.neckline),
          sleeveLength:  asSleeve(c.sleeveLength),
          rise:          asRise(c.rise),
          warmthBand:    asWarmth(c.warmthBand),
          dominantHsl:   c.dominantHsl,
          dominantLab:   c.dominantLab,
          accentColor:   c.accentColor,
        });
      },
      setItems: (updater) => setItems(prev => updater(prev) as BulkItem[]),
      setSaving,
      onItemHaptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      onDoneHaptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      navigate: () => router.navigate('/(tabs)/wardrobe'),
    });
    } finally {
      savingRef.current = false;
    }
  };

  // Derived values
  const visibleItems    = items.filter(it => it.status !== 'removed');
  // editableItems: items the carousel can actually display/edit (have a classification).
  // pending/classifying/error items are never navigable within the panel.
  const editableItems   = visibleItems.filter(it =>
    it.status === 'settled' || it.status === 'saving' || it.status === 'saved'
  );
  // Derive a stable integer index from the URI so the panel never drifts to
  // the wrong garment when new items settle and editableItems grows/reorders.
  const editingIndex    = editingUri !== null
    ? editableItems.findIndex(it => it.uri === editingUri)
    : -1;
  // Header display: position among ALL non-removed items (not just editable).
  const displayPosition = editingUri !== null
    ? visibleItems.findIndex(it => it.uri === editingUri) + 1
    : 1;
  const displayTotal    = visibleItems.length;
  const settledCount    = items.filter(it => it.status === 'settled').length;
  const classifiedCount = items.filter(it =>
    ['settled','saving','saved','error'].includes(it.status)
  ).length;
  const totalCount      = visibleItems.length;
  const progressRatio   = totalCount > 0 ? classifiedCount / totalCount : 0;
  const canSaveAll      = settledCount > 0 && !saving;

  const saveBtnLabel = saving
    ? 'Saving...'
    : settledCount > 0
      ? `Save ${settledCount} Item${settledCount !== 1 ? 's' : ''} to Wardrobe`
      : 'Analysing items...';

  return (
    <View style={[
      styles.container,
      { paddingTop: Platform.OS === 'android' ? insets.top : insets.top },
    ]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Batch Review</Text>
          <Text style={styles.headerSub}>{classifiedCount} of {totalCount} analysed</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress track */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressRatio * 100}%` as any }]} />
      </View>

      {/* Item grid */}
      <FlatList
        data={visibleItems}
        keyExtractor={item => item.uri}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <BulkCard
            item={item}
            statusPhase={statusPhase}
            onRemove={handleRemove}
            onRetry={handleRetry}
            onPress={() => {
              // Only settled/saving/saved items are editable; guard by status.
              const isEditable = item.status === 'settled'
                || item.status === 'saving'
                || item.status === 'saved';
              if (!isEditable) return;
              Haptics.selectionAsync();
              setEditingUri(item.uri);
            }}
          />
        )}
      />

      {/* Footer — Save All */}
      <View style={[
        styles.footer,
        { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) },
      ]}>
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            !canSaveAll && styles.saveBtnDisabled,
            pressed && canSaveAll && { opacity: 0.82, transform: [{ scale: 0.97 }] },
          ]}
          onPress={handleSaveAll}
          disabled={!canSaveAll}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="checkmark" size={20} color={canSaveAll ? Colors.white : Colors.textLight} />
          }
          <Text style={[styles.saveBtnText, !canSaveAll && styles.saveBtnTextDisabled]}>
            {saveBtnLabel}
          </Text>
        </Pressable>
      </View>

      {/* Carousel edit panel — absolute-fill overlay, zIndex 10.
          editingUri is URI-based so the panel never drifts to the wrong garment
          when items settle and editableItems grows/reorders mid-session.
          editingIndex is derived each render: if the URI disappears (removed)
          it becomes -1 and the guard below closes the panel automatically. */}
      {editingUri !== null && editingIndex >= 0 && editableItems.length > 0 && (
        <BulkItemEditPanel
          items={editableItems}
          editingIndex={editingIndex}
          setEditingIndex={(idx) => setEditingUri(editableItems[idx]?.uri ?? null)}
          displayPosition={displayPosition}
          displayTotal={displayTotal}
          patchItem={handlePatchItem}
          onClose={() => setEditingUri(null)}
          onSaveAll={handleSaveAll}
          canSaveAll={canSaveAll}
          saving={saving}
          settledCount={settledCount}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter:{ flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary, letterSpacing: -0.2 },
  headerSub:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight, marginTop: 1 },

  progressTrack: {
    height: 2, backgroundColor: Colors.border,
    marginHorizontal: 20, borderRadius: 1, marginBottom: 16, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 1 },

  columnWrapper: { gap: CARD_GAP, paddingHorizontal: SCREEN_PAD, marginBottom: CARD_GAP },
  listContent:   { paddingTop: 4, paddingBottom: 8 },

  card: {
    width: CARD_WIDTH, backgroundColor: Colors.white,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },

  photoWrap:  { width: CARD_WIDTH, height: PHOTO_HEIGHT, position: 'relative' },
  photo:      { width: '100%', height: '100%' },

  goldWash: {
    backgroundColor: Colors.secondary,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  goldSymbol: {
    fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.primary, letterSpacing: 1,
  },
  goldStatus: {
    fontFamily: 'Inter_500Medium', fontSize: 9, color: Colors.primary,
    letterSpacing: 1.0, textAlign: 'center', paddingHorizontal: 8,
  },

  errorOverlay: {
    backgroundColor: 'rgba(212, 96, 90, 0.80)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  errorLabel: {
    fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.white, letterSpacing: 0.3,
  },

  savedOverlay: {
    backgroundColor: 'rgba(106, 175, 123, 0.88)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  savedOverlayLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.white },

  savingOverlay: {
    backgroundColor: 'rgba(16, 24, 38, 0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  removeBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 38, 0.45)', borderRadius: 14,
  },

  cardInfo: { paddingHorizontal: 10, paddingVertical: 10, minHeight: 56 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 5 },
  tag: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  tagText: {
    fontFamily: 'Inter_500Medium', fontSize: 10,
    color: Colors.textSecondary, textTransform: 'capitalize',
  },
  tagGold: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: Colors.secondary + '15',
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  tagGoldText: {
    fontFamily: 'Inter_500Medium', fontSize: 10,
    color: Colors.secondary, textTransform: 'capitalize',
  },
  subTypeText: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12,
    color: Colors.primary, textTransform: 'capitalize', letterSpacing: -0.1,
  },

  shimmerTagRow: { flexDirection: 'row', gap: 4, marginBottom: 5 },
  shimmerPill: {
    height: 18, width: 36, borderRadius: 6, backgroundColor: Colors.border,
  },
  shimmerName: {
    height: 14, width: '70%', borderRadius: 4, backgroundColor: Colors.border,
  },

  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16,
    shadowColor: Colors.primary, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  saveBtnDisabled: { backgroundColor: Colors.border },
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
  saveBtnTextDisabled: { color: Colors.textLight },
});
