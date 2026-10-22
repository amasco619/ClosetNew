/** Per-fixture counters and lockouts; never imports an application Supabase client. */
export function makeSecurityStoreFixture() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Run security fixtures via npm test; test overrides must never fall through in another environment");
  }
  const counters = new Map<string, { hits: number; resetTime: number }>();
  const lockouts = new Map<string, { key: string; value: string; expires: number }>();
  return {
    counters,
    client: {
      rpc: async (name: string, args: any) => {
        const now = Date.now();
        const prior = counters.get(args.p_key);
        if (name === "ratelimit_increment") {
          const row = !prior || now >= prior.resetTime
            ? { hits: 1, resetTime: now + args.p_window_ms }
            : { hits: prior.hits + 1, resetTime: prior.resetTime };
          counters.set(args.p_key, row);
          return { data: [{ hits: row.hits, reset_time_ms: row.resetTime }], error: null };
        }
        if (name === "ratelimit_decrement") {
          if (prior && now < prior.resetTime) prior.hits = Math.max(0, prior.hits - 1);
        } else if (name === "ratelimit_delete_key") {
          counters.delete(args.p_key);
        } else if (name === "ratelimit_delete_prefix") {
          if (args.p_prefix) {
            for (const key of counters.keys()) if (key.startsWith(args.p_prefix)) counters.delete(key);
          }
        } else {
          throw new Error(`Unexpected security fixture RPC: ${name}`);
        }
        return { data: null, error: null };
      },
      from: (table: string) => {
        if (table !== "lockout_store") throw new Error(`Unexpected fixture table: ${table}`);
        return {
          upsert: async (row: { key: string; value: string; expires: number }) => {
            lockouts.set(row.key, row);
            return { error: null };
          },
          delete: () => ({
            eq: async (_column: string, key: string) => {
              lockouts.delete(key);
              return { error: null };
            },
          }),
          select: () => ({
            like: async () => ({ data: [...lockouts.values()], error: null }),
          }),
        };
      },
    } as any,
  };
}
