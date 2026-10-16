import assert from "node:assert/strict";
import express from "express";
import { noApiCache } from "../server/noApiCache";

async function main() {
  const app = express();
  app.use("/api", noApiCache);
  app.get("/api/user/entitlements", (_req, res) => {
    res.json({ isPremium: true, expiresAt: null });
  });

  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/user/entitlements`, {
      headers: { "If-None-Match": "*" },
    });

    assert.equal(response.status, 200, "conditional requests still receive the authoritative JSON body");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { isPremium: true, expiresAt: null });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }

  console.log("API response cache policy prevents unusable 304 responses.");
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
