import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

export const API_REQUEST_TIMEOUT_MS = 15_000;
// Gemini may make one 20s attempt per model when the primary returns 429.
// Keep other API calls at 15s; classification still has a finite deadline.
export const CLASSIFICATION_REQUEST_TIMEOUT_MS = 45_000;

export type ApiErrorKind = "timeout" | "abort" | "network" | "non_json" | "client" | "server";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type AuthClient = {
  getSession(): Promise<{ data: { session: { access_token?: string } | null } }>;
  refreshSession(): Promise<{ data: { session: { access_token?: string } | null }; error?: unknown }>;
};

export const _testOverrides: { auth?: AuthClient; fetch?: typeof fetch } = {};

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let rejectTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) =>
      rejectTimer = setTimeout(() => reject(new ApiRequestError("Request timed out.", "timeout")), timeoutMs),
    );
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (timedOut || (error instanceof Error && error.name === "AbortError")) {
      throw new ApiRequestError("Request timed out.", timedOut ? "timeout" : "abort");
    }
    if (error instanceof TypeError || (error instanceof Error && /network|fetch|offline/i.test(error.message))) {
      throw new ApiRequestError("Network connection failed.", "network");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (rejectTimer) clearTimeout(rejectTimer);
  }
}

export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    const detail = text || res.statusText || "Request failed.";
    let code: string | undefined;
    let retryAfter: number | undefined;
    try {
      const body = JSON.parse(text) as { code?: unknown; retryAfter?: unknown };
      if (typeof body?.code === "string") code = body.code;
      if (typeof body?.retryAfter === "number" && Number.isFinite(body.retryAfter)) {
        retryAfter = Math.max(1, Math.ceil(body.retryAfter));
      }
    } catch {
      // Keep the original response text as the error message when it is not JSON.
    }
    if (retryAfter === undefined) {
      const header = Number(res.headers.get("Retry-After"));
      if (Number.isFinite(header) && header > 0) retryAfter = Math.ceil(header);
    }
    throw new ApiRequestError(
      `${res.status}: ${detail}`,
      res.status >= 500 ? "server" : "client",
      res.status,
      code,
      retryAfter,
    );
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  return withDeadline(async (signal) => {
    const res = await fetch(url.toString(), {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal,
    });
    await throwIfResNotOk(res);
    return res;
  });
}

/**
 * Like apiRequest but automatically attaches the authenticated user's Bearer
 * token from the active Supabase session.
 *
 * Use this for any endpoint that requires the caller to be authenticated
 * (e.g. /api/classify-garment, /api/user/delete-account).
 *
 * Supabase is imported dynamically so this module remains importable in Node.js
 * test environments without pulling in the React Native dependency graph.
 *
 * If there is no active session the request is still made without a token;
 * the server will respond 401 and throwIfResNotOk will surface the error.
 */
export async function authenticatedApiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const isClassificationRoute = route === "/api/classify-garment" || route === "/api/classify-garments";
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  return withDeadline(async (signal) => {
    let token: string | null = null;
    let auth: AuthClient | undefined;
    try {
      auth = _testOverrides.auth ?? (await import("./supabase")).supabase.auth;
      const { data: { session } } = await auth.getSession();
      token = session?.access_token ?? null;
    } catch (error) {
      // If supabase is unavailable (e.g. test environment), proceed without token.
      if (error instanceof ApiRequestError) throw error;
    }
    const send = (accessToken: string | null) => {
      const headers: Record<string, string> = {};
      if (data) headers["Content-Type"] = "application/json";
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      return (_testOverrides.fetch ?? fetch)(url.toString(), {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
        signal,
      });
    };
    let res = await send(token);
    if (isClassificationRoute && res.status === 401 && auth) {
      try {
        const refreshed = await auth.refreshSession();
        const refreshedToken = refreshed.error ? null : refreshed.data.session?.access_token ?? null;
        if (refreshedToken) res = await send(refreshedToken);
      } catch {
        // The original 401 remains authoritative if the session cannot refresh.
      }
    }
    await throwIfResNotOk(res);
    return res;
  }, isClassificationRoute
    ? CLASSIFICATION_REQUEST_TIMEOUT_MS : API_REQUEST_TIMEOUT_MS);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await withDeadline((signal) => fetch(url.toString(), {
      credentials: "include",
      signal,
    }));

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    try {
      return await res.json();
    } catch {
      throw new ApiRequestError("Response was not valid JSON.", "non_json", res.status);
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
