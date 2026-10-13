import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { rs } from '@/lib/responsive';
import {
  CONCIERGE_OCCASIONS,
  parseConciergeIntent,
  type ConciergeIntent,
} from '@/lib/concierge';

export type ConciergeAccess = 'checking' | 'choose' | 'sign-in' | 'not-entitled' | 'unavailable';

interface OccasionPlannerProps {
  access: ConciergeAccess;
  onSubmit: (intent: ConciergeIntent) => void;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
}

export default function OccasionPlanner({
  access,
  onSubmit,
  onClose,
  onRetry,
  onSignIn,
  onUpgrade,
}: OccasionPlannerProps) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ConciergeIntent['occasion'] | null>(null);

  const handleSubmit = () => {
    if (access !== 'choose' || !selected) return;
    const intent = parseConciergeIntent({ occasion: selected });
    if (intent) onSubmit(intent);
  };

  const statusCopy = {
    checking: {
      title: 'Checking your access',
      body: 'One moment while we prepare your occasion choices.',
    },
    'sign-in': {
      title: 'Sign in to continue',
      body: 'Your occasion-led styling is available when you are signed in.',
    },
    'not-entitled': {
      title: 'A little more access is needed',
      body: 'Unlock occasion-led styling with your existing Amodka premium plan.',
    },
    unavailable: {
      title: 'Occasion styling is unavailable',
      body: 'We could not confirm access just now. Please try again.',
    },
  } as const;

  const gated = access !== 'choose';
  const status = access === 'choose' ? null : statusCopy[access];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityLabel="Plan an occasion today"
      aria-label="Plan an occasion today"
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close occasion planner"
          accessibilityRole="button"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>AMODKA CONCIERGE</Text>
              <Text accessibilityRole="header" role="heading" style={styles.title}>What’s the occasion?</Text>
              <Text style={styles.scope}>A look for today, shaped around what you have planned.</Text>
            </View>
            <Pressable
              testID="concierge-close"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close occasion planner"
            >
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {access === 'choose' ? (
              <>
                <Text style={styles.sectionLabel}>CHOOSE ONE</Text>
                <View style={styles.options}>
                  {CONCIERGE_OCCASIONS.map((option, index) => {
                    const isSelected = selected === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        testID={`concierge-option-${option.id}`}
                        onPress={() => setSelected(option.id)}
                        accessibilityRole="radio"
                        aria-checked={isSelected}
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={`${option.label}. ${option.detail}`}
                        style={({ pressed }) => [
                          styles.option,
                          isSelected && styles.optionSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.optionIndex, isSelected && styles.optionIndexSelected]}>
                          {isSelected ? (
                            <Ionicons name="checkmark" size={15} color={Colors.white} />
                          ) : (
                            <Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text>
                          )}
                        </View>
                        <View style={styles.optionCopy}>
                          <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                            {option.label}
                          </Text>
                          <Text style={styles.optionDetail}>{option.detail}</Text>
                        </View>
                        <View style={[styles.radio, isSelected && styles.radioSelected]}>
                          {isSelected && <View style={styles.radioDot} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.footnote}>
                  Just for today. Traditional occasion guidance is African-first; ceremony roles and headwear are never assumed.
                </Text>
              </>
            ) : (
              <View
                style={styles.statusPanel}
                accessibilityLiveRegion="polite"
                aria-live="polite"
                accessibilityRole={access === 'checking' ? 'progressbar' : 'text'}
                accessibilityLabel={`${status?.title}. ${status?.body}`}
              >
                {access === 'checking' ? (
                  <View style={styles.loadingMark}>
                    <View style={styles.loadingLine} />
                    <View style={[styles.loadingLine, styles.loadingLineShort]} />
                    <View style={styles.loadingCircle} />
                  </View>
                ) : (
                  <View style={styles.statusIcon}>
                    <Ionicons
                      name={access === 'sign-in' ? 'person-outline' : access === 'not-entitled' ? 'sparkles-outline' : 'refresh-outline'}
                      size={24}
                      color={Colors.secondary}
                    />
                  </View>
                )}
                <Text style={styles.statusTitle}>{status?.title}</Text>
                <Text style={styles.statusBody}>{status?.body}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {access === 'choose' && (
              <Pressable
                testID="concierge-submit"
                onPress={handleSubmit}
                disabled={!selected}
                accessibilityRole="button"
                accessibilityState={{ disabled: !selected }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !selected && styles.primaryButtonDisabled,
                  pressed && selected && styles.primaryPressed,
                ]}
              >
                <Text style={[styles.primaryText, !selected && styles.primaryTextDisabled]}>
                  {selected ? 'Create today’s look' : 'Choose an occasion'}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color={selected ? Colors.white : Colors.textLight}
                />
              </Pressable>
            )}
            {access === 'checking' && (
              <View style={styles.pendingButton} accessibilityLiveRegion="polite" aria-live="polite">
                <Ionicons name="time-outline" size={17} color={Colors.secondary} />
                <Text style={styles.pendingText}>Checking access</Text>
              </View>
            )}
            {access === 'sign-in' && (
              <Pressable
                testID="concierge-sign-in"
                onPress={onSignIn}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>Sign in</Text>
                <Ionicons name="arrow-forward" size={17} color={Colors.white} />
              </Pressable>
            )}
            {access === 'not-entitled' && (
              <Pressable
                testID="concierge-upgrade"
                onPress={onUpgrade}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>Explore Amodka Premium</Text>
                <Ionicons name="arrow-forward" size={17} color={Colors.white} />
              </Pressable>
            )}
            {access === 'unavailable' && (
              <Pressable
                testID="concierge-access-retry"
                onPress={onRetry}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>Try again</Text>
                <Ionicons name="refresh-outline" size={17} color={Colors.white} />
              </Pressable>
            )}
            {gated && (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  sheet: {
    maxHeight: '94%',
    minHeight: 360,
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(10),
    letterSpacing: 1.1,
    color: Colors.textSecondary,
    marginBottom: 7,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: rs(25),
    lineHeight: rs(31),
    letterSpacing: -0.7,
    color: Colors.textPrimary,
  },
  scope: {
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
    fontSize: rs(13),
    lineHeight: rs(19),
    color: Colors.textSecondary,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 2,
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 12 },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(10),
    letterSpacing: 1,
    color: Colors.textLight,
    marginBottom: 10,
  },
  options: { gap: 9 },
  option: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    gap: 11,
  },
  optionSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '14',
  },
  optionIndex: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  optionIndexSelected: { backgroundColor: Colors.primary },
  indexText: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(10),
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  optionCopy: { flex: 1 },
  optionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(14),
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    marginBottom: 3,
  },
  optionTitleSelected: { color: Colors.primary },
  optionDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    lineHeight: rs(16),
    color: Colors.textSecondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.textLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  footnote: {
    marginTop: 13,
    marginHorizontal: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    lineHeight: rs(16),
    color: Colors.textSecondary,
  },
  statusPanel: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 26,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
  },
  loadingMark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 5,
    backgroundColor: Colors.secondary + '18',
    marginBottom: 17,
    position: 'relative',
  },
  loadingLine: { height: 3, borderRadius: 2, width: 24, backgroundColor: Colors.secondary },
  loadingLineShort: { width: 17, opacity: 0.6 },
  loadingCircle: {
    position: 'absolute',
    right: 9,
    top: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary + '18',
    marginBottom: 17,
  },
  statusTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(16),
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  statusBody: {
    marginTop: 7,
    fontFamily: 'Inter_400Regular',
    fontSize: rs(13),
    lineHeight: rs(19),
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  footer: { paddingTop: 12, gap: 8 },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  primaryButtonDisabled: {
    backgroundColor: '#EAE7E2',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(14),
    color: Colors.white,
    letterSpacing: -0.1,
  },
  primaryTextDisabled: { color: Colors.textLight },
  primaryPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  secondaryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(13),
    color: Colors.textSecondary,
  },
  pendingButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  pendingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(14),
    color: Colors.white,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
