import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  Pressable, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Dimensions
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeInDown, 
  FadeInUp, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing,
  withSpring
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

type AuthMode = 'signin' | 'signup';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ method?: string }>();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeInput, setActiveInput] = useState<'email' | 'password' | null>(null);

  // Background Ken Burns Motion
  const bgScale = useSharedValue(1);

  useEffect(() => {
    bgScale.value = withRepeat(
      withTiming(1.08, { duration: 16000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const animatedBgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
  }));

  const handleTabSwitch = (newMode: AuthMode) => {
    if (mode === newMode) return;
    Haptics.selectionAsync();
    setMode(newMode);
  };

  const handleSocialAuth = (provider: 'google' | 'apple') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Execute OAuth PKCE flow via lib/auth.ts
  };

  const handleSubmit = () => {
    if (!email || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Execute Supabase Auth sign in / up
  };

  const isSignIn = mode === 'signin';

  return (
    <View style={styles.container}>
      {/* Persistent Atmospheric Background Canvas (§2 & §4) */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
        <Image
          source={require('../assets/images/closet.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>

      {/* Deepened Navy Scrim for Form Input Readability */}
      <LinearGradient
        colors={['rgba(16, 24, 38, 0.55)', 'rgba(16, 24, 38, 0.88)', 'rgba(16, 24, 38, 0.98)']}
        locations={[0, 0.35, 0.85]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Navigation Bar */}
      <View style={[styles.topNav, { paddingTop: Math.max(insets.top + 10, 36) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 48) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Brand Group */}
          <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.headerGroup}>
            <Text style={styles.brandAtelier}>A U R A C L O S E T   A T E L I E R</Text>
            <Text style={styles.title}>AuraCloset</Text>
            <Text style={styles.tagline}>Your quiet-luxury stylist in your pocket.</Text>
          </Animated.View>

          {/* Biometric One-Tap OAuth Group */}
          <Animated.View entering={FadeInDown.delay(100).duration(280)} style={styles.socialStack}>
            <Pressable onPress={() => handleSocialAuth('google')} style={styles.pressableContainer}>
              <View style={styles.socialCard}>
                <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="logo-google" size={18} color="#FFFFFF" style={styles.socialIcon} />
                <Text style={styles.socialText}>Continue with Google</Text>
              </View>
            </Pressable>

            <Pressable onPress={() => handleSocialAuth('apple')} style={styles.pressableContainer}>
              <View style={[styles.socialCard, styles.appleHighlight]}>
                <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="logo-apple" size={20} color={Colors.secondary} style={styles.socialIcon} />
                <Text style={styles.socialText}>Continue with Apple</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Divider */}
          <Animated.View entering={FadeInDown.delay(160).duration(280)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Tab Switcher */}
          <Animated.View entering={FadeInDown.delay(200).duration(280)} style={styles.tabContainer}>
            <Pressable onPress={() => handleTabSwitch('signin')} style={styles.tab}>
              <Text style={[styles.tabLabel, isSignIn && styles.tabLabelActive]}>Sign in</Text>
              {isSignIn && <View style={styles.activeIndicator} />}
            </Pressable>

            <Pressable onPress={() => handleTabSwitch('signup')} style={styles.tab}>
              <Text style={[styles.tabLabel, !isSignIn && styles.tabLabelActive]}>Create account</Text>
              {!isSignIn && <View style={styles.activeIndicator} />}
            </Pressable>
          </Animated.View>

          {/* Frosted Glass Form Group */}
          <Animated.View entering={FadeInDown.delay(240).duration(280)} style={styles.formStack}>
            
            {/* Email Field */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Email address *</label>
              <View style={[styles.glassInputContainer, activeInput === 'email' && styles.inputFocused]}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TextInput
                  style={styles.textInput}
                  placeholder="stylist@auracloset.com"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setActiveInput('email')}
                  onBlur={() => setActiveInput(null)}
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Password *</label>
              <View style={[styles.glassInputContainer, activeInput === 'password' && styles.inputFocused]}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••••••"
                  placeholderTextColor="rgba(255, 255, 255, 0.35)"
                  secureTextEntry={true}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setActiveInput('password')}
                  onBlur={() => setActiveInput(null)}
                />
                <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.4)" style={styles.eyeIcon} />
              </View>
            </View>

            {/* Submit CTA Button */}
            <Animated.View entering={FadeInUp.delay(300).duration(280)} style={styles.submitContainer}>
              <Pressable
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.submitButton,
                  pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }
                ]}
              >
                <Text style={styles.submitText}>{isSignIn ? 'Sign in' : 'Create account'}</Text>
              </Pressable>
            </Animated.View>

            {/* Forgot Password Link */}
            {isSignIn && (
              <Pressable onPress={() => {}} hitSlop={12} style={styles.forgotContainer}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  topNav: {
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  headerGroup: {
    marginBottom: 28,
  },
  brandAtelier: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.secondary,
    letterSpacing: 4.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  socialStack: {
    gap: 12,
    marginBottom: 24,
  },
  pressableContainer: {
    width: '100%',
    height: 52,
  },
  socialCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleHighlight: {
    backgroundColor: 'rgba(208, 184, 146, 0.12)',
    borderColor: 'rgba(208, 184, 146, 0.4)',
  },
  socialIcon: {
    marginRight: 10,
  },
  socialText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dividerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 24,
  },
  tab: {
    paddingBottom: 12,
    position: 'relative',
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  tabLabelActive: {
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.secondary,
  },
  formStack: {
    gap: 18,
  },
  fieldWrapper: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  glassInputContainer: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFocused: {
    borderColor: Colors.secondary,
  },
  textInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 18,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: '#FFFFFF',
  },
  eyeIcon: {
    paddingRight: 16,
  },
  submitContainer: {
    marginTop: 6,
  },
  submitButton: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  submitText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.primary,
  },
  forgotContainer: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  forgotText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.sage,
  },
});
