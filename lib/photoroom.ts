import { fetch } from "expo/fetch";
import { getApiUrl } from "./query-client";

export { resolveClassifyBase64 } from "./classifyPath";

async function attemptRemoveBackground(
  imageBase64: string,
): Promise<{ imageBase64?: string; error?: string } | null> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/remove-background", baseUrl);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
      credentials: "include",
    });

    const data = (await res.json()) as { imageBase64?: string; error?: string };
    return data;
  } catch {
    return null;
  }
}

/**
 * Calls the server-side /api/remove-background endpoint which proxies Photoroom.
 * Returns a base64 PNG string on success, or null on any failure (graceful degradation).
 * Automatically retries once if Photoroom timed out on the first attempt.
 */
export async function removeBackground(imageBase64: string): Promise<string | null> {
  const data = await attemptRemoveBackground(imageBase64);
  if (!data) return null;

  if (data.error === "photoroom_timeout") {
    const retry = await attemptRemoveBackground(imageBase64);
    return retry?.imageBase64 ?? null;
  }

  return data.imageBase64 ?? null;
}
