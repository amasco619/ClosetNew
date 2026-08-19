export interface Entitlement {
  isPremium: boolean;
  expiresAt: string | null;
}

export function normalizeEntitlement(value: unknown): Entitlement {
  const data = value as Partial<Entitlement> | null;
  return {
    isPremium: data?.isPremium === true,
    expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : null,
  };
}

export async function fetchAuthoritativeEntitlement(): Promise<Entitlement> {
  const { authenticatedApiRequest } = await import("./query-client");
  const response = await authenticatedApiRequest("GET", "/api/user/entitlements");
  return normalizeEntitlement(await response.json());
}