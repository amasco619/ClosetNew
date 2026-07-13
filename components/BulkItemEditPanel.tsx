/**
 * BulkItemEditPanel — full-screen carousel editor for Batch Review.
 *
 * Renders as an absolute-fill Reanimated overlay inside bulk-review.tsx so the
 * shared `items` state stays local (no Expo Router navigation / serialization).
 * Slides up from the bottom with a spring enter / exit.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Dimensions,
  Platform,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { subTypes, colorFamilies } from '@/contexts/AppContext';
import type { ItemCategory, OccasionTag, SeasonTag } from '@/constants/types';
import type { BulkItemCore, ClassifyResult } from '@/lib/bulkClassifyCore';
import { stepCarousel, canGoPrev, canGoNext } from '@/lib/carouselUtils';

// ─── Re-export pure carousel utility for testing ──────────────────────────────
export { stepCarousel } from '@/lib/carouselUtils';

// ─── Local constants (mirrors add-item.tsx — not exported from app pages) ─────

const CATEGORIES: { id: ItemCategory; label: string }[] = [
  { id: 'top',       label: 'Top' },
  { id: 'bottom',    label: 'Bottom' },
  { id: 'dress',     label: 'Dress' },
  { id: 'outerwear', label: 'Outerwear' },
  { id: 'shoes',     label: 'Shoes' },
  { id: 'bag',       label: 'Bag' },
  { id: 'jewelry',   label: 'Jewelry' },
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
};

const SEASONS: SeasonTag[] = ['all-season', 'spring', 'summer', 'fall', 'winter'];

const COLOR_DOTS: Record<string, string> = {
  black: '#1a1a1a', white: '#f5f5f5', grey: '#8B8B8B', cream: '#FFFDD0',
  beige: '#D4C5A9', camel: '#C19A6B', brown: '#6B4226', khaki: '#BDB76B',
  mustard: '#C9A227', gold: '#C8A951', silver: '#BFC1C2',
  red: '#C0392B', maroon: '#800000', burgundy: '#7D2027',
  coral: '#FF7F50', orange: '#E67E22', yellow: '#F4C542',
  olive: '#556B2F', green: '#27AE60', mint: '#98D8B9', teal: '#1F7A7A',
  blue: '#3498DB', navy: '#1B2A4A',
  lavender: '#B57EDC', purple: '#7D3C98', pink: '#E8A0BF',
};

const PATTERNS       = ['solid', 'stripe', 'floral', 'check', 'print', 'color-block', 'geometric', 'animal'];
const PATTERN_SCALES = ['small', 'medium', 'large'];
const FABRICS        = ['chiffon', 'silk', 'satin', 'linen', 'cotton', 'jersey', 'synthetic', 'knit', 'denim', 'tweed', 'wool', 'cashmere', 'suede', 'leather', 'velvet', 'corduroy'];
const FABRIC_WEIGHTS = ['light', 'mid', 'heavy'];
const FITS           = ['slim', 'regular', 'loose', 'oversized', 'tailored'];
const NECKLINES      = ['crew', 'v-neck', 'scoop', 'turtleneck', 'boat', 'square', 'halter', 'off-shoulder', 'collared'];
const SLEEVES        = ['sleeveless', 'short', 'three-quarter', 'long'];

const CORE_CATEGORIES = new Set<ItemCategory>(['top', 'bottom', 'dress', 'outerwear']);
const NECKLINE_CATEGORIES = new Set<ItemCategory>(['top', 'dress', 'outerwear']);
const SLEEVE_CATEGORIES = new Set<ItemCategory>(['top', 'dress', 'outerwear']);

const { height: SCREEN_H } = Dimensions.get('window');

const SPRING_IN  = { damping: 26, stiffness: 280 } as const;
const SPRING_OUT = { damping: 28, stiffness: 320 } as const;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BulkItemEditPanelProps {
  /** Navigable items only (settled/saving/saved). Prev/Next step within this list. */
  items: BulkItemCore[];
  /** Index into `items` of the currently-edited garment (derived from URI in parent). */
  editingIndex: number;
  setEditingIndex: (idx: number) => void;
  /**
   * 1-based position of the current item among ALL non-removed items.
   * Used only for the "GARMENT N OF M" header display — kept separate from
   * `editingIndex` so the counter reflects the full visible list, not just
   * the editable subset.
   */
  displayPosition: number;
  /** Total non-removed item count — the "M" in "GARMENT N OF M". */
  displayTotal: number;
  /** Patch a single classification field on the item with the given URI. */
  patchItem: (uri: string, updates: Partial<ClassifyResult>) => void;
  onClose: () => void;
  /** CTA — delegates directly to bulk-review's handleSaveAll. */
  onSaveAll: () => void;
  canSaveAll: boolean;
  saving: boolean;
  settledCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkItemEditPanel({
  items,
  editingIndex,
  setEditingIndex,
  displayPosition,
  displayTotal,
  patchItem,
  onClose,
  onSaveAll,
  canSaveAll,
  saving,
  settledCount,
}: BulkItemEditPanelProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const total       = items.length;
  const currentItem = items[editingIndex] ?? items[0];
  const cl          = currentItem?.classification ?? null;

  const isReadOnly  = currentItem?.status === 'saved' || currentItem?.status === 'saving';
  const isCore      = CORE_CATEGORIES.has(cl?.category as ItemCategory);
  const showNeck    = NECKLINE_CATEGORIES.has(cl?.category as ItemCategory);
  const showSleeve  = SLEEVE_CATEGORIES.has(cl?.category as ItemCategory);

  // ── Local description state (controlled for smooth typing) ─────────────────
  // Changes are written back to shared state immediately on every keystroke
  // via patchItem so the parent items array always reflects the latest text.
  const [localDesc, setLocalDesc] = useState(cl?.description ?? '');

  useEffect(() => {
    setLocalDesc(cl?.description ?? '');
    // Scroll to top whenever the garment changes
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [editingIndex]);

  const handleDescChange = useCallback((text: string) => {
    if (isReadOnly || !currentItem) return;
    setLocalDesc(text);
    patchItem(currentItem.uri, { description: text });
  }, [isReadOnly, currentItem, patchItem]);

  // Kept as a no-op ref-flush for navigation / close paths that fire before
  // onChangeText has propagated (e.g. hardware back pressed mid-word).
  const commitDesc = useCallback(() => {
    if (!currentItem || isReadOnly) return;
    patchItem(currentItem.uri, { description: localDesc });
  }, [localDesc, currentItem, patchItem, isReadOnly]);

  // ── Spring slide-up / slide-down ────────────────────────────────────────────
  const translateY = useSharedValue(SCREEN_H);

  useEffect(() => {
    translateY.value = withSpring(0, SPRING_IN);
  }, []);

  const handleClose = useCallback(() => {
    commitDesc();
    translateY.value = withSpring(SCREEN_H, SPRING_OUT, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, commitDesc]);

  // ── Android hardware back ────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // ── Carousel navigation ─────────────────────────────────────────────────────
  const goTo = (idx: number) => {
    commitDesc();
    Haptics.selectionAsync();
    setEditingIndex(idx);
  };

  // ── Field patch helpers ──────────────────────────────────────────────────────
  const patch = (updates: Partial<ClassifyResult>) => {
    if (!currentItem || isReadOnly) return;
    Haptics.selectionAsync();
    patchItem(currentItem.uri, updates);
  };

  const toggleOccasion = (tag: OccasionTag) => {
    if (!cl || isReadOnly) return;
    const next = cl.occasionTags.includes(tag)
      ? cl.occasionTags.filter(t => t !== tag)
      : [...cl.occasionTags, tag];
    patch({ occasionTags: next });
  };

  const toggleSeason = (tag: SeasonTag) => {
    if (!cl || isReadOnly) return;
    const next = cl.seasonTags.includes(tag)
      ? cl.seasonTags.filter(t => t !== tag)
      : [...cl.seasonTags, tag];
    patch({ seasonTags: next });
  };

  // ── Save label ──────────────────────────────────────────────────────────────
  const saveBtnLabel = saving
    ? 'Saving...'
    : settledCount > 0
      ? `Save ${settledCount} Item${settledCount !== 1 ? 's' : ''} to Wardrobe`
      : 'Analysing items...';

  if (!currentItem || !cl) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, panelStyle]}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.primary} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.garmentLabel}>GARMENT</Text>
          <Text style={styles.garmentCounter}>
            {displayPosition} <Text style={styles.garmentOf}>OF</Text> {displayTotal}
          </Text>
        </View>

        <View style={styles.navBtns}>
          <Pressable
            onPress={() => goTo(stepCarousel(editingIndex, 'prev', total))}
            disabled={!canGoPrev(editingIndex)}
            style={[styles.navBtn, !canGoPrev(editingIndex) && styles.navBtnDisabled]}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={canGoPrev(editingIndex) ? Colors.primary : Colors.textLight}
            />
          </Pressable>
          <Pressable
            onPress={() => goTo(stepCarousel(editingIndex, 'next', total))}
            disabled={!canGoNext(editingIndex, total)}
            style={[styles.navBtn, !canGoNext(editingIndex, total) && styles.navBtnDisabled]}
            hitSlop={6}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={canGoNext(editingIndex, total) ? Colors.primary : Colors.textLight}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Scrollable field editor ─────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Photo */}
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: currentItem.uri }}
            style={styles.photo}
            contentFit="contain"
            recyclingKey={currentItem.uri}
          />
          {isReadOnly && (
            <View style={styles.readOnlyBadge} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={14} color={Colors.white} />
              <Text style={styles.readOnlyLabel}>Saved</Text>
            </View>
          )}
        </View>

        {/* ── Category ──────────────────────────────────────────────────────── */}
        <SectionLabel>Category</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          <View style={styles.chipRow}>
            {CATEGORIES.map(cat => (
              <Pressable
                key={cat.id}
                style={[styles.chip, cl.category === cat.id && styles.chipActive]}
                onPress={() => {
                  if (isReadOnly) return;
                  patch({ category: cat.id, subType: '' });
                }}
              >
                <Text style={[styles.chipText, cl.category === cat.id && styles.chipTextActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* ── Sub-type ──────────────────────────────────────────────────────── */}
        <SectionLabel>Type</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          <View style={styles.chipRow}>
            {(subTypes[cl.category] ?? []).map(st => (
              <Pressable
                key={st}
                style={[styles.chip, cl.subType === st && styles.chipActive]}
                onPress={() => patch({ subType: st })}
                disabled={isReadOnly}
              >
                <Text style={[styles.chipText, cl.subType === st && styles.chipTextActive]}>
                  {st.replace(/-/g, ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* ── Color ─────────────────────────────────────────────────────────── */}
        <SectionLabel>Color</SectionLabel>
        <View style={styles.colorGrid}>
          {colorFamilies.map(cf => (
            <Pressable
              key={cf}
              style={[styles.colorChip, cl.colorFamily === cf && styles.colorChipActive]}
              onPress={() => patch({ colorFamily: cf })}
              disabled={isReadOnly}
            >
              <View style={[styles.colorDot, { backgroundColor: COLOR_DOTS[cf] ?? '#ccc' }]} />
              <Text style={[styles.colorLabel, cl.colorFamily === cf && styles.colorLabelActive]}>
                {cf}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Occasions ─────────────────────────────────────────────────────── */}
        <SectionLabel>Occasions</SectionLabel>
        <View style={styles.occasionGrid}>
          {OCCASIONS.map(tag => {
            const active = cl.occasionTags.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.occasionChip, active && styles.occasionChipActive]}
                onPress={() => toggleOccasion(tag)}
                disabled={isReadOnly}
              >
                <Text style={[styles.occasionText, active && styles.occasionTextActive]}>
                  {OCCASION_LABELS[tag]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Seasons ───────────────────────────────────────────────────────── */}
        <SectionLabel>Season</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          <View style={styles.chipRow}>
            {SEASONS.map(s => {
              const active = cl.seasonTags.includes(s);
              return (
                <Pressable
                  key={s}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleSeason(s)}
                  disabled={isReadOnly}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {s.replace(/-/g, ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* ── Fit ───────────────────────────────────────────────────────────── */}
        <SectionLabel>Fit</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          <View style={styles.chipRow}>
            {FITS.map(f => (
              <Pressable
                key={f}
                style={[styles.chip, cl.fit === f && styles.chipActive]}
                onPress={() => patch({ fit: cl.fit === f ? undefined : f })}
                disabled={isReadOnly}
              >
                <Text style={[styles.chipText, cl.fit === f && styles.chipTextActive]}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* ── Pattern (core categories only) ────────────────────────────────── */}
        {isCore && (
          <>
            <SectionLabel>Pattern</SectionLabel>
            <View style={styles.chipWrap}>
              {PATTERNS.map(p => (
                <Pressable
                  key={p}
                  style={[styles.chip, cl.pattern === p && styles.chipActive]}
                  onPress={() => {
                    const next = cl.pattern === p ? 'solid' : p;
                    patch({ pattern: next, patternScale: next === 'solid' ? undefined : cl.patternScale });
                  }}
                  disabled={isReadOnly}
                >
                  <Text style={[styles.chipText, cl.pattern === p && styles.chipTextActive]}>
                    {p.replace(/-/g, ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {cl.pattern && cl.pattern !== 'solid' && (
              <>
                <SectionLabel>Pattern scale</SectionLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
                  <View style={styles.chipRow}>
                    {PATTERN_SCALES.map(s => (
                      <Pressable
                        key={s}
                        style={[styles.chip, cl.patternScale === s && styles.chipActive]}
                        onPress={() => patch({ patternScale: cl.patternScale === s ? undefined : s })}
                        disabled={isReadOnly}
                      >
                        <Text style={[styles.chipText, cl.patternScale === s && styles.chipTextActive]}>
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </>
        )}

        {/* ── Fabric (core categories only) ─────────────────────────────────── */}
        {isCore && (
          <>
            <SectionLabel>Fabric</SectionLabel>
            <View style={styles.chipWrap}>
              {FABRICS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.chip, cl.fabric === f && styles.chipActive]}
                  onPress={() => patch({ fabric: f })}
                  disabled={isReadOnly}
                >
                  <Text style={[styles.chipText, cl.fabric === f && styles.chipTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ── Weight (core categories only) ─────────────────────────────────── */}
        {isCore && (
          <>
            <SectionLabel>Weight</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              <View style={styles.chipRow}>
                {FABRIC_WEIGHTS.map(w => (
                  <Pressable
                    key={w}
                    style={[styles.chip, cl.weight === w && styles.chipActive]}
                    onPress={() => patch({ weight: w })}
                    disabled={isReadOnly}
                  >
                    <Text style={[styles.chipText, cl.weight === w && styles.chipTextActive]}>{w}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Neckline (top / dress / outerwear) ────────────────────────────── */}
        {showNeck && (
          <>
            <SectionLabel>Neckline</SectionLabel>
            <View style={styles.chipWrap}>
              {NECKLINES.map(n => (
                <Pressable
                  key={n}
                  style={[styles.chip, cl.neckline === n && styles.chipActive]}
                  onPress={() => patch({ neckline: cl.neckline === n ? undefined : n })}
                  disabled={isReadOnly}
                >
                  <Text style={[styles.chipText, cl.neckline === n && styles.chipTextActive]}>
                    {n.replace(/-/g, ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ── Sleeve (top / dress / outerwear) ──────────────────────────────── */}
        {showSleeve && (
          <>
            <SectionLabel>Sleeve</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              <View style={styles.chipRow}>
                {SLEEVES.map(s => (
                  <Pressable
                    key={s}
                    style={[styles.chip, cl.sleeveLength === s && styles.chipActive]}
                    onPress={() => patch({ sleeveLength: cl.sleeveLength === s ? undefined : s })}
                    disabled={isReadOnly}
                  >
                    <Text style={[styles.chipText, cl.sleeveLength === s && styles.chipTextActive]}>
                      {s.replace(/-/g, ' ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Description ───────────────────────────────────────────────────── */}
        <SectionLabel>Description</SectionLabel>
        <TextInput
          style={[styles.descInput, isReadOnly && styles.descInputReadOnly]}
          value={localDesc}
          onChangeText={handleDescChange}
          onBlur={commitDesc}
          placeholder="Short description of this piece..."
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={3}
          editable={!isReadOnly}
          returnKeyType="done"
          blurOnSubmit
        />

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Persistent save CTA ─────────────────────────────────────────────── */}
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
          onPress={() => {
            commitDesc();
            onSaveAll();
          }}
          disabled={!canSaveAll}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons
                name="checkmark"
                size={20}
                color={canSaveAll ? Colors.white : Colors.textLight}
              />
          }
          <Text style={[styles.saveBtnText, !canSaveAll && styles.saveBtnTextDisabled]}>
            {saveBtnLabel}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Section label helper ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: Colors.background,
    zIndex: 10,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  garmentLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    letterSpacing: 1.0,
    color: Colors.textLight,
    textTransform: 'uppercase',
    lineHeight: 13,
  },
  garmentCounter: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.primary,
    letterSpacing: -0.5,
    lineHeight: 28,
    fontVariant: ['tabular-nums'],
  },
  garmentOf: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  navBtns: {
    flexDirection: 'row',
    gap: 4,
    width: 72,
    justifyContent: 'flex-end',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Photo
  photoWrap: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  readOnlyBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + 'DD',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readOnlyLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.white,
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.primary,
    letterSpacing: -0.1,
    marginBottom: 10,
    marginTop: 4,
  },

  // Horizontal scroll row (single-row chips)
  hScroll: {
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },

  // Wrap chip grid (multi-row)
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },

  // Standard chip
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: Colors.white,
  },

  // Color grid
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorChipActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.primary + '08',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  colorLabelActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },

  // Occasion chip grid
  occasionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  occasionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  occasionChipActive: {
    backgroundColor: Colors.secondary + '18',
    borderColor: Colors.secondary,
  },
  occasionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.textSecondary,
  },
  occasionTextActive: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },

  // Description
  descInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 0,
  },
  descInputReadOnly: {
    backgroundColor: Colors.background,
    color: Colors.textSecondary,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.white,
  },
  saveBtnTextDisabled: {
    color: Colors.textLight,
  },
});
