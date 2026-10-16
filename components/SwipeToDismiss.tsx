import React, { useMemo, useRef } from 'react';
import { Dimensions, PanResponder, Platform, StyleSheet, View } from 'react-native';
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
import { canStartSwipeDismiss, shouldDismissSwipe } from '@/lib/swipeDismiss';

interface SwipeToDismissProps {
  children: React.ReactNode;
  scrollTopRef: React.RefObject<number>;
}

export default function SwipeToDismiss({ children, scrollTopRef }: SwipeToDismissProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const dragOpacity = useSharedValue(1);
  const cancelledAtScrollOffsetRef = useRef(false);

  const dismiss = () => router.back();

  const panResponder = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- PanResponder stores these callbacks; it reads the scroll ref only during gestures.
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        // This touch-move capture checks the live offset; only scrollTop === 0 may drag the sheet, so scrolled content stays in control.
        return canStartSwipeDismiss(scrollTopRef.current, gesture.dx, gesture.dy);
      },
      onPanResponderGrant: () => {
        cancelledAtScrollOffsetRef.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (scrollTopRef.current !== 0) {
          if (!cancelledAtScrollOffsetRef.current) {
            translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
            dragOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
            cancelledAtScrollOffsetRef.current = true;
          }
          return;
        }
        const drag = Math.max(0, gesture.dy);
        translateY.value = drag > 220 ? 220 + (drag - 220) * 0.35 : drag;
        dragOpacity.value = Math.max(0.58, 1 - drag / (Dimensions.get('window').height * 2.2));
      },
      onPanResponderRelease: (_, gesture) => {
        if (!cancelledAtScrollOffsetRef.current && shouldDismissSwipe(scrollTopRef.current, gesture.dy)) {
          translateY.value = withTiming(Dimensions.get('window').height, { duration: 220 }, () => {
            runOnJS(dismiss)();
          });
          dragOpacity.value = withTiming(0, { duration: 220 });
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
          dragOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
        }
      },
      onPanResponderTerminate: () => {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        dragOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
      },
      onPanResponderTerminationRequest: () => scrollTopRef.current !== 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated SharedValues are stable animation targets; other mutable refs are listed.
  }, [scrollTopRef, cancelledAtScrollOffsetRef]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: dragOpacity.value,
  }));

  return (
    <Animated.View {...panResponder.panHandlers} style={[styles.shadow, animatedStyle]}>
      <View style={styles.sheet}>
        <View style={[styles.handleContainer, { paddingTop: Platform.OS === 'android' ? insets.top + 10 : 10 }]}>
          <View style={styles.handle} />
        </View>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    flex: 1,
    ...Platform.select({
      web: { boxShadow: '0px -5px 18px rgba(16, 24, 38, 0.12)' },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: -5 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
        elevation: 12,
      },
    }),
  },
  sheet: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.textLight,
    opacity: 0.5,
  },
});
