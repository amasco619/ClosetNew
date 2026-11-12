import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import type { WardrobeItem } from "../constants/types";
import {
  buildJudgeBody, callCheckLookJudge, parseJudgeResponse, MISSING_FACTS, missingFactsFromGuard,
  CHECK_LOOK_PROMPT_HASH, type JudgeCallMetadata,
} from "../server/checkLookJudge";
import { CHECK_LOOK_PROMPT } from "../server/checkLookPrompt";
import { judgeRequestSchema, exportJudgeItem, exportJudgeText, judgeGuard } from "../server/checkLookJudgeInput";
import { _testOverrides as quotaOverrides, consumeJudgeQuota, judgeQuotaOwnerPrefix } from "../server/checkLookJudgeStore";
import { _testOverrides as routeOverrides, clearJudgeCache, canonicalHash } from "../server/checkLookJudgeRoute";
import { registerRoutes, _testOverrides as authOverrides } from "../server/routes";
import { _testOverrides as consentOverrides } from "../server/aiProcessingConsent";
import { parseSyntheticLooks } from "../scripts/check-look-live-eval";

const user = "11111111-1111-4111-8111-111111111111";
const topId = "22222222-2222-4222-8222-222222222222";
const bottomId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const top: WardrobeItem = { id: topId, category: "top", subType: "blouse", colorFamily: "navy",
  fabric: "cotton", sleeveLength: "long", photoUri: "https://private.invalid/photo",
  description: "Private Name secret@example.invalid", createdAt: "", occasionTags: ["work"], seasonTags: [] };
const bottom: WardrobeItem = { ...top, id: bottomId, category: "bottom", subType: "trousers", fabric: undefined };
const input = { selection: { itemIds: [topId, bottomId], occasion: "work" as const }, brief: { context: "work" as const } };
const works = { verdict: "Works" as const, reason: "The pieces work together.", missing_fact: null };
const response = (result: unknown, finishReason = "STOP") => ({ status: 200, data: {
  modelVersion: "gemini-3.6-flash",
  candidates: [{ finishReason, content: { parts: [{ text: typeof result === "string" ? result : JSON.stringify(result) }] } }],
} });
const record = () => {};

async function adapterTests() {
  assert.equal(createHash("sha256").update(CHECK_LOOK_PROMPT).digest("hex"), CHECK_LOOK_PROMPT_HASH);
  const body = buildJudgeBody("Synthetic facts");
  assert.equal(body.systemInstruction.parts[0].text, CHECK_LOOK_PROMPT);
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.maxOutputTokens, 1024);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema.properties.missing_fact.enum, [...MISSING_FACTS]);
  assert.deepEqual(MISSING_FACTS, [
    "denomination", "assigned_set", "announced_colours", "hem_position", "sleeve_lining", "sleeve_length",
  ]);
  assert.equal(parseJudgeResponse(JSON.stringify({ ...works, extra: true }), true), null);
  const trimLogs: string[] = [];
  const originalInfo = console.info;
  console.info = value => trimLogs.push(String(value));
  try {
    for (const verdict of ["Works", "Almost", "Rethink", "Ask"] as const) {
      const trimmed = parseJudgeResponse(JSON.stringify({
        verdict, reason: "word ".repeat(100),
        missing_fact: verdict === "Ask" ? "denomination" : null,
      }), true);
      assert.equal(trimmed?.verdict, verdict);
      assert.equal(trimmed?.reason, Array(15).fill("word").join(" "));
    }
    assert.equal(parseJudgeResponse(JSON.stringify({ ...works, reason: "word ".repeat(16), missing_fact: "bad" }), true), null);
    assert.equal(trimLogs.length, 4, "only valid results count as trimmed");
    for (const log of trimLogs) assert.deepEqual(JSON.parse(log),
      { type: "check_look_judge_reason_trimmed", count: 1 });
  } finally { console.info = originalInfo; }
  const mappings: [string, typeof MISSING_FACTS[number]][] = [
    ["church denomination", "denomination"],
    ["church coverage rules for this denomination", "denomination"],
    ["church hem rule for this denomination", "denomination"],
    ["assigned aso-ebi", "assigned_set"],
    ["assigned funeral set membership", "assigned_set"],
    ["assigned aso-ebi garment details", "assigned_set"],
    ["announced funeral colours", "announced_colours"],
    ["hem position for the selected skirt or shorts", "hem_position"],
    ["hem position required by your short-skirt preference", "hem_position"],
    ["sleeve lining for the selected top", "sleeve_lining"],
    ["sleeve length required by your coverage preference", "sleeve_length"],
    ["sleeve length for the selected dress", "sleeve_length"],
  ];
  for (const [label, fact] of mappings) {
    const missingFacts = missingFactsFromGuard([label, label]);
    assert.deepEqual(missingFacts, [fact]);
    const requestBody = buildJudgeBody("Synthetic", true, missingFacts);
    assert.deepEqual(requestBody.generationConfig.responseSchema.properties.missing_fact.enum, [fact]);
    let attempts = 0;
    const answer = await callCheckLookJudge("Synthetic", { record, missingFacts, post: async (_url, actual) => {
      attempts++;
      assert.deepEqual(actual, requestBody);
      return response({ verdict: "Ask", reason: "One fact is missing.", missing_fact: fact });
    } });
    assert.equal(answer.result.missing_fact, fact);
    assert.equal(attempts, 1);
  }
  assert.deepEqual(missingFactsFromGuard(["your role at this occasion", "back coverage for the selected top"]), []);
  const noMissing = buildJudgeBody("Synthetic", true, []);
  assert.ok(!noMissing.generationConfig.responseSchema.properties.verdict.enum.includes("Ask"));
  assert.equal(noMissing.generationConfig.responseSchema.properties.missing_fact.type, "NULL");
  let trimCalls = 0;
  console.info = value => trimLogs.push(String(value));
  try {
    const trimmed = await callCheckLookJudge("Synthetic", { record, post: async (_url, actual) => {
      trimCalls++;
      const schema = (actual as ReturnType<typeof buildJudgeBody>).generationConfig.responseSchema;
      assert.ok(!schema.properties.verdict.enum.includes("Ask"), "default call with no guard facts forbids Ask");
      return response({ ...works, reason: "word ".repeat(16) });
    } });
    assert.equal(trimmed.result.reason.split(/\s+/).length, 15);
    assert.equal(trimCalls, 1, "a long valid reason never causes a retry");
  } finally { console.info = originalInfo; }
  assert.equal(parseJudgeResponse('{"verdict":"Works"}', true), null);
  assert.equal(parseJudgeResponse(JSON.stringify({ ...works, missing_fact: "denomination" }), true), null);
  for (const missing_fact of MISSING_FACTS) {
    assert.equal(parseJudgeResponse(JSON.stringify({ verdict: "Ask", reason: "One fact is missing.", missing_fact }),
      true, missing_fact === "sleeve_length")?.missing_fact, missing_fact);
  }
  assert.equal(parseJudgeResponse(JSON.stringify({ verdict: "Ask", reason: "Which venue?", missing_fact: "venue" }), true), null);
  assert.equal(parseJudgeResponse(JSON.stringify({ verdict: "Ask", reason: "Which church?", missing_fact: "denomination" }), false), null);
  const sleeveAsk = JSON.stringify({ verdict: "Ask", reason: "How long are the sleeves?", missing_fact: "sleeve_length" });
  assert.equal(parseJudgeResponse(sleeveAsk, true), null, "sleeve length is unsupported without an explicit guard allowance");
  assert.equal(parseJudgeResponse(sleeveAsk, true, true)?.missing_fact, "sleeve_length");
  assert.equal(judgeRequestSchema.safeParse({
    ...input,
    brief: { context: "interview", venue: "upscale-restaurant", dressCode: "conservative" },
  }).success, true, "bounded venue and dress-code details are accepted");
  assert.equal(judgeRequestSchema.safeParse({
    ...input, brief: { context: "interview", venue: "private venue text" },
  }).success, false, "venue text is never accepted as free text");
  assert.equal(judgeRequestSchema.safeParse({
    ...input, brief: { context: "interview", dressCode: "relaxed-ish" },
  }).success, false, "dress-code text is restricted to known choices");
  assert.equal(judgeRequestSchema.safeParse({
    ...input, garmentFacts: { [topId]: { sleeveLength: "three-quarter" } },
  }).success, true, "the route accepts the selected sleeve-length answer");
  assert.equal(judgeRequestSchema.safeParse({
    ...input, garmentFacts: { [topId]: { sleeveLength: "elbow" } },
  }).success, false, "sleeve-length answers are restricted to garment tokens and not-sure");
  for (const brief of [
    { context: "wedding", role: "guest", timeOfDay: "evening" },
    { context: "funeral", role: "family", timeOfDay: "daytime", announcedColours: { kind: "none" }, assignedGroupId: "none" },
    { context: "event", role: "host", timeOfDay: "not-sure" },
    { context: "traditional-wedding", role: "bridal-party", timeOfDay: "daytime", asoEbiGroupId: "none" },
    { context: "date", timeOfDay: "evening" },
  ]) {
    assert.equal(judgeRequestSchema.safeParse({ ...input, brief }).success, true,
      `${brief.context} accepts its optional role/time-of-day fields`);
  }
  assert.equal(judgeRequestSchema.safeParse({
    ...input, brief: { context: "work", timeOfDay: "evening" },
  }).success, false, "time of day is not accepted outside event-type contexts");
  assert.equal(judgeRequestSchema.safeParse({
    ...input, brief: { context: "work", denomination: "anglican" },
  }).success, false, "a denomination is only accepted for church or place-of-worship context");
  const qualifiedBrief = judgeRequestSchema.parse({
    ...input,
    brief: { context: "interview", venue: "upscale-restaurant", dressCode: "conservative" },
  });
  assert.deepEqual(
    judgeGuard(qualifiedBrief, [top, bottom], [], {}),
    { pass: true, failures: [], missing: [], flags: [] },
    "venue and dress-code qualifiers are accepted without changing deterministic guard rules",
  );
  const unsafeBriefText = exportJudgeText({
    ...input,
    brief: {
      context: "work", venue: "Private venue", dressCode: "Private dress code",
      role: "Private role", timeOfDay: "custom",
    } as any,
  }, [top, bottom], [], {});
  assert.ok(!unsafeBriefText.includes("Private"), "the exporter also allowlists qualifiers independently of the request parser");
  assert.match(unsafeBriefText, /"venue":null/);
  assert.match(unsafeBriefText, /"dress_code":null/);
  assert.match(unsafeBriefText, /"role":null/);
  assert.match(unsafeBriefText, /"time_of_day":null/);
  const timedWedding = judgeRequestSchema.parse({
    ...input,
    brief: { context: "wedding", venue: "outdoors", role: "guest", timeOfDay: "evening" },
  });
  const timedWeddingText = exportJudgeText(timedWedding, [top, bottom], [], {});
  assert.match(timedWeddingText,
    /"context":"wedding","venue":"outdoors","dress_code":null,"denomination":null,"role":"guest","announced_colours":null,"time_of_day":"evening","assigned_set":null/);
  const owambeBrief = judgeRequestSchema.parse({
    ...input,
    brief: { context: "owambe", role: "guest", asoEbiGroupId: "none", timeOfDay: "evening" },
  });
  assert.match(exportJudgeText(owambeBrief, [top, bottom], [], {}),
    /"context":"owambe","venue":null,"dress_code":null,"denomination":null,"role":"guest","announced_colours":null,"time_of_day":"evening","assigned_set":"none"/);
  const worshipBrief = judgeRequestSchema.parse({
    ...input,
    brief: { context: "event", venue: "place-of-worship", denomination: "anglican", timeOfDay: "daytime" },
  });
  assert.deepEqual(judgeGuard(worshipBrief, [top, bottom], [], {}).missing,
    ["back coverage for the selected top", "strap coverage for the selected top"],
    "a place-of-worship venue enables the church fact guard");
  const liningFactsText = exportJudgeText({
    ...input,
    brief: { context: "church", denomination: "anglican" },
    garmentFacts: { [topId]: { backless: false, strapless: false, sleeveLining: "not-sure" } },
  }, [{ ...top, fabric: "lace" }, bottom], [], {});
  assert.match(liningFactsText, /sleeve lining unknown/);
  const combinedCoverageRequest = judgeRequestSchema.parse({
    ...input,
    brief: { context: "church", denomination: "anglican" },
    garmentFacts: { [topId]: { backOrStrapCoverage: "exposed-with-cover" } },
  });
  assert.match(exportJudgeText(combinedCoverageRequest, [top, bottom], [], {}),
    /back\/strap coverage exposed-with-cover/);
  const canonicalColours: Array<[string, string]> = [
    ["ivory", "ivory"], ["wine", "wine"], ["royal blue", "royal blue"], ["emerald", "emerald"],
    ["champagne", "champagne"], ["nude", "nude"], ["tan", "tan"], ["lilac", "lilac"],
    ["ash", "ash"], ["grey", "grey"], ["stone", "stone"], ["camel", "camel"], ["teal", "teal"],
    ["coral red", "coral"], ["navy blue", "navy"], ["off-white", "cream"],
    ["royal-blue", "royal blue"], ["offwhite", "cream"],
  ];
  for (const [stored, expected] of canonicalColours) {
    assert.ok(exportJudgeItem({ ...top, colorFamily: stored }).includes(`Colour: ${expected};`), `${stored} maps to ${expected}`);
  }
  assert.ok(exportJudgeItem({ ...top, colorFamily: "blue and orange" }).includes("Colour: blue and orange;"));
  assert.ok(exportJudgeItem({ ...top, colorFamily: "green and yellow" }).includes("Colour: green and yellow;"));
  assert.ok(exportJudgeItem({ ...top, colorFamily: "ash/grey" }).includes("Colour: ash and grey;"));
  assert.ok(exportJudgeItem({ ...top, colorFamily: "unmatched shade" }).includes("Colour: unknown;"));
  assert.ok(exportJudgeItem({ ...top, colorFamily: "constructor" }).includes("Colour: unknown;"));
  assert.ok(exportJudgeItem({ ...top, colorFamily: "blue and unmatched" }).includes("Colour: blue and unknown;"));
  for (const fabric of [
    "George", "Swiss voile", "aso-oke", "Akwete", "Hollandais", "cord lace", "French lace",
    "beaded lace", "Ankara/wax print", "adire", "brocade", "sequin", "crepe", "wool blend", "polyester blend",
  ]) {
    assert.ok(exportJudgeItem({ ...top, fabric: fabric as WardrobeItem["fabric"] }).includes(`Fabric: ${fabric};`), fabric);
  }
  for (const subtype of [
    "abaya", "kaftan", "kimono jacket", "trainers", "shorts", "skirt suit", "head tie", "wrapper",
    "iro and buba", "gele", "ichafu", "block sandals", "trench coat", "low heels", "flat sandals", "t-shirt",
  ]) {
    assert.ok(exportJudgeItem({ ...top, subType: subtype }).includes(`Name: ${subtype};`), subtype);
  }
  const detailed = exportJudgeItem({
    ...top,
    fit: "wide-leg" as WardrobeItem["fit"],
    neckline: "round" as WardrobeItem["neckline"],
    formalityLevel: 7,
  });
  assert.ok(detailed.includes("sleeves long"));
  assert.ok(detailed.includes("fit wide-leg"));
  assert.ok(detailed.includes("neckline round"));
  assert.ok(detailed.includes("formality 7"));
  const oldInfo = console.info;
  const colourLogs: string[] = [];
  console.info = (...args: unknown[]) => colourLogs.push(args.map(String).join(" "));
  try {
    const text = exportJudgeText(input, [{ ...top, colorFamily: "Unmatched Shade" }, bottom], [], {});
    assert.ok(text.includes("Colour: unknown;"));
  } finally {
    console.info = oldInfo;
  }
  assert.equal(colourLogs.length, 1);
  assert.ok(colourLogs[0].includes('"unmatched shade":1'));
  assert.ok(!colourLogs[0].includes(topId) && !colourLogs[0].includes("private.invalid"));
  const metadata: JudgeCallMetadata[] = [];
  const good = await callCheckLookJudge("Synthetic", { post: async () => response(works), record: event => metadata.push(event) });
  assert.equal(good.modelVersion, "gemini-3.6-flash");
  assert.equal(good.promptHash, CHECK_LOOK_PROMPT_HASH);
  assert.deepEqual(good.result, works);
  assert.equal(metadata.length, 1);
  assert.deepEqual(Object.keys(metadata[0]).sort(), ["type", "requestedModel", "modelVersion", "promptHash", "attempt", "status", "durationMs"].sort());
  assert.ok(!JSON.stringify(metadata).includes("Synthetic"));
  assert.ok(!JSON.stringify(metadata).includes(works.reason));
  let calls = 0;
  const retried = await callCheckLookJudge("Synthetic", { record, post: async () =>
    response(++calls === 1 ? "not JSON" : works) });
  assert.equal(calls, 2);
  assert.deepEqual(retried.result, works);
  calls = 0;
  await assert.rejects(callCheckLookJudge("Synthetic", { record, post: async () => {
    calls++; return response("not JSON");
  } }));
  assert.equal(calls, 2, "only one parse retry");
  calls = 0;
  const converted = await callCheckLookJudge("Synthetic", { record, post: async (_url, requestBody) => {
    calls++;
    const schema = (requestBody as ReturnType<typeof buildJudgeBody>).generationConfig.responseSchema;
    if (calls === 1) return response({ verdict: "Ask", reason: "Which venue?", missing_fact: "venue" });
    assert.ok(!schema.properties.verdict.enum.includes("Ask"), "unsupported Ask conversion asks the model for its own best verdict");
    return response({ verdict: "Almost", reason: "Choose a quieter layer.", missing_fact: null });
  } });
  assert.equal(converted.result.verdict, "Almost");
  assert.equal(calls, 2);
  calls = 0;
  const sleeveAskConverted = await callCheckLookJudge("Synthetic", { record, post: async (_url, requestBody) => {
    calls++;
    const schema = (requestBody as ReturnType<typeof buildJudgeBody>).generationConfig.responseSchema;
    if (calls === 1) {
      assert.ok(!schema.properties.verdict.enum.includes("Ask"), "no missing facts means no Ask");
      return response({ verdict: "Ask", reason: "What are the sleeves like?", missing_fact: "sleeve_length" });
    }
    assert.ok(!schema.properties.verdict.enum.includes("Ask"), "unsupported sleeve-length Ask triggers the one non-Ask retry");
    return response({ verdict: "Almost", reason: "Choose another top.", missing_fact: null });
  } });
  assert.equal(sleeveAskConverted.result.verdict, "Almost");
  assert.equal(calls, 2);
  calls = 0;
  const supportedSleeveAsk = await callCheckLookJudge("Synthetic", {
    record, missingFacts: ["sleeve_length"], post: async () => {
      calls++; return response({ verdict: "Ask", reason: "How long are the sleeves?", missing_fact: "sleeve_length" });
    },
  });
  assert.equal(supportedSleeveAsk.result.missing_fact, "sleeve_length");
  assert.equal(calls, 1, "a guard-supported sleeve-length Ask is accepted without retry");
  calls = 0;
  const unsupportedKnownAsk = await callCheckLookJudge("Synthetic", {
    record, missingFacts: ["hem_position"], post: async (_url, requestBody) => {
      calls++;
      const schema = (requestBody as ReturnType<typeof buildJudgeBody>).generationConfig.responseSchema;
      if (calls === 1) {
        assert.deepEqual(schema.properties.missing_fact.enum, ["hem_position"]);
        return response({ verdict: "Ask", reason: "Which church?", missing_fact: "denomination" });
      }
      assert.ok(!schema.properties.verdict.enum.includes("Ask"));
      return response(works);
    },
  });
  assert.equal(calls, 2, "an out-of-schema but known Ask still triggers the safety net");
  assert.deepEqual(unsupportedKnownAsk.result, works);
  calls = 0;
  await assert.rejects(callCheckLookJudge("Synthetic", { record, post: async () => {
    calls++; throw new Error("Network failure with private details");
  } }));
  assert.equal(calls, 1, "network errors do not consume a parse retry");
  const providerErrors: JudgeCallMetadata[] = [];
  await assert.rejects(callCheckLookJudge("Synthetic", {
    record: event => providerErrors.push(event),
    post: async () => { throw { response: { status: 429 }, private: "not logged" }; },
  }));
  assert.equal(providerErrors[0].status, 429);
  assert.ok(!JSON.stringify(providerErrors).includes("not logged"));
  const timeoutEvents: JudgeCallMetadata[] = [];
  let aborted: AbortSignal | undefined;
  await assert.rejects(callCheckLookJudge("Synthetic", { timeoutMs: 10, record: event => timeoutEvents.push(event),
    post: async (_url, _body, config) => { aborted = config.signal; return new Promise(() => {}); } }));
  assert.equal(aborted?.aborted, true);
  assert.equal(timeoutEvents.length, 1, "even an unresponsive mock produces sanitised call metadata");
  await assert.rejects(callCheckLookJudge("Synthetic"), /Live judge access blocked/);
  assert.equal(canonicalHash({ b: 2, a: { d: 4, c: 3 } }), canonicalHash({ a: { c: 3, d: 4 }, b: 2 }));
}

async function quotaTests() {
  const hits = new Map<string, number>();
  quotaOverrides.client = { rpc: async (name: string, args: { p_key: string }) => {
    assert.equal(name, "ratelimit_increment");
    const count = (hits.get(args.p_key) ?? 0) + 1;
    hits.set(args.p_key, count);
    return { data: [{ hits: count }], error: null };
  } } as any;
  const now = Date.parse("2026-11-09T12:00:00Z");
  assert.equal((await Promise.all(Array.from({ length: 12 }, () => consumeJudgeQuota(user, false, now)))).filter(row => row.allowed).length, 5);
  hits.clear();
  assert.equal((await Promise.all(Array.from({ length: 35 }, () => consumeJudgeQuota(user, true, now)))).filter(row => row.allowed).length, 30);
  assert.equal((await consumeJudgeQuota(user, false, now + 86_400_000)).allowed, true, "new UTC day gets a distinct durable key");
  assert.ok([...hits.keys()].every(key => key.startsWith(judgeQuotaOwnerPrefix(user))));
  quotaOverrides.client = { rpc: async () => ({ data: null, error: { message: "unavailable" } }) } as any;
  await assert.rejects(consumeJudgeQuota(user, false, now), /unavailable/);
  quotaOverrides.client = { rpc: async () => ({ data: [{ hits: 0 }], error: null }) } as any;
  await assert.rejects(consumeJudgeQuota(user, false, now), /unavailable/);
  quotaOverrides.client = { rpc: async () => new Promise(() => {}) } as any;
  await assert.rejects(consumeJudgeQuota(user, false, now), /unavailable/, "durable timeout never falls back to memory");
  delete quotaOverrides.client;
  await assert.rejects(consumeJudgeQuota(user, false, now), /Live judge quota access blocked/);
}

async function routeTests() {
  const app = express();
  app.use(express.json());
  await registerRoutes(app);
  let providerCalls = 0;
  let quotaCalls = 0;
  let lastText = "";
  let premium = false;
  let consent = true;
  let currentResult = works as { verdict: "Works" | "Almost" | "Rethink" | "Ask"; reason: string; missing_fact: "denomination" | "sleeve_length" | null };
  authOverrides.authenticatedUser = { id: user };
  consentOverrides.load = async () => ({ amodka_ai_image_processing: consent ? "allowed" : "declined" });
  routeOverrides.load = async () => ({ items: [top, bottom], groups: [], constraints: {} });
  routeOverrides.entitlement = async () => ({ isPremium: premium });
  routeOverrides.quota = async (_id, isPremium) => {
    assert.equal(isPremium, premium, "tier comes from the server");
    quotaCalls++; return { allowed: true, remaining: 4 };
  };
  const normalJudge = async (text: string) => {
    providerCalls++; lastText = text;
    return { result: currentResult, modelVersion: "gemini-3.6-flash", promptHash: CHECK_LOOK_PROMPT_HASH };
  };
  routeOverrides.judge = normalJudge;
  const send = (body: object = input) => request(app).post("/api/check-my-look").send(body);
  routeOverrides.enabled = false;
  assert.deepEqual((await send()).body, { useLocalCheck: true, reason: "disabled" });
  assert.equal(providerCalls, 0);
  assert.equal(quotaCalls, 0);
  consent = false;
  assert.equal((await send()).status, 403, "consent middleware also protects a flag-off route");
  consent = true;
  delete authOverrides.authenticatedUser;
  assert.equal((await send()).status, 401);
  authOverrides.authenticatedUser = { id: user };
  routeOverrides.enabled = true;
  assert.equal((await send({ ...input, premium: true })).status, 400);
  assert.equal((await send({ ...input, selection: { ...input.selection, itemIds: [topId, otherId] } })).status, 404);
  assert.equal(providerCalls, 0, "ownership is resolved before any provider call");
  const first = await send();
  assert.deepEqual(first.body, { verdict: "Works" }, "Free never receives reason, swaps, question or provider metadata");
  assert.equal(providerCalls, 1);
  assert.ok(!lastText.includes(user) && !lastText.includes(topId) && !lastText.includes(top.photoUri));
  const venueRequest = {
    ...input,
    brief: { context: "interview" as const, venue: "upscale-restaurant" as const, dressCode: "conservative" as const },
  };
  clearJudgeCache(user);
  await send(venueRequest);
  assert.match(lastText, /"venue":"upscale-restaurant"/);
  assert.match(lastText, /"dress_code":"conservative"/);
  clearJudgeCache(user);
  providerCalls = 0;
  quotaCalls = 0;
  assert.ok(!lastText.includes("secret@example.invalid") && !lastText.includes("Private Name"));
  assert.ok(lastText.includes("Quality: unknown"));
  assert.ok(!exportJudgeItem(bottom).includes("Fabric:"));
  assert.ok(!exportJudgeItem({ ...top, subType: "private@example.invalid", colorFamily: "Private Name" }).includes("private@"));
  assert.equal((await send()).status, 200);
  assert.equal(providerCalls, 1, "identical input uses the short-lived cache");
  assert.equal((await send()).status, 200);
  assert.equal(quotaCalls, 2, "cache hits still consume a verdict admission");
  const realNow = Date.now;
  const expiredTime = realNow() + 61_000;
  try {
    Date.now = () => expiredTime;
    await send();
  } finally { Date.now = realNow; }
  assert.equal(providerCalls, 2, "cache expires after its short TTL");
  premium = true;
  const premiumResult = await send();
  assert.equal(premiumResult.body.reason, works.reason);
  assert.ok("swapSuggestion" in premiumResult.body, "Premium always has a nullable owned-item swap field");
  assert.equal(providerCalls, 2, "tier payloads are rebuilt, never cached as Free/Premium objects");
  authOverrides.authenticatedUser = { id: otherId };
  await send();
  assert.equal(providerCalls, 3, "cache is owner scoped");
  authOverrides.authenticatedUser = { id: user };
  clearJudgeCache(user);
  currentResult = { verdict: "Ask", reason: "Which church denomination?", missing_fact: "denomination" };
  const churchInput = { ...input, brief: { context: "church", denomination: "not-sure" } };
  const ask = await send(churchInput);
  assert.equal(ask.body.verdict, "Ask");
  assert.equal(typeof ask.body.question, "string");
  assert.equal(ask.body.missing_fact, "denomination");
  premium = true;
  clearJudgeCache(user);
  routeOverrides.load = async () => ({
    items: [{ ...top, sleeveLength: undefined }, bottom], groups: [], constraints: { noSleeveless: true },
  });
  routeOverrides.judge = async (_text, options) => {
    assert.deepEqual(options?.missingFacts, ["sleeve_length"],
      'the exact guard missing fact is mapped to the sleeve_length Ask allowance');
    return {
      result: { verdict: "Ask", reason: "One detail is missing.", missing_fact: "sleeve_length" },
      modelVersion: "gemini-3.6-flash", promptHash: CHECK_LOOK_PROMPT_HASH,
    };
  };
  const sleeveAskResponse = await send();
  assert.deepEqual(
    { verdict: sleeveAskResponse.body.verdict, missing_fact: sleeveAskResponse.body.missing_fact,
      question: sleeveAskResponse.body.question },
    { verdict: "Ask", missing_fact: "sleeve_length", question: "How long are the sleeves on this piece?" },
  );
  clearJudgeCache(user);
  routeOverrides.load = async () => ({ items: [top, bottom], groups: [], constraints: {} });
  routeOverrides.judge = async (_text, options) => {
    assert.deepEqual(options?.missingFacts, []);
    return {
      result: { verdict: "Ask", reason: "One detail is missing.", missing_fact: "sleeve_length" },
      modelVersion: "gemini-3.6-flash", promptHash: CHECK_LOOK_PROMPT_HASH,
    };
  };
  assert.deepEqual((await send()).body, { useLocalCheck: true, reason: "unavailable" },
    "the route never returns sleeve_length Ask when the guard did not list that missing fact");
  routeOverrides.judge = normalJudge;
  premium = false;
  clearJudgeCache(user);
  assert.deepEqual((await send(churchInput)).body, { verdict: "Almost" }, "Free Ask conversion never exposes reasons");
  routeOverrides.quota = async () => ({ allowed: false, remaining: 0 });
  const before = providerCalls;
  assert.equal((await send()).status, 429);
  routeOverrides.quota = async () => { throw new Error("durable store down"); };
  assert.equal((await send()).status, 503);
  assert.equal(providerCalls, before, "quota denial and outage fail closed, even with a cached answer");
  routeOverrides.quota = async () => ({ allowed: true, remaining: 2 });
  routeOverrides.load = async () => { throw new Error("membership lookup failed"); };
  assert.equal((await send()).status, 503);
  routeOverrides.lookupTimeoutMs = 5;
  routeOverrides.load = async () => new Promise(() => {});
  assert.equal((await send()).status, 503, "membership timeout blocks, never returns a verdict");
  routeOverrides.load = async () => ({ items: [top, bottom], groups: [], constraints: {} });
  assert.equal((await send({ ...input, brief: { context: "owambe", role: "guest", asoEbiGroupId: otherId } })).status, 503);
  clearJudgeCache();
  routeOverrides.judge = async () => { throw new Error("provider timed out"); };
  assert.deepEqual((await send()).body, { useLocalCheck: true, reason: "unavailable" }, "provider failure uses the unchanged local path");
  delete authOverrides.authenticatedUser;
  delete consentOverrides.load;
  for (const key of Object.keys(routeOverrides)) Reflect.deleteProperty(routeOverrides, key);
  clearJudgeCache();
}

async function main() {
  assert.equal(process.env.NODE_ENV, "test", "run through the repository test runner");
  await adapterTests();
  await quotaTests();
  const church = judgeRequestSchema.parse({ ...input, brief: { context: "church", denomination: "pentecostal" },
    garmentFacts: { [topId]: { backless: false, strapless: false, hemPosition: "above-knee" } } });
  const dress = { ...top, category: "dress" as const, subType: "gown" };
  const churchDress = { ...church, selection: { ...church.selection, itemIds: [topId] } };
  const guard = judgeGuard(churchDress, [dress], [], {});
  assert.equal(guard.failures.length, 0);
  assert.equal(guard.flags.length, 1, "Pentecostal above-knee hem is a flag, not a block");
  const coverage = judgeGuard(churchDress, [dress], [], { noShortSkirts: true });
  assert.ok(coverage.failures.length > 0, "the separate personal coverage preference still applies");
  const sleeveUnknown = judgeRequestSchema.parse({
    selection: { itemIds: [topId], occasion: "work" },
    brief: { context: "work" },
  });
  const missingSleeve = { ...top, sleeveLength: undefined };
  assert.ok(judgeGuard(sleeveUnknown, [missingSleeve], [], { minimumSleeveLength: "short" })
    .missing.includes("sleeve length required by your coverage preference"));
  const answeredSleeve = judgeRequestSchema.parse({
    ...sleeveUnknown, garmentFacts: { [topId]: { sleeveLength: "long" } },
  });
  assert.match(exportJudgeText(answeredSleeve, [missingSleeve], [], {}), /sleeves long/);
  assert.deepEqual(judgeGuard(answeredSleeve, [missingSleeve], [], { minimumSleeveLength: "short" }),
    { pass: true, failures: [], missing: [], flags: [] },
    "the explicitly supplied sleeve answer resolves the missing-fact guard");
  const shortSleeve = judgeRequestSchema.parse({
    ...sleeveUnknown, garmentFacts: { [topId]: { sleeveLength: "short" } },
  });
  assert.ok(judgeGuard(shortSleeve, [missingSleeve], [], { minimumSleeveLength: "long" })
    .failures.includes("Sleeve shorter than your preference"));
  const unsureSleeve = judgeRequestSchema.parse({
    ...sleeveUnknown, garmentFacts: { [topId]: { sleeveLength: "not-sure" } },
  });
  assert.ok(judgeGuard(unsureSleeve, [missingSleeve], [], { minimumSleeveLength: "short" })
    .missing.includes("sleeve length required by your coverage preference"),
  "Not sure remains unresolved");
  const text = exportJudgeText(input, [top, bottom], [], { noSleeveless: true });
  assert.ok(text.includes("Deterministic guard facts:"));
  assert.equal(judgeRequestSchema.safeParse({ ...input, garmentFacts: { [otherId]: { backless: true } } }).success, false);
  assert.equal(parseSyntheticLooks(readFileSync("attached_assets/looks3_1794220715219.txt", "utf8")).length, 72);
  await routeTests();
  console.log("checkLookJudge: adapter, privacy, guard, quota and mounted route checks passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
