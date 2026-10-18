import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  Dimensions, ActivityIndicator, Platform, BackHandler, AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { useApp } from '@/contexts/AppContext';
import { GarmentTile } from '@/components/GarmentTile';
import { useDialog, useToast } from '@/contexts/LuxuryFeedbackContext';
import { PhotoRefusalNotice } from '@/components/PhotoRefusalNotice';
import { ALL_PATTERNS as PATTERNS, ALL_PATTERN_SCALES as PATTERN_SCALES, ALL_FABRICS as FABRICS, ALL_FABRIC_WEIGHTS as FABRIC_WEIGHTS, ALL_FITS as FITS, ALL_NECKLINES as NECKLINES, ALL_SLEEVES as SLEEVES, ALL_RISES as RISES, ALL_WARMTHS as WARMTHS } from '@/constants/types';
import BulkItemEditPanel from '@/components/BulkItemEditPanel';
import Colors from '@/constants/colors';
import { authenticatedApiRequest } from '@/lib/query-client';
import { removeBackground } from '@/lib/photoroom';
import { classificationImagePayload } from '@/lib/classifyPath';
import { UPLOAD_DIAGNOSTICS_ENABLED, reportUploadError } from '@/lib/uploadErrors';
import { readCachedCutout } from '@/lib/uploadPhotoSource';
import { classificationWaitMs, runSerialUploadRetries } from '@/lib/uploadRetry';
import { prepareClassificationImage } from '@/lib/prepareClassificationImage';
import { buildGuestPhotoDestPath } from '@/constants/guestPhotoCleanup';
import { deleteWardrobeImage, uploadWardrobeImage } from '@/lib/storage';
import { resolveWardrobeUploadArg } from '@/lib/uploadArg';
import { supabase } from '@/lib/supabase';
import {
  runClassifyUri,
  runRedirectSingle,
  selectBulkProgress,
  runSaveAll,
  undoSavedItems,
  runHandleRemove,
  createSerialQueue,
  type ClassifyResult,
  type ClassifyFailureStage,
  type PhotoPrepareDiagnostic,
} from '@/lib/bulkClassifyCore';
import {
  bulkStagingDirectoryUri,
  cleanupBulkPhotoSelection,
  getBulkPhotoSelection,
  removeBulkPhotoFromSelection,
} from '@/lib/bulkPhotoStaging';
import { rs } from '../lib/responsive';
import {
  getInitialBulkCardStatus,
  runBulkAiProcessing,
} from '@/lib/guestBulkUpload';
import { AiProcessingConsent } from '@/components/AiProcessingConsent';
import {
  getAiProcessingPreference,
  setAiProcessingPreference,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreference';

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
  | 'manual'
  | 'settled'
  | 'saving'
  | 'saved'
  | 'local-only'
  | 'error'
  | 'refused'
  | 'removed';

interface BulkItem {
  uri: string;
  cutoutUri?: string;
  status: ItemStatus;
  classification: ClassifyResult | null;
  failureStage?: ClassifyFailureStage;
  diagnostic?: PhotoPrepareDiagnostic;
  retryable?: boolean;
  failureKind?: 'transient' | 'unexpected';
  backgroundRemovalSucceeded?: boolean;
}

// ─── Type guards (mirrors add-item.tsx) ──────────────────────────────────────


const asPattern      = (v?: string) => v && (PATTERNS      as readonly string[]).includes(v) ? v as any : undefined;
const asPatternScale = (v?: string) => v && (PATTERN_SCALES as readonly string[]).includes(v) ? v as any : undefined;
const asFabric       = (v?: string) => v && (FABRICS        as readonly string[]).includes(v) ? v as any : undefined;
const asWeight       = (v?: string) => v && (FABRIC_WEIGHTS as readonly string[]).includes(v) ? v as any : undefined;
const asFit          = (v?: string) => v && (FITS           as readonly string[]).includes(v) ? v as any : undefined;
const asNeckline     = (v?: string) => v && (NECKLINES      as readonly string[]).includes(v) ? v as any : undefined;
const asSleeve       = (v?: string) => v && (SLEEVES        as readonly string[]).includes(v) ? v as any : undefined;
const asRise         = (v?: string) => v && (RISES          as readonly string[]).includes(v) ? v as any : undefined;
const asWarmth       = (v?: string) => v && (WARMTHS        as readonly string[]).includes(v) ? v as any : undefined;

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
  }, [isActive, opacity]);

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
  manualReady,
  onRemove,
  onRetry,
  onManual,
  onPress,
}: {
  item: BulkItem;
  statusPhase: number;
  manualReady: boolean;
  onRemove: (uri: string) => void;
  onRetry: (uri: string) => void;
  onManual: (uri: string) => void;
  onPress?: () => void;
}) {
  const isActive     = item.status === 'pending' || item.status === 'classifying';
  const isManual     = item.status === 'manual';
  const isLocalOnly  = item.status === 'local-only';
  const isSettled    = item.status === 'settled' || item.status === 'saving' || item.status === 'saved' || isLocalOnly;
  const isSaved      = item.status === 'saved';
  const isSaving     = item.status === 'saving';
  const isError      = item.status === 'error';
  const isRefused    = item.status === 'refused';

  // Keep the clean PNG as a cache file and fall back to the source photo if the
  // cache entry is evicted. No image base64 is retained in item state.
  const [photoErrorUri, setPhotoErrorUri] = useState<string | null>(null);
  const sourceUri = item.cutoutUri ?? item.uri;
  const photoErrored = photoErrorUri === sourceUri;
  const previewUri = photoErrored ? item.uri : sourceUri;

  const cardBody = (
    <>
      {/* Photo — always visible; overlay sits on top */}
      <View style={styles.photoWrap}>
        <GarmentTile
          uri={previewUri}
          isCutout={!photoErrored && Boolean(item.cutoutUri)}
          variant="card"
          style={styles.photo}
          accessibilityLabel={`${item.classification?.colorFamily ?? ''} ${item.classification?.subType ?? 'garment'} photo`}
          recyclingKey={item.uri}
          onError={() => {
            if (!photoErrored) setPhotoErrorUri(previewUri);
          }}
        />

        <GoldOverlay isActive={isActive} statusPhase={statusPhase} />

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

        {isLocalOnly && (
          <Animated.View
            entering={FadeInDown.duration(220)}
            style={[StyleSheet.absoluteFill, styles.localOnlyOverlay]}
            pointerEvents="none"
          >
            <Ionicons name="cloud-upload-outline" size={22} color={Colors.white} />
            <Text style={styles.savedOverlayLabel}>Upload pending</Text>
          </Animated.View>
        )}

        {isSaving && (
          <View style={[StyleSheet.absoluteFill, styles.savingOverlay]} pointerEvents="none">
            <ActivityIndicator size="small" color={Colors.white} />
          </View>
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
        ) : isManual ? (
          <Text style={styles.errorLabel}>Add details</Text>
        ) : isRefused || isError ? null : manualReady && isActive ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onManual(item.uri)}
            style={styles.manualEntryButton}
          >
            <Text style={styles.errorLabel}>Add manually</Text>
          </Pressable>
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
    </>
  );

  return (
    <View style={styles.card}>
      {(isSettled && onPress) || isManual ? (
        <Pressable
          style={({ pressed }) => [styles.cardBody, pressed && styles.cardPressed]}
          onPress={isManual ? () => onManual(item.uri) : onPress}
          accessibilityRole="button"
          accessibilityLabel={isManual ? 'Add details for this photo' : 'Edit garment details'}
        >
          {cardBody}
        </Pressable>
      ) : (
        <View style={styles.cardBody}>{cardBody}</View>
      )}

      {isError && item.retryable !== false && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry garment analysis"
          onPress={() => onRetry(item.uri)}
          style={[styles.errorOverlay, styles.retryOverlay, item.failureKind !== 'transient' && styles.unexpectedFailure]}
        >
          <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.errorLabel}>
            {item.failureKind === 'transient' ? 'Connection paused' : 'Something went wrong'}
          </Text>
          <Text style={styles.errorLabel}>Tap to try again</Text>
          {__DEV__ && UPLOAD_DIAGNOSTICS_ENABLED && item.diagnostic && (
            <Text style={styles.prepareDiagnostic} numberOfLines={9}>
              {`${item.diagnostic.stage}: ${item.diagnostic.errorName}: ${item.diagnostic.message}\n` +
                `uri=${item.diagnostic.uriScheme}; ext=${item.diagnostic.fileExtension}; ` +
                `size=${item.diagnostic.width ?? 'unknown'}x${item.diagnostic.height ?? 'unknown'}; ` +
                `queue=${item.diagnostic.usedSerialResizeQueue}; elapsed=${item.diagnostic.elapsedMs}ms`}
            </Text>
          )}
        </Pressable>
      )}

      {isError && (
        <Pressable accessibilityRole="button" onPress={() => onManual(item.uri)} style={{ padding: 12, minHeight: 44 }}>
          <Text style={styles.errorLabel}>Add manually</Text>
        </Pressable>
      )}

      {(isRefused || (isError && item.retryable === false)) && (
        <PhotoRefusalNotice
          title={isRefused ? undefined : 'Could not analyse this photo'}
          onManual={() => onManual(item.uri)}
          onRemove={() => onRemove(item.uri)}
        />
      )}

      {!isSaved && !isRefused && (
        <Pressable
          onPress={() => onRemove(item.uri)}
          style={styles.removeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove photo from batch"
        >
          <Ionicons name="close-circle" size={22} color={Colors.white} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BulkReviewScreen() {
  const insets = useSafeAreaInsets();
  const { addWardrobeItems, removeWardrobeItem, isPremium, wardrobeItems, authenticatedUserId, isGuest } = useApp();
  const dialog = useDialog();
  const toast = useToast();

  const {
    selectionId,
    manualSavedPhotoIndex,
    undoManualSavedPhotoIndex,
    guestCapAcceptedCount: guestCapAcceptedCountParam,
    guestCapOmittedCount: guestCapOmittedCountParam,
  } = useLocalSearchParams<{
    selectionId: string;
    manualSavedPhotoIndex?: string;
    undoManualSavedPhotoIndex?: string;
    guestCapAcceptedCount?: string;
    guestCapOmittedCount?: string;
  }>();
  const [selectionStartedAsGuest] = useState(isGuest);
  const [selectionSnapshot] = useState(() => ({
    selectionId,
    selection: getBulkPhotoSelection(selectionId),
  }));
  const selection = selectionSnapshot.selectionId === selectionId ? selectionSnapshot.selection : undefined;
  const selectionMissing = !selectionId || !selection;
  const uris = useMemo<string[]>(() => {
    return selection?.photos.map(photo => photo.uri) ?? [];
  }, [selection]);

  const [items, setItems] = useState<BulkItem[]>(() =>
    uris.map(uri => ({ uri, status: getInitialBulkCardStatus(selectionStartedAsGuest), classification: null }))
  );
  const guestCapOmittedCount = /^\d+$/.test(guestCapOmittedCountParam ?? '')
    ? Number(guestCapOmittedCountParam)
    : 0;
  const guestCapAcceptedCount = /^\d+$/.test(guestCapAcceptedCountParam ?? '')
    ? Number(guestCapAcceptedCountParam)
    : uris.length;
  const manualRedirectedRef = useRef(false);
  useFocusEffect(useCallback(() => { manualRedirectedRef.current = false; }, []));
  useEffect(() => {
    if (manualSavedPhotoIndex === undefined || !/^\d+$/.test(manualSavedPhotoIndex)) return;
    const photo = getBulkPhotoSelection(selectionId)?.photos[Number(manualSavedPhotoIndex)];
    if (photo) {
      // Acknowledged manual saves leave the batch without deleting the saved wardrobe row.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile an explicit navigation result, not derived render state.
      setItems(prev => prev.map(item => item.uri === photo.uri ? { ...item, status: 'removed' } : item));
    }
    router.setParams({ manualSavedPhotoIndex: undefined });
  }, [manualSavedPhotoIndex, selectionId]);
  useEffect(() => {
    if (undoManualSavedPhotoIndex === undefined || !/^\d+$/.test(undoManualSavedPhotoIndex)) return;
    const photo = getBulkPhotoSelection(selectionId)?.photos[Number(undoManualSavedPhotoIndex)];
    if (photo) {
      // Restore the transient review row after Undo removes its wardrobe commit.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reconcile an explicit Undo result from the save toast.
      setItems(prev => prev.map(item => item.uri === photo.uri && item.status === 'removed'
        ? { ...item, status: selectionStartedAsGuest ? 'manual' : item.classification ? 'settled' : 'error' }
        : item));
    }
    router.setParams({ undoManualSavedPhotoIndex: undefined });
  }, [undoManualSavedPhotoIndex, selectionId, selectionStartedAsGuest]);
  const [statusPhase, setStatusPhase] = useState(0);
  const [saving, setSaving] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const retryingAllRef = useRef(false);
  const classificationStartsRef = useRef<number[]>([]);
  // URI-based identity for the open panel — stable across status transitions.
  // An integer index into a dynamically-filtered list would drift as items settle.
  const [editingUri, setEditingUri] = useState<string | null>(null);
  // Guest upsell banner: shown once background removal is skipped for auth reasons.
  const [bgNotAuthenticated, setBgNotAuthenticated] = useState(false);
  const [bgUpsellDismissed, setBgUpsellDismissed] = useState(false);
  // Limit-reached pill: shown once quota is exhausted (affects signed-in users too).
  const [bgLimitReached, setBgLimitReached] = useState(false);
  const [bgLimitDismissed, setBgLimitDismissed] = useState(false);
  // Remaining-count pill: shown after the first successful BG removal so users
  // know how many free uses they have left before hitting the limit.
  const [bgRemaining, setBgRemaining] = useState<number | undefined>(undefined);
  const [aiPreference, setAiPreference] = useState<AiProcessingPreference | 'checking' | 'unavailable'>('checking');
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [savingAiPreference, setSavingAiPreference] = useState(false);
  const [aiPreferenceError, setAiPreferenceError] = useState<string | null>(null);

  const routeFirstPhotoManually = () => {
    const item = itemsRef.current.find(current => current.status !== 'removed');
    if (item) handleManual(item.uri);
  };

  const allowBulkAiProcessing = async () => {
    if (savingAiPreference) return;
    setSavingAiPreference(true);
    setAiPreferenceError(null);
    try {
      await setAiProcessingPreference('allowed');
      setAiPreference('allowed');
      setShowAiConsent(false);
    } catch {
      setAiPreferenceError('AI processing could not be enabled. These photos have not been sent.');
    } finally {
      setSavingAiPreference(false);
    }
  };

  const declineBulkAiProcessing = () => {
    setAiPreference('declined');
    setShowAiConsent(false);
    setAiPreferenceError(null);
    setSavingAiPreference(true);
    void setAiProcessingPreference('declined')
      .catch(() => {
        setAiPreferenceError('Your choice could not be saved. AI processing remains unavailable until it can be checked.');
      })
      .finally(() => setSavingAiPreference(false));
    routeFirstPhotoManually();
  };

  const dismissBulkAiConsent = () => {
    setShowAiConsent(false);
    setAiPreferenceError(null);
    routeFirstPhotoManually();
  };

  const enableAiForSelectedPhotos = async () => {
    if (savingAiPreference || aiPreference === 'checking') return;
    setAiPreferenceError(null);
    try {
      const preference = await getAiProcessingPreference();
      if (preference === 'allowed') {
        setAiPreference('allowed');
      } else {
        setAiPreference(preference);
        setShowAiConsent(true);
      }
    } catch {
      setAiPreference('unavailable');
      setAiPreferenceError('Your AI preference could not be checked. These photos have not been sent.');
    }
  };

  useEffect(() => {
    if (selectionMissing || isGuest || selectionStartedAsGuest) return;
    let active = true;
    getAiProcessingPreference().then(preference => {
      if (!active) return;
      setAiPreference(preference);
      if (preference === 'not_asked') setShowAiConsent(true);
    }).catch(() => {
      if (!active) return;
      setAiPreference('unavailable');
      setAiPreferenceError('Your AI preference could not be checked. These photos have not been sent.');
    });
    return () => { active = false; };
  }, [selectionMissing, isGuest, selectionStartedAsGuest]);

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
  // Android bulk picks can contain several full-resolution files. Keep native
  // bitmap decoding one-at-a-time; classification/network work remains parallel.
  const imageResizeQueue = useRef(createSerialQueue()).current;
  const savingRef = useRef(false);
  // Stable items snapshot for callbacks that can't take items as a dep.
  const itemsRef = useRef<BulkItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Mark unmounted so async callbacks don't touch state or navigate after the
  // component has been torn down (e.g. user presses back mid-classification).
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const leaveReview = useCallback(async () => {
    const directoryUri = bulkStagingDirectoryUri(FileSystem.cacheDirectory);
    if (selectionId && directoryUri) {
      const protectedUris = new Set(wardrobeItems.map(item => item.photoUri));
      itemsRef.current.forEach(item => {
        if (item.status === 'local-only' || (item.status as string) === 'pending-upload') {
          protectedUris.add(item.uri);
        }
      });
      const summary = await cleanupBulkPhotoSelection(selectionId, directoryUri, {
        delete: uri => FileSystem.deleteAsync(uri, { idempotent: true }),
        protectedUris,
      });
      if (__DEV__) {
        const remaining = await FileSystem.readDirectoryAsync(directoryUri).catch(() => null);
        if (UPLOAD_DIAGNOSTICS_ENABLED) console.log('[bulk:staging] cancel-cleanup', {
          deletedCount: summary.deletedCount,
          retainedCount: summary.retainedCount,
          remainingFileCount: remaining?.length ?? null,
        });
      }
    }
    router.back();
  }, [selectionId, wardrobeItems]);

  // Cancel with confirmation when classification is still in progress.
  // If all items have already settled (or errored), exit immediately — there
  // is nothing destructive about leaving at that point.
  const handleCancel = useCallback(async () => {
    if (aiPreference !== 'allowed') {
      void leaveReview();
      return;
    }
    const hasInProgress = items.some(
      it => it.status === 'pending' || it.status === 'classifying'
    );
    if (!hasInProgress) {
      void leaveReview();
      return;
    }
    const confirmed = await dialog.confirm({
      title: 'Leave this batch review?',
      message: 'AI analysis is still running. Leaving now will discard pending results, and you will need to re-upload those photos.',
      confirmLabel: 'Leave review',
      cancelLabel: 'Keep waiting',
      tone: 'destructive',
    });
    if (confirmed) void leaveReview();
  }, [items, aiPreference, leaveReview, dialog]);

  // Block the Android hardware back button while saving is in progress so the
  // user cannot navigate away mid-save and leave orphaned wardrobe entries.
  // While classification is still running, show the same confirmation dialog
  // that the Cancel button triggers so no path silently discards pending results.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) return true; // fully blocked while save is running
      // Route every hardware-back exit through staged-file cleanup.
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [saving, handleCancel]);

  // When the app returns to the foreground mid-save, re-sync the React saving
  // state from the ref.  AppState changes trigger a re-render; without this,
  // a stale false from a prior render cycle could briefly unlock the button.
  // savingRef.current is always up-to-date (it is set synchronously at the top
  // of handleSaveAll and cleared in its finally block), so it is the source of
  // truth here.
  //
  // The handler is wrapped in a 16 ms debounce (one animation frame) so that
  // rapid background → inactive → active transitions on Android OEMs with
  // sluggish reconciliation coalesce into a single setSaving(true) call and
  // the button never flickers unlocked between transitions.
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (nextState === 'active' && savingRef.current) {
          setSaving(true);
        }
      }, 16);
    });

    return () => {
      sub.remove();
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

  const SINGLE_REDIRECT_TIMEOUT_MS = 12_000;

  const redirectSingle = useCallback((item: BulkItem, settled: boolean) => {
    runRedirectSingle(item, settled, mountedRef, singleRedirectedRef, {
      replace: router.replace,
      bulkSelectionId: selectionId,
    });
  }, [selectionId]);

  // Effect 1: watch items; redirect as soon as the sole item settles or errors.
  useEffect(() => {
    if (uris.length !== 1 || aiPreference !== 'allowed') return;
    const item = items[0];
    if (!item) return;
    if (item.status === 'settled') redirectSingle(item, true);
  }, [items, uris.length, redirectSingle, aiPreference]);

  // Effect 2: timeout guard — redirects without params if classification is
  // still running after SINGLE_REDIRECT_TIMEOUT_MS.
  useEffect(() => {
    if (uris.length !== 1 || aiPreference !== 'allowed') return;
    const id = setTimeout(() => {
      const item = itemsRef.current[0];
      if (item && (item.status === 'pending' || item.status === 'classifying')) redirectSingle(item, false);
    }, SINGLE_REDIRECT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [uris.length, aiPreference, redirectSingle]);

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
    await runBulkAiProcessing(isGuest || selectionStartedAsGuest, aiPreference, async () => {
      const stagedPhoto = selection?.photos.find(photo => photo.uri === uri);
      const previous = itemsRef.current.find(item => item.uri === uri);
      await runClassifyUri(uri, mountedRef, {
        previousCutout: {
          uri: previous?.cutoutUri,
          succeeded: Boolean(previous?.backgroundRemovalSucceeded || previous?.cutoutUri),
        },
        readPngBase64: uri => readCachedCutout(uri,
          current => FileSystem.readAsStringAsync(current, { encoding: FileSystem.EncodingType.Base64 }))
          .then(value => value ?? ''),
        resize: (u) => imageResizeQueue(() => {
          if (!mountedRef.current) return Promise.resolve(null);
          return prepareClassificationImage(u);
        }),
        diagnostics: {
          enabled: UPLOAD_DIAGNOSTICS_ENABLED,
          usedSerialResizeQueue: true,
          stagedPhoto,
          inspectUri: async currentUri => {
            const info = await FileSystem.getInfoAsync(currentUri);
            return info.exists ? { exists: true, size: info.size } : { exists: false };
          },
        },
        onDiagnostic: diagnostic => {
          if (__DEV__ && UPLOAD_DIAGNOSTICS_ENABLED) console.log('[bulk:prepare]', diagnostic);
        },
        removeBg: (b64) => removeBackground(b64).then(r => {
          if (r.status === 'not-authenticated') setBgNotAuthenticated(true);
          if (r.status === 'limit-reached') setBgLimitReached(true);
          if (r.status === 'success' && r.remaining !== undefined) setBgRemaining(r.remaining);
          if (r.status === 'failed' || r.status === 'unavailable') reportUploadError({ stage: 'background-removal', code: 'FAILED' });
          return r.status === 'success' ? (r.base64 ?? null) : null;
        }),
        writePngToCache: async (pngBase64) => {
          if (!FileSystem.cacheDirectory) throw new Error('cache_directory_unavailable');
          const uri = `${FileSystem.cacheDirectory}amodka-bulk-cutout-${Crypto.randomUUID()}.png`;
          await FileSystem.writeAsStringAsync(uri, pngBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return uri;
        },
        classify: async (imageBase64, imageMimeType) => {
          if (retryingAllRef.current) {
            let delay = classificationWaitMs(classificationStartsRef.current, Date.now());
            while (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
              if (!mountedRef.current) throw new Error('cancelled');
              delay = classificationWaitMs(classificationStartsRef.current, Date.now());
            }
          }
          if (!mountedRef.current || itemsRef.current.find(item => item.uri === uri)?.status === 'removed') {
            throw new Error('cancelled');
          }
          const now = Date.now();
          classificationStartsRef.current = [...classificationStartsRef.current.filter(time => time > now - 60_000), now];
          const image = classificationImagePayload(imageBase64);
          if (image.imageMimeType !== imageMimeType) throw new Error('image_mime_mismatch');
          const res = await authenticatedApiRequest('POST', '/api/classify-garment', image);
          return res.json();
        },
        setItems: updater => setItems(prev => updater(prev).map(item => {
          const previous = prev.find(current => current.uri === item.uri);
          return previous?.status === 'removed' ? previous : item;
        }) as BulkItem[]),
        onHaptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      });
    });
  }, [aiPreference, imageResizeQueue, isGuest, selection, selectionStartedAsGuest]);

  // Kick off staggered classify tasks on mount
  useEffect(() => {
    if (isGuest || selectionStartedAsGuest || aiPreference !== 'allowed') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    uris.forEach((uri, i) => {
      timers.push(setTimeout(() => classifyUri(uri), i * STAGGER_MS));
    });
    return () => timers.forEach(clearTimeout);
  }, [aiPreference, classifyUri, isGuest, selectionStartedAsGuest, uris]);

  const handleRemove = useCallback((uri: string) => {
    Haptics.selectionAsync();
    const item = itemsRef.current.find(it => it.uri === uri);
    runHandleRemove(uri, item, {
      removeItem: removeWardrobeItem,
      setItems: (updater) => setItems(prev => updater(prev) as BulkItem[]),
    });
    const directoryUri = bulkStagingDirectoryUri(FileSystem.cacheDirectory);
    if (selectionId && directoryUri) {
      const protectedUris = new Set(wardrobeItems.map(wardrobeItem => wardrobeItem.photoUri));
      itemsRef.current.forEach(current => {
        if (current.uri !== uri && (current.status === 'local-only' || (current.status as string) === 'pending-upload')) {
          protectedUris.add(current.uri);
        }
      });
      void removeBulkPhotoFromSelection(selectionId, uri, directoryUri, {
        delete: stagedUri => FileSystem.deleteAsync(stagedUri, { idempotent: true }),
        protectedUris,
      });
    }
  }, [removeWardrobeItem, selectionId, wardrobeItems]);

  const handleRetry = (uri: string) => {
    if (savingRef.current || retryingAllRef.current) return;
    const item = itemsRef.current.find(current => current.uri === uri);
    if (item?.status === 'refused' || item?.retryable === false) return;
    if (aiPreference !== 'allowed') {
      void enableAiForSelectedPhotos();
      return;
    }
    void classifyUri(uri);
  };

  const handleRetryAll = async () => {
    if (savingRef.current || retryingAllRef.current || aiPreference !== 'allowed') return;
    retryingAllRef.current = true;
    setRetryingAll(true);
    try {
      const uris = itemsRef.current.filter(item => item.status === 'error' && item.failureKind === 'transient').map(item => item.uri);
      await runSerialUploadRetries(uris, {
        active: uri => mountedRef.current && itemsRef.current.some(item => item.uri === uri && item.status === 'error' && item.failureKind === 'transient'),
        run: classifyUri,
      });
    } finally {
      retryingAllRef.current = false;
      if (mountedRef.current) setRetryingAll(false);
    }
  };

  const handleManual = (uri: string) => {
    if (savingRef.current) return;
    const photoIndex = getBulkPhotoSelection(selectionId)?.photos.findIndex(photo => photo.uri === uri) ?? -1;
    const item = itemsRef.current.find(current => current.uri === uri);
    if (!item || photoIndex < 0) return;
    runRedirectSingle(item, false, mountedRef, manualRedirectedRef, {
      bulkSelectionId: selectionId,
      manualPhotoIndex: photoIndex,
      manualOnly: selectionStartedAsGuest,
      replace: router.push,
    });
  };

  // Patch a classification field on a single item (called from BulkItemEditPanel)
  const handlePatchItem = useCallback((uri: string, updates: Partial<import('@/lib/bulkClassifyCore').ClassifyResult>) => {
    setItems(prev => prev.map(it =>
      it.uri === uri && it.classification
        ? { ...it, classification: { ...it.classification, ...updates } }
        : it
    ));
  }, []);

  // Save all settled items in one atomic wardrobe batch.
  // savingRef is checked synchronously so a rapid second tap cannot slip
  // through the gap before the first call's setSaving(true) completes a
  // React render cycle.  The state guard is kept as a belt-and-suspenders
  // check; the ref is the primary race-condition lock.
  const saveAllConfirmed = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    if (saving) { savingRef.current = false; return; }

    const toSave = items
      .filter(it =>
        (it.status === 'settled' || it.status === 'local-only') &&
        it.classification != null
      )
      .map(it => ({ uri: it.uri, cutoutUri: it.cutoutUri, classification: it.classification! }));

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
          readPngBase64: (uri) => FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
          saveGuestImage: async (base64, itemId, mimeType) => {
            if (!FileSystem.documentDirectory) throw new Error('document_directory_unavailable');
            const ext = mimeType === 'image/png' ? 'png' : 'jpg';
            const dest = buildGuestPhotoDestPath(FileSystem.documentDirectory, itemId, ext);
            await FileSystem.writeAsStringAsync(dest, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return dest;
          },
          upload: async (userId, base64, itemId, mimeType) => {
            const { signedUrl } = await uploadWardrobeImage(userId, base64, itemId, mimeType as 'image/jpeg' | 'image/png');
            return signedUrl;
          },
          deleteUploaded: deleteWardrobeImage,
          resolveUploadArg: (cleanBase64, shrunkBase64) =>
            resolveWardrobeUploadArg(cleanBase64, shrunkBase64),
          addItems: (payloads) => addWardrobeItems(payloads.map(({ id: itemId, photoUri: finalUri, classification: c, storagePath }) => ({
              id: itemId,
              photoUri:        finalUri,
              storagePath,
              category:        c.category,
              subType:         c.subType      || 'top',
              colorFamily:     c.colorFamily  || 'black',
              description:     c.description  || undefined,
              occasionTags:    c.occasionTags,
              seasonTags:      [...c.seasonTags],
              // Subtype formality remains an engine fallback, not a stored fact.
              confirmedFields: [],
              pattern:         asPattern(c.pattern),
              patternScale:    asPatternScale(c.patternScale),
              fabric:          asFabric(c.fabric),
              weight:          asWeight(c.weight),
              fit:             asFit(c.fit),
              neckline:        asNeckline(c.neckline),
              sleeveLength:    asSleeve(c.sleeveLength),
              rise:            asRise(c.rise),
              warmthBand:      asWarmth(c.warmthBand),
              dominantHsl:     c.dominantHsl,
              dominantLab:     c.dominantLab,
              accentColor:     c.accentColor,
              modelConfidence: c.modelConfidence,
            }))),
          setItems: (updater) => setItems(prev => updater(prev) as BulkItem[]),
          setSaving,
          onItemHaptic: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          onLocalOnlyComplete: (uris) => {
            if (!mountedRef.current) return;
            dialog.notify({
              title: 'Upload still pending',
              message: `${uris.length === 1 ? 'This item remains' : 'These items remain'} in review because cloud upload did not complete. Nothing from this batch was saved; check your connection and retry.`,
              buttonLabel: 'Keep reviewing',
            });
          },
          onSaved: async () => {
            const directoryUri = bulkStagingDirectoryUri(FileSystem.cacheDirectory);
            if (!selectionId || !directoryUri) return;
            const protectedUris = new Set(wardrobeItems.map(item => item.photoUri));
            itemsRef.current.forEach(item => {
              if (item.status === 'local-only' || (item.status as string) === 'pending-upload') {
                protectedUris.add(item.uri);
              }
            });
            await cleanupBulkPhotoSelection(selectionId, directoryUri, {
              delete: uri => FileSystem.deleteAsync(uri, { idempotent: true }),
              protectedUris,
            });
          },
          onAdded: savedItems => {
            const expectedUserId = authenticatedUserId ?? (isGuest ? null : undefined);
            toast.show({
              message: `${savedItems.length} ${savedItems.length === 1 ? 'piece' : 'pieces'} added to your wardrobe`,
              thumbnailUri: savedItems[0]?.photoUri,
              actionLabel: 'Undo',
              onAction: () => expectedUserId === undefined
                ? Promise.resolve(false)
                : undoSavedItems(savedItems, (id, photoUri) =>
                  removeWardrobeItem(id, photoUri, expectedUserId)),
            });
          },
          onSaveError: (error) => {
            if (!mountedRef.current) return;
            const code = (error as { code?: string })?.code;
            if (code === 'WARDROBE_CAPACITY_REACHED') {
              dialog.alert(
                'Wardrobe is full',
                'Choose which 30 items to keep in your free wardrobe, then try saving again.',
                [
                  { text: 'Keep reviewing', style: 'cancel' },
                  { text: 'Choose your 30', onPress: () => router.push('/choose-30') },
                ],
              );
            } else {
              dialog.notify({
                title: 'These items could not be saved',
                message: 'Nothing from this batch was added. Check your connection and try again.',
              });
            }
          },
          onDoneHaptic: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
          navigate: () => router.navigate('/(tabs)/wardrobe'),
        });
    } finally {
      savingRef.current = false;
    }
  };
  const handleSaveAll = () => {
    if (savingRef.current || saving) return;
    void saveAllConfirmed();
  };

  // Derived values
  const visibleItems    = items.filter(it => it.status !== 'removed');
  // editableItems: items the carousel can actually display/edit (have a classification).
  // pending/classifying/error items are never navigable within the panel.
  const editableItems   = visibleItems.filter(it =>
    it.status === 'settled' || it.status === 'saving' || it.status === 'saved' || it.status === 'local-only'
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
  const settledCount    = items.filter(it => it.status === 'settled' || it.status === 'local-only').length;
  const localOnlyCount  = items.filter(it => it.status === 'local-only').length;
  const { classifiedCount, failedCount, refusedCount, transientCount, totalCount, progressRatio } = selectBulkProgress(items);
  // Lock the CTA while any item is still pending/classifying.
  const hasClassifying  = aiPreference === 'allowed' && items.some(it => it.status === 'pending' || it.status === 'classifying');
  const canSaveAll      = settledCount > 0 && !saving && !hasClassifying && !retryingAll;

  const saveBtnLabel = saving
    ? 'Saving...'
    : selectionStartedAsGuest
      ? 'Add details to save each photo'
    : hasClassifying
      ? 'Analysing items...'
      : localOnlyCount > 0
        ? `Retry save for ${settledCount} Item${settledCount !== 1 ? 's' : ''}`
        : settledCount > 0
        ? `Save ${settledCount} Item${settledCount !== 1 ? 's' : ''} to Wardrobe`
        : 'No items ready to save';

  if (selectionMissing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.missingSelection}>
          <Ionicons name="images-outline" size={30} color={Colors.textSecondary} />
          <Text style={styles.missingSelectionTitle}>Photo selection expired</Text>
          <Text style={styles.missingSelectionCopy}>
            This temporary selection is no longer available. Please return and choose the photos again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.missingSelectionButton}
          >
            <Text style={styles.missingSelectionButtonText}>Back to Add Item</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      { paddingTop: Platform.OS === 'android' ? insets.top : insets.top },
    ]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={handleCancel}
          style={styles.backBtn}
          hitSlop={8}
          disabled={saving}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={saving ? Colors.textLight : Colors.primary}
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Batch Review</Text>
          <Text style={styles.headerSub}>
            {selectionStartedAsGuest
              ? `${totalCount} photo${totalCount === 1 ? '' : 's'} · Add details ${isGuest ? 'to save on this device' : 'to save'}`
              : `${classifiedCount} of ${totalCount} analysed${refusedCount > 0 ? ` · ${refusedCount} needs attention` : ''}${transientCount > 0 ? ` · ${transientCount} need another try` : ''}${failedCount > transientCount ? ` · ${failedCount - transientCount} failed` : ''}`}
          </Text>
          {(transientCount >= 2 || retryingAll) && (
            <Pressable accessibilityRole="button"
              disabled={retryingAll || saving || items.some(item => item.status === 'pending' || item.status === 'classifying')}
              onPress={() => void handleRetryAll()}>
              <Text style={styles.headerSub}>{retryingAll ? 'Trying again…' : 'Try all again'}</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={handleCancel}
          style={styles.cancelBtn}
          hitSlop={8}
          disabled={saving}
        >
          <Text style={[styles.cancelBtnText, saving && { color: Colors.textLight }]}>
            Cancel
          </Text>
        </Pressable>
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
        ListHeaderComponent={
          (selection?.failedCount ?? 0) > 0 || guestCapOmittedCount > 0 ||
          isGuest || (!selectionStartedAsGuest && aiPreference !== 'allowed') ||
          (bgNotAuthenticated && !bgUpsellDismissed) || (bgLimitReached && !bgLimitDismissed) ||
          (bgRemaining !== undefined && !isPremium) ? (
            <View style={styles.bgUpsellWrap}>
              {(selection?.failedCount ?? 0) > 0 && (
                <View style={styles.stagingNotice}>
                  <Text accessibilityLiveRegion="polite" style={styles.stagingNoticeText}>
                    {selection?.failedCount} photo{selection?.failedCount === 1 ? ' was' : 's were'} not ready and left out. The remaining photos are available to review.
                  </Text>
                </View>
              )}
              {guestCapOmittedCount > 0 && (
                <View style={styles.stagingNotice}>
                  <Text accessibilityLiveRegion="polite" style={styles.stagingNoticeText}>
                    Only the first {guestCapAcceptedCount} photo{guestCapAcceptedCount === 1 ? '' : 's'} fit your remaining guest wardrobe space. {guestCapOmittedCount} selected photo{guestCapOmittedCount === 1 ? ' was' : 's were'} left out.
                  </Text>
                </View>
              )}
              {isGuest && (
                <View style={styles.aiConsentBanner}>
                  <Text style={styles.aiConsentCopy}>
                    Sign in to let Amodka identify and prepare these photos for you.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/sign-in')}
                    style={({ pressed }) => [styles.aiConsentAction, pressed && { opacity: 0.75 }]}
                  >
                    <Text style={styles.aiConsentActionText}>Sign in</Text>
                  </Pressable>
                </View>
              )}
              {!isGuest && !selectionStartedAsGuest && aiPreference !== 'allowed' && (
                <View style={styles.aiConsentBanner}>
                  <Text style={styles.aiConsentTitle}>AI processing has not started</Text>
                  <Text style={styles.aiConsentCopy}>
                    Your photos remain on this screen. You can leave, or allow AI processing to continue with these photos.
                  </Text>
                  {aiPreferenceError && <Text style={styles.aiConsentError}>{aiPreferenceError}</Text>}
                  {aiPreference === 'checking' && <ActivityIndicator size="small" color={Colors.secondary} />}
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingAiPreference || aiPreference === 'checking'}
                    onPress={enableAiForSelectedPhotos}
                    style={({ pressed }) => [styles.aiConsentAction, (savingAiPreference || aiPreference === 'checking') && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}
                  >
                    <Text style={styles.aiConsentActionText}>
                      {aiPreference === 'unavailable' ? 'Check preference again' : 'Enable AI processing'}
                    </Text>
                  </Pressable>
                </View>
              )}
              {bgNotAuthenticated && !bgUpsellDismissed && !selectionStartedAsGuest && (
                <Animated.View entering={FadeInDown.duration(260)}>
                  <Pressable
                    style={({ pressed }) => [styles.bgUpsellBanner, pressed && { opacity: 0.8 }]}
                    onPress={() => router.push('/sign-in')}
                  >
                    <Ionicons name="lock-closed-outline" size={14} color={Colors.secondary} />
                    <Text style={styles.bgUpsellBannerText}>
                      Sign in to unlock automatic background removal for all items
                    </Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => setBgUpsellDismissed(true)}
                    >
                      <Ionicons name="close" size={14} color={Colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                </Animated.View>
              )}
              {bgRemaining !== undefined && !selectionStartedAsGuest && !isPremium && !bgLimitReached && (
                <Animated.View entering={FadeInDown.duration(260)}>
                  <View style={styles.bgRemainingPill}>
                    <Ionicons name="images-outline" size={14} color={Colors.sage} />
                    <Text style={styles.bgRemainingText}>
                      {bgRemaining} of 20 lifetime background removals left
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
              {bgLimitReached && !selectionStartedAsGuest && !bgLimitDismissed && (
                <Animated.View entering={FadeInDown.duration(260)} style={styles.bgLimitPill}>
                  <Ionicons name="hourglass-outline" size={14} color={Colors.textSecondary} />
                  <Text style={[styles.bgLimitText, { flex: 1 }]}>
                    Your 20 lifetime background removals are used — you can still add photos as they are
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => setBgLimitDismissed(true)}
                  >
                    <Ionicons name="close" size={14} color={Colors.textSecondary} />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <BulkCard
            item={item}
            statusPhase={statusPhase}
            manualReady={aiPreference !== 'allowed'}
            onRemove={handleRemove}
            onRetry={handleRetry}
            onManual={handleManual}
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
        {__DEV__ && UPLOAD_DIAGNOSTICS_ENABLED && (
          <Text style={styles.devBuildStamp}>
            {process.env.EXPO_PUBLIC_AMODKA_BUILD_STAMP ?? 'DEV build stamp unavailable'}
          </Text>
        )}
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
          saveBtnLabel={saveBtnLabel}
        />
      )}
      <AiProcessingConsent
        visible={showAiConsent}
        busy={savingAiPreference}
        context="upload"
        onAllow={allowBulkAiProcessing}
        onDecline={declineBulkAiProcessing}
        onDismiss={dismissBulkAiConsent}
      />
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
  cancelBtn:   { width: 60, height: 40, alignItems: 'flex-end', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Inter_500Medium', fontSize: rs(14), color: Colors.primary, letterSpacing: -0.1 },
  headerCenter:{ flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.primary, letterSpacing: -0.2 },
  headerSub:   { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textLight, marginTop: 1 },

  progressTrack: {
    height: 2, backgroundColor: Colors.border,
    marginHorizontal: 20, borderRadius: 1, marginBottom: 16, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.secondary, borderRadius: 1 },
  aiConsentBanner: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  aiConsentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.primary },
  aiConsentCopy: { fontFamily: 'Inter_400Regular', fontSize: rs(12), lineHeight: 19, color: Colors.textSecondary },
  aiConsentError: { fontFamily: 'Inter_400Regular', fontSize: rs(12), color: Colors.error },
  aiConsentAction: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: Colors.border, marginTop: 2 },
  aiConsentActionText: { fontFamily: 'Inter_500Medium', fontSize: rs(13), color: Colors.primary },

  columnWrapper: { gap: CARD_GAP, paddingHorizontal: SCREEN_PAD, marginBottom: CARD_GAP },
  listContent:   { paddingTop: 4, paddingBottom: 8 },

  card: {
    width: CARD_WIDTH, backgroundColor: Colors.white,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: Colors.primary, shadowOpacity: 0.05,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardBody: { width: '100%' },
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
    fontFamily: 'Inter_700Bold', fontSize: rs(12), color: Colors.primary, letterSpacing: 1,
  },
  goldStatus: {
    fontFamily: 'Inter_500Medium', fontSize: rs(9), color: Colors.primary,
    letterSpacing: 1.0, textAlign: 'center', paddingHorizontal: 8,
  },

  errorOverlay: {
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  retryOverlay: {
    padding: 12,
  },
  unexpectedFailure: { borderLeftWidth: 2, borderLeftColor: 'rgba(212, 96, 90, 0.45)' },
  errorLabel: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10), color: Colors.textSecondary, letterSpacing: 0.3,
  },
  manualEntryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 8, marginTop: 6 },
  prepareDiagnostic: {
    width: '96%', maxHeight: PHOTO_HEIGHT * 0.62, marginTop: 4,
    color: Colors.white, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: rs(7), lineHeight: rs(9), textAlign: 'left',
  },

  savedOverlay: {
    backgroundColor: 'rgba(106, 175, 123, 0.88)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  savedOverlayLabel: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.white },

  savingOverlay: {
    backgroundColor: 'rgba(16, 24, 38, 0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  localOnlyOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 70, 50, 0.72)',
    gap: 4,
  },

  removeBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 38, 0.45)', borderRadius: 14, zIndex: 2,
  },

  cardInfo: { paddingHorizontal: 10, paddingVertical: 10, minHeight: 56 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 5 },
  tag: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  tagText: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10),
    color: Colors.textSecondary, textTransform: 'capitalize',
  },
  tagGold: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: Colors.secondary + '15',
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  tagGoldText: {
    fontFamily: 'Inter_500Medium', fontSize: rs(10),
    color: Colors.secondary, textTransform: 'capitalize',
  },
  subTypeText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(12),
    color: Colors.primary, textTransform: 'capitalize', letterSpacing: -0.1,
  },

  shimmerTagRow: { flexDirection: 'row', gap: 4, marginBottom: 5 },
  shimmerPill: {
    height: 18, width: 36, borderRadius: 6, backgroundColor: Colors.border,
  },
  shimmerName: {
    height: 14, width: '70%', borderRadius: 4, backgroundColor: Colors.border,
  },

  missingSelection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  missingSelectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(18), color: Colors.primary, textAlign: 'center' },
  missingSelectionCopy: { fontFamily: 'Inter_400Regular', fontSize: rs(13), lineHeight: 20, color: Colors.textSecondary, textAlign: 'center' },
  missingSelectionButton: { marginTop: 8, minHeight: 46, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  missingSelectionButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.white },
  stagingNotice: { backgroundColor: '#F8E9DF', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  stagingNoticeText: { fontFamily: 'Inter_500Medium', fontSize: rs(12), lineHeight: 18, color: Colors.primary },
  bgUpsellWrap: { paddingHorizontal: SCREEN_PAD, paddingBottom: 12 },
  bgUpsellBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.secondary,
    shadowColor: Colors.secondary, shadowOpacity: 0.08,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bgUpsellBannerText: {
    flex: 1,
    fontFamily: 'Inter_500Medium', fontSize: rs(13),
    color: Colors.primary, letterSpacing: -0.1,
  },
  bgLimitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.textSecondary,
    shadowColor: Colors.primary, shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bgLimitText: {
    flex: 1,
    fontFamily: 'Inter_500Medium', fontSize: rs(13),
    color: Colors.textSecondary, letterSpacing: -0.1,
  },
  bgRemainingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.sage,
    shadowColor: Colors.primary, shadowOpacity: 0.04,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bgRemainingText: {
    flex: 1,
    fontFamily: 'Inter_500Medium', fontSize: rs(13),
    color: Colors.textSecondary, letterSpacing: -0.1,
  },
  bgRemainingCta: {
    backgroundColor: Colors.secondary + '22', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  bgRemainingCtaText: {
    fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.secondary,
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
  saveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.white },
  saveBtnTextDisabled: { color: Colors.textLight },
  devBuildStamp: {
    marginTop: 5, textAlign: 'center', color: Colors.textLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: rs(8),
  },
});
