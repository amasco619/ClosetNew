import { useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import {
  getRefinementCounts,
} from '@/lib/profilePresentation';
import { useApp } from '@/contexts/AppContext';
import type {
  ContrastLevel,
  FaceShape,
  HairColor,
  HeightBand,
  Industry,
  LifePhase,
  MetalPreference,
  MoodGoal,
} from '@/constants/types';
import { LIFESTYLE_OPTIONS, LIFESTYLE_SCENARIOS, type LifestyleKey } from '@/constants/lifestyle';

type RefinementGroup = 'physical' | 'style' | 'lifestyle';

const HAIR_OPTS: { id: HairColor; label: string }[] = [
  { id: 'black', label: 'Black' }, { id: 'dark-brown', label: 'Dark Brown' },
  { id: 'medium-brown', label: 'Med Brown' }, { id: 'light-brown', label: 'Light Brown' },
  { id: 'blonde', label: 'Blonde' }, { id: 'red', label: 'Red' },
  { id: 'grey', label: 'Grey' }, { id: 'silver', label: 'Silver' },
];
const HEIGHT_OPTS: { id: HeightBand; label: string }[] = [
  { id: 'petite', label: 'Petite' }, { id: 'average', label: 'Average' }, { id: 'tall', label: 'Tall' },
];
const FACE_SHAPE_OPTS: { id: FaceShape; label: string }[] = [
  { id: 'oval', label: 'Oval' }, { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' }, { id: 'heart', label: 'Heart' }, { id: 'oblong', label: 'Oblong' },
];
const CONTRAST_OPTS: { id: ContrastLevel; label: string }[] = [
  { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' },
];
const METAL_OPTS: { id: MetalPreference; label: string }[] = [
  { id: 'gold', label: 'Gold' }, { id: 'silver', label: 'Silver' },
  { id: 'rose-gold', label: 'Rose Gold' }, { id: 'mixed', label: 'Mixed' },
];
const MOOD_OPTS: { id: MoodGoal; label: string }[] = [
  { id: 'confident', label: 'Confident' }, { id: 'soft', label: 'Soft' },
  { id: 'joyful', label: 'Joyful' }, { id: 'grounded', label: 'Grounded' },
  { id: 'romantic', label: 'Romantic' }, { id: 'powerful', label: 'Powerful' },
];
const INDUSTRY_OPTS: { id: Industry; label: string }[] = [
  { id: 'creative', label: 'Creative' }, { id: 'tech', label: 'Tech' },
  { id: 'corporate', label: 'Corporate' }, { id: 'unspecified', label: 'Other' },
];
const LIFE_PHASE_OPTS: { id: LifePhase; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'pregnancy', label: 'Pregnancy' },
  { id: 'postpartum', label: 'Postpartum' }, { id: 'weight-flux', label: 'Weight flux' },
  { id: 'feeling-off', label: 'Feeling off' },
];
const AVERSION_OPTS = ['yellow', 'orange', 'neon', 'pink', 'red', 'green', 'brown', 'purple'];
const LIFESTYLE_DEFAULTS: Record<LifestyleKey, number> = {
  work: 40, casual: 40, events: 20, active: 0, brunch: 0,
};

function RefinementChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      hitSlop={2}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.chipActive : styles.chipInactive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function RefinementsScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { profile, updateProfile } = useApp();
  const counts = getRefinementCounts(profile);
  const [openGroup, setOpenGroup] = useState<RefinementGroup | null>(() => {
    if (counts.physical < 3) return 'physical';
    if (counts.style < 6) return 'style';
    if (counts.lifestyle < 4) return 'lifestyle';
    return null;
  });
  const colorAversions = profile.constraints.colorAversions ?? [];
  const allLifestyleZero = LIFESTYLE_SCENARIOS.every(scenario => {
    const key = `lifestyle${scenario.key[0].toUpperCase()}${scenario.key.slice(1)}` as keyof typeof profile;
    return ((profile[key] as number | undefined) ?? 0) === 0;
  });

  const toggleGroup = (group: RefinementGroup) => {
    if (!reduceMotion) {
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: 'easeOut', property: 'opacity' },
        update: { type: 'easeOut', property: 'scaleY' },
        delete: { type: 'easeOut', property: 'opacity' },
      });
    }
    void Haptics.selectionAsync();
    setOpenGroup(current => current === group ? null : group);
  };

  const renderGroupHeader = (
    group: RefinementGroup,
    title: string,
    count: number,
    total: number,
    divider = false,
  ) => {
    const expanded = openGroup === group;
    return (
      <View key={group}>
        {divider && <View style={styles.divider} />}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => toggleGroup(group)}
          style={styles.groupHeader}
        >
          <Text style={styles.groupTitle}>{title}</Text>
          <View style={styles.groupMeta}>
            <Text style={styles.groupCount}>{`${count} / ${total}`}</Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textSecondary}
            />
          </View>
        </Pressable>
      </View>
    );
  };

  const renderChipRow = (children: React.ReactNode) => (
    <View style={styles.chipRow}>{children}</View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Refinements</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.intro}>Optional — sharpen every recommendation across your wardrobe.</Text>
        <View style={styles.card}>
          {renderGroupHeader('physical', 'Physical', counts.physical, 3)}
          {openGroup === 'physical' && (
            <View style={styles.groupContent}>
              <Text style={styles.fieldLabel}>Hair colour</Text>
              {renderChipRow(HAIR_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.hairColor === option.id}
                  onPress={() => updateProfile({
                    hairColor: profile.hairColor === option.id ? null : option.id,
                  })}
                />
              )))}
              <Text style={styles.fieldLabel}>Height</Text>
              {renderChipRow(HEIGHT_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.heightBand === option.id}
                  onPress={() => updateProfile({
                    heightBand: profile.heightBand === option.id ? null : option.id,
                  })}
                />
              )))}
              <Text style={styles.fieldLabel}>Face shape</Text>
              <Text style={styles.helper}>Influences neckline recommendations.</Text>
              {renderChipRow(FACE_SHAPE_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.faceShape === option.id}
                  onPress={() => updateProfile({
                    faceShape: profile.faceShape === option.id ? null : option.id,
                  })}
                />
              )))}
            </View>
          )}

          {renderGroupHeader('style', 'Style', counts.style, 6, true)}
          {openGroup === 'style' && (
            <View style={styles.groupContent}>
              <Text style={styles.fieldLabel}>Contrast level</Text>
              {renderChipRow(CONTRAST_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.contrastLevel === option.id}
                  onPress={() => updateProfile({
                    contrastLevel: profile.contrastLevel === option.id ? null : option.id,
                  })}
                />
              )))}
              <Text style={styles.fieldLabel}>Metal preference</Text>
              {renderChipRow(METAL_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.metalPreference === option.id}
                  onPress={() => updateProfile({
                    metalPreference: profile.metalPreference === option.id ? null : option.id,
                  })}
                />
              )))}
              <Text style={styles.fieldLabel}>Colours to avoid</Text>
              {renderChipRow(AVERSION_OPTS.map(color => {
                const active = colorAversions.includes(color);
                return (
                  <RefinementChip
                    key={color}
                    label={color[0].toUpperCase() + color.slice(1)}
                    active={active}
                    onPress={() => updateProfile({
                      constraints: {
                        ...profile.constraints,
                        colorAversions: active
                          ? colorAversions.filter(item => item !== color)
                          : [...colorAversions, color],
                      },
                    })}
                  />
                );
              }))}
              <PreferenceSwitch
                label="No sleeveless"
                value={profile.constraints.noSleeveless}
                onValueChange={value => updateProfile({
                  constraints: { ...profile.constraints, noSleeveless: value },
                })}
              />
              <PreferenceSwitch
                label="No short skirts"
                value={profile.constraints.noShortSkirts}
                onValueChange={value => updateProfile({
                  constraints: { ...profile.constraints, noShortSkirts: value },
                })}
                divider
              />
              <Text style={styles.fieldLabel}>Max heel height</Text>
              {renderChipRow((['any', 'medium', 'low', 'flat'] as const).map(height => (
                <RefinementChip
                  key={height}
                  label={height[0].toUpperCase() + height.slice(1)}
                  active={profile.constraints.maxHeelHeight === height}
                  onPress={() => updateProfile({
                    constraints: { ...profile.constraints, maxHeelHeight: height },
                  })}
                />
              )))}
            </View>
          )}

          {renderGroupHeader('lifestyle', 'Lifestyle', counts.lifestyle, 4, true)}
          {openGroup === 'lifestyle' && (
            <View style={styles.groupContent}>
              <Text style={styles.fieldLabel}>Lifestyle mix</Text>
              <Text style={styles.helper}>How often do you dress for each occasion?</Text>
              {LIFESTYLE_SCENARIOS.map(scenario => {
                const profileKey = `lifestyle${scenario.key[0].toUpperCase()}${scenario.key.slice(1)}` as keyof typeof profile;
                const current = (profile[profileKey] as number | undefined) ?? LIFESTYLE_DEFAULTS[scenario.key];
                return (
                  <View key={scenario.key} style={styles.scenarioRow}>
                    <Text style={styles.scenarioTitle}>{scenario.label}</Text>
                    <Text style={styles.helper}>{scenario.desc}</Text>
                    {renderChipRow(LIFESTYLE_OPTIONS.map(option => (
                      <RefinementChip
                        key={option.value}
                        label={option.label}
                        active={current === option.value}
                        onPress={() => updateProfile({
                          [`lifestyle${scenario.key[0].toUpperCase()}${scenario.key.slice(1)}`]: option.value,
                        })}
                      />
                    )))}
                  </View>
                );
              })}
              {allLifestyleZero && (
                <Text style={styles.helper}>At least one scenario needs a value to personalise your outfits.</Text>
              )}
              <Text style={styles.fieldLabel}>Default mood</Text>
              {renderChipRow(MOOD_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.defaultMood === option.id}
                  onPress={() => updateProfile({
                    defaultMood: profile.defaultMood === option.id ? null : option.id,
                  })}
                />
              )))}
              <Text style={styles.fieldLabel}>Industry</Text>
              {renderChipRow(INDUSTRY_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={(profile.industry ?? 'unspecified') === option.id}
                  onPress={() => updateProfile({ industry: option.id })}
                />
              )))}
              <Text style={styles.fieldLabel}>Life phase</Text>
              {renderChipRow(LIFE_PHASE_OPTS.map(option => (
                <RefinementChip
                  key={option.id}
                  label={option.label}
                  active={profile.lifePhase === option.id}
                  onPress={() => updateProfile({
                    lifePhase: profile.lifePhase === option.id ? null : option.id,
                  })}
                />
              )))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function PreferenceSwitch({
  label,
  value,
  onValueChange,
  divider = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  divider?: boolean;
}) {
  return (
    <View style={[styles.switchRow, divider && styles.switchDivider]}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        value={value}
        onValueChange={next => { void Haptics.selectionAsync(); onValueChange(next); }}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        trackColor={{ true: Colors.primary, false: Colors.border }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    minHeight: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
  },
  headerSpacer: { width: 44 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32 },
  intro: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    paddingTop: 8,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    minHeight: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupTitle: {
    flex: 1,
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupCount: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  groupContent: { paddingHorizontal: 20, paddingBottom: 18 },
  divider: { height: 1, marginHorizontal: 20, backgroundColor: Colors.border },
  fieldLabel: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  helper: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipInactive: { backgroundColor: 'transparent', borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  chipTextActive: { color: Colors.white },
  pressed: { opacity: 0.72 },
  scenarioRow: {
    paddingTop: 14,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  scenarioTitle: {
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    marginBottom: 3,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
    paddingVertical: 6,
  },
  switchDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  switchLabel: { flex: 1, color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 15 },
});
