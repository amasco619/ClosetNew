import { useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import type { OccasionTag, WardrobeItem } from '@/constants/types';
import { wardrobeItemDisplayName } from '@/constants/wardrobeLabels';
import { isHeadwearSubtype } from '@/lib/lookCardPresentation';
import type { CheckLookResult, CheckLookSelection } from '@/lib/checkLook';

export type { CheckLookResult, CheckLookSelection } from '@/lib/checkLook';

export interface CheckMyLookSheetProps {
  visible: boolean;
  items: WardrobeItem[];
  isPremium: boolean;
  freeRemaining: number;
  allowanceLoading: boolean;
  membershipLoading: boolean;
  membershipUnavailable: boolean;
  checking: boolean;
  result: CheckLookResult | null;
  onOpen(): void;
  onClose(): void;
  onCheck(selection: CheckLookSelection): void;
  onUpgrade(): void;
  onClearResult(): void;
}

type SlotKey = 'dress' | 'top' | 'bottom' | 'shoes' | 'layer' | 'bag' | 'jewellery' | 'headwear';
type LocalSelection = Record<SlotKey, string | null>;

const OCCASIONS: { value: OccasionTag; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'date-casual', label: 'Date · daytime' },
  { value: 'date-dressy', label: 'Date · evening' },
  { value: 'casual', label: 'Casual' },
  { value: 'event', label: 'Event' },
  { value: 'interview', label: 'Interview' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'traditional-event', label: 'Traditional event' },
  { value: 'travel', label: 'Travel' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'active', label: 'Active' },
  { value: 'resort', label: 'Resort' },
  { value: 'night-out', label: 'Night out' },
];

const SLOT_CONFIG: { key: SlotKey; label: string; category?: WardrobeItem['category'] }[] = [
  { key: 'dress', label: 'Dress', category: 'dress' },
  { key: 'top', label: 'Top', category: 'top' },
  { key: 'bottom', label: 'Bottom', category: 'bottom' },
  { key: 'shoes', label: 'Shoes', category: 'shoes' },
  { key: 'layer', label: 'Layer', category: 'outerwear' },
  { key: 'bag', label: 'Bag', category: 'bag' },
  { key: 'jewellery', label: 'Jewellery', category: 'jewelry' },
  { key: 'headwear', label: 'Headwear', category: 'jewelry' },
];

const EMPTY_SELECTION: LocalSelection = {
  dress: null,
  top: null,
  bottom: null,
  shoes: null,
  layer: null,
  bag: null,
  jewellery: null,
  headwear: null,
};

function itemName(item: WardrobeItem): string {
  return wardrobeItemDisplayName(item.colorFamily, item.subType);
}

function isHeadwear(item: WardrobeItem): boolean {
  return isHeadwearSubtype(item.subType);
}

export function CheckMyLookSheet(props: CheckMyLookSheetProps) {
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<LocalSelection>(EMPTY_SELECTION);
  const [occasion, setOccasion] = useState<OccasionTag>('casual');
  const [temperatureText, setTemperatureText] = useState('');
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null);

  const selectedIds = useMemo(
    () => SLOT_CONFIG.map(slot => selection[slot.key])
      .filter((id): id is string => Boolean(id) && props.items.some(item => item.id === id)),
    [selection, props.items],
  );
  const selectedItems = useMemo(
    () => selectedIds.map(id => props.items.find(item => item.id === id)).filter((item): item is WardrobeItem => Boolean(item)),
    [selectedIds, props.items],
  );
  const selectedCategories = new Set(selectedItems.map(item => item.category));
  const hasBaseLook = selectedCategories.has('dress') ||
    (selectedCategories.has('top') && selectedCategories.has('bottom'));
  const parsedTemperature = temperatureText.trim() === '' ? undefined : Number(temperatureText);
  const validTemperature = parsedTemperature === undefined || Number.isFinite(parsedTemperature);
  const selectionSummary = selectedItems.map(item => itemName(item)).join(', ');
  const quotaReached = !props.isPremium && props.freeRemaining <= 0;

  const changeSelection = (next: LocalSelection) => {
    setSelection(next);
    props.onClearResult();
  };

  const candidatesFor = (slot: SlotKey) => props.items.filter(item => {
    if (slot === 'headwear') return item.category === 'jewelry' && isHeadwear(item);
    if (slot === 'jewellery') return item.category === 'jewelry' && !isHeadwear(item);
    return item.category === SLOT_CONFIG.find(config => config.key === slot)?.category;
  });

  const toggleItem = (slot: SlotKey, item: WardrobeItem) => {
    const next = { ...selection };
    if (next[slot] === item.id) {
      next[slot] = null;
    } else {
      for (const config of SLOT_CONFIG) {
        if (config.key !== slot && next[config.key] === item.id) next[config.key] = null;
      }
      next[slot] = item.id;
      if (slot === 'dress') {
        next.top = null;
        next.bottom = null;
      }
      if (slot === 'top' || slot === 'bottom') next.dress = null;
    }
    changeSelection(next);
  };

  const handleOccasion = (value: OccasionTag) => {
    setOccasion(value);
    props.onClearResult();
  };

  const handleTemperature = (value: string) => {
    const cleaned = value.replace(/[^\d.-]/g, '').replace(/(?!^)-/g, '');
    setTemperatureText(cleaned);
    props.onClearResult();
  };

  const submit = () => {
    if (quotaReached) {
      props.onUpgrade();
      return;
    }
    if (!hasBaseLook || props.membershipLoading || props.checking || !validTemperature) return;
    Keyboard.dismiss();
    props.onCheck({
      itemIds: selectedIds,
      occasion,
      ...(parsedTemperature === undefined ? {} : { temperatureC: parsedTemperature }),
    });
  };

  const checkDisabled = props.membershipLoading || props.allowanceLoading || props.checking ||
    (!quotaReached && (!hasBaseLook || !validTemperature));
  const verdictColor = props.result?.verdict === 'Works'
    ? Colors.success
    : props.result?.verdict === 'Almost'
      ? Colors.warning
      : Colors.error;

  return (
    <>
      <Pressable
        testID="check-my-look-entry"
        accessibilityRole="button"
        accessibilityLabel="Check my look"
        accessibilityHint="Choose pieces from your wardrobe and review the combination"
        onPress={props.onOpen}
        style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
      >
        <View style={styles.entryMark}>
          <Text style={styles.entryMarkText}>A</Text>
        </View>
        <View style={styles.entryCopy}>
          <Text style={styles.entryTitle}>Check my look</Text>
          <Text style={styles.entrySubtitle}>A second opinion on pieces you own</Text>
        </View>
        <Text style={styles.entryArrow} accessibilityElementsHidden>›</Text>
      </Pressable>

      <Modal
        testID="check-my-look-modal"
        visible={props.visible}
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        animationType="slide"
        onRequestClose={props.onClose}
      >
        <View style={styles.stage}>
          <Pressable
            testID="check-my-look-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Close Check My Look"
            style={styles.scrim}
            onPress={props.onClose}
          />
          <View
            testID="check-my-look-sheet"
            accessibilityViewIsModal
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text accessibilityRole="header" style={styles.title}>Check my look</Text>
                <Text style={styles.intro}>A considered combination, from your wardrobe.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Check My Look"
                hitSlop={12}
                onPress={props.onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <Text style={styles.sectionTitle}>Build your look</Text>
              <Text style={styles.helper}>Choose one dress, or a top and bottom. Everything stays yours.</Text>

              {SLOT_CONFIG.map(slot => {
                const selectedId = selection[slot.key];
                const selectedItem = selectedId ? props.items.find(item => item.id === selectedId) : undefined;
                const expanded = activeSlot === slot.key;
                const candidates = candidatesFor(slot.key);
                const requiredSlot = slot.key === 'dress' || slot.key === 'top' || slot.key === 'bottom';
                return (
                  <View key={slot.key} style={styles.slotBlock}>
                    <View style={styles.slotHeader}>
                      <Text style={styles.slotLabel}>{slot.label}{requiredSlot ? '' : ' · optional'}</Text>
                      {selectedItem ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${itemName(selectedItem)} from ${slot.label.toLowerCase()}`}
                          onPress={() => toggleItem(slot.key, selectedItem)}
                          style={styles.removeButton}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${slot.label}: ${selectedItem ? itemName(selectedItem) : 'Choose from wardrobe'}`}
                      accessibilityState={{ expanded }}
                      onPress={() => setActiveSlot(expanded ? null : slot.key)}
                      style={({ pressed }) => [styles.slotPicker, expanded && styles.slotPickerActive, pressed && styles.pressed]}
                    >
                      <Text numberOfLines={1} style={selectedItem ? styles.slotValue : styles.slotPlaceholder}>
                        {selectedItem ? itemName(selectedItem) : 'Choose a piece'}
                      </Text>
                      <Text style={styles.slotChevron}>{expanded ? '−' : '+'}</Text>
                    </Pressable>
                    {expanded && (
                      <View style={styles.candidateList}>
                        {candidates.length ? candidates.map(item => {
                          const selected = selectedId === item.id;
                          return (
                            <Pressable
                              key={item.id}
                              accessibilityRole="button"
                              accessibilityLabel={`${itemName(item)}${selected ? ', selected' : ''}`}
                              accessibilityState={{ selected }}
                              onPress={() => toggleItem(slot.key, item)}
                              style={({ pressed }) => [
                                styles.candidate,
                                selected && styles.candidateSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <View style={[styles.selectionDot, selected && styles.selectionDotSelected]}>
                                {selected && <View style={styles.selectionDotInner} />}
                              </View>
                              <Text numberOfLines={1} style={styles.candidateName}>{itemName(item)}</Text>
                            </Pressable>
                          );
                        }) : (
                          <Text style={styles.emptySlot}>
                            {slot.key === 'headwear'
                              ? 'No headwear in your wardrobe yet.'
                              : `No ${slot.label.toLowerCase()} pieces in your wardrobe yet.`}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Where are you wearing it?</Text>
              <View style={styles.occasionGrid}>
                {OCCASIONS.map(option => {
                  const selected = occasion === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => handleOccasion(option.value)}
                      style={[styles.occasionChip, selected && styles.occasionChipSelected]}
                    >
                      <Text style={[styles.occasionText, selected && styles.occasionTextSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.weatherRow}>
                <View style={styles.weatherCopy}>
                  <Text style={styles.slotLabel}>Temperature</Text>
                  <Text style={styles.helper}>Optional · enter it manually</Text>
                </View>
                <View style={styles.temperatureField}>
                  <TextInput
                    accessibilityLabel="Temperature in degrees Celsius"
                    accessibilityHint="Optional manual temperature"
                    keyboardType="numbers-and-punctuation"
                    value={temperatureText}
                    onChangeText={handleTemperature}
                    placeholder="—"
                    placeholderTextColor={Colors.textLight}
                    maxLength={5}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.temperatureInput}
                  />
                  <Text style={styles.degree}>°C</Text>
                </View>
              </View>

              {!hasBaseLook && (
                <Text style={styles.validationNote}>Choose a dress, or both a top and bottom, to continue.</Text>
              )}
              {!validTemperature && <Text style={styles.validationNote}>Enter a valid temperature in °C.</Text>}

              {props.membershipLoading && (
                <View accessibilityLiveRegion="polite" style={styles.notice}>
                  <Text style={styles.noticeText}>Checking confirmed set membership before swaps are shown.</Text>
                </View>
              )}
              {props.allowanceLoading && (
                <View accessibilityLiveRegion="polite" style={styles.notice}>
                  <Text style={styles.noticeText}>Checking today’s free allowance.</Text>
                </View>
              )}

              {props.result && (
                <View accessibilityLiveRegion="polite" style={styles.resultCard}>
                  <Text style={styles.resultEyebrow}>{props.result.tier === 'premium' ? 'Amodka’s review' : 'Your verdict'}</Text>
                  <Text style={[styles.verdict, { color: verdictColor }]}>{props.result.verdict}</Text>
                  {props.result.tier === 'free' ? (
                    <Text style={styles.premiumQuiet}>Premium offers a fuller review of what works and what to refine.</Text>
                  ) : (
                    <>
                      {props.membershipUnavailable && (
                        <Text style={styles.noticeText}>Confirmed set membership could not be checked. This review uses the information available.</Text>
                      )}
                      {props.result.working.length > 0 && (
                        <ResultList title="What works" values={props.result.working} />
                      )}
                      {props.result.clashes.length > 0 && (
                        <ResultList title="Worth reconsidering" values={props.result.clashes} />
                      )}
                      {props.result.notes.length > 0 && <ResultList title="A note" values={props.result.notes} />}
                      {props.result.swaps.length > 0 && (
                        <View style={styles.resultSection}>
                          <Text style={styles.resultSectionTitle}>Possible swaps</Text>
                          {props.result.swaps.slice(0, 2).map((swap, index) => {
                            const original = props.items.find(item => item.id === swap.replacesId);
                            return (
                              <Text key={`${swap.replacesId}-${swap.replacement.id}-${index}`} style={styles.resultLine}>
                                {original ? itemName(original) : 'Selected piece'} · try {itemName(swap.replacement)}
                              </Text>
                            );
                          })}
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              <Pressable
                testID={quotaReached ? 'check-my-look-paywall' : 'check-my-look-submit'}
                accessibilityRole="button"
                accessibilityLabel={quotaReached ? 'Upgrade to Premium' : 'Check this look'}
                accessibilityState={{
                  disabled: !quotaReached && checkDisabled,
                  busy: props.checking,
                }}
                disabled={!quotaReached && checkDisabled}
                onPress={submit}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !quotaReached && checkDisabled && styles.primaryDisabled,
                  pressed && !(!quotaReached && checkDisabled) && styles.pressed,
                ]}
              >
                <Text style={styles.primaryText}>
                  {quotaReached
                    ? 'Explore Premium'
                    : props.checking
                      ? 'Reviewing your look…'
                      : 'Check this look'}
                </Text>
              </Pressable>
              {!quotaReached && (
                <Text style={styles.remainingCount}>
                  {props.isPremium
                    ? 'Premium access is active'
                    : `${props.freeRemaining} free ${props.freeRemaining === 1 ? 'verdict' : 'verdicts'} remaining`}
                </Text>
              )}
              {props.membershipUnavailable && !props.result && (
                <Text style={styles.quietNote}>Confirmed set membership is unavailable at the moment. You can still check this look.</Text>
              )}
              {quotaReached && (
                <Pressable
                  testID="check-my-look-paywall-secondary"
                  accessibilityRole="button"
                  accessibilityLabel="See Premium options"
                  onPress={props.onUpgrade}
                  style={styles.secondaryUpgrade}
                >
                  <Text style={styles.secondaryUpgradeText}>See Premium options</Text>
                </Pressable>
              )}
              {!!selectionSummary && (
                <Text accessibilityLabel={`Selected pieces: ${selectionSummary}`} style={styles.selectionSummary}>
                  Your selection · {selectionSummary}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ResultList({ title, values }: { title: string; values: string[] }) {
  return (
    <View style={styles.resultSection}>
      <Text style={styles.resultSectionTitle}>{title}</Text>
      {values.map((value, index) => (
        <Text key={`${title}-${index}`} style={styles.resultLine}>·  {value}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingVertical: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  entryMark: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.garmentStudioTop,
  },
  entryMarkText: { color: Colors.primary, fontFamily: 'Georgia', fontSize: 21 },
  entryCopy: { flex: 1, marginLeft: 13 },
  entryTitle: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  entrySubtitle: { marginTop: 3, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12 },
  entryArrow: { color: Colors.secondary, fontSize: 28, marginLeft: 10, marginRight: 2 },
  stage: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: Colors.overlay },
  sheet: {
    maxHeight: '94%',
    paddingTop: 10,
    paddingHorizontal: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.background,
    shadowColor: Colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  headerCopy: { flex: 1 },
  title: { color: Colors.primary, fontFamily: 'Georgia', fontSize: 27, lineHeight: 33 },
  intro: { marginTop: 3, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  closeButton: { minHeight: 42, justifyContent: 'center', paddingLeft: 14 },
  closeText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  content: { paddingBottom: 12 },
  sectionTitle: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 4 },
  helper: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  slotBlock: { marginTop: 13 },
  slotHeader: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  slotLabel: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  removeButton: { paddingHorizontal: 7, paddingVertical: 3 },
  removeText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 12 },
  slotPicker: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.cardBackground,
  },
  slotPickerActive: { borderColor: Colors.secondary },
  slotValue: { flex: 1, color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  slotPlaceholder: { flex: 1, color: Colors.textLight, fontFamily: 'Inter_400Regular', fontSize: 13 },
  slotChevron: { color: Colors.secondary, fontSize: 20, marginLeft: 12 },
  candidateList: { marginTop: 6, padding: 5, borderRadius: 14, backgroundColor: Colors.garmentStudioTop },
  candidate: { minHeight: 43, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderRadius: 10 },
  candidateSelected: { backgroundColor: Colors.cardBackground },
  selectionDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.textLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selectionDotSelected: { borderColor: Colors.sage },
  selectionDotInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.sage },
  candidateName: { flex: 1, color: Colors.primary, fontFamily: 'Inter_400Regular', fontSize: 13 },
  emptySlot: { paddingHorizontal: 10, paddingVertical: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12 },
  divider: { height: 1, backgroundColor: Colors.border, marginTop: 22, marginBottom: 18 },
  occasionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  occasionChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, backgroundColor: Colors.cardBackground },
  occasionChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  occasionText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 12 },
  occasionTextSelected: { color: Colors.textOnDark },
  weatherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 14 },
  weatherCopy: { flex: 1 },
  temperatureField: {
    width: 94,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 13,
    backgroundColor: Colors.cardBackground,
  },
  temperatureInput: { flex: 1, padding: 0, color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 15, textAlign: 'right' },
  degree: { marginLeft: 4, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 13 },
  validationNote: { marginBottom: 10, color: Colors.warning, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  notice: { padding: 12, marginBottom: 12, borderRadius: 13, backgroundColor: Colors.garmentStudioTop },
  noticeText: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  resultCard: { padding: 16, marginTop: 3, marginBottom: 15, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground },
  resultEyebrow: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  verdict: { marginTop: 4, marginBottom: 8, fontFamily: 'Georgia', fontSize: 29, lineHeight: 35 },
  premiumQuiet: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  resultSection: { marginTop: 10 },
  resultSectionTitle: { color: Colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4 },
  resultLine: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 19 },
  primaryButton: { minHeight: 54, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, borderRadius: 17, backgroundColor: Colors.primary },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: Colors.textOnDark, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  remainingCount: { marginTop: 10, textAlign: 'center', color: Colors.textLight, fontFamily: 'Inter_400Regular', fontSize: 11 },
  quietNote: { marginTop: 10, textAlign: 'center', color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  secondaryUpgrade: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  secondaryUpgradeText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 12 },
  selectionSummary: { marginTop: 13, color: Colors.textLight, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.82 },
});
