import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import {
  evaluate,
  localHandlerProvider,
  preflight,
  runClassification,
  signTestRunAttestation,
  signTestSeal,
  verifyTestSeal,
} from "../scripts/privateRealPhotoEvaluation";
import { CLASSIFIER_MODELS, GEMINI_PROMPT } from "../server/classify-garment";

type TestPng = { width: number; height: number; data: Buffer };
type TestPngCodec = {
  new(options: { width: number; height: number }): TestPng;
  sync: { write(image: TestPng): Buffer };
};
const { PNG } = require("pngjs") as { PNG: TestPngCodec };

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function caseRow(id: string, hash: string, split: string) {
  return {
    caseId: id,
    split,
    image: { path: `images/${id}.jpg`, sha256: hash, mimeType: "image/jpeg" },
    rights: {
      licenseName: "test-only rights fixture",
      consentReference: "test-only consent record",
      internalEvaluation: "approved",
      classifierProcessing: "approved",
    },
    provenance: {
      sourceType: "real-photo",
      sourceReference: `ephemeral ${id}`,
      verifiedBy: "test",
      verifiedDate: "2026-01-01",
    },
    privacy: { identifiable: "no" },
    captureConditions: "neutral backdrop and daylight",
  };
}

function goldCase(row: ReturnType<typeof caseRow>) {
  const refusal = ["KENTE-03", "KENTE-04", "KENTE-09"].includes(row.caseId);
  const subType = ({ "KENTE-05": "sash", "KENTE-06": "scarf", "KENTE-07": "wrapper" } as Record<string, string>)[row.caseId] ?? "stole";
  return {
    caseId: row.caseId,
    inputSha256: row.image.sha256,
    provenanceSha256: sha256(JSON.stringify(row.provenance)),
    adjudication: { status: "accepted", adjudicatorReference: "offline test adjudicator", decisionReference: "test decision" },
    reviewContext: {
      description: "private reviewer-only test fixture",
      culturalContext: "reviewer-only",
      relationship: "single item",
      boxes: [{ item: "item", x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
    },
    expected: {
      outcome: refusal ? "refusal" : "classified",
      ...(!refusal ? {
        itemType: subType,
        material: "cotton",
        wearPositionProviderAssertion: "not persisted",
        legacyFit: "unavailable",
      } : {}),
    },
    goldToCurrentOutput: {
      outcome: { status: "supported", currentField: "outcome" },
      ...(!refusal ? {
        itemType: { status: "supported", currentField: "subType" },
        material: { status: "supported", currentField: "fabric" },
        wearPositionProviderAssertion: { status: "unsupported", reason: "Transient provider assertion is not persisted." },
        legacyFit: { status: "unrepresentable", reason: "The current output has no legacy fit field." },
      } : {}),
    },
  };
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), "private-photo-eval-test-"));
  const originalPost = axios.post;
  const priorApiKey = process.env.GEMINI_API_KEY;
  try {
    await mkdir(path.join(root, "images"));
    const fixtureBytes = new Map<string, Buffer>();
    const rows: ReturnType<typeof caseRow>[] = [];
    for (let index = 1; index <= 9; index++) {
      const id = `KENTE-${String(index).padStart(2, "0")}`;
      const bytes = Buffer.from(`temporary test bytes ${index}, not a photo`);
      fixtureBytes.set(id, bytes);
      await writeFile(path.join(root, `images/${id}.jpg`), bytes);
      rows.push(caseRow(id, sha256(bytes), index === 8 ? "test" : "validation"));
    }
    const manifest = {
      schemaVersion: "private-real-photo-v1",
      dataset: { status: "rights-cleared", owner: "test", approvalReference: "test-only" },
      cases: rows,
    };
    const manifestPath = path.join(root, "manifest.json");
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(manifestPath, manifestBytes);
    const checked = await preflight(manifestPath, root);
    assert.equal(checked.manifestSha256, sha256(manifestBytes));
    assert.equal(checked.manifest.cases.length, 9);
    let invalidManifestProviderCalls = 0;
    await assert.rejects(
      runClassification({ ...checked.manifest, reviewerGold: {} }, checked.manifestSha256, root, "validation", async () => {
        invalidManifestProviderCalls++;
        throw new Error("provider must not receive invalid manifest input");
      }),
      /Manifest contains an unsupported property/,
    );
    assert.equal(invalidManifestProviderCalls, 0);
    await writeFile(path.join(root, rows[0].image.path), Buffer.from("changed after preflight"));
    let changedImageProviderCalls = 0;
    await assert.rejects(
      runClassification(checked.manifest, checked.manifestSha256, root, "validation", async () => {
        changedImageProviderCalls++;
        throw new Error("provider must not receive changed bytes");
      }),
      /image SHA256 does not match manifest immediately before provider submission/,
    );
    assert.equal(changedImageProviderCalls, 0);
    await writeFile(path.join(root, rows[0].image.path), fixtureBytes.get(rows[0].caseId)!);
    rows[0].provenance.sourceType = "synthetic";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(preflight(manifestPath, root), /synthetic or unverified image sources/);
    rows[0].provenance.sourceType = "real-photo";
    await writeFile(manifestPath, manifestBytes);

    const originalMime = rows[0].image.mimeType;
    const promptSha256 = sha256(GEMINI_PROMPT);
    const isMockRefusal = (image: Buffer) => ["KENTE-03", "KENTE-04", "KENTE-09"]
      .some(id => image.equals(fixtureBytes.get(id)!));
    const mockSubtypes: Record<string, string> = { "KENTE-05": "sash", "KENTE-06": "scarf", "KENTE-07": "wrapper" };
    const offlineProvider = async (image: Buffer, mimeType: string) => ({
      statusCode: isMockRefusal(image) ? 422 : 200,
      body: isMockRefusal(image) ? { error: "content_guardrail" } : {
        category: image.equals(fixtureBytes.get("KENTE-07")!) ? "bottom" : "jewelry",
        subType: mockSubtypes[Object.keys(mockSubtypes).find(id => image.equals(fixtureBytes.get(id)!)) ?? ""] ?? "stole",
        fabric: "cotton",
      },
      modelRequested: CLASSIFIER_MODELS[0],
      modelResolved: "gemini-2.5-flash-001",
      promptSha256,
      preprocessing: "none-original-bytes",
      mimeType,
    });
    let raceProviderCalls = 0;
    try {
      await assert.rejects(
        runClassification(checked.manifest, checked.manifestSha256, root, "validation", async (image, mimeType) => {
          raceProviderCalls++;
          if (raceProviderCalls === 1) {
            await writeFile(path.join(root, rows[1].image.path), Buffer.from("changed during provider call 1"));
          }
          return offlineProvider(image, mimeType);
        }),
        /image SHA256 does not match manifest immediately before provider submission/,
      );
    } finally {
      await writeFile(path.join(root, rows[1].image.path), fixtureBytes.get(rows[1].caseId)!);
    }
    assert.equal(raceProviderCalls, 1);
    const run = await runClassification(checked.manifest, checked.manifestSha256, root, "validation", offlineProvider);
    assert.equal(run.track, "real-image-classification");
    assert.equal(run.manifestSha256, checked.manifestSha256);
    assert.equal(run.cases.length, 8);
    assert.equal(run.cases[7].outcome, "refusal");
    assert.equal(run.cases[0].modelRequested, CLASSIFIER_MODELS[0]);
    assert.equal(run.cases[0].modelResolved, "gemini-2.5-flash-001");
    assert.equal(run.cases[0].promptSha256, promptSha256);
    assert.equal(run.cases[0].preprocessing, "none-original-bytes");
    assert.equal(run.cases[0].mimeType, originalMime);
    assert.equal(run.cases[0].inputSha256, rows[0].image.sha256);

    const goldPath = path.join(root, "gold-validation.json");
    const validationRows = rows.filter(row => row.split === "validation");
    const gold = {
      schemaVersion: "private-real-photo-gold-v1",
      split: "validation",
      manifestSha256: checked.manifestSha256,
      reviewerReference: "private test reviewer",
      lockedDate: "2026-01-01",
      cases: validationRows.map(row => goldCase(row)),
    };
    await writeFile(goldPath, JSON.stringify(gold));
    const runPath = path.join(root, "run-validation.json");
    await writeFile(runPath, JSON.stringify(run));
    const report = await evaluate(runPath, goldPath, manifestPath, root);
    assert.equal(report.track, "real-image-classification");
    assert.equal(report.accuracy, 1);
    assert.equal(report.supported, 18);
    assert.equal(report.perFieldAccuracy.outcome.supported, 8);
    assert.equal(report.perFieldAccuracy.itemType.supported, 5);
    assert.equal(report.perFieldAccuracy.material.supported, 5);
    assert.equal(report.crosswalkCoverage.unsupported, 5);
    assert.equal(report.crosswalkCoverage.unrepresentable, 5);
    assert.equal(Object.hasOwn(report, "top3Accuracy"), false);
    assert.match(report.runSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.manifestSha256, checked.manifestSha256);
    const originalRunBytes = Buffer.from(JSON.stringify(run));
    const uppercaseManifest = structuredClone(manifest);
    for (const row of uppercaseManifest.cases) row.image.sha256 = row.image.sha256.toUpperCase();
    await writeFile(manifestPath, JSON.stringify(uppercaseManifest));
    const uppercaseChecked = await preflight(manifestPath, root);
    const uppercaseRun = await runClassification(
      uppercaseChecked.manifest, uppercaseChecked.manifestSha256, root, "validation", offlineProvider,
    );
    const uppercaseGold = structuredClone(gold);
    uppercaseGold.manifestSha256 = uppercaseChecked.manifestSha256;
    for (const goldRow of uppercaseGold.cases) {
      goldRow.inputSha256 = uppercaseManifest.cases.find(row => row.caseId === goldRow.caseId)!.image.sha256;
    }
    await writeFile(goldPath, JSON.stringify(uppercaseGold));
    await writeFile(runPath, JSON.stringify(uppercaseRun));
    const uppercaseReport = await evaluate(runPath, goldPath, manifestPath, root);
    assert.equal(uppercaseReport.accuracy, 1);
    await writeFile(manifestPath, manifestBytes);
    await writeFile(goldPath, JSON.stringify(gold));
    await writeFile(runPath, originalRunBytes);
    const unadjudicated = structuredClone(gold);
    delete (unadjudicated.cases[0] as any).adjudication;
    await writeFile(goldPath, JSON.stringify(unadjudicated));
    await assert.rejects(evaluate(runPath, goldPath, manifestPath, root), /adjudication decision/);
    await writeFile(goldPath, JSON.stringify(gold));
    for (const currentField of ["subTypo", "wearPosition", "arbitraryField"]) {
      const invalidCrosswalk = structuredClone(gold);
      const itemTypeMapping = invalidCrosswalk.cases[0].goldToCurrentOutput.itemType;
      assert.ok(itemTypeMapping);
      itemTypeMapping.currentField = currentField;
      await writeFile(goldPath, JSON.stringify(invalidCrosswalk));
      await assert.rejects(evaluate(runPath, goldPath, manifestPath, root), /known normalized scalar output field/);
    }
    await writeFile(goldPath, JSON.stringify(gold));

    process.env.GEMINI_API_KEY = "offline-test-only-key";
    let responseText = JSON.stringify({
      category: "jewelry", subType: "stole", colorFamily: "blue", dominantRgb: [20, 40, 90],
      modelConfidence: 0.9, wearPosition: "shoulder-neck",
    });
    let providerRequest: any;
    axios.post = (async (url: string, body: any) => {
      providerRequest = body;
      const requestedModel = new URL(url).pathname.match(/\/models\/([^:]+):/)?.[1];
      const modelVersion = requestedModel === "gemini-2.5-flash"
        ? "gemini-2.5-flash-001" : "gemini-2.5-flash-lite-001";
      return {
        status: 200,
        data: {
          modelVersion,
          candidates: [{ content: { parts: [{ text: responseText }] } }],
        },
      };
    }) as typeof axios.post;
    const handlerProvider = localHandlerProvider();
    const bytes = fixtureBytes.get("KENTE-01")!;
    const handlerResult = await handlerProvider(bytes, "image/jpeg");
    assert.equal(handlerResult.statusCode, 200);
    assert.equal(handlerResult.modelResolved, "gemini-2.5-flash-001");
    assert.equal(handlerResult.promptSha256, promptSha256);
    assert.equal(providerRequest.contents[0].parts[1].inlineData.data, bytes.toString("base64"));
    assert.equal(JSON.stringify(providerRequest).includes("reviewer-only"), false);
    assert.equal(Object.hasOwn(handlerResult.body, "wearPosition"), false);

    responseText = JSON.stringify({ refused: true, reason: "Not a wearable item." });
    const refusalPng = new PNG({ width: 1, height: 1 });
    refusalPng.data.set([0, 0, 0, 0]);
    const refusalResult = await handlerProvider(PNG.sync.write(refusalPng), "image/png");
    assert.equal(refusalResult.statusCode, 422);
    assert.equal(refusalResult.body.error, "content_guardrail");
    assert.equal(refusalResult.mimeType, "image/png");

    axios.post = (async () => ({
      status: 200,
      data: {
        modelVersion: "gemini-flash-lite-latest",
        candidates: [{ content: { parts: [{ text: responseText }] } }],
      },
    })) as typeof axios.post;
    await assert.rejects(handlerProvider(bytes, "image/jpeg"), /verifiable requested and resolved model/);

    const testRow = rows[7];
    const testGold = {
      schemaVersion: "private-real-photo-gold-v1",
      split: "test",
      manifestSha256: checked.manifestSha256,
      reviewerReference: "private test reviewer",
      lockedDate: "2026-01-01",
      cases: [{
        caseId: testRow.caseId,
        inputSha256: testRow.image.sha256,
        provenanceSha256: sha256(JSON.stringify(testRow.provenance)),
        adjudication: { status: "resolved", adjudicatorReference: "offline test adjudicator", decisionReference: "test decision" },
        reviewContext: {
          description: "private reviewer-only test fixture",
          culturalContext: "reviewer-only",
          relationship: "single item",
          boxes: [{ item: "item", x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
        },
        expected: { outcome: "classified" },
        goldToCurrentOutput: { outcome: { status: "supported", currentField: "outcome" } },
      }],
    };
    const testGoldPath = path.join(root, "gold-test.json");
    await writeFile(testGoldPath, JSON.stringify(testGold));
    const key = "offline-test-seal-key-with-at-least-32-characters";
    const payload = {
      schemaVersion: "private-real-photo-test-seal-v1" as const,
      split: "test" as const,
      manifestSha256: checked.manifestSha256,
      goldSha256: sha256(Buffer.from(JSON.stringify(testGold))),
      caseIds: [testRow.caseId],
      issuedAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      approvedBy: "offline test approver",
    };
    const sealPath = path.join(root, "test-seal.json");
    await writeFile(sealPath, JSON.stringify({ ...payload, signature: signTestSeal(payload, key) }));
    const seal = await verifyTestSeal(sealPath, key, checked.manifest, checked.manifestSha256, testGoldPath);
    assert.equal(seal.caseIds[0], "KENTE-08");
    await writeFile(sealPath, JSON.stringify({ ...payload, signature: "0".repeat(64) }));
    await assert.rejects(verifyTestSeal(sealPath, key, checked.manifest, checked.manifestSha256, testGoldPath), /signature is invalid/);
    await writeFile(sealPath, JSON.stringify({ ...payload, signature: signTestSeal(payload, key) }));
    const testRun = await runClassification(checked.manifest, checked.manifestSha256, root, "test", offlineProvider);
    testRun.testSeal = {
      signature: seal.signature,
      goldSha256: payload.goldSha256,
      issuedAt: payload.issuedAt,
      approvedBy: payload.approvedBy,
      expiresAt: payload.expiresAt,
      caseIds: payload.caseIds,
    };
    const testRunPath = path.join(root, "run-test.json");
    const testRunBytes = Buffer.from(JSON.stringify(testRun));
    await writeFile(testRunPath, testRunBytes);
    const attestationPayload = {
      schemaVersion: "private-real-photo-run-attestation-v1" as const,
      split: "test" as const,
      manifestSha256: checked.manifestSha256,
      goldSha256: payload.goldSha256,
      caseIds: ["KENTE-08"],
      runSha256: sha256(testRunBytes),
      testSealSignature: seal.signature,
    };
    const attestation = {
      ...attestationPayload,
      signature: signTestRunAttestation(attestationPayload, key),
    };
    await writeFile(`${testRunPath}.attestation.json`, JSON.stringify(attestation));
    const testReport = await evaluate(testRunPath, testGoldPath, manifestPath, root, { sealPath, key });
    assert.equal(testReport.track, "real-image-classification");
    assert.equal(testReport.accuracy, 1);
    await writeFile(testRunPath, Buffer.concat([testRunBytes, Buffer.from(" ")]));
    await assert.rejects(
      evaluate(testRunPath, testGoldPath, manifestPath, root, { sealPath, key }),
      /run hash or exact case membership/,
    );

    const broken = { ...manifest, cases: rows.map((row, index) => index ? row : { ...row, rights: { ...row.rights, classifierProcessing: "" } }) };
    await writeFile(manifestPath, JSON.stringify(broken));
    await assert.rejects(preflight(manifestPath, root), /rights.classifierProcessing must be a non-empty string/);
    const webp = { ...manifest, cases: rows.map((row, index) => index ? row : { ...row, image: { ...row.image, mimeType: "image/webp" } }) };
    await writeFile(manifestPath, JSON.stringify(webp));
    await assert.rejects(preflight(manifestPath, root), /only JPEG and PNG/);
    const leakedContext = { ...manifest, cases: rows.map((row, index) => index ? row : { ...row, context: { culturalContext: "review-only label" } }) };
    await writeFile(manifestPath, JSON.stringify(leakedContext));
    await assert.rejects(preflight(manifestPath, root), /unsupported property/);
    const extraNestedMetadata = {
      ...manifest,
      cases: rows.map((row, index) => index ? row : { ...row, image: { ...row.image, reviewer: { label: "private" } } }),
    };
    await writeFile(manifestPath, JSON.stringify(extraNestedMetadata));
    await assert.rejects(preflight(manifestPath, root), /image contains an unsupported property/);
    const objectInAllowedScalar = { ...manifest, dataset: { ...manifest.dataset, owner: { name: "not a scalar" } } };
    await writeFile(manifestPath, JSON.stringify(objectInAllowedScalar));
    await assert.rejects(preflight(manifestPath, root), /Dataset owner must be a non-empty string/);
    console.log("Private real-image evaluation checks passed (temporary offline fixtures only).");
  } finally {
    axios.post = originalPost;
    if (priorApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = priorApiKey;
    await rm(root, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});