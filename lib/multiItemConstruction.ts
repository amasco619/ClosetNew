import { SUBTYPE_FORMALITY } from '../constants/outfitScoring'
import type {
  Fabric,
  FabricWeight,
  Fit,
  ItemCategory,
  Neckline,
  OccasionTag,
  Pattern,
  PatternScale,
  Rise,
  SeasonTag,
  SleeveLength,
  WarmthBand,
} from '../constants/types'

export interface B3Region {
  x: number
  y: number
  width: number
  height: number
}

export interface B3NormalizedClassification {
  category: ItemCategory
  subType: string
  colorFamily: string
  description: string
  occasionTags: OccasionTag[]
  seasonTags: SeasonTag[]
  modelConfidence: number
  source: 'gemini'
  accentColor?: string
  pattern?: Pattern
  patternScale?: PatternScale
  fabric?: Fabric
  weight?: FabricWeight
  fit?: Fit
  neckline?: Neckline
  sleeveLength?: SleeveLength
  rise?: Rise
  warmthBand?: WarmthBand
  dominantHsl?: { h: number; s: number; l: number }
  dominantLab?: { L: number; a: number; b: number }
}

export type B3RelationshipType = 'coordinated_set' | 'multi_item' | 'layered'

export interface MultiItemClassificationResult {
  schemaVersion: 'b1b2-v1'
  source: { ref: string }
  items: Array<{
    detectionId: string
    source: { region: B3Region }
    classification: B3NormalizedClassification
  }>
  validation: {
    count: number
    max: 6
    order: 'region-y-x-height-width-detection-id'
  }
  relationship?: {
    type: B3RelationshipType
    confidence: number
    memberDetectionIds: string[]
    sharedAttributes?: Record<string, string>
  }
}

export interface B3WardrobeFields extends Omit<B3NormalizedClassification, 'source'> {
  formalityLevel: number
}

export interface B3WardrobeConstructionInput {
  detectionId: string
  ordinal: number
  source: { ref: string; region: B3Region }
  wardrobeFields: B3WardrobeFields
}

export interface B3GroupConstructionInput {
  relationshipType: B3RelationshipType
  relationshipConfidence: number
  confirmationStatus: 'ai_inferred'
  sharedAttributes: Record<string, string>
  memberDetectionIds: string[]
  source: { ref: string }
}

export interface B3ConstructionResult {
  schemaVersion: 'b3-v1'
  classifierSource: { schemaVersion: 'b1b2-v1'; ref: string }
  items: B3WardrobeConstructionInput[]
  group: B3GroupConstructionInput
}

export type B3ConstructionErrorCode =
  | 'unsupported_schema'
  | 'invalid_item_count'
  | 'invalid_normalized_item'
  | 'invalid_membership'
  | 'invalid_order_contract'

export class B3ConstructionError extends Error {
  constructor(public readonly code: B3ConstructionErrorCode) {
    super(code)
    this.name = 'B3ConstructionError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function assertNormalizedItem(item: MultiItemClassificationResult['items'][number]): void {
  const classification = item?.classification
  const region = item?.source?.region
  if (
    !item || typeof item.detectionId !== 'string' || !item.detectionId ||
    !isRecord(classification) ||
    typeof classification.category !== 'string' || !classification.category ||
    typeof classification.subType !== 'string' || !classification.subType ||
    typeof classification.colorFamily !== 'string' || !classification.colorFamily ||
    typeof classification.description !== 'string' ||
    !Array.isArray(classification.occasionTags) ||
    !Array.isArray(classification.seasonTags) ||
    typeof classification.modelConfidence !== 'number' ||
    !Number.isFinite(classification.modelConfidence) ||
    !isRecord(region)
  ) {
    throw new B3ConstructionError('invalid_normalized_item')
  }
}

export function constructMultiItemDraft(input: MultiItemClassificationResult): B3ConstructionResult {
  if (!input || input.schemaVersion !== 'b1b2-v1') {
    throw new B3ConstructionError('unsupported_schema')
  }
  if (!Array.isArray(input.items) || input.items.length < 2 || input.items.length > 6 ||
      input.validation?.count !== input.items.length) {
    throw new B3ConstructionError('invalid_item_count')
  }
  if (input.validation.order !== 'region-y-x-height-width-detection-id') {
    throw new B3ConstructionError('invalid_order_contract')
  }

  const detectionIds = new Set<string>()
  for (const item of input.items) {
    assertNormalizedItem(item)
    if (detectionIds.has(item.detectionId)) {
      throw new B3ConstructionError('invalid_membership')
    }
    detectionIds.add(item.detectionId)
  }

  const members = input.relationship?.memberDetectionIds
  if (!input.relationship || !Array.isArray(members) ||
      members.length !== detectionIds.size ||
      new Set(members).size !== members.length ||
      members.some(id => !detectionIds.has(id))) {
    throw new B3ConstructionError('invalid_membership')
  }

  const ref = input.source.ref
  return {
    schemaVersion: 'b3-v1',
    classifierSource: { schemaVersion: 'b1b2-v1', ref },
    items: input.items.map((item, ordinal) => {
      const c = item.classification
      return {
        detectionId: item.detectionId,
        ordinal,
        source: { ref, region: { ...item.source.region } },
        wardrobeFields: {
          category: c.category,
          subType: c.subType,
          colorFamily: c.colorFamily,
          description: c.description,
          occasionTags: [...c.occasionTags],
          seasonTags: [...c.seasonTags],
          formalityLevel: SUBTYPE_FORMALITY[c.subType] ?? 5,
          modelConfidence: c.modelConfidence,
          ...(c.accentColor !== undefined && { accentColor: c.accentColor }),
          ...(c.pattern !== undefined && { pattern: c.pattern }),
          ...(c.patternScale !== undefined && { patternScale: c.patternScale }),
          ...(c.fabric !== undefined && { fabric: c.fabric }),
          ...(c.weight !== undefined && { weight: c.weight }),
          ...(c.fit !== undefined && { fit: c.fit }),
          ...(c.neckline !== undefined && { neckline: c.neckline }),
          ...(c.sleeveLength !== undefined && { sleeveLength: c.sleeveLength }),
          ...(c.rise !== undefined && { rise: c.rise }),
          ...(c.warmthBand !== undefined && { warmthBand: c.warmthBand }),
          ...(c.dominantHsl !== undefined && { dominantHsl: { ...c.dominantHsl } }),
          ...(c.dominantLab !== undefined && { dominantLab: { ...c.dominantLab } }),
        },
      }
    }),
    group: {
      relationshipType: input.relationship.type,
      relationshipConfidence: input.relationship.confidence,
      confirmationStatus: 'ai_inferred',
      sharedAttributes: { ...(input.relationship.sharedAttributes ?? {}) },
      memberDetectionIds: [...members],
      source: { ref },
    },
  }
}