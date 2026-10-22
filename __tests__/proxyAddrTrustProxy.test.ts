import assert from "node:assert/strict";
import express from "express";
import rateLimit, { type Store } from "express-rate-limit";
import request from "supertest";

const limiterKeys: string[] = [];
const hitCounts = new Map<string, number>();
const store: Store = {
  increment(key) {
    limiterKeys.push(key);
    const totalHits = (hitCounts.get(key) ?? 0) + 1;
    hitCounts.set(key, totalHits);
    return { totalHits, resetTime: new Date(Date.now() + 60_000) };
  },
  decrement() {},
  resetKey(key) {
    hitCounts.delete(key);
  },
};

const app = express();
app.set("trust proxy", 1);
app.use(rateLimit({ windowMs: 60_000, limit: 100, store }));
app.get("/", (req, res) => res.json({ ip: req.ip }));

const cases = [
  { name: "plain IPv4 socket request", headers: {}, expectedIp: "127.0.0.1" },
  {
    name: "forwarded chain uses the nearest client-facing hop",
    headers: { "X-Forwarded-For": "198.51.100.40, 203.0.113.25" },
    expectedIp: "203.0.113.25",
  },
  {
    name: "IPv4-mapped IPv6 forwarded address",
    headers: { "X-Forwarded-For": "::ffff:203.0.113.26" },
    expectedIp: "::ffff:203.0.113.26",
  },
];

async function main(): Promise<void> {
  for (const testCase of cases) {
    const first = await request(app).get("/").set(testCase.headers);
    const firstKey = limiterKeys.at(-1);
    const second = await request(app).get("/").set(testCase.headers);
    const secondKey = limiterKeys.at(-1);

    assert.equal(first.status, 200, `${testCase.name}: first request succeeds`);
    assert.equal(second.status, 200, `${testCase.name}: repeated request succeeds`);
    assert.equal(first.body.ip, testCase.expectedIp, `${testCase.name}: client IP is unchanged`);
    assert.equal(second.body.ip, testCase.expectedIp, `${testCase.name}: repeated client IP is unchanged`);
    assert.ok(firstKey, `${testCase.name}: limiter key is produced`);
    assert.equal(secondKey, firstKey, `${testCase.name}: same client gets a stable limiter key`);
  }

  assert.equal(new Set(limiterKeys.filter((_, index) => index % 2 === 0)).size, cases.length,
    "distinct client IPs produce distinct limiter keys");
  console.log("proxy-addr trust-proxy client-IP and rate-limit-key checks passed");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
