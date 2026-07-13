import { apiRequest } from "./query-client";

export { resolveClassifyBase64 } from "./classifyPath";

/**
 * Calls the server-side /api/remove-background endpoint which proxies Photoroom.
 * Returns a base64 PNG string on success, or null on any failure (graceful degradation).
 */
export async function removeBackground(imageBase64: string): Promise<string | null> {
  try {
    const res = await apiRequest("POST", "/api/remove-background", { imageBase64 });
    const data = await res.json() as { imageBase64?: string };
    return data.imageBase64 ?? null;
  } catch {
    return null;
  }
}
