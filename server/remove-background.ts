import type { Request, Response } from "express";
import { PHOTOROOM_TIMEOUT_ERROR } from "../shared/photoroom-error-codes";

const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const PHOTOROOM_TIMEOUT_MS = 15_000;

// Log key presence once at module load so the server startup log makes the
// 503-vs-200 contract explicit. A missing key returns HTTP 503 (service
// unavailable), never HTTP 404 — the route is always registered.
if (process.env.PHOTOROOM_API_KEY) {
  console.log("[remove-background] PHOTOROOM_API_KEY is set — background removal enabled");
} else {
  console.warn("[remove-background] PHOTOROOM_API_KEY not set — /api/remove-background will return 503");
}

export async function removeBackground(req: Request, res: Response) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "background_removal_unavailable" });
  }

  const { imageBase64 } = req.body as { imageBase64?: string };
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 is required" });
  }

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
      signal: controller.signal,
    });

    if (!fetchResponse.ok) {
      clearTimeout(timeoutId);
      const errText = await fetchResponse.text().catch(() => fetchResponse.statusText);
      console.error("[remove-background] Photoroom error:", fetchResponse.status, errText);
      return res.status(502).json({ error: "photoroom_error", status: fetchResponse.status });
    }

    const arrayBuffer = await fetchResponse.arrayBuffer();
    clearTimeout(timeoutId);

    if (arrayBuffer.byteLength === 0) {
      console.error("[remove-background] Photoroom returned an empty body (0 bytes)");
      return res.status(502).json({ error: "photoroom_empty_response" });
    }
    const resultBuf = Buffer.from(arrayBuffer);
    const isPng =
      resultBuf.length >= 4 &&
      resultBuf[0] === 0x89 &&
      resultBuf[1] === 0x50 &&
      resultBuf[2] === 0x4e &&
      resultBuf[3] === 0x47;
    if (!isPng) {
      console.error(
        "[remove-background] Photoroom response is not a valid PNG (byteLength=%d)",
        arrayBuffer.byteLength,
      );
      return res.status(502).json({ error: "photoroom_invalid_response" });
    }
    if (arrayBuffer.byteLength < 1024) {
      console.error(
        "[remove-background] Photoroom response is too small to be a valid image (byteLength=%d)",
        arrayBuffer.byteLength,
      );
      return res.status(502).json({ error: "photoroom_invalid_response" });
    }
    const resultBase64 = resultBuf.toString("base64");

    return res.json({ imageBase64: resultBase64, mimeType: "image/png" });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      console.error("[remove-background] Photoroom request timed out after %dms", PHOTOROOM_TIMEOUT_MS);
      return res.status(502).json({ error: PHOTOROOM_TIMEOUT_ERROR });
    }
    console.error("[remove-background] Unexpected error:", err?.message);
    return res.status(502).json({ error: "background_removal_failed" });
  }
}
