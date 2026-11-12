import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase";
import { getUserEntitlement } from "./entitlements";
import { mapDbRowToWardrobeItem } from "../lib/wardrobeMapper";
import { mapDbRowToGarmentGroup } from "../lib/garmentGroupMapper";
import { evaluateCheckLook, isValidCheckLookSelection } from "../lib/checkLook";
import type { WardrobeItem, GarmentGroup, Constraints } from "../constants/types";
import { callCheckLookJudge, judgeEnabled, judgeModel, CHECK_LOOK_PROMPT_HASH, missingFactsFromGuard,
  type JudgeAnswer, type MissingFact } from "./checkLookJudge";
import { judgeRequestSchema, exportJudgeText, judgeGuard, profileJudgeConstraints, type JudgeRequest } from "./checkLookJudgeInput";
import { consumeJudgeQuota } from "./checkLookJudgeStore";

interface OwnedContext { items: WardrobeItem[]; groups: GarmentGroup[]; constraints: Partial<Constraints> }
export const _testOverrides: {
  enabled?: boolean;
  load?: (userId: string) => Promise<OwnedContext>;
  entitlement?: (userId: string) => Promise<{ isPremium: boolean }>;
  judge?: typeof callCheckLookJudge;
  quota?: typeof consumeJudgeQuota;
  lookupTimeoutMs?: number;
} = {};

// No raw user data in cache keys; answers are transient and isolated by owner.
const cache = new Map<string, Map<string, { expires: number; answer: JudgeAnswer }>>();
const servedVersions = new Map<string, string>();
const CACHE_TTL_MS = 60_000;
export function clearJudgeCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else { cache.clear(); servedVersions.clear(); }
}
export function canonicalHash(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") return Object.fromEntries(
      Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]),
    );
    return v;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

async function loadOwnedContext(userId: string): Promise<OwnedContext> {
  if (process.env.NODE_ENV === "test") {
    if (!_testOverrides.load) throw new Error("Live judge wardrobe access blocked under NODE_ENV=test");
    return _testOverrides.load(userId);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const items: WardrobeItem[] = [];
    // The mapper sees no photo fields. Pagination avoids silently losing a selected
    // garment or a confirmed set member in a large wardrobe.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseAdmin.from("wardrobe_items")
        .select("id,garment_type,sub_type,color_family,occasion,fabric,fit,pattern,pattern_scale,recommendation_semantics,created_at")
        .eq("user_id", userId).order("id").range(offset, offset + 999).abortSignal(controller.signal);
      if (error || !data) throw new Error("Wardrobe unavailable");
      items.push(...data.map(mapDbRowToWardrobeItem));
      if (data.length < 1000) break;
    }
    const groups: GarmentGroup[] = [];
    for (let offset = 0; ; offset += 1000) {
      const groupResult = await supabaseAdmin.from("garment_groups")
        .select("id,user_id,relationship_type,confirmation_status,garment_group_members(user_id,group_id,garment_id)")
        .eq("user_id", userId).order("id").range(offset, offset + 999).abortSignal(controller.signal);
      if (groupResult.error || !groupResult.data) throw new Error("Membership unavailable");
      groups.push(...groupResult.data.map(mapDbRowToGarmentGroup));
      if (groupResult.data.length < 1000) break;
    }
    const profileResult = await supabaseAdmin.from("user_profiles").select("constraints")
      .eq("id", userId).abortSignal(controller.signal).single();
    if (profileResult.error || !profileResult.data) {
      throw new Error("Membership or profile unavailable");
    }
    if (groups.some(group => group.userId !== userId || group.members.some(member => member.userId !== userId))) {
      throw new Error("Membership unavailable");
    }
    return { items, groups, constraints: profileJudgeConstraints(profileResult.data.constraints) };
  } finally { clearTimeout(timer); }
}

const questions: Record<MissingFact, string> = {
  denomination: "Which church denomination is this for?",
  assigned_set: "Has a particular set been assigned for this occasion?",
  announced_colours: "Has the family announced any colours?",
  hem_position: "Does the hem sit above or below your knee?",
  sleeve_lining: "Are the sleeves lined or sheer?",
  sleeve_length: "How long are the sleeves on this piece?",
};

function safeSwap(context: OwnedContext, request: JudgeRequest, userId: string) {
  const local = evaluateCheckLook(context.items, request.selection, {
    premium: true, groups: context.groups, ownerId: userId,
  });
  if (!("swaps" in local)) return null;
  for (const swap of local.swaps) {
    const selection = { ...request.selection, itemIds: request.selection.itemIds.map(id =>
      id === swap.replacesId ? swap.replacement.id : id) };
    // A local suggestion must also respect the server-loaded constraints/brief.
    const guard = judgeGuard({ ...request, selection }, context.items, context.groups, context.constraints);
    if (guard.pass) return { replacesId: swap.replacesId, replacementId: swap.replacement.id };
  }
  return null;
}

export async function checkLookJudgeRoute(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const userId = (req as Request & { authenticatedUser?: { id: string } }).authenticatedUser?.id;
  if (!userId) { res.status(401).json({ error: "authentication_required" }); return; }
  const enabled = process.env.NODE_ENV === "test" && _testOverrides.enabled !== undefined
    ? _testOverrides.enabled : judgeEnabled();
  if (!enabled) { res.json({ useLocalCheck: true, reason: "disabled" }); return; }
  const parsed = judgeRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_check_look_request" }); return; }
  const request = parsed.data;
  let context: OwnedContext;
  let premium: boolean;
  let lookupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (process.env.NODE_ENV === "test" && !_testOverrides.entitlement) throw new Error("Missing entitlement fixture");
    const lookup = async () => {
      const entitlement = process.env.NODE_ENV === "test" && _testOverrides.entitlement
        ? await _testOverrides.entitlement(userId) : await getUserEntitlement(userId);
      return { entitlement, context: await loadOwnedContext(userId) };
    };
    const loaded = await Promise.race([
      lookup(),
      new Promise<never>((_resolve, reject) => {
        lookupTimer = setTimeout(() => reject(new Error("Judge details timed out")),
          process.env.NODE_ENV === "test" ? _testOverrides.lookupTimeoutMs ?? 4_000 : 4_000);
      }),
    ]);
    const entitlement = loaded.entitlement;
    premium = entitlement.isPremium;
    context = loaded.context;
  } catch {
    res.status(503).json({ error: "check_look_details_unavailable", retry: true }); return;
  } finally { if (lookupTimer) clearTimeout(lookupTimer); }
  if (!request.selection.itemIds.every(id => context.items.some(item => item.id === id))) {
    res.status(404).json({ error: "selected_items_unavailable" }); return;
  }
  if (!isValidCheckLookSelection(context.items, request.selection.itemIds)) {
    res.status(400).json({ error: "invalid_check_look_selection" }); return;
  }
  // A failed or incomplete membership lookup must never be bypassed with local scoring.
  const assigned = "asoEbiGroupId" in request.brief ? request.brief.asoEbiGroupId
    : "assignedGroupId" in request.brief ? request.brief.assignedGroupId : undefined;
  if (assigned && assigned !== "none" && assigned !== "not-sure") {
    const group = context.groups.find(group => group.id === assigned &&
      group.confirmationStatus === "user_confirmed" && group.relationshipType === "coordinated_set");
    if (!group || !group.members.length || group.members.some(member => !context.items.some(item => item.id === member.garmentId))) {
      res.status(503).json({ error: "check_look_membership_unavailable", retry: true }); return;
    }
  }
  const guard = judgeGuard(request, context.items, context.groups, context.constraints);
  const missingFacts = missingFactsFromGuard(guard.missing);
  const text = exportJudgeText(request, context.items, context.groups, context.constraints, guard);
  try {
    const consume = process.env.NODE_ENV === "test" && _testOverrides.quota ? _testOverrides.quota : consumeJudgeQuota;
    if (!(await consume(userId, premium)).allowed) {
      res.status(429).json({ error: "check_look_daily_limit" }); return;
    }
  } catch {
    res.status(503).json({ error: "check_look_quota_unavailable" }); return;
  }
  try {
    const model = judgeModel();
    const keyFor = (modelVersion: string | null) => canonicalHash({
      text, itemIds: [...request.selection.itemIds].sort(), guard, model, modelVersion, promptHash: CHECK_LOOK_PROMPT_HASH,
    });
    const owned = cache.get(userId);
    const cached = owned?.get(keyFor(servedVersions.get(model) ?? null));
    let answer: JudgeAnswer;
    if (cached && cached.expires > Date.now()) answer = cached.answer;
    else {
      const judge = process.env.NODE_ENV === "test" && _testOverrides.judge ? _testOverrides.judge : callCheckLookJudge;
      answer = await judge(text, { model, missingFacts });
      if (answer.result.verdict === "Ask" &&
          (!answer.result.missing_fact || !missingFacts.includes(answer.result.missing_fact))) {
        throw new Error("Unsupported judge question");
      }
      servedVersions.set(model, answer.modelVersion);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      const entries = owned ?? new Map();
      for (const [key, entry] of entries) if (entry.expires <= Date.now()) entries.delete(key);
      if (entries.size >= 20) entries.delete(entries.keys().next().value!);
      entries.set(keyFor(answer.modelVersion), { answer, expires: Date.now() + CACHE_TTL_MS });
      cache.set(userId, entries);
    }
    if (!premium) {
      res.json({ verdict: answer.result.verdict === "Ask" ? "Almost" : answer.result.verdict }); return;
    }
    res.json({
      verdict: answer.result.verdict, reason: answer.result.reason,
      swapSuggestion: safeSwap(context, request, userId),
      ...(answer.result.verdict === "Ask" && answer.result.missing_fact
        ? { question: questions[answer.result.missing_fact], missing_fact: answer.result.missing_fact } : {}),
    });
  } catch {
    // The existing client-local evaluator remains the fallback, not a fabricated model verdict.
    res.json({ useLocalCheck: true, reason: "unavailable" });
  }
}
