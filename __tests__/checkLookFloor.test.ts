import assert from "node:assert/strict";
import type { WardrobeItem } from "../constants/types";
import type { CheckLookRequest } from "../lib/checkLookGuard";
import {
  CHECK_LOOK_FLOOR_N1_ENABLED, CHECK_LOOK_FLOOR_N2_ENABLED, CHECK_LOOK_FLOOR_N3_ENABLED,
  CHECK_LOOK_FLOOR_N4_ENABLED, CHECK_LOOK_FLOOR_N5_ENABLED, CHECK_LOOK_FLOOR_N6_ENABLED,
  CHECK_LOOK_FLOOR_N7_ENABLED, CHECK_LOOK_FLOOR_N8_ENABLED, CHECK_LOOK_FLOOR_N9_ENABLED,
  CHECK_LOOK_FLOOR_R6_ENABLED, floorJudgeAnswer,
} from "../server/checkLookFloor";
import { CHECK_LOOK_PROMPT_HASH, type JudgeAnswer, type JudgeResult } from "../server/checkLookJudge";

const topId = "22222222-2222-4222-8222-222222222222";
const bottomId = "33333333-3333-4333-8333-333333333333";
const top: WardrobeItem = {
  id: topId, category: "top", subType: "blouse", colorFamily: "navy", fabric: "cotton",
  sleeveLength: "long", photoUri: "", description: "", createdAt: "", occasionTags: [], seasonTags: [],
};
const bottom: WardrobeItem = {
  ...top, id: bottomId, category: "bottom", subType: "trousers", colorFamily: "black",
};
const guard = { pass: true, failures: [], missing: [], flags: [] };
const requestItems = new WeakMap<CheckLookRequest, WardrobeItem[]>();

function makeRequest(brief: Record<string, unknown>, items: WardrobeItem[] = [top, bottom],
  garmentFacts: Record<string, any> = {}): CheckLookRequest {
  const request: CheckLookRequest = {
    selection: { itemIds: items.map(item => item.id), occasion: "event" },
    brief: brief as CheckLookRequest["brief"],
    ...(Object.keys(garmentFacts).length ? { garmentFacts } : {}),
  };
  requestItems.set(request, items);
  return request;
}
function answer(verdict: JudgeResult["verdict"] = "Works"): JudgeAnswer {
  return {
    result: {
      verdict, reason: "Model-authored reason must be replaced only when floored.",
      missing_fact: verdict === "Ask" ? "denomination" : null,
    },
    modelVersion: "gemini-3.6-flash", promptHash: CHECK_LOOK_PROMPT_HASH,
  };
}
function floorFor(request: CheckLookRequest, options: {
  items?: WardrobeItem[]; failures?: string[]; missing?: string[]; verdict?: JudgeResult["verdict"];
} = {}) {
  return floorJudgeAnswer(answer(options.verdict), {
    request, items: options.items ?? requestItems.get(request) ?? [top, bottom],
    guard: {
      pass: !(options.failures?.length || options.missing?.length),
      failures: options.failures ?? [], missing: options.missing ?? [],
    },
  });
}

const cases: Array<{
  id: string; request: CheckLookRequest; fired: string; boundary?: CheckLookRequest;
}> = [
  {
    id: "N1", request: makeRequest({ context: "church", denomination: "anglican" }, [top, {
      ...bottom, id: bottomId, category: "dress", subType: "midi-dress",
    }], { [bottomId]: { hemPosition: "above-knee" } }), fired: "N1",
    boundary: makeRequest({ context: "event" }, [top, {
      ...bottom, id: bottomId, category: "dress", subType: "midi-dress",
    }], { [bottomId]: { hemPosition: "above-knee" } }),
  },
  {
    id: "N2", request: makeRequest({ context: "funeral", announcedColours: { kind: "none" },
      assignedGroupId: "none" }, [top, bottom], { [topId]: { backOrStrapCoverage: "exposed-no-cover" } }),
    fired: "N2",
  },
  {
    id: "N3", request: makeRequest({ context: "church", denomination: "anglican" },
      [{ ...top, fabric: "cotton" }, bottom], { [topId]: { sleeveLining: "sheer" } }), fired: "N3",
    boundary: makeRequest({ context: "work" }, [top, bottom], { [topId]: { sleeveLining: "sheer" } }),
  },
  {
    id: "N4", request: makeRequest({ context: "work" }), fired: "N4",
  },
  {
    id: "N5", request: makeRequest({ context: "wedding", role: "guest" },
      [{ ...top, colorFamily: "ivory" }, bottom]), fired: "N5",
    boundary: makeRequest({ context: "wedding", role: "bridal-party" },
      [{ ...top, colorFamily: "ivory" }, bottom]),
  },
  {
    id: "N6", request: makeRequest({ context: "traditional-wedding", role: "guest", asoEbiGroupId: "none" }),
    fired: "N6",
  },
  {
    id: "N7", request: makeRequest({ context: "work", dressCode: "smart-casual" },
      [{ ...top, subType: "rashguard" }, bottom]), fired: "N7",
    boundary: makeRequest({ context: "work", dressCode: "casual" },
      [{ ...top, subType: "rashguard" }, bottom]),
  },
  {
    id: "N8", request: makeRequest({ context: "event", dressCode: "formal" },
      [{ ...top, subType: "jeans" }, bottom]), fired: "N8",
    boundary: makeRequest({ context: "event", dressCode: "business" },
      [{ ...top, subType: "jeans" }, bottom]),
  },
  {
    id: "N9", request: makeRequest({ context: "church", denomination: "anglican" }),
    fired: "N9",
  },
];

for (const item of cases) {
  const missing = item.id === "N9"
    ? ["back coverage for the selected top", "strap coverage for the selected top"]
    : [];
  const failures = item.id === "N4"
    ? ["Sleeve shorter than your preference"]
    : item.id === "N6" ? ["The full assigned set must be included."] : [];
  const result = floorFor(item.request, { failures, missing });
  assert.ok(result.firedRules.includes(item.fired as any), `${item.id} fires`);
  if (item.id === "N9") {
    assert.equal(result.answer.result.verdict, "Ask");
    assert.equal(result.answer.result.missing_fact, "back_strap_coverage");
  } else {
    assert.equal(result.answer.result.verdict, "Almost");
    assert.notEqual(result.answer.result.reason, answer().result.reason);
    if (item.id === "N1") {
      assert.equal(result.answer.result.reason,
        "The hem sits above the knee; check what your church expects.");
    }
  }
  if (item.boundary) {
    const boundary = floorFor(item.boundary);
    assert.ok(!boundary.firedRules.includes(item.id as any), `${item.id} boundary does not fire`);
    assert.equal(boundary.answer.result.verdict, "Works");
  }
}

assert.deepEqual([
  CHECK_LOOK_FLOOR_N1_ENABLED, CHECK_LOOK_FLOOR_N2_ENABLED, CHECK_LOOK_FLOOR_N3_ENABLED,
  CHECK_LOOK_FLOOR_N4_ENABLED, CHECK_LOOK_FLOOR_N5_ENABLED, CHECK_LOOK_FLOOR_N6_ENABLED,
  CHECK_LOOK_FLOOR_N7_ENABLED, CHECK_LOOK_FLOOR_N8_ENABLED, CHECK_LOOK_FLOOR_N9_ENABLED,
  CHECK_LOOK_FLOOR_R6_ENABLED,
], Array(10).fill(true), "every floor rule has a named one-line switch");

assert.ok(floorFor(makeRequest({ context: "church", denomination: "anglican" }), {
  failures: ["A hem clearly above the knee does not meet the church coverage rule."],
}).firedRules.includes("N1"), "guard hem failure maps to N1");
assert.ok(floorFor(makeRequest({ context: "funeral", announcedColours: { kind: "none" }, assignedGroupId: "none" }), {
  failures: ["An exposed back or strap needs a worn cover."],
}).firedRules.includes("N2"), "guard coverage failure maps to N2");
assert.ok(floorFor(makeRequest({ context: "wedding", role: "guest" }), {
  failures: ["A selected piece uses a colour the client never wears."],
}).firedRules.includes("N4"), "profile colour failure maps to N4");
assert.ok(floorFor(makeRequest({ context: "funeral", announcedColours: { kind: "colours", values: ["black"] },
  assignedGroupId: "none" }), {
  failures: ["The look does not include an announced funeral colour."],
}).firedRules.includes("N6"), "funeral colour failure maps to N6 without duplicating the guard");

const setExempt = floorFor(makeRequest({
  context: "traditional-wedding", role: "guest", asoEbiGroupId: "55555555-5555-4555-8555-555555555555",
}, [{ ...top, colorFamily: "white" }, bottom]));
assert.ok(!setExempt.firedRules.includes("N5"), "an assigned set attached to the brief exempts the colour rule");
for (const colour of ["white", "off-white", "ivory", "cream", "champagne"]) {
  const caution = floorFor(makeRequest({ context: "wedding", role: "guest" },
    [{ ...top, colorFamily: colour }, bottom]));
  assert.ok(caution.firedRules.includes("N5"), `${colour} fires N5`);
  assert.equal(caution.answer.result.verdict, "Almost", "N5 is caution-only");
  assert.equal(caution.answer.result.reason,
    "Light colours can read as bridal at a wedding; check the couple's colours.");
}
assert.ok(floorFor(makeRequest({ context: "wedding", role: "guest" },
  [{ ...top, colorFamily: "white and navy" }, bottom])).firedRules.includes("N5"),
"a known white-family token in a compound colour fires N5");

const multi = floorFor(makeRequest({ context: "funeral", announcedColours: { kind: "none" },
  assignedGroupId: "none" }, [top, bottom], {
  [topId]: { backOrStrapCoverage: "exposed-no-cover", sleeveLining: "sheer" },
}));
assert.equal(multi.answer.result.verdict, "Rethink", "two independent hard rules escalate Works to Rethink");
assert.ok(multi.firedRules.includes("N2") && multi.firedRules.includes("N3"));

const cautionPlusHard = floorFor(makeRequest({ context: "funeral", announcedColours: { kind: "none" },
  assignedGroupId: "none" }, [top, {
  ...bottom, id: bottomId, category: "dress", subType: "mini-dress",
}], {
  [topId]: { backOrStrapCoverage: "exposed-no-cover" },
  [bottomId]: { hemPosition: "above-knee" },
}));
assert.equal(cautionPlusHard.answer.result.verdict, "Almost",
  "N1 caution does not count towards the two-hard-rule Rethink threshold");

const funeralRequest = (assignedGroupId: string, items: WardrobeItem[], values = ["black"]) => makeRequest({
  context: "funeral", announcedColours: { kind: "colours", values }, assignedGroupId,
}, items);
const setId = "55555555-5555-4555-8555-555555555555";
const funeralDress: WardrobeItem = {
  ...top, id: "44444444-4444-4444-8444-444444444444", category: "dress", subType: "gown",
  colorFamily: "red",
};
assert.ok(floorFor(funeralRequest("none", [funeralDress])).firedRules.includes("N6"),
  "a single-colour funeral dress outside announced colours fires N6");
const funeralSet = floorFor(funeralRequest(setId, [
  { ...top, colorFamily: "red" }, { ...bottom, colorFamily: "blue" },
]));
assert.ok(funeralSet.firedRules.includes("N6"), "both off-colour pieces in an assigned set fire N6");
assert.equal(floorFor(funeralRequest(setId, [
  { ...top, colorFamily: "black" }, { ...bottom, colorFamily: "red" },
])).firedRules.includes("N6"), false, "one matching set piece prevents N6");
assert.equal(floorFor(funeralRequest("none", [
  { ...top, colorFamily: "red" }, { ...bottom, colorFamily: "blue" },
])).firedRules.includes("N6"), false, "unassigned top/bottom are not treated as a set");
assert.equal(floorFor(funeralRequest("none", [
  { ...funeralDress, colorFamily: "red and gold" },
])).firedRules.includes("N6"), false, "multi-colour dress is not judged by N6");
for (const [category, subtype] of [
  ["shoes", "pumps"], ["bag", "clutch"], ["jewelry", "earrings"], ["outerwear", "coat"],
] as const) {
  assert.equal(floorFor(funeralRequest(setId, [{
    ...top, category, subType: subtype, colorFamily: "red",
  }])).firedRules.includes("N6"), false, `${category} is ignored by the new N6 check`);
}
assert.equal(floorFor(funeralRequest("none", [
  funeralDress, { ...funeralDress, id: "66666666-6666-4666-8666-666666666666" },
])).firedRules.includes("N6"), false, "multiple dresses leave dominance unclear");
assert.equal(floorFor(makeRequest({ context: "casual" }), {
  failures: ["unmapped deterministic failure"],
}).answer.result.verdict, "Almost", "the R6 baseline caps any unexpected guard failure");

const alreadyAsk = floorFor(makeRequest({ context: "church", denomination: "anglican" }), {
  missing: ["back coverage for the selected top"], verdict: "Ask",
});
assert.equal(alreadyAsk.answer.result.verdict, "Ask", "the floor never changes an Ask");

for (const [missing, expected] of [
  [["church denomination"], "denomination"],
  [["church coverage rules for this denomination"], "denomination"],
  [["hem position for the selected dress"], "hem_position"],
  [["hem position required by your short-skirt preference"], "hem_position"],
  [["back coverage for the selected top", "strap coverage for the selected top"], "back_strap_coverage"],
] as const) {
  const churchRequest = makeRequest({ context: "church", denomination: "anglican" });
  const result = floorFor(churchRequest, { missing: [...missing] });
  assert.equal(result.answer.result.verdict, "Ask", `${expected} missing fact must not be Works`);
  assert.equal(result.answer.result.missing_fact, expected, `N9 maps ${missing.join(", ")}`);
}

// Deterministic property sweep: no non-Ask result improves, Ask is invariant,
// and applying the transformation twice preserves the answer.
for (let seed = 0; seed < 250; seed++) {
  const context = ["work", "church", "funeral", "naming-ceremony", "wedding"][seed % 5];
  const subtype = ["blouse", "mini-dress", "jeans", "rashguard", "sundress"][Math.floor(seed / 5) % 5];
  const selected = [{ ...top, subType: subtype, colorFamily: seed % 7 === 0 ? "cream" : "navy" }, bottom];
  const request = makeRequest(
    context === "funeral" ? { context, announcedColours: { kind: "none" }, assignedGroupId: "none" }
      : context === "naming-ceremony" ? { context, role: "guest", asoEbiGroupId: "none" }
        : context === "traditional-wedding" ? { context, role: "guest", asoEbiGroupId: "none" }
          : { context, role: context === "wedding" ? "guest" : undefined, dressCode: "formal" },
    selected,
    { [topId]: { hemPosition: seed % 4 === 0 ? "above-knee" : "at-or-below-knee",
      backOrStrapCoverage: seed % 9 === 0 ? "exposed-no-cover" : "covered" } },
  );
  const verdict = (["Works", "Almost", "Rethink", "Ask"] as const)[seed % 4];
  const facts = {
    request, items: selected,
    guard: {
      pass: seed % 3 !== 0,
      failures: seed % 3 === 0 ? ["generated guard failure"] : [],
      missing: context === "church" && seed % 4 === 0 ? ["church denomination"] : [],
    },
  };
  const first = floorJudgeAnswer(answer(verdict), facts);
  const second = floorJudgeAnswer(first.answer, facts);
  assert.deepEqual(second.answer, first.answer, "floor application is idempotent");
  if (verdict === "Ask") assert.equal(first.answer.result.verdict, "Ask");
  else {
    const order = { Rethink: 0, Almost: 1, Works: 2, Ask: 3 } as const;
    if (first.answer.result.verdict !== "Ask") {
      assert.ok(order[first.answer.result.verdict] <= order[verdict], "the floor never improves a verdict");
    } else {
      assert.ok(facts.guard.missing.length, "only N9 may convert Works to Ask");
    }
  }
}

console.log("Check my look deterministic floor: rule boundaries, mappings, fixed reasons, Ask precedence, property and idempotence passed.");
