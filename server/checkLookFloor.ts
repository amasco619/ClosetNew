import type { WardrobeItem } from "../constants/types";
import type { CheckLookGuardResult, CheckLookRequest } from "../lib/checkLookGuard";
import type { JudgeAnswer, JudgeResult } from "./checkLookJudge";

export const CHECK_LOOK_FLOOR_RULES = [
  "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "R6",
] as const;
export type CheckLookFloorRule = typeof CHECK_LOOK_FLOOR_RULES[number];

export const CHECK_LOOK_FLOOR_N1_ENABLED = true;
export const CHECK_LOOK_FLOOR_N2_ENABLED = true;
export const CHECK_LOOK_FLOOR_N3_ENABLED = true;
export const CHECK_LOOK_FLOOR_N4_ENABLED = true;
export const CHECK_LOOK_FLOOR_N5_ENABLED = true;
export const CHECK_LOOK_FLOOR_N6_ENABLED = true;
export const CHECK_LOOK_FLOOR_N7_ENABLED = true;
export const CHECK_LOOK_FLOOR_N8_ENABLED = true;
export const CHECK_LOOK_FLOOR_N9_ENABLED = true;
export const CHECK_LOOK_FLOOR_R6_ENABLED = true;

const RULE_ENABLED: Record<CheckLookFloorRule, boolean> = {
  N1: CHECK_LOOK_FLOOR_N1_ENABLED,
  N2: CHECK_LOOK_FLOOR_N2_ENABLED,
  N3: CHECK_LOOK_FLOOR_N3_ENABLED,
  N4: CHECK_LOOK_FLOOR_N4_ENABLED,
  N5: CHECK_LOOK_FLOOR_N5_ENABLED,
  N6: CHECK_LOOK_FLOOR_N6_ENABLED,
  N7: CHECK_LOOK_FLOOR_N7_ENABLED,
  N8: CHECK_LOOK_FLOOR_N8_ENABLED,
  N9: CHECK_LOOK_FLOOR_N9_ENABLED,
  R6: CHECK_LOOK_FLOOR_R6_ENABLED,
};

const HARD_RULES = new Set<CheckLookFloorRule>(["N2", "N3", "N4", "N6", "N7", "N8", "N9"]);
const CAUTION_RULES = new Set<CheckLookFloorRule>(["N1", "N5"]);

export interface CheckLookFloorFacts {
  request: CheckLookRequest;
  items: readonly WardrobeItem[];
  guard: CheckLookGuardResult;
}

export interface CheckLookFloorResult {
  answer: JudgeAnswer;
  firedRules: CheckLookFloorRule[];
  floored: boolean;
}

const FIXED_REASONS: Record<CheckLookFloorRule, string> = {
  N1: "The hem sits above the knee; check what your church expects.",
  N2: "This piece needs a worn cover.",
  N3: "The sheer sleeve needs lining.",
  N4: "This look conflicts with one of your preferences.",
  N5: "Light colours can read as bridal at a wedding; check the couple's colours.",
  N6: "The assigned colours or set need to be followed.",
  N7: "This item may be too informal for the dress code.",
  N8: "This item may not suit a formal dress code.",
  N9: "A church detail needs confirmation.",
  R6: "A wardrobe preference or styling rule needs attention.",
};

const FORMAL_DRESS_CODES = new Set(["formal", "black-tie"]);
const ABOVE_CASUAL_DRESS_CODES = new Set([
  "smart-casual", "business", "conservative", "formal", "black-tie", "traditional",
]);
const N7_SUBTYPES = new Set([
  "sports-bra", "sports-hoodie", "rashguard", "training-shoes", "swimsuit", "flip-flops",
]);
const N8_SUBTYPES = new Set([
  "t-shirt", "jeans", "shorts", "leggings", "sneakers", "hoodie", "joggers",
  "polo-shirt", "rugby-shirt", "henley", "denim-jacket",
  ...N7_SUBTYPES,
]);
const BASE_CATEGORIES = new Set(["top", "bottom", "dress"]);
const WHITE_WEDDING_COLOURS = new Set(["white", "off-white", "ivory", "cream", "champagne"]);
const MINI_SUBTYPES = new Set(["mini-dress", "mini-skirt"]);

function addRule(fired: Set<CheckLookFloorRule>, rule: CheckLookFloorRule): void {
  if (RULE_ENABLED[rule]) fired.add(rule);
}

function normaliseSubtype(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function colourTokens(value: string): string[] {
  return value.trim().toLowerCase()
    .split(/\s+and\s+|[,/&+]/i)
    .map(token => token.trim().replace(/\s+/g, "-"))
    .filter(Boolean);
}

function colourKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function selectedItems(request: CheckLookRequest, items: readonly WardrobeItem[]): WardrobeItem[] {
  return request.selection.itemIds
    .map(id => items.find(item => item.id === id))
    .filter((item): item is WardrobeItem => Boolean(item));
}

function hasAssignedSet(brief: CheckLookRequest["brief"]): boolean {
  const id = brief.context === "funeral" ? brief.assignedGroupId
    : "asoEbiGroupId" in brief ? brief.asoEbiGroupId : undefined;
  return typeof id === "string" && id !== "none" && id !== "not-sure";
}

function addGuardFailureRules(failures: readonly string[], fired: Set<CheckLookFloorRule>): void {
  for (const failure of failures) {
    if (failure === "A hem clearly above the knee does not meet the church coverage rule.") addRule(fired, "N1");
    else if (/backless|strapless|exposed back or strap/i.test(failure)) addRule(fired, "N2");
    else if (/assigned set|announced funeral colour/i.test(failure)) addRule(fired, "N6");
    else if (/preference|never wears|head-covering/i.test(failure)) addRule(fired, "N4");
    else addRule(fired, "R6");
  }
}

function hasSingleKnownColour(item: WardrobeItem): boolean {
  const colour = item.colorFamily.trim();
  return !!colour && !/^(?:unknown\b|multi(?:colou?r)?\b|various\b|multiple\b)/i.test(colour) &&
    !/(?:\s+and\s+|[,&/+])/i.test(colour);
}

function matchesAnnouncedColour(item: WardrobeItem, announced: ReadonlySet<string>): boolean {
  return hasSingleKnownColour(item) && announced.has(colourKey(item.colorFamily));
}

function isFuneralDressOrSetColourMismatch(
  request: CheckLookRequest,
  items: readonly WardrobeItem[],
): boolean {
  if (request.brief.context !== "funeral" || request.brief.announcedColours.kind !== "colours" ||
      request.brief.announcedColours.values.length === 0) return false;
  const announced = new Set(request.brief.announcedColours.values.map(colourKey));
  const dresses = items.filter(item => item.category === "dress");
  const tops = items.filter(item => item.category === "top");
  const bottoms = items.filter(item => item.category === "bottom");

  if (dresses.length === 1 && tops.length === 0 && bottoms.length === 0) {
    const dress = dresses[0];
    return hasSingleKnownColour(dress) && !matchesAnnouncedColour(dress, announced);
  }

  const groupId = request.brief.assignedGroupId;
  if (groupId === "none" || groupId === "not-sure" || dresses.length > 0 ||
      tops.length !== 1 || bottoms.length !== 1) return false;
  return [tops[0], bottoms[0]].every(item =>
    hasSingleKnownColour(item) && !matchesAnnouncedColour(item, announced),
  );
}

function churchAskFact(missing: readonly string[]): JudgeResult["missing_fact"] {
  if (missing.some(value =>
    value === "church denomination" ||
    value === "church coverage rules for this denomination" ||
    value === "church hem rule for this denomination",
  )) return "denomination";
  if (missing.some(value => /^hem position (for |required by )/.test(value))) return "hem_position";
  if (missing.some(value => /^(back|strap) coverage for the selected (top|dress)$/.test(value))) {
    return "back_strap_coverage";
  }
  return null;
}

export function getCheckLookFloorRules(facts: CheckLookFloorFacts): CheckLookFloorRule[] {
  const { request, guard } = facts;
  const items = selectedItems(request, facts.items);
  const context = request.brief.context;
  const garmentFacts = request.garmentFacts ?? {};
  const fired = new Set<CheckLookFloorRule>();

  addGuardFailureRules(guard.failures, fired);

  if (["church", "funeral", "naming-ceremony"].includes(context) &&
      items.some(item => (item.category === "dress" || item.category === "bottom") &&
        (MINI_SUBTYPES.has(normaliseSubtype(item.subType)) ||
          garmentFacts[item.id]?.hemPosition === "above-knee"))) {
    addRule(fired, "N1");
  }
  if (["church", "funeral"].includes(context) &&
      items.some(item => (item.category === "top" || item.category === "dress") &&
        garmentFacts[item.id]?.backOrStrapCoverage === "exposed-no-cover")) {
    addRule(fired, "N2");
  }
  if (["church", "funeral"].includes(context) &&
      items.some(item => (item.category === "top" || item.category === "dress") &&
        garmentFacts[item.id]?.sleeveLining === "sheer")) {
    addRule(fired, "N3");
  }
  if (isFuneralDressOrSetColourMismatch(request, items)) {
    addRule(fired, "N6");
  }

  if (request.brief.context === "wedding") {
    const role = "role" in request.brief ? request.brief.role : undefined;
    const guestOrUnspecified = role === undefined || role === "guest" || role === "not-sure";
    if (guestOrUnspecified && !hasAssignedSet(request.brief) &&
        items.some(item => BASE_CATEGORIES.has(item.category) &&
          colourTokens(item.colorFamily).some(colour => WHITE_WEDDING_COLOURS.has(colour)))) {
      addRule(fired, "N5");
    }
  }

  const dressCode = "dressCode" in request.brief ? request.brief.dressCode : undefined;
  if (dressCode && ABOVE_CASUAL_DRESS_CODES.has(dressCode) &&
      items.some(item => N7_SUBTYPES.has(normaliseSubtype(item.subType)))) {
    addRule(fired, "N7");
  }
  if (dressCode && FORMAL_DRESS_CODES.has(dressCode)) {
    if (items.some(item => N8_SUBTYPES.has(normaliseSubtype(item.subType)))) addRule(fired, "N8");
    if (dressCode === "black-tie" &&
        items.some(item => (item.category === "dress" || item.category === "bottom") &&
          (MINI_SUBTYPES.has(normaliseSubtype(item.subType)) ||
            garmentFacts[item.id]?.hemPosition === "above-knee"))) {
      addRule(fired, "N8");
    }
  }

  const churchContext = context === "church" ||
    ("venue" in request.brief && request.brief.venue === "place-of-worship");
  if (churchContext && churchAskFact(guard.missing)) addRule(fired, "N9");
  return CHECK_LOOK_FLOOR_RULES.filter(rule => fired.has(rule));
}

export function floorJudgeAnswer(answer: JudgeAnswer, facts: CheckLookFloorFacts): CheckLookFloorResult {
  const firedRules = getCheckLookFloorRules(facts);
  const originalVerdict = answer.result.verdict;
  const shouldConvertToAsk = originalVerdict === "Works" && firedRules.includes("N9");

  if (shouldConvertToAsk) {
    const missingFact = churchAskFact(facts.guard.missing);
    if (missingFact) {
      return {
        answer: { ...answer, result: {
          verdict: "Ask", reason: FIXED_REASONS.N9, missing_fact: missingFact,
        } },
        firedRules,
        floored: true,
      };
    }
  }

  if (originalVerdict !== "Works") return { answer, firedRules, floored: false };

  const applicableRules = firedRules.filter(rule => rule !== "N9");
  const hardRules = applicableRules.filter(rule => HARD_RULES.has(rule));
  const cautionRules = applicableRules.filter(rule => CAUTION_RULES.has(rule));
  const hasLegacyFloor = applicableRules.includes("R6");
  if (hardRules.length === 0 && cautionRules.length === 0 && !hasLegacyFloor) {
    return { answer, firedRules, floored: false };
  }

  const verdict = hardRules.length >= 2 ? "Rethink" : "Almost";
  const reasonRules = applicableRules;
  const reason = reasonRules.map(rule => FIXED_REASONS[rule]).join(" ");
  return {
    answer: { ...answer, result: { verdict, reason, missing_fact: null } },
    firedRules,
    floored: true,
  };
}

