import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { router } from 'expo-router';

const DISMISS_THRESHOLD = 120;
const DISMISS_VELOCITY = 800;

interface SwipeToDismissProps {
  children: React.ReactNode;
}

export default function SwipeToDismiss({ children }: SwipeToDismissProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const dismiss = () => router.back();

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetY(-5)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        translateY.value = withTiming(700, { duration: 220 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={[styles.handleContainer, { paddingTop: insets.top + 10 }]}>
          <View style={styles.handle} />
        </View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textLight,
    opacity: 0.35,
  },
});
