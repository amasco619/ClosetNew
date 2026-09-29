/**
 * Private, rights-governed real-photo garment evaluation. The runner reads the
 * image manifest only; the evaluator reads reviewer gold only after a run exists.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import axios from "axios";
import type { Request, Response } from "express";
import { classifyGarment, GEMINI_PROMPT } from "../server/classify-garment";

type Json = Record<string, any>;
type ProviderResult = {
  statusCode: number;
  body: Json;
  modelRequested: string;
  modelResolved: string;
  promptSha256: string;
  preprocessing: string;
  mimeType: string;
};
type Provider = (image: Buffer, mimeType: string) => Promise<ProviderResult>;

const SHA256 = /^[a-f0-9]{64}$/i;
const REQUIRED_RIGHTS = ["licenseName", "consentReference", "internalEvaluation", "classifierProcessing"] as const;
const REQUIRED_KENTE_CASES = Array.from({ length: 9 }, (_, index) => `KENTE-${String(index + 1).padStart(2, "0")}`);
const RESOLVED_MODELS: Record<string, Set<string>> = {
  "gemini-flash-lite-latest": new Set(["gemini-2.5-flash-lite-001"]),
  "gemini-2.5-flash-lite": new Set(["gemini-2.5-flash-lite-001"]),
  "gemini-2.5-flash": new Set(["gemini-2.5-flash-001"]),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function digest(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function provenanceDigest(row: Json): string {
  return digest(JSON.stringify(row.provenance));
}

function knownModelPair(requested: string, resolved: string): boolean {
  return RESOLVED_MODELS[requested]?.has(resolved) ?? false;
}

function within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function validateManifest(manifest: Json): void {
  assert(manifest.schemaVersion === "private-real-photo-v1", "Unsupported private photo manifest schema.");
  assert(!["gold", "reviewerGold", "expected", "context", "reviewContext"].some(key => Object.hasOwn(manifest, key)),
    "Reviewer gold/context belongs in a separate file, never the classifier manifest.");
  assert(manifest.dataset?.status === "rights-cleared", "Dataset must be explicitly rights-cleared.");
  assert(typeof manifest.dataset.owner === "string" && manifest.dataset.owner.trim(), "Dataset owner is required.");
  assert(typeof manifest.dataset.approvalReference === "string" && manifest.dataset.approvalReference.trim(), "Dataset approval reference is required.");
  assert(Array.isArray(manifest.cases) && manifest.cases.length > 0, "A governed real-photo dataset with at least one case is required.");
  const seen = new Set<string>();
  const hashesBySplit = new Map<string, string>();
  for (const row of manifest.cases) {
    assert(!Object.hasOwn(row, "gold") && !Object.hasOwn(row, "expected") &&
      !Object.hasOwn(row, "context") && !Object.hasOwn(row, "reviewContext"),
    `${row.caseId}: reviewer labels/context must be stored separately from classifier inputs.`);
    assert(typeof row.caseId === "string" && row.caseId.trim() && !seen.has(row.caseId), "Every case needs a unique caseId.");
    seen.add(row.caseId);
    assert(["development", "validation", "test"].includes(row.split), `${row.caseId}: invalid split.`);
    assert(typeof row.image?.path === "string" && row.image.path.trim(), `${row.caseId}: local image path is required.`);
    assert(SHA256.test(row.image.sha256 ?? ""), `${row.caseId}: a SHA256 image hash is required.`);
    const previousSplit = hashesBySplit.get(row.image.sha256.toLowerCase());
    assert(!previousSplit || previousSplit === row.split, `${row.caseId}: image hashes must not cross dataset splits.`);
    hashesBySplit.set(row.image.sha256.toLowerCase(), row.split);
    assert(/^image\/(jpeg|png)$/.test(row.image.mimeType ?? ""), `${row.caseId}: only JPEG and PNG images are supported.`);
    for (const key of REQUIRED_RIGHTS) {
      const value = row.rights?.[key];
      assert(typeof value === "string" && value.trim(), `${row.caseId}: rights.${key} is required.`);
    }
    assert(row.rights.internalEvaluation === "approved" && row.rights.classifierProcessing === "approved",
      `${row.caseId}: internal evaluation and classifier processing must both be approved.`);
    assert(row.provenance?.sourceType === "real-photo", `${row.caseId}: synthetic or unverified image sources cannot enter real-photo evaluation.`);
    assert(typeof row.provenance?.sourceReference === "string" && row.provenance.sourceReference.trim(), `${row.caseId}: provenance sourceReference is required.`);
    assert(typeof row.provenance?.verifiedBy === "string" && row.provenance.verifiedBy.trim(), `${row.caseId}: provenance verifier is required.`);
    assert(typeof row.provenance?.verifiedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.provenance.verifiedDate), `${row.caseId}: provenance verifiedDate must be YYYY-MM-DD.`);
    assert(typeof row.captureConditions === "string" && row.captureConditions.trim(),
      `${row.caseId}: non-label capture conditions are required; item descriptions and cultural labels belong in reviewer gold.`);
    assert(row.privacy?.identifiable === "yes" || row.privacy?.identifiable === "no", `${row.caseId}: privacy.identifiable must be yes or no.`);
    if (row.privacy.identifiable === "yes") {
      assert(typeof row.rights.subjectConsentReference === "string" && row.rights.subjectConsentReference.trim(),
        `${row.caseId}: identifiable people require a subject consent reference.`);
    }
  }
  assert(REQUIRED_KENTE_CASES.every(id => seen.has(id)), `Dataset must contain the complete required Kente suite (${REQUIRED_KENTE_CASES.join(", ")}).`);
}

export async function preflight(manifestPath: string, dataRoot: string): Promise<{ manifest: Json; manifestSha256: string }> {
  const root = await realpath(path.resolve(dataRoot));
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateManifest(manifest);
  for (const row of manifest.cases) {
    const lexicalPath = path.resolve(root, row.image.path);
    assert(within(root, lexicalPath), `${row.caseId}: image path must remain inside the private data root.`);
    const imagePath = await realpath(lexicalPath);
    assert(within(root, imagePath), `${row.caseId}: image symlinks must remain inside the private data root.`);
    const bytes = await readFile(imagePath);
    assert(bytes.length > 0, `${row.caseId}: image is empty.`);
    assert(digest(bytes).toLowerCase() === row.image.sha256.toLowerCase(), `${row.caseId}: image SHA256 does not match manifest.`);
  }
  return { manifest, manifestSha256: digest(manifestBytes) };
}

/** The input object deliberately contains no reviewer gold or expected labels. */
export async function runClassification(
  manifest: Json,
  manifestSha256: string,
  dataRoot: string,
  split: string,
  provider: Provider,
): Promise<Json> {
  const root = await realpath(path.resolve(dataRoot));
  const cases = manifest.cases.filter((row: Json) => row.split === split);
  assert(cases.length > 0, `No cases in split '${split}'.`);
  const outputs = [];
  for (const row of cases) {
    const lexicalPath = path.resolve(root, row.image.path);
    assert(within(root, lexicalPath), `${row.caseId}: image path must remain inside the private data root.`);
    const imagePath = await realpath(lexicalPath);
    assert(within(root, imagePath), `${row.caseId}: image symlinks must remain inside the private data root.`);
    const image = await readFile(imagePath);
    const providerResult = await provider(image, row.image.mimeType);
    assert(providerResult.promptSha256 === digest(GEMINI_PROMPT), `${row.caseId}: prompt hash does not match the current classifier prompt.`);
    assert(knownModelPair(providerResult.modelRequested, providerResult.modelResolved),
      `${row.caseId}: requested/resolved model pair is unknown or unpinned.`);
    assert(providerResult.preprocessing === "none-original-bytes" && providerResult.mimeType === row.image.mimeType,
      `${row.caseId}: preprocessing or MIME metadata does not match the submitted image.`);
    const refusal = providerResult.statusCode === 422 && providerResult.body.error === "content_guardrail";
    assert((providerResult.statusCode === 200 || refusal), `${row.caseId}: classifier did not return a successful classification or supported refusal.`);
    outputs.push({
      caseId: row.caseId,
      outcome: refusal ? "refusal" : "classified",
      prediction: refusal ? null : providerResult.body,
      inputSha256: row.image.sha256,
      provenanceSha256: provenanceDigest(row),
      modelRequested: providerResult.modelRequested,
      modelResolved: providerResult.modelResolved,
      promptSha256: providerResult.promptSha256,
      preprocessing: providerResult.preprocessing,
      mimeType: providerResult.mimeType,
    });
  }
  return {
    schemaVersion: "private-real-photo-run-v1",
    track: "real-image-classification",
    split,
    manifestSha256,
    generatedAt: new Date().toISOString(),
    cases: outputs,
  };
}

/** Invoke the handler directly, so no route auth/limiter is skipped or misrepresented. */
export function localHandlerProvider(): Provider {
  assert(process.env.GEMINI_API_KEY, "GEMINI_API_KEY is required for the local classifier handler.");
  return async (image, mimeType) => {
    assert(["image/jpeg", "image/png"].includes(mimeType), "The server classifier accepts JPEG or PNG only.");
    let modelRequested: string | null = null;
    let modelResolved: string | null = null;
    const originalPost = axios.post;
    axios.post = (async (url: string, ...args: any[]) => {
      const model = new URL(url).pathname.match(/\/models\/([^:]+):/)?.[1] ?? "";
      assert(Object.hasOwn(RESOLVED_MODELS, model), "Classifier requested an unknown model alias.");
      modelRequested = model;
      const response = await (originalPost as any).call(axios, url, ...args);
      const version = response.data?.modelVersion;
      assert(typeof version === "string" && knownModelPair(model, version),
        "Classifier provider did not report a known pinned model version; refusing to record this output.");
      modelResolved = version;
      return response;
    }) as typeof axios.post;

    let statusCode = 200;
    let body: Json = {};
    try {
      const req = {
        body: { imageBase64: image.toString("base64"), imageMimeType: mimeType },
      } as Request;
      const res = {
        status(code: number) { statusCode = code; return this; },
        json(value: Json) { body = value; return this; },
        setHeader() { return this; },
      } as unknown as Response;
      await classifyGarment(req, res);
    } finally {
      axios.post = originalPost;
    }
    assert(modelRequested && modelResolved, "Classifier did not return a verifiable requested and resolved model.");
    assert(statusCode === 200 || (statusCode === 422 && body.error === "content_guardrail"),
      `Local classifier returned an unusable HTTP ${statusCode} response.`);
    return {
      statusCode,
      body,
      modelRequested,
      modelResolved,
      promptSha256: digest(GEMINI_PROMPT),
      preprocessing: "none-original-bytes",
      mimeType,
    };
  };
}

type TestSeal = {
  schemaVersion: "private-real-photo-test-seal-v1";
  split: "test";
  manifestSha256: string;
  goldSha256: string;
  caseIds: string[];
  issuedAt: string;
  expiresAt: string;
  approvedBy: string;
  signature: string;
};

type TestRunAttestation = {
  schemaVersion: "private-real-photo-run-attestation-v1";
  split: "test";
  manifestSha256: string;
  goldSha256: string;
  caseIds: string[];
  runSha256: string;
  testSealSignature: string;
  signature: string;
};

function sealPayload(seal: TestSeal): Json {
  return {
    schemaVersion: seal.schemaVersion,
    split: seal.split,
    manifestSha256: seal.manifestSha256,
    goldSha256: seal.goldSha256,
    caseIds: [...seal.caseIds].sort(),
    issuedAt: seal.issuedAt,
    expiresAt: seal.expiresAt,
    approvedBy: seal.approvedBy,
  };
}

export function signTestSeal(payload: Omit<TestSeal, "signature">, key: string): string {
  assert(key.length >= 32, "Test-seal key must contain at least 32 characters.");
  return createHmac("sha256", key).update(JSON.stringify(sealPayload({ ...payload, signature: "" }))).digest("hex");
}

function runAttestationPayload(attestation: TestRunAttestation): Json {
  return {
    schemaVersion: attestation.schemaVersion,
    split: attestation.split,
    manifestSha256: attestation.manifestSha256,
    goldSha256: attestation.goldSha256,
    caseIds: [...attestation.caseIds].sort(),
    runSha256: attestation.runSha256,
    testSealSignature: attestation.testSealSignature,
  };
}

export function signTestRunAttestation(payload: Omit<TestRunAttestation, "signature">, key: string): string {
  assert(key.length >= 32, "Test-seal key must contain at least 32 characters.");
  return createHmac("sha256", key).update(JSON.stringify(runAttestationPayload({ ...payload, signature: "" }))).digest("hex");
}

function validateGoldBinding(gold: Json, manifest: Json, manifestSha256: string, split: string): void {
  assert(gold.schemaVersion === "private-real-photo-gold-v1" && gold.split === split, "Locked reviewer gold split/schema mismatch.");
  assert(gold.manifestSha256 === manifestSha256, "Gold manifest digest does not match the governed manifest.");
  assert(typeof gold.reviewerReference === "string" && gold.reviewerReference.trim(), "Locked reviewer reference is required.");
  assert(typeof gold.lockedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(gold.lockedDate), "Gold labels need a locked date.");
  const source = new Map(manifest.cases.filter((row: Json) => row.split === split).map((row: Json) => [row.caseId, row]));
  assert(Array.isArray(gold.cases) && gold.cases.length === source.size, "Gold case membership must exactly match its manifest split.");
  const goldIds = new Set<string>();
  for (const row of gold.cases) {
    const input = source.get(row.caseId) as Json | undefined;
    assert(input && !goldIds.has(row.caseId), "Gold contains an unexpected or duplicate case ID.");
    goldIds.add(row.caseId);
    assert(row.inputSha256 === input.image.sha256, `${row.caseId}: gold image hash does not match the manifest.`);
    assert(row.provenanceSha256 === provenanceDigest(input), `${row.caseId}: gold provenance digest does not match the manifest.`);
    assert(["accepted", "resolved"].includes(row.adjudication?.status) &&
      typeof row.adjudication?.adjudicatorReference === "string" && row.adjudication.adjudicatorReference.trim() &&
      typeof row.adjudication?.decisionReference === "string" && row.adjudication.decisionReference.trim(),
    `${row.caseId}: locked gold requires an adjudication decision and documentary references.`);
    assert(row.expected && ["classified", "refusal"].includes(row.expected.outcome),
      `${row.caseId}: locked gold must include its expected classifier outcome.`);
    assert(typeof row.reviewContext?.description === "string" && row.reviewContext.description.trim() &&
      typeof row.reviewContext.culturalContext === "string" && row.reviewContext.culturalContext.trim() &&
      typeof row.reviewContext.relationship === "string" && row.reviewContext.relationship.trim() &&
      Array.isArray(row.reviewContext.boxes) && row.reviewContext.boxes.length > 0,
    `${row.caseId}: reviewer-only context, item relationship, and boxes are required in gold.`);
    for (const box of row.reviewContext.boxes) {
      assert(typeof box.item === "string" && box.item.trim() &&
        [box.x, box.y, box.width, box.height].every(value => typeof value === "number") &&
        box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
        box.x + box.width <= 1 && box.y + box.height <= 1,
      `${row.caseId}: reviewer gold boxes need an item and normalized image coordinates.`);
    }
    assert(row.goldToCurrentOutput?.outcome?.status === "supported" &&
      row.goldToCurrentOutput.outcome.currentField === "outcome",
    `${row.caseId}: gold must explicitly score the persisted classification/guardrail outcome.`);
    for (const [field, mapping] of Object.entries(row.goldToCurrentOutput) as [string, Json][]) {
      assert(["supported", "unsupported", "unrepresentable"].includes(mapping.status),
        `${row.caseId}: explicit crosswalk status required for ${field}.`);
      if (mapping.status === "supported") {
        assert(typeof mapping.currentField === "string" && mapping.currentField.trim(),
          `${row.caseId}: supported crosswalk field ${field} needs a current output field.`);
      } else {
        assert(typeof mapping.reason === "string" && mapping.reason.trim(),
          `${row.caseId}: non-supported crosswalk field ${field} needs a reason.`);
      }
    }
    assert(Object.keys(row.expected).every(field => Object.hasOwn(row.goldToCurrentOutput, field)),
      `${row.caseId}: every expected dimension requires a crosswalk.`);
    if (row.expected.outcome === "refusal") {
      assert(Object.keys(row.expected).every(field => field === "outcome"),
        `${row.caseId}: refusal cases only have an outcome label; garment dimensions do not apply.`);
    }
  }
}

export async function verifyTestSeal(
  sealPath: string,
  key: string,
  manifest: Json,
  manifestSha256: string,
  goldPath: string,
  requireUnexpired = true,
): Promise<TestSeal> {
  assert(key.length >= 32, "REAL_PHOTO_TEST_SEAL_KEY must contain at least 32 characters.");
  const seal = JSON.parse(await readFile(sealPath, "utf8")) as TestSeal;
  const goldBytes = await readFile(goldPath);
  const gold = JSON.parse(goldBytes.toString("utf8"));
  validateGoldBinding(gold, manifest, manifestSha256, "test");
  const expectedIds = manifest.cases.filter((row: Json) => row.split === "test").map((row: Json) => row.caseId).sort();
  assert(seal.schemaVersion === "private-real-photo-test-seal-v1" && seal.split === "test", "Invalid sealed-test authorization file.");
  assert(seal.manifestSha256 === manifestSha256 && seal.goldSha256 === digest(goldBytes), "Sealed-test manifest/gold digest mismatch.");
  assert(JSON.stringify([...seal.caseIds].sort()) === JSON.stringify(expectedIds), "Sealed-test case membership mismatch.");
  assert(typeof seal.approvedBy === "string" && seal.approvedBy.trim(), "Sealed-test approver reference is required.");
  assert(Number.isFinite(Date.parse(seal.issuedAt)) && Number.isFinite(Date.parse(seal.expiresAt)) &&
    Date.parse(seal.issuedAt) < Date.parse(seal.expiresAt), "Sealed-test authorization interval is invalid.");
  if (requireUnexpired) assert(Date.parse(seal.expiresAt) > Date.now(), "Sealed-test authorization is expired.");
  const expectedSignature = signTestSeal(seal, key);
  const actual = Buffer.from(seal.signature ?? "", "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  assert(actual.length === expected.length && timingSafeEqual(actual, expected), "Sealed-test authorization signature is invalid.");
  return seal;
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim().replace(/\s+/g, " ") : "";
}

export async function evaluate(
  runPath: string,
  goldPath: string,
  manifestPath: string,
  dataRoot: string,
  testAuthorization?: { sealPath: string; key: string; attestationPath?: string },
): Promise<Json> {
  const verified = await preflight(manifestPath, dataRoot);
  const [runBytes, goldBytes] = await Promise.all([readFile(runPath), readFile(goldPath)]);
  const run = JSON.parse(runBytes.toString("utf8"));
  const gold = JSON.parse(goldBytes.toString("utf8"));
  assert(run.schemaVersion === "private-real-photo-run-v1", "Unsupported classifier run.");
  assert(gold.schemaVersion === "private-real-photo-gold-v1", "Unsupported reviewer gold schema.");
  assert(run.split === gold.split, "Run and reviewer gold splits do not match.");
  assert(run.manifestSha256 === verified.manifestSha256, "Classifier run does not match the current verified manifest digest.");
  validateGoldBinding(gold, verified.manifest, verified.manifestSha256, run.split);
  if (run.split === "test") {
    assert(testAuthorization, "Scoring the sealed test split requires signed authorization verification.");
    const seal = await verifyTestSeal(testAuthorization.sealPath, testAuthorization.key,
      verified.manifest, verified.manifestSha256, goldPath, false);
    assert(run.testSeal?.signature === seal.signature && run.testSeal?.goldSha256 === digest(goldBytes),
      "Sealed test run does not match signed authorization and locked gold.");
    assert(Date.parse(run.testSeal.issuedAt) === Date.parse(seal.issuedAt) &&
      Date.parse(run.generatedAt) >= Date.parse(seal.issuedAt) &&
      Date.parse(run.generatedAt) <= Date.parse(seal.expiresAt),
    "Sealed test run was not generated within its signed authorization window.");
    const attestationPath = testAuthorization.attestationPath ?? `${runPath}.attestation.json`;
    const attestation = JSON.parse(await readFile(attestationPath, "utf8")) as TestRunAttestation;
    assert(attestation.schemaVersion === "private-real-photo-run-attestation-v1" && attestation.split === "test" &&
      attestation.manifestSha256 === run.manifestSha256 &&
      attestation.goldSha256 === digest(goldBytes) &&
      attestation.runSha256 === digest(runBytes) &&
      attestation.testSealSignature === seal.signature &&
      JSON.stringify([...attestation.caseIds].sort()) === JSON.stringify(run.cases.map((row: Json) => row.caseId).sort()),
    "Sealed test run hash or exact case membership does not match its attestation.");
    const expectedAttestationSignature = signTestRunAttestation(attestation, testAuthorization.key);
    const actualAttestationSignature = Buffer.from(attestation.signature ?? "", "hex");
    const expectedAttestation = Buffer.from(expectedAttestationSignature, "hex");
    assert(actualAttestationSignature.length === expectedAttestation.length &&
      timingSafeEqual(actualAttestationSignature, expectedAttestation),
    "Sealed test run attestation signature is invalid.");
  }
  const source = new Map(verified.manifest.cases.filter((row: Json) => row.split === run.split).map((row: Json) => [row.caseId, row]));
  const runCases = new Map(run.cases.map((row: Json) => [row.caseId, row]));
  assert(runCases.size === run.cases.length, "Run contains duplicate case IDs.");
  assert(runCases.size === source.size, "Classifier run does not exactly cover the current manifest split.");
  assert(gold.cases.length > 0 && gold.cases.every((row: Json) => runCases.has(row.caseId)),
    "Every gold case must have a recorded classifier output before evaluation.");
  assert(run.cases.length === gold.cases.length, "Run and gold must contain exactly the same cases.");

  const fieldTotals: Record<string, { correct: number; supported: number }> = {};
  const representation: Record<string, number> = { supported: 0, unrepresentable: 0, unsupported: 0 };
  let correct = 0;
  let supported = 0;
  for (const row of gold.cases) {
    const result = runCases.get(row.caseId) as Json;
    const sourceCase = source.get(row.caseId) as Json;
    assert(row.inputSha256 === result.inputSha256, `${row.caseId}: gold image hash does not match the recorded run.`);
    assert(row.provenanceSha256 === result.provenanceSha256, `${row.caseId}: gold provenance digest does not match the recorded run.`);
    assert(result.inputSha256 === sourceCase.image.sha256 && result.provenanceSha256 === provenanceDigest(sourceCase),
      `${row.caseId}: run image/provenance does not match the verified manifest.`);
    assert(knownModelPair(result.modelRequested, result.modelResolved),
      `${row.caseId}: run has unknown or unresolved model identity.`);
    assert(result.promptSha256 === digest(GEMINI_PROMPT), `${row.caseId}: run prompt digest does not match the current classifier.`);
    assert(result.preprocessing === "none-original-bytes" && result.mimeType === sourceCase.image.mimeType,
      `${row.caseId}: run preprocessing/MIME metadata does not match the verified image.`);
    assert(row.expected && typeof row.expected === "object", `${row.caseId}: reviewer expected labels are required.`);
    assert(["classified", "refusal"].includes(row.expected.outcome), `${row.caseId}: expected outcome must be classified or refusal.`);
    assert(Object.hasOwn(row.goldToCurrentOutput ?? {}, "outcome") &&
      row.goldToCurrentOutput.outcome.status === "supported" &&
      row.goldToCurrentOutput.outcome.currentField === "outcome",
    `${row.caseId}: guardrail/classification outcome must be explicitly supported by the run.`);
    assert(Object.keys(row.expected).every(field => Object.hasOwn(row.goldToCurrentOutput ?? {}, field)),
      `${row.caseId}: every gold field needs an explicit current-output crosswalk status.`);
    if (row.expected.outcome === "refusal") {
      assert(Object.keys(row.expected).every(field => field === "outcome"),
        `${row.caseId}: refusal cases score outcome only; garment dimensions are not applicable.`);
    }
    for (const [goldField, mapping] of Object.entries(row.goldToCurrentOutput ?? {}) as [string, Json][]) {
      assert(["supported", "unrepresentable", "unsupported"].includes(mapping.status), `${row.caseId}: explicit crosswalk status required for ${goldField}.`);
      representation[mapping.status]++;
      if (mapping.status !== "supported") continue;
      assert(typeof mapping.currentField === "string" && mapping.currentField, `${row.caseId}: supported crosswalk requires currentField.`);
      if (row.expected.outcome === "refusal" && goldField !== "outcome") continue;
      if (!Object.hasOwn(row.expected ?? {}, goldField) || row.expected[goldField] == null) continue;
      const field = fieldTotals[goldField] ??= { correct: 0, supported: 0 };
      field.supported++;
      supported++;
      const actual = mapping.currentField === "outcome" ? result.outcome : result.prediction?.[mapping.currentField];
      const match = normalize(actual) === normalize(row.expected[goldField]);
      if (match) {
        field.correct++;
        correct++;
      }
    }
  }
  return {
    schemaVersion: "private-real-photo-evaluation-v1",
    track: "real-image-classification",
    split: run.split,
    caseCount: run.cases.length,
    manifestSha256: run.manifestSha256,
    runSha256: digest(runBytes),
    goldSha256: digest(goldBytes),
    accuracy: supported ? correct / supported : null,
    correct,
    supported,
    perFieldAccuracy: Object.fromEntries(Object.entries(fieldTotals).map(([field, totals]) => [
      field, { ...totals, accuracy: totals.supported ? totals.correct / totals.supported : null },
    ])),
    crosswalkCoverage: representation,
  };
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  assert(index >= 0 && process.argv[index + 1], `Missing required argument ${name}.`);
  return process.argv[index + 1];
}

async function cli(): Promise<void> {
  const command = process.argv[2];
  if (command === "preflight") {
    const { manifest } = await preflight(arg("--manifest"), arg("--data-root"));
    console.log(`Preflight passed: ${manifest.cases.length} governed real-photo cases; no classifier calls made.`);
    return;
  }
  if (command === "seal-test") {
    const root = path.resolve(arg("--data-root"));
    const { manifest, manifestSha256 } = await preflight(arg("--manifest"), root);
    const goldPath = arg("--gold");
    const goldBytes = await readFile(goldPath);
    const gold = JSON.parse(goldBytes.toString("utf8"));
    validateGoldBinding(gold, manifest, manifestSha256, "test");
    const payload = {
      schemaVersion: "private-real-photo-test-seal-v1" as const,
      split: "test" as const,
      manifestSha256,
      goldSha256: digest(goldBytes),
      caseIds: manifest.cases.filter((row: Json) => row.split === "test").map((row: Json) => row.caseId).sort(),
      issuedAt: new Date().toISOString(),
      expiresAt: arg("--expires-at"),
      approvedBy: arg("--approved-by"),
    };
    assert(Date.parse(payload.expiresAt) > Date.now() && payload.approvedBy.trim(), "A future expiry and approver reference are required.");
    const key = process.env.REAL_PHOTO_TEST_SEAL_KEY ?? "";
    const seal = { ...payload, signature: signTestSeal(payload, key) };
    await writeFile(arg("--out"), `${JSON.stringify(seal, null, 2)}\n`, { flag: "wx" });
    console.log(`Wrote one-time signed test authorization for ${seal.caseIds.length} cases.`);
    return;
  }
  if (command === "run") {
    const root = path.resolve(arg("--data-root"));
    const verified = await preflight(arg("--manifest"), root);
    const split = arg("--split");
    assert(["development", "validation", "test"].includes(split), "Choose development, validation, or test split.");
    let seal: TestSeal | undefined;
    if (split === "test") {
      seal = await verifyTestSeal(arg("--seal"), process.env.REAL_PHOTO_TEST_SEAL_KEY ?? "",
        verified.manifest, verified.manifestSha256, arg("--gold"));
    }
    const report = await runClassification(verified.manifest, verified.manifestSha256, root, split, localHandlerProvider());
    if (seal) {
      report.testSeal = {
        signature: seal.signature,
        goldSha256: seal.goldSha256,
        issuedAt: seal.issuedAt,
        approvedBy: seal.approvedBy,
        expiresAt: seal.expiresAt,
        caseIds: seal.caseIds,
      };
    }
    const directory = path.join(root, "results");
    await mkdir(directory, { recursive: true });
    const output = path.join(directory, `${split}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const outputBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    await writeFile(output, outputBytes, { flag: "wx" });
    if (seal) {
      const attestationPayload = {
        schemaVersion: "private-real-photo-run-attestation-v1" as const,
        split: "test" as const,
        manifestSha256: verified.manifestSha256,
        goldSha256: seal.goldSha256,
        caseIds: report.cases.map((row: Json) => row.caseId).sort(),
        runSha256: digest(outputBytes),
        testSealSignature: seal.signature,
      };
      const attestation = {
        ...attestationPayload,
        signature: signTestRunAttestation(attestationPayload, process.env.REAL_PHOTO_TEST_SEAL_KEY ?? ""),
      };
      await writeFile(`${output}.attestation.json`, `${JSON.stringify(attestation, null, 2)}\n`, { flag: "wx" });
    }
    console.log(`Recorded ${report.cases.length} classifier outputs with gold labels excluded from classifier input. Output: ${output}`);
    return;
  }
  if (command === "evaluate") {
    const runPath = arg("--run");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    const testAuthorization = run.split === "test"
      ? { sealPath: arg("--seal"), key: process.env.REAL_PHOTO_TEST_SEAL_KEY ?? "" }
      : undefined;
    const report = await evaluate(runPath, arg("--gold"), arg("--manifest"), arg("--data-root"),
      testAuthorization);
    const outputPath = arg("--out");
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    console.log(`Wrote real-image-classification field-accuracy report: ${outputPath}`);
    return;
  }
  throw new Error("Usage: privateRealPhotoEvaluation.ts preflight|seal-test|run|evaluate (see private real-photo evaluation instructions).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli().catch(error => {
    console.error(`Private real-photo evaluation refused: ${error instanceof Error ? error.message : "invalid input"}`);
    process.exitCode = 1;
  });
}