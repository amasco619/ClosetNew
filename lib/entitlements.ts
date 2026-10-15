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

export async function readCurrentEntitlement(
  read: () => Promise<Entitlement>,
  isCurrent: () => boolean,
  rejectUnavailable: boolean,
  onUnavailable: (error: unknown) => void,
): Promise<Entitlement | null> {
  const unavailable = () => {
    if (rejectUnavailable) throw new Error("Premium verification is unavailable or superseded");
    return null;
  };

  try {
    const entitlement = await read();
    return isCurrent() ? entitlement : unavailable();
  } catch (error) {
    if (!isCurrent()) return unavailable();
    onUnavailable(error);
    if (rejectUnavailable) throw error;
    return null;
  }
}