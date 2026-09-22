import type { Request, Response } from "express";
import axios from "axios";
import {
  processGeminiResult,
  VALID_CATEGORIES,
  VALID_COLOR_FAMILIES,
  VALID_SUBTYPES_BY_CATEGORY,
  type ClassificationResult,
} from "./classify-garment";

export interface ProviderRegion { x: number; y: number; width: number; height: number }
export type GarmentRelationshipType = "coordinated_set" | "multi_item" | "layered";
export interface ProviderItem {
  detectionId: string;
  region: ProviderRegion;
  classification: Record<string, unknown>;
}
export interface ProviderRelationship {
  type: GarmentRelationshipType;
  confidence: number;
  memberDetectionIds: string[];
  sharedAttributes?: Record<string, string>;
}
export interface ProviderEnvelope {
  items: ProviderItem[];
  relationship?: ProviderRelationship;
}

export interface MultiItemResult {
  schemaVersion: "b1b2-v1";
  source: { ref: "source-0" };
  items: Array<{
    detectionId: string;
    source: { region: ProviderRegion };
    classification: ClassificationResult;
  }>;
  validation: { count: number; max: 6; order: "region-y-x-height-width-detection-id" };
  relationship: {
    type: GarmentRelationshipType;
    confidence: number;
    memberDetectionIds: string[];
    sharedAttributes?: Record<string, string>;
  };
}
export type MultiItemClassificationResult = MultiItemResult;

const RELATIONSHIPS = new Set<GarmentRelationshipType>(["coordinated_set", "multi_item", "layered"]);
const SHARED_ATTRIBUTES = new Set(["colorFamily", "pattern", "fabric", "occasion"]);
const MAX_ITEMS = 6 as const;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const own = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const MULTI_ITEM_PROMPT = `You are a fashion classification AI for a wardrobe styling app.

CONTENT GUARDRAILS — check these FIRST before classifying:
If the image is blurry, too dark, unreadable, has no clothing visible, is mainly a selfie or portrait, contains explicit/inappropriate/sexually suggestive content, or shows animals/pets/non-fashion subjects, return ONLY:
{"refused":true,"reason":"A brief plain-English reason"}

Otherwise detect 2 to ${MAX_ITEMS} distinct garment instances. Return ONLY valid JSON with this exact shape:
{"items":[{"detectionId":"provider-local unique string","region":{"x":0,"y":0,"width":0,"height":0},"classification":{...}}],"relationship":{"type":"multi_item","confidence":0.0,"memberDetectionIds":["provider-local unique string"],"sharedAttributes":{}}}

Rules:
- Region coordinates are normalized decimals from 0 to 1, with positive width/height and no overflow.
- relationship.type is exactly one of: "coordinated_set" | "multi_item" | "layered".
- relationship.memberDetectionIds contains every item detectionId exactly once.
- sharedAttributes is optional and may contain only colorFamily, pattern, fabric, or occasion when the value is genuinely shared by every item.
- Each classification uses the scalar wardrobe contract below.
- category is exactly one of: ${JSON.stringify([...VALID_CATEGORIES])}.
- subType must match its category exactly: ${JSON.stringify(VALID_SUBTYPES_BY_CATEGORY)}.
- displayName is a concise title-case garment name.
- colorFamily and optional accentColor are exactly one of: ${JSON.stringify([...VALID_COLOR_FAMILIES])}.
- Optional fabric: "cotton" | "linen" | "lace" | "silk" | "chiffon" | "satin" | "wool" | "cashmere" | "knit" | "denim" | "leather" | "suede" | "velvet" | "corduroy" | "tweed" | "jersey" | "synthetic".
- Optional pattern: "solid" | "stripe" | "floral" | "check" | "print" | "wax-print" | "color-block" | "geometric" | "animal".
- Optional patternScale: "small" | "medium" | "large".
- Optional fit: "slim" | "regular" | "loose" | "oversized" | "tailored".
- neckline for tops/dresses: "crew" | "v-neck" | "scoop" | "turtleneck" | "boat" | "square" | "halter" | "off-shoulder" | "collared".
- sleeveLength for tops/dresses: "sleeveless" | "short" | "three-quarter" | "long".
- Optional bottom rise: "low" | "mid" | "high".
- Optional outerwear warmthBand: "cold" | "cool" | "mild" | "warm" | "hot".
- dominantRgb is the representative [R,G,B], each integer 0-255, matching colorFamily.
- modelConfidence is a decimal from 0 to 1.
- Ankara/African wax print uses pattern "wax-print"; classify gele/head tie as jewelry/gele.
No markdown, code fences, commentary, URLs, tokens, image bytes, or provider metadata.`;

/**
 * The only boundary between provider output and the application.  In
 * particular, this function intentionally returns a newly-built allowlist.
 */
export function validateMultiItemResult(value: unknown): MultiItemResult | null {
  if (!own(value) || !Array.isArray(value.items) || value.items.length < 2 || value.items.length > MAX_ITEMS) return null;
  const rawItems = value.items as unknown[];
  const ids = new Set<string>();
  const regions = new Set<string>();
  const clean: Array<{ raw: ProviderItem; classification: ClassificationResult }> = [];

  for (const raw of rawItems) {
    if (!own(raw) || typeof raw.detectionId !== "string" || !raw.detectionId ||
        !own(raw.region) || !own(raw.classification) || ids.has(raw.detectionId)) return null;
    const r = raw.region as Record<string, unknown>;
    const x = r.x, y = r.y, width = r.width, height = r.height;
    if (![x, y, width, height].every(finite) ||
        (x as number) < 0 || (x as number) > 1 || (y as number) < 0 || (y as number) > 1 ||
        (width as number) <= 0 || (height as number) <= 0 ||
        (x as number) + (width as number) > 1 || (y as number) + (height as number) > 1) return null;
    const region = {
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
    };
    const regionKey = [region.x, region.y, region.width, region.height]
      .map(n => Math.round(n * 10000))
      .join(",");
    if (regions.has(regionKey)) return null;
    // processGeminiResult is deliberately called once per member, including
    // all guardrail and taxonomy checks owned by the single-item classifier.
    const result = processGeminiResult(raw.classification as never);
    if ("refused" in result || !result.category || !result.subType || !result.colorFamily ||
        !finite(result.modelConfidence) || result.modelConfidence < 0 || result.modelConfidence > 1) return null;
    ids.add(raw.detectionId); regions.add(regionKey);
    clean.push({
      raw: { detectionId: raw.detectionId, region, classification: raw.classification },
      classification: result,
    });
  }

  const sorted = clean.sort((a, b) => {
    const ar = a.raw.region, br = b.raw.region;
    for (const key of ["y", "x", "height", "width"] as const) {
      const d = Math.round(ar[key] * 10000) - Math.round(br[key] * 10000);
      if (d) return d;
    }
    return a.raw.detectionId.localeCompare(b.raw.detectionId);
  });
  const remap = new Map(sorted.map((item, i) => [item.raw.detectionId, `det-${String(i + 1).padStart(3, "0")}`]));
  const rel = value.relationship;
  if (!own(rel) || typeof rel.type !== "string" || !RELATIONSHIPS.has(rel.type as GarmentRelationshipType) || !finite(rel.confidence) ||
        rel.confidence < 0 || rel.confidence > 1 || !Array.isArray(rel.memberDetectionIds) ||
        rel.memberDetectionIds.length !== ids.size || new Set(rel.memberDetectionIds).size !== rel.memberDetectionIds.length ||
        rel.memberDetectionIds.some(id => typeof id !== "string" || !ids.has(id))) return null;
  const shared = rel.sharedAttributes;
  if (shared !== undefined && (!own(shared) || Object.keys(shared).some(k => !SHARED_ATTRIBUTES.has(k) || typeof shared[k] !== "string"))) return null;
  if (shared && Object.entries(shared).some(([key, value]) => {
    if (key === "occasion") return clean.some(item => !item.classification.occasionTags.includes(value as never));
    return clean.some(item => item.classification[key as "colorFamily" | "pattern" | "fabric"] !== value);
  })) return null;
  // Relationship input order is provider-controlled; public order is not.
  const memberIds = rel.memberDetectionIds as string[];
  const mapped = sorted.map(item => remap.get(item.raw.detectionId)!)
    .filter(id => memberIds.some((member: string) => remap.get(member) === id));
  const relationship = { type: rel.type as GarmentRelationshipType, confidence: rel.confidence,
    memberDetectionIds: mapped,
    ...(shared && Object.keys(shared).length ? { sharedAttributes: { ...shared } as Record<string, string> } : {}) };
  return {
    schemaVersion: "b1b2-v1", source: { ref: "source-0" },
    items: sorted.map((item, i) => ({ detectionId: `det-${String(i + 1).padStart(3, "0")}`,
      source: { region: { ...item.raw.region } }, classification: item.classification as ClassificationResult })),
    validation: { count: sorted.length, max: MAX_ITEMS, order: "region-y-x-height-width-detection-id" },
    relationship,
  };
}

export async function classifyMultiItem(req: Request, res: Response): Promise<void> {
  if (process.env.MULTI_ITEM_CLASSIFIER_ENABLED === "false") { res.status(404).json({ error: "feature_disabled" }); return; }
  const body = req.body;
  if (!own(body) || typeof body.imageBase64 !== "string" || !body.imageBase64 ||
      Object.keys(body).some(k => k !== "imageBase64")) {
    res.status(400).json({ error: "invalid_request" }); return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "classifier_unavailable" }); return; }
  try {
    const request = {
      contents: [{
        parts: [
          { text: MULTI_ITEM_PROMPT },
          { inlineData: { mimeType: "image/jpeg", data: body.imageBase64 } },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };
    let response;
    for (const model of ["gemini-flash-lite-latest", "gemini-2.5-flash"]) {
      try {
        response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          request, { timeout: 20000 },
        );
        break;
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 429) || model === "gemini-2.5-flash") throw error;
      }
    }
    if (!response) throw new Error("classifier_empty_response");
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: unknown;
    try {
      if (typeof text !== "string") throw new Error("not_json");
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "classifier_malformed_response" }); return;
    }
    const result = validateMultiItemResult(parsed);
    if (!result) { res.status(422).json({ error: "multi_item_invalid" }); return; }
    res.json(result);
  } catch (error) {
    let code = "classification_failed";
    let status = 500;
    const errorCode = own(error) && typeof error.code === "string" ? error.code : undefined;
    if (errorCode === "ECONNABORTED" || errorCode === "ETIMEDOUT") {
      code = "classifier_timeout"; status = 504;
    } else if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        code = "rate_limited"; status = 429;
      } else if (!error.response) {
        code = "classifier_network_failure"; status = 503;
      } else if ((error.response.status ?? 0) >= 500) {
        code = "classifier_upstream_failure"; status = 502;
      }
    } else if (error instanceof Error && error.message === "classifier_empty_response") {
      code = "classifier_malformed_response"; status = 502;
    }
    res.status(status).json({ error: code });
  }
}