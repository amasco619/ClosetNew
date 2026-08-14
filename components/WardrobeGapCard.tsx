import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { rs } from '@/lib/responsive';

export type GapCondition = 'cold' | 'rain' | 'cold-rain';

interface WardrobeGapCardProps {
  condition: GapCondition;
  wardrobeSize: number;
  /** Reserved for future commerce integration — do not implement in Phase 5A */
  onShopGap?: () => void;
}

const CONDITION_COPY: Record<GapCondition, { headline: string; detail: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  cold: {
    headline: 'Your wardrobe is missing one piece for today.',
    detail: "Today calls for warm outerwear — your wardrobe doesn't currently include a suitable layer.",
    icon: 'thermometer-outline',
  },
  rain: {
    headline: 'Your wardrobe is missing one piece for today.',
    detail: "Today calls for a waterproof outer layer — your wardrobe doesn't currently include one.",
    icon: 'rainy-outline',
  },
  'cold-rain': {
    headline: 'Your wardrobe is missing one piece for today.',
    detail: "Today is cold and wet — your wardrobe doesn't currently include a warm, waterproof outer layer.",
    icon: 'cloud-outline',
  },
};

const EXAMPLES: Record<GapCondition, string[]> = {
  cold:     ['Wool coat', 'Cashmere overcoat', 'Insulated jacket'],
  rain:     ['Waterproof trench', 'Rain jacket', 'Weatherproof parka'],
  'cold-rain': ['Waterproof trench', 'Insulated jacket', 'Weatherproof parka'],
};

export function WardrobeGapCard({ condition, wardrobeSize, onShopGap }: WardrobeGapCardProps) {
  const { headline, detail, icon } = CONDITION_COPY[condition];
  const examples = EXAMPLES[condition];

  return (
    <View style={styles.card} accessibilityLabel={`Wardrobe intelligence: ${headline}`}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={16} color={Colors.secondary} />
        </View>
        <Text style={styles.label}>WARDROBE INTELLIGENCE</Text>
      </View>

      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.detail}>{detail}</Text>

      <View style={styles.missingRow}>
        <Text style={styles.missingLabel}>Missing</Text>
        <Text style={styles.missingValue}>
          {condition === 'cold' ? 'Warm outerwear' : condition === 'rain' ? 'Waterproof outerwear' : 'Warm waterproof outerwear'}
        </Text>
      </View>

      <View style={styles.examplesRow}>
        {examples.map((ex) => (
          <View key={ex} style={styles.examplePill}>
            <Text style={styles.exampleText}>{ex}</Text>
          </View>
        ))}
      </View>

      {wardrobeSize >= 3 && (
        <Text style={styles.unlockNote}>
          Adding one suitable layer could unlock more outfit combinations.
        </Text>
      )}

      {/* onShopGap: reserved for Phase 5B commerce integration */}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.secondary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(9),
    color: Colors.secondary,
    letterSpacing: 0.8,
  },
  headline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(14),
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  detail: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(12),
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 2,
  },
  missingLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(11),
    color: Colors.textLight,
    letterSpacing: 0.2,
  },
  missingValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(12),
    color: Colors.textPrimary,
    flex: 1,
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  examplePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exampleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    color: Colors.textSecondary,
  },
  unlockNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    color: Colors.textLight,
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 2,
  },
});
