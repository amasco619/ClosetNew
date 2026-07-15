import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
  AccessibilityInfo, Pressable,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSpring,
} from 'react-native-reanimated'
import {
  signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple,
  createSessionFromUrl,
  isValidEmail, validatePassword,
} from '../lib/auth'
import { useApp } from '@/contexts/AppContext'
import Colors from '@/constants/colors'

type Mode = 'sign-in' | 'sign-up'
type LoadingAction = null | 'google' | 'apple' | 'email'

function SocialButton({
  label,
  iconName,
  variant,
  loading,
  disabled,
  onPress,
  delay,
}: {
  label: string
  iconName: keyof typeof Ionicons.glyphMap
  variant: 'google' | 'apple'
  loading: boolean
  disabled: boolean
  onPress: () => void
  delay: number
}) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))
  const onPressIn = () => {
    if (disabled) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 })
    opacity.value = withSpring(0.86, { damping: 15, stiffness: 300 })
  }
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 })
    opacity.value = withSpring(1, { damping: 15, stiffness: 300 })
  }
  const isApple = variant === 'apple'

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(280)} style={styles.socialWrapper}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} style={styles.socialPressable}>
        <Animated.View style={[styles.socialCard, isApple && styles.socialCardApple, animStyle]}>
          <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
          {loading
            ? <ActivityIndicator color={isApple ? Colors.secondary : '#FFFFFF'} size="small" />
            : (
              <>
                <Ionicons
                  name={iconName}
                  size={isApple ? 20 : 18}
                  color={isApple ? Colors.secondary : '#FFFFFF'}
                  style={styles.socialIcon}
                />
                <Text style={styles.socialText}>{label}</Text>
              </>
            )
          }
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets()
  const webTop = Platform.OS === 'web' ? 67 : 0
  const { isAuthenticated } = useApp()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState<LoadingAction>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)

  // Guards the isAuthenticated effect so it only triggers navigation when the
  // user has actively pressed a sign-in button in this session. Without this,
  // a stale Supabase session restored from SecureStore on app boot would call
  // setIsAuthenticated(true) inside loadData() and auto-navigate the user away
  // from this screen before they have done anything intentional.
  const intentionalSignIn = useRef(false)

  useEffect(() => {
    if (isAuthenticated && intentionalSignIn.current) {
      router.replace('/')
    }
  }, [isAuthenticated])

  // Ken Burns subtle motion on background
  const bgScale = useSharedValue(1)
  useEffect(() => {
    bgScale.value = withRepeat(
      withTiming(1.07, { duration: 16000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [])
  const animatedBgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
  }))

  const url = Linking.useLinkingURL()
  useEffect(() => {
    if (url) createSessionFromUrl(url).catch(console.error)
  }, [url])

  const clearErrors = () => {
    setEmailError(null)
    setPasswordError(null)
    setConfirmError(null)
    setAuthError(null)
  }

  const switchMode = (m: Mode) => {
    Haptics.selectionAsync()
    setMode(m)
    clearErrors()
    setConfirmed(false)
  }

  const validateEmailField = () => {
    if (!email.trim()) { setEmailError('Email address is required.'); return false }
    if (!isValidEmail(email)) { setEmailError('Enter a valid email address.'); return false }
    setEmailError(null)
    return true
  }

  const validatePasswordField = () => {
    if (mode === 'sign-in') {
      if (!password) { setPasswordError('Password is required.'); return false }
      setPasswordError(null)
      return true
    }
    const err = validatePassword(password)
    setPasswordError(err)
    return !err
  }

  const validateConfirmField = () => {
    if (mode !== 'sign-up') return true
    if (confirmPassword !== password) { setConfirmError('Passwords do not match.'); return false }
    setConfirmError(null)
    return true
  }

  const handleEmailSubmit = async () => {
    const validEmail = validateEmailField()
    const validPassword = validatePasswordField()
    const validConfirm = mode === 'sign-up' ? validateConfirmField() : true
    if (!validEmail || !validPassword || !validConfirm) return

    setAuthError(null)
    setLoading('email')
    intentionalSignIn.current = true
    try {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password)
        // Navigation is handled by the isAuthenticated effect above once
        // onAuthStateChange fires and loadUserDataFromDB finishes. Calling
        // router.replace('/') here would navigate before the DB load is
        // complete, causing a flash of the welcome screen.
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password)
        if (needsConfirmation) {
          setConfirmed(true)
        } else {
          router.replace('/onboarding')
        }
      }
    } catch (err: any) {
      const msg = (err.message ?? '')
        .replace('[signInWithEmail] ', '')
        .replace('[signUpWithEmail] ', '')
      setAuthError(msg || 'Something went wrong.')
    } finally {
      setLoading(null)
    }
  }

  const handleGoogle = async () => {
    setAuthError(null)
    setLoading('google')
    intentionalSignIn.current = true
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setAuthError(err.message?.replace('[signInWithGoogle] ', '') ?? 'Google sign-in failed.')
    } finally {
      setLoading(null)
    }
  }

  const handleApple = async () => {
    setAuthError(null)
    setLoading('apple')
    intentionalSignIn.current = true
    try {
      await signInWithApple()
    } catch (err: any) {
      setAuthError(err.message?.replace('[signInWithApple] ', '') ?? 'Apple sign-in failed.')
    } finally {
      setLoading(null)
    }
  }

  const isSignIn = mode === 'sign-in'

  // Email-confirmed confirmation screen
  if (confirmed) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
          <Image source={require('../assets/images/closet.jpg')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
        <LinearGradient
          colors={[Colors.navyScrimTop, Colors.navyScrimAuthMid, Colors.navyScrimAuthBottom]}
          locations={[0, 0.35, 0.85]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.topNav, { paddingTop: Math.max(insets.top + 10, 36) }]}>
          <Pressable onPress={() => router.replace('/welcome')} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.confirmedBody}>
          <Text style={styles.confirmedTitle}>Check your email</Text>
          <Text style={styles.confirmedText}>
            We sent a confirmation link to{'\n'}{email}.{'\n\n'}
            Once confirmed, you can sign in.
          </Text>
          <TouchableOpacity onPress={() => switchMode('sign-in')} activeOpacity={0.82} style={styles.backLink} accessibilityRole="button">
            <Text style={styles.backLinkText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Atmospheric Background */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
        <Image
          source={require('../assets/images/closet.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>

      {/* Deepened scrim — keeps auth form readable */}
      <LinearGradient
        colors={[Colors.navyScrimTop, Colors.navyScrimAuthMid, Colors.navyScrimAuthBottom]}
        locations={[0, 0.3, 0.82]}
        style={StyleSheet.absoluteFill}
      />

      {/* Back Navigation */}
      <View style={[styles.topNav, { paddingTop: Math.max(insets.top + 10, 36) }]}>
        <Pressable onPress={() => router.replace('/welcome')} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 28, 52) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <Animated.View entering={FadeInDown.delay(40).duration(280)} style={styles.headerGroup}>
            <Text style={styles.brandAtelier}>A U R A C L O S E T   A T E L I E R</Text>
            <Text style={styles.title}>AuraCloset</Text>
            <Text style={styles.tagline}>Your quiet-luxury stylist in your pocket.</Text>
          </Animated.View>

          {/* Social Auth */}
          <View style={styles.socialStack}>
            <SocialButton label="Continue with Google" iconName="logo-google" variant="google" loading={loading === 'google'} disabled={loading !== null && loading !== 'google'} onPress={handleGoogle} delay={100} />
            <SocialButton label="Continue with Apple" iconName="logo-apple" variant="apple" loading={loading === 'apple'} disabled={loading !== null && loading !== 'apple'} onPress={handleApple} delay={160} />
          </View>

          {/* Divider */}
          <Animated.View entering={FadeInDown.delay(200).duration(280)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Sign in / Create account tabs */}
          <Animated.View entering={FadeInDown.delay(220).duration(280)} style={styles.tabContainer}>
            <TouchableOpacity onPress={() => switchMode('sign-in')} activeOpacity={0.82} style={styles.tab} accessibilityRole="button">
              <Text style={[styles.tabLabel, isSignIn && styles.tabLabelActive]}>Sign in</Text>
              {isSignIn && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => switchMode('sign-up')} activeOpacity={0.82} style={styles.tab} accessibilityRole="button">
              <Text style={[styles.tabLabel, !isSignIn && styles.tabLabelActive]}>Create account</Text>
              {!isSignIn && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.delay(260).duration(280)} style={styles.formStack}>

            {/* Email */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Email address *</Text>
              <View style={[styles.glassInputContainer, emailFocused && styles.inputFocused, !!emailError && styles.inputError]}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TextInput
                  style={styles.textInput}
                  placeholder="stylist@auracloset.com"
                  placeholderTextColor="rgba(255,255,255,0.32)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  returnKeyType="next"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => { setEmailFocused(false); validateEmailField() }}
                />
              </View>
              {emailError && <View style={styles.errorBox}><Text style={styles.errorText}>{emailError}</Text></View>}
            </View>

            {/* Password */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Password *</Text>
              <View style={[styles.glassInputContainer, passwordFocused && styles.inputFocused, !!passwordError && styles.inputError]}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TextInput
                  style={[styles.textInput, styles.textInputFlex]}
                  placeholder="••••••••••••"
                  placeholderTextColor="rgba(255,255,255,0.32)"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType={mode === 'sign-up' ? 'next' : 'done'}
                  onSubmitEditing={mode === 'sign-in' ? handleEmailSubmit : undefined}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => { setPasswordFocused(false); validatePasswordField() }}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>
              {mode === 'sign-up' && (
                <View style={styles.passwordRules}>
                  {([
                    { met: password.length >= 8, label: 'At least 8 characters' },
                    { met: /[A-Z]/.test(password), label: 'One uppercase letter' },
                    { met: /[0-9]/.test(password), label: 'One number' },
                  ] as { met: boolean; label: string }[]).map(({ met, label }) => (
                    <View key={label} style={styles.ruleRow}>
                      <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={met ? Colors.secondary : 'rgba(255,255,255,0.35)'} />
                      <Text style={[styles.ruleText, met && styles.ruleMet]}>{label}</Text>
                    </View>
                  ))}
                </View>
              )}
              {passwordError && <View style={styles.errorBox}><Text style={styles.errorText}>{passwordError}</Text></View>}
            </View>

            {/* Confirm Password (sign-up only) */}
            {mode === 'sign-up' && (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>Confirm password *</Text>
                <View style={[styles.glassInputContainer, confirmFocused && styles.inputFocused, !!confirmError && styles.inputError]}>
                  <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                  <TextInput
                    style={[styles.textInput, styles.textInputFlex]}
                    placeholder="Re-enter password"
                    placeholderTextColor="rgba(255,255,255,0.32)"
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleEmailSubmit}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setConfirmFocused(true)}
                    onBlur={() => { setConfirmFocused(false); validateConfirmField() }}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirm(v => !v)}
                    style={styles.eyeBtn}
                    hitSlop={8}
                    accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
                {confirmError && <View style={styles.errorBox}><Text style={styles.errorText}>{confirmError}</Text></View>}
              </View>
            )}

          </Animated.View>

          {/* Submit */}
          <Animated.View entering={FadeInUp.delay(300).duration(280)} style={styles.submitContainer}>
            <TouchableOpacity
              onPress={handleEmailSubmit}
              activeOpacity={0.88}
              disabled={loading === 'email'}
              style={[styles.submitBtn, loading === 'email' && styles.submitBtnDisabled]}
              accessibilityRole="button"
            >
              {loading === 'email'
                ? <ActivityIndicator color={Colors.primary} size="small" />
                : <Text style={styles.submitText}>{isSignIn ? 'Sign in' : 'Create account'}</Text>
              }
            </TouchableOpacity>
          </Animated.View>

          {/* Forgot password */}
          {isSignIn && (
            <TouchableOpacity
              onPress={() => router.push('/forgot-password')}
              activeOpacity={0.82}
              style={styles.forgotBtn}
              accessibilityRole="button"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Auth-level error */}
          {authError && (
            <View style={[styles.errorBox, styles.authErrorBox]}>
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  flex: { flex: 1 },
  topNav: {
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassBorderWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
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
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 4,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: -0.1,
  },
  socialStack: {
    gap: 12,
    marginBottom: 24,
  },
  socialWrapper: {
    width: '100%',
    height: 52,
  },
  socialPressable: { flex: 1 },
  socialCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.glassSurface,
    borderWidth: 1,
    borderColor: Colors.glassBorderWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialCardApple: {
    backgroundColor: Colors.glassSurfaceGold,
    borderColor: Colors.glassBorder,
  },
  socialIcon: { marginRight: 10 },
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
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dividerLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 24,
  },
  tab: {
    paddingBottom: 12,
    position: 'relative',
  },
  tabLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: 'rgba(255,255,255,0.40)',
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
    borderRadius: 1,
    backgroundColor: Colors.secondary,
  },
  formStack: {
    gap: 4,
  },
  fieldBlock: {
    marginBottom: 18,
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.80)',
    letterSpacing: 0.2,
  },
  glassInputContainer: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFocused: {
    borderColor: Colors.secondary,
  },
  inputError: {
    borderColor: Colors.blush,
  },
  textInput: {
    height: '100%',
    paddingHorizontal: 18,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
  },
  textInputFlex: {
    flex: 1,
  },
  eyeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordRules: {
    gap: 6,
    marginTop: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  ruleMet: {
    color: Colors.secondary,
  },
  errorBox: {
    backgroundColor: 'rgba(212,96,90,0.18)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,96,90,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  authErrorBox: {
    marginTop: 12,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#FFCCCB',
  },
  submitContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  submitBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.primary,
    letterSpacing: -0.2,
  },
  forgotBtn: {
    alignSelf: 'center',
    paddingVertical: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  forgotText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.sage,
  },
  // Confirmed screen
  confirmedBody: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  confirmedTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  confirmedText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 24,
    marginBottom: 28,
  },
  backLink: {
    paddingVertical: 12,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  backLinkText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.sage,
  },
})
