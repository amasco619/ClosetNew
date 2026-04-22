import type { Request, Response } from "express";
import axios from "axios";

/**
 * Extract perceptual colour values (HSL + Lab) from an image — used by the
 * one-shot legacy-item migration so existing wardrobe items can opt into the
 * perceptual scoring layer without being re-uploaded.
 *
 * This endpoint deliberately avoids LABEL_DETECTION / OBJECT_LOCALIZATION to
 * keep migration cost low; it only requests IMAGE_PROPERTIES, then picks the
 * dominant pixel that matches the item's stored colour family.
 */

function rgbToHsl(r: number, g: number, b: number) {
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

function rgbToLab(r: number, g: number, b: number) {
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

// Trimmed-down version of the family classifier used in classify-garment.ts.
// Mirrors the same hue/saturation/lightness rules so migration values agree
// with the values the upload pipeline would produce.
function rgbToColorFamily(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.15) {
    if (lightness > 0.85) return "white";
    if (lightness > 0.65) return "grey";
    if (lightness > 0.30) return "grey";
    return "black";
  }
  let hue = 0;
  if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
  else hue = 60 * ((r - g) / (max - min) + 4);
  if (hue < 0) hue += 360;
  if (hue < 15)  return lightness < 0.30 ? "burgundy" : "red";
  if (hue < 35)  return lightness < 0.40 ? "brown" : "orange";
  if (hue < 50)  return lightness < 0.45 ? "camel" : "beige";
  if (hue < 65)  return "yellow";
  if (hue < 85)  return lightness < 0.40 ? "olive" : "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "green";
  if (hue < 255) return lightness < 0.30 ? "navy" : "blue";
  if (hue < 290) return "lavender";
  if (hue < 330) return lightness < 0.35 ? "burgundy" : "pink";
  return "red";
}

export async function extractColor(req: Request, res: Response) {
  try {
    const { imageBase64, colorFamily } = req.body as {
      imageBase64?: string;
      colorFamily?: string;
    };
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });
    // Cost/abuse cap: reject payloads larger than ~6 MB of base64 (~4.5 MB raw).
    // Legitimate compressed phone photos sit well under this.
    if (imageBase64.length > 6_000_000) {
      return res.status(413).json({ error: "image_too_large" });
    }

    const apiKey = process.env.GCV_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "missing_gcv_api_key" });

    const visionRes = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "IMAGE_PROPERTIES" }],
        }],
      },
    );

    const dominantColors: Array<{
      color: { red: number; green: number; blue: number };
      pixelFraction: number;
    }> = visionRes.data.responses?.[0]?.imagePropertiesAnnotation?.dominantColors?.colors ?? [];

    if (dominantColors.length === 0) return res.status(422).json({ error: "no_colours_detected" });

    const sorted = [...dominantColors].sort((a, b) => b.pixelFraction - a.pixelFraction);

    // Prefer the dominant pixel whose family matches the stored colorFamily;
    // if no pixel matches (or no family supplied), fall back to the first
    // non-near-white pixel — the same fallback the upload pipeline uses.
    let chosen: { red: number; green: number; blue: number } | null = null;
    if (colorFamily) {
      for (const entry of sorted) {
        const { red: r, green: g, blue: b } = entry.color;
        const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
        if (colorFamily !== 'white' && lightness > 0.90) continue;
        if (rgbToColorFamily(r, g, b) === colorFamily) { chosen = entry.color; break; }
      }
    }
    if (!chosen) {
      for (const entry of sorted) {
        const { red: r, green: g, blue: b } = entry.color;
        const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
        if (lightness > 0.90) continue;
        chosen = entry.color; break;
      }
    }
    if (!chosen) chosen = sorted[0].color;

    return res.json({
      dominantHsl: rgbToHsl(chosen.red, chosen.green, chosen.blue),
      dominantLab: rgbToLab(chosen.red, chosen.green, chosen.blue),
    });
  } catch (err: any) {
    console.error("extract-color error", err.response?.data || err.message);
    return res.status(500).json({ error: "extract_failed" });
  }
}
