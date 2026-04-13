import {
  StyleSheet, Text, View, ScrollView, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMemo } from 'react';
import { computeDiagnostics, CategoryStat, ScenarioCoverage, VersatileItem, GapItem } from '@/constants/wardrobeDiagnostics';
import { LinearGradient } from 'expo-linear-gradient';

const GRADE_COLORS: Record<string, string> = {
  A: '#6AAF7B',
  B: '#8AA39B',
  C: '#D0B892',
  D: '#E0A84D',
  F: '#D4605A',
};

const STRENGTH_COLORS = {
  strong:   { bg: '#6AAF7B20', text: '#4A8E5A', label: 'Strong' },
  moderate: { bg: '#D0B89220', text: '#9A7A50', label: 'OK' },
  weak:     { bg: '#D4605A18', text: '#B04040', label: 'Weak' },
};

const CATEGORY_ICONS: Record<string, string> = {
  top: 'shirt-outline', bottom: 'resize-outline', dress: 'body-outline',
  outerwear: 'cloudy-outline', shoes: 'footsteps-outline',
  bag: 'bag-handle-outline', jewelry: 'diamond-outline',
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const gradeColor = GRADE_COLORS[grade] || Colors.secondary;
  return (
    <View style={[styles.scoreRing, { borderColor: gradeColor + '60' }]}>
      <View style={[styles.scoreRingInner, { borderColor: gradeColor }]}>
        <Text style={[styles.scoreNumber, { color: gradeColor }]}>{score}</Text>
        <Text style={styles.scoreOf}>/100</Text>
        <View style={[styles.gradePill, { backgroundColor: gradeColor + '20' }]}>
          <Text style={[styles.gradeText, { color: gradeColor }]}>{grade}</Text>
        </View>
      </View>
    </View>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={16} color={Colors.secondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  return (
    <View style={styles.miniBarBg}>
      <View style={[styles.miniBarFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function CategoryRow({ stat, maxCount }: { stat: CategoryStat; maxCount: number }) {
  const color = stat.status === 'missing' ? Colors.error
    : stat.status === 'low' ? Colors.warning
    : Colors.success;
  return (
    <View style={styles.categoryRow}>
      <Ionicons name={CATEGORY_ICONS[stat.category] as any || 'ellipse-outline'} size={15} color={Colors.textSecondary} />
      <Text style={styles.categoryLabel}>{stat.label}</Text>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <MiniBar value={stat.count} total={Math.max(maxCount, 1)} color={color} />
      </View>
      <Text style={[styles.categoryCount, { color }]}>
        {stat.count === 0 ? '—' : stat.count}
      </Text>
      {stat.status !== 'good' && (
        <View style={[styles.statusDot, { backgroundColor: color }]} />
      )}
    </View>
  );
}

function ColorSwatch({ item }: { item: { color: string; count: number; isNeutral: boolean; hex: string } }) {
  return (
    <View style={styles.swatchWrap}>
      <View style={[styles.swatch, { backgroundColor: item.hex }]} />
      <Text style={styles.swatchLabel} numberOfLines={1}>{item.color}</Text>
      <Text style={styles.swatchCount}>{item.count}</Text>
    </View>
  );
}

function ScenarioRow({ cov }: { cov: ScenarioCoverage }) {
  const s = STRENGTH_COLORS[cov.strength];
  const barWidth = Math.min(cov.scoringItems / 7, 1);
  return (
    <View style={styles.scenarioRow}>
      <Ionicons name={cov.icon as any} size={14} color={Colors.textSecondary} />
      <Text style={styles.scenarioLabel}>{cov.label}</Text>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <MiniBar value={cov.scoringItems} total={7} color={Colors.secondary} />
      </View>
      <Text style={styles.scenarioCount}>{cov.scoringItems} items</Text>
      <View style={[styles.strengthBadge, { backgroundColor: s.bg }]}>
        <Text style={[styles.strengthText, { color: s.text }]}>{s.label}</Text>
      </View>
    </View>
  );
}

function VersatileRow({ v, index }: { v: VersatileItem; index: number }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={styles.versatileRow}>
      <Text style={styles.medal}>{medals[index] || '·'}</Text>
      <Ionicons name={CATEGORY_ICONS[v.category] as any || 'ellipse-outline'} size={14} color={Colors.textSecondary} />
      <Text style={styles.versatileLabel} numberOfLines={1}>{v.label}</Text>
      <Text style={styles.versatileScenarios}>{v.scenarioCount} occasions</Text>
    </View>
  );
}

function GapRow({ gap }: { gap: GapItem }) {
  const isHigh = gap.priority === 'high';
  return (
    <View style={[styles.gapRow, isHigh && styles.gapRowHigh]}>
      <View style={[styles.gapPriorityDot, { backgroundColor: isHigh ? Colors.error : Colors.warning }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.gapTopRow}>
          <Ionicons name={CATEGORY_ICONS[gap.category] as any || 'ellipse-outline'} size={13} color={Colors.textSecondary} />
          <Text style={styles.gapSuggestion}>{gap.suggestion}</Text>
        </View>
        <Text style={styles.gapReason}>{gap.reason}</Text>
      </View>
    </View>
  );
}

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const { wardrobeItems, profile, recommendationSlots } = useApp();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const diag = useMemo(
    () => computeDiagnostics(wardrobeItems, profile, recommendationSlots),
    [wardrobeItems, profile, recommendationSlots],
  );

  const gradeColor = GRADE_COLORS[diag.grade] || Colors.secondary;
  const maxCategoryCount = Math.max(...diag.categoryStats.map(s => s.count), 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </Pressable>
        <Text style={styles.topTitle}>Deep Diagnostics</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <LinearGradient
            colors={[gradeColor + '18', Colors.background]}
            style={styles.scoreCard}
          >
            <ScoreRing score={diag.overallScore} grade={diag.grade} />
            <Text style={styles.scoreLabel}>Wardrobe Health Score</Text>
            <Text style={styles.scoreInterpretation}>{diag.interpretation}</Text>
            <View style={styles.scoreMeta}>
              <View style={styles.scoreMetaItem}>
                <Text style={styles.scoreMetaNumber}>{diag.totalItems}</Text>
                <Text style={styles.scoreMetaLabel}>items</Text>
              </View>
              <View style={styles.scoreMetaDivider} />
              <View style={styles.scoreMetaItem}>
                <Text style={styles.scoreMetaNumber}>{diag.strongScenarios}</Text>
                <Text style={styles.scoreMetaLabel}>strong scenarios</Text>
              </View>
              <View style={styles.scoreMetaDivider} />
              <View style={styles.scoreMetaItem}>
                <Text style={styles.scoreMetaNumber}>{Math.round(diag.blueprintCompletion * 100)}%</Text>
                <Text style={styles.scoreMetaLabel}>blueprint</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {diag.totalItems === 0 && (
          <Animated.View entering={FadeInDown.delay(160).duration(500)} style={styles.emptyNotice}>
            <Ionicons name="shirt-outline" size={36} color={Colors.border} />
            <Text style={styles.emptyNoticeText}>Add items to your wardrobe to unlock your full analysis.</Text>
          </Animated.View>
        )}

        {diag.totalItems > 0 && (
          <>
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <SectionCard title="Category Balance" icon="grid-outline">
                {diag.categoryStats.map(stat => (
                  <CategoryRow key={stat.category} stat={stat} maxCount={maxCategoryCount} />
                ))}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                    <Text style={styles.legendText}>Good</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
                    <Text style={styles.legendText}>Low</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.error }]} />
                    <Text style={styles.legendText}>Missing</Text>
                  </View>
                </View>
              </SectionCard>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(220).duration(400)}>
              <SectionCard title="Colour Palette" icon="color-palette-outline">
                <View style={styles.swatchGrid}>
                  {diag.topColors.map(c => (
                    <ColorSwatch key={c.color} item={c} />
                  ))}
                </View>
                <View style={styles.paletteRatioRow}>
                  <View style={styles.paletteRatioBarBg}>
                    <View
                      style={[
                        styles.paletteRatioBarFill,
                        { width: `${diag.neutralRatio * 100}%` as any },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.paletteRatioLabels}>
                  <View style={styles.paletteRatioLabelItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.legendText}>Neutrals {Math.round(diag.neutralRatio * 100)}%</Text>
                  </View>
                  <View style={styles.paletteRatioLabelItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.blush }]} />
                    <Text style={styles.legendText}>Accents {Math.round((1 - diag.neutralRatio) * 100)}%</Text>
                  </View>
                </View>
                <Text style={styles.paletteNote}>{diag.paletteNote}</Text>
              </SectionCard>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).duration(400)}>
              <SectionCard title="Occasion Coverage" icon="calendar-outline">
                {diag.scenarioCoverage.map(cov => (
                  <ScenarioRow key={cov.scenario} cov={cov} />
                ))}
                <Text style={styles.coverageNote}>
                  {diag.strongScenarios} of {diag.scenarioCoverage.length} occasions have enough pieces for complete looks.
                </Text>
              </SectionCard>
            </Animated.View>

            {diag.versatileItems.length > 0 && (
              <Animated.View entering={FadeInDown.delay(340).duration(400)}>
                <SectionCard title="Your Hardest-Working Pieces" icon="flash-outline">
                  <Text style={styles.versatileSubtitle}>
                    {diag.multiOccasionCount} of your {diag.totalItems} items work across 3+ occasions
                  </Text>
                  {diag.versatileItems.map((v, i) => (
                    <VersatileRow key={i} v={v} index={i} />
                  ))}
                </SectionCard>
              </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(400).duration(400)}>
              <SectionCard title="Blueprint Completion" icon="map-outline">
                <View style={styles.blueprintRow}>
                  <View style={styles.blueprintTextWrap}>
                    <Text style={styles.blueprintFraction}>
                      {diag.blueprintOwned}
                      <Text style={styles.blueprintTotal}>/{diag.blueprintTotal}</Text>
                    </Text>
                    <Text style={styles.blueprintLabel}>pieces owned</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <MiniBar value={diag.blueprintOwned} total={diag.blueprintTotal} color={Colors.secondary} />
                    <Text style={styles.blueprintPct}>
                      {Math.round(diag.blueprintCompletion * 100)}% complete
                    </Text>
                  </View>
                </View>
              </SectionCard>
            </Animated.View>

            {diag.gaps.length > 0 && (
              <Animated.View entering={FadeInDown.delay(460).duration(400)}>
                <SectionCard title="Priority Gaps" icon="alert-circle-outline">
                  <Text style={styles.gapsSubtitle}>
                    Targeted additions that will have the highest impact on your styling options.
                  </Text>
                  {diag.gaps.map((gap, i) => (
                    <GapRow key={i} gap={gap} />
                  ))}
                  <Pressable
                    style={styles.addItemCta}
                    onPress={() => router.push('/add-item')}
                  >
                    <Ionicons name="add" size={16} color={Colors.white} />
                    <Text style={styles.addItemCtaText}>Add a Wardrobe Item</Text>
                  </Pressable>
                </SectionCard>
              </Animated.View>
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: Colors.primary },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  scoreCard: {
    borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  scoreRing: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  scoreRingInner: {
    width: 108, height: 108, borderRadius: 54,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
  },
  scoreNumber: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -1 },
  scoreOf: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: -4 },
  gradePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  gradeText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  scoreLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary, marginBottom: 6 },
  scoreInterpretation: {
    fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 19, marginBottom: 18, paddingHorizontal: 8,
  },
  scoreMeta: { flexDirection: 'row', gap: 0 },
  scoreMetaItem: { alignItems: 'center', paddingHorizontal: 16 },
  scoreMetaNumber: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.primary },
  scoreMetaLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  scoreMetaDivider: { width: 1, backgroundColor: Colors.border, height: 36, alignSelf: 'center' },

  emptyNotice: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyNoticeText: {
    fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, maxWidth: 260,
  },

  sectionCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.primary },

  miniBarBg: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 3 },

  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  categoryLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary, width: 76 },
  categoryCount: { fontFamily: 'Inter_600SemiBold', fontSize: 13, width: 20, textAlign: 'right' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginLeft: 4 },

  legendRow: { flexDirection: 'row', gap: 14, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary },

  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  swatchWrap: { alignItems: 'center', width: 46 },
  swatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  swatchLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textSecondary, textAlign: 'center', textTransform: 'capitalize', width: 46 },
  swatchCount: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.primary },

  paletteRatioRow: { marginBottom: 8 },
  paletteRatioBarBg: { height: 10, backgroundColor: Colors.blush + '60', borderRadius: 5, overflow: 'hidden' },
  paletteRatioBarFill: { height: '100%', backgroundColor: Colors.primary + 'A0', borderRadius: 5 },
  paletteRatioLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  paletteRatioLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paletteNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 17 },

  scenarioRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 },
  scenarioLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary, width: 68 },
  scenarioCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, width: 46, textAlign: 'right' },
  strengthBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 6 },
  strengthText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  coverageNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginTop: 10, lineHeight: 17, fontStyle: 'italic' },

  versatileSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
  versatileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border + '80' },
  medal: { fontSize: 16, width: 22 },
  versatileLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.primary, flex: 1, textTransform: 'capitalize' },
  versatileScenarios: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary },

  blueprintRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  blueprintTextWrap: { alignItems: 'center' },
  blueprintFraction: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.primary },
  blueprintTotal: { fontFamily: 'Inter_400Regular', fontSize: 16, color: Colors.textSecondary },
  blueprintLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  blueprintPct: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, marginTop: 5 },

  gapsSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, marginBottom: 12, lineHeight: 17 },
  gapRow: {
    flexDirection: 'row', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '60',
  },
  gapRowHigh: {},
  gapPriorityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  gapTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  gapSuggestion: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.primary, flex: 1 },
  gapReason: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  addItemCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 12, marginTop: 14,
  },
  addItemCtaText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: Colors.white },
});
