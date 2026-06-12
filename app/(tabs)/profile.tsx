import { StyleSheet, Text, View, ScrollView, Pressable, Switch, Platform, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import type { HairColor, HeightBand, ContrastLevel, MetalPreference, MoodGoal, LifePhase, Industry, FaceShape } from '@/constants/types';
import { useEffect, useRef, useState } from 'react';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import CollapsibleSection from '@/components/CollapsibleSection';
import * as Haptics from 'expo-haptics';

const HAIR_OPTS: { id: HairColor; label: string }[] = [
  { id: 'black', label: 'Black' }, { id: 'dark-brown', label: 'Dark Brown' },
  { id: 'medium-brown', label: 'Med Brown' }, { id: 'light-brown', label: 'Light Brown' },
  { id: 'blonde', label: 'Blonde' }, { id: 'red', label: 'Red' },
  { id: 'grey', label: 'Grey' }, { id: 'silver', label: 'Silver' },
];
const HEIGHT_OPTS: { id: HeightBand; label: string }[] = [
  { id: 'petite', label: 'Petite' }, { id: 'average', label: 'Average' }, { id: 'tall', label: 'Tall' },
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
const AVERSION_OPTS: string[] = ['yellow', 'orange', 'neon', 'pink', 'red', 'green', 'brown', 'purple'];
const FACE_SHAPE_OPTS: { id: FaceShape; label: string }[] = [
  { id: 'oval', label: 'Oval' }, { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' }, { id: 'heart', label: 'Heart' }, { id: 'oblong', label: 'Oblong' },
];

const bodyTypeLabels: Record<string, string> = {
  hourglass: 'Hourglass', pear: 'Pear', apple: 'Apple',
  rectangle: 'Rectangle', 'inverted-triangle': 'Inv. Triangle', athletic: 'Athletic',
};
const eyeColorLabels: Record<string, string> = {
  'dark-brown': 'Dark Brown', 'light-brown': 'Light Brown', hazel: 'Hazel',
  green: 'Green', blue: 'Blue', grey: 'Grey',
};
const skinToneLabels: Record<string, string> = {
  'very-light': 'Very Light', light: 'Light', 'medium-light': 'Med Light',
  medium: 'Medium', 'medium-dark': 'Med Dark', dark: 'Dark', 'very-dark': 'Very Dark',
};
const undertoneLabels: Record<string, string> = { cool: 'Cool', neutral: 'Neutral', warm: 'Warm' };
const styleGoalLabels: Record<string, string> = {
  youthful: 'Youthful', elevated: 'Elevated', minimal: 'Minimal',
  romantic: 'Romantic', bold: 'Bold', classic: 'Classic',
};

function Chip({ label, active, onPress, accent }: {
  label: string; active: boolean; onPress: () => void; accent?: 'sage' | 'blush';
}) {
  const bg = active
    ? (accent === 'sage' ? Colors.sage : accent === 'blush' ? Colors.blush : Colors.primary)
    : Colors.background;
  const border = active
    ? (accent === 'sage' ? Colors.sage : accent === 'blush' ? Colors.blush : Colors.primary)
    : Colors.border;
  const color = active ? Colors.white : Colors.textSecondary;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.chip, { backgroundColor: bg, borderColor: border },
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <View style={styles.sectionHeaderBlock}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingRow({ icon, label, value, tint, onPress, last }: {
  icon: string; label: string; value: string; tint?: string; onPress?: () => void; last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, !last && styles.settingRowBorder, pressed && onPress && { opacity: 0.7 }]}
    >
      <View style={[styles.settingIcon, { backgroundColor: (tint || Colors.secondary) + '18' }]}>
        <Ionicons name={icon as any} size={17} color={tint || Colors.secondary} />
      </View>
      <View style={styles.settingBody}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingValue} numberOfLines={1}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={14} color={Colors.border} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {
    profile, updateProfile, wardrobeItems, isPremium, wearHistory,
    affinityActive, affinitySignalCount, topAffinityItems, topAffinityPairs,
    weather, setWeatherEnabled,
  } = useApp();
  const [showAffinityDebug, setShowAffinityDebug] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name || '');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email || data?.user?.user_metadata?.email || null;
      if (email) setUserEmail(email);
    }).catch(() => {});
  }, []);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) updateProfile({ name: trimmed });
    setEditingName(false);
  };

  const itemById = (id: string) => wardrobeItems.find(w => w.id === id);
  const itemLabel = (id: string) => {
    const it = itemById(id);
    if (!it) return 'Removed item';
    return `${it.colorFamily} ${it.subType.replace(/-/g, ' ')}`;
  };
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [refinementsY, setRefinementsY] = useState<number | null>(null);
  const effectiveTempUnit = profile.tempUnit ?? defaultTempUnit();
  const colorAversions = profile.constraints.colorAversions ?? [];

  const physicalSet = [profile.hairColor, profile.heightBand, profile.faceShape].filter(Boolean).length;
  const styleSetCount = [
    profile.contrastLevel, profile.metalPreference,
    colorAversions.length > 0 ? 'yes' : null,
    profile.constraints.noSleeveless ? 'yes' : null,
    profile.constraints.noShortSkirts ? 'yes' : null,
    profile.constraints.maxHeelHeight !== 'any' ? 'yes' : null,
  ].filter(Boolean).length;
  const lifestyleSetCount = [
    profile.defaultMood,
    (profile.industry && profile.industry !== 'unspecified') ? profile.industry : null,
    (profile.lifePhase && profile.lifePhase !== 'none') ? profile.lifePhase : null,
  ].filter(Boolean).length;

  useEffect(() => {
    if (focus === 'refinements' && refinementsY != null) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, refinementsY - 12), animated: true });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [focus, refinementsY]);

  const initials = profile.name?.trim()
    ? profile.name.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : null;

  const dnaItems = [
    profile.bodyType ? { label: bodyTypeLabels[profile.bodyType], color: Colors.secondary + '30', text: Colors.secondary } : null,
    profile.eyeColor ? { label: eyeColorLabels[profile.eyeColor], color: Colors.sage + '25', text: Colors.sage } : null,
    profile.skinTone ? { label: `${skinToneLabels[profile.skinTone]} · ${undertoneLabels[profile.undertone || ''] || ''}`, color: Colors.blush + '50', text: '#b07a80' } : null,
    profile.styleGoalPrimary ? { label: styleGoalLabels[profile.styleGoalPrimary], color: Colors.primary + '12', text: Colors.primary } : null,
    profile.styleGoalSecondary ? { label: styleGoalLabels[profile.styleGoalSecondary], color: Colors.primary + '08', text: Colors.textSecondary } : null,
  ].filter(Boolean) as { label: string; color: string; text: string }[];

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Hero Header ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.hero}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={saveName}
                placeholder="Your name"
                placeholderTextColor={Colors.textLight}
              />
              <TouchableOpacity onPress={saveName} hitSlop={8}>
                <Ionicons name="checkmark-circle" size={26} color={Colors.secondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={26} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => { setNameInput(profile.name || ''); setEditingName(true); }}
                activeOpacity={0.8}
                style={styles.avatarWrap}
              >
                <View style={styles.avatarCircle}>
                  {initials
                    ? <Text style={styles.avatarInitials}>{initials}</Text>
                    : <MaterialCommunityIcons name="hanger" size={30} color={Colors.secondary} />}
                </View>
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="pencil" size={10} color={Colors.white} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setNameInput(profile.name || ''); setEditingName(true); }}
                activeOpacity={0.8}
                style={styles.nameRow}
              >
                <Text style={styles.heroName}>{profile.name || 'Style Explorer'}</Text>
                <Ionicons name="pencil-outline" size={13} color={Colors.textLight} style={{ marginLeft: 5 }} />
              </TouchableOpacity>
            </>
          )}
          {userEmail ? <Text style={styles.heroEmail}>{userEmail}</Text> : null}
          <View style={[styles.tierBadge, isPremium && styles.tierBadgePremium]}>
            {isPremium && <Ionicons name="star" size={11} color={Colors.secondary} style={{ marginRight: 4 }} />}
            <Text style={[styles.tierBadgeText, isPremium && styles.tierBadgeTextPremium]}>
              {isPremium ? 'Premium Member' : 'Free Plan'}
            </Text>
          </View>
        </Animated.View>

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100).duration(280)} style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statNum}>{wardrobeItems.length}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statNum}>{new Set(wardrobeItems.map(i => i.category)).size}</Text>
            <Text style={styles.statLabel}>Categories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statNum}>{wearHistory.length}</Text>
            <Text style={styles.statLabel}>Looks worn</Text>
          </View>
        </Animated.View>

        {/* ── Style DNA ───────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(155).duration(280)}>
          <SectionHeader label="YOUR PROFILE" title="Style DNA" />
          <View style={styles.card}>
            {dnaItems.length > 0 ? (
              <View style={styles.dnaRow}>
                {dnaItems.map((item, i) => (
                  <View key={i} style={[styles.dnaPill, { backgroundColor: item.color }]}>
                    <Text style={[styles.dnaPillText, { color: item.text }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.dnaEmpty}>
                <Text style={styles.dnaEmptyText}>Complete your style quiz to populate this.</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.dnaQuizLink, pressed && { opacity: 0.65 }]}
              onPress={() => router.push('/onboarding')}
            >
              <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.dnaQuizLinkText}>Redo Style Quiz</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Refinements ─────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(280)}
          onLayout={(e) => setRefinementsY(e.nativeEvent.layout.y)}
        >
          <SectionHeader label="PERSONALISATION" title="Refinements" />
          <View style={styles.card}>
            <Text style={styles.refineHelp}>Optional — sharpen every recommendation across your wardrobe.</Text>

            <CollapsibleSection
              title="Physical"
              count={`${physicalSet} / 3`}
              initiallyOpen={physicalSet > 0}
            >
              <Text style={styles.chipGroupLabel}>Hair colour</Text>
              <View style={styles.chipRow}>
                {HAIR_OPTS.map(h => (
                  <Chip key={h.id} label={h.label} active={profile.hairColor === h.id}
                    onPress={() => updateProfile({ hairColor: profile.hairColor === h.id ? null : h.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Height</Text>
              <View style={styles.chipRow}>
                {HEIGHT_OPTS.map(h => (
                  <Chip key={h.id} label={h.label} active={profile.heightBand === h.id}
                    onPress={() => updateProfile({ heightBand: profile.heightBand === h.id ? null : h.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Face shape</Text>
              <Text style={styles.chipGroupSub}>Influences neckline recommendations.</Text>
              <View style={styles.chipRow}>
                {FACE_SHAPE_OPTS.map(f => (
                  <Chip key={f.id} label={f.label} active={profile.faceShape === f.id}
                    onPress={() => updateProfile({ faceShape: profile.faceShape === f.id ? null : f.id })} />
                ))}
              </View>
            </CollapsibleSection>

            <CollapsibleSection
              title="Style"
              count={`${styleSetCount} / 6`}
              initiallyOpen={styleSetCount > 0}
              hasBorderTop
            >
              <Text style={styles.chipGroupLabel}>Contrast level</Text>
              <View style={styles.chipRow}>
                {CONTRAST_OPTS.map(c => (
                  <Chip key={c.id} label={c.label} active={profile.contrastLevel === c.id}
                    onPress={() => updateProfile({ contrastLevel: profile.contrastLevel === c.id ? null : c.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Metal preference</Text>
              <View style={styles.chipRow}>
                {METAL_OPTS.map(m => (
                  <Chip key={m.id} label={m.label} active={profile.metalPreference === m.id}
                    onPress={() => updateProfile({ metalPreference: profile.metalPreference === m.id ? null : m.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Colours to avoid</Text>
              <View style={styles.chipRow}>
                {AVERSION_OPTS.map(c => {
                  const current = profile.constraints.colorAversions ?? [];
                  const active = current.includes(c);
                  return (
                    <Chip key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} active={active}
                      onPress={() => {
                        const next = active ? current.filter((x: string) => x !== c) : [...current, c];
                        updateProfile({ constraints: { ...profile.constraints, colorAversions: next } });
                      }} />
                  );
                })}
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>No sleeveless</Text>
                <Switch
                  value={profile.constraints.noSleeveless}
                  onValueChange={(v) => { Haptics.selectionAsync(); updateProfile({ constraints: { ...profile.constraints, noSleeveless: v } }); }}
                  trackColor={{ true: Colors.primary, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>
              <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                <Text style={styles.toggleLabel}>No short skirts</Text>
                <Switch
                  value={profile.constraints.noShortSkirts}
                  onValueChange={(v) => { Haptics.selectionAsync(); updateProfile({ constraints: { ...profile.constraints, noShortSkirts: v } }); }}
                  trackColor={{ true: Colors.primary, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>

              <Text style={styles.chipGroupLabel}>Max heel height</Text>
              <View style={styles.chipRow}>
                {(['any', 'medium', 'low', 'flat'] as const).map(h => (
                  <Chip key={h} label={h.charAt(0).toUpperCase() + h.slice(1)}
                    active={profile.constraints.maxHeelHeight === h}
                    onPress={() => updateProfile({ constraints: { ...profile.constraints, maxHeelHeight: h } })} />
                ))}
              </View>
            </CollapsibleSection>

            <CollapsibleSection
              title="Lifestyle"
              count={`${lifestyleSetCount} / 3`}
              initiallyOpen={lifestyleSetCount > 0}
              hasBorderTop
            >
              <Text style={styles.chipGroupLabel}>Default mood</Text>
              <View style={styles.chipRow}>
                {MOOD_OPTS.map(m => (
                  <Chip key={m.id} label={m.label} active={profile.defaultMood === m.id}
                    onPress={() => updateProfile({ defaultMood: profile.defaultMood === m.id ? null : m.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Industry</Text>
              <View style={styles.chipRow}>
                {INDUSTRY_OPTS.map(i => (
                  <Chip key={i.id} label={i.label}
                    active={(profile.industry ?? 'unspecified') === i.id}
                    onPress={() => updateProfile({ industry: i.id })} />
                ))}
              </View>

              <Text style={styles.chipGroupLabel}>Life phase</Text>
              <View style={styles.chipRow}>
                {LIFE_PHASE_OPTS.map(l => (
                  <Chip key={l.id} label={l.label} active={profile.lifePhase === l.id}
                    onPress={() => updateProfile({ lifePhase: profile.lifePhase === l.id ? null : l.id })} />
                ))}
              </View>
            </CollapsibleSection>
          </View>
        </Animated.View>

        {/* ── Weather ─────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(250).duration(280)}>
          <SectionHeader label="SMART STYLING" title="Weather" />
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <Text style={styles.toggleLabel}>Weather-aware outfits</Text>
                <Text style={styles.toggleSub}>
                  {weather
                    ? `Today: ${formatTemp(weather.currentTempC, effectiveTempUnit)} · L${formatTempValue(weather.lowC, effectiveTempUnit)}/H${formatTempValue(weather.highC, effectiveTempUnit)}${effectiveTempUnit === 'F' ? '\u00b0F' : '\u00b0'}${weather.precipProbability >= 0.6 ? ' · Rain likely' : ''}`
                    : 'Tailor outerwear to today\u2019s forecast.'}
                </Text>
              </View>
              <Switch
                value={profile.weatherEnabled !== false}
                onValueChange={(v) => { Haptics.selectionAsync(); setWeatherEnabled(v); }}
                trackColor={{ true: Colors.primary, false: Colors.border }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={[styles.toggleRow, styles.toggleRowBorder, { alignItems: 'center' }]}>
              <Text style={styles.toggleLabel}>Temperature unit</Text>
              <View style={styles.chipRow}>
                {(['C', 'F'] as const).map(u => (
                  <Chip key={u} label={`\u00b0${u}`}
                    active={effectiveTempUnit === u}
                    onPress={() => updateProfile({ tempUnit: u })} />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── Track & History ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(295).duration(280)}>
          <SectionHeader label="ACTIVITY" title="Track & History" />
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.featureRow, pressed && { opacity: 0.75 }]}
              onPress={() => router.push('/wear-log')}
            >
              <View style={[styles.featureIcon, { backgroundColor: Colors.sage + '22' }]}>
                <Ionicons name="calendar-outline" size={18} color={Colors.sage} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>Wear Log</Text>
                <Text style={styles.featureSub}>
                  {wearHistory.length === 0
                    ? 'Track outfits you wear each day'
                    : `${wearHistory.length} outfit${wearHistory.length === 1 ? '' : 's'} logged`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={Colors.border} />
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Personal Intelligence ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(335).duration(280)}>
          <Pressable
            onPress={() => setShowAffinityDebug(s => !s)}
            style={styles.collapseHeader}
          >
            <View>
              <Text style={styles.sectionLabel}>LEARNING</Text>
              <Text style={styles.sectionTitle}>Personal Intelligence</Text>
            </View>
            <View style={styles.collapseChevron}>
              <Ionicons name={showAffinityDebug ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textSecondary} />
            </View>
          </Pressable>
          {showAffinityDebug && (
            <Animated.View entering={FadeInUp.duration(200)} style={styles.card}>
              <View style={styles.affinityStatusRow}>
                <Ionicons
                  name={affinityActive ? 'sparkles' : 'time-outline'}
                  size={14}
                  color={affinityActive ? Colors.secondary : Colors.textLight}
                />
                <Text style={styles.affinityStatus}>
                  {affinityActive
                    ? `Active · ${Math.round(affinitySignalCount)} signal${Math.round(affinitySignalCount) === 1 ? '' : 's'}`
                    : `Learning… ${Math.round(affinitySignalCount)}/5 signals before tuning kicks in`}
                </Text>
              </View>
              <Text style={styles.affinityHelp}>
                Loves, "not today" taps, and outfits you wear quietly shape what surfaces next. Nothing is ever fully banned.
              </Text>

              <Text style={styles.affinityGroupTitle}>Pieces you reach for</Text>
              {topAffinityItems.liked.length === 0
                ? <Text style={styles.affinityEmpty}>None yet — log a few outfits to start.</Text>
                : topAffinityItems.liked.map(({ id, score }) => (
                  <View key={`liked-${id}`} style={styles.affinityItem}>
                    <View style={[styles.affinityDot, { backgroundColor: Colors.success }]} />
                    <Text style={styles.affinityItemLabel} numberOfLines={1}>{itemLabel(id)}</Text>
                    <Text style={styles.affinityItemScore}>+{score.toFixed(1)}</Text>
                  </View>
                ))}

              <Text style={styles.affinityGroupTitle}>Pieces you skip</Text>
              {topAffinityItems.disliked.length === 0
                ? <Text style={styles.affinityEmpty}>None — keep tapping "not today" to teach me.</Text>
                : topAffinityItems.disliked.map(({ id, score }) => (
                  <View key={`disliked-${id}`} style={styles.affinityItem}>
                    <View style={[styles.affinityDot, { backgroundColor: Colors.warning }]} />
                    <Text style={styles.affinityItemLabel} numberOfLines={1}>{itemLabel(id)}</Text>
                    <Text style={styles.affinityItemScore}>{score.toFixed(1)}</Text>
                  </View>
                ))}

              {topAffinityPairs.liked.length > 0 && (
                <>
                  <Text style={styles.affinityGroupTitle}>Combinations that work</Text>
                  {topAffinityPairs.liked.map(({ ids, score }) => (
                    <View key={`pair-liked-${ids[0]}-${ids[1]}`} style={styles.affinityItem}>
                      <View style={[styles.affinityDot, { backgroundColor: Colors.success }]} />
                      <Text style={styles.affinityItemLabel} numberOfLines={1}>{itemLabel(ids[0])} + {itemLabel(ids[1])}</Text>
                      <Text style={styles.affinityItemScore}>+{score.toFixed(1)}</Text>
                    </View>
                  ))}
                </>
              )}
            </Animated.View>
          )}
        </Animated.View>

        {/* ── Subscription ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(375).duration(280)}>
          <SectionHeader label="YOUR PLAN" title="Subscription" />
          {isPremium ? (
            <View style={styles.card}>
              <View style={styles.featureRow}>
                <View style={[styles.featureIcon, { backgroundColor: Colors.secondary + '20' }]}>
                  <Ionicons name="star" size={18} color={Colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>Premium Active</Text>
                  <Text style={styles.featureSub}>Unlimited items · Blueprint · Diagnostics</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => router.push('/premium')}
                >
                  <Text style={styles.manageBtnText}>Manage</Text>
                </Pressable>
              </View>
              <View style={styles.featureDivider} />
              <Pressable style={({ pressed }) => [styles.featureRow, pressed && { opacity: 0.75 }]} onPress={() => router.push('/diagnostics')}>
                <View style={[styles.featureIcon, { backgroundColor: Colors.secondary + '15' }]}>
                  <Ionicons name="analytics-outline" size={18} color={Colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>Deep Diagnostics</Text>
                  <Text style={styles.featureSub}>Wardrobe health score & gap analysis</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={Colors.border} />
              </Pressable>
              <View style={styles.featureDivider} />
              <Pressable style={({ pressed }) => [styles.featureRow, pressed && { opacity: 0.75 }]} onPress={() => router.push('/blueprint')}>
                <View style={[styles.featureIcon, { backgroundColor: Colors.sage + '20' }]}>
                  <Ionicons name="map-outline" size={18} color={Colors.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureLabel}>Wardrobe Blueprint</Text>
                  <Text style={styles.featureSub}>Essential pieces for your style goal</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={Colors.border} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.upgradeCard}>
              <View style={styles.upgradeCardTop}>
                <View>
                  <Text style={styles.upgradeCardTitle}>Unlock AuraCloset Premium</Text>
                  <Text style={styles.upgradeCardSub}>Everything you need for a complete wardrobe</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                  onPress={() => router.push('/premium')}
                >
                  <Ionicons name="star" size={14} color={Colors.white} />
                  <Text style={styles.upgradeBtnText}>Upgrade</Text>
                </Pressable>
              </View>
              <View style={styles.upgradeFeatures}>
                {[
                  { icon: 'infinite-outline', text: 'Unlimited wardrobe items' },
                  { icon: 'analytics-outline', text: 'Deep Diagnostics & health score' },
                  { icon: 'map-outline', text: 'Personalized wardrobe blueprint' },
                ].map((f, i) => (
                  <View key={i} style={styles.upgradeFeatureRow}>
                    <Ionicons name={f.icon as any} size={15} color={Colors.secondary} />
                    <Text style={styles.upgradeFeatureText}>{f.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Floating Sign Out ────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInUp.delay(500).duration(280)}
        style={[styles.floatingSignOutWrap, { bottom: insets.bottom + 12 }]}
      >
        <TouchableOpacity
          style={styles.floatingSignOutBtn}
          onPress={async () => {
            try { await signOut(); router.replace('/sign-in'); }
            catch (err: any) { console.error('[profile] Sign out:', err.message); }
          }}
          activeOpacity={0.82}
          accessibilityLabel="Sign out of AuraCloset"
        >
          <View style={styles.floatingSignOutInner}>
            <View style={styles.floatingSignOutIconWrap}>
              <Ionicons name="log-out-outline" size={18} color={Colors.warning} />
            </View>
            <Text style={styles.floatingSignOutText}>Sign out</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center', paddingTop: 16, paddingBottom: 24,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.secondary + '20',
    borderWidth: 1.5, borderColor: Colors.secondary + '35',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.secondary, letterSpacing: -0.5,
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 1, right: 1,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.background,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heroName: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, letterSpacing: -0.4 },
  heroEmail: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, marginBottom: 10, letterSpacing: 0.1 },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  tierBadgePremium: { borderColor: Colors.secondary + '50', backgroundColor: Colors.secondary + '10' },
  tierBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.3 },
  tierBadgeTextPremium: { color: Colors.secondary },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  nameInput: {
    fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.primary,
    borderBottomWidth: 1.5, borderBottomColor: Colors.secondary,
    paddingVertical: 4, paddingHorizontal: 8, minWidth: 130, textAlign: 'center',
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderRadius: 18, paddingVertical: 18, paddingHorizontal: 8, marginBottom: 28,
    shadowColor: Colors.primary, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 1, borderWidth: 1, borderColor: Colors.border,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: {
    fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.primary,
    letterSpacing: -0.5, fontVariant: ['tabular-nums'],
  },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 6 },

  // ── Section headers ───────────────────────────────────────────────────────
  sectionHeaderBlock: { marginBottom: 10 },
  sectionLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textLight,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 3,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.primary, letterSpacing: -0.4,
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.white, borderRadius: 18, marginBottom: 28, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
    elevation: 1, borderWidth: 1, borderColor: Colors.border,
  },

  // ── DNA Pills ─────────────────────────────────────────────────────────────
  dnaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 },
  dnaPill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  dnaPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, letterSpacing: -0.1 },
  dnaEmpty: { padding: 16 },
  dnaEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textLight, fontStyle: 'italic' },
  dnaQuizLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  dnaQuizLinkText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },

  // ── Chip system ───────────────────────────────────────────────────────────
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1,
    minHeight: 36,
  },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chipGroupLabel: {
    fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.7,
    paddingHorizontal: 16, marginTop: 16, marginBottom: 8,
  },
  chipGroupSub: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight,
    paddingHorizontal: 16, marginTop: -4, marginBottom: 8,
  },

  // ── Refinement help text ──────────────────────────────────────────────────
  refineHelp: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textLight,
    paddingHorizontal: 16, paddingVertical: 14, lineHeight: 19,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // ── Toggle rows ───────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  toggleRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  toggleLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary },
  toggleSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  // ── Setting rows (unused, kept for future) ────────────────────────────────
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingBody: { flex: 1 },
  settingLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary },
  settingValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginTop: 1 },

  // ── Feature rows (Wear Log, Premium features) ─────────────────────────────
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, letterSpacing: -0.1 },
  featureSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  featureDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

  // ── Collapse header (for affinity section) ────────────────────────────────
  collapseHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  collapseChevron: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },

  // ── Affinity / Intelligence ───────────────────────────────────────────────
  affinityStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  affinityStatus: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  affinityHelp: {
    fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight,
    paddingHorizontal: 16, paddingVertical: 12, lineHeight: 18,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  affinityGroupTitle: {
    fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  affinityItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  affinityDot: { width: 7, height: 7, borderRadius: 4 },
  affinityItemLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.primary },
  affinityItemScore: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  affinityEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textLight, paddingHorizontal: 16, paddingBottom: 10, fontStyle: 'italic' },

  // ── Manage button ─────────────────────────────────────────────────────────
  manageBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  manageBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },

  // ── Upgrade card (when not premium) ──────────────────────────────────────
  upgradeCard: {
    backgroundColor: Colors.white, borderRadius: 18, marginBottom: 28,
    borderWidth: 1, borderColor: Colors.secondary + '30',
    shadowColor: Colors.secondary, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 3 },
    elevation: 2, overflow: 'hidden',
  },
  upgradeCardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, gap: 12,
  },
  upgradeCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.primary, letterSpacing: -0.2 },
  upgradeCardSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: Colors.secondary,
    shadowColor: Colors.secondary, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  upgradeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.white },
  upgradeFeatures: {
    paddingHorizontal: 16, paddingBottom: 16, gap: 10,
    borderTopWidth: 1, borderTopColor: Colors.secondary + '15',
    paddingTop: 14,
  },
  upgradeFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  upgradeFeatureText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },

  // ── Floating Sign Out ─────────────────────────────────────────────────────
  floatingSignOutWrap: {
    position: 'absolute', left: 20, right: 20,
  },
  floatingSignOutBtn: {
    borderRadius: 20, overflow: 'hidden',
    backgroundColor: Colors.white,
    shadowColor: Colors.primary, shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  floatingSignOutInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 16, paddingHorizontal: 24,
  },
  floatingSignOutIconWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.warning + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  floatingSignOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.warning, letterSpacing: -0.1 },
});
