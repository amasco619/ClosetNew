import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { signOut } from '@/lib/auth';
import { authenticatedApiRequest } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';
import { defaultTempUnit, formatTemp, formatTempValue } from '@/constants/weather';
import { AmodkaErrorState } from '@/components/AmodkaErrorState';
import { useDialog } from '@/contexts/LuxuryFeedbackContext';
import { AiProcessingConsent } from '@/components/AiProcessingConsent';
import {
  getAiProcessingPreference,
  setAiProcessingPreference,
  type AiProcessingPreference,
} from '@/lib/aiProcessingPreference';
import {
  getAiProcessingDisplay,
  getPersonalIntelligenceSubtitle,
  getPlanPillLabel,
  getRefinementCounts,
  getRefinementSummary,
  shouldShowBeginWardrobe,
} from '@/lib/profilePresentation';
import {
  bodyTypeLabels,
  eyeColorLabels,
  skinToneLabels,
  styleGoalLabels,
  undertoneLabels,
} from '@/lib/profileStyleLabels';

const DESTRUCTIVE_TEXT = '#B3433D';
const MUTED_TEXT = '#626A73';

function SectionLabel({ children }: { children: string }) {
  return <Text accessibilityRole="header" style={styles.sectionLabel}>{children}</Text>;
}

function ProfileRow({
  title,
  subtitle,
  icon,
  onPress,
  trailing,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  trailing?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={Colors.primary + 'B3'} />
      <View style={styles.navCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing === undefined
        ? <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        : trailing}
    </Pressable>
  );
}

function UnitChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.unitChoice,
        selected && styles.unitChoiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.unitChoiceText, selected && styles.unitChoiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const {
    profile,
    updateProfile,
    wardrobeItems,
    wardrobeTotalCount,
    loadAllWardrobeItems,
    isPremium,
    isGuest,
    isLoading,
    wearHistory,
    affinityActive,
    affinitySignalCount,
    weather,
    setWeatherEnabled,
    dataUnavailable,
    entitlementUnavailable,
    retryInitialization,
  } = useApp();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name || '');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [aiProcessingPreference, setAiProcessingPreferenceState] = useState<AiProcessingPreference>('not_asked');
  const [aiPreferenceLoading, setAiPreferenceLoading] = useState(true);
  const [aiPreferenceSaving, setAiPreferenceSaving] = useState(false);
  const [aiPreferenceError, setAiPreferenceError] = useState<string | null>(null);
  const [aiPreferenceUnavailable, setAiPreferenceUnavailable] = useState(false);
  const [aiPreferenceRetry, setAiPreferenceRetry] = useState(0);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [wardrobeLoadError, setWardrobeLoadError] = useState(false);
  const [wardrobeHistoryReady, setWardrobeHistoryReady] = useState(false);
  const wardrobeLoadStarted = useRef(false);

  const handleWardrobeHistoryLoaded = useCallback(() => {
    setWardrobeHistoryReady(true);
    setWardrobeLoadError(false);
  }, []);

  const handleWardrobeHistoryFailed = useCallback(() => {
    wardrobeLoadStarted.current = false;
    setWardrobeLoadError(true);
  }, []);

  useEffect(() => {
    let active = true;
    wardrobeLoadStarted.current = true;
    void loadAllWardrobeItems()
      .then(() => { if (active) handleWardrobeHistoryLoaded(); })
      .catch(() => { if (active) handleWardrobeHistoryFailed(); });
    return () => { active = false; };
  }, [loadAllWardrobeItems, handleWardrobeHistoryFailed, handleWardrobeHistoryLoaded]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      const email = data?.user?.email || data?.user?.user_metadata?.email || null;
      if (active && email) setUserEmail(email);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    if (isGuest) {
      setAiProcessingPreferenceState('not_asked');
      setAiPreferenceError(null);
      setAiPreferenceLoading(false);
      setAiPreferenceUnavailable(false);
      return;
    }
    if (aiPreferenceRetry > 0) {
      setAiPreferenceError(null);
      setAiPreferenceUnavailable(false);
    }
    let active = true;
    setAiPreferenceLoading(true);
    void getAiProcessingPreference().then(preference => {
      if (!active) return;
      setAiProcessingPreferenceState(preference);
      setAiPreferenceError(null);
      setAiPreferenceUnavailable(false);
    }).catch(() => {
      if (!active) return;
      setAiProcessingPreferenceState('not_asked');
      setAiPreferenceError('Your preference could not be loaded.');
      setAiPreferenceUnavailable(true);
    }).finally(() => {
      if (active) setAiPreferenceLoading(false);
    });
    return () => { active = false; };
  }, [isGuest, aiPreferenceRetry]));

  const changeAiProcessingPreference = async (enabled: boolean) => {
    if (aiPreferenceSaving || isGuest) return;
    if (enabled) {
      setAiPreferenceError(null);
      setShowAiConsent(true);
      return;
    }
    setAiPreferenceSaving(true);
    setAiPreferenceError(null);
    try {
      const saved = await setAiProcessingPreference('declined');
      setAiProcessingPreferenceState(saved);
      setAiPreferenceError(null);
    } catch {
      setAiPreferenceError('Your preference could not be saved. Please try again.');
    } finally {
      setAiPreferenceSaving(false);
    }
  };

  const allowProfileAiProcessing = async () => {
    if (aiPreferenceSaving || isGuest) return;
    setAiPreferenceSaving(true);
    setAiPreferenceError(null);
    try {
      const saved = await setAiProcessingPreference('allowed');
      setAiProcessingPreferenceState(saved);
      setShowAiConsent(false);
    } catch {
      setAiPreferenceError('Your preference could not be saved. AI processing remains unavailable.');
    } finally {
      setAiPreferenceSaving(false);
    }
  };

  const declineProfileAiProcessing = () => {
    setAiProcessingPreferenceState('declined');
    setShowAiConsent(false);
    setAiPreferenceError(null);
    setAiPreferenceSaving(true);
    void setAiProcessingPreference('declined')
      .catch(() => {
        setAiPreferenceError('Your choice could not be saved. AI processing remains unavailable until it can be checked.');
      })
      .finally(() => setAiPreferenceSaving(false));
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) updateProfile({ name: trimmed });
    setEditingName(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/sign-in');
    } catch {
      dialog.notify({
        title: 'Could not sign out',
        message: 'Your session could not be closed safely. Please check your connection and try again.',
      });
    }
  };

  const handleDeleteAccount = () => {
    dialog.alert(
      'Delete account',
      'This will permanently delete your account and all wardrobe data. This cannot be undone. Deleting your Amodka account does not cancel your App Store or Google Play subscription. Cancel it separately through your app store.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user?.id) throw new Error('Not signed in');
              const response = await authenticatedApiRequest(
                'DELETE',
                '/api/user/delete-account',
                { userId: user.id },
              );
              const result = await response.json();
              if (result.success !== true) throw new Error('Deletion not confirmed');
            } catch {
              dialog.notify({
                title: 'Deletion not confirmed',
                message: 'Your account was not confirmed deleted. Some data may already have been removed. Please try again or contact support.',
              });
              return;
            }

            let cacheCleared = true;
            try {
              await AsyncStorage.multiRemove([
                '@amodka_profile',
                '@amodka_wardrobe',
                '@amodka_premium',
                '@amodka_slots',
                '@amodka_rotation',
                '@amodka_wear_history',
                '@amodka_reactions',
                '@amodka_mood',
                '@amodka_saved_looks',
                '@amodka_item_ids',
                '@amodka_wear_log',
                '@amodka_weather_v1',
                '@amodka_weather_perm_asked_v1',
                '@amodka_wardrobe_view',
                '@amodka_email_confirmed',
                '@auracloset_profile',
                '@auracloset_wardrobe',
                '@auracloset_premium',
                '@auracloset_slots',
                '@auracloset_rotation',
                '@auracloset_wear_history',
                '@auracloset_reactions',
                '@auracloset_mood',
                '@auracloset_saved_looks',
                '@auracloset_item_ids',
                '@auracloset_wear_log',
                '@auracloset_weather_v1',
                '@auracloset_weather_perm_asked_v1',
              ]);
            } catch {
              cacheCleared = false;
              console.warn('[profile] Deleted account local cache cleanup failed');
            }
            let signedOut = true;
            try {
              await signOut();
            } catch {
              signedOut = false;
              console.warn('[profile] Deleted account local sign-out failed');
            }
            if (signedOut) router.replace('/sign-in');
            if (!cacheCleared || !signedOut) {
              dialog.notify({
                title: 'Account deleted — device cleanup incomplete',
                message: 'Your account was deleted, but this device could not fully clear its local data or session. Clear this app’s data before anyone else uses this device.',
              });
            }
          },
        },
      ],
    );
  };

  const initials = profile.name?.trim()
    ? profile.name.trim().split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase()
    : null;
  const effectiveTempUnit = profile.tempUnit ?? defaultTempUnit();
  const aiDisplay = getAiProcessingDisplay(aiProcessingPreference, {
    loading: aiPreferenceLoading,
    unavailable: aiPreferenceUnavailable,
    guest: isGuest,
  });
  const refinementCounts = getRefinementCounts(profile);
  const entering = (delay: number) => reduceMotion
    ? undefined
    : FadeInDown.delay(delay).duration(200);
  const categoryCount = new Set(wardrobeItems.map(item => item.category)).size;
  const dnaItems = [
    profile.bodyType ? bodyTypeLabels[profile.bodyType] : null,
    profile.eyeColor ? eyeColorLabels[profile.eyeColor] : null,
    profile.skinTone
      ? `${skinToneLabels[profile.skinTone]} · ${undertoneLabels[profile.undertone || ''] || ''}`.trim()
      : null,
    profile.styleGoalPrimary ? styleGoalLabels[profile.styleGoalPrimary] : null,
    profile.styleGoalSecondary ? styleGoalLabels[profile.styleGoalSecondary] : null,
  ].filter((item): item is string => Boolean(item));
  const showEmptyWardrobe = shouldShowBeginWardrobe(wardrobeTotalCount) &&
    wardrobeHistoryReady && !wardrobeLoadError && !isLoading;
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + webTopInset }]}>
      {(dataUnavailable || entitlementUnavailable) && (
        <AmodkaErrorState type="network" onRetry={retryInitialization} />
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {wardrobeLoadError && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (wardrobeLoadStarted.current) return;
              wardrobeLoadStarted.current = true;
              setWardrobeLoadError(false);
              setWardrobeHistoryReady(false);
              void loadAllWardrobeItems()
                .then(handleWardrobeHistoryLoaded)
                .catch(handleWardrobeHistoryFailed);
            }}
            style={styles.loadError}
          >
            <Text style={styles.errorText}>Wardrobe item details could not be loaded. Tap to retry.</Text>
          </Pressable>
        )}

        <Animated.View entering={entering(0)} style={styles.identity}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                accessibilityLabel="Your name"
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={saveName}
                placeholder="Your name"
                placeholderTextColor={MUTED_TEXT}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save name"
                onPress={saveName}
                hitSlop={8}
                style={styles.editAction}
              >
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel name edit"
                onPress={() => setEditingName(false)}
                hitSlop={8}
                style={styles.editAction}
              >
                <Ionicons name="close-circle-outline" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit name"
                onPress={() => { setNameInput(profile.name || ''); setEditingName(true); }}
                hitSlop={6}
                style={styles.avatarWrap}
              >
                <View style={styles.avatarCircle}>
                  {initials
                    ? <Text style={styles.avatarInitials}>{initials}</Text>
                    : <MaterialCommunityIcons name="hanger" size={28} color={Colors.primary} />}
                </View>
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                </View>
              </Pressable>
              <Text style={styles.heroName}>{profile.name || 'Style Explorer'}</Text>
            </>
          )}
          {userEmail ? <Text style={styles.heroEmail}>{userEmail}</Text> : null}
          <View style={[styles.planPill, isPremium && styles.planPillPremium]}>
            <Text style={[styles.planPillText, isPremium && styles.planPillTextPremium]}>
              {getPlanPillLabel(isPremium)}
            </Text>
          </View>
        </Animated.View>

        {!isPremium && (
          <Animated.View entering={entering(40)} style={styles.membershipCard}>
            <View style={styles.membershipHeading}>
              <Ionicons name="star" size={18} color={Colors.secondary} />
              <View style={styles.membershipCopy}>
                <Text style={styles.rowTitle}>Unlock Amodka Premium</Text>
                <Text style={styles.rowSubtitle}>Everything you need for a complete wardrobe</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (isGuest) {
                  dialog.alert(
                    'Sign in to access Premium',
                    'Create a free account or sign in to unlock Premium features and save your wardrobe.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sign in', onPress: () => router.replace('/sign-in') },
                    ],
                  );
                  return;
                }
                router.push('/premium');
              }}
              style={({ pressed }) => [styles.membershipButton, pressed && styles.pressed]}
            >
              <Text style={styles.membershipButtonText}>Upgrade to Premium</Text>
            </Pressable>
          </Animated.View>
        )}

        {showEmptyWardrobe ? (
          <Animated.View entering={entering(80)} style={styles.statsCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/add-item')}
              style={({ pressed }) => [styles.beginWardrobeRow, pressed && styles.pressed]}
            >
              <View style={styles.beginCopy}>
                <Text style={styles.rowTitle}>Begin your wardrobe</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={entering(80)} style={styles.statsCard}>
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{wardrobeTotalCount}</Text>
              <Text style={styles.statLabel}>Items</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{categoryCount}</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{wearHistory.length}</Text>
              <Text style={styles.statLabel}>Looks worn</Text>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={entering(120)} style={styles.section}>
          <SectionLabel>Style DNA</SectionLabel>
          <View style={styles.card}>
            {dnaItems.length > 0 ? (
              <View style={styles.dnaList}>
                {dnaItems.map(item => (
                  <View key={item} style={styles.dnaChip}>
                    <Text style={styles.dnaText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.cardHint}>Complete your style quiz to populate this.</Text>
            )}
            <ProfileRow
              title="Redo Style Quiz"
              icon="refresh-outline"
              onPress={() => router.push('/onboarding')}
              trailing={<Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />}
            />
          </View>
        </Animated.View>

        <Animated.View entering={entering(160)} style={styles.section}>
          <SectionLabel>Preferences</SectionLabel>
          <View style={styles.card}>
            <View style={styles.preferenceRow}>
              <View style={styles.navCopy}>
                <Text style={styles.rowTitle}>Weather-aware outfits</Text>
                <Text style={styles.rowSubtitle}>
                  {weather
                    ? `Today: ${formatTemp(weather.currentTempC, effectiveTempUnit)} · L${formatTempValue(weather.lowC, effectiveTempUnit)}/H${formatTempValue(weather.highC, effectiveTempUnit)}${effectiveTempUnit === 'F' ? '\u00b0F' : '\u00b0'}${weather.precipProbability >= 0.6 ? ' · Rain likely' : ''}`
                    : 'Tailor outerwear to today’s forecast.'}
                </Text>
              </View>
              <Switch
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                value={profile.weatherEnabled !== false}
                onValueChange={value => {
                  void Haptics.selectionAsync();
                  setWeatherEnabled(value);
                }}
                accessibilityRole="switch"
                accessibilityLabel="Weather-aware outfits"
                accessibilityState={{ checked: profile.weatherEnabled !== false }}
                trackColor={{ true: Colors.primary, false: Colors.border }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={styles.insetDivider} />
            <View style={styles.unitRow}>
              <Text style={styles.rowTitle}>Temperature unit</Text>
              <View style={styles.unitSegment}>
                {(['C', 'F'] as const).map(unit => (
                  <UnitChoice
                    key={unit}
                    label={`°${unit}`}
                    selected={effectiveTempUnit === unit}
                    onPress={() => updateProfile({ tempUnit: unit })}
                  />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={entering(200)} style={styles.section}>
          <SectionLabel>Activity</SectionLabel>
          <View style={styles.card}>
            <ProfileRow
              title="Wear Log"
              subtitle={wearHistory.length === 0
                ? 'Track outfits you wear each day'
                : `${wearHistory.length} outfit${wearHistory.length === 1 ? '' : 's'} logged`}
              icon="calendar-outline"
              onPress={() => router.push('/wear-log')}
            />
            <View style={styles.insetDivider} />
            <ProfileRow
              title="Personal Intelligence"
              subtitle={getPersonalIntelligenceSubtitle(affinityActive, affinitySignalCount)}
              icon="sparkles-outline"
              onPress={() => router.push('/personal-intelligence')}
            />
            <View style={styles.insetDivider} />
            <ProfileRow
              title="Refinements"
              subtitle={getRefinementSummary(refinementCounts)}
              icon="options-outline"
              onPress={() => router.push('/refinements')}
            />
          </View>
        </Animated.View>

        <Animated.View entering={entering(240)} style={styles.section}>
          <SectionLabel>Privacy</SectionLabel>
          <View style={styles.card}>
            <View style={styles.aiRow}>
              <View style={styles.aiCopy}>
                <Text style={styles.rowTitle}>AI Processing</Text>
                <Text style={styles.rowSubtitle}>
                  Allow AI services to prepare and identify garment photos. Turning this off prevents future processing; it does not remove existing wardrobe items or images.
                </Text>
                {aiDisplay.caption ? <Text style={styles.aiCaption}>{aiDisplay.caption}</Text> : null}
              </View>
              <Switch
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                value={aiDisplay.value}
                onValueChange={changeAiProcessingPreference}
                disabled={isGuest || aiPreferenceLoading || aiPreferenceSaving || aiPreferenceUnavailable}
                accessibilityRole="switch"
                accessibilityLabel="AI Processing"
                accessibilityState={{
                  checked: aiDisplay.value,
                  disabled: isGuest || aiPreferenceLoading || aiPreferenceSaving || aiPreferenceUnavailable,
                }}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
            {aiPreferenceLoading && <ActivityIndicator size="small" color={Colors.primary} />}
            {aiPreferenceError && <Text style={styles.errorText}>{aiPreferenceError}</Text>}
            {aiPreferenceUnavailable && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAiPreferenceRetry(value => value + 1)}
                style={styles.noteLink}
              >
                <Text style={styles.linkText}>Try loading your preference again</Text>
              </Pressable>
            )}
            {isGuest && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/sign-in')}
                style={styles.noteLink}
              >
                <Text style={styles.linkText}>Sign in to save this preference to your account</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={entering(280)} style={styles.section}>
          <SectionLabel>Account</SectionLabel>
          <View style={styles.card}>
            <ProfileRow
              title="Sign out"
              icon="log-out-outline"
              onPress={handleSignOut}
              accessibilityLabel="Sign out of Amodka"
              trailing={null}
            />
            {isPremium && (
              <>
                <View style={styles.insetDivider} />
                <ProfileRow
                  title="Amodka Premium"
                  icon="person-outline"
                  onPress={() => router.push('/premium')}
                  trailing={<Text style={styles.manageText}>Manage</Text>}
                />
                <View style={styles.insetDivider} />
                <ProfileRow
                  title="Deep Diagnostics"
                  subtitle="Wardrobe health score & gap analysis"
                  icon="analytics-outline"
                  onPress={() => router.push('/diagnostics')}
                />
                <View style={styles.insetDivider} />
                <ProfileRow
                  title="Wardrobe Blueprint"
                  subtitle="Essential pieces for your style goal"
                  icon="map-outline"
                  onPress={() => router.push('/blueprint')}
                />
              </>
            )}
          </View>
          {!isGuest && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete your Amodka account"
              onPress={handleDeleteAccount}
              style={({ pressed }) => [styles.deleteRow, pressed && styles.pressed]}
            >
              <Text style={styles.deleteText}>Delete account</Text>
            </Pressable>
          )}
        </Animated.View>
        <Text style={styles.version}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <View style={styles.bottomSpace} />
      </ScrollView>
      <AiProcessingConsent
        visible={showAiConsent}
        busy={aiPreferenceSaving}
        onAllow={allowProfileAiProcessing}
        onCancel={declineProfileAiProcessing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  identity: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  avatarWrap: { width: 88, height: 88, marginBottom: 12 },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  avatarInitials: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 30,
    letterSpacing: -0.5,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroName: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: 'center',
    maxWidth: '100%',
  },
  heroEmail: {
    color: MUTED_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    paddingTop: 4,
    maxWidth: '100%',
  },
  planPill: {
    minHeight: 28,
    paddingHorizontal: 12,
    marginTop: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  planPillPremium: {
    borderColor: Colors.secondary + '60',
    backgroundColor: Colors.secondary + '25',
  },
  planPillText: { color: MUTED_TEXT, fontFamily: 'Inter_500Medium', fontSize: 12 },
  planPillTextPremium: { color: Colors.primary },
  nameEditRow: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    maxWidth: 250,
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 20,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.secondary,
    paddingVertical: 6,
  },
  editAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 32 },
  sectionLabel: {
    color: MUTED_TEXT,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  membershipCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 16,
  },
  membershipHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  membershipCopy: { flex: 1, gap: 3 },
  membershipButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
  },
  membershipButtonText: { color: Colors.textOnDark, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  statsCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 32,
    overflow: 'hidden',
  },
  statCell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  statNumber: {
    color: Colors.primary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 14, backgroundColor: Colors.border },
  beginWardrobeRow: {
    minHeight: 72,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  beginCopy: { flex: 1 },
  dnaList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 20 },
  dnaChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  dnaText: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 13 },
  cardHint: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    padding: 20,
  },
  navRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  navCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 16, flexShrink: 1 },
  rowSubtitle: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  manageText: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 14 },
  preferenceRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  unitRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  unitSegment: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitChoice: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  unitChoiceSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  unitChoiceText: { color: Colors.textSecondary, fontFamily: 'Inter_500Medium', fontSize: 14 },
  unitChoiceTextSelected: { color: Colors.white },
  insetDivider: { height: 1, marginHorizontal: 20, backgroundColor: Colors.border },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  aiCopy: { flex: 1, minWidth: 0, gap: 6 },
  aiCaption: { color: Colors.textSecondary, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  noteLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 6 },
  linkText: { color: Colors.primary, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  errorText: {
    color: DESTRUCTIVE_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  loadError: { minHeight: 44, justifyContent: 'center', marginTop: 12, padding: 12 },
  deleteRow: {
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  deleteText: { color: DESTRUCTIVE_TEXT, fontFamily: 'Inter_500Medium', fontSize: 16 },
  version: {
    color: MUTED_TEXT,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
  bottomSpace: { height: 20 },
  pressed: { opacity: 0.72 },
});
