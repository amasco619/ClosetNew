import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { wardrobeValueLabel } from '@/constants/wardrobeLabels';
import { rs } from '@/lib/responsive';
import {
  TRAVEL_ACTIVITIES,
  travelCoverage,
  type TravelAccess,
  type TravelActivity,
  type TravelLook,
  type TravelSlot,
} from '@/lib/travelCapsule';
import type { WardrobeItem } from '@/constants/types';
import { GarmentTile } from '@/components/GarmentTile';

const ESSENTIALS = ['Passport/travel documents', 'Chargers', 'Toiletries'] as const;

export interface TravelPlannerViewProps {
  access: TravelAccess;
  message: string | null;
  notice: string | null;
  days: number;
  slots: TravelSlot[];
  selectedSlotId: string | null;
  choices: TravelLook[];
  checklist: WardrobeItem[];
  packedIds: string[];
  essentials: string[];
  onDays: (days: number) => void;
  onAddSlot: (day: number, activity: TravelActivity) => void;
  onSelectSlot: (id: string) => void;
  onRemoveSlot: (id: string) => void;
  onAssign: (key: string, reuse: boolean) => void;
  onClearSlot: (id: string) => void;
  onTogglePacked: (id: string) => void;
  onToggleEssential: (value: string) => void;
  onRetry: () => void;
  onClose: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
}

function garmentName(item: Pick<WardrobeItem, 'subType' | 'colorFamily'>) {
  return [wardrobeValueLabel(item.colorFamily), item.subType]
    .filter((part) => part && part.toLowerCase() !== 'unknown')
    .join(' ')
    .replace(/^./, (first) => first.toUpperCase()) || 'Wardrobe piece';
}

function CheckControl({
  checked,
  label,
  onPress,
  testID,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      aria-checked={checked}
      style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={15} color={Colors.white} />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

export default function TravelPlannerView({
  access,
  message,
  notice,
  days,
  slots,
  selectedSlotId,
  choices,
  checklist,
  packedIds,
  essentials,
  onDays,
  onAddSlot,
  onSelectSlot,
  onRemoveSlot,
  onAssign,
  onClearSlot,
  onTogglePacked,
  onToggleEssential,
  onRetry,
  onClose,
  onSignIn,
  onUpgrade,
}: TravelPlannerViewProps) {
  const insets = useSafeAreaInsets();
  const [activity, setActivity] = useState<TravelActivity>('casual');
  const ready = access === 'ready';
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null;
  const coverage = travelCoverage(slots);
  const totalDays = Math.min(7, Math.max(1, days));
  const statusContent = {
    checking: {
      title: 'Checking your access',
      body: 'One moment while we prepare your travel capsule.',
    },
    loading: {
      title: 'Loading your wardrobe',
      body: 'Your travel capsule will be ready when your wardrobe is available.',
    },
    'sign-in': {
      title: 'Sign in to continue',
      body: 'Travel planning is available when you are signed in.',
    },
    'not-entitled': {
      title: 'A little more access is needed',
      body: 'Travel planning is part of your existing Amodka Premium plan.',
    },
    unavailable: {
      title: 'Travel planning is unavailable',
      body: 'We could not confirm access just now. Please try again.',
    },
    failure: {
      title: 'We could not load your wardrobe',
      body: 'Your travel plan is still private to your wardrobe. Try again.',
    },
  } as const;

  const addActivity = (day: number) => {
    if (slots.length >= 28) return;
    onAddSlot(day, activity);
  };

  const gated = !ready;
  const status = gated ? statusContent[access] : null;
  const retryable = access === 'unavailable' || access === 'failure' || access === 'loading' || access === 'not-entitled';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      accessibilityLabel="Travel capsule planner"
      aria-label="Travel capsule planner"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss travel planner"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>AMODKA · TRAVEL CAPSULE</Text>
              <Text accessibilityRole="header" role="heading" style={styles.title}>
                Plan what to pack
              </Text>
              <Text style={styles.scope}>
                Build a temporary plan from looks in your current wardrobe.
              </Text>
            </View>
            <Pressable
              testID="travel-close"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close travel planner"
            >
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {gated ? (
              <View
                style={styles.statusPanel}
                accessibilityLiveRegion="polite"
                aria-live="polite"
                accessibilityRole={access === 'checking' || access === 'loading' ? 'progressbar' : 'text'}
                accessibilityLabel={`${status?.title}. ${status?.body}`}
              >
                {access === 'checking' || access === 'loading' ? (
                  <View style={styles.loadingMark}>
                    <View style={styles.loadingLine} />
                    <View style={[styles.loadingLine, styles.loadingLineShort]} />
                    <View style={styles.loadingCircle} />
                  </View>
                ) : (
                  <View style={styles.statusIcon}>
                    <Ionicons
                      name={access === 'sign-in' ? 'person-outline' : access === 'not-entitled' ? 'sparkles-outline' : 'refresh-outline'}
                      size={24}
                      color={Colors.secondary}
                    />
                  </View>
                )}
                <Text style={styles.statusTitle}>{status?.title}</Text>
                <Text style={styles.statusBody}>{status?.body}</Text>
                {message && (
                  <Text style={styles.statusMessage} accessibilityLiveRegion="assertive" aria-live="assertive">
                    {message}
                  </Text>
                )}
              </View>
            ) : (
              <>
                <View style={styles.notice}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.noticeText}>
                    This is a temporary draft. It is lost when you dismiss the planner or your session ends.
                  </Text>
                </View>

                <View style={styles.scopeNote}>
                  <Text style={styles.scopeNoteText}>
                    Looks come only from your current wardrobe catalogue. There is no destination forecast,
                    future-day guarantee, or packing optimisation.
                  </Text>
                </View>

                <View style={styles.daysRow}>
                  <View style={styles.sectionHeadingWrap}>
                    <Text accessibilityRole="header" role="heading" style={styles.sectionTitle}>Trip length</Text>
                    <Text style={styles.sectionHint}>Choose 1–7 days</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      testID="travel-days-minus"
                      onPress={() => onDays(Math.max(1, totalDays - 1))}
                      disabled={totalDays <= 1}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease trip length"
                      accessibilityState={{ disabled: totalDays <= 1 }}
                      style={({ pressed }) => [
                        styles.stepButton,
                        totalDays <= 1 && styles.disabledButton,
                        pressed && totalDays > 1 && styles.pressed,
                      ]}
                    >
                      <Ionicons name="remove" size={19} color={totalDays <= 1 ? Colors.textLight : Colors.primary} />
                    </Pressable>
                    <Text style={styles.dayCount} accessibilityLiveRegion="polite">{totalDays}</Text>
                    <Pressable
                      testID="travel-days-plus"
                      onPress={() => onDays(Math.min(7, totalDays + 1))}
                      disabled={totalDays >= 7}
                      accessibilityRole="button"
                      accessibilityLabel="Increase trip length"
                      accessibilityState={{ disabled: totalDays >= 7 }}
                      style={({ pressed }) => [
                        styles.stepButton,
                        totalDays >= 7 && styles.disabledButton,
                        pressed && totalDays < 7 && styles.pressed,
                      ]}
                    >
                      <Ionicons name="add" size={19} color={totalDays >= 7 ? Colors.textLight : Colors.primary} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.coverage} accessibilityLiveRegion="polite" aria-live="polite">
                  <View style={styles.coverageMark}>
                    <Ionicons name="briefcase-outline" size={17} color={Colors.primary} />
                  </View>
                  <View style={styles.coverageCopy}>
                    <Text style={styles.coverageTitle}>Capsule coverage</Text>
                    <Text style={styles.coverageBody}>
                      {coverage.planned} of {coverage.total} activities have a look
                    </Text>
                  </View>
                  <Text style={styles.coverageCount}>{coverage.planned}/{coverage.total}</Text>
                </View>

                {Array.from({ length: totalDays }, (_, index) => {
                  const day = index + 1;
                  const daySlots = slots.filter((slot) => slot.day === day);
                  return (
                    <View key={day} style={styles.dayBlock}>
                      <View style={styles.dayHeader}>
                        <View style={styles.dayNumber}><Text style={styles.dayNumberText}>{String(day).padStart(2, '0')}</Text></View>
                        <Text accessibilityRole="header" role="heading" style={styles.dayTitle}>Day {day}</Text>
                        <Text style={styles.dayMeta}>{daySlots.length} {daySlots.length === 1 ? 'activity' : 'activities'}</Text>
                      </View>

                      <Text style={styles.smallLabel}>ADD AN ACTIVITY</Text>
                      <View style={styles.activityList}>
                        {TRAVEL_ACTIVITIES.map((option) => {
                          const selected = activity === option.id;
                          return (
                            <Pressable
                              key={option.id}
                              testID={`travel-activity-${option.id}-${day}`}
                              onPress={() => setActivity(option.id)}
                              accessibilityRole="radio"
                              accessibilityLabel={option.label}
                              accessibilityState={{ checked: selected }}
                              aria-checked={selected}
                              style={({ pressed }) => [
                                styles.activityChip,
                                selected && styles.activityChipSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.activityText, selected && styles.activityTextSelected]}>{option.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Pressable
                        testID={`travel-add-${day}`}
                        onPress={() => addActivity(day)}
                        disabled={slots.length >= 28}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${TRAVEL_ACTIVITIES.find((option) => option.id === activity)?.label ?? 'activity'} to day ${day}`}
                        accessibilityState={{ disabled: slots.length >= 28 }}
                        style={({ pressed }) => [
                          styles.addButton,
                          slots.length >= 28 && styles.disabledButton,
                          pressed && slots.length < 28 && styles.pressed,
                        ]}
                      >
                        <Ionicons name="add-circle-outline" size={18} color={slots.length >= 28 ? Colors.textLight : Colors.primary} />
                        <Text style={[styles.addButtonText, slots.length >= 28 && styles.disabledText]}>Add activity</Text>
                      </Pressable>

                      {daySlots.map((slot) => {
                        const current = selectedSlotId === slot.id;
                        const activityLabel = TRAVEL_ACTIVITIES.find((option) => option.id === slot.activity)?.label ?? slot.activity;
                        const unsupported = slot.activity === 'other';
                        const assignedItems = slot.look?.outfit.components ?? [];
                        return (
                          <View key={slot.id} style={[styles.slotCard, current && styles.slotCardSelected]}>
                            <Pressable
                              testID={`travel-slot-${slot.id}`}
                              onPress={() => onSelectSlot(slot.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Select day ${day}, ${activityLabel}${slot.look ? ', look assigned' : ', unfilled'}`}
                              accessibilityState={{ selected: current }}
                              style={({ pressed }) => [styles.slotTop, pressed && styles.pressed]}
                            >
                              <View style={styles.slotCopy}>
                                <Text style={styles.slotTitle}>{activityLabel}</Text>
                                <Text style={styles.slotState}>
                                  {slot.look ? 'Look selected' : unsupported ? 'Unsupported activity · no look available' : 'Choose a look'}
                                </Text>
                              </View>
                              {slot.look ? (
                                <View style={styles.selectedMark}><Ionicons name="checkmark" size={15} color={Colors.white} /></View>
                              ) : (
                                <Ionicons name="chevron-forward" size={17} color={Colors.textLight} />
                              )}
                            </Pressable>
                            {slot.look && (
                              <>
                                <View style={styles.garmentStrip}>
                                  {assignedItems.map((component, componentIndex) => (
                                    <View key={`${component.matchedItemId ?? componentIndex}`} style={styles.garment}>
                                      {component.photoUri ? (
                                        <GarmentTile
                                          uri={component.photoUri}
                                          variant="card"
                                          style={styles.garmentPhoto}
                                          accessibilityLabel="Garment in selected travel look"
                                        />
                                      ) : (
                                        <View style={styles.photoPlaceholder}>
                                          <Ionicons name="shirt-outline" size={16} color={Colors.textLight} />
                                        </View>
                                      )}
                                      <Text style={styles.garmentName} numberOfLines={2}>
                                        {garmentName(component)}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                                {slot.look.notice && <Text style={styles.disclosure}>{slot.look.notice}</Text>}
                                {slot.look.disclosures.map((disclosure, index) => (
                                  <Text key={index} style={styles.disclosure}>{disclosure}</Text>
                                ))}
                                <View style={styles.slotActions}>
                                  <Pressable
                                    testID={`travel-clear-${slot.id}`}
                                    onPress={() => onClearSlot(slot.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Clear look from day ${day}, ${activityLabel}`}
                                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
                                  >
                                    <Text style={styles.textActionLabel}>Clear look</Text>
                                  </Pressable>
                                  <Pressable
                                    testID={`travel-remove-${slot.id}`}
                                    onPress={() => onRemoveSlot(slot.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${activityLabel} from day ${day}`}
                                    style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
                                  >
                                    <Ionicons name="trash-outline" size={15} color={Colors.error} />
                                    <Text style={styles.removeLabel}>Remove</Text>
                                  </Pressable>
                                </View>
                              </>
                            )}
                            {!slot.look && (
                              <Pressable
                                testID={`travel-remove-${slot.id}`}
                                onPress={() => onRemoveSlot(slot.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${activityLabel} from day ${day}`}
                                style={({ pressed }) => [styles.removeEmpty, pressed && styles.pressed]}
                              >
                                <Ionicons name="trash-outline" size={15} color={Colors.error} />
                                <Text style={styles.removeLabel}>Remove activity</Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}

                {selectedSlot && (
                  <View style={styles.choicesSection}>
                    <Text style={styles.smallLabel}>LOOKS FOR YOUR SELECTION</Text>
                    <Text accessibilityRole="header" role="heading" style={styles.sectionTitle}>
                      {TRAVEL_ACTIVITIES.find((option) => option.id === selectedSlot.activity)?.label ?? 'Activity'} · Day {selectedSlot.day}
                    </Text>
                    {selectedSlot.activity === 'other' ? (
                      <View style={styles.emptyPanel}>
                        <Text style={styles.emptyTitle}>This activity is unsupported</Text>
                        <Text style={styles.emptyText}>It stays unfilled. Choose a supported activity to see available wardrobe looks.</Text>
                      </View>
                    ) : choices.length === 0 ? (
                      <View style={styles.emptyPanel}>
                        <Text style={styles.emptyTitle}>No current wardrobe looks</Text>
                        <Text style={styles.emptyText}>This activity remains unfilled; an empty slot is not a wardrobe-gap assessment.</Text>
                      </View>
                    ) : choices.map((look, index) => {
                      const alreadyAssigned = slots.some((slot) => slot.id !== selectedSlot.id && slot.look?.key === look.key);
                      return (
                        <View key={`${look.key}-${index}`} style={styles.choiceCard}>
                          <Text style={styles.choiceTitle}>{look.outfit.rationale || `Wardrobe look ${index + 1}`}</Text>
                          <View style={styles.garmentStrip}>
                            {look.outfit.components.map((component, componentIndex) => (
                              <View key={`${component.matchedItemId ?? componentIndex}`} style={styles.garment}>
                                {component.photoUri ? (
                                  <GarmentTile
                                    uri={component.photoUri}
                                    variant="card"
                                    style={styles.garmentPhoto}
                                    accessibilityLabel="Garment in selected travel look"
                                  />
                                ) : (
                                  <View style={styles.photoPlaceholder}>
                                    <Ionicons name="shirt-outline" size={16} color={Colors.textLight} />
                                  </View>
                                )}
                                <Text style={styles.garmentName} numberOfLines={2}>{garmentName(component)}</Text>
                              </View>
                            ))}
                          </View>
                          {look.disclosures.map((disclosure, disclosureIndex) => (
                            <Text key={`${disclosureIndex}-${disclosure}`} style={styles.disclosure}>{disclosure}</Text>
                          ))}
                          <Pressable
                            testID={`travel-choice-${index}`}
                            onPress={() => onAssign(look.key, alreadyAssigned)}
                            accessibilityRole="button"
                            accessibilityLabel={alreadyAssigned ? `Reuse this look, option ${index + 1}` : `Choose this look, option ${index + 1}`}
                            style={({ pressed }) => [styles.chooseButton, pressed && styles.primaryPressed]}
                          >
                            <Text style={styles.chooseButtonText}>{alreadyAssigned ? 'Reuse this look' : 'Choose this look'}</Text>
                            <Ionicons name={alreadyAssigned ? 'copy-outline' : 'arrow-forward'} size={16} color={Colors.white} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={styles.checklistSection}>
                  <Text style={styles.smallLabel}>PACKING CHECKLIST</Text>
                  <Text accessibilityRole="header" role="heading" style={styles.sectionTitle}>Pieces in your plan</Text>
                  <Text style={styles.sectionHint}>Only garments used by selected looks appear here.</Text>
                  {checklist.length === 0 ? (
                    <View style={styles.emptyPanel}>
                      <Text style={styles.emptyTitle}>No planned pieces yet</Text>
                      <Text style={styles.emptyText}>Choose a look to build a checklist from your owned garments.</Text>
                    </View>
                  ) : (
                    <View style={styles.checklist}>
                      {checklist.map((item) => (
                        <View key={item.id} style={styles.checklistItem}>
                          {item.photoUri ? (
                            <GarmentTile
                              uri={item.photoUri}
                              storagePath={item.storagePath}
                              colorFamily={item.colorFamily}
                              variant="list"
                              style={styles.checklistPhoto}
                              accessibilityLabel={`${wardrobeValueLabel(item.colorFamily)} ${item.subType} packed garment`}
                            />
                          ) : (
                            <View style={[styles.checklistPhoto, styles.photoPlaceholder]}>
                              <Ionicons name="shirt-outline" size={17} color={Colors.textLight} />
                            </View>
                          )}
                          <CheckControl
                            testID={`travel-packed-${item.id}`}
                            checked={packedIds.includes(item.id)}
                            label={`Pack ${garmentName(item)}`}
                            onPress={() => onTogglePacked(item.id)}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.checklistSection}>
                  <Text style={styles.smallLabel}>OPTIONAL ESSENTIALS</Text>
                  <Text accessibilityRole="header" role="heading" style={styles.sectionTitle}>Beyond your wardrobe</Text>
                  <Text style={styles.sectionHint}>These reminders are separate from owned garments.</Text>
                  <View style={styles.essentialsList}>
                    {ESSENTIALS.map((essential, index) => (
                      <CheckControl
                        key={essential}
                        testID={`travel-essential-${index}`}
                        checked={essentials.includes(essential)}
                        label={essential}
                        onPress={() => onToggleEssential(essential)}
                      />
                    ))}
                  </View>
                </View>

                {notice && (
                  <View style={styles.traditionalNotice} accessibilityLiveRegion="polite" aria-live="polite">
                    <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                    <Text style={styles.noticeText}>{notice}</Text>
                  </View>
                )}
                {message && (
                  <View style={styles.errorPanel} accessibilityLiveRegion="assertive" aria-live="assertive">
                    <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                    <Text style={styles.errorText}>{message}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {gated && (
            <View style={styles.footer}>
              {access === 'sign-in' && (
                <Pressable
                  onPress={onSignIn}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
                >
                  <Text style={styles.primaryText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={17} color={Colors.white} />
                </Pressable>
              )}
              {access === 'not-entitled' && (
                <Pressable
                  onPress={onUpgrade}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
                >
                  <Text style={styles.primaryText}>Explore Amodka Premium</Text>
                  <Ionicons name="arrow-forward" size={17} color={Colors.white} />
                </Pressable>
              )}
              {retryable && (
                <Pressable
                  testID="travel-retry"
                  onPress={onRetry}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
                >
                  <Text style={styles.primaryText}>{access === 'not-entitled' ? 'Check access again' : 'Try again'}</Text>
                  <Ionicons name="refresh-outline" size={17} color={Colors.white} />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  sheet: {
    maxHeight: '96%',
    minHeight: 360,
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 18,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: 'Inter_500Medium', fontSize: rs(10), letterSpacing: 1.1, color: Colors.textSecondary, marginBottom: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: rs(25), lineHeight: rs(31), letterSpacing: -0.7, color: Colors.textPrimary },
  scope: { marginTop: 5, fontFamily: 'Inter_400Regular', fontSize: rs(13), lineHeight: rs(19), color: Colors.textSecondary },
  closeButton: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 14, gap: 14 },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 14,
    backgroundColor: Colors.secondary + '20', borderWidth: 1, borderColor: Colors.glassBorder,
  },
  noticeText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: rs(11), lineHeight: rs(16), color: Colors.textPrimary },
  scopeNote: { paddingHorizontal: 2 },
  scopeNoteText: { fontFamily: 'Inter_400Regular', fontSize: rs(11), lineHeight: rs(16), color: Colors.textSecondary },
  daysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionHeadingWrap: { flex: 1 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), lineHeight: rs(22), color: Colors.textPrimary },
  sectionHint: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: rs(11), lineHeight: rs(16), color: Colors.textSecondary },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 9, padding: 4,
    borderRadius: 16, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
  },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.background },
  dayCount: { minWidth: 20, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: rs(17), color: Colors.primary },
  coverage: {
    flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16,
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
  },
  coverageMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary + '25' },
  coverageCopy: { flex: 1 },
  coverageTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.textPrimary },
  coverageBody: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary },
  coverageCount: { fontFamily: 'Inter_700Bold', fontSize: rs(14), color: Colors.primary },
  dayBlock: { gap: 9, paddingTop: 13, borderTopWidth: 1, borderTopColor: Colors.border },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 3 },
  dayNumber: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  dayNumberText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(10), letterSpacing: 0.4, color: Colors.white },
  dayTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.textPrimary },
  dayMeta: { fontFamily: 'Inter_400Regular', fontSize: rs(11), color: Colors.textSecondary },
  smallLabel: { fontFamily: 'Inter_500Medium', fontSize: rs(9), letterSpacing: 1, color: Colors.textLight },
  activityList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  activityChip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 13,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  activityChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  activityText: { fontFamily: 'Inter_500Medium', fontSize: rs(11), color: Colors.textSecondary },
  activityTextSelected: { color: Colors.white },
  addButton: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.secondary, backgroundColor: Colors.secondary + '12',
  },
  addButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.primary },
  slotCard: { padding: 11, borderRadius: 16, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border },
  slotCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '0D' },
  slotTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotCopy: { flex: 1 },
  slotTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), color: Colors.textPrimary },
  slotState: { marginTop: 3, fontFamily: 'Inter_400Regular', fontSize: rs(10), lineHeight: rs(14), color: Colors.textSecondary },
  selectedMark: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  garmentStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingTop: 9 },
  garment: { width: 75, alignItems: 'center', gap: 4 },
  garmentPhoto: { width: 64, height: 66, borderRadius: 12, backgroundColor: Colors.background },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  garmentName: { width: '100%', textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: rs(9), lineHeight: rs(12), color: Colors.textSecondary },
  slotActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 3 },
  textAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  textActionLabel: { fontFamily: 'Inter_500Medium', fontSize: rs(11), color: Colors.textSecondary },
  removeLabel: { fontFamily: 'Inter_500Medium', fontSize: rs(11), color: Colors.error },
  removeEmpty: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingHorizontal: 4 },
  choicesSection: { gap: 9, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  choiceCard: { padding: 13, borderRadius: 17, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border, gap: 9 },
  choiceTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(13), lineHeight: rs(18), color: Colors.textPrimary },
  disclosure: { fontFamily: 'Inter_400Regular', fontSize: rs(10), lineHeight: rs(15), color: Colors.textSecondary },
  chooseButton: {
    minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 13, backgroundColor: Colors.primary,
  },
  chooseButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.white },
  checklistSection: { gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  checklist: { gap: 7 },
  checklistItem: {
    minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 7, borderRadius: 14,
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border,
  },
  checklistPhoto: { width: 44, height: 46, borderRadius: 10, backgroundColor: Colors.background },
  checkRow: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.textLight, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cardBackground },
  checkboxChecked: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  checkLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: rs(12), lineHeight: rs(17), color: Colors.textPrimary },
  essentialsList: { paddingHorizontal: 10, borderRadius: 15, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border },
  emptyPanel: { padding: 15, borderRadius: 15, backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(12), color: Colors.textPrimary },
  emptyText: { marginTop: 4, fontFamily: 'Inter_400Regular', fontSize: rs(11), lineHeight: rs(16), color: Colors.textSecondary },
  traditionalNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.sage + '20' },
  errorPanel: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14, backgroundColor: Colors.error + '14' },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: rs(11), lineHeight: rs(16), color: Colors.error },
  statusPanel: {
    minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 26,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.cardBackground,
  },
  loadingMark: { width: 52, height: 52, borderRadius: 17, justifyContent: 'center', paddingHorizontal: 12, gap: 5, backgroundColor: Colors.secondary + '25', marginBottom: 17, position: 'relative' },
  loadingLine: { height: 3, borderRadius: 2, width: 24, backgroundColor: Colors.secondary },
  loadingLineShort: { width: 17, opacity: 0.6 },
  loadingCircle: { position: 'absolute', right: 9, top: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
  statusIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondary + '25', marginBottom: 17 },
  statusTitle: { fontFamily: 'Inter_600SemiBold', fontSize: rs(16), color: Colors.textPrimary, textAlign: 'center' },
  statusBody: { marginTop: 7, fontFamily: 'Inter_400Regular', fontSize: rs(13), lineHeight: rs(19), color: Colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  statusMessage: { marginTop: 10, fontFamily: 'Inter_500Medium', fontSize: rs(11), lineHeight: rs(16), color: Colors.error, textAlign: 'center' },
  footer: { paddingTop: 12, gap: 8 },
  primaryButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, borderRadius: 14, backgroundColor: Colors.primary },
  primaryText: { fontFamily: 'Inter_600SemiBold', fontSize: rs(14), color: Colors.white },
  disabledButton: { opacity: 0.5 },
  disabledText: { color: Colors.textLight },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  primaryPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
