import type { Request, Response } from "express";
import axios from "axios";

type ItemCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "jewelry";
type OccasionTag = "work" | "casual" | "date-casual" | "date-dressy" | "event";
type SeasonTag = "spring" | "summer" | "fall" | "winter" | "all-season";

// ─── Deterministic occasion rules ────────────────────────────────────────────
// These are kept as authoritative business rules; Gemini identifies the garment,
// then we apply our own occasion/season logic so the engine stays consistent.

const SUBTYPE_OCCASIONS: Record<string, OccasionTag[]> = {
  // Tops
  "t-shirt":        ["casual"],
  "long-sleeve":    ["casual", "date-casual"],
  "polo-shirt":     ["casual", "work"],
  "henley":         ["casual"],
  "rugby-shirt":    ["casual"],
  "tank-top":       ["casual"],
  "crop-top":       ["casual", "date-casual"],
  "shirt":          ["work", "casual", "date-casual", "date-dressy"],
  "blouse":         ["work", "date-dressy", "event"],
  "sweater":        ["casual", "date-casual"],
  "cardigan":       ["work", "casual"],
  "turtleneck":     ["work", "casual", "date-dressy"],
  // Outerwear
  "blazer":         ["work", "event", "date-dressy"],
  "coat":           ["work", "casual"],
  "peacoat":        ["work", "casual", "date-dressy"],
  "trench":         ["work", "casual"],
  "jacket":         ["casual", "date-casual"],
  "hoodie":         ["casual"],
  "bomber-jacket":  ["casual", "date-casual"],
  "leather-jacket": ["casual", "date-dressy"],
  "puffer":         ["casual"],
  "raincoat":       ["casual"],
  "vest":           ["casual", "work"],
  "denim-jacket":   ["casual", "date-casual"],
  // Bottoms
  "jeans":          ["casual", "date-casual"],
  "trousers":       ["work", "date-dressy", "event"],
  "chinos":         ["work", "casual", "date-casual"],
  "wide-leg":       ["casual", "date-casual"],
  "joggers":        ["casual"],
  "shorts":         ["casual"],
  "leggings":       ["casual"],
  "mini-skirt":     ["casual", "date-casual"],
  "midi-skirt":     ["work", "date-dressy", "event"],
  "maxi-skirt":     ["casual", "date-casual"],
  // Dresses
  "midi-dress":     ["date-dressy", "event"],
  "maxi-dress":     ["casual", "date-dressy", "event"],
  "mini-dress":     ["date-dressy", "event"],
  "wrap-dress":     ["date-dressy", "work"],
  "shirt-dress":    ["work", "casual", "date-casual"],
  "cocktail-dress": ["event", "date-dressy"],
  // Shoes
  "sneakers":       ["casual"],
  "heels":          ["date-dressy", "event", "work"],
  "flats":          ["work", "casual"],
  "boots":          ["casual", "date-casual"],
  "sandals":        ["casual", "date-casual"],
  "loafers":        ["work", "casual"],
  "mules":          ["casual", "date-casual", "date-dressy"],
  // Bags
  "tote":           ["work", "casual"],
  "crossbody":      ["casual", "date-casual"],
  "clutch":         ["date-dressy", "event"],
  "backpack":       ["casual"],
  "shoulder-bag":   ["work", "casual", "date-dressy"],
  "mini-bag":       ["date-dressy", "event"],
  // Jewelry
  "necklace":       ["date-dressy", "event", "casual"],
  "earrings":       ["date-dressy", "event", "work"],
  "bracelet":       ["casual", "date-casual"],
  "ring":           ["casual", "work"],
  "watch":          ["work", "casual"],
  "brooch":         ["work", "event"],
};

const DISPLAYNAME_OCCASION_OVERRIDES: Record<string, OccasionTag[]> = {
  "Dress shirt":       ["work", "date-dressy", "event"],
  "Oxford shirt":      ["work", "date-dressy"],
  "Flannel shirt":     ["casual"],
  "Chambray shirt":    ["casual"],
  "Button-down shirt": ["work", "casual", "date-casual"],
  "Polo shirt":        ["casual", "work"],
  "Long-sleeve t-shirt": ["casual", "date-casual"],
  "Hoodie":            ["casual"],
  "Sweatshirt":        ["casual"],
  "Pullover":          ["casual"],
  "Jumper":            ["casual", "date-casual"],
  "Bomber jacket":     ["casual", "date-casual"],
  "Leather jacket":    ["casual", "date-dressy"],
  "Denim jacket":      ["casual"],
  "Windbreaker":       ["casual"],
  "Parka":             ["casual"],
  "Suit jacket":       ["work", "event"],
  "Sport coat":        ["work", "date-dressy"],
  "Peacoat":           ["work", "casual", "date-dressy"],
  "Overcoat":          ["work", "casual"],
  "Trench coat":       ["work", "casual", "date-dressy"],
  "Pencil skirt":      ["work", "date-dressy"],
  "Mini skirt":        ["casual", "date-casual"],
  "Midi skirt":        ["work", "date-dressy", "event"],
  "Maxi skirt":        ["casual", "date-casual"],
  "A-line skirt":      ["casual", "date-casual"],
  "Sundress":          ["casual", "date-casual"],
  "Evening gown":      ["event"],
  "Cocktail dress":    ["event", "date-dressy"],
  "Shift dress":       ["work", "date-dressy"],
  "Wrap dress":        ["date-dressy", "work"],
  "Maxi dress":        ["casual", "date-dressy", "event"],
};

function inferOccasions(subType: string | null, displayName: string): OccasionTag[] {
  if (DISPLAYNAME_OCCASION_OVERRIDES[displayName]) {
    return DISPLAYNAME_OCCASION_OVERRIDES[displayName];
  }
  if (subType && SUBTYPE_OCCASIONS[subType]) {
    return SUBTYPE_OCCASIONS[subType];
  }
  return ["casual"];
}

// ─── Deterministic season rules ───────────────────────────────────────────────

const FABRIC_SEASONS: Partial<Record<string, SeasonTag[]>> = {
  linen:     ["spring", "summer"],
  silk:      ["spring", "summer"],
  chiffon:   ["spring", "summer"],
  wool:      ["fall", "winter"],
  cashmere:  ["fall", "winter"],
  tweed:     ["fall", "winter"],
  corduroy:  ["fall", "winter"],
  velvet:    ["fall", "winter"],
  leather:   ["fall", "winter"],
  suede:     ["fall", "winter"],
  knit:      ["fall", "winter"],
  satin:     ["fall", "winter"],
};

const SUBTYPE_SEASONS: Partial<Record<string, SeasonTag[]>> = {
  "tank-top":   ["spring", "summer"],
  "crop-top":   ["spring", "summer"],
  "shorts":     ["spring", "summer"],
  "sandals":    ["spring", "summer"],
  "mini-dress": ["spring", "summer"],
  "mini-skirt": ["spring", "summer"],
  "sweater":    ["fall", "winter"],
  "turtleneck": ["fall", "winter"],
  "cardigan":   ["fall", "winter"],
  "hoodie":     ["fall", "winter"],
  "puffer":     ["fall", "winter"],
  "peacoat":    ["fall", "winter"],
  "coat":       ["fall", "winter"],
  "boots":      ["fall", "winter"],
};

function inferSeasonTags(subType: string | null, fabric: string | null): SeasonTag[] {
  if (fabric) {
    const fromFabric = FABRIC_SEASONS[fabric];
    if (fromFabric) return fromFabric;
  }
  if (subType) {
    const fromSubType = SUBTYPE_SEASONS[subType];
    if (fromSubType) return fromSubType;
  }
  return ["all-season"];
}

// ─── Weight inference from fabric ────────────────────────────────────────────

function inferWeight(fabric: string | null | undefined): "light" | "mid" | "heavy" | undefined {
  if (!fabric) return undefined;
  if (["wool", "cashmere", "leather", "velvet", "tweed", "suede"].includes(fabric)) return "heavy";
  if (["silk", "satin", "linen", "chiffon"].includes(fabric)) return "light";
  return "mid";
}

// ─── Description builder ──────────────────────────────────────────────────────

function buildDescription(displayName: string, colorFamily: string | null): string {
  if (colorFamily) {
    const capitalizedColor = colorFamily.charAt(0).toUpperCase() + colorFamily.slice(1);
    const lower = displayName.toLowerCase();
    // Avoid doubling the colour if Gemini already started the displayName with it
    // e.g. "Green rugby shirt" + colorFamily "green" → don't produce "Green green rugby shirt"
    if (lower.startsWith(colorFamily.toLowerCase())) {
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    return `${capitalizedColor} ${lower}`;
  }
  return displayName;
}

// ─── Perceptual colour helpers (sRGB → HSL / CIE Lab) ────────────────────────
// Restored for computing dominantHsl / dominantLab from Gemini's dominant RGB.

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lin = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const X = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const Y = (lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.0721750);
  const Z = (lin[0] * 0.0193339 + lin[1] * 0.1191920 + lin[2] * 0.9503041) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// ─── Valid value sets (used for validation after Gemini response) ─────────────

const VALID_CATEGORIES = new Set<string>(["top", "bottom", "dress", "outerwear", "shoes", "bag", "jewelry"]);

const VALID_SUBTYPES_BY_CATEGORY: Record<string, string[]> = {
  top:       ["t-shirt","long-sleeve","polo-shirt","henley","rugby-shirt","tank-top","crop-top","shirt","blouse","sweater","cardigan","turtleneck"],
  bottom:    ["jeans","trousers","chinos","wide-leg","joggers","shorts","leggings","mini-skirt","midi-skirt","maxi-skirt"],
  dress:     ["midi-dress","maxi-dress","mini-dress","wrap-dress","shirt-dress","cocktail-dress"],
  outerwear: ["blazer","coat","peacoat","trench","jacket","hoodie","bomber-jacket","leather-jacket","puffer","raincoat","vest","denim-jacket"],
  shoes:     ["sneakers","heels","flats","boots","sandals","loafers","mules"],
  bag:       ["tote","crossbody","clutch","backpack","shoulder-bag","mini-bag"],
  jewelry:   ["necklace","earrings","bracelet","ring","watch","brooch"],
};

const VALID_COLOR_FAMILIES = new Set<string>([
  "black","white","grey","cream","beige","camel","brown",
  "red","burgundy","coral","orange","yellow","olive","green",
  "blue","navy","lavender","pink",
]);

const VALID_FABRICS = new Set<string>([
  "cotton","linen","silk","chiffon","satin","wool","cashmere",
  "knit","denim","leather","suede","velvet","corduroy","tweed","jersey","synthetic",
]);

const VALID_PATTERNS = new Set<string>(["solid","stripe","floral","check","print","color-block","geometric","animal"]);
const VALID_PATTERN_SCALES = new Set<string>(["small","medium","large"]);
const VALID_FITS = new Set<string>(["slim","regular","loose","oversized","tailored"]);
const VALID_NECKLINES = new Set<string>(["crew","v-neck","scoop","turtleneck","boat","square","halter","off-shoulder","collared"]);
const VALID_SLEEVE_LENGTHS = new Set<string>(["sleeveless","short","three-quarter","long"]);
const VALID_RISES = new Set<string>(["low","mid","high"]);
const VALID_WARMTH_BANDS = new Set<string>(["cold","cool","mild","warm","hot"]);

// ─── Gemini classifier ────────────────────────────────────────────────────────

const GEMINI_PROMPT = `You are a fashion classification AI for a wardrobe styling app. Your job is to identify the clothing item shown in the image and return a structured JSON response.

CONTENT GUARDRAILS — check these FIRST before classifying:
If the image is ANY of the following, do NOT classify — return a refusal:
- Blurry, too dark, or unreadable
- No clothing item visible (blank wall, furniture, food, scenery, etc.)
- A selfie or portrait where the person's face is the main subject
- Explicit, inappropriate, or sexually suggestive content
- Animals, pets, or non-fashion subjects

If a guardrail is triggered, return ONLY this JSON:
{ "refused": true, "reason": "A brief plain-English reason the user will see, e.g. 'This looks like a selfie rather than a clothing item. Please photograph the garment on its own or on a hanger.'" }

─── CLASSIFICATION (only if no guardrail triggered) ───────────────────────────

Return a JSON object with these fields:

category (required): Exactly one of: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "jewelry"

subType (required): Exactly one value from the list for the chosen category:
  top       → "t-shirt" | "long-sleeve" | "polo-shirt" | "henley" | "rugby-shirt" | "tank-top" | "crop-top" | "shirt" | "blouse" | "sweater" | "cardigan" | "turtleneck"
  bottom    → "jeans" | "trousers" | "chinos" | "wide-leg" | "joggers" | "shorts" | "leggings" | "mini-skirt" | "midi-skirt" | "maxi-skirt"
  dress     → "midi-dress" | "maxi-dress" | "mini-dress" | "wrap-dress" | "shirt-dress" | "cocktail-dress"
  outerwear → "blazer" | "coat" | "peacoat" | "trench" | "jacket" | "hoodie" | "bomber-jacket" | "leather-jacket" | "puffer" | "raincoat" | "vest" | "denim-jacket"
  shoes     → "sneakers" | "heels" | "flats" | "boots" | "sandals" | "loafers" | "mules"
  bag       → "tote" | "crossbody" | "clutch" | "backpack" | "shoulder-bag" | "mini-bag"
  jewelry   → "necklace" | "earrings" | "bracelet" | "ring" | "watch" | "brooch"

displayName (required): A concise human-readable name for the specific item, e.g. "Trench coat", "Floral midi dress", "Leather ankle boots". Use title case.

colorFamily (required): The primary/dominant colour of the garment. Exactly one of:
  "black" | "white" | "grey" | "cream" | "beige" | "camel" | "brown" | "red" | "burgundy" | "coral" | "orange" | "yellow" | "olive" | "green" | "blue" | "navy" | "lavender" | "pink"

accentColor (optional): If the garment has a clearly visible secondary colour, provide it using the same list. Omit if solid or no distinct accent.

fabric (optional): Best-guess material. One of:
  "cotton" | "linen" | "silk" | "chiffon" | "satin" | "wool" | "cashmere" | "knit" | "denim" | "leather" | "suede" | "velvet" | "corduroy" | "tweed" | "jersey" | "synthetic"
  Omit if genuinely unclear.

pattern (optional): One of: "solid" | "stripe" | "floral" | "check" | "print" | "color-block" | "geometric" | "animal"
  Default to "solid" if the item has no print. Omit only if truly indeterminate.

patternScale (optional): Only include when pattern is NOT solid. One of: "small" | "medium" | "large"

fit (optional): Overall silhouette/cut of the garment. One of: "slim" | "regular" | "loose" | "oversized" | "tailored"
  Include for tops, bottoms, dresses, outerwear. Omit for shoes, bags, jewelry.

neckline (optional): For tops and dresses only. One of: "crew" | "v-neck" | "scoop" | "turtleneck" | "boat" | "square" | "halter" | "off-shoulder" | "collared"
  Omit for all other categories.

sleeveLength (optional): For tops and dresses only. One of: "sleeveless" | "short" | "three-quarter" | "long"
  Omit for all other categories.

rise (optional): For bottoms only (jeans, trousers, skirts, etc.). One of: "low" | "mid" | "high"
  Omit for all other categories.

warmthBand (optional): For outerwear only — the warmth level of the layer. One of: "cold" | "cool" | "mild" | "warm" | "hot"
  (cold = heavy winter coat; hot = very lightweight summer layer/vest). Omit for all other categories.

dominantRgb (required): The representative sRGB colour of the garment's primary colour family as a 3-element array [R, G, B] where each value is an integer 0–255. This must correspond to the chosen colorFamily (e.g. a navy item → approximately [26, 42, 74]). Used for perceptual colour scoring.

modelConfidence (required): Your confidence in the classification as a decimal between 0.0 and 1.0.

Return ONLY valid JSON. No markdown, no code fences, no commentary.`;

interface GeminiResult {
  refused?: boolean;
  reason?: string;
  category?: string;
  subType?: string;
  displayName?: string;
  colorFamily?: string;
  accentColor?: string;
  fabric?: string;
  pattern?: string;
  patternScale?: string;
  fit?: string;
  neckline?: string;
  sleeveLength?: string;
  rise?: string;
  warmthBand?: string;
  dominantRgb?: [number, number, number];
  modelConfidence?: number;
}

export async function classifyGarment(req: Request, res: Response) {
  try {
    const { imageBase64, imageUrl, userId } = req.body;

    if ((!imageBase64 && !imageUrl) || (imageBase64 && imageUrl)) {
      return res.status(400).json({ error: "imageBase64 or imageUrl required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[classify] GEMINI_API_KEY is not set");
      return res.status(500).json({ error: "missing_gemini_api_key" });
    }

    // Build the Gemini request parts
    const textPart = { text: GEMINI_PROMPT };

    let imagePart: object;
    if (imageBase64) {
      imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: imageBase64,
        },
      };
    } else {
      imagePart = {
        fileData: {
          fileUri: imageUrl,
          mimeType: "image/jpeg",
        },
      };
    }

    const geminiReq = {
      contents: [
        {
          parts: [textPart, imagePart],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 512,
      },
    };

    // Try gemini-flash-lite-latest first (separate quota bucket), fall back to gemini-2.5-flash
    const MODELS = ['gemini-flash-lite-latest', 'gemini-2.5-flash'];
    let geminiRes: any;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          geminiReq,
          { timeout: 20000 }
        );
        break; // success — stop trying
      } catch (err: any) {
        lastErr = err;
        if (err?.response?.status === 429) {
          console.warn(`[classify] ${model} quota exhausted, trying next model`);
          continue;
        }
        throw err; // non-429 error — surface immediately
      }
    }
    if (!geminiRes) throw lastErr;

    const rawText: string =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: GeminiResult;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("[classify] Gemini returned non-JSON:", rawText.slice(0, 200));
      return res.status(500).json({ error: "classification_failed" });
    }

    // ── Content guardrail triggered ───────────────────────────────────────────
    if (parsed.refused) {
      console.log(`[classify] guardrail triggered: ${parsed.reason}`);
      return res.status(422).json({
        error: "content_guardrail",
        reason: parsed.reason ?? "This image could not be classified as a clothing item.",
      });
    }

    // ── Validate and sanitise the response ────────────────────────────────────
    const category = VALID_CATEGORIES.has(parsed.category ?? "")
      ? (parsed.category as ItemCategory)
      : null;

    const validSubTypes = category ? VALID_SUBTYPES_BY_CATEGORY[category] : [];
    const subType = validSubTypes.includes(parsed.subType ?? "")
      ? parsed.subType!
      : null;

    const colorFamily = VALID_COLOR_FAMILIES.has(parsed.colorFamily ?? "")
      ? parsed.colorFamily!
      : null;

    const accentColor =
      parsed.accentColor && VALID_COLOR_FAMILIES.has(parsed.accentColor)
        ? parsed.accentColor
        : undefined;

    const fabric =
      parsed.fabric && VALID_FABRICS.has(parsed.fabric)
        ? parsed.fabric
        : undefined;

    const pattern =
      parsed.pattern && VALID_PATTERNS.has(parsed.pattern)
        ? parsed.pattern
        : undefined;

    const patternScale =
      parsed.patternScale && VALID_PATTERN_SCALES.has(parsed.patternScale)
        ? parsed.patternScale
        : undefined;

    const fit =
      parsed.fit && VALID_FITS.has(parsed.fit)
        ? parsed.fit
        : undefined;

    const neckline =
      parsed.neckline && VALID_NECKLINES.has(parsed.neckline)
        ? parsed.neckline
        : undefined;

    const sleeveLength =
      parsed.sleeveLength && VALID_SLEEVE_LENGTHS.has(parsed.sleeveLength)
        ? parsed.sleeveLength
        : undefined;

    const rise =
      parsed.rise && VALID_RISES.has(parsed.rise)
        ? parsed.rise
        : undefined;

    const warmthBand =
      parsed.warmthBand && VALID_WARMTH_BANDS.has(parsed.warmthBand)
        ? parsed.warmthBand
        : undefined;

    const modelConfidence =
      typeof parsed.modelConfidence === "number"
        ? Math.min(1, Math.max(0, parsed.modelConfidence))
        : 0.7;

    const displayName = parsed.displayName ?? (category ? category.charAt(0).toUpperCase() + category.slice(1) : "Clothing item");
    const description = buildDescription(displayName, colorFamily);
    const occasionTags = inferOccasions(subType, displayName);
    const weight = inferWeight(fabric);
    const seasonTags = inferSeasonTags(subType, fabric ?? null);

    // ── Perceptual colour signals ─────────────────────────────────────────────
    // Derive HSL + Lab from the Gemini-supplied representative RGB so downstream
    // outfit scoring can reason about undertone, value spread, and saturation —
    // the same perceptual signals the old GCV pixel pipeline provided.
    let dominantHsl: { h: number; s: number; l: number } | undefined;
    let dominantLab: { L: number; a: number; b: number } | undefined;

    if (
      Array.isArray(parsed.dominantRgb) &&
      parsed.dominantRgb.length === 3 &&
      parsed.dominantRgb.every((v: unknown) => typeof v === "number" && v >= 0 && v <= 255)
    ) {
      const [r, g, b] = parsed.dominantRgb as [number, number, number];
      dominantHsl = rgbToHsl(r, g, b);
      dominantLab = rgbToLab(r, g, b);
    }

    if (userId) {
      console.log(`[classify] user=${userId} → ${subType ?? "unknown"} (${colorFamily}) conf=${modelConfidence.toFixed(2)}`);
    } else {
      console.log(`[classify] → ${subType ?? "unknown"} (${colorFamily}) conf=${modelConfidence.toFixed(2)}`);
    }

    return res.json({
      category,
      subType,
      colorFamily,
      accentColor,
      description,
      occasionTags,
      seasonTags,
      pattern,
      patternScale,
      fit,
      neckline,
      sleeveLength,
      rise,
      warmthBand,
      fabric,
      weight,
      dominantHsl,
      dominantLab,
      modelConfidence,
      source: "gemini",
    });
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error?.message ?? err.message;
    console.error("[classify] Gemini error", status, detail);
    // Forward rate-limit / quota errors so the client can surface a clear message
    if (status === 429) {
      return res.status(429).json({ error: "rate_limited", detail });
    }
    return res.status(500).json({ error: "classification_failed" });
  }
}
