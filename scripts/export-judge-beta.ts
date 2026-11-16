import { createHmac, randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface ReviewReceipt {
  id: string; user_id: string; created_at: string; payload_text: string;
  model_verdict: string; final_verdict: string; floor_rules: string[];
  thumbs: string | null; reason_chip: string | null; model_served: string | null; prompt_hash: string;
}
/** Rolling window anchored at the first delivered receipt, not wall-clock buckets. */
export function deduplicateReceipts(rows: ReviewReceipt[]): ReviewReceipt[] {
  const anchors = new Map<string, { start: number; row: ReviewReceipt }>();
  const result: ReviewReceipt[] = [];
  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const key = JSON.stringify([row.user_id, row.payload_text, row.final_verdict]);
    const previous = anchors.get(key);
    const time = Date.parse(row.created_at);
    if (previous && time - previous.start < 60_000) {
      // For a down-only export preserve the latest feedback metadata.
      if (row.thumbs === "down") Object.assign(previous.row, row);
      continue;
    }
    const copy = { ...row };
    anchors.set(key, { start: time, row: copy }); result.push(copy);
  }
  return result;
}
export function anonymousGroup(userId: string, secret: string): string {
  if (!secret) throw new Error("Missing export grouping secret");
  return createHmac("sha256", secret).update(`judge-beta-v1:${userId}`).digest("hex");
}
const columns = ["anonymous_group", "created_at", "payload_text", "model_verdict", "final_verdict",
  "floor_rules", "reason_chip", "model_served", "prompt_hash"] as const;
export function reviewCsv(rows: ReviewReceipt[], secret: string): string {
  const quote = (value: string) => {
    // Spreadsheet formula protection; exported payload remains verbatim for normal model inputs.
    const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return columns.join(",") + "\n" + rows.map(row => columns.map(column => quote(
    column === "anonymous_group" ? anonymousGroup(row.user_id, secret)
      : column === "floor_rules" ? row.floor_rules.join("|") : String(row[column] ?? ""),
  )).join(",")).join("\n") + "\n";
}

async function main() {
  const since = process.argv.find(value => value.startsWith("--since="))?.slice(8);
  const n = Number(process.argv.find(value => value.startsWith("--n="))?.slice(4) ?? 20);
  if (!since || !Number.isFinite(Date.parse(since)) || !Number.isSafeInteger(n) || n < 1) {
    throw new Error("Usage: tsx scripts/export-judge-beta.ts --since=ISO_DATE [--n=20]");
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing export grouping secret");
  if (process.env.NODE_ENV === "test") throw new Error("Live review export blocked in tests");
  const { supabaseAdmin } = await import("../server/supabase");
  const rows: ReviewReceipt[] = [];
  // Include one minute before since to avoid counting a cache repeat as a new receipt.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from("check_look_feedback").select(
      "id,user_id,created_at,payload_text,model_verdict,final_verdict,floor_rules,thumbs,reason_chip,model_served,prompt_hash",
    ).gte("created_at", new Date(Date.parse(since) - 60_000).toISOString())
      .order("created_at").order("id").range(offset, offset + 999);
    if (error || !data) throw new Error("Review export unavailable");
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const unique = deduplicateReceipts(rows).filter(row => Date.parse(row.created_at) >= Date.parse(since));
  const down = unique.filter(row => row.thumbs === "down");
  const works = unique.filter(row => row.final_verdict === "Works");
  for (let i = works.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [works[i], works[j]] = [works[j], works[i]];
  }
  const out = "docs/reports/judge-beta";
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/thumbs-down.csv`, reviewCsv(down, secret), { mode: 0o600 });
  writeFileSync(`${out}/works-sample.csv`, reviewCsv(works.slice(0, n), secret), { mode: 0o600 });
  console.log(JSON.stringify({ down: down.length, worksSample: Math.min(n, works.length) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Review export failed; check configuration and access."); process.exitCode = 1; });
}
