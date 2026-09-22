import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import axios from "axios";
import {
  classifyMultiItem,
  validateMultiItemResult,
  type ProviderEnvelope,
  type ProviderItem,
} from "../server/classify-multi-item";
import { registerRoutes, _testOverrides as routeTestOverrides } from "../server/routes";
import { supabaseAdmin } from "../server/supabase";

let passed = 0;
function test(name: string, run: () => void): void {
  try {
    run();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

const classification = (
  subType: string,
  colorFamily: string,
  extra: Record<string, unknown> = {},
) => ({
  category: "top",
  subType,
  colorFamily,
  displayName: `${colorFamily} ${subType}`,
  modelConfidence: 0.9,
  dominantRgb: colorFamily === "red" ? [200, 30, 20] : [20, 30, 200],
  ...extra,
});

const item = (
  detectionId: string,
  x: number,
  y: number,
  subType = "t-shirt",
  colorFamily = "blue",
  extra: Partial<ProviderItem> = {},
): ProviderItem => ({
  detectionId,
  region: { x, y, width: 0.2, height: 0.3 },
  classification: classification(subType, colorFamily),
  ...extra,
});

const twoItems = (): ProviderEnvelope => ({
  items: [
    item("provider-right", 0.6, 0.2, "t-shirt"),
    item("provider-left", 0.1, 0.1, "blouse"),
  ],
  relationship: {
    type: "multi_item",
    confidence: 0.8,
    memberDetectionIds: ["provider-right", "provider-left"],
    sharedAttributes: { colorFamily: "blue" },
  },
});

const threeItems = (): ProviderEnvelope => ({
  items: [
    item("third", 0.65, 0.5, "tank-top"),
    item("first", 0.1, 0.1, "blouse"),
    item("second", 0.55, 0.1, "t-shirt"),
  ],
  relationship: {
    type: "layered",
    confidence: 1,
    memberDetectionIds: ["third", "first", "second"],
  },
});

console.log("\nB1/B2 pure envelope validation:");

test("1. valid two-item envelope", () => {
  const result = validateMultiItemResult(twoItems());
  assert.equal(result?.schemaVersion, "b1b2-v1");
  assert.equal(result?.validation.count, 2);
  assert.equal(result?.relationship.type, "multi_item");
});

test("2. valid three-item envelope", () => {
  const result = validateMultiItemResult(threeItems());
  assert.equal(result?.items.length, 3);
  assert.equal(result?.relationship.memberDetectionIds.length, 3);
});

test("3. malformed envelope rejects", () => {
  assert.equal(validateMultiItemResult(null), null);
  assert.equal(validateMultiItemResult("not-an-object"), null);
});

test("4. missing items rejects", () => {
  assert.equal(validateMultiItemResult({ relationship: twoItems().relationship }), null);
});

test("5. empty items rejects", () => {
  assert.equal(validateMultiItemResult({ ...twoItems(), items: [] }), null);
});

test("6. one item is not a multi-item result", () => {
  assert.equal(validateMultiItemResult({ ...twoItems(), items: [twoItems().items[0]] }), null);
});

test("7. excessive item count rejects", () => {
  const items = Array.from({ length: 7 }, (_, index) =>
    item(`item-${index}`, index * 0.1, index * 0.05, index % 2 ? "blouse" : "t-shirt"),
  );
  assert.equal(validateMultiItemResult({
    items,
    relationship: {
      type: "multi_item",
      confidence: 0.5,
      memberDetectionIds: items.map(entry => entry.detectionId),
    },
  }), null);
});

test("8. duplicate detection identity rejects", () => {
  const envelope = twoItems();
  envelope.items[1] = { ...envelope.items[1], detectionId: envelope.items[0].detectionId };
  assert.equal(validateMultiItemResult(envelope), null);
});

test("9. duplicate canonical region rejects", () => {
  const envelope = twoItems();
  envelope.items[1] = { ...envelope.items[1], region: envelope.items[0].region };
  assert.equal(validateMultiItemResult(envelope), null);
});

test("10. malformed item entry rejects", () => {
  assert.equal(validateMultiItemResult({ ...twoItems(), items: [{ detectionId: "bad" }, twoItems().items[1]] }), null);
});

test("11. invalid category rejects whole envelope", () => {
  const envelope = twoItems();
  envelope.items[1] = { ...envelope.items[1], classification: classification("blouse", "blue", { category: "invalid" }) };
  assert.equal(validateMultiItemResult(envelope), null);
});

test("12. invalid subtype rejects whole envelope", () => {
  const envelope = twoItems();
  envelope.items[1] = { ...envelope.items[1], classification: classification("not-real", "blue") };
  assert.equal(validateMultiItemResult(envelope), null);
});

test("13. invalid colour rejects whole envelope", () => {
  const envelope = twoItems();
  envelope.items[1] = { ...envelope.items[1], classification: classification("blouse", "purple") };
  assert.equal(validateMultiItemResult(envelope), null);
});

test("14. unsupported relationship rejects", () => {
  assert.equal(validateMultiItemResult({
    ...twoItems(),
    relationship: { ...twoItems().relationship!, type: "matching_set" },
  }), null);
});

test("15. invalid relationship confidence rejects", () => {
  for (const confidence of [NaN, Infinity, -0.01, 1.01]) {
    assert.equal(validateMultiItemResult({
      ...twoItems(),
      relationship: { ...twoItems().relationship!, confidence },
    }), null);
  }
});

test("16. missing relationship rejects", () => {
  assert.equal(validateMultiItemResult({ items: twoItems().items }), null);
});

test("17. inconsistent or duplicate member references reject", () => {
  for (const memberDetectionIds of [
    ["provider-left"],
    ["provider-left", "unknown"],
    ["provider-left", "provider-left"],
    ["provider-left", "provider-right", "unknown"],
  ]) {
    assert.equal(validateMultiItemResult({
      ...twoItems(),
      relationship: { ...twoItems().relationship!, memberDetectionIds },
    }), null);
  }
});

test("18. item and relationship ordering is deterministic", () => {
  const first = validateMultiItemResult(twoItems())!;
  const shuffled = twoItems();
  shuffled.items.reverse();
  shuffled.relationship!.memberDetectionIds.reverse();
  const second = validateMultiItemResult(shuffled)!;
  assert.deepEqual(second, first);
  assert.deepEqual(first.items.map(entry => entry.detectionId), ["det-001", "det-002"]);
  assert.deepEqual(first.relationship.memberDetectionIds, ["det-001", "det-002"]);
});

test("19. existing scalar confidence normalization is reused", () => {
  const high = twoItems();
  high.items[0].classification.modelConfidence = 4;
  delete high.items[1].classification.modelConfidence;
  const result = validateMultiItemResult(high)!;
  assert.equal(result.items[1].classification.modelConfidence, 1);
  assert.equal(result.items[0].classification.modelConfidence, 0.7);
});

test("20. successful optional scalar normalization is retained", () => {
  const envelope = twoItems();
  envelope.relationship!.sharedAttributes = undefined;
  envelope.items[0].classification = classification("t-shirt", "blue", {
    fabric: "French lace",
    pattern: "Ankara",
    fit: "tailored",
    sleeveLength: "long",
  });
  const result = validateMultiItemResult(envelope)!;
  const normalized = result.items.find(entry => entry.classification.subType === "t-shirt")!.classification;
  assert.equal(normalized.fabric, "lace");
  assert.equal(normalized.pattern, "wax-print");
  assert.equal(normalized.fit, "tailored");
  assert.equal(normalized.sleeveLength, "long");
});

test("21. one refused or invalid member rejects the whole envelope", () => {
  const refused = twoItems();
  refused.items[0].classification = { refused: true, reason: "not clothing" };
  assert.equal(validateMultiItemResult(refused), null);
});

test("22. distinct garments may share the same normalized classification", () => {
  const envelope = twoItems();
  envelope.relationship!.sharedAttributes = undefined;
  envelope.items[1].classification = { ...envelope.items[0].classification };
  assert.ok(validateMultiItemResult(envelope));
});

test("23. raw provider fields and signed URLs never enter the result", () => {
  const envelope = twoItems() as ProviderEnvelope & Record<string, unknown>;
  envelope.providerRaw = "raw-provider-secret";
  envelope.signedUrl = "https://signed.example/source?token=secret";
  (envelope.items[0] as ProviderItem & Record<string, unknown>).providerRaw = "item-secret";
  (envelope.items[0].region as ProviderItem["region"] & Record<string, unknown>).signedUrl =
    "https://signed.example/region?token=secret";
  envelope.items[0].classification.signedUrl = "https://signed.example/item?token=secret";
  const serialized = JSON.stringify(validateMultiItemResult(envelope));
  assert.ok(!serialized.includes("providerRaw"));
  assert.ok(!serialized.includes("signed.example"));
  assert.ok(!serialized.includes("token="));
});

test("24. shared attributes must agree with every normalized member", () => {
  assert.equal(validateMultiItemResult({
    ...twoItems(),
    relationship: {
      ...twoItems().relationship!,
      sharedAttributes: { colorFamily: "https://signed.example/?token=secret" },
    },
  }), null);
});

console.log("\nB1 HTTP boundary:");

function buildApp(): express.Application {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.post("/api/classify-garments", classifyMultiItem);
  return app;
}

const providerResponse = (envelope: unknown) => ({
  data: {
    candidates: [{
      content: { parts: [{ text: JSON.stringify(envelope) }] },
    }],
  },
});

async function runHttpTests(): Promise<void> {
  const savedPost = axios.post;
  const savedKey = process.env.GEMINI_API_KEY;
  const savedFlag = process.env.MULTI_ITEM_CLASSIFIER_ENABLED;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.MULTI_ITEM_CLASSIFIER_ENABLED;

  try {
    axios.post = (async () => providerResponse(twoItems())) as typeof axios.post;
    let response = await request(buildApp())
      .post("/api/classify-garments")
      .send({ imageBase64: "dGVzdA==" });
    assert.equal(response.status, 200);
    assert.equal(response.body.schemaVersion, "b1b2-v1");
    console.log("  ✓ 25. default-enabled endpoint returns validated envelope");

    let providerCalls = 0;
    process.env.MULTI_ITEM_CLASSIFIER_ENABLED = "false";
    axios.post = (async () => { providerCalls++; return providerResponse(twoItems()); }) as typeof axios.post;
    response = await request(buildApp()).post("/api/classify-garments").send({ imageBase64: "dGVzdA==" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "feature_disabled");
    assert.equal(providerCalls, 0);
    console.log("  ✓ 26. feature can be disabled independently before provider I/O");
    delete process.env.MULTI_ITEM_CLASSIFIER_ENABLED;

    for (const body of [{}, { imageUrl: "https://signed.example/x" }, { imageBase64: "x", extra: true }]) {
      response = await request(buildApp()).post("/api/classify-garments").send(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "invalid_request");
    }
    console.log("  ✓ 27. request accepts only exact imageBase64 input");

    const rawSecret = "raw-provider-response-secret";
    axios.post = (async () => ({
      data: { candidates: [{ content: { parts: [{ text: rawSecret }] } }] },
    })) as typeof axios.post;
    response = await request(buildApp()).post("/api/classify-garments").send({ imageBase64: "x" });
    assert.equal(response.status, 502);
    assert.equal(response.body.error, "classifier_malformed_response");
    assert.ok(!JSON.stringify(response.body).includes(rawSecret));
    console.log("  ✓ 28. malformed provider response is safely classified");

    let calls = 0;
    axios.post = (async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("quota secret"), {
        isAxiosError: true,
        response: { status: 429, data: { detail: "quota secret" } },
      });
      return providerResponse(twoItems());
    }) as typeof axios.post;
    response = await request(buildApp()).post("/api/classify-garments").send({ imageBase64: "x" });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    console.log("  ✓ 29. first-model 429 preserves two-model fallback");

    const failures = [
      [{ code: "ECONNABORTED", message: "timeout secret" }, 504, "classifier_timeout"],
      [{ isAxiosError: true, message: "network secret" }, 503, "classifier_network_failure"],
      [{ isAxiosError: true, response: { status: 503, data: "upstream secret" } }, 502, "classifier_upstream_failure"],
      [{ isAxiosError: true, response: { status: 400, data: "unexpected secret" } }, 500, "classification_failed"],
    ] as const;
    for (const [failure, status, code] of failures) {
      const message = "message" in failure ? failure.message : "provider secret";
      axios.post = (async () => { throw Object.assign(new Error(message), failure); }) as typeof axios.post;
      response = await request(buildApp()).post("/api/classify-garments").send({ imageBase64: "x" });
      assert.equal(response.status, status);
      assert.equal(response.body.error, code);
      assert.ok(!JSON.stringify(response.body).includes("secret"));
    }
    console.log("  ✓ 30. timeout/network/upstream/unexpected errors are safe and stable");

    calls = 0;
    axios.post = (async () => {
      calls++;
      throw Object.assign(new Error("all quota secret"), {
        isAxiosError: true,
        response: { status: 429, data: "all quota secret" },
      });
    }) as typeof axios.post;
    response = await request(buildApp()).post("/api/classify-garments").send({ imageBase64: "x" });
    assert.equal(response.status, 429);
    assert.equal(response.body.error, "rate_limited");
    assert.equal(calls, 2);
    assert.ok(!JSON.stringify(response.body).includes("secret"));
    console.log("  ✓ 31. exhausted two-model fallback returns safe rate_limited");

    const root = path.resolve(__dirname, "..");
    const moduleSource = fs.readFileSync(path.join(root, "server/classify-multi-item.ts"), "utf8");
    const routeSource = fs.readFileSync(path.join(root, "server/routes.ts"), "utf8");
    assert.ok(!/from [\"'].*(?:database|storage|supabase)/.test(moduleSource));
    assert.ok(!/createGarmentGroup|create_garment_group|operationId/.test(moduleSource));
    assert.ok(routeSource.includes('app.post("/api/classify-garment", aiLimiter, requireAuth, withAiLimit(classifyGarment))'));
    assert.ok(routeSource.includes('app.post("/api/classify-garments", aiLimiter, requireAuth, withAiLimit(classifyMultiItem))'));
    console.log("  ✓ 32. no DB/Storage/group dependency; legacy route unchanged; new route protected");

    const registeredApp = express();
    registeredApp.use(express.json({ limit: "10mb" }));
    await registerRoutes(registeredApp);
    providerCalls = 0;
    axios.post = (async () => {
      providerCalls++;
      return providerResponse(twoItems());
    }) as typeof axios.post;

    delete routeTestOverrides.authenticatedUser;
    response = await request(registeredApp)
      .post("/api/classify-garments")
      .send({ imageBase64: "x" });
    assert.equal(response.status, 401);
    assert.equal(providerCalls, 0);

    let forbiddenCalls = 0;
    const originalFrom = supabaseAdmin.from;
    const originalStorageFrom = supabaseAdmin.storage.from;
    const originalRpc = supabaseAdmin.rpc;
    Reflect.set(supabaseAdmin, "from", () => {
      forbiddenCalls++;
      throw new Error("database call forbidden");
    });
    Reflect.set(supabaseAdmin.storage, "from", () => {
      forbiddenCalls++;
      throw new Error("storage call forbidden");
    });
    Reflect.set(supabaseAdmin, "rpc", () => {
      forbiddenCalls++;
      throw new Error("group RPC call forbidden");
    });
    routeTestOverrides.authenticatedUser = { id: "b1b2-test-user" };
    try {
      response = await request(registeredApp)
        .post("/api/classify-garments")
        .send({ imageBase64: "x" });
      assert.equal(response.status, 200);
      assert.equal(providerCalls, 1);
      assert.equal(forbiddenCalls, 0);
    } finally {
      delete routeTestOverrides.authenticatedUser;
      Reflect.set(supabaseAdmin, "from", originalFrom);
      Reflect.set(supabaseAdmin.storage, "from", originalStorageFrom);
      Reflect.set(supabaseAdmin, "rpc", originalRpc);
    }
    console.log("  ✓ 33. real route rejects unauthenticated calls and performs no DB/Storage/group RPC");
  } finally {
    axios.post = savedPost;
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
    if (savedFlag === undefined) delete process.env.MULTI_ITEM_CLASSIFIER_ENABLED;
    else process.env.MULTI_ITEM_CLASSIFIER_ENABLED = savedFlag;
  }
}

runHttpTests()
  .then(() => {
    console.log(`\nclassifyMultiItem: ${passed + 9} focused checks passed`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });