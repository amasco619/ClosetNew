import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView, Dimensions, Platform } from 'react-native';
import Svg, { Circle, Path, Line, Ellipse, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, BodyType, EyeColor, SkinTone, Undertone, StyleGoal } from '@/contexts/AppContext';
import type { HairColor, HeightBand, ContrastLevel, MoodGoal, LifePhase, MetalPreference, Industry, FaceShape } from '@/constants/types';
import Colors from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInRight, FadeInUp } from 'react-native-reanimated';
import { LIFESTYLE_OPTIONS, LIFESTYLE_SCENARIOS, type LifestyleKey } from '@/constants/lifestyle';

const { width } = Dimensions.get('window');

const NAVY = '#101826';
const GOLD = '#D0B892';

function BodyTypeSVG({ id }: { id: BodyType }) {
  const accent = GOLD;
  return (
    <Svg viewBox="0 0 100 145" width={80} height={90} style={{ marginBottom: 4 }}>
      {/* Head */}
      <Circle cx={50} cy={13} r={10} fill="none" stroke={NAVY} strokeWidth={1.5} />

      {id === 'hourglass' && <>
        <Path
          d="M 45 23 L 28 40 C 24 56 38 70 39 80 C 39 92 26 100 28 105 L 32 140 L 68 140 L 72 105 C 74 100 61 92 61 80 C 62 70 76 56 72 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Line x1={37} y1={80} x2={63} y2={80} stroke={accent} strokeWidth={1.5} strokeDasharray="3 2.5" strokeLinecap="round" />
        <Line x1={28} y1={40} x2={72} y2={40} stroke={accent} strokeWidth={0.75} strokeDasharray="2 3" opacity={0.5} />
      </>}

      {id === 'pear' && <>
        <Path
          d="M 45 23 L 35 40 C 31 56 37 70 38 80 C 37 92 24 100 22 105 L 26 140 L 74 140 L 78 105 C 76 100 63 92 62 80 C 63 70 69 56 65 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Ellipse cx={50} cy={108} rx={26} ry={8} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="2.5 3" opacity={0.7} />
      </>}

      {id === 'apple' && <>
        <Path
          d="M 45 23 L 32 40 C 26 53 23 68 26 80 C 27 92 29 100 30 105 L 34 140 L 66 140 L 70 105 C 71 100 73 92 74 80 C 77 68 74 53 68 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Circle cx={50} cy={68} r={24} fill="none" stroke={accent} strokeWidth={0.9} strokeDasharray="2 3.5" opacity={0.65} />
      </>}

      {id === 'rectangle' && <>
        <Path
          d="M 45 23 L 33 40 C 31 56 32 70 33 80 C 33 92 31 100 33 105 L 36 140 L 64 140 L 67 105 C 69 100 67 92 67 80 C 68 70 69 56 67 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Rect x={33} y={40} width={34} height={65} rx={1} fill="none" stroke={accent} strokeWidth={0.9} strokeDasharray="3 2.5" opacity={0.6} />
      </>}

      {id === 'inverted-triangle' && <>
        <Path
          d="M 45 23 L 24 40 C 20 56 33 70 36 80 C 36 92 36 100 37 105 L 40 140 L 60 140 L 63 105 C 64 100 64 92 64 80 C 67 70 80 56 76 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Line x1={24} y1={40} x2={76} y2={40} stroke={accent} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1={27} y1={44} x2={73} y2={44} stroke={accent} strokeWidth={0.6} strokeDasharray="2 2.5" opacity={0.55} />
      </>}

      {id === 'athletic' && <>
        <Path
          d="M 45 23 L 28 40 C 24 55 35 68 38 80 C 37 92 29 100 31 105 L 35 140 L 65 140 L 69 105 C 71 100 63 92 62 80 C 65 68 76 55 72 40 L 55 23 Z"
          fill="rgba(16,24,38,0.05)" stroke={NAVY} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        />
        <Line x1={32} y1={57} x2={68} y2={57} stroke={accent} strokeWidth={0.9} strokeDasharray="2.5 2" opacity={0.55} strokeLinecap="round" />
        <Line x1={37} y1={80} x2={63} y2={80} stroke={accent} strokeWidth={0.9} strokeDasharray="2.5 2" opacity={0.55} strokeLinecap="round" />
      </>}
    </Svg>
  );
}

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

const HAIR_OPTS: { id: HairColor; label: string }[] = [
  { id: 'black', label: 'Black' }, { id: 'dark-brown', label: 'Dark Brown' },
  { id: 'medium-brown', label: 'Med Brown' }, { id: 'light-brown', label: 'Light Brown' },
  { id: 'blonde', label: 'Blonde' }, { id: 'red', label: 'Red' },
  { id: 'grey', label: 'Grey' }, { id: 'silver', label: 'Silver' },
];
const HEIGHT_OPTS: HeightBand[] = ['petite', 'average', 'tall'];
const CONTRAST_OPTS: ContrastLevel[] = ['low', 'medium', 'high'];
const MOOD_OPTS: MoodGoal[] = ['confident', 'soft', 'joyful', 'grounded', 'romantic', 'powerful'];
const METAL_OPTS: MetalPreference[] = ['gold', 'silver', 'rose-gold', 'mixed'];
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

const FACE_SHAPES: { id: FaceShape; label: string; desc: string }[] = [
  { id: 'oval',   label: 'Oval',   desc: 'Balanced proportions, slightly wider at cheeks' },
  { id: 'round',  label: 'Round',  desc: 'Equal width and length, soft angles' },
  { id: 'square', label: 'Square', desc: 'Strong jaw, equal width throughout' },
  { id: 'heart',  label: 'Heart',  desc: 'Wider forehead, narrow chin' },
  { id: 'oblong', label: 'Oblong', desc: 'Longer than wide, narrow throughout' },
];

const FACE_SHAPE_STYLE: Record<FaceShape, { width: number; height: number; borderRadius: number }> = {
  oval:   { width: 52, height: 72, borderRadius: 26 },
  round:  { width: 64, height: 64, borderRadius: 32 },
  square: { width: 64, height: 68, borderRadius: 8 },
  heart:  { width: 64, height: 70, borderRadius: 32 },
  oblong: { width: 44, height: 80, borderRadius: 22 },
};

function deriveContrast(skin: SkinTone | null, hair: HairColor | null): ContrastLevel | null {
  if (!skin || !hair) return null;
  const isLightSkin = skin === 'very-light' || skin === 'light' || skin === 'medium-light';
  const isDarkSkin = skin === 'dark' || skin === 'very-dark';
  const isDarkHair = hair === 'black' || hair === 'dark-brown';
  const isLightHair = hair === 'blonde' || hair === 'light-brown' || hair === 'grey' || hair === 'silver';
  if ((isLightSkin && isDarkHair) || (isDarkSkin && isLightHair)) return 'high';
  if (isLightSkin && isLightHair) return 'low';
  if (isDarkSkin && isDarkHair) return 'medium';
  return 'medium';
}

const TOTAL_STEPS = 9;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { updateProfile, profile } = useApp();
  const params = useLocalSearchParams<{ guest?: string }>();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.name || '');
  const [nameFocused, setNameFocused] = useState(false);
  const [bodyType, setBodyType] = useState<BodyType | null>(profile.bodyType);
  const [faceShape, setFaceShape] = useState<FaceShape | null>(profile.faceShape ?? null);
  const [eyeColor, setEyeColor] = useState<EyeColor | null>(profile.eyeColor);
  const [skinTone, setSkinTone] = useState<SkinTone | null>(profile.skinTone);
  const [undertone, setUndertone] = useState<Undertone | null>(profile.undertone);
  const [styleGoalPrimary, setStyleGoalPrimary] = useState<StyleGoal | null>(profile.styleGoalPrimary);
  const [styleGoalSecondary, setStyleGoalSecondary] = useState<StyleGoal | null>(profile.styleGoalSecondary);
  const [hairColor, setHairColor] = useState<HairColor | null>(profile.hairColor ?? null);
  const [heightBand, setHeightBand] = useState<HeightBand | null>(profile.heightBand ?? null);
  const [contrastLevel, setContrastLevel] = useState<ContrastLevel | null>(profile.contrastLevel ?? null);
  const [contrastManual, setContrastManual] = useState<boolean>(!!profile.contrastLevel);
  const [defaultMood, setDefaultMood] = useState<MoodGoal | null>(profile.defaultMood ?? null);
  const [industry, setIndustry] = useState<Industry>(profile.industry ?? 'unspecified');
  const [lifePhase, setLifePhase] = useState<LifePhase | null>(profile.lifePhase ?? null);
  const [metalPreference, setMetalPreference] = useState<MetalPreference | null>(profile.metalPreference ?? null);
  const [colorAversions, setColorAversions] = useState<string[]>(profile.constraints.colorAversions ?? []);
  const [lifestyleAlloc, setLifestyleAlloc] = useState<Record<LifestyleKey, number>>({
    work:   profile.lifestyleWork   ?? 40,
    casual: profile.lifestyleCasual ?? 40,
    events: profile.lifestyleEvents ?? 20,
    active: profile.lifestyleActive ?? 0,
    brunch: profile.lifestyleBrunch ?? 0,
  });
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const derivedContrast = deriveContrast(skinTone, hairColor);
  const effectiveContrast = contrastManual ? contrastLevel : derivedContrast;

  const canProceed = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return !!bodyType;
      case 2: return true;
      case 3: return !!eyeColor;
      case 4: return !!skinTone && !!undertone;
      case 5: return !!styleGoalPrimary;
      case 6: return true;
      case 7: return true;
      case 8: return true;
      default: return true;
    }
  };

  const toggleAversion = (c: string) => {
    setColorAversions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  const skipStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      updateProfile({
        name: name.trim(),
        bodyType,
        faceShape,
        eyeColor,
        skinTone,
        undertone,
        styleGoalPrimary,
        styleGoalSecondary,
        lifestyleWork:   lifestyleAlloc.work,
        lifestyleCasual: lifestyleAlloc.casual,
        lifestyleEvents: lifestyleAlloc.events,
        lifestyleActive: lifestyleAlloc.active,
        lifestyleBrunch: lifestyleAlloc.brunch,
        hairColor,
        heightBand,
        contrastLevel: effectiveContrast,
        defaultMood,
        lifePhase,
        metalPreference,
        industry,
        constraints: { ...profile.constraints, colorAversions },
        onboardingComplete: true,
        ...(params.guest === 'true' && { isGuest: true }),
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
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            {/* Atelier Monogram Badge */}
            <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.monogramBadge}>
              <Text style={styles.monogramSymbol}>◆</Text>
            </Animated.View>

            {/* Luxury headline */}
            <Animated.View entering={FadeInDown.delay(120).duration(280)} style={styles.nameHeaderGroup}>
              <Text style={styles.stepTitle}>May we have your name?</Text>
              <Text style={styles.stepSubtitle}>
                To begin your personal calibration, how should your quiet-luxury stylist address you?
              </Text>
            </Animated.View>

            {/* Elevated Surface Input */}
            <Animated.View entering={FadeInDown.delay(180).duration(280)}>
              <TextInput
                style={[styles.textInput, nameFocused && styles.textInputFocused]}
                placeholder="Your name"
                placeholderTextColor="rgba(16,24,38,0.30)"
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </Animated.View>
          </Animated.View>
        );
      case 1:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Body Shape</Text>
            <Text style={styles.stepSubtitle}>This helps us recommend the most flattering silhouettes</Text>
            <View style={styles.optionsGrid}>
              {BODY_TYPES.map(bt => (
                <Pressable
                  key={bt.id}
                  style={[styles.optionCard, bodyType === bt.id && styles.optionCardSelected]}
                  onPress={() => { setBodyType(bt.id); Haptics.selectionAsync(); }}
                >
                  <BodyTypeSVG id={bt.id} />
                  <Text style={[styles.optionLabel, bodyType === bt.id && styles.optionLabelSelected]}>{bt.label}</Text>
                  <Text style={styles.optionDesc}>{bt.desc}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Face Shape</Text>
            <Text style={styles.stepSubtitle}>Helps us suggest necklines that flatter your features. You can skip this.</Text>
            <View style={styles.optionsGrid}>
              {FACE_SHAPES.map(fs => {
                const shapeStyle = FACE_SHAPE_STYLE[fs.id];
                const selected = faceShape === fs.id;
                return (
                  <Pressable
                    key={fs.id}
                    style={[styles.optionCard, selected && styles.optionCardSelected]}
                    onPress={() => { setFaceShape(selected ? null : fs.id); Haptics.selectionAsync(); }}
                  >
                    <View style={styles.faceShapeIllustration}>
                      <View
                        style={[
                          styles.faceShapeOutline,
                          {
                            width: shapeStyle.width,
                            height: shapeStyle.height,
                            borderRadius: shapeStyle.borderRadius,
                            borderColor: selected ? Colors.secondary : Colors.textLight,
                          },
                          fs.id === 'heart' && styles.faceShapeHeart,
                        ]}
                      />
                    </View>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{fs.label}</Text>
                    <Text style={styles.optionDesc}>{fs.desc}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.skipRow} onPress={skipStep}>
              <Text style={styles.skipText}>{"Skip — I'll decide later"}</Text>
            </Pressable>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Eye Color</Text>
            <Text style={styles.stepSubtitle}>{"We'll suggest jewelry and colours that complement your eyes"}</Text>
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
      case 4:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
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
      case 5:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
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
      case 6:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>Your Lifestyle</Text>
            <Text style={styles.stepSubtitle}>{"How often do you dress for each occasion? We'll tailor your wardrobe blueprint accordingly."}</Text>
            {LIFESTYLE_SCENARIOS.map(scenario => (
              <View key={scenario.key} style={styles.lifestyleRow}>
                <View style={styles.lifestyleRowHeader}>
                  <Text style={styles.lifestyleLabel}>{scenario.label}</Text>
                  <Text style={styles.lifestyleDesc}>{scenario.desc}</Text>
                </View>
                <View style={styles.lifestyleChips}>
                  {LIFESTYLE_OPTIONS.map(opt => {
                    const active = lifestyleAlloc[scenario.key] === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLifestyleAlloc(prev => ({ ...prev, [scenario.key]: opt.value }));
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Pressable style={styles.skipRow} onPress={skipStep}>
              <Text style={styles.skipText}>Skip — use defaults</Text>
            </Pressable>
          </Animated.View>
        );
      case 7:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <Text style={styles.stepTitle}>A few finishing touches</Text>
            <Text style={styles.stepSubtitle}>Optional — each one sharpens your recommendations. You can skip anything.</Text>

            <Text style={styles.subLabel}>Hair</Text>
            <View style={styles.chipRow}>
              {HAIR_OPTS.map(h => {
                const active = hairColor === h.id;
                return (
                  <Pressable key={h.id} onPress={() => { Haptics.selectionAsync(); setHairColor(active ? null : h.id); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{h.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Height</Text>
            <View style={styles.chipRow}>
              {HEIGHT_OPTS.map(h => {
                const active = heightBand === h;
                return (
                  <Pressable key={h} onPress={() => { Haptics.selectionAsync(); setHeightBand(active ? null : h); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {h.charAt(0).toUpperCase() + h.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>
              Contrast{derivedContrast && !contrastManual ? ` (auto: ${derivedContrast})` : ''}
            </Text>
            <View style={styles.chipRow}>
              {CONTRAST_OPTS.map(c => {
                const active = (contrastManual ? contrastLevel : derivedContrast) === c;
                return (
                  <Pressable key={c} onPress={() => {
                    Haptics.selectionAsync();
                    if (active && contrastManual) { setContrastManual(false); setContrastLevel(null); }
                    else { setContrastManual(true); setContrastLevel(c); }
                  }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Metal preference</Text>
            <View style={styles.chipRow}>
              {METAL_OPTS.map(m => {
                const active = metalPreference === m;
                return (
                  <Pressable key={m} onPress={() => { Haptics.selectionAsync(); setMetalPreference(active ? null : m); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {m === 'rose-gold' ? 'Rose gold' : m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Default mood</Text>
            <View style={styles.chipRow}>
              {MOOD_OPTS.map(m => {
                const active = defaultMood === m;
                return (
                  <Pressable key={m} onPress={() => { Haptics.selectionAsync(); setDefaultMood(active ? null : m); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Industry</Text>
            <Text style={[styles.stepSubtitle, { textAlign: 'left', marginBottom: 12 }]}>Helps tune interview formality — creatives can dress softer than corporate.</Text>
            <View style={styles.chipRow}>
              {INDUSTRY_OPTS.map(i => {
                const active = industry === i.id;
                return (
                  <Pressable key={i.id} onPress={() => { Haptics.selectionAsync(); setIndustry(i.id); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{i.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Life phase</Text>
            <View style={styles.chipRow}>
              {LIFE_PHASE_OPTS.map(l => {
                const active = lifePhase === l.id;
                return (
                  <Pressable key={l.id} onPress={() => { Haptics.selectionAsync(); setLifePhase(active ? null : l.id); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.subLabel, { marginTop: 20 }]}>Colors to avoid</Text>
            <View style={styles.chipRow}>
              {AVERSION_OPTS.map(c => {
                const active = colorAversions.includes(c);
                return (
                  <Pressable key={c} onPress={() => { Haptics.selectionAsync(); toggleAversion(c); }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable style={styles.skipRow} onPress={skipStep}>
              <Text style={styles.skipText}>{"Skip for now — I'll add these later"}</Text>
            </Pressable>
          </Animated.View>
        );
      case 8:
        return (
          <Animated.View entering={FadeInRight.duration(280)} style={styles.stepContent}>
            <View style={styles.finishIcon}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
            </View>
            <Text style={styles.stepTitle}>{"You're all set!"}</Text>
            <Text style={styles.stepSubtitle}>
              We{"'"}ve personalised AuraCloset for your {bodyType ? BODY_TYPES.find(b => b.id === bodyType)?.label : ''} shape
              {styleGoalPrimary ? ` with a ${STYLE_GOALS.find(s => s.id === styleGoalPrimary)?.label} aesthetic` : ''}.
              Start adding items to your wardrobe to see outfit recommendations.
            </Text>
          </Animated.View>
        );
      default: return null;
    }
  };

  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      {/* Top Navigation with Liquid Capsule Progress */}
      <View style={styles.topBar}>
        {(step > 0 || params.guest === 'true') ? (
          <Pressable
            onPress={step > 0 ? handleBack : () => router.back()}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
          <Text style={styles.microTracker}>
            STEP {step + 1} OF {TOTAL_STEPS}
            {step === 0 ? '  ·  PERSONAL CALIBRATION' : ''}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderStep()}
      </ScrollView>

      {/* Footer CTA */}
      <Animated.View
        entering={FadeInUp.delay(240).duration(280)}
        style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + (Platform.OS === 'web' ? 34 : 0) }]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.nextButton,
            !canProceed() && styles.nextButtonDisabled,
            pressed && canProceed() && { transform: [{ scale: 0.97 }], opacity: 0.9 },
          ]}
          onPress={handleNext}
          disabled={!canProceed()}
        >
          <Text style={[styles.nextButtonText, !canProceed() && styles.nextButtonTextDisabled]}>
            {step === TOTAL_STEPS - 1 ? 'Get Started' : 'Continue'}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color={canProceed() ? Colors.secondary : 'rgba(16,24,38,0.3)'}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Top navigation bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // Liquid capsule progress
  progressContainer: { flex: 1 },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(16, 24, 38, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.secondary,
  },
  microTracker: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.sage,
    letterSpacing: 2.5,
    marginTop: 8,
    textTransform: 'uppercase',
  },

  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  stepContent: { flex: 1, paddingTop: 12 },

  // Step 0 — Luxury name input
  monogramBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(208, 184, 146, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(208, 184, 146, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  monogramSymbol: {
    fontSize: 18,
    color: Colors.secondary,
  },
  nameHeaderGroup: {
    marginBottom: 28,
  },

  stepTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary, marginBottom: 8, letterSpacing: -0.6, lineHeight: 34 },
  stepSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },

  // Elevated Surface Input (step 0)
  textInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.primary,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(16, 24, 38, 0.1)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  textInputFocused: {
    borderColor: Colors.secondary,
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },

  // Steps 1–8 shared
  subLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginBottom: 12 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionCard: { width: (width - 58) / 2, backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' as const },
  optionCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginTop: 8 },
  optionLabelSelected: { color: Colors.secondary },
  optionDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 4, lineHeight: 15 },
  faceShapeIllustration: { width: 80, height: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  faceShapeOutline: { borderWidth: 2 },
  faceShapeHeart: { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 },
  eyeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  eyeCard: { width: (width - 72) / 3, backgroundColor: Colors.white, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  eyeCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '08' },
  eyeSwatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  eyeLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + '15' },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  chipTextActive: { color: Colors.secondary },
  lifestyleRow: { marginBottom: 16, backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  lifestyleRowHeader: { marginBottom: 10 },
  lifestyleLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary, marginBottom: 2 },
  lifestyleDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  lifestyleChips: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  skipRow: { marginTop: 24, marginBottom: 8, alignItems: 'center' as const },
  skipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textLight, textDecorationLine: 'underline' as const },
  finishIcon: { alignSelf: 'center', marginBottom: 20, marginTop: 40 },

  // Footer CTA — Navy with Champagne Gold text
  footer: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: Colors.background },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 18,
    height: 56,
    shadowColor: Colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  nextButtonDisabled: {
    backgroundColor: 'rgba(16, 24, 38, 0.12)',
    shadowOpacity: 0,
    elevation: 0,
  },
  nextButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.secondary,
    letterSpacing: -0.1,
  },
  nextButtonTextDisabled: {
    color: 'rgba(16, 24, 38, 0.30)',
  },
});
