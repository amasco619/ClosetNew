import { StyleSheet, Text, View, ScrollView, Pressable, Switch, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { signOut } from '../../lib/auth';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { HairColor, HeightBand, ContrastLevel, MetalPreference, MoodGoal, LifePhase, Industry, FaceShape } from '@/constants/types';
import { useEffect, useRef, useState } from 'react';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import CollapsibleSection from '@/components/CollapsibleSection';

const HAIR_OPTS: { id: HairColor; label: string }[] = [
  { id: 'black', label: 'Black' }, { id: 'dark-brown', label: 'Dark Brown' },
  { id: 'medium-brown', label: 'Med Brown' }, { id: 'light-brown', label: 'Light Brown' },
  { id: 'blonde', label: 'Blonde' }, { id: 'red', label: 'Red' },
  { id: 'grey', label: 'Grey' }, { id: 'silver', label: 'Silver' },
];
const HEIGHT_OPTS: HeightBand[] = ['petite', 'average', 'tall'];
const CONTRAST_OPTS: ContrastLevel[] = ['low', 'medium', 'high'];
const METAL_OPTS: MetalPreference[] = ['gold', 'silver', 'rose-gold', 'mixed'];
const MOOD_OPTS: MoodGoal[] = ['confident', 'soft', 'joyful', 'grounded', 'romantic', 'powerful'];
const INDUSTRY_OPTS: { id: Industry; label: string }[] = [
  { id: 'creative',    label: 'Creative' },
  { id: 'tech',        label: 'Tech' },
  { id: 'corporate',   label: 'Corporate' },
  { id: 'unspecified', label: 'Other' },
];
const LIFE_PHASE_OPTS: { id: LifePhase; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'pregnancy', label: 'Pregnancy' },
  { id: 'postpartum', label: 'Postpartum' },
  { id: 'weight-flux', label: 'Weight flux' },
  { id: 'feeling-off', label: 'Feeling off' },
];
const AVERSION_OPTS: string[] = ['yellow', 'orange', 'neon', 'pink', 'red', 'green', 'brown', 'purple'];

const FACE_SHAPE_OPTS: { id: FaceShape; label: string }[] = [
  { id: 'oval',   label: 'Oval' },
  { id: 'round',  label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'heart',  label: 'Heart' },
  { id: 'oblong', label: 'Oblong' },
];

const faceShapeLabels: Record<FaceShape, string> = {
  oval: 'Oval', round: 'Round', square: 'Square', heart: 'Heart', oblong: 'Oblong',
};

const bodyTypeLabels: Record<string, string> = {
  hourglass: 'Hourglass', pear: 'Pear', apple: 'Apple',
  rectangle: 'Rectangle', 'inverted-triangle': 'Inverted Triangle', athletic: 'Athletic',
};

const eyeColorLabels: Record<string, string> = {
  'dark-brown': 'Dark Brown', 'light-brown': 'Light Brown', hazel: 'Hazel',
  green: 'Green', blue: 'Blue', grey: 'Grey',
};

const skinToneLabels: Record<string, string> = {
  'very-light': 'Very Light', light: 'Light', 'medium-light': 'Medium Light',
  medium: 'Medium', 'medium-dark': 'Medium Dark', dark: 'Dark', 'very-dark': 'Very Dark',
};

const undertoneLabels: Record<string, string> = {
  cool: 'Cool', neutral: 'Neutral', warm: 'Warm',
};

const styleGoalLabels: Record<string, string> = {
  youthful: 'Youthful', elevated: 'Elevated', minimal: 'Minimal',
  romantic: 'Romantic', bold: 'Bold', classic: 'Classic',
};

function ProfileRow({ icon, iconColor, label, value, onPress }: { icon: string; iconColor?: string; label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.profileRow, pressed && onPress && { opacity: 0.7 }]} onPress={onPress}>
      <View style={[styles.profileIcon, { backgroundColor: (iconColor || Colors.secondary) + '15' }]}>
        <Ionicons name={icon as any} size={18} color={iconColor || Colors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.profileLabel}>{label}</Text>
        <Text style={styles.profileValue}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const {
    profile, updateProfile, wardrobeItems, isPremium, togglePremium, wearHistory,
    affinityActive, affinitySignalCount, topAffinityItems, topAffinityPairs,
    weather, setWeatherEnabled,
  } = useApp();
  const [showAffinityDebug, setShowAffinityDebug] = useState(false);
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
  const physicalTotal = 3;

  const styleSetCount = [
    profile.contrastLevel,
    profile.metalPreference,
    colorAversions.length > 0 ? 'yes' : null,
    profile.constraints.noSleeveless ? 'yes' : null,
    profile.constraints.noShortSkirts ? 'yes' : null,
    profile.constraints.maxHeelHeight !== 'any' ? 'yes' : null,
  ].filter(Boolean).length;
  const styleTotal = 6;

  const lifestyleSetCount = [
    profile.defaultMood,
    (profile.industry && profile.industry !== 'unspecified') ? profile.industry : null,
    profile.lifePhase,
  ].filter(Boolean).length;
  const lifestyleTotal = 3;

  useEffect(() => {
    if (focus === 'refinements' && refinementsY != null) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, refinementsY - 12), animated: true });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [focus, refinementsY]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.header}>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="hanger" size={32} color={Colors.secondary} />
          </View>
          <Text style={styles.name}>{profile.name || 'Style Explorer'}</Text>
          <Text style={styles.tierLabel}>{isPremium ? 'Premium Member' : 'Free Plan'}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.statsBar}>
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{wardrobeItems.length}</Text>
            <Text style={styles.miniStatLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{new Set(wardrobeItems.map(i => i.category)).size}</Text>
            <Text style={styles.miniStatLabel}>Categories</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.miniStat}>
            <Text style={styles.miniStatNum}>{new Set(wardrobeItems.map(i => i.colorFamily)).size}</Text>
            <Text style={styles.miniStatLabel}>Colors</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(280)}>
          <Text style={styles.sectionTitle}>Style Profile</Text>
          <View style={styles.card}>
            {profile.bodyType && <ProfileRow icon="body-outline" label="Body Type" value={bodyTypeLabels[profile.bodyType] || ''} />}
            {profile.faceShape && <ProfileRow icon="happy-outline" iconColor={Colors.sage} label="Face Shape" value={faceShapeLabels[profile.faceShape] || ''} />}
            {profile.eyeColor && <ProfileRow icon="eye-outline" iconColor={Colors.sage} label="Eye Color" value={eyeColorLabels[profile.eyeColor] || ''} />}
            {profile.skinTone && <ProfileRow icon="color-palette-outline" iconColor={Colors.blush.replace('#', '#')} label="Skin Tone" value={`${skinToneLabels[profile.skinTone] || ''} - ${undertoneLabels[profile.undertone || ''] || ''}`} />}
            {profile.styleGoalPrimary && (
              <ProfileRow
                icon="sparkles-outline"
                iconColor={Colors.secondary}
                label="Style Goal"
                value={`${styleGoalLabels[profile.styleGoalPrimary]}${profile.styleGoalSecondary ? ` + ${styleGoalLabels[profile.styleGoalSecondary]}` : ''}`}
              />
            )}
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(230).duration(280)}
          onLayout={(e) => setRefinementsY(e.nativeEvent.layout.y)}
        >
          <Text style={styles.sectionTitle}>Refinements</Text>
          <View style={styles.card}>
            <Text style={styles.refineHelp}>Optional — sharpen every recommendation.</Text>

            <CollapsibleSection
              title="Physical"
              count={`${physicalSet} / ${physicalTotal} set`}
              initiallyOpen={physicalSet > 0}
            >
              <Text style={styles.refineLabel}>Hair</Text>
              <View style={styles.refineChipRow}>
                {HAIR_OPTS.map(h => {
                  const active = profile.hairColor === h.id;
                  return (
                    <Pressable key={h.id} onPress={() => updateProfile({ hairColor: active ? null : h.id })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>{h.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Height</Text>
              <View style={styles.refineChipRow}>
                {HEIGHT_OPTS.map(h => {
                  const active = profile.heightBand === h;
                  return (
                    <Pressable key={h} onPress={() => updateProfile({ heightBand: active ? null : h })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {h.charAt(0).toUpperCase() + h.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Face shape</Text>
              <Text style={styles.refineSubLabel}>Shapes neckline recommendations for your features.</Text>
              <View style={styles.refineChipRow}>
                {FACE_SHAPE_OPTS.map(f => {
                  const active = profile.faceShape === f.id;
                  return (
                    <Pressable key={f.id} onPress={() => updateProfile({ faceShape: active ? null : f.id })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </CollapsibleSection>

            <CollapsibleSection
              title="Style"
              count={`${styleSetCount} / ${styleTotal} set`}
              initiallyOpen={styleSetCount > 0}
              hasBorderTop
            >
              <Text style={styles.refineLabel}>Contrast</Text>
              <View style={styles.refineChipRow}>
                {CONTRAST_OPTS.map(c => {
                  const active = profile.contrastLevel === c;
                  return (
                    <Pressable key={c} onPress={() => updateProfile({ contrastLevel: active ? null : c })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Metal preference</Text>
              <View style={styles.refineChipRow}>
                {METAL_OPTS.map(m => {
                  const active = profile.metalPreference === m;
                  return (
                    <Pressable key={m} onPress={() => updateProfile({ metalPreference: active ? null : m })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {m === 'rose-gold' ? 'Rose gold' : m.charAt(0).toUpperCase() + m.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Colors to avoid</Text>
              <View style={styles.refineChipRow}>
                {AVERSION_OPTS.map(c => {
                  const current = profile.constraints.colorAversions ?? [];
                  const active = current.includes(c);
                  return (
                    <Pressable key={c} onPress={() => {
                      const next = active ? current.filter((x: string) => x !== c) : [...current, c];
                      updateProfile({ constraints: { ...profile.constraints, colorAversions: next } });
                    }}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.constraintRow}>
                <Text style={styles.constraintLabel}>No sleeveless</Text>
                <Switch
                  value={profile.constraints.noSleeveless}
                  onValueChange={(v) => updateProfile({ constraints: { ...profile.constraints, noSleeveless: v } })}
                  trackColor={{ true: Colors.secondary, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>
              <View style={styles.constraintRow}>
                <Text style={styles.constraintLabel}>No short skirts</Text>
                <Switch
                  value={profile.constraints.noShortSkirts}
                  onValueChange={(v) => updateProfile({ constraints: { ...profile.constraints, noShortSkirts: v } })}
                  trackColor={{ true: Colors.secondary, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>
              <View style={styles.constraintRow}>
                <Text style={styles.constraintLabel}>Max heel height</Text>
                <View style={styles.heelOptions}>
                  {(['any', 'medium', 'low', 'flat'] as const).map(h => (
                    <Pressable
                      key={h}
                      style={[styles.heelChip, profile.constraints.maxHeelHeight === h && styles.heelChipActive]}
                      onPress={() => updateProfile({ constraints: { ...profile.constraints, maxHeelHeight: h } })}
                    >
                      <Text style={[styles.heelChipText, profile.constraints.maxHeelHeight === h && styles.heelChipTextActive]}>
                        {h.charAt(0).toUpperCase() + h.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </CollapsibleSection>

            <CollapsibleSection
              title="Lifestyle"
              count={`${lifestyleSetCount} / ${lifestyleTotal} set`}
              initiallyOpen={lifestyleSetCount > 0}
              hasBorderTop
            >
              <Text style={styles.refineLabel}>Default mood</Text>
              <View style={styles.refineChipRow}>
                {MOOD_OPTS.map(m => {
                  const active = profile.defaultMood === m;
                  return (
                    <Pressable key={m} onPress={() => updateProfile({ defaultMood: active ? null : m })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Industry</Text>
              <View style={styles.refineChipRow}>
                {INDUSTRY_OPTS.map(i => {
                  const active = (profile.industry ?? 'unspecified') === i.id;
                  return (
                    <Pressable key={i.id} onPress={() => updateProfile({ industry: i.id })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {i.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.refineLabel}>Life phase</Text>
              <View style={styles.refineChipRow}>
                {LIFE_PHASE_OPTS.map(l => {
                  const active = profile.lifePhase === l.id;
                  return (
                    <Pressable key={l.id} onPress={() => updateProfile({ lifePhase: active ? null : l.id })}
                      style={[styles.refineChip, active && styles.refineChipActive]}>
                      <Text style={[styles.refineChipText, active && styles.refineChipTextActive]}>
                        {l.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </CollapsibleSection>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(280)}>
          <Text style={styles.sectionTitle}>Weather</Text>
          <View style={styles.card}>
            <View style={styles.constraintRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.constraintLabel}>Weather-aware outfits</Text>
                <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>
                  {weather
                    ? `Today: ${formatTemp(weather.currentTempC, effectiveTempUnit)} · L${formatTempValue(weather.lowC, effectiveTempUnit)}/H${formatTempValue(weather.highC, effectiveTempUnit)}${effectiveTempUnit === 'F' ? '\u00b0F' : '\u00b0'}${weather.precipProbability >= 0.6 ? ' · Rain likely' : ''}`
                    : 'Tailor outerwear to today\u2019s forecast.'}
                </Text>
              </View>
              <Switch
                value={profile.weatherEnabled !== false}
                onValueChange={setWeatherEnabled}
                trackColor={{ true: Colors.secondary, false: Colors.border }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={[styles.constraintRow, { marginTop: 12 }]}>
              <Text style={styles.constraintLabel}>Temperature unit</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['C', 'F'] as const).map(u => {
                  const active = effectiveTempUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => updateProfile({ tempUnit: u })}
                      style={[styles.heelChip, active && styles.heelChipActive]}
                    >
                      <Text style={[styles.heelChipText, active && styles.heelChipTextActive]}>
                        {`\u00b0${u}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(355).duration(280)}>
          <Text style={styles.sectionTitle}>Track & History</Text>
          <View style={styles.card}>
            <Pressable style={styles.premiumFeatureRow} onPress={() => router.push('/wear-log')}>
              <View style={[styles.premiumFeatureIcon, { backgroundColor: Colors.blush + '30' }]}>
                <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumFeatureLabel}>Wear Log</Text>
                <Text style={styles.premiumFeatureDesc}>
                  {wearHistory.length === 0
                    ? 'Track outfits you wear each day'
                    : `${wearHistory.length} outfit${wearHistory.length === 1 ? '' : 's'} logged`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(390).duration(280)}>
          <Pressable
            onPress={() => setShowAffinityDebug(s => !s)}
            style={styles.affinityHeaderRow}
          >
            <Text style={styles.sectionTitle}>Why this changed</Text>
            <Ionicons
              name={showAffinityDebug ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={Colors.textSecondary}
            />
          </Pressable>
          {showAffinityDebug && (
            <View style={styles.card}>
              <View style={styles.affinityStatusRow}>
                <Ionicons
                  name={affinityActive ? 'sparkles' : 'time-outline'}
                  size={14}
                  color={affinityActive ? Colors.secondary : Colors.textLight}
                />
                <Text style={styles.affinityStatusText}>
                  {affinityActive
                    ? `Calibrating from ${Math.round(affinitySignalCount)} signal${Math.round(affinitySignalCount) === 1 ? '' : 's'}`
                    : `Learning… ${Math.round(affinitySignalCount)}/5 signals before tuning kicks in`}
                </Text>
              </View>
              <Text style={styles.affinityHelp}>
                Loves, "not today" taps, and outfits you actually wear quietly
                shape what surfaces next. Nothing is ever fully banned.
              </Text>

              <Text style={styles.affinityListTitle}>Pieces you reach for</Text>
              {topAffinityItems.liked.length === 0 ? (
                <Text style={styles.affinityEmpty}>None yet — log a few outfits to start.</Text>
              ) : (
                topAffinityItems.liked.map(({ id, score }) => (
                  <View key={`liked-${id}`} style={styles.affinityRow}>
                    <View style={[styles.affinityDot, { backgroundColor: Colors.success }]} />
                    <Text style={styles.affinityRowLabel} numberOfLines={1}>{itemLabel(id)}</Text>
                    <Text style={styles.affinityRowScore}>+{score.toFixed(1)}</Text>
                  </View>
                ))
              )}

              <Text style={styles.affinityListTitle}>Pieces you skip</Text>
              {topAffinityItems.disliked.length === 0 ? (
                <Text style={styles.affinityEmpty}>None — keep tapping "not today" to teach me.</Text>
              ) : (
                topAffinityItems.disliked.map(({ id, score }) => (
                  <View key={`disliked-${id}`} style={styles.affinityRow}>
                    <View style={[styles.affinityDot, { backgroundColor: Colors.warning }]} />
                    <Text style={styles.affinityRowLabel} numberOfLines={1}>{itemLabel(id)}</Text>
                    <Text style={styles.affinityRowScore}>{score.toFixed(1)}</Text>
                  </View>
                ))
              )}

              {topAffinityPairs.liked.length > 0 && (
                <>
                  <Text style={styles.affinityListTitle}>Combinations that work</Text>
                  {topAffinityPairs.liked.map(({ ids, score }) => (
                    <View key={`pair-liked-${ids[0]}-${ids[1]}`} style={styles.affinityRow}>
                      <View style={[styles.affinityDot, { backgroundColor: Colors.success }]} />
                      <Text style={styles.affinityRowLabel} numberOfLines={1}>
                        {itemLabel(ids[0])} + {itemLabel(ids[1])}
                      </Text>
                      <Text style={styles.affinityRowScore}>+{score.toFixed(1)}</Text>
                    </View>
                  ))}
                </>
              )}
              {topAffinityPairs.disliked.length > 0 && (
                <>
                  <Text style={styles.affinityListTitle}>Combinations that don't</Text>
                  {topAffinityPairs.disliked.map(({ ids, score }) => (
                    <View key={`pair-disliked-${ids[0]}-${ids[1]}`} style={styles.affinityRow}>
                      <View style={[styles.affinityDot, { backgroundColor: Colors.warning }]} />
                      <Text style={styles.affinityRowLabel} numberOfLines={1}>
                        {itemLabel(ids[0])} + {itemLabel(ids[1])}
                      </Text>
                      <Text style={styles.affinityRowScore}>{score.toFixed(1)}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(420).duration(280)}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.premiumRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.constraintLabel}>{isPremium ? 'Premium Active' : 'Free Plan'}</Text>
                <Text style={styles.premiumDesc}>
                  {isPremium ? 'Unlimited items, blueprint, season-smart styling' : 'Upgrade for unlimited features'}
                </Text>
              </View>
              <Pressable
                style={isPremium ? styles.manageBtn : styles.upgradeBtn}
                onPress={() => router.push('/premium')}
              >
                {isPremium ? (
                  <Text style={styles.manageBtnText}>Manage</Text>
                ) : (
                  <>
                    <Ionicons name="star" size={16} color={Colors.white} />
                    <Text style={styles.upgradeBtnText}>Upgrade</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {isPremium && (
          <Animated.View entering={FadeInDown.delay(450).duration(280)}>
            <Text style={styles.sectionTitle}>Premium Features</Text>
            <View style={styles.card}>
              <Pressable style={styles.premiumFeatureRow} onPress={() => router.push('/diagnostics')}>
                <View style={[styles.premiumFeatureIcon, { backgroundColor: Colors.secondary + '15' }]}>
                  <Ionicons name="analytics-outline" size={18} color={Colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.premiumFeatureLabel}>Deep Diagnostics</Text>
                  <Text style={styles.premiumFeatureDesc}>Wardrobe health score & gap analysis</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </Pressable>
              <View style={styles.featureDivider} />
              <Pressable style={styles.premiumFeatureRow} onPress={() => router.push('/blueprint')}>
                <View style={[styles.premiumFeatureIcon, { backgroundColor: Colors.sage + '20' }]}>
                  <Ionicons name="map-outline" size={18} color={Colors.sage} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.premiumFeatureLabel}>Wardrobe Blueprint</Text>
                  <Text style={styles.premiumFeatureDesc}>Essential pieces for your style goal</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
              </Pressable>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(480).duration(280)}>
          <Pressable
            style={styles.redoOnboarding}
            onPress={() => {
              updateProfile({ onboardingComplete: false });
              router.replace('/onboarding');
            }}
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.redoText}>Redo Style Quiz</Text>
          </Pressable>
        </Animated.View>

        <TouchableOpacity
          style={signOutStyles.button}
          onPress={async () => {
            try {
              await signOut();
              router.replace('/sign-in');
            } catch (err: any) {
              console.error('[profile] Sign out:', err.message);
            }
          }}
          activeOpacity={0.82}
          accessibilityLabel="Sign out of AuraCloset"
          accessibilityRole="button"
        >
          <Text style={signOutStyles.label}>Sign out</Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },

  header: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: Colors.secondary + '15', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, borderWidth: 1, borderColor: Colors.secondary + '25',
  },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, letterSpacing: -0.3 },
  tierLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 18, padding: 16, marginBottom: 24,
    shadowColor: Colors.primary, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 1, borderWidth: 1, borderColor: Colors.border,
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatNum: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary, letterSpacing: -0.3 },
  miniStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary, marginBottom: 10, letterSpacing: -0.2 },
  card: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 4, marginBottom: 20,
    shadowColor: Colors.primary, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  profileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary },
  profileValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginTop: 2 },

  constraintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  constraintLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary },
  heelOptions: { flexDirection: 'row', gap: 6 },
  heelChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },

  refineHelp: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, marginBottom: 4, fontStyle: 'italic', paddingHorizontal: 14, paddingTop: 6 },
  refineLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary, marginTop: 10, marginBottom: 6, paddingHorizontal: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  refineSubLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 8, paddingHorizontal: 14 },
  refineChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 4 },
  refineChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  refineChipActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  refineChipText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary },
  refineChipTextActive: { color: Colors.white },

  heelChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  heelChipText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary },
  heelChipTextActive: { color: Colors.white },

  premiumRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  premiumDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  manageBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  manageBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
    backgroundColor: Colors.secondary,
    shadowColor: Colors.secondary, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  upgradeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.white },

  premiumFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 44 },
  premiumFeatureIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  premiumFeatureLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },
  premiumFeatureDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  featureDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },

  redoOnboarding: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, minHeight: 44,
  },
  redoText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },

  affinityHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 44 },
  affinityStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  affinityStatusText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary },
  affinityHelp: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, paddingHorizontal: 14, paddingBottom: 10, lineHeight: 17, fontStyle: 'italic' },
  affinityListTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.textLight,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  affinityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  affinityDot: { width: 6, height: 6, borderRadius: 3 },
  affinityRowLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.primary, textTransform: 'capitalize' },
  affinityRowScore: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },
  affinityEmpty: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textLight, paddingHorizontal: 14, paddingVertical: 6, fontStyle: 'italic' },
});

const signOutStyles = StyleSheet.create({
  button: {
    marginHorizontal: 24,
    marginTop: 32,
    marginBottom: 48,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#101826',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    fontWeight: '400',
    color: '#101826',
    letterSpacing: 0.3,
  },
});
