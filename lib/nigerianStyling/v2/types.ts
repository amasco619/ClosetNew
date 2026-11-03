import type { NigerianStylingV1Decision } from '../v1';

export type Band = readonly [number, number];
export type Community = 'yoruba' | 'igbo' | 'hausa' | 'other';
export type FailureGroup =
  | 'weddingIdentity' | 'asoEbi' | 'funeralColour' | 'footwear'
  | 'styleHeadwear' | 'register' | 'quality' | 'communityDress'
  | 'roleAdornment' | 'structure' | 'churchCoverage' | 'statedCoverage';
export type Verdict = 'Works' | 'Almost' | 'Rethink' | 'Not judged';

/** Supplied, confirmed facts only. Absence is unknown, never false or inferred. */
export interface ItemFacts {
  id: string;
  /** Supplied explicitly or derived by the approved blind-adapter convention. */
  key?: boolean;
  /** Canonical lower-case tokens. Unknown tokens remain outside the vocabulary. */
  kind?: string;
  /** Canonical lower-case colour token, also used verbatim in brief lists. */
  colour?: string;
  textileIdentity?: string;
  quality?: 'poorPolyester' | 'notPoorPolyester';
  footwearType?: 'trainer' | 'flipFlop' | 'sportsSandal' | 'other';
  shoulderCoverage?: 'covered' | 'uncovered';
  backless?: boolean;
  strapless?: boolean;
  sleeveLength?: 'none' | 'short' | 'elbow' | 'long';
  modest?: boolean;
  finish?: 'metallicGold' | 'metallicSilver' | 'sequins' | 'highSheenGold' | 'other';
  hem?: 'aboveKnee' | 'clearlyAboveKnee' | 'slightlyAboveKnee' | 'knee' | 'belowKnee' | 'ankle' | 'floor';
  headwearHeight?: 'tall' | 'notTall';
  headwearShape?: 'lowerWider' | 'lowCloseUnsculpted' | 'other';
  coralStrands?: number;
}

export interface EventBrief {
  occasion?: 'work' | 'casual' | 'whiteWedding' | 'traditionalWedding'
    | 'funeral' | 'church' | 'owambe' | 'naming' | 'traditionalEvent' | 'other';
  role?: 'guest' | 'family' | 'closeFamily' | 'host' | 'bride' | 'mother' | 'motherOfBride'
    | 'motherOfGroom' | 'other';
  whoseEvent?: string;
  community?: Community;
  denomination?: string;
  asoEbiBought?: boolean;
  asoEbiColour?: string;
  asoEbiTextile?: string;
  brideColours?: readonly string[];
  familyTextiles?: readonly string[];
  timeOfDay?: 'day' | 'evening';
  /** Supplied directly or from the approved reviewer event/role table only. */
  formalityBand?: Band;
  titledWoman?: boolean;
  /** Optional wearer rule, not a community or venue assumption. */
  statedCoverage?: readonly ('arms' | 'shoulders' | 'knees' | 'head')[];
  /** Exact announced family colours; absence supplies no override. */
  familyColours?: readonly string[];
}

export interface LookFacts {
  items: readonly ItemFacts[];
  brief: EventBrief;
  traditionalWear?: boolean;
  printDominance?: 'oneDominates' | 'competing' | 'noPrint';
  wornCover?: boolean;
  armsCovered?: boolean;
  shouldersCovered?: boolean;
  kneesCovered?: boolean;
  headCovered?: boolean;
  /** Null means structure was not supplied; never default it to eligible. */
  v1: {
    decision: Pick<NigerianStylingV1Decision, 'status' | 'reason' | 'headCoveringSatisfied'>;
    gapNotes: readonly string[];
  } | null;
}

export type FactPath = `brief.${keyof EventBrief}` | `item.${keyof ItemFacts}`
  | 'traditionalWear' | 'printDominance' | 'wornCover'
  | 'armsCovered' | 'shouldersCovered' | 'kneesCovered' | 'headCovered';
type Value = string | boolean | number | readonly string[];
export type Condition =
  | { all: readonly Condition[] }
  | { any: readonly Condition[] }
  | { not: Condition }
  | { some: Condition }
  | { path: FactPath; op: 'present' }
  | { path: FactPath; op: 'eq' | 'in' | 'includes' | 'gt' | 'excludesPoint'; value: Value }
  | { path: FactPath; op: 'eqRef' | 'inRef'; ref: FactPath }
  | { path: 'item.colour'; op: 'familyOverride'; ref: 'brief.familyColours' }
  | { path: 'item.textileIdentity'; op: 'belowBand' | 'aboveBand'; ref: 'brief.formalityBand' };

export interface Rule {
  id: string;
  version: 2;
  description: string;
  strength: 'strong' | 'likely' | 'community';
  type: 'hardFilter' | 'askFirst' | 'explainOnly';
  communityTag?: Community;
  appliesWhen: Condition;
  violation?: Condition;
  effect: 'failure' | 'question' | 'advisory';
  /** askFirst is optional unless its answer is needed to settle a failure rule. */
  answerRequired?: boolean;
  failureGroup?: FailureGroup;
  sourceReviewers: readonly ('R1' | 'R2' | 'R3')[];
  provenance: 'matrix' | 'fitted';
  source: 'reviewer matrix' | 'review of rating results' | 'reviewer answer';
  reasonText: string;
}

export interface RuleHit {
  ruleId: string;
  effect: Rule['effect'];
  failureGroup?: FailureGroup;
  reason: string;
}

export interface StylingResult {
  version: 2;
  verdict: Verdict;
  /** Only final results are eligible for accuracy; floor-only is never correct. */
  judged: boolean;
  status: 'final' | 'floor-only' | 'abstained';
  /** One proven group with unresolved requirements: at least this band, not final. */
  floor: 'Almost' | null;
  /** Blocking rule IDs or structural predicates; excludes optional/advisory prompts. */
  unresolvedReasons: string[];
  failureGroups: FailureGroup[];
  hits: RuleHit[];
  questions: string[];
  gapNotes: string[];
  advisoryNotes: string[];
  /** A flag for every declared fact, including every fact on each item. */
  missingFacts: Record<string, boolean>;
  /** Supplied values with no applicable rule data, not mislabelled as absent. */
  unassessedFacts: string[];
  /** Accuracy mode excludes fitted rules, including their unanswered questions. */
  excludedRuleIds: string[];
}
