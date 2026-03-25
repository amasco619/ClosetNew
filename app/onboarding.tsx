import { useState, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView, Dimensions, Platform, Image, ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp, BodyType, EyeColor, SkinTone, Undertone, StyleGoal } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const BODY_TYPE_IMAGES: Record<BodyType, ImageSourcePropType> = {
  'hourglass': require('@/assets/body_types/hourglass.png'),
  'pear': require('@/assets/body_types/pear.png'),
  'apple': require('@/assets/body_types/apple.png'),
  'rectangle': require('@/assets/body_types/rectangle.png'),
  'inverted-triangle': require('@/assets/body_types/inverted_triangle.png'),
  'athletic': require('@/assets/body_types/athletic.png'),
};

const BODY_TYPES: { id: BodyType; label: string; desc: string }[] = [
  { id: 'hourglass', label: 'Hourglass', desc: 'Balanced shoulders & hips, defined waist' },
  { id: 'pear', label: 'Pear', desc: 'Hips wider than shoulders' },
  { id: 'apple', label: 'Apple', desc: 'Fuller midsection, slimmer legs' },
  { id: 'rectangle', label: 'Rectangle', desc: 'Even proportions throughout' },
  { id: 'inverted-triangle', label: 'Inverted Triangle', desc: 'Broad shoulders, narrow hips' },
  { id: 'athletic', label: 'Athletic', desc: 'Toned & muscular build' },
];

const EYE_COLORS: { id: EyeColor; label: string; hex: string }[] = [
  { id: 'dark-brown', label: 'Dark Brown', hex: '#3B2314' },
  { id: 'light-brown', label: 'Light Brown', hex: '#8B6914' },
  { id: 'hazel', label: 'Hazel', hex: '#6B8E23' },
  { id: 'green', label: 'Green', hex: '#228B22' },
  { id: 'blue', label: 'Blue', hex: '#4169E1' },
  { id: 'grey', label: 'Grey', hex: '#708090' },
];

const SKIN_TONES: { id: SkinTone; label: string; hex: string }[] = [
  { id: 'very-light', label: 'Very Light', hex: '#FFE5CC' },
  { id: 'light', label: 'Light', hex: '#F5D0A9' },
  { id: 'medium-light', label: 'Medium Light', hex: '#D4A574' },
  { id: 'medium', label: 'Medium', hex: '#B8864E' },
  { id: 'medium-dark', label: 'Medium Dark', hex: '#8B6832' },
  { id: 'dark', label: 'Dark', hex: '#5C3D1E' },
  { id: 'very-dark', label: 'Very Dark', hex: '#3B2506' },
];

const UNDERTONES: { id: Undertone; label: string; desc: string }[] = [
  { id: 'cool', label: 'Cool', desc: 'Pink/blue veins, silver looks best' },
  { id: 'neutral', label: 'Neutral', desc: 'Mix of blue & green veins' },
  { id: 'warm', label: 'Warm', desc: 'Green veins, gold looks best' },
];

const STYLE_GOALS: { id: StyleGoal; label: string; desc: string; icon: string }[] = [
  { id: 'youthful', label: 'Youthful', desc: 'Fresh, trendy, energetic looks', icon: 'sunny-outline' },
  { id: 'elevated', label: 'Elevated', desc: 'Polished, put-together, refined', icon: 'trending-up-outline' },
  { id: 'minimal', label: 'Minimal', desc: 'Clean lines, capsule wardrobe', icon: 'remove-outline' },
  { id: 'romantic', label: 'Romantic', desc: 'Soft, feminine, flowing silhouettes', icon: 'flower-outline' },
  { id: 'bold', label: 'Bold', desc: 'Statement pieces, strong colours', icon: 'flash-outline' },
  { id: 'classic', label: 'Classic', desc: 'Timeless, elegant, traditional', icon: 'shield-outline' },
];

const TOTAL_STEPS = 6;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { updateProfile, profile } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name || '');
  const [bodyType, setBodyType] = useState<BodyType | null>(profile.bodyType);
  const [eyeColor, setEyeColor] = useState<EyeColor | null>(profile.eyeColor);
  const [skinTone, setSkinTone] = useState<SkinTone | null>(profile.skinTone);
  const [undertone, setUndertone] = useState<Undertone | null>(profile.undertone);
  const [styleGoalPrimary, setStyleGoalPrimary] = useState<StyleGoal | null>(profile.styleGoalPrimary);
  const [styleGoalSecondary, setStyleGoalSecondary] = useState<StyleGoal | null>(profile.styleGoalSecondary);
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const canProceed = () => {
    switch (step) {
      case 0: return true;
      case 1: return !!bodyType;
      case 2: return !!eyeColor;
      case 3: return !!skinTone && !!undertone;
      case 4: return !!styleGoalPrimary;
      case 5: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      updateProfile({
        name: name || 'Style Explorer',
        bodyType,
        eyeColor,
        skinTone,
        undertone,
        styleGoalPrimary,
        styleGoalSecondary,
        onboardingComplete: true,
      });
      router.replace('/(tabs)');
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <View style={styles.welcomeIcon}>
              <MaterialCommunityIcons name="hanger" size={48} color={Colors.secondary} />
            </View>
            <Text style={styles.stepTitle}>Welcome to AuraCloset</Text>
            <Text style={styles.stepSubtitle}>Your quiet-luxury stylist in your pocket. Let's learn about your style in a few quick steps.</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>What should we call you?</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Your name"
                placeholderTextColor={Colors.textLight}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          </Animated.View>
        );
      case 1:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Body Shape</Text>
            <Text style={styles.stepSubtitle}>This helps us recommend the most flattering silhouettes</Text>
            <View style={styles.optionsGrid}>
              {BODY_TYPES.map(bt => (
                <Pressable
                  key={bt.id}
                  style={[styles.optionCard, bodyType === bt.id && styles.optionCardSelected]}
                  onPress={() => { setBodyType(bt.id); Haptics.selectionAsync(); }}
                >
                  <Image source={BODY_TYPE_IMAGES[bt.id]} style={styles.bodyTypeImage} resizeMode="contain" />
                  <Text style={[styles.optionLabel, bodyType === bt.id && styles.optionLabelSelected]}>{bt.label}</Text>
                  <Text style={styles.optionDesc}>{bt.desc}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Eye Color</Text>
            <Text style={styles.stepSubtitle}>We'll suggest jewelry and colours that complement your eyes</Text>
            <View style={styles.eyeGrid}>
              {EYE_COLORS.map(ec => (
                <Pressable
                  key={ec.id}
                  style={[styles.eyeCard, eyeColor === ec.id && styles.eyeCardSelected]}
                  onPress={() => { setEyeColor(ec.id); Haptics.selectionAsync(); }}
                >
                  <View style={[styles.eyeSwatch, { backgroundColor: ec.hex }]}>
                    {eyeColor === ec.id && <Ionicons name="checkmark" size={18} color={Colors.white} />}
                  </View>
                  <Text style={[styles.eyeLabel, eyeColor === ec.id && { color: Colors.primary }]}>{ec.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Skin Tone & Undertone</Text>
            <Text style={styles.stepSubtitle}>For the most harmonious colour recommendations</Text>
            <Text style={styles.subLabel}>Skin Tone</Text>
            <View style={styles.skinRow}>
              {SKIN_TONES.map(st => (
                <Pressable
                  key={st.id}
                  style={[styles.skinCard, skinTone === st.id && styles.skinCardSelected]}
                  onPress={() => { setSkinTone(st.id); Haptics.selectionAsync(); }}
                >
                  <View style={[styles.skinSwatch, { backgroundColor: st.hex }]}>
                    {skinTone === st.id && <Ionicons name="checkmark" size={14} color={skinTone === 'very-light' || skinTone === 'light' ? Colors.primary : Colors.white} />}
                  </View>
                  <Text style={styles.skinLabel} numberOfLines={1}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.subLabel, { marginTop: 24 }]}>Undertone</Text>
            <View style={styles.undertoneRow}>
              {UNDERTONES.map(ut => (
                <Pressable
                  key={ut.id}
                  style={[styles.undertoneCard, undertone === ut.id && styles.undertoneCardSelected]}
                  onPress={() => { setUndertone(ut.id); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.undertoneLabel, undertone === ut.id && styles.undertoneLabelSelected]}>{ut.label}</Text>
                  <Text style={styles.undertoneDesc}>{ut.desc}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        );
      case 4:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Style Goals</Text>
            <Text style={styles.stepSubtitle}>Pick your primary style, and optionally a secondary one</Text>
            <View style={styles.styleGrid}>
              {STYLE_GOALS.map(sg => {
                const isPrimary = styleGoalPrimary === sg.id;
                const isSecondary = styleGoalSecondary === sg.id;
                const isSelected = isPrimary || isSecondary;
                return (
                  <Pressable
                    key={sg.id}
                    style={[styles.styleCard, isSelected && styles.styleCardSelected]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (isPrimary) {
                        setStyleGoalPrimary(styleGoalSecondary);
                        setStyleGoalSecondary(null);
                      } else if (isSecondary) {
                        setStyleGoalSecondary(null);
                      } else if (!styleGoalPrimary) {
                        setStyleGoalPrimary(sg.id);
                      } else if (!styleGoalSecondary) {
                        setStyleGoalSecondary(sg.id);
                      } else {
                        setStyleGoalSecondary(sg.id);
                      }
                    }}
                  >
                    <Ionicons name={sg.icon as any} size={24} color={isSelected ? Colors.secondary : Colors.textLight} />
                    <Text style={[styles.styleLabel, isSelected && styles.styleLabelSelected]}>{sg.label}</Text>
                    <Text style={styles.styleDesc}>{sg.desc}</Text>
                    {isPrimary && <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>Primary</Text></View>}
                    {isSecondary && <View style={styles.secondaryBadge}><Text style={styles.secondaryBadgeText}>Secondary</Text></View>}
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        );
      case 5:
        return (
          <Animated.View entering={FadeInRight.duration(400)} style={styles.stepContent}>
            <View style={styles.finishIcon}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            </View>
            <Text style={styles.stepTitle}>You're all set!</Text>
            <Text style={styles.stepSubtitle}>
              We've personalised AuraCloset for your {bodyType ? BODY_TYPES.find(b => b.id === bodyType)?.label : ''} shape
              {styleGoalPrimary ? ` with a ${STYLE_GOALS.find(s => s.id === styleGoalPrimary)?.label} aesthetic` : ''}.
              Start adding items to your wardrobe to see outfit recommendations.
            </Text>
          </Animated.View>
        );
      default: return null;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        {step > 0 ? (
          <Pressable onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
          ))}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {renderStep()}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}>
        <Pressable
          style={[styles.nextButton, !canProceed() && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!canProceed()}
        >
          <Text style={styles.nextButtonText}>
            {step === TOTAL_STEPS - 1 ? 'Get Started' : 'Continue'}
          </Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  progressDotActive: { backgroundColor: Colors.secondary },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  stepContent: { flex: 1, paddingTop: 12 },
  welcomeIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.secondary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 24, alignSelf: 'center' },
  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.primary, marginBottom: 8, letterSpacing: -0.5 },
  stepSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  inputWrap: { marginTop: 8 },
  inputLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary, marginBottom: 8, letterSpacing: 0.3 },
  textInput: { fontFamily: 'Inter_500Medium', fontSize: 16, color: Colors.primary, backgroundColor: Colors.white, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionCard: { width: (width - 58) / 2, backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' as const },
  optionCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  bodyTypeImage: { width: 80, height: 90, marginBottom: 4 },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginTop: 8 },
  optionLabelSelected: { color: Colors.secondary },
  optionDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  eyeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  eyeCard: { width: (width - 72) / 3, backgroundColor: Colors.white, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  eyeCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  eyeSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  eyeLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  subLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginBottom: 12 },
  skinRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skinCard: { alignItems: 'center', backgroundColor: Colors.white, borderRadius: 12, padding: 8, borderWidth: 1.5, borderColor: Colors.border, width: (width - 104) / 4 },
  skinCardSelected: { borderColor: Colors.secondary },
  skinSwatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  skinLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: Colors.textSecondary, textAlign: 'center' },
  undertoneRow: { gap: 10 },
  undertoneCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  undertoneCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  undertoneLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  undertoneLabelSelected: { color: Colors.secondary },
  undertoneDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  styleCard: { width: (width - 58) / 2, backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  styleCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  styleLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.primary, marginTop: 8 },
  styleLabelSelected: { color: Colors.secondary },
  styleDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  primaryBadge: { marginTop: 6, backgroundColor: Colors.secondary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  primaryBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.secondary },
  secondaryBadge: { marginTop: 6, backgroundColor: Colors.sage + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  secondaryBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.sage },
  finishIcon: { alignSelf: 'center', marginBottom: 20, marginTop: 40 },
  footer: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: Colors.background },
  nextButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16 },
  nextButtonDisabled: { opacity: 0.4 },
  nextButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.white },
});
