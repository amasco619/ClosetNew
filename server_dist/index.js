var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/supabase.ts
var supabase_exports = {};
__export(supabase_exports, {
  areSupabaseProjectUrlsAligned: () => areSupabaseProjectUrlsAligned,
  isSelectedSupabaseProjectUrl: () => isSelectedSupabaseProjectUrl,
  supabaseAdmin: () => supabaseAdmin,
  supabaseAnon: () => supabaseAnon,
  supabaseAuth: () => supabaseAuth
});
import { createClient } from "@supabase/supabase-js";
function supabaseProjectOrigin(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
function areSupabaseProjectUrlsAligned(serverUrl, clientUrl) {
  const serverOrigin = supabaseProjectOrigin(serverUrl);
  const clientOrigin = supabaseProjectOrigin(clientUrl);
  return serverOrigin !== null && serverOrigin === clientOrigin;
}
function isSelectedSupabaseProjectUrl(url) {
  return supabaseProjectOrigin(url) === selectedProjectOrigin;
}
var supabaseUrl, clientSupabaseUrl, supabaseSecretKey, supabasePublishableKey, selectedProjectOrigin, supabaseAdmin, supabaseAuth, supabaseAnon;
var init_supabase = __esm({
  "server/supabase.ts"() {
    "use strict";
    supabaseUrl = process.env.SUPABASE_URL;
    clientSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    selectedProjectOrigin = "https://garppyocfgdamdgfyfbr.supabase.co";
    if (!supabaseUrl || !clientSupabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
      throw new Error(
        "[server/supabase] Missing SUPABASE_URL, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      );
    }
    if (process.env.NODE_ENV !== "test") {
      if (!areSupabaseProjectUrlsAligned(supabaseUrl, clientSupabaseUrl)) {
        throw new Error(
          "[server/supabase] SUPABASE_URL and EXPO_PUBLIC_SUPABASE_URL must be HTTPS project base URLs with no path, query, or fragment and target the same project"
        );
      }
      if (!isSelectedSupabaseProjectUrl(supabaseUrl)) {
        throw new Error(
          "[server/supabase] Configure Replit preview to use the selected Amodka Production Supabase project"
        );
      }
    }
    supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey
    );
    supabaseAuth = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    supabaseAnon = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
});

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

// server/classify-garment.ts
import axios from "axios";

// shared/error-codes.ts
function classifyError(error, dependency) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (name === "AbortError" || message.includes("timeout")) {
    return { category: "timeout", code: "REQUEST_TIMEOUT", retryable: true, message: "The request timed out.", dependency };
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("offline")) {
    return { category: "network", code: "NETWORK_ERROR", retryable: true, message: "A network connection is required.", dependency };
  }
  if (message.includes("401") || message.includes("unauthorized")) {
    return { category: "authentication", code: "AUTH_REQUIRED", retryable: false, message: "Please sign in again.", dependency };
  }
  if (message.includes("403") || message.includes("forbidden")) {
    return { category: "authorization", code: "FORBIDDEN", retryable: false, message: "You do not have permission for this action.", dependency };
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return { category: "rate_limit", code: "RATE_LIMITED", retryable: true, message: "Too many requests. Please try again later.", dependency };
  }
  if (message.includes("database") || message.includes("supabase") || message.includes("quota store")) {
    return { category: "database", code: "DATABASE_UNAVAILABLE", retryable: true, message: "This service is temporarily unavailable.", dependency };
  }
  if (message.includes("storage") || message.includes("upload")) {
    return { category: "storage", code: "STORAGE_ERROR", retryable: true, message: "The image could not be saved.", dependency };
  }
  if (message.includes("malformed") || message.includes("invalid response")) {
    return { category: "malformed_response", code: "MALFORMED_RESPONSE", retryable: false, message: "The service returned an unexpected response.", dependency };
  }
  if (dependency) {
    return { category: "external_dependency", code: "EXTERNAL_DEPENDENCY_ERROR", retryable: true, message: "A supporting service is temporarily unavailable.", dependency };
  }
  return { category: "internal", code: "INTERNAL_ERROR", retryable: false, message: "Something went wrong. Please try again.", dependency };
}

// shared/observability.ts
function safeReport(report) {
  return {
    category: report.category,
    code: report.code,
    operation: report.operation.slice(0, 80),
    ...report.dependency ? { dependency: report.dependency.slice(0, 40) } : {},
    ...report.route ? { route: report.route.slice(0, 120) } : {},
    ...typeof report.status === "number" ? { status: report.status } : {},
    ...report.providerCode && /^[a-z0-9_-]{1,64}$/i.test(report.providerCode) ? { providerCode: report.providerCode } : {},
    ...typeof report.retryable === "boolean" ? { retryable: report.retryable } : {},
    ...report.requestId ? { requestId: report.requestId.slice(0, 100) } : {},
    ...typeof report.durationMs === "number" ? { durationMs: Math.max(0, Math.round(report.durationMs)) } : {},
    ...report.errorType ? { errorType: report.errorType.slice(0, 40) } : {}
  };
}
function reportError(error, operation, context = {}) {
  const classified = classifyError(error, context.dependency);
  const report = safeReport({
    category: context.category ?? classified.category,
    code: context.code ?? classified.code,
    operation,
    dependency: context.dependency ?? classified.dependency,
    route: context.route,
    status: context.status,
    providerCode: context.providerCode,
    retryable: context.retryable ?? classified.retryable,
    requestId: context.requestId,
    durationMs: context.durationMs,
    errorType: error instanceof Error ? error.name : typeof error
  });
  try {
    console.error(JSON.stringify({ type: "error", ...report }));
  } catch {
  }
}

// server/garmentPng.ts
var PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
var MAX_PNG_DIMENSION = 4096;
var MAX_PNG_PIXELS = 16e6;
var STUDIO_RGB = [233, 228, 220];
var { PNG } = __require("pngjs");
function decodePng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("invalid_png");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION || width * height > MAX_PNG_PIXELS) {
    throw new Error("png_dimensions_out_of_range");
  }
  const raster = PNG.sync.read(buffer);
  if (raster.width !== width || raster.height !== height || raster.data.length !== width * height * 4) {
    throw new Error("invalid_png_pixels");
  }
  return raster;
}
function trimTransparentGarmentPng(buffer) {
  const image = decodePng(buffer);
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) return buffer;
  const margin = Math.max(4, Math.round(Math.max(right - left + 1, bottom - top + 1) * 0.035));
  const cropLeft = Math.max(0, left - margin);
  const cropTop = Math.max(0, top - margin);
  const cropRight = Math.min(image.width - 1, right + margin);
  const cropBottom = Math.min(image.height - 1, bottom + margin);
  const width = cropRight - cropLeft + 1;
  const height = cropBottom - cropTop + 1;
  if (width === image.width && height === image.height) return buffer;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceStart = ((cropTop + y) * image.width + cropLeft) * 4;
    image.data.copy(data, y * width * 4, sourceStart, sourceStart + width * 4);
  }
  return PNG.sync.write({ width, height, data });
}
function flattenGarmentPngOnStudio(buffer) {
  const image = decodePng(buffer);
  const data = Buffer.alloc(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    const inverseAlpha = 255 - alpha;
    data[i] = Math.round((image.data[i] * alpha + STUDIO_RGB[0] * inverseAlpha) / 255);
    data[i + 1] = Math.round((image.data[i + 1] * alpha + STUDIO_RGB[1] * inverseAlpha) / 255);
    data[i + 2] = Math.round((image.data[i + 2] * alpha + STUDIO_RGB[2] * inverseAlpha) / 255);
    data[i + 3] = 255;
  }
  return PNG.sync.write({ width: image.width, height: image.height, data });
}

// server/classify-garment.ts
var SUBTYPE_OCCASIONS = {
  // Tops
  "t-shirt": ["casual"],
  "long-sleeve": ["casual", "date-casual"],
  "polo-shirt": ["casual", "work"],
  "henley": ["casual"],
  "rugby-shirt": ["casual"],
  "tank-top": ["casual", "active"],
  "crop-top": ["casual", "date-casual", "active"],
  "shirt": ["work", "casual", "date-casual", "date-dressy"],
  "button-down": ["work", "casual", "date-casual"],
  "blouse": ["work", "date-dressy", "event"],
  "sweater": ["casual", "date-casual", "brunch"],
  "cardigan": ["work", "casual", "brunch"],
  "turtleneck": ["work", "casual", "date-dressy"],
  "knit-top": ["casual", "work", "date-casual"],
  "camisole": ["casual", "date-dressy", "night-out"],
  "hoodie": ["casual", "active"],
  "sweatshirt": ["casual", "active"],
  "sports-bra": ["active"],
  "sports-hoodie": ["active"],
  "windbreaker": ["casual", "active"],
  "rashguard": ["active", "resort"],
  "sequin-top": ["night-out", "event"],
  "linen-set": ["casual", "brunch", "resort"],
  // Outerwear
  "blazer": ["work", "event", "date-dressy", "interview"],
  "coat": ["work", "casual"],
  "peacoat": ["work", "casual", "date-dressy"],
  "trench": ["work", "casual", "travel"],
  "jacket": ["casual", "date-casual"],
  "bomber-jacket": ["casual", "date-casual"],
  "leather-jacket": ["casual", "date-dressy", "night-out"],
  "puffer": ["casual", "travel"],
  "raincoat": ["casual", "travel"],
  "vest": ["casual", "work"],
  "denim-jacket": ["casual", "date-casual", "brunch"],
  // Bottoms
  "jeans": ["casual", "date-casual", "brunch"],
  "trousers": ["work", "date-dressy", "event", "interview"],
  "chinos": ["work", "casual", "date-casual"],
  "wide-leg": ["casual", "date-casual", "work", "brunch"],
  "joggers": ["casual", "active"],
  "shorts": ["casual", "active"],
  "leggings": ["casual", "active"],
  "mini-skirt": ["casual", "date-casual", "night-out"],
  "midi-skirt": ["work", "date-dressy", "event", "brunch"],
  "maxi-skirt": ["casual", "date-casual", "resort"],
  "pencil-skirt": ["work", "date-dressy", "interview"],
  // Dresses
  "midi-dress": ["date-dressy", "event", "brunch"],
  "maxi-dress": ["casual", "date-dressy", "event", "resort"],
  "mini-dress": ["date-dressy", "event", "night-out"],
  "wrap-dress": ["date-dressy", "work", "brunch"],
  "shirt-dress": ["work", "casual", "date-casual", "brunch"],
  "cocktail-dress": ["event", "date-dressy", "night-out"],
  "knit-dress": ["casual", "date-casual", "work"],
  "bodycon-dress": ["night-out", "date-dressy"],
  "slip-dress": ["date-dressy", "night-out", "event"],
  "gown": ["wedding", "event", "traditional-event"],
  "sundress": ["casual", "brunch", "resort"],
  "resort-dress": ["resort", "casual"],
  "cover-up": ["resort"],
  "kaftan": ["resort", "casual", "traditional-event"],
  // Shoes
  "sneakers": ["casual", "active"],
  "training-shoes": ["active"],
  "heels": ["date-dressy", "event", "work", "night-out"],
  "pumps": ["work", "event", "date-dressy", "interview"],
  "stilettos": ["night-out", "event", "date-dressy"],
  "strappy-heels": ["night-out", "event", "date-dressy"],
  "block-heels": ["work", "casual", "date-casual"],
  "ankle-boots": ["casual", "date-casual", "date-dressy"],
  "flats": ["work", "casual", "brunch"],
  "boots": ["casual", "date-casual"],
  "sandals": ["casual", "date-casual", "brunch", "resort"],
  "espadrilles": ["casual", "brunch", "resort"],
  "loafers": ["work", "casual", "brunch"],
  "mules": ["casual", "date-casual", "date-dressy"],
  // Bags
  "tote": ["work", "casual", "brunch"],
  "crossbody": ["casual", "date-casual", "brunch", "travel"],
  "clutch": ["date-dressy", "event", "night-out"],
  "backpack": ["casual", "active", "travel"],
  "shoulder-bag": ["work", "casual", "date-dressy"],
  "mini-bag": ["date-dressy", "event", "night-out"],
  "gym-bag": ["active"],
  "wicker-bag": ["casual", "brunch", "resort"],
  "evening-bag": ["night-out", "event"],
  "beach-bag": ["resort"],
  // Jewelry
  "necklace": ["date-dressy", "event", "casual", "brunch"],
  "earrings": ["date-dressy", "event", "work"],
  "bracelet": ["casual", "date-casual"],
  "ring": ["casual", "work"],
  "watch": ["work", "casual"],
  "brooch": ["work", "event"],
  "statement-earrings": ["night-out", "event", "date-dressy"],
  "sunglasses": ["casual", "brunch", "resort"],
  "sunhat": ["resort", "casual"]
};
var DISPLAYNAME_OCCASION_OVERRIDES = {
  "Dress shirt": ["work", "date-dressy", "event", "interview"],
  "Oxford shirt": ["work", "date-dressy", "interview"],
  "Flannel shirt": ["casual"],
  "Chambray shirt": ["casual"],
  "Button-down shirt": ["work", "casual", "date-casual"],
  "Polo shirt": ["casual", "work"],
  "Long-sleeve t-shirt": ["casual", "date-casual"],
  "Hoodie": ["casual", "active"],
  "Sweatshirt": ["casual", "active"],
  "Pullover": ["casual"],
  "Jumper": ["casual", "date-casual"],
  "Bomber jacket": ["casual", "date-casual"],
  "Leather jacket": ["casual", "date-dressy", "night-out"],
  "Denim jacket": ["casual", "brunch"],
  "Windbreaker": ["casual", "active"],
  "Parka": ["casual", "travel"],
  "Suit jacket": ["work", "event", "interview"],
  "Sport coat": ["work", "date-dressy"],
  "Peacoat": ["work", "casual", "date-dressy"],
  "Overcoat": ["work", "casual"],
  "Trench coat": ["work", "casual", "travel"],
  "Pencil skirt": ["work", "date-dressy", "interview"],
  "Mini skirt": ["casual", "date-casual", "night-out"],
  "Midi skirt": ["work", "date-dressy", "event", "brunch"],
  "Maxi skirt": ["casual", "date-casual", "resort"],
  "A-line skirt": ["casual", "date-casual", "brunch"],
  "Sundress": ["casual", "brunch", "resort"],
  "Evening gown": ["event", "wedding", "traditional-event"],
  "Cocktail dress": ["event", "date-dressy", "night-out"],
  "Shift dress": ["work", "date-dressy"],
  "Wrap dress": ["date-dressy", "work", "brunch"],
  "Maxi dress": ["casual", "date-dressy", "event", "resort"],
  "Bodycon dress": ["night-out", "date-dressy"],
  "Slip dress": ["date-dressy", "night-out", "event"],
  "Sequin top": ["night-out", "event"],
  "Sports bra": ["active"],
  "Gym bag": ["active"],
  "Swimsuit": ["resort"],
  "Cover-up": ["resort"],
  "Kaftan": ["resort", "casual", "traditional-event"],
  "Resort dress": ["resort", "casual"],
  "Espadrilles": ["casual", "brunch", "resort"],
  "Training shoes": ["active"],
  "Running shoes": ["active"]
};
function inferOccasions(subType, displayName) {
  if (DISPLAYNAME_OCCASION_OVERRIDES[displayName]) {
    return DISPLAYNAME_OCCASION_OVERRIDES[displayName];
  }
  if (subType && SUBTYPE_OCCASIONS[subType]) {
    return SUBTYPE_OCCASIONS[subType];
  }
  return ["casual"];
}
var FABRIC_SEASONS = {
  linen: ["spring", "summer"],
  lace: ["spring", "summer"],
  silk: ["spring", "summer"],
  chiffon: ["spring", "summer"],
  wool: ["fall", "winter"],
  cashmere: ["fall", "winter"],
  tweed: ["fall", "winter"],
  corduroy: ["fall", "winter"],
  velvet: ["fall", "winter"],
  leather: ["fall", "winter"],
  suede: ["fall", "winter"],
  knit: ["fall", "winter"],
  satin: ["fall", "winter"]
};
var SUBTYPE_SEASONS = {
  "tank-top": ["spring", "summer"],
  "crop-top": ["spring", "summer"],
  "camisole": ["spring", "summer"],
  "rashguard": ["spring", "summer"],
  "sports-bra": ["spring", "summer"],
  "shorts": ["spring", "summer"],
  "sandals": ["spring", "summer"],
  "espadrilles": ["spring", "summer"],
  "mini-dress": ["spring", "summer"],
  "mini-skirt": ["spring", "summer"],
  "sundress": ["spring", "summer"],
  "resort-dress": ["spring", "summer"],
  "cover-up": ["spring", "summer"],
  "kaftan": ["spring", "summer"],
  "swimsuit": ["spring", "summer"],
  "sweater": ["fall", "winter"],
  "turtleneck": ["fall", "winter"],
  "cardigan": ["fall", "winter"],
  "knit-top": ["fall", "winter"],
  "knit-dress": ["fall", "winter"],
  "hoodie": ["fall", "winter"],
  "sweatshirt": ["fall", "winter"],
  "puffer": ["fall", "winter"],
  "peacoat": ["fall", "winter"],
  "coat": ["fall", "winter"],
  "boots": ["fall", "winter"],
  "ankle-boots": ["fall", "winter"]
};
function inferSeasonTags(subType, fabric) {
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
function inferWeight(fabric) {
  if (!fabric) return void 0;
  if (["wool", "cashmere", "leather", "velvet", "tweed", "suede"].includes(fabric)) return "heavy";
  if (["silk", "satin", "linen", "lace", "chiffon"].includes(fabric)) return "light";
  return "mid";
}
function buildDescription(displayName, colorFamily) {
  if (colorFamily) {
    const capitalizedColor = colorFamily.charAt(0).toUpperCase() + colorFamily.slice(1);
    const lower = displayName.toLowerCase();
    if (lower.startsWith(colorFamily.toLowerCase())) {
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    return `${capitalizedColor} ${lower}`;
  }
  return displayName;
}
function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}
function rgbToLab(r, g, b) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const X = (lin[0] * 0.4124564 + lin[1] * 0.3575761 + lin[2] * 0.1804375) / 0.95047;
  const Y = lin[0] * 0.2126729 + lin[1] * 0.7151522 + lin[2] * 0.072175;
  const Z = (lin[0] * 0.0193339 + lin[1] * 0.119192 + lin[2] * 0.9503041) / 1.08883;
  const f = (t) => t > 8856e-6 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs(hp % 2 - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
var DOMINANT_RGB_HUE_THRESHOLD_DEG = 40;
var DOMINANT_RGB_ACHROMATIC_SAT_THRESHOLD = 0.25;
var SERVER_FAMILY_CENTROID_HSL = {
  black: { h: 0, s: 0, l: 0.05 },
  white: { h: 0, s: 0, l: 0.97 },
  grey: { h: 0, s: 0, l: 0.55 },
  cream: { h: 42, s: 0.45, l: 0.92 },
  beige: { h: 36, s: 0.3, l: 0.78 },
  camel: { h: 33, s: 0.45, l: 0.55 },
  brown: { h: 25, s: 0.5, l: 0.3 },
  red: { h: 0, s: 0.85, l: 0.45 },
  burgundy: { h: 345, s: 0.65, l: 0.3 },
  coral: { h: 10, s: 0.8, l: 0.65 },
  orange: { h: 25, s: 0.85, l: 0.55 },
  yellow: { h: 55, s: 0.9, l: 0.6 },
  olive: { h: 75, s: 0.45, l: 0.35 },
  green: { h: 140, s: 0.5, l: 0.4 },
  blue: { h: 215, s: 0.7, l: 0.5 },
  navy: { h: 220, s: 0.55, l: 0.2 },
  lavender: { h: 265, s: 0.4, l: 0.75 },
  pink: { h: 340, s: 0.55, l: 0.75 }
};
var ACHROMATIC_FAMILIES = /* @__PURE__ */ new Set(["black", "white", "grey"]);
function serverHueDist(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}
function validateDominantHsl(rgbHsl, colorFamily) {
  if (!colorFamily) return { hsl: rgbHsl, corrected: false };
  const centroid = SERVER_FAMILY_CENTROID_HSL[colorFamily];
  if (!centroid) return { hsl: rgbHsl, corrected: false };
  if (ACHROMATIC_FAMILIES.has(colorFamily)) {
    if (rgbHsl.s > DOMINANT_RGB_ACHROMATIC_SAT_THRESHOLD) {
      return { hsl: centroid, corrected: true };
    }
    return { hsl: rgbHsl, corrected: false };
  }
  if (serverHueDist(rgbHsl.h, centroid.h) > DOMINANT_RGB_HUE_THRESHOLD_DEG) {
    return { hsl: centroid, corrected: true };
  }
  return { hsl: rgbHsl, corrected: false };
}
var VALID_CATEGORIES = /* @__PURE__ */ new Set(["top", "bottom", "dress", "outerwear", "shoes", "bag", "jewelry"]);
var VALID_SUBTYPES_BY_CATEGORY = {
  top: [
    "t-shirt",
    "long-sleeve",
    "polo-shirt",
    "henley",
    "rugby-shirt",
    "tank-top",
    "crop-top",
    "shirt",
    "button-down",
    "blouse",
    "sweater",
    "cardigan",
    "turtleneck",
    "knit-top",
    "camisole",
    "hoodie",
    "sweatshirt",
    "sports-bra",
    "sports-hoodie",
    "rashguard",
    "sequin-top",
    "linen-set",
    "buba"
  ],
  bottom: [
    "jeans",
    "trousers",
    "chinos",
    "wide-leg",
    "joggers",
    "shorts",
    "leggings",
    "mini-skirt",
    "midi-skirt",
    "maxi-skirt",
    "pencil-skirt",
    "iro",
    "wrapper"
  ],
  dress: [
    "midi-dress",
    "maxi-dress",
    "mini-dress",
    "wrap-dress",
    "shirt-dress",
    "cocktail-dress",
    "knit-dress",
    "bodycon-dress",
    "slip-dress",
    "gown",
    "sundress",
    "resort-dress",
    "cover-up",
    "kaftan",
    "aso-ebi",
    "iro-and-buba",
    "boubou"
  ],
  outerwear: [
    "blazer",
    "coat",
    "peacoat",
    "trench",
    "jacket",
    "hoodie",
    "bomber-jacket",
    "leather-jacket",
    "puffer",
    "raincoat",
    "vest",
    "denim-jacket",
    "windbreaker"
  ],
  shoes: [
    "sneakers",
    "training-shoes",
    "heels",
    "pumps",
    "stilettos",
    "strappy-heels",
    "block-heels",
    "flats",
    "boots",
    "ankle-boots",
    "sandals",
    "espadrilles",
    "loafers",
    "mules"
  ],
  bag: [
    "tote",
    "crossbody",
    "clutch",
    "backpack",
    "shoulder-bag",
    "mini-bag",
    "gym-bag",
    "wicker-bag",
    "evening-bag",
    "beach-bag"
  ],
  jewelry: [
    "necklace",
    "earrings",
    "bracelet",
    "ring",
    "watch",
    "brooch",
    "statement-earrings",
    "sunglasses",
    "sunhat",
    "gele",
    "headwrap",
    "head-scarf",
    "structured-headpiece",
    "stole"
  ]
};
var VALID_COLOR_FAMILIES = /* @__PURE__ */ new Set([
  "black",
  "white",
  "grey",
  "cream",
  "beige",
  "camel",
  "brown",
  "red",
  "burgundy",
  "coral",
  "orange",
  "yellow",
  "olive",
  "green",
  "blue",
  "navy",
  "lavender",
  "pink"
]);
var VALID_FABRICS = /* @__PURE__ */ new Set([
  "cotton",
  "linen",
  "lace",
  "silk",
  "chiffon",
  "satin",
  "wool",
  "cashmere",
  "knit",
  "denim",
  "leather",
  "suede",
  "velvet",
  "corduroy",
  "tweed",
  "jersey",
  "synthetic"
]);
var VALID_PATTERNS = /* @__PURE__ */ new Set(["solid", "stripe", "floral", "check", "print", "wax-print", "color-block", "geometric", "animal"]);
var VALID_PATTERN_SCALES = /* @__PURE__ */ new Set(["small", "medium", "large"]);
var VALID_FITS = /* @__PURE__ */ new Set(["slim", "regular", "loose", "oversized", "tailored"]);
var VALID_NECKLINES = /* @__PURE__ */ new Set(["crew", "v-neck", "scoop", "turtleneck", "boat", "square", "halter", "off-shoulder", "collared"]);
var VALID_SLEEVE_LENGTHS = /* @__PURE__ */ new Set(["sleeveless", "short", "three-quarter", "long"]);
var VALID_RISES = /* @__PURE__ */ new Set(["low", "mid", "high"]);
var VALID_WARMTH_BANDS = /* @__PURE__ */ new Set(["cold", "cool", "mild", "warm", "hot"]);
var SUBTYPE_ALIASES = {
  "head tie": "gele",
  "head-tie": "gele",
  "aso-oke gele": "gele",
  "head wrap": "headwrap",
  "head-wrap": "headwrap",
  "head scarf": "head-scarf",
  "headscarf": "head-scarf",
  "chiffon head scarf": "head-scarf",
  "structured headpiece": "structured-headpiece",
  "kente stole": "stole",
  "kente-pattern stole": "stole",
  "woven stole": "stole",
  "aso ebi": "aso-ebi",
  "iro & buba": "iro-and-buba",
  "iro and buba": "iro-and-buba",
  "iro/buba": "iro-and-buba",
  "buba blouse": "buba",
  "wrapper skirt": "wrapper",
  "iro/wrapper": "wrapper",
  "grand boubou": "boubou",
  "caftan": "kaftan"
};
var PATTERN_ALIASES = {
  "ankara": "wax-print",
  "wax print": "wax-print",
  "african wax print": "wax-print",
  "african wax-print": "wax-print"
};
var FABRIC_ALIASES = {
  "african lace": "lace",
  "french lace": "lace",
  "lace fabric": "lace"
};
function normalizeTaxonomyValue(value) {
  return value?.trim().toLowerCase() ?? "";
}
function normalizeGarmentSubType(value) {
  const normalized = normalizeTaxonomyValue(value);
  return SUBTYPE_ALIASES[normalized] ?? normalized;
}
function normalizeGarmentPattern(value) {
  const normalized = normalizeTaxonomyValue(value);
  return PATTERN_ALIASES[normalized] ?? normalized;
}
function normalizeGarmentFabric(value) {
  const normalized = normalizeTaxonomyValue(value);
  return FABRIC_ALIASES[normalized] ?? normalized;
}
var DEFAULT_REFUSAL_REASON = "This image could not be classified as a clothing item.";
function sanitizeRefusalReason(reason) {
  if (typeof reason !== "string") return DEFAULT_REFUSAL_REASON;
  const sanitized = reason.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  return sanitized || DEFAULT_REFUSAL_REASON;
}
function processGeminiResult(parsed) {
  if (parsed.refused) {
    return {
      refused: true,
      reason: sanitizeRefusalReason(parsed.reason)
    };
  }
  if (parsed.category === "jewelry" && normalizeGarmentSubType(parsed.subType) === "stole" && parsed.wearPosition !== "shoulder-neck") {
    return { refused: true, reason: "This does not clearly show a shoulder or neck stole. Please photograph the wearable item." };
  }
  const category = VALID_CATEGORIES.has(parsed.category ?? "") ? parsed.category : null;
  const normalizedSubType = normalizeGarmentSubType(parsed.subType);
  const validSubTypes = category ? VALID_SUBTYPES_BY_CATEGORY[category] : [];
  const subType = validSubTypes.includes(normalizedSubType) ? normalizedSubType : null;
  const colorFamily = VALID_COLOR_FAMILIES.has(parsed.colorFamily ?? "") ? parsed.colorFamily : null;
  const accentColor = parsed.accentColor && VALID_COLOR_FAMILIES.has(parsed.accentColor) ? parsed.accentColor : void 0;
  const normalizedFabric = normalizeGarmentFabric(parsed.fabric);
  const fabric = VALID_FABRICS.has(normalizedFabric) ? normalizedFabric : void 0;
  const normalizedPattern = normalizeGarmentPattern(parsed.pattern);
  const pattern = VALID_PATTERNS.has(normalizedPattern) ? normalizedPattern : void 0;
  const patternScale = parsed.patternScale && VALID_PATTERN_SCALES.has(parsed.patternScale) ? parsed.patternScale : void 0;
  const fit = parsed.fit && VALID_FITS.has(parsed.fit) ? parsed.fit : void 0;
  const neckline = parsed.neckline && VALID_NECKLINES.has(parsed.neckline) ? parsed.neckline : void 0;
  const sleeveLength = parsed.sleeveLength && VALID_SLEEVE_LENGTHS.has(parsed.sleeveLength) ? parsed.sleeveLength : void 0;
  const rise = parsed.rise && VALID_RISES.has(parsed.rise) ? parsed.rise : void 0;
  const warmthBand = parsed.warmthBand && VALID_WARMTH_BANDS.has(parsed.warmthBand) ? parsed.warmthBand : void 0;
  const modelConfidence = typeof parsed.modelConfidence === "number" ? Math.min(1, Math.max(0, parsed.modelConfidence)) : 0.7;
  const displayName = parsed.displayName ?? (category ? category.charAt(0).toUpperCase() + category.slice(1) : "Clothing item");
  const description = buildDescription(displayName, colorFamily);
  const occasionTags = inferOccasions(subType, displayName);
  const weight = inferWeight(fabric);
  const seasonTags = inferSeasonTags(subType, fabric ?? null);
  let dominantHsl;
  let dominantLab;
  if (Array.isArray(parsed.dominantRgb) && parsed.dominantRgb.length === 3 && parsed.dominantRgb.every((v) => typeof v === "number" && v >= 0 && v <= 255)) {
    const [r, g, b] = parsed.dominantRgb;
    const rawHsl = rgbToHsl(r, g, b);
    const { hsl: validatedHsl, corrected } = validateDominantHsl(rawHsl, colorFamily);
    if (corrected) {
      const [cr, cg, cb] = hslToRgb(validatedHsl.h, validatedHsl.s, validatedHsl.l);
      dominantHsl = validatedHsl;
      dominantLab = rgbToLab(cr, cg, cb);
    } else {
      dominantHsl = rawHsl;
      dominantLab = rgbToLab(r, g, b);
    }
  }
  return {
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
    source: "gemini"
  };
}
var GEMINI_PROMPT = `You are a fashion classification AI for a wardrobe styling app. Your job is to identify the clothing item shown in the image and return a structured JSON response.

CONTENT GUARDRAILS \u2014 check these FIRST before classifying:
If the image is ANY of the following, do NOT classify \u2014 return a refusal:
- Blurry, too dark, or unreadable
- No clothing item visible (blank wall, furniture, food, scenery, etc.)
- A selfie or portrait where the person's face is the main subject
- Explicit, inappropriate, or sexually suggestive content
- Animals, pets, or non-fashion subjects
- Several unrelated garments with no single item clearly dominating (a pile of clothes or a full outfit flat-lay).

A matching pair (shoes, sandals, boots, earrings, gloves, socks) and a coordinated set worn as a unit (e.g. a two-piece set) count as ONE item and must be classified, not refused for containing multiple pieces. For multiple garments, refuse only when they are unrelated and no single item clearly dominates. When in doubt about multiple garments, classify the dominant item instead of refusing. Use the existing supported schema; do not invent a new set subtype.

If a guardrail is triggered, return ONLY this JSON:
{ "refused": true, "reason": "A brief plain-English reason the user will see, e.g. 'This looks like a selfie rather than a clothing item. Please photograph the garment on its own or on a hanger.'" }

\u2500\u2500\u2500 CLASSIFICATION (only if no guardrail triggered) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Return a JSON object with these fields:

category (required): Exactly one of: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "jewelry"

subType (required): Exactly one value from the list for the chosen category:
  top       \u2192 "t-shirt" | "long-sleeve" | "polo-shirt" | "henley" | "rugby-shirt" | "tank-top" | "crop-top" | "shirt" | "button-down" | "blouse" | "sweater" | "cardigan" | "turtleneck" | "knit-top" | "camisole" | "hoodie" | "sweatshirt" | "sports-bra" | "sports-hoodie" | "windbreaker" | "rashguard" | "sequin-top" | "linen-set" | "buba"
  bottom    \u2192 "jeans" | "trousers" | "chinos" | "wide-leg" | "joggers" | "shorts" | "leggings" | "mini-skirt" | "midi-skirt" | "maxi-skirt" | "pencil-skirt" | "iro" | "wrapper"
  dress     \u2192 "midi-dress" | "maxi-dress" | "mini-dress" | "wrap-dress" | "shirt-dress" | "cocktail-dress" | "knit-dress" | "bodycon-dress" | "slip-dress" | "gown" | "sundress" | "resort-dress" | "cover-up" | "kaftan" | "aso-ebi" | "iro-and-buba" | "boubou"
  outerwear \u2192 "blazer" | "coat" | "peacoat" | "trench" | "jacket" | "hoodie" | "bomber-jacket" | "leather-jacket" | "puffer" | "raincoat" | "vest" | "denim-jacket"
  shoes     \u2192 "sneakers" | "training-shoes" | "heels" | "pumps" | "stilettos" | "strappy-heels" | "block-heels" | "flats" | "boots" | "ankle-boots" | "sandals" | "espadrilles" | "loafers" | "mules"
  bag       \u2192 "tote" | "crossbody" | "clutch" | "backpack" | "shoulder-bag" | "mini-bag" | "gym-bag" | "wicker-bag" | "evening-bag" | "beach-bag"
  jewelry   \u2192 "necklace" | "earrings" | "bracelet" | "ring" | "watch" | "brooch" | "statement-earrings" | "sunglasses" | "sunhat" | "gele" | "headwrap" | "head-scarf" | "structured-headpiece" | "stole"

African/Nigerian garment guidance:
- Do not refuse a clear fashion head covering just because it is culturally specific or is not a conventional Western garment.
- Classify a gele/head tie, including an Ankara or aso-oke gele, as category "jewelry", subType "gele". For Ankara, describe the textile with pattern "wax-print"; only name a fabric when it is supported by the available fabric values.
- Use "headwrap" for a wrapped head covering that is not specifically a gele; use "head-scarf" for a soft scarf worn on the head (fabric "chiffon" only when applicable); use "structured-headpiece" for sculptural or structured ceremonial headwear.
- Use "buba" for an individual buba blouse, "iro" or "wrapper" for an individual wrapped lower garment, and "iro-and-buba" when the coordinated outfit is shown as one wardrobe item.
- Use "aso-ebi" for a complete coordinated aso-ebi outfit, and "boubou" for a boubou/grand boubou.
- Ankara/African wax print describes pattern, not silhouette: keep the garment's canonical subType and use pattern "wax-print".
- For a clearly identifiable shoulder/neck stole (including a Kente or Kente-pattern stole), use category "jewelry" and subType "stole" with wearPosition "shoulder-neck". A garment on a hanger can qualify if its intended shoulder/neck use is clear. Do not use stole for bare Kente cloth, loose/decorative textile, a waist sash, a neck scarf, a lower-body wrapper or a gele/headwrap. Refuse loose/non-wearable textiles rather than treating them as jewelry.
- "Kente" describes a textile tradition or visual motif, not the garment's cut or proof of authentic hand-weaving. Name a Kente or Kente-pattern stole only when visually justified; do not infer cotton or silk from its appearance, and never convert a Kente motif to pattern "wax-print". If the material or pattern cannot be identified independently, omit that field.

displayName (required): A concise human-readable name for the specific item, e.g. "Trench coat", "Floral midi dress", "Leather ankle boots". Use title case.

wearPosition (required only for jewelry/stole, omit otherwise): Exactly "shoulder-neck" when the image clearly identifies an accessory intended to be worn over the shoulders or around the neck as a stole. If this cannot be established, return a refusal, not a stole classification.

colorFamily (required): The primary/dominant colour of the garment. Exactly one of:
  "black" | "white" | "grey" | "cream" | "beige" | "camel" | "brown" | "red" | "burgundy" | "coral" | "orange" | "yellow" | "olive" | "green" | "blue" | "navy" | "lavender" | "pink"

accentColor (optional): If the garment has a clearly visible secondary colour, provide it using the same list. Omit if solid or no distinct accent.

fabric (optional): Best-guess material. One of:
  "cotton" | "linen" | "lace" | "silk" | "chiffon" | "satin" | "wool" | "cashmere" | "knit" | "denim" | "leather" | "suede" | "velvet" | "corduroy" | "tweed" | "jersey" | "synthetic"
  Omit if genuinely unclear.

pattern (optional): One of: "solid" | "stripe" | "floral" | "check" | "print" | "wax-print" | "color-block" | "geometric" | "animal"
  Use "wax-print" for Ankara/African wax-resist textiles with bold repeating motifs.
  Default to "solid" if the item has no print. Omit only if truly indeterminate.

patternScale (optional): Only include when pattern is NOT solid. One of: "small" | "medium" | "large"

fit (optional): Overall silhouette/cut of the garment. One of: "slim" | "regular" | "loose" | "oversized" | "tailored"
  Include for tops, bottoms, dresses, outerwear. Omit for shoes, bags, jewelry.

neckline (required for top and dress, omit for all others): One of: "crew" | "v-neck" | "scoop" | "turtleneck" | "boat" | "square" | "halter" | "off-shoulder" | "collared"

sleeveLength (required for top and dress, omit for all others): One of: "sleeveless" | "short" | "three-quarter" | "long"
  This field is critical \u2014 it powers the user's no-sleeveless preference. Always include it for tops and dresses.

rise (optional): For bottoms only (jeans, trousers, skirts, etc.). One of: "low" | "mid" | "high"
  Omit for all other categories.

warmthBand (optional): For outerwear only \u2014 the warmth level of the layer. One of: "cold" | "cool" | "mild" | "warm" | "hot"
  (cold = heavy winter coat; hot = very lightweight summer layer/vest). Omit for all other categories.

dominantRgb (required): The representative sRGB colour of the garment's primary colour family as a 3-element array [R, G, B] where each value is an integer 0\u2013255. This must correspond to the chosen colorFamily (e.g. a navy item \u2192 approximately [26, 42, 74]). Used for perceptual colour scoring.

modelConfidence (required): Your confidence in the classification as a decimal between 0.0 and 1.0.

Return ONLY valid JSON. No markdown, no code fences, no commentary.`;
var CLASSIFIER_MODELS = [process.env.GEMINI_PRIMARY_MODEL?.trim() || "gemini-flash-lite-latest", "gemini-2.5-flash"];
function isClassificationResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const parsed = value;
  if (parsed.refused === true) return true;
  if (typeof parsed.category !== "string" || typeof parsed.subType !== "string" || typeof parsed.colorFamily !== "string" || !VALID_CATEGORIES.has(parsed.category) || !VALID_COLOR_FAMILIES.has(parsed.colorFamily)) {
    return false;
  }
  const normalizedSubType = normalizeGarmentSubType(parsed.subType);
  return VALID_SUBTYPES_BY_CATEGORY[parsed.category]?.includes(normalizedSubType) ?? false;
}
function malformedClassifierResponse(res) {
  reportError(new Error("Malformed classifier response"), "classifier_parse", {
    category: "malformed_response",
    code: "MALFORMED_RESPONSE",
    dependency: "gemini",
    status: 502,
    retryable: false,
    route: "/api/classify-garment"
  });
  return res.status(502).json({
    error: "classifier_malformed_response",
    code: "MALFORMED_RESPONSE"
  });
}
async function classifyGarment(req, res) {
  const { createHash: createHash2, randomUUID: randomUUID2 } = await import("node:crypto");
  const classificationId = randomUUID2();
  const startedAt = Date.now();
  const promptSha256 = createHash2("sha256").update(GEMINI_PROMPT).digest("hex");
  let stage = "input";
  let modelRequested = null;
  let modelVersion = null;
  let attempt = 0;
  let providerStatus = null;
  let imageSha256 = null;
  let imageBytes = null;
  let mimeType = null;
  let providerImageBase64;
  let providerImageMimeType = "image/jpeg";
  res.setHeader("x-classification-id", classificationId);
  const trace = (code, httpStatus) => {
    console.info(JSON.stringify({
      type: "classification",
      classificationId,
      stage,
      code,
      httpStatus,
      imageSha256,
      imageBytes,
      mimeType,
      promptSha256,
      modelRequested,
      modelVersion,
      attempt,
      providerStatus,
      elapsedMs: Date.now() - startedAt
    }));
  };
  try {
    const { imageBase64, imageUrl, userId, imageMimeType } = req.body;
    if (!imageBase64 && !imageUrl || imageBase64 && imageUrl) {
      trace("INVALID_IMAGE_INPUT", 400);
      return res.status(400).json({ error: "imageBase64 or imageUrl required" });
    }
    if (imageMimeType !== void 0 && !["image/jpeg", "image/png"].includes(imageMimeType)) {
      trace("INVALID_MIME", 400);
      return res.status(400).json({ error: "unsupported_image_mime_type" });
    }
    stage = "preprocess";
    if (imageBase64) {
      providerImageMimeType = imageMimeType ?? "image/jpeg";
      const inputBytes = Buffer.from(imageBase64, "base64");
      let providerBytes = Buffer.from(inputBytes);
      if (providerImageMimeType === "image/png") {
        try {
          providerBytes = Buffer.from(flattenGarmentPngOnStudio(inputBytes));
        } catch {
          trace("INVALID_PNG", 400);
          return res.status(400).json({ error: "invalid_png_image" });
        }
      }
      providerImageBase64 = providerBytes.toString("base64");
      imageBytes = providerBytes.length;
      imageSha256 = createHash2("sha256").update(providerBytes).digest("hex");
      mimeType = providerImageMimeType;
    }
    if (!imageBase64) mimeType = "image/jpeg";
    stage = "configuration";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      trace("MISSING_API_KEY", 500);
      return res.status(500).json({ error: "missing_gemini_api_key" });
    }
    const textPart = { text: GEMINI_PROMPT };
    let imagePart;
    if (imageBase64) {
      imagePart = {
        inlineData: {
          mimeType: providerImageMimeType,
          data: providerImageBase64
        }
      };
    } else {
      imagePart = {
        fileData: {
          fileUri: imageUrl,
          mimeType: "image/jpeg"
        }
      };
    }
    const geminiReq = {
      contents: [
        {
          parts: [textPart, imagePart]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 512
      }
    };
    let geminiRes;
    let lastErr;
    for (const model of CLASSIFIER_MODELS) {
      stage = "provider_request";
      modelRequested = model;
      attempt++;
      providerStatus = null;
      const attemptStartedAt = Date.now();
      try {
        geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          geminiReq,
          { timeout: 2e4 }
        );
        stage = "provider_response";
        providerStatus = geminiRes.status ?? 200;
        const version = geminiRes.data?.modelVersion;
        modelVersion = typeof version === "string" && /^gemini-[a-z0-9.-]{1,80}$/.test(version) ? version : null;
        console.info(JSON.stringify({
          type: "classification_attempt",
          classificationId,
          modelRequested,
          modelVersion,
          attempt,
          providerStatus,
          elapsedMs: Date.now() - attemptStartedAt,
          code: "PROVIDER_OK"
        }));
        break;
      } catch (err) {
        lastErr = err;
        providerStatus = Number.isInteger(err?.response?.status) ? err.response.status : null;
        console.info(JSON.stringify({
          type: "classification_attempt",
          classificationId,
          modelRequested,
          attempt,
          providerStatus,
          elapsedMs: Date.now() - attemptStartedAt,
          code: providerStatus === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR"
        }));
        if (err?.response?.status === 429) continue;
        throw err;
      }
    }
    if (!geminiRes) throw lastErr;
    stage = "parse";
    const rawText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed;
    try {
      const responseValue = JSON.parse(rawText);
      stage = "validate";
      if (!isClassificationResponse(responseValue)) {
        trace("INVALID_SCHEMA", 502);
        return malformedClassifierResponse(res);
      }
      parsed = responseValue;
    } catch {
      trace(rawText ? "INVALID_JSON" : "MISSING_JSON", 502);
      return malformedClassifierResponse(res);
    }
    stage = "process";
    const result = processGeminiResult(parsed);
    if ("refused" in result && result.refused) {
      trace("CONTENT_GUARDRAIL", 422);
      return res.status(422).json({
        error: "content_guardrail",
        reason: result.reason
      });
    }
    trace("OK", 200);
    return res.json(result);
  } catch (err) {
    const status = err?.response?.status;
    const isTimeout = err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT" || err?.name === "TimeoutError" || typeof err?.message === "string" && err.message.toLowerCase().includes("timeout");
    const hasResponse = Boolean(err?.response);
    const errorMessage = typeof err?.message === "string" ? err.message.toLowerCase() : "";
    const isNetwork = !hasResponse && (axios.isAxiosError(err) || ["ENOTFOUND", "ECONNRESET", "EHOSTUNREACH", "ECONNREFUSED"].includes(err?.code) || errorMessage.includes("network") || errorMessage.includes("offline"));
    if (isTimeout) {
      trace("REQUEST_TIMEOUT", 504);
      reportError(new Error("Classifier request timed out"), "classifier_request", {
        category: "timeout",
        code: "REQUEST_TIMEOUT",
        dependency: "gemini",
        status: 504,
        retryable: true,
        route: "/api/classify-garment"
      });
      return res.status(504).json({ error: "classifier_timeout" });
    }
    if (status === 429) {
      trace("RATE_LIMITED", 429);
      reportError(new Error("Classifier upstream rate limit"), "classifier_request", {
        category: "rate_limit",
        code: "RATE_LIMITED",
        dependency: "gemini",
        status,
        retryable: true,
        route: "/api/classify-garment"
      });
      return res.status(429).json({ error: "rate_limited" });
    }
    if (status >= 500 && status <= 599) {
      trace("EXTERNAL_DEPENDENCY_ERROR", 502);
      reportError(new Error("Classifier upstream failure"), "classifier_request", {
        category: "external_dependency",
        code: "EXTERNAL_DEPENDENCY_ERROR",
        dependency: "gemini",
        status,
        retryable: true,
        route: "/api/classify-garment"
      });
      return res.status(502).json({ error: "classifier_upstream_failure" });
    }
    if (status >= 400 && status <= 499) {
      trace("PROVIDER_HTTP_ERROR", 502);
      return res.status(502).json({ error: "classifier_upstream_failure", code: "PROVIDER_HTTP_ERROR" });
    }
    if (isNetwork) {
      trace("NETWORK_ERROR", 503);
      reportError(new Error("Classifier network failure"), "classifier_request", {
        category: "network",
        code: "NETWORK_ERROR",
        dependency: "gemini",
        retryable: true,
        route: "/api/classify-garment"
      });
      return res.status(503).json({ error: "classifier_network_failure" });
    }
    trace("INTERNAL_ERROR", 500);
    reportError(new Error("Unexpected classifier failure"), "classifier_request", {
      category: "internal",
      code: "INTERNAL_ERROR",
      dependency: "gemini",
      status,
      retryable: false,
      route: "/api/classify-garment"
    });
    return res.status(500).json({
      error: "classification_failed",
      code: "INTERNAL_ERROR"
    });
  }
}

// server/classify-multi-item.ts
import axios2 from "axios";
var RELATIONSHIPS = /* @__PURE__ */ new Set(["coordinated_set", "multi_item", "layered"]);
var SHARED_ATTRIBUTES = /* @__PURE__ */ new Set(["colorFamily", "pattern", "fabric", "occasion"]);
var MAX_ITEMS = 6;
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var own = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var MULTI_ITEM_PROMPT = `You are a fashion classification AI for a wardrobe styling app.

CONTENT GUARDRAILS \u2014 check these FIRST before classifying:
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
- Classify a clearly identifiable shoulder/neck stole as jewelry/stole and set wearPosition "shoulder-neck" on that member; refuse a loose/decorative Kente textile instead of making it a member. Never map Kente to wax-print or infer cotton/silk solely from its motif. Keep waist sashes, neck scarves, lower-body wrappers and gele/headwrap distinct.
No markdown, code fences, commentary, URLs, tokens, image bytes, or provider metadata.`;
function validateMultiItemResult(value) {
  if (!own(value) || !Array.isArray(value.items) || value.items.length < 2 || value.items.length > MAX_ITEMS) return null;
  const rawItems = value.items;
  const ids = /* @__PURE__ */ new Set();
  const regions = /* @__PURE__ */ new Set();
  const clean = [];
  for (const raw of rawItems) {
    if (!own(raw) || typeof raw.detectionId !== "string" || !raw.detectionId || !own(raw.region) || !own(raw.classification) || ids.has(raw.detectionId)) return null;
    const r = raw.region;
    const x = r.x, y = r.y, width = r.width, height = r.height;
    if (![x, y, width, height].every(finite) || x < 0 || x > 1 || y < 0 || y > 1 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
    const region = {
      x,
      y,
      width,
      height
    };
    const regionKey = [region.x, region.y, region.width, region.height].map((n) => Math.round(n * 1e4)).join(",");
    if (regions.has(regionKey)) return null;
    const result = processGeminiResult(raw.classification);
    if ("refused" in result || !result.category || !result.subType || !result.colorFamily || !finite(result.modelConfidence) || result.modelConfidence < 0 || result.modelConfidence > 1) return null;
    ids.add(raw.detectionId);
    regions.add(regionKey);
    clean.push({
      raw: { detectionId: raw.detectionId, region, classification: raw.classification },
      classification: result
    });
  }
  const sorted = clean.sort((a, b) => {
    const ar = a.raw.region, br = b.raw.region;
    for (const key of ["y", "x", "height", "width"]) {
      const d = Math.round(ar[key] * 1e4) - Math.round(br[key] * 1e4);
      if (d) return d;
    }
    return a.raw.detectionId.localeCompare(b.raw.detectionId);
  });
  const remap = new Map(sorted.map((item, i) => [item.raw.detectionId, `det-${String(i + 1).padStart(3, "0")}`]));
  const rel = value.relationship;
  if (!own(rel) || typeof rel.type !== "string" || !RELATIONSHIPS.has(rel.type) || !finite(rel.confidence) || rel.confidence < 0 || rel.confidence > 1 || !Array.isArray(rel.memberDetectionIds) || rel.memberDetectionIds.length !== ids.size || new Set(rel.memberDetectionIds).size !== rel.memberDetectionIds.length || rel.memberDetectionIds.some((id) => typeof id !== "string" || !ids.has(id))) return null;
  const shared = rel.sharedAttributes;
  if (shared !== void 0 && (!own(shared) || Object.keys(shared).some((k) => !SHARED_ATTRIBUTES.has(k) || typeof shared[k] !== "string"))) return null;
  if (shared && Object.entries(shared).some(([key, value2]) => {
    if (key === "occasion") return clean.some((item) => !item.classification.occasionTags.includes(value2));
    return clean.some((item) => item.classification[key] !== value2);
  })) return null;
  const memberIds = rel.memberDetectionIds;
  const mapped = sorted.map((item) => remap.get(item.raw.detectionId)).filter((id) => memberIds.some((member) => remap.get(member) === id));
  const relationship = {
    type: rel.type,
    confidence: rel.confidence,
    memberDetectionIds: mapped,
    ...shared && Object.keys(shared).length ? { sharedAttributes: { ...shared } } : {}
  };
  return {
    schemaVersion: "b1b2-v1",
    source: { ref: "source-0" },
    items: sorted.map((item, i) => ({
      detectionId: `det-${String(i + 1).padStart(3, "0")}`,
      source: { region: { ...item.raw.region } },
      classification: item.classification
    })),
    validation: { count: sorted.length, max: MAX_ITEMS, order: "region-y-x-height-width-detection-id" },
    relationship
  };
}
async function classifyMultiItem(req, res) {
  if (process.env.MULTI_ITEM_CLASSIFIER_ENABLED === "false") {
    res.status(404).json({ error: "feature_disabled" });
    return;
  }
  const body = req.body;
  if (!own(body) || typeof body.imageBase64 !== "string" || !body.imageBase64 || Object.keys(body).some((k) => k !== "imageBase64")) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "classifier_unavailable" });
    return;
  }
  try {
    const request = {
      contents: [{
        parts: [
          { text: MULTI_ITEM_PROMPT },
          { inlineData: { mimeType: "image/jpeg", data: body.imageBase64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    };
    let response;
    for (const model of ["gemini-flash-lite-latest", "gemini-2.5-flash"]) {
      try {
        response = await axios2.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          request,
          { timeout: 2e4 }
        );
        break;
      } catch (error) {
        if (!(axios2.isAxiosError(error) && error.response?.status === 429) || model === "gemini-2.5-flash") throw error;
      }
    }
    if (!response) throw new Error("classifier_empty_response");
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed;
    try {
      if (typeof text !== "string") throw new Error("not_json");
      parsed = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "classifier_malformed_response" });
      return;
    }
    const result = validateMultiItemResult(parsed);
    if (!result) {
      res.status(422).json({ error: "multi_item_invalid" });
      return;
    }
    res.json(result);
  } catch (error) {
    let code = "classification_failed";
    let status = 500;
    const errorCode = own(error) && typeof error.code === "string" ? error.code : void 0;
    if (errorCode === "ECONNABORTED" || errorCode === "ETIMEDOUT") {
      code = "classifier_timeout";
      status = 504;
    } else if (axios2.isAxiosError(error)) {
      if (error.response?.status === 429) {
        code = "rate_limited";
        status = 429;
      } else if (!error.response) {
        code = "classifier_network_failure";
        status = 503;
      } else if ((error.response.status ?? 0) >= 500) {
        code = "classifier_upstream_failure";
        status = 502;
      }
    } else if (error instanceof Error && error.message === "classifier_empty_response") {
      code = "classifier_malformed_response";
      status = 502;
    }
    res.status(status).json({ error: code });
  }
}

// shared/photoroom-error-codes.ts
var PHOTOROOM_TIMEOUT_ERROR = "photoroom_timeout";
var PHOTOROOM_ERROR = "photoroom_error";
var PHOTOROOM_EMPTY_RESPONSE = "photoroom_empty_response";
var PHOTOROOM_INVALID_RESPONSE = "photoroom_invalid_response";
var BACKGROUND_REMOVAL_FAILED = "background_removal_failed";
var BACKGROUND_REMOVAL_UNAVAILABLE = "background_removal_unavailable";
var BG_REMOVAL_AUTH_REQUIRED = "bg_removal_auth_required";
var BG_REMOVAL_LIMIT_REACHED = "bg_removal_limit_reached";

// server/bgRemovalStore.ts
import crypto from "crypto";
var CACHE_MAX = 200;
var inMemCache = /* @__PURE__ */ new Map();
var inFlightResults = /* @__PURE__ */ new Map();
var BgRemovalStoreUnavailableError = class extends Error {
  constructor() {
    super("Background-removal quota store unavailable");
    this.name = "BgRemovalStoreUnavailableError";
  }
};
function isValidBgRemovalCount(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
function putInMem(hash, base64) {
  if (inMemCache.size >= CACHE_MAX) {
    const oldest = inMemCache.keys().next().value;
    if (oldest) inMemCache.delete(oldest);
  }
  inMemCache.set(hash, base64);
}
var _testOverrides = {};
async function getStoreClient() {
  if (process.env.NODE_ENV === "test" && _testOverrides.client) {
    return _testOverrides.client;
  }
  return (await Promise.resolve().then(() => (init_supabase(), supabase_exports))).supabaseAdmin;
}
function computeImageHash(imageBase64) {
  return crypto.createHash("sha256").update(imageBase64).digest("hex");
}
async function initBgRemovalStore() {
  await pruneBgRemovalCache();
  setInterval(() => void pruneBgRemovalCache(), 24 * 60 * 60 * 1e3);
}
async function pruneBgRemovalCache() {
  try {
    const client = await getStoreClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
    const { count, error } = await client.from("bg_removal_cache").delete({ count: "exact" }).lt("created_at", cutoff);
    if (error) throw error;
    const removed = count ?? 0;
    if (removed > 0) {
      console.log(`[bgRemovalStore] pruned ${removed} stale cache entries`);
    }
  } catch (err) {
    console.error("[bgRemovalStore] prune failed:", err);
  }
}
async function checkCacheByHash(hash) {
  const mem = inMemCache.get(hash);
  if (mem) return mem;
  try {
    const client = await getStoreClient();
    const { data, error } = await client.from("bg_removal_cache").select("result_b64").eq("image_hash", hash).maybeSingle();
    if (error) throw error;
    if (data) {
      putInMem(hash, data.result_b64);
      return data.result_b64;
    }
  } catch (err) {
    console.error("[bgRemovalStore] cache lookup failed:", err);
  }
  return null;
}
async function storeCacheResult(hash, base64) {
  putInMem(hash, base64);
  try {
    const client = await getStoreClient();
    const { error } = await client.from("bg_removal_cache").upsert(
      { image_hash: hash, result_b64: base64 },
      { onConflict: "image_hash", ignoreDuplicates: true }
    );
    if (error) throw error;
  } catch (err) {
    reportError(new Error("Background-removal cache write failed"), "background_removal_cache_write", {
      category: "database",
      code: "DATABASE_UNAVAILABLE",
      dependency: "supabase",
      retryable: true
    });
  }
}
function getOrCreateBgRemovalResult(hash, create) {
  const cached = inMemCache.get(hash);
  if (cached) return Promise.resolve(cached);
  const inFlight = inFlightResults.get(hash);
  if (inFlight) return inFlight;
  let pending;
  pending = create().then(async (result) => {
    await storeCacheResult(hash, result);
    return result;
  }).finally(() => {
    if (inFlightResults.get(hash) === pending) inFlightResults.delete(hash);
  });
  inFlightResults.set(hash, pending);
  return pending;
}
async function getUserBgRemovalCount(userId) {
  try {
    const client = await getStoreClient();
    const { data, error } = await client.from("bg_removal_usage").select("count").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const count = data ? data.count : 0;
    if (!isValidBgRemovalCount(count)) throw new Error("Invalid background-removal quota count");
    return count;
  } catch (error) {
    console.error("[bgRemovalStore] usage lookup failed:", error instanceof Error ? error.name : "unknown");
    throw new BgRemovalStoreUnavailableError();
  }
}
async function incrementUserBgRemovalCount(userId) {
  try {
    const client = await getStoreClient();
    const { data: count, error } = await client.rpc(
      "bg_removal_increment_usage",
      { p_user_id: userId }
    );
    if (error) throw error;
    if (!isValidBgRemovalCount(count)) throw new Error("Invalid background-removal quota count");
    return count;
  } catch (err) {
    console.error("[bgRemovalStore] increment failed:", err instanceof Error ? err.name : "unknown");
    throw new BgRemovalStoreUnavailableError();
  }
}
async function getUserBgRemovalStatus(userId, freeLimit) {
  const count = await getUserBgRemovalCount(userId);
  const remaining = Math.max(0, freeLimit - count);
  return { allowed: count < freeLimit, count, remaining };
}

// server/remove-background.ts
init_supabase();

// server/entitlements.ts
init_supabase();

// server/billing.ts
init_supabase();
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
var REVENUECAT_ENTITLEMENT_ID = "amodka_premium";
var BILLING_REPLAY_TOLERANCE_SECONDS = 5 * 60;
var _billingTestOverrides = {};
function billingRpc(name, args) {
  if (process.env.NODE_ENV === "test" && _billingTestOverrides.rpc) {
    return _billingTestOverrides.rpc(name, args);
  }
  return supabaseAdmin.rpc(name, args);
}
function verifyRevenueCatSignature(rawBody, header, secret = process.env.REVENUECAT_WEBHOOK_SECRET || (process.env.NODE_ENV === "test" ? _billingTestOverrides.secret : void 0), nowSeconds = (process.env.NODE_ENV === "test" ? _billingTestOverrides.nowSeconds : void 0) ?? Math.floor(Date.now() / 1e3)) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(header);
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > BILLING_REPLAY_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(match[1]).update(".").update(rawBody).digest();
  const supplied = Buffer.from(match[2], "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function hasRevenueCatProductConfiguration() {
  return [
    process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID
  ].every((productId) => Boolean(productId?.trim()));
}
function isRevenueCatBillingEnabled() {
  return process.env.REVENUECAT_BILLING_ENABLED === "true";
}
function fromMillis(value) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function isProviderIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= maxDay && Number.isFinite(Date.parse(value));
}
function configuredProducts(store) {
  const productIds = store === "APPLE" ? [
    process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID
  ] : store === "GOOGLE" ? [
    process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID
  ] : [
    process.env.REVENUECAT_IOS_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_IOS_ANNUAL_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_MONTHLY_PRODUCT_ID,
    process.env.REVENUECAT_ANDROID_ANNUAL_PRODUCT_ID
  ];
  return /* @__PURE__ */ new Set([
    ...productIds.filter((id) => Boolean(id && id.trim()))
  ]);
}
function storeName(value) {
  if (value === "APP_STORE" || value === "MAC_APP_STORE" || value === "app_store" || value === "mac_app_store") return "APPLE";
  if (value === "PLAY_STORE" || value === "play_store") return "GOOGLE";
  return null;
}
var POSITIVE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "TEMPORARY_ENTITLEMENT_GRANT"
]);
var STILL_VALID_EVENT_TYPES = /* @__PURE__ */ new Set(["CANCELLATION", "BILLING_ISSUE"]);
var TERMINAL_EVENT_TYPES = /* @__PURE__ */ new Set(["EXPIRATION", "REFUND", "REVOKE"]);
var SUPPORTED_EVENT_TYPES = /* @__PURE__ */ new Set([
  ...POSITIVE_EVENT_TYPES,
  ...STILL_VALID_EVENT_TYPES,
  ...TERMINAL_EVENT_TYPES
]);
function isSupportedRevenueCatEventType(value) {
  return typeof value === "string" && SUPPORTED_EVENT_TYPES.has(value);
}
function normalizeRevenueCatEvent(payload, nowMs = Date.now()) {
  if (!payload || typeof payload !== "object") return null;
  const event = payload.event;
  if (!event || typeof event !== "object") return null;
  const e = event;
  const eventId = typeof e.id === "string" ? e.id : "";
  const userId = typeof e.app_user_id === "string" ? e.app_user_id : "";
  const originalUserId = typeof e.original_app_user_id === "string" ? e.original_app_user_id : "";
  const type = typeof e.type === "string" ? e.type : "";
  const store = storeName(e.store);
  const productId = typeof e.product_id === "string" ? e.product_id : "";
  const entitlementIds = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : [];
  if (!eventId || eventId.length > 200 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || originalUserId !== userId || !type || !store || !productId || !configuredProducts(store).has(productId)) return null;
  const entitlementId = entitlementIds.includes(REVENUECAT_ENTITLEMENT_ID) ? REVENUECAT_ENTITLEMENT_ID : "";
  if (!entitlementId) return null;
  const occurredAt = fromMillis(e.event_timestamp_ms);
  const expiresAt = fromMillis(e.expiration_at_ms);
  if (!occurredAt || !expiresAt || e.purchased_at_ms !== void 0 && e.purchased_at_ms !== null && !fromMillis(e.purchased_at_ms)) return null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const active = (POSITIVE_EVENT_TYPES.has(type) || STILL_VALID_EVENT_TYPES.has(type)) && Number.isFinite(expiresMs) && expiresMs > nowMs;
  const normalizedActive = TERMINAL_EVENT_TYPES.has(type) ? false : active;
  const transactionId = typeof e.transaction_id === "string" ? e.transaction_id : null;
  const originalTransactionId = typeof e.original_transaction_id === "string" ? e.original_transaction_id : transactionId;
  if (!originalTransactionId && !transactionId) return null;
  const purchasedAt = fromMillis(e.purchased_at_ms);
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    eventId,
    userId,
    type,
    store,
    productId,
    entitlementId,
    transactionId,
    originalTransactionId,
    purchasedAt,
    expiresAt,
    occurredAt,
    active: normalizedActive,
    payloadHash
  };
}
async function journalIgnoredRevenueCatEvent(eventId, eventType, payloadHash) {
  const result = await billingRpc("billing_journal_ignored_revenuecat_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload_hash: payloadHash
  });
  if (result.error) throw new Error("billing_journal_unavailable");
}
async function recordUnknownRevenueCatEvent(payload) {
  const event = payload?.event;
  if (!event || typeof event.type !== "string" || isSupportedRevenueCatEventType(event.type) || typeof event.id !== "string" || !event.id || event.id.length > 200) {
    throw new Error("invalid_unknown_revenuecat_event");
  }
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await journalIgnoredRevenueCatEvent(event.id, event.type, payloadHash);
}
async function processRevenueCatEvent(event) {
  const journal = await billingRpc("billing_journal_revenuecat_event", {
    p_event_id: event.eventId,
    p_user_id: event.userId,
    p_event_type: event.type,
    p_store: event.store,
    p_product_id: event.productId,
    p_entitlement_id: event.entitlementId,
    p_transaction_id: event.transactionId,
    p_original_transaction_id: event.originalTransactionId,
    p_purchased_at: event.purchasedAt,
    p_expires_at: event.expiresAt,
    p_occurred_at: event.occurredAt,
    p_active: event.active,
    p_payload_hash: event.payloadHash
  });
  if (journal.error) throw new Error("billing_journal_unavailable");
  const journalStatus = journal.data?.status ?? journal.data;
  if (journalStatus === "processed" || journalStatus === "ignored") return "duplicate";
  const result = await billingRpc("billing_process_revenuecat_event", {
    p_event_id: event.eventId
  });
  if (result.error) throw new Error("billing_processing_failed");
  const status = result.data?.status ?? result.data;
  if (status === "ignored") return "ignored";
  return status === "duplicate" ? "duplicate" : "processed";
}
function normalizeCustomerSnapshot(userId, response) {
  const subscriber = response?.subscriber;
  if (!subscriber || subscriber.original_app_user_id !== userId || subscriber.app_user_id !== void 0 && subscriber.app_user_id !== userId) {
    throw new Error("revenuecat_wrong_account");
  }
  const entitlements = subscriber?.entitlements;
  const subscriptions = subscriber?.subscriptions;
  if (!entitlements || typeof entitlements !== "object" || !subscriptions || typeof subscriptions !== "object") {
    throw new Error("revenuecat_snapshot_invalid");
  }
  const entitlement = entitlements[REVENUECAT_ENTITLEMENT_ID];
  if (!entitlement) return { active: false, productId: null, store: null, expiresAt: null };
  if (typeof entitlement.product_identifier !== "string" || !configuredProducts().has(entitlement.product_identifier) || !isProviderIsoDate(entitlement.expires_date)) {
    throw new Error("revenuecat_snapshot_invalid");
  }
  const subscription = subscriptions[entitlement.product_identifier];
  const store = storeName(subscription?.store);
  const expiresMs = Date.parse(entitlement.expires_date);
  if (!subscription || !store || !configuredProducts(store).has(entitlement.product_identifier) || !Number.isFinite(expiresMs) || !isProviderIsoDate(subscription.expires_date)) {
    throw new Error("revenuecat_snapshot_invalid");
  }
  return {
    active: expiresMs > Date.now(),
    productId: entitlement.product_identifier,
    store,
    expiresAt: entitlement.expires_date
  };
}
async function reconcileRevenueCatCustomer(userId) {
  if (!isRevenueCatBillingEnabled() || !hasRevenueCatProductConfiguration()) {
    throw new Error("revenuecat_server_configuration_unavailable");
  }
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) throw new Error("revenuecat_server_configuration_unavailable");
  const requestFetch = process.env.NODE_ENV === "test" && _billingTestOverrides.fetch ? _billingTestOverrides.fetch : fetch;
  const fetchStartedAt = (/* @__PURE__ */ new Date()).toISOString();
  let response;
  try {
    response = await requestFetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(5e3)
      }
    );
  } catch {
    throw new Error("revenuecat_customer_unavailable");
  }
  if (!response.ok) throw new Error("revenuecat_customer_unavailable");
  const body = await response.json();
  const providerSnapshot = normalizeCustomerSnapshot(userId, body);
  const snapshotHash = createHash("sha256").update(JSON.stringify({ ...providerSnapshot, fetchStartedAt })).digest("hex");
  const snapshotId = `api:${createHash("sha256").update(userId).digest("hex")}:${snapshotHash}`;
  const result = await billingRpc("billing_reconcile_revenuecat_snapshot", {
    p_user_id: userId,
    p_event_id: snapshotId,
    p_payload_hash: snapshotHash,
    p_provider_entitlement_active: providerSnapshot.active,
    p_provider_product_id: providerSnapshot.productId,
    p_provider_store: providerSnapshot.store,
    p_provider_expires_at: providerSnapshot.expiresAt,
    p_fetch_started_at: fetchStartedAt
  });
  if (result.error) throw new Error("billing_reconciliation_failed");
  return parseBillingState(result.data);
}
function parseBillingState(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row.is_premium !== "boolean") throw new Error("billing_state_unavailable");
  return { isPremium: row.is_premium, expiresAt: row.expires_at ?? null };
}
async function getAuthoritativeBillingState(userId) {
  const result = await billingRpc("billing_reconcile_entitlement", { p_user_id: userId });
  if (result.error) throw new Error("billing_state_unavailable");
  return parseBillingState(result.data);
}
async function getBillingReadiness() {
  const configured = isRevenueCatBillingEnabled() && hasRevenueCatProductConfiguration() && Boolean(process.env.REVENUECAT_WEBHOOK_SECRET?.trim()) && Boolean(process.env.REVENUECAT_SECRET_API_KEY?.trim());
  if (!configured) return { ready: false };
  try {
    const result = await billingRpc("billing_readiness_check", {});
    return { ready: !result.error && result.data?.ready === true };
  } catch {
    return { ready: false };
  }
}
async function tombstoneBillingAccount(userId) {
  const result = await billingRpc("billing_tombstone_account", { p_user_id: userId });
  if (result.error) throw new Error("billing_tombstone_failed");
}

// server/entitlements.ts
var _testOverrides2 = {};
function resolveEntitlement(profile, nowMs = Date.now()) {
  const expiresAt = profile?.premium_expires_at ?? null;
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return {
    isPremium: profile?.premium === true && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs,
    expiresAt
  };
}
async function getUserEntitlement(userId, client = supabaseAdmin) {
  const activeClient = process.env.NODE_ENV === "test" && _testOverrides2.client ? _testOverrides2.client : client;
  if (!(process.env.NODE_ENV === "test" && _testOverrides2.client) && client === supabaseAdmin && isRevenueCatBillingEnabled()) {
    return getAuthoritativeBillingState(userId);
  }
  const { data, error } = await activeClient.from("user_profiles").select("premium,premium_expires_at").eq("id", userId).single();
  if (error) throw new Error(error.message);
  return resolveEntitlement(data);
}

// server/remove-background.ts
var FREE_TIER_LIMIT = 20;
var PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
var PHOTOROOM_TIMEOUT_MS = 15e3;
var ProviderResponseError = class extends Error {
  constructor(status, body) {
    super("Background-removal provider returned an invalid response");
    this.status = status;
    this.body = body;
  }
  status;
  body;
};
if (process.env.PHOTOROOM_API_KEY) {
  console.log("[remove-background] PHOTOROOM_API_KEY is set \u2014 background removal enabled");
} else {
  console.warn("[remove-background] PHOTOROOM_API_KEY not set \u2014 /api/remove-background will return 503");
}
var _testOverrides3 = { skipAuth: false, testUserId: "" };
async function removeBackground(req, res) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: BACKGROUND_REMOVAL_UNAVAILABLE });
  }
  const { imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 is required" });
  }
  let userId;
  let isPremium = false;
  let remainingAfterUse = void 0;
  if (_testOverrides3.skipAuth && process.env.NODE_ENV === "test") {
    userId = _testOverrides3.testUserId || "test-user";
    isPremium = resolveEntitlement({
      premium: _testOverrides3.mockPremium === true,
      premium_expires_at: _testOverrides3.mockPremiumExpiresAt ?? new Date(Date.now() + 6e4).toISOString()
    }).isPremium;
    if (!isPremium && _testOverrides3.mockQuota) {
      const { allowed, count, remaining } = _testOverrides3.mockQuota;
      if (!allowed) {
        return res.status(403).json({
          error: BG_REMOVAL_LIMIT_REACHED,
          limit: FREE_TIER_LIMIT,
          count,
          remaining: 0
        });
      }
      remainingAfterUse = Math.max(0, remaining - 1);
    }
  } else {
    const authHeader = req.headers?.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: BG_REMOVAL_AUTH_REQUIRED });
    }
    const supa = process.env.NODE_ENV === "test" && _testOverrides3.mockSupabaseAdmin ? _testOverrides3.mockSupabaseAdmin : supabaseAdmin;
    const { data: { user }, error: authError } = await supa.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: BG_REMOVAL_AUTH_REQUIRED });
    }
    userId = user.id;
    try {
      isPremium = (await getUserEntitlement(userId, supa)).isPremium;
    } catch {
    }
    if (!isPremium) {
      let quota;
      try {
        quota = process.env.NODE_ENV === "test" && !_testOverrides3.mockQuota && (_testOverrides3.skipAuth || _testOverrides3.mockSupabaseAdmin) && !_testOverrides3.useRealQuotaStore ? { allowed: true, count: 0, remaining: FREE_TIER_LIMIT } : await getUserBgRemovalStatus(userId, FREE_TIER_LIMIT);
      } catch (error) {
        if (error instanceof BgRemovalStoreUnavailableError) {
          reportError(error, "background_removal_quota", {
            dependency: "quota_store",
            requestId: res.locals?.requestId
          });
          return res.status(503).json({ error: BACKGROUND_REMOVAL_UNAVAILABLE });
        }
        throw error;
      }
      const { allowed, count, remaining } = quota;
      if (!allowed) {
        return res.status(403).json({
          error: BG_REMOVAL_LIMIT_REACHED,
          limit: FREE_TIER_LIMIT,
          count,
          remaining: 0
        });
      }
      remainingAfterUse = Math.max(0, remaining - 1);
    }
  }
  const isTestMode = _testOverrides3.skipAuth && process.env.NODE_ENV === "test";
  const bypassCache = isTestMode && _testOverrides3.bypassCache !== false;
  const hash = bypassCache ? null : computeImageHash(imageBase64);
  const cacheCheck = process.env.NODE_ENV === "test" && _testOverrides3.mockCheckCache ? _testOverrides3.mockCheckCache : checkCacheByHash;
  const cached = hash ? await cacheCheck(hash) : null;
  if (cached) {
    try {
      const trimmed = trimTransparentGarmentPng(Buffer.from(cached, "base64"));
      return res.json({
        imageBase64: trimmed.toString("base64"),
        mimeType: "image/png",
        fromCache: true
      });
    } catch (error) {
      reportError(error, "background_removal", {
        dependency: "photoroom_cache",
        requestId: res.locals?.requestId
      });
      return res.status(502).json({ error: PHOTOROOM_INVALID_RESPONSE });
    }
  }
  if (!(process.env.NODE_ENV === "test" && (_testOverrides3.skipAuth || _testOverrides3.mockSupabaseAdmin) && !_testOverrides3.mockIncrementCount && !_testOverrides3.useRealQuotaStore)) {
    try {
      if (process.env.NODE_ENV === "test" && _testOverrides3.mockIncrementCount) {
        await _testOverrides3.mockIncrementCount();
      } else {
        await incrementUserBgRemovalCount(userId);
      }
    } catch (error) {
      reportError(error, "background_removal_quota_write", {
        dependency: "quota_store",
        requestId: res.locals?.requestId
      });
      return res.status(503).json({ error: BACKGROUND_REMOVAL_UNAVAILABLE });
    }
  }
  try {
    const createResult = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PHOTOROOM_TIMEOUT_MS);
      try {
        const buffer = Buffer.from(imageBase64, "base64");
        const form = new FormData();
        const blob = new Blob([buffer], { type: "image/jpeg" });
        form.append("image_file", blob, "garment.jpg");
        const fetchResponse = await fetch(PHOTOROOM_SEGMENT_URL, {
          method: "POST",
          headers: { "x-api-key": apiKey },
          body: form,
          signal: controller.signal
        });
        if (!fetchResponse.ok) {
          reportError(new Error("Photoroom dependency returned an error"), "background_removal", {
            dependency: "photoroom",
            status: fetchResponse.status,
            requestId: res.locals?.requestId
          });
          throw new ProviderResponseError(502, {
            error: PHOTOROOM_ERROR,
            status: fetchResponse.status
          });
        }
        const arrayBuffer = await fetchResponse.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
          reportError(new Error("Photoroom returned an empty response"), "background_removal", {
            dependency: "photoroom",
            requestId: res.locals?.requestId
          });
          throw new ProviderResponseError(502, { error: PHOTOROOM_EMPTY_RESPONSE });
        }
        const resultBuf = Buffer.from(arrayBuffer);
        const isPng = resultBuf.length >= 4 && resultBuf[0] === 137 && resultBuf[1] === 80 && resultBuf[2] === 78 && resultBuf[3] === 71;
        if (!isPng || arrayBuffer.byteLength < 1024) {
          reportError(new Error("Photoroom returned a malformed image"), "background_removal", {
            dependency: "photoroom",
            requestId: res.locals?.requestId
          });
          throw new ProviderResponseError(502, { error: PHOTOROOM_INVALID_RESPONSE });
        }
        try {
          return trimTransparentGarmentPng(resultBuf).toString("base64");
        } catch (error) {
          reportError(error, "background_removal", {
            dependency: "photoroom",
            requestId: res.locals?.requestId
          });
          throw new ProviderResponseError(502, { error: PHOTOROOM_INVALID_RESPONSE });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };
    const resultBase64 = hash ? await getOrCreateBgRemovalResult(hash, createResult) : await createResult();
    const responseBody = { imageBase64: resultBase64, mimeType: "image/png" };
    if (remainingAfterUse !== void 0) responseBody.remaining = remainingAfterUse;
    return res.json(responseBody);
  } catch (err) {
    if (err instanceof ProviderResponseError) {
      return res.status(err.status).json(err.body);
    }
    if (err?.name === "AbortError") {
      reportError(err, "background_removal", {
        dependency: "photoroom",
        requestId: res.locals?.requestId
      });
      return res.status(502).json({ error: PHOTOROOM_TIMEOUT_ERROR });
    }
    reportError(err, "background_removal", {
      dependency: "photoroom",
      requestId: res.locals?.requestId
    });
    return res.status(502).json({ error: BACKGROUND_REMOVAL_FAILED });
  }
}

// server/aiProcessingConsent.ts
init_supabase();
var AI_PROCESSING_KEY = "amodka_ai_image_processing";
function parseAiProcessingState(value) {
  return value === "allowed" || value === "declined" ? value : "not_asked";
}
var _testOverrides4 = {};
async function loadMetadata(userId) {
  if (process.env.NODE_ENV === "test" && _testOverrides4.load) {
    return _testOverrides4.load(userId);
  }
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error("AI preference unavailable");
  return data.user.app_metadata ?? {};
}
async function getAiProcessingState(userId) {
  const metadata = await loadMetadata(userId);
  return parseAiProcessingState(metadata[AI_PROCESSING_KEY]);
}
async function setAiProcessingState(userId, state) {
  const metadata = { ...await loadMetadata(userId), [AI_PROCESSING_KEY]: state };
  if (process.env.NODE_ENV === "test" && _testOverrides4.save) {
    await _testOverrides4.save(userId, metadata);
    return;
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: metadata
  });
  if (error) throw new Error("AI preference could not be saved");
}
async function requireAiProcessingConsent(req, res, next) {
  const userId = req.authenticatedUser?.id;
  if (!userId) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  try {
    if (await getAiProcessingState(userId) !== "allowed") {
      res.status(403).json({ error: "ai_processing_consent_required" });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "ai_processing_preference_unavailable" });
  }
}

// server/routes.ts
init_supabase();

// server/accountDeletionInventory.ts
var ACCOUNT_DELETION_TABLES = [
  { table: "affinity_signals", ownerColumn: "user_id" },
  { table: "pair_affinity_signals", ownerColumn: "user_id" },
  { table: "rotation_cursors", ownerColumn: "user_id" },
  { table: "wear_logs", ownerColumn: "user_id" },
  { table: "slot_statuses", ownerColumn: "user_id" },
  { table: "tryon_profiles", ownerColumn: "user_id" },
  { table: "saved_looks", ownerColumn: "user_id" },
  { table: "garment_group_members", ownerColumn: "user_id" },
  { table: "garment_groups", ownerColumn: "user_id" },
  { table: "wardrobe_free_selections", ownerColumn: "user_id" },
  { table: "wardrobe_photo_cleanup_receipts", ownerColumn: "user_id" },
  { table: "wardrobe_items", ownerColumn: "user_id" },
  { table: "bg_removal_usage", ownerColumn: "user_id" },
  { table: "user_profiles", ownerColumn: "id" }
];
var ACCOUNT_DELETION_STORAGE_BUCKETS = [
  "wardrobe-images",
  "tryon-photos"
];

// server/middleware/rateLimiter.ts
import rateLimit from "express-rate-limit";

// server/middleware/supabaseSecurityStore.ts
var STORE_TIMEOUT_MS = 1500;
var RATE_LIMIT_TABLE = "ratelimit_store";
var LOCKOUT_TABLE = "lockout_store";
var _testOverrides5 = {};
function assertSecurityStoreTestClient(clientOverride) {
  if (process.env.NODE_ENV === "test" && clientOverride === void 0 && !_testOverrides5.client) {
    throw new Error("Live security-store access blocked under NODE_ENV=test; inject a fake client or an explicit in-memory store");
  }
}
async function getStoreClient2() {
  assertSecurityStoreTestClient();
  if (process.env.NODE_ENV === "test" && _testOverrides5.client) {
    return _testOverrides5.client;
  }
  return (await Promise.resolve().then(() => (init_supabase(), supabase_exports))).supabaseAdmin;
}
function withTimeout(operation, label) {
  let timer;
  const controller = new AbortController();
  const abortable = typeof operation?.abortSignal === "function" ? operation.abortSignal(controller.signal) : operation;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error(`${label} timed out after ${STORE_TIMEOUT_MS} ms`));
      },
      STORE_TIMEOUT_MS
    );
  });
  return Promise.race([Promise.resolve(abortable), timeout]).finally(() => clearTimeout(timer));
}
function throwIfError(error, operation) {
  if (error) throw new Error(`${operation}: ${error.message ?? "Supabase request failed"}`);
}
function oneRateLimitRow(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("Rate-limit increment returned no row");
  const { hits, reset_time_ms } = row;
  const parsedHits = Number(hits);
  const resetTime = Number(reset_time_ms);
  if (!Number.isInteger(parsedHits) || parsedHits < 1 || !Number.isFinite(resetTime)) {
    throw new Error("Rate-limit increment returned invalid values");
  }
  return { hits: parsedHits, reset_time_ms: resetTime };
}
var SupabaseRateLimitStore = class _SupabaseRateLimitStore {
  constructor(prefix, clientOverride) {
    this.clientOverride = clientOverride;
    if (typeof prefix !== "string" || prefix.trim().length === 0) {
      throw new TypeError("Rate-limit store prefix must be non-empty");
    }
    this.prefix = prefix;
  }
  clientOverride;
  prefix;
  windowMs = 6e4;
  fallback = /* @__PURE__ */ new Map();
  consecutiveDbFailures = 0;
  static DB_FAILURE_WARN_THRESHOLD = 3;
  init(options) {
    this.windowMs = options.windowMs ?? 6e4;
  }
  fullKey(key) {
    return `${this.prefix}:${key}`;
  }
  async client() {
    if (this.clientOverride !== void 0) return this.clientOverride;
    return getStoreClient2();
  }
  fallbackIncrement(key) {
    const now = Date.now();
    const existing = this.fallback.get(key);
    const entry = !existing || now >= existing.resetTime ? { hits: 1, resetTime: now + this.windowMs } : { hits: existing.hits + 1, resetTime: existing.resetTime };
    this.fallback.set(key, entry);
    return { totalHits: entry.hits, resetTime: new Date(entry.resetTime) };
  }
  async increment(key) {
    assertSecurityStoreTestClient(this.clientOverride);
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { data, error } = await withTimeout(
          client.rpc("ratelimit_increment", {
            p_key: fullKey,
            p_window_ms: this.windowMs
          }),
          "rate-limit increment"
        );
        throwIfError(error, "Rate-limit increment");
        const row = oneRateLimitRow(data);
        this.consecutiveDbFailures = 0;
        return { totalHits: row.hits, resetTime: new Date(row.reset_time_ms) };
      }
    } catch (error) {
      this.consecutiveDbFailures++;
      if (this.consecutiveDbFailures >= _SupabaseRateLimitStore.DB_FAILURE_WARN_THRESHOLD) {
        console.warn(
          `[rateLimiter] ${this.prefix}: ${this.consecutiveDbFailures} consecutive Supabase failure(s) \u2014 switching to in-memory fallback for this window`
        );
      }
      console.error("[rateLimiter] Supabase increment failed \u2014 falling back to in-memory:", error);
    }
    return this.fallbackIncrement(fullKey);
  }
  async decrement(key) {
    assertSecurityStoreTestClient(this.clientOverride);
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_decrement", { p_key: fullKey }),
          "rate-limit decrement"
        );
        throwIfError(error, "Rate-limit decrement");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase decrement failed \u2014 using in-memory fallback:", error);
    }
    const existing = this.fallback.get(fullKey);
    if (existing && existing.hits > 0) {
      this.fallback.set(fullKey, { ...existing, hits: existing.hits - 1 });
    }
  }
  async resetKey(key) {
    assertSecurityStoreTestClient(this.clientOverride);
    const fullKey = this.fullKey(key);
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_delete_key", { p_key: fullKey }),
          "rate-limit key reset"
        );
        throwIfError(error, "Rate-limit key reset");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase key reset failed \u2014 using in-memory fallback:", error);
    }
    this.fallback.delete(fullKey);
  }
  async resetAll() {
    assertSecurityStoreTestClient(this.clientOverride);
    try {
      const client = await this.client();
      if (client) {
        const { error } = await withTimeout(
          client.rpc("ratelimit_delete_prefix", {
            p_prefix: `${this.prefix}:`
          }),
          "rate-limit prefix reset"
        );
        throwIfError(error, "Rate-limit prefix reset");
        return;
      }
    } catch (error) {
      console.error("[rateLimiter] Supabase prefix reset failed:", error);
      throw error;
    }
    this.fallback.clear();
  }
  async loadFromSupabase() {
    assertSecurityStoreTestClient(this.clientOverride);
    try {
      const client = await this.client();
      if (!client) return;
      const { data, error } = await withTimeout(
        client.from(RATE_LIMIT_TABLE).select("key,hits,reset_time").like("key", `${this.prefix}:%`).gt("reset_time", (/* @__PURE__ */ new Date()).toISOString()),
        "rate-limit preload"
      );
      throwIfError(error, "Rate-limit preload");
      for (const row of data ?? []) {
        const hits = Number(row.hits);
        const resetTime = new Date(row.reset_time).getTime();
        if (Number.isInteger(hits) && hits >= 0 && Number.isFinite(resetTime)) {
          this.fallback.set(row.key, { hits, resetTime });
        }
      }
    } catch (error) {
      console.error(`[rateLimiter] ${this.prefix}: failed to preload counters from Supabase:`, error);
    }
  }
  get _consecutiveDbFailuresForTesting() {
    return this.consecutiveDbFailures;
  }
};
async function pruneRateLimitRows() {
  const client = await getStoreClient2();
  const { count, error } = await withTimeout(
    client.from(RATE_LIMIT_TABLE).delete({ count: "exact" }).lte("reset_time", (/* @__PURE__ */ new Date()).toISOString()),
    "rate-limit prune"
  );
  throwIfError(error, "Rate-limit prune");
  return count ?? 0;
}
async function pruneLockoutRows() {
  const client = await getStoreClient2();
  const { count, error } = await withTimeout(
    client.from(LOCKOUT_TABLE).delete({ count: "exact" }).lte("expires", Date.now()),
    "lockout prune"
  );
  throwIfError(error, "Lockout prune");
  return count ?? 0;
}
function createSupabaseLockoutPersistence() {
  return {
    async set(key, record, ttlMs) {
      const client = await getStoreClient2();
      const { error } = await withTimeout(
        client.from(LOCKOUT_TABLE).upsert(
          {
            key: `lockout:${key}`,
            value: JSON.stringify(record),
            expires: Date.now() + ttlMs
          },
          { onConflict: "key" }
        ),
        "lockout write"
      );
      throwIfError(error, "Lockout write");
    },
    async delete(key) {
      const client = await getStoreClient2();
      const { error } = await withTimeout(
        client.from(LOCKOUT_TABLE).delete().eq("key", `lockout:${key}`),
        "lockout delete"
      );
      throwIfError(error, "Lockout delete");
    },
    async loadAll() {
      const client = await getStoreClient2();
      const { data, error } = await withTimeout(
        client.from(LOCKOUT_TABLE).select("key,value,expires").like("key", "lockout:%"),
        "lockout load"
      );
      throwIfError(error, "Lockout load");
      return (data ?? []).flatMap((row) => {
        let decoded;
        try {
          decoded = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        } catch {
          return [];
        }
        const record = decoded?.value ?? decoded;
        if (!record || !Number.isInteger(record.attempts) || !Number.isFinite(record.windowStart) || !(record.lockedUntil === null || Number.isFinite(record.lockedUntil))) return [];
        return [{
          key: String(row.key).slice("lockout:".length),
          record,
          expiresAt: row.expires == null ? Infinity : Number(row.expires)
        }];
      }).filter((entry) => Number.isFinite(entry.expiresAt) || entry.expiresAt === Infinity);
    }
  };
}

// server/middleware/rateLimiter.ts
var LOCKOUT_MAX_ATTEMPTS = 5;
var LOCKOUT_WINDOW_MS = 15 * 60 * 1e3;
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;
var BASE_PRUNE_INTERVAL_MS = 60 * 60 * 1e3;
var MAX_PRUNE_BACKOFF_MS = 8 * 60 * 60 * 1e3;
var memCache = /* @__PURE__ */ new Map();
var _persistence = null;
var _isPersistenceTestOverride = false;
var __rlPruneIntervalForTesting = null;
var __lockoutPruneIntervalForTesting = null;
function getPersistence() {
  if (!_isPersistenceTestOverride) assertSecurityStoreTestClient();
  if (_persistence !== null) return _persistence;
  _persistence = createSupabaseLockoutPersistence();
  return _persistence;
}
function pruneDelay(failCount) {
  return Math.min(BASE_PRUNE_INTERVAL_MS * Math.pow(2, failCount), MAX_PRUNE_BACKOFF_MS);
}
function scheduleRlPrune(failCount) {
  return setTimeout(() => {
    void pruneRateLimitRows().then(
      (removed) => {
        if (removed > 0) console.log(`[rateLimiter] periodic prune: removed ${removed} expired counter(s)`);
        __rlPruneIntervalForTesting = scheduleRlPrune(0);
      },
      (error) => {
        if (process.env.NODE_ENV !== "test") {
          const delay = pruneDelay(failCount + 1);
          console.error(
            `[rateLimiter] periodic prune error (retrying in ${delay / 6e4} min):`,
            error
          );
        }
        __rlPruneIntervalForTesting = scheduleRlPrune(failCount + 1);
      }
    );
  }, pruneDelay(failCount));
}
function scheduleLockoutPrune(failCount) {
  return setTimeout(() => {
    void pruneLockoutRows().then(
      (removed) => {
        if (removed > 0) console.log(`[rateLimiter] periodic prune: removed ${removed} expired lockout(s)`);
        __lockoutPruneIntervalForTesting = scheduleLockoutPrune(0);
      },
      (error) => {
        if (process.env.NODE_ENV !== "test") {
          const delay = pruneDelay(failCount + 1);
          console.error(
            `[rateLimiter] periodic lockout prune error (retrying in ${delay / 6e4} min):`,
            error
          );
        }
        __lockoutPruneIntervalForTesting = scheduleLockoutPrune(failCount + 1);
      }
    );
  }, pruneDelay(failCount));
}
async function initLockoutStore() {
  const persistence = getPersistence();
  if (!_isPersistenceTestOverride) {
    try {
      const removed = await pruneLockoutRows();
      console.log(`[rateLimiter] pruned ${removed} expired lockout row(s)`);
    } catch (error) {
      console.error("[rateLimiter] failed to prune expired lockout rows from Supabase:", error);
    }
  }
  try {
    const now = Date.now();
    const entries = await persistence.loadAll();
    let loaded = 0;
    for (const { key, record, expiresAt } of entries) {
      if (expiresAt > now) {
        memCache.set(key, { record, expiresAt });
        loaded++;
      }
    }
    console.log(`[rateLimiter] loaded ${loaded} active lockout record(s) from Supabase`);
  } catch (error) {
    console.error("[rateLimiter] failed to load lockout records from Supabase:", error);
  }
  if (process.env.NODE_ENV !== "test" && __lockoutPruneIntervalForTesting === null) {
    __lockoutPruneIntervalForTesting = scheduleLockoutPrune(0);
  }
}
var _stores = /* @__PURE__ */ new Map();
async function initRateLimitStore() {
  assertSecurityStoreTestClient();
  try {
    const removed = await pruneRateLimitRows();
    console.log(`[rateLimiter] Supabase rate-limit store ready; pruned ${removed} expired row(s)`);
  } catch (error) {
    console.error("[rateLimiter] failed to initialise Supabase rate-limit store:", error);
  }
  if (process.env.NODE_ENV !== "test" && __rlPruneIntervalForTesting === null) {
    __rlPruneIntervalForTesting = scheduleRlPrune(0);
  }
  await Promise.all([..._stores.values()].map((store) => store.loadFromSupabase()));
}
function checkAccountLockout(email) {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const entry = memCache.get(key);
  if (!entry || now >= entry.expiresAt) {
    if (entry) memCache.delete(key);
    return { locked: false };
  }
  const { record } = entry;
  if (record.lockedUntil !== null && now < record.lockedUntil) {
    return { locked: true, minutesLeft: Math.max(1, Math.ceil((record.lockedUntil - now) / 6e4)) };
  }
  return { locked: false };
}
function recordFailedAttempt(email) {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const existing = memCache.get(key);
  const isExpired = !existing || now >= existing.expiresAt;
  let record;
  let ttlMs;
  if (isExpired) {
    record = { attempts: 1, windowStart: now, lockedUntil: null };
    ttlMs = LOCKOUT_WINDOW_MS;
  } else {
    const updatedAttempts = existing.record.attempts + 1;
    if (updatedAttempts >= LOCKOUT_MAX_ATTEMPTS) {
      record = {
        attempts: updatedAttempts,
        windowStart: existing.record.windowStart,
        lockedUntil: now + LOCKOUT_DURATION_MS
      };
      ttlMs = LOCKOUT_DURATION_MS;
    } else {
      record = {
        attempts: updatedAttempts,
        windowStart: existing.record.windowStart,
        lockedUntil: null
      };
      ttlMs = Math.max(1, LOCKOUT_WINDOW_MS - (now - existing.record.windowStart));
    }
  }
  memCache.set(key, { record, expiresAt: now + ttlMs });
  void getPersistence().set(key, record, ttlMs).catch(
    (error) => console.error("[rateLimiter] failed to persist failed attempt:", error)
  );
}
function clearLockout(email) {
  const key = email.trim().toLowerCase();
  memCache.delete(key);
  void getPersistence().delete(key).catch(
    (error) => console.error("[rateLimiter] failed to clear lockout:", error)
  );
}
function makeLimiterHandler() {
  return (req, res) => {
    const info = req.rateLimit;
    const resetMs = info?.resetTime instanceof Date ? info.resetTime.getTime() - Date.now() : 0;
    const retryAfter = Math.max(1, Math.ceil(resetMs / 1e3));
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "rate_limit", retryAfter });
  };
}
var LIMITER_CONFIGS = {
  aiLimiter: { windowMs: 60 * 1e3, max: 10 },
  bgRemovalLimiter: { windowMs: 60 * 1e3, max: 8 },
  billingReconcileLimiter: { windowMs: 60 * 1e3, max: 10 },
  accountLimiter: { windowMs: 60 * 60 * 1e3, max: 5 },
  accountDeletionIpLimiter: { windowMs: 60 * 60 * 1e3, max: 60 },
  accountDeletionUserLimiter: { windowMs: 60 * 60 * 1e3, max: 5 },
  aiPreferenceLimiter: { windowMs: 60 * 1e3, max: 30 },
  authLimiter: { windowMs: 15 * 60 * 1e3, max: 5 },
  resetLimiter: { windowMs: 60 * 60 * 1e3, max: 3 }
};
function makeStore(prefix) {
  const store = new SupabaseRateLimitStore(prefix);
  _stores.set(prefix, store);
  return store;
}
var aiLimiter = rateLimit({
  ...LIMITER_CONFIGS.aiLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("ai"),
  handler: makeLimiterHandler()
});
var bgRemovalLimiter = rateLimit({
  ...LIMITER_CONFIGS.bgRemovalLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("bgremoval"),
  handler: makeLimiterHandler()
});
var billingReconcileLimiter = rateLimit({
  ...LIMITER_CONFIGS.billingReconcileLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("billingreconcile"),
  handler: makeLimiterHandler()
});
var accountLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account"),
  handler: makeLimiterHandler()
});
var accountDeletionIpLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountDeletionIpLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account-delete-ip"),
  handler: makeLimiterHandler()
});
var accountDeletionUserLimiter = rateLimit({
  ...LIMITER_CONFIGS.accountDeletionUserLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("account-delete-user"),
  keyGenerator: (req) => req.authenticatedUser.id,
  handler: makeLimiterHandler()
});
var aiPreferenceLimiter = rateLimit({
  ...LIMITER_CONFIGS.aiPreferenceLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("aipreference"),
  keyGenerator: (req) => req.authenticatedUser.id,
  handler: (req, res) => {
    const info = req.rateLimit;
    const retryAfter = Math.max(
      1,
      Math.ceil(((info?.resetTime?.getTime() ?? Date.now()) - Date.now()) / 1e3)
    );
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({ error: "ai_preference_rate_limit", retryAfter });
  }
});
var authLimiter = rateLimit({
  ...LIMITER_CONFIGS.authLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("auth"),
  handler: makeLimiterHandler()
});
var resetLimiter = rateLimit({
  ...LIMITER_CONFIGS.resetLimiter,
  standardHeaders: true,
  legacyHeaders: true,
  store: makeStore("reset"),
  handler: makeLimiterHandler()
});

// lib/oauth-callback.ts
var AMODKA_URL_SCHEME = "amodka";
var NATIVE_OAUTH_CALLBACK_URL = `${AMODKA_URL_SCHEME}://auth/callback`;
var NATIVE_EMAIL_CONFIRMATION_URL = `${AMODKA_URL_SCHEME}://auth/confirm`;
var NATIVE_PASSWORD_RECOVERY_URL = `${AMODKA_URL_SCHEME}://auth/update-password`;
function callbackBase(url) {
  const queryIndex = url.search(/[?#]/);
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}
function isOAuthRelayDestination(url, expectedExpHost) {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === `${AMODKA_URL_SCHEME}:`) {
      return callbackBase(url) === NATIVE_OAUTH_CALLBACK_URL;
    }
    if (parsed.protocol !== "exp:") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || expectedExpHost !== void 0 && parsed.host === expectedExpHost;
  } catch {
    return false;
  }
}
function buildOAuthRelayUrl(destination, code, type, expectedExpHost) {
  if (!code || !isOAuthRelayDestination(destination, expectedExpHost)) return null;
  const relay = new URLSearchParams({ code });
  if (type) relay.set("type", type);
  const base = destination.split(/[?#]/)[0];
  return `${base}?${relay.toString()}`;
}

// server/routes.ts
var pLimit = __require("p-limit");
var _aiSlots = pLimit(5);
function withAiLimit(handler) {
  return (req, res) => {
    void _aiSlots(() => Promise.resolve(handler(req, res)));
  };
}
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var MAX_EMAIL_LEN = 254;
var MAX_PASSWORD_LEN = 128;
var MIN_PASSWORD_LEN = 8;
function isValidEmail(val) {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LEN && EMAIL_REGEX.test(trimmed);
}
function isValidPassword(val) {
  return typeof val === "string" && val.length >= MIN_PASSWORD_LEN && val.length <= MAX_PASSWORD_LEN;
}
var AccountDeletionError = class extends Error {
  constructor(stage) {
    super(`account deletion failed at ${stage}`);
    this.stage = stage;
  }
  stage;
};
async function deleteAccountData(userId) {
  async function checked(stage, operation) {
    try {
      const result = await operation();
      if (result.error) throw new AccountDeletionError(stage);
      console.info(JSON.stringify({ type: "account_deletion_step", step: stage, ok: true, status: 200 }));
      return result;
    } catch {
      throw new AccountDeletionError(stage);
    }
  }
  if (isRevenueCatBillingEnabled()) {
    await checked("billing_tombstone", async () => {
      await tombstoneBillingAccount(userId);
      return { error: null };
    });
  }
  for (const bucketName of ACCOUNT_DELETION_STORAGE_BUCKETS) {
    const bucket = supabaseAdmin.storage.from(bucketName);
    const paths = [];
    for (let offset = 0; ; offset += 100) {
      const { data } = await checked(
        `storage_list_${bucketName}`,
        () => bucket.list(userId, { limit: 100, offset })
      );
      if (!data) throw new AccountDeletionError(`storage_list_${bucketName}`);
      if (data.some((file) => !file.id || !file.name)) {
        throw new AccountDeletionError(`storage_list_${bucketName}`);
      }
      paths.push(...data.map((file) => `${userId}/${file.name}`));
      if (data.length < 100) break;
    }
    for (let i = 0; i < paths.length; i += 100) {
      await checked(`storage_remove_${bucketName}`, () => bucket.remove(paths.slice(i, i + 100)));
    }
    const { data: remaining } = await checked(
      `storage_verify_${bucketName}`,
      () => bucket.list(userId, { limit: 1 })
    );
    if (!remaining || remaining.length) throw new AccountDeletionError(`storage_verify_${bucketName}`);
  }
  for (const entry of ACCOUNT_DELETION_TABLES) {
    const { table, ownerColumn } = entry;
    await checked(`table_${table}`, async () => {
      return await supabaseAdmin.from(table).delete().eq(ownerColumn, userId);
    });
  }
  await checked("auth_delete", () => supabaseAdmin.auth.admin.deleteUser(userId));
}
function logAccountDeletionError(error, route) {
  const stage = error instanceof AccountDeletionError ? error.stage : "unexpected";
  console.info(JSON.stringify({ type: "account_deletion_step", step: stage, ok: false, status: 500 }));
  reportError(error, `account_deletion_${stage}`, {
    dependency: "supabase",
    route
  });
}
function getEnvAllowlist() {
  return process.env.ALLOWED_RESET_ORIGINS ? process.env.ALLOWED_RESET_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean) : null;
}
function sanitizeRedirectUrl(clientRedirectTo, requestOrigin, allowedPaths, nativeFallback) {
  if (clientRedirectTo === void 0) return nativeFallback;
  if (typeof clientRedirectTo !== "string") return null;
  if (clientRedirectTo === nativeFallback) return clientRedirectTo;
  const envAllowlist = getEnvAllowlist();
  try {
    const parsed = new URL(clientRedirectTo);
    const isHttps = parsed.protocol === "https:" || parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    const hasAllowedPath = allowedPaths.includes(parsed.pathname);
    const originAllowed = envAllowlist ? envAllowlist.includes(parsed.origin) : requestOrigin !== null && parsed.origin === new URL(requestOrigin).origin;
    if (isHttps && hasAllowedPath && originAllowed) return clientRedirectTo;
  } catch {
  }
  return null;
}
function authProviderDetails(error) {
  if (!error || typeof error !== "object") return {};
  const value = error;
  return {
    ...typeof value.status === "number" && Number.isInteger(value.status) && value.status >= 0 && value.status <= 599 ? { status: value.status } : {},
    ...typeof value.code === "string" && /^[a-z0-9_-]{1,64}$/i.test(value.code) ? { providerCode: value.code } : {}
  };
}
function reportAuthRequestFailure(operation, route, providerError) {
  reportError(new Error("Auth provider request failed"), operation, {
    dependency: "supabase_auth",
    route,
    category: "external_dependency",
    code: "EXTERNAL_DEPENDENCY_ERROR",
    ...authProviderDetails(providerError)
  });
}
var _testOverrides6 = {};
async function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === "test" && _testOverrides6.authenticatedUser) {
    req.authenticatedUser = _testOverrides6.authenticatedUser;
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  req.authenticatedUser = user;
  next();
}
async function registerRoutes(app2) {
  app2.post("/api/billing/revenuecat/webhook", async (req, res) => {
    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ error: "invalid_webhook_body" });
    if (!isRevenueCatBillingEnabled() || !process.env.REVENUECAT_WEBHOOK_SECRET || !hasRevenueCatProductConfiguration()) {
      return res.status(503).json({ error: "billing_configuration_unavailable" });
    }
    const signature = typeof req.headers["x-revenuecat-webhook-signature"] === "string" ? req.headers["x-revenuecat-webhook-signature"] : void 0;
    if (!verifyRevenueCatSignature(rawBody, signature)) {
      return res.status(401).json({ error: "invalid_webhook_signature" });
    }
    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid_webhook_json" });
    }
    const providerEventType = payload?.event?.type;
    if (typeof providerEventType === "string" && !isSupportedRevenueCatEventType(providerEventType)) {
      try {
        await recordUnknownRevenueCatEvent(payload);
        console.log(JSON.stringify({
          type: "billing_event",
          requestId: res.locals.requestId,
          eventId: payload.event.id,
          eventType: providerEventType,
          result: "ignored"
        }));
        return res.status(200).json({ received: true, status: "ignored" });
      } catch {
        return res.status(503).json({ error: "billing_event_processing_unavailable" });
      }
    }
    const event = normalizeRevenueCatEvent(payload);
    if (!event) return res.status(400).json({ error: "invalid_webhook_event" });
    try {
      const status = await processRevenueCatEvent(event);
      console.log(JSON.stringify({
        type: "billing_event",
        requestId: res.locals.requestId,
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
        result: status
      }));
      return res.status(200).json({ received: true, status });
    } catch {
      reportError(new Error("RevenueCat event processing unavailable"), "billing_event_processing", {
        dependency: "revenuecat",
        route: "/api/billing/revenuecat/webhook",
        requestId: res.locals.requestId,
        category: "external_dependency"
      });
      console.error(JSON.stringify({
        type: "billing_event_failure",
        requestId: res.locals.requestId,
        eventId: event.eventId,
        eventType: event.type,
        userId: event.userId,
        category: "processing_unavailable"
      }));
      return res.status(503).json({ error: "billing_event_processing_unavailable" });
    }
  });
  app2.get("/api/user/billing/readiness", requireAuth, async (_req, res) => {
    return res.json(await getBillingReadiness());
  });
  app2.post("/api/classify-garment", aiLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(classifyGarment));
  app2.post("/api/classify-garments", aiLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(classifyMultiItem));
  app2.post("/api/remove-background", bgRemovalLimiter, requireAuth, requireAiProcessingConsent, withAiLimit(removeBackground));
  app2.post("/api/auth/sign-in", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "invalid_password" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${lockout.minutesLeft} minute${lockout.minutesLeft === 1 ? "" : "s"}.`,
        retryAfter: lockout.minutesLeft * 60
      });
    }
    try {
      const { data, error } = await supabaseAuth.auth.signInWithPassword({
        email: normalizedEmail,
        password: String(password)
      });
      if (error) {
        if (isAuthProviderUnavailable(error)) {
          reportAuthRequestFailure("auth_signin_provider_unavailable", "/api/auth/sign-in", error);
          return authUnavailableResponse(res);
        }
        if (error.code !== "invalid_credentials" && error.code !== "email_not_confirmed") {
          reportAuthRequestFailure("auth_signin_returned_error", "/api/auth/sign-in", error);
        }
        if (error.code === "invalid_credentials") recordFailedAttempt(normalizedEmail);
        return res.status(401).json({ error: "invalid_credentials" });
      }
      clearLockout(normalizedEmail);
      return res.json({ session: data.session });
    } catch (err) {
      reportAuthRequestFailure("auth_signin_exception", "/api/auth/sign-in", err);
      return authUnavailableResponse(res);
    }
  });
  app2.post("/api/auth/sign-up", authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "weak_password" });
    }
    try {
      const { error } = await supabaseAuth.auth.signUp({
        email: email.trim().toLowerCase(),
        password: String(password)
      });
      if (error) {
        reportAuthRequestFailure("auth_signup_returned_error", "/api/auth/sign-up", error);
        if (isAuthProviderUnavailable(error)) return authUnavailableResponse(res);
        if (isDuplicateSignupError(error)) {
          return res.status(409).json({ success: false, reason: "account_exists" });
        }
        if (isWeakPasswordError(error)) return res.status(400).json({ error: "weak_password" });
        return res.status(400).json({ error: "unknown" });
      }
    } catch (error) {
      reportAuthRequestFailure("auth_signup_exception", "/api/auth/sign-up", error);
      return authUnavailableResponse(res);
    }
    return res.json({ acknowledged: true });
  });
  app2.post("/api/auth/reset-password", authLimiter, resetLimiter, async (req, res) => {
    const { email, redirectTo: clientRedirectTo } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "invalid_email" });
    }
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : null;
    const redirectTo = sanitizeRedirectUrl(
      clientRedirectTo,
      requestOrigin,
      ["/auth/update-password"],
      NATIVE_PASSWORD_RECOVERY_URL
    );
    if (!redirectTo) return res.status(400).json({ error: "invalid_redirect" });
    const normalizedEmail = email.trim().toLowerCase();
    const lockout = checkAccountLockout(normalizedEmail);
    if (lockout.locked) {
      return res.json({ acknowledged: true });
    }
    try {
      const { error } = await supabaseAuth.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );
      if (error) reportAuthRequestFailure("auth_reset_returned_error", "/api/auth/reset-password");
    } catch {
      reportAuthRequestFailure("auth_reset_exception", "/api/auth/reset-password");
    }
    return res.json({ acknowledged: true });
  });
  app2.get("/api/user/ai-processing", requireAuth, async (req, res) => {
    try {
      return res.json({ state: await getAiProcessingState(req.authenticatedUser.id) });
    } catch {
      return res.status(503).json({ error: "ai_processing_preference_unavailable" });
    }
  });
  app2.put("/api/user/ai-processing", requireAuth, aiPreferenceLimiter, async (req, res) => {
    const state = req.body?.state;
    if (state !== "allowed" && state !== "declined") {
      return res.status(400).json({ error: "invalid_ai_processing_preference" });
    }
    try {
      await setAiProcessingState(req.authenticatedUser.id, state);
      return res.json({ state });
    } catch {
      return res.status(503).json({ error: "ai_processing_preference_unavailable" });
    }
  });
  app2.get("/api/user/entitlements", requireAuth, async (req, res) => {
    const authedUser = req.authenticatedUser;
    try {
      return res.json(await getUserEntitlement(authedUser.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[entitlements]", msg);
      return res.status(500).json({ error: "entitlements_unavailable" });
    }
  });
  app2.post("/api/user/entitlements/reconcile", requireAuth, billingReconcileLimiter, async (req, res) => {
    try {
      const state = await reconcileRevenueCatCustomer(
        req.authenticatedUser.id
      );
      return res.json(state);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const status = code === "revenuecat_wrong_account" ? 409 : code === "revenuecat_server_configuration_unavailable" ? 503 : 502;
      return res.status(status).json({
        error: status === 503 ? "billing_configuration_unavailable" : status === 409 ? "billing_wrong_account" : "billing_reconciliation_unavailable"
      });
    }
  });
  app2.delete(
    "/api/user/delete-account",
    accountDeletionIpLimiter,
    requireAuth,
    accountDeletionUserLimiter,
    async (req, res) => {
      const { userId } = req.body;
      const authedUser = req.authenticatedUser;
      if (!userId) {
        return res.status(400).json({ success: false, error: "userId is required." });
      }
      if (authedUser.id !== userId) {
        return res.status(403).json({ success: false, error: "forbidden" });
      }
      try {
        await deleteAccountData(userId);
        return res.json({ success: true });
      } catch (err) {
        logAccountDeletionError(err, "/api/user/delete-account");
        return res.status(500).json({ success: false, error: "delete_failed" });
      }
    }
  );
  function readTemplate(name) {
    return fs.readFileSync(
      path.resolve(process.cwd(), "server", "templates", name),
      "utf-8"
    );
  }
  app2.get("/delete-account", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(readTemplate("delete-account.html"));
  });
  app2.post("/api/delete-account-request", resetLimiter, async (req, res) => {
    const raw = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!isValidEmail(raw)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        readTemplate("delete-account.html").replace(
          'class="error" id="errorMsg">',
          'class="error" id="errorMsg" style="display:block">'
        )
      );
    }
    try {
      await supabaseAnon.auth.signInWithOtp({
        email: raw,
        options: { shouldCreateUser: false }
      });
    } catch {
    }
    const verifyHtml = readTemplate("delete-account-verify.html").replace(/\{\{EMAIL\}\}/g, raw.replace(/"/g, "&quot;").replace(/</g, "&lt;")).replace("{{ERROR_BLOCK}}", "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(verifyHtml);
  });
  app2.get("/delete-account/verify", (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    const verifyHtml = readTemplate("delete-account-verify.html").replace(/\{\{EMAIL\}\}/g, email.replace(/"/g, "&quot;").replace(/</g, "&lt;")).replace("{{ERROR_BLOCK}}", "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(verifyHtml);
  });
  app2.post("/api/delete-account-confirm", accountLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    function renderVerifyError(msg) {
      const errorBlock = `<p class="error-msg">${msg}</p>`;
      const verifyHtml = readTemplate("delete-account-verify.html").replace(/\{\{EMAIL\}\}/g, email.replace(/"/g, "&quot;").replace(/</g, "&lt;")).replace("{{ERROR_BLOCK}}", errorBlock);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(400).send(verifyHtml);
    }
    if (!isValidEmail(email) || !token || !/^\d{6}$/.test(token)) {
      return renderVerifyError("Please enter a valid 6-digit code.");
    }
    const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
      email,
      token,
      type: "email"
    });
    if (verifyErr || !verifyData?.user) {
      return renderVerifyError(
        "The code is incorrect or has expired. Please request a new one."
      );
    }
    const userId = verifyData.user.id;
    try {
      await deleteAccountData(userId);
    } catch (err) {
      logAccountDeletionError(err, "/api/delete-account-confirm");
      const billingQuarantined = isRevenueCatBillingEnabled() && !(err instanceof AccountDeletionError && err.stage === "billing_tombstone");
      const retryPolicy = billingQuarantined ? " Billing access remains quarantined; a retry completes only deletion and never restores billing." : "";
      return renderVerifyError(
        `Account deletion could not be completed. Some data may already have been removed.${retryPolicy} Please request a new code to retry deletion.`
      );
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(readTemplate("delete-account-success.html"));
  });
  const httpServer = createServer(app2);
  return httpServer;
}
function isAuthProviderUnavailable(error) {
  const details = authProviderDetails(error);
  const errorName = error && typeof error === "object" ? error.name : void 0;
  const hasProviderResponse = details.status !== void 0 || details.providerCode !== void 0;
  return details.status === 0 || details.status === 401 || details.status === 403 || details.status === 404 || details.status === 429 || details.status !== void 0 && details.status >= 500 || errorName === "AuthRetryableFetchError" || details.providerCode === "invalid_api_key" || details.providerCode === "provider_disabled" || details.providerCode === "signup_disabled" || error !== null && typeof error === "object" && !hasProviderResponse;
}
function isDuplicateSignupError(error) {
  const providerCode = authProviderDetails(error).providerCode;
  return providerCode === "email_exists" || providerCode === "user_already_exists";
}
function isWeakPasswordError(error) {
  const providerCode = authProviderDetails(error).providerCode;
  return providerCode === "weak_password" || providerCode === "password_too_short" || providerCode === "password_too_long";
}
function authUnavailableResponse(res) {
  return res.status(503).json({
    error: "Authentication is temporarily unavailable. Please try again shortly."
  });
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
import { randomUUID } from "crypto";

// server/noApiCache.ts
var noApiCache = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  next();
};

// server/index.ts
var app = express();
var log = console.log;
function setupSecurityHeaders(app2) {
  app2.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=(), payment=()"
    );
    next();
  });
  app2.use("/api", noApiCache);
  app2.use("/api", (_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    next();
  });
}
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isDevelopment = process.env.NODE_ENV !== "production";
    const isLocalhost = isDevelopment && (origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:"));
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    "/api/billing/revenuecat/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    (req, _res, next) => {
      req.rawBody = req.body;
      next();
    }
  );
  app2.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    const callerRequestId = req.header("x-request-id");
    const requestId = callerRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(callerRequestId) ? callerRequestId : randomUUID();
    res.setHeader("x-request-id", requestId);
    res.locals.requestId = requestId;
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      log(JSON.stringify({
        type: "request",
        requestId,
        method: req.method,
        route: path3,
        status: res.statusCode,
        durationMs: duration
      }));
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      const nativeCallback = req.query.nativeCallback ? String(req.query.nativeCallback) : null;
      const oauthCode = req.query.code ? String(req.query.code) : null;
      if (nativeCallback && oauthCode) {
        const allowedExpHost = process.env.REPLIT_DEV_DOMAIN ?? null;
        const oauthType = req.query.type ? String(req.query.type) : null;
        const targetUrl = buildOAuthRelayUrl(
          nativeCallback,
          oauthCode,
          oauthType,
          allowedExpHost ?? void 0
        );
        if (targetUrl) {
          return res.redirect(302, targetUrl);
        }
      }
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const requestId = res.locals.requestId;
    reportError(err, "http_request", {
      route: req.path,
      status,
      requestId,
      dependency: "server"
    });
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({
      error: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
      requestId
    });
  });
}
(async () => {
  app.set("trust proxy", 1);
  setupSecurityHeaders(app);
  setupCors(app);
  setupRequestLogging(app);
  setupBodyParsing(app);
  await initLockoutStore();
  await initRateLimitStore();
  await initBgRemovalStore();
  const server = await registerRoutes(app);
  configureExpoAndLanding(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
