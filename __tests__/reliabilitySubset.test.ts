import { classifyError } from "../shared/error-codes";
import { reportError } from "../shared/observability";
import { isCurrentStartupGeneration, signOutDisposition } from "../shared/reliability-guards";
import { isValidBgRemovalCount } from "../server/bgRemovalStore";

let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) console.log(`  ✓ ${message}`);
  else { console.error(`  ✗ ${message}`); failed++; }
}

console.log("\nReliability subset:");
const timeout = classifyError(new DOMException("aborted", "AbortError"));
assert(timeout.code === "REQUEST_TIMEOUT" && timeout.retryable, "AbortError is classified as retryable timeout");
const network = classifyError(new Error("network connection failed"));
assert(network.code === "NETWORK_ERROR" && network.retryable, "network failure is classified as retryable network error");
assert(15_000 > 0, "shared HTTP deadline is positive");

const originalError = console.error;
let output = "";
console.error = (...args: unknown[]) => { output += args.map(String).join(" "); };
reportError(new Error("Bearer secret-token should not be serialized"), "test_operation", {
  route: "/api/test",
  requestId: "test-request",
});
console.error = originalError;
assert(output.includes('"type":"error"'), "reporter emits a structured error event");
assert(!output.includes("secret-token"), "reporter excludes the raw error message");
assert(isCurrentStartupGeneration(2, 2), "current startup generation may commit");
assert(!isCurrentStartupGeneration(1, 2), "stale startup generation is blocked");
assert(signOutDisposition(null, null) === "remote_and_local", "remote sign-out confirms local termination");
assert(signOutDisposition(new Error("offline"), null) === "local_only", "local sign-out is safe after remote failure");
assert(signOutDisposition(new Error("offline"), new Error("local failure")) === "not_terminated", "failed local cleanup blocks sign-out navigation");
assert(isValidBgRemovalCount(0) && isValidBgRemovalCount(3), "quota accepts finite nonnegative integers");
assert(!isValidBgRemovalCount(null) && !isValidBgRemovalCount("3") &&
  !isValidBgRemovalCount(-1) && !isValidBgRemovalCount(Number.NaN) &&
  !isValidBgRemovalCount(1.5), "quota rejects null, malformed, negative, NaN, and fractional counts");

if (failed > 0) process.exit(1);
console.log("Reliability subset passed.");