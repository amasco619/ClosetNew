import type { Request, Response } from "express";

const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";

export async function removeBackground(req: Request, res: Response) {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "background_removal_unavailable" });
  }

  const { imageBase64 } = req.body as { imageBase64?: string };
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 is required" });
  }

  try {
    const buffer = Buffer.from(imageBase64, "base64");

    const form = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    form.append("image_file", blob, "garment.jpg");

    const response = await fetch(PHOTOROOM_SEGMENT_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      console.error("[remove-background] Photoroom error:", response.status, errText);
      return res.status(502).json({ error: "photoroom_error", status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      console.error("[remove-background] Photoroom returned an empty body (0 bytes)");
      return res.status(502).json({ error: "photoroom_empty_response" });
    }
    const resultBase64 = Buffer.from(arrayBuffer).toString("base64");

    return res.json({ imageBase64: resultBase64, mimeType: "image/png" });
  } catch (err: any) {
    console.error("[remove-background] Unexpected error:", err?.message);
    return res.status(502).json({ error: "background_removal_failed" });
  }
}
