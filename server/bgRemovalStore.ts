import { Pool } from "pg";
import crypto from "crypto";

const CACHE_MAX = 200;
const inMemCache = new Map<string, string>();

function putInMem(hash: string, base64: string): void {
  if (inMemCache.size >= CACHE_MAX) {
    const oldest = inMemCache.keys().next().value;
    if (oldest) inMemCache.delete(oldest);
  }
  inMemCache.set(hash, base64);
}

let _pool: Pool | null | undefined = undefined;

function getPool(): Pool | null {
  if (_pool !== undefined) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) { _pool = null; return null; }
  try {
    _pool = new Pool({ connectionString: url });
    return _pool;
  } catch (err) {
    console.error("[bgRemovalStore] failed to create pool:", err);
    _pool = null;
    return null;
  }
}

export function computeImageHash(imageBase64: string): string {
  return crypto.createHash("sha256").update(imageBase64).digest("hex");
}

export async function initBgRemovalStore(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    console.warn("[bgRemovalStore] DATABASE_URL not set — in-memory cache only");
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bg_removal_cache (
        image_hash  TEXT        PRIMARY KEY,
        result_b64  TEXT        NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bg_removal_usage (
        user_id      UUID        PRIMARY KEY,
        count        INT         NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("[bgRemovalStore] tables ready");

    // NM-2: prune stale cache entries once at startup and then every 24 h so
    // the bg_removal_cache table cannot grow without bound.
    await pruneBgRemovalCache(pool);
    setInterval(() => pruneBgRemovalCache(pool!), 24 * 60 * 60 * 1000);
  } catch (err) {
    console.error("[bgRemovalStore] table init failed:", err);
  }
}

async function pruneBgRemovalCache(pool: Pool): Promise<void> {
  try {
    const result = await pool.query(
      `DELETE FROM bg_removal_cache WHERE created_at < NOW() - INTERVAL '30 days'`
    );
    const removed = result.rowCount ?? 0;
    if (removed > 0) {
      console.log(`[bgRemovalStore] pruned ${removed} stale cache entries`);
    }
  } catch (err) {
    console.error("[bgRemovalStore] prune failed:", err);
  }
}

export async function checkCacheByHash(hash: string): Promise<string | null> {
  const mem = inMemCache.get(hash);
  if (mem) return mem;
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{ result_b64: string }>(
      "SELECT result_b64 FROM bg_removal_cache WHERE image_hash = $1",
      [hash],
    );
    if (rows.length > 0) {
      putInMem(hash, rows[0].result_b64);
      return rows[0].result_b64;
    }
  } catch (err) {
    console.error("[bgRemovalStore] cache lookup failed:", err);
  }
  return null;
}

export async function storeCacheResult(hash: string, base64: string): Promise<void> {
  putInMem(hash, base64);
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO bg_removal_cache (image_hash, result_b64)
       VALUES ($1, $2)
       ON CONFLICT (image_hash) DO NOTHING`,
      [hash, base64],
    );
  } catch (err) {
    console.error("[bgRemovalStore] cache store failed:", err);
  }
}

export async function getUserBgRemovalCount(userId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const { rows } = await pool.query<{ count: number }>(
      "SELECT count FROM bg_removal_usage WHERE user_id = $1",
      [userId],
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  } catch {
    return 0;
  }
}

export async function incrementUserBgRemovalCount(userId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const { rows } = await pool.query<{ count: number }>(
      `INSERT INTO bg_removal_usage (user_id, count, last_used_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET count        = bg_removal_usage.count + 1,
             last_used_at = NOW()
       RETURNING count`,
      [userId],
    );
    return rows.length > 0 ? Number(rows[0].count) : 0;
  } catch (err) {
    console.error("[bgRemovalStore] increment failed:", err);
    return 0;
  }
}

export async function getUserBgRemovalStatus(
  userId: string,
  freeLimit: number,
): Promise<{ allowed: boolean; count: number; remaining: number }> {
  const count = await getUserBgRemovalCount(userId);
  const remaining = Math.max(0, freeLimit - count);
  return { allowed: count < freeLimit, count, remaining };
}
