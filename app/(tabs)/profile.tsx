import { StyleSheet, Text, View, ScrollView, Pressable, Switch, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';

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
  const { profile, updateProfile, wardrobeItems, isPremium, togglePremium } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="hanger" size={32} color={Colors.secondary} />
          </View>
          <Text style={styles.name}>{profile.name || 'Style Explorer'}</Text>
          <Text style={styles.tierLabel}>{isPremium ? 'Premium Member' : 'Free Plan'}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.statsBar}>
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

        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Text style={styles.sectionTitle}>Style Profile</Text>
          <View style={styles.card}>
            {profile.bodyType && <ProfileRow icon="body-outline" label="Body Type" value={bodyTypeLabels[profile.bodyType] || ''} />}
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

        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <Text style={styles.sectionTitle}>Constraints</Text>
          <View style={styles.card}>
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
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(500)}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.premiumRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.constraintLabel}>{isPremium ? 'Premium Active' : 'Free Plan'}</Text>
                <Text style={styles.premiumDesc}>
                  {isPremium ? 'Unlimited items, blueprint, season-smart styling' : 'Upgrade for unlimited features'}
                </Text>
              </View>
              {isPremium ? (
                <Pressable style={styles.manageBtn} onPress={togglePremium}>
                  <Text style={styles.manageBtnText}>Manage</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.upgradeBtn}
                  onPress={() => router.push('/premium')}
                >
                  <Ionicons name="star" size={16} color={Colors.white} />
                  <Text style={styles.upgradeBtnText}>Upgrade</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(500)}>
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

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20 },
  header: { alignItems: 'center', marginTop: 8, marginBottom: 20 },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.secondary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary },
  tierLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  statsBar: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 24 },
  miniStat: { flex: 1, alignItems: 'center' },
  miniStatNum: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.primary },
  miniStatLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary, marginBottom: 10, letterSpacing: -0.3 },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 4, marginBottom: 20 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  profileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },
  profileValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginTop: 2 },
  constraintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  constraintLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary },
  heelOptions: { flexDirection: 'row', gap: 6 },
  heelChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  heelChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  heelChipText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.textSecondary },
  heelChipTextActive: { color: Colors.white },
  premiumRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  premiumDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  manageBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  manageBtnText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.secondary },
  upgradeBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.white },
  redoOnboarding: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  redoText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textSecondary },
});
