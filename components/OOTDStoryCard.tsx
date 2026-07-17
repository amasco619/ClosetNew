import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Colors from '@/constants/colors';
import { OutfitSet } from '@/constants/types';
import { rs } from '../lib/responsive';

const STORY_WIDTH = 360;
const STORY_HEIGHT = 640;

const SCENARIO_LABELS: Record<string, string> = {
  work:         'Work',
  casual:       'Casual',
  'date-casual': 'Date — Casual',
  'date-dressy': 'Date — Dressy',
  event:        'Event',
  interview:    'Interview',
  wedding:      'Wedding',
  travel:       'Travel',
};

const CORE_CATEGORIES = ['top', 'bottom', 'dress', 'outerwear'];
const ACCESSORY_CATEGORIES = ['shoes', 'bag', 'jewelry'];

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface Props {
  outfit: OutfitSet;
  date?: Date;
}

export default function OOTDStoryCard({ outfit, date }: Props) {
  const today = date ?? new Date();
  const scenarioLabel = SCENARIO_LABELS[outfit.scenario] ?? outfit.scenario;

  const coreItems = outfit.components.filter(
    c => CORE_CATEGORIES.includes(c.category) && c.owned && c.photoUri,
  );
  const accessoryItems = outfit.components.filter(
    c => ACCESSORY_CATEGORIES.includes(c.category) && c.owned && c.photoUri,
  );

  const mainItems = coreItems.slice(0, 3);
  const accs = accessoryItems.slice(0, 3);

  const coreSize = mainItems.length === 1 ? 240 : mainItems.length === 2 ? 150 : 100;
  const accSize = 80;

  return (
    <View style={styles.card}>
      <View style={styles.topBar}>
        <Text style={styles.brand} numberOfLines={1}>AuraCloset</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.metaBlock}>
        <Text style={styles.scenarioLabel}>{scenarioLabel.toUpperCase()}</Text>
        {outfit.rationale ? (
          <Text style={styles.moodLabel}>{outfit.rationale}</Text>
        ) : null}
        <Text style={styles.dateLabel}>{formatDate(today)}</Text>
      </View>

      {mainItems.length > 0 ? (
        <View style={styles.photosRow}>
          {mainItems.map((comp, idx) => (
            <View key={idx} style={styles.photoWrap}>
              <Image
                source={{ uri: comp.photoUri! }}
                style={[styles.photo, { width: coreSize, height: coreSize }]}
                resizeMode="cover"
              />
              <Text style={styles.photoLabel} numberOfLines={1}>
                {comp.subType.replace(/-/g, ' ')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {accs.length > 0 ? (
        <View style={styles.accessoriesRow}>
          {accs.map((comp, idx) => (
            <View key={idx} style={styles.accWrap}>
              <View style={[styles.accImageWrap, { width: accSize, height: accSize }]}>
                <Image
                  source={{ uri: comp.photoUri! }}
                  style={styles.accImage}
                  resizeMode="cover"
                />
              </View>
              <Text style={styles.accLabel} numberOfLines={1}>
                {comp.subType.replace(/-/g, ' ')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.spacer} />
      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.watermark}>CURATED BY AURACLOSET ATELIER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    backgroundColor: Colors.background,
    padding: 24,
    justifyContent: 'flex-start',
  },
  topBar: {
    marginBottom: 16,
  },
  brand: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: rs(13),
    color: Colors.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.secondary + '40',
    marginBottom: 20,
  },
  metaBlock: {
    marginBottom: 24,
  },
  scenarioLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: rs(22),
    color: Colors.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  moodLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(13),
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 6,
    lineHeight: 18,
  },
  dateLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(11),
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  photosRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  photoWrap: {
    alignItems: 'center',
  },
  photo: {
    borderRadius: 12,
    marginBottom: 5,
    backgroundColor: Colors.border,
  },
  photoLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: rs(9),
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    textAlign: 'center',
    maxWidth: 100,
  },
  accessoriesRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  accWrap: {
    alignItems: 'center',
  },
  accImageWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.border,
    marginBottom: 4,
  },
  accImage: {
    width: '100%',
    height: '100%',
  },
  accLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(9),
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    textAlign: 'center',
    maxWidth: 80,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  footerLine: {
    height: 1,
    width: 40,
    backgroundColor: Colors.secondary + '60',
    marginBottom: 10,
  },
  watermark: {
    fontFamily: 'Inter_400Regular',
    fontSize: rs(8),
    color: Colors.secondary,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
});

export { STORY_WIDTH, STORY_HEIGHT };
