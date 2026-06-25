import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withRepeat, 
  withTiming, 
  Easing,
  FadeInDown
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

// Animated Pressable Button Component with Reanimated Spring Physics (<300ms)
interface LuxuryButtonProps {
  label: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress: () => void;
  delay?: number;
}

const LuxuryButton: React.FC<LuxuryButtonProps> = ({ 
  label, 
  iconName, 
  variant = 'primary', 
  onPress,
  delay = 0 
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.97, { damping: 15, stiffness: 300 });
    opacity.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    opacity.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';

  if (isGhost) {
    return (
      <Animated.View entering={FadeInDown.delay(delay).duration(280)}>
        <Pressable 
          onPress={onPress} 
          onPressIn={handlePressIn} 
          onPressOut={handlePressOut}
          style={styles.ghostButton}
          hitSlop={12}
        >
          <Animated.Text style={[styles.ghostText, animatedStyle]}>
            {label}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(280)} style={styles.buttonWrapper}>
      <Pressable 
        onPress={onPress}
        onPressIn={handlePressIn} 
        onPressOut={handlePressOut}
        style={styles.pressableContainer}
      >
        <Animated.View style={[styles.glassCard, isPrimary && styles.primaryBorder, animatedStyle]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.buttonContent}>
            {iconName && (
              <Ionicons 
                name={iconName} 
                size={20} 
                color={isPrimary ? Colors.secondary : Colors.textLight} 
                style={styles.buttonIcon} 
              />
            )}
            <Text style={[styles.buttonText, isPrimary && styles.primaryText]}>{label}</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Subtle Ken Burns slow background breathing (1.0 -> 1.06)
  const bgScale = useSharedValue(1);

  useEffect(() => {
    bgScale.value = withRepeat(
      withTiming(1.06, { duration: 14000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const animatedBgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Background Image Layer with Ken Burns Motion */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedBgStyle]}>
        <Image
          source={require('../assets/images/closet.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={500}
        />
      </Animated.View>

      {/* Deep Navy Scrim Overlay — Authoritative Luxury Contrast (§2) */}
      <LinearGradient
        colors={[Colors.navyScrimTop, Colors.navyScrimMid, Colors.navyScrimBottom]}
        locations={[0, 0.5, 0.88]}
        style={StyleSheet.absoluteFill}
      />

      {/* Foreground UI Layer */}
      <View style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom + 24, 48) }]}>
        
        {/* Brand Header Group */}
        <Animated.View entering={FadeInDown.delay(100).duration(280)} style={styles.headerGroup}>
          <Text style={styles.brandMicroLabel}>A U R A C L O S E T</Text>
          <Text style={styles.headline}>Your quiet-luxury stylist in your pocket.</Text>
        </Animated.View>

        {/* Action Button Stack */}
        <View style={styles.buttonStack}>
          <LuxuryButton 
            label="Continue with Apple" 
            iconName="logo-apple"
            variant="primary"
            delay={200}
            onPress={() => router.push('/sign-in?method=apple')}
          />
          
          <LuxuryButton 
            label="Continue with Google" 
            iconName="logo-google"
            variant="secondary"
            delay={260}
            onPress={() => router.push('/sign-in?method=google')}
          />

          <LuxuryButton 
            label="Continue with Email" 
            iconName="mail-outline"
            variant="secondary"
            delay={320}
            onPress={() => router.push('/sign-in')}
          />

          <LuxuryButton 
            label="Explore as Guest" 
            variant="ghost"
            delay={380}
            onPress={() => router.replace('/(tabs)')}
          />
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
  },
  headerGroup: {
    marginBottom: 40,
  },
  brandMicroLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.secondary,
    letterSpacing: 4.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.textLight,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  buttonStack: {
    gap: 12,
  },
  buttonWrapper: {
    width: '100%',
    height: 54,
  },
  pressableContainer: {
    flex: 1,
  },
  glassCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBorder: {
    backgroundColor: 'rgba(208, 184, 146, 0.12)',
    borderColor: Colors.glassBorder,
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
    color: Colors.textLight,
    letterSpacing: -0.2,
  },
  primaryText: {
    color: '#FFFFFF',
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  ghostText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.sage,
    letterSpacing: 0.2,
  },
});
