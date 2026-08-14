import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { rs } from '@/lib/responsive';

export type AmodkaErrorType =
  | 'recommendation'
  | 'classification'
  | 'background-removal'
  | 'network'
  | 'generic';

interface AmodkaErrorStateProps {
  type?: AmodkaErrorType;
  onRetry?: () => void;
}

const ERROR_COPY: Record<AmodkaErrorType, { headline: string; body: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  recommendation: {
    headline: "We couldn't curate a look right now.",
    body: 'Your wardrobe is safe. Please try again.',
    icon: 'sparkles-outline',
  },
  classification: {
    headline: "We couldn't identify this piece just yet.",
    body: 'Your photo is safe. You can try again or review the details manually.',
    icon: 'image-outline',
  },
  'background-removal': {
    headline: "We couldn't prepare this garment image.",
    body: "Let's try processing it again.",
    icon: 'color-wand-outline',
  },
  network: {
    headline: "You're currently offline.",
    body: 'Your saved wardrobe remains available.',
    icon: 'cloud-offline-outline',
  },
  generic: {
    headline: "Something didn't go to plan.",
    body: 'Please try again.',
    icon: 'alert-circle-outline',
  },
};

export function AmodkaErrorState({ type = 'generic', onRetry }: AmodkaErrorStateProps) {
  const { headline, body, icon } = ERROR_COPY[type];

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={Colors.textLight} />
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.body}>{body}</Text>
      {onRetry && (
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  iconWrap: {
    marginBottom: 4,
  },
  headline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(15),
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(13),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(13),
    color: Colors.white,
    letterSpacing: 0.1,
  },
});
