import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
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
  let token: string | null = null;

  try {
    const { supabase } = await import("./supabase");
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  } catch {
    // If supabase is unavailable (e.g. test environment), proceed without token.
  }

  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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
