import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeInDown,
  FadeInUp,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

interface GlassButtonProps {
  label: string;
  subLabel?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  variant: 'gold' | 'glass';
  onPress: () => void;
  delay: number;
}

function GlassButton({ label, subLabel, iconName, variant, onPress, delay }: GlassButtonProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const onPressIn = () => {
    Haptics.impactAsync(
      variant === 'gold'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    opacity.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const isGold = variant === 'gold';

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(280)}
      style={[styles.buttonWrapper, subLabel && styles.buttonWrapperTall]}
    >
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={styles.pressableFill}>
        <Animated.View
          style={[
            styles.glassCard,
            isGold ? styles.glassCardGold : styles.glassCardSecondary,
            animStyle,
          ]}
        >
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.buttonInner}>
            <View style={styles.buttonContent}>
              {iconName && (
                <Ionicons
                  name={iconName}
                  size={19}
                  color={isGold ? Colors.secondary : '#FFFFFF'}
                  style={styles.buttonIcon}
                />
              )}
              <Text style={[styles.buttonText, isGold && styles.buttonTextGold]}>{label}</Text>
            </View>
            {subLabel && (
              <Text style={styles.buttonSubLabel}>{subLabel}</Text>
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useApp();
  const bgScale = useSharedValue(1);

  useEffect(() => {
    bgScale.value = withRepeat(
      withTiming(1.07, { duration: 14000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
  }));

  const handleGetStarted = () => {
    router.replace('/onboarding?guest=true');
  };

  const handleSignIn = () => {
    router.replace('/sign-in');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Atmospheric Background — Ken Burns slow breathing */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
        <Image
          source={require('../assets/images/closet.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      </Animated.View>

      {/* Luxury gradient scrim — preserves ceiling warmth, creates legible bottom zone */}
      <LinearGradient
        colors={[Colors.navyScrimTop, Colors.navyScrimMid, Colors.navyScrimBottom]}
        locations={[0, 0.5, 0.88]}
        style={StyleSheet.absoluteFill}
      />

      {/* Foreground UI */}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: Math.max(insets.bottom + 28, 52),
          },
        ]}
      >
        {/* Brand Header */}
        <Animated.View entering={FadeInDown.delay(80).duration(280)} style={styles.headerGroup}>
          <Text style={styles.microLabel}>A U R A C L O S E T</Text>
          <Text style={styles.headline}>Your quiet-luxury{'\n'}stylist in your pocket.</Text>
          <Text style={styles.tagline}>Your private dressing room, always curated.</Text>
        </Animated.View>

        {/* Action Stack */}
        <View style={styles.buttonStack}>
          <GlassButton
            label="Get started"
            subLabel="No account required"
            iconName="sparkles-outline"
            variant="gold"
            delay={200}
            onPress={handleGetStarted}
          />
          <GlassButton
            label="I already have an account"
            iconName="person-outline"
            variant="glass"
            delay={280}
            onPress={handleSignIn}
          />
        </View>

        {/* Privacy footer */}
        <Animated.View entering={FadeInUp.delay(360).duration(280)} style={styles.footerRow}>
          <Ionicons name="lock-closed-outline" size={11} color="rgba(255,255,255,0.35)" />
          <Text style={styles.footerText}>Your wardrobe stays private, always</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'flex-end',
  },
  headerGroup: {
    marginBottom: 36,
  },
  microLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.secondary,
    letterSpacing: 4.5,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 34,
    color: '#FFFFFF',
    lineHeight: 40,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  buttonStack: {
    gap: 12,
    marginBottom: 20,
  },
  buttonWrapper: {
    width: '100%',
    height: 56,
  },
  buttonWrapperTall: {
    height: 68,
  },
  pressableFill: {
    flex: 1,
  },
  glassCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  glassCardGold: {
    backgroundColor: Colors.glassSurfaceGold,
    borderColor: Colors.glassBorder,
  },
  glassCardSecondary: {
    backgroundColor: Colors.glassSurface,
    borderColor: Colors.glassBorderWhite,
  },
  buttonInner: {
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  buttonTextGold: {
    color: '#FFFFFF',
  },
  buttonSubLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.1,
  },
});
