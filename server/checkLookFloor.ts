import type { WardrobeItem } from "../constants/types";
import type { CheckLookGuardResult, CheckLookRequest } from "../lib/checkLookGuard";
import type { JudgeAnswer, JudgeResult } from "./checkLookJudge";

export const CHECK_LOOK_FLOOR_RULES = [
  "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "R6",
] as const;
export type CheckLookFloorRule = typeof CHECK_LOOK_FLOOR_RULES[number];

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
  N1: "The hem may not suit this occasion.",
  N2: "This piece needs a worn cover.",
  N3: "The sheer sleeve needs lining.",
  N4: "This look conflicts with one of your preferences.",
  N5: "White, ivory or cream may not suit this wedding role.",
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
const WHITE_WEDDING_COLOURS = new Set(["white", "ivory", "cream"]);

function normaliseSubtype(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function colourTokens(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+and\s+|[,/&+]/i).map(token => token.trim()).filter(Boolean);
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
    if (failure === "A hem clearly above the knee does not meet the church coverage rule.") fired.add("N1");
    else if (/backless|strapless|exposed back or strap/i.test(failure)) fired.add("N2");
    else if (/assigned set|announced funeral colour/i.test(failure)) fired.add("N6");
    else if (/preference|never wears|head-covering/i.test(failure)) fired.add("N4");
    else fired.add("R6");
  }
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
        (normaliseSubtype(item.subType).includes("mini") ||
          garmentFacts[item.id]?.hemPosition === "above-knee"))) {
    fired.add("N1");
  }
  if (["church", "funeral"].includes(context) &&
      items.some(item => (item.category === "top" || item.category === "dress") &&
        garmentFacts[item.id]?.backOrStrapCoverage === "exposed-no-cover")) {
    fired.add("N2");
  }
  if (["church", "funeral"].includes(context) &&
      items.some(item => (item.category === "top" || item.category === "dress") &&
        garmentFacts[item.id]?.sleeveLining === "sheer")) {
    fired.add("N3");
  }

  if (request.brief.context === "wedding" || request.brief.context === "traditional-wedding") {
    const role = "role" in request.brief ? request.brief.role : undefined;
    const guestOrUnspecified = role === undefined || role === "guest" || role === "not-sure";
    if (guestOrUnspecified && !hasAssignedSet(request.brief) &&
        items.some(item => BASE_CATEGORIES.has(item.category) &&
          colourTokens(item.colorFamily).some(colour => WHITE_WEDDING_COLOURS.has(colour)))) {
      fired.add("N5");
    }
  }

  const dressCode = "dressCode" in request.brief ? request.brief.dressCode : undefined;
  if (dressCode && ABOVE_CASUAL_DRESS_CODES.has(dressCode) &&
      items.some(item => N7_SUBTYPES.has(normaliseSubtype(item.subType)))) {
    fired.add("N7");
  }
  if (dressCode && FORMAL_DRESS_CODES.has(dressCode)) {
    if (items.some(item => N8_SUBTYPES.has(normaliseSubtype(item.subType)))) fired.add("N8");
    if (dressCode === "black-tie" &&
        items.some(item => (item.category === "dress" || item.category === "bottom") &&
          (normaliseSubtype(item.subType).includes("mini") ||
            garmentFacts[item.id]?.hemPosition === "above-knee"))) {
      fired.add("N8");
    }
  }

  const churchContext = context === "church" ||
    ("venue" in request.brief && request.brief.venue === "place-of-worship");
  if (churchContext && churchAskFact(guard.missing)) fired.add("N9");

  if (guard.failures.length && !fired.has("N1") && !fired.has("N2") && !fired.has("N4") && !fired.has("N6")) {
    fired.add("R6");
  }
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

  const downgradeRules = firedRules.filter(rule => rule !== "N9");
  if (!facts.guard.failures.length && downgradeRules.length === 0) {
    return { answer, firedRules, floored: false };
  }

  const verdict = downgradeRules.length >= 2 ? "Rethink" : "Almost";
  const reasonRules = downgradeRules.length ? downgradeRules : ["R6" as const];
  const reason = reasonRules.map(rule => FIXED_REASONS[rule]).join(" ");
  return {
    answer: { ...answer, result: { verdict, reason, missing_fact: null } },
    firedRules,
    floored: true,
  };
}

