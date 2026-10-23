import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { classifyGarment, GEMINI_PROMPT } from '../server/classify-garment';
import { classificationImagePayload } from '../lib/classifyPath';
import { flattenGarmentPngOnStudio } from '../server/garmentPng';

type Raster = { width: number; height: number; data: Buffer };
type PngCodec = {
  new(options: { width: number; height: number }): Raster;
  sync: {
    read(buffer: Buffer): Raster;
    write(image: Raster): Buffer;
  };
};
const { PNG } = require('pngjs') as { PNG: PngCodec };

const app = express();
app.use(express.json());
app.post('/api/classify-garment', classifyGarment);
const originalPost = axios.post;
const originalKey = process.env.GEMINI_API_KEY;
const originalInfo = console.info;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const lines: string[] = [];
process.env.GEMINI_API_KEY = 'mock-secret-key';
console.info = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
console.log = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
console.error = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
console.warn = (...parts: unknown[]) => { lines.push(parts.join(' ')); };

const syntheticPng = new PNG({ width: 2, height: 1 });
syntheticPng.data.set([0, 0, 0, 0, 0, 0, 0, 255]);
const imageBytes = PNG.sync.write(syntheticPng);
const imageBase64 = imageBytes.toString('base64');
const providerImageBytes = flattenGarmentPngOnStudio(imageBytes);
const sha256 = createHash('sha256').update(providerImageBytes).digest('hex');
const output = (classification: unknown) => ({
  status: 200,
  data: { modelVersion: 'gemini-2.5-flash-lite', candidates: [
    { content: { parts: [{ text: JSON.stringify(classification) }] } },
  ] },
});
const wrapper = { category: 'bottom', subType: 'wrapper', colorFamily: 'blue',
  displayName: 'Aso-oke wrapper', pattern: 'geometric', modelConfidence: 0.9 };
async function run(mock: () => Promise<unknown>, payload = { imageBase64, imageMimeType: 'image/png' }) {
  lines.length = 0;
  let providerMimeType: string | undefined;
  let providerBytes: Buffer | undefined;
  let providerPrompt: string | undefined;
  axios.post = (async (_url: string, body: any) => {
    providerMimeType = body.contents[0].parts[1].inlineData.mimeType;
    providerBytes = Buffer.from(body.contents[0].parts[1].inlineData.data, 'base64');
    providerPrompt = body.contents[0].parts[0].text;
    return mock();
  }) as typeof axios.post;
  const response = await request(app).post('/api/classify-garment')
    .send({ ...payload, userId: 'sensitive-user-id' });
  const traces = lines.flatMap(line => {
    try { const value = JSON.parse(line); return value.type?.startsWith('classification') ? [value] : []; }
    catch { return []; }
  });
  assert.match(response.headers['x-classification-id'], /^[\da-f-]{36}$/);
  assert.equal(traces.length, 1);
  assert.ok(traces.every(trace => trace.requestId === response.headers['x-classification-id']));
  assert.ok(traces.every(trace => !JSON.stringify(trace).includes('sensitive-user-id')));
  assert.ok(!lines.join('\n').includes(payload.imageBase64));
  assert.ok(!lines.join('\n').includes('mock-secret-key'));
  return { response, traces, providerMimeType, providerBytes, providerPrompt };
}

(async () => {
try {
  let result = await run(async () => output(wrapper));
  assert.equal(result.response.status, 200);
  assert.deepEqual([result.response.body.category, result.response.body.subType,
    result.response.body.pattern, result.response.body.fabric], ['bottom', 'wrapper', 'geometric', undefined]);
  assert.equal(createHash('sha256').update(result.providerBytes!).digest('hex'), sha256);
  assert.equal(result.providerBytes!.length, providerImageBytes.length);
  assert.equal(result.providerMimeType, 'image/png');
  assert.equal(result.providerPrompt, GEMINI_PROMPT);
  assert.equal(result.traces.at(-1).modelAttempts[0].providerModelVersion, 'gemini-2.5-flash-lite');
  assert.equal(result.traces.at(-1).outcomeCode, 'OK');
  assert.ok(!/imageSha256|promptSha256|imageBytes|mimeType/.test(JSON.stringify(result.traces)));

  // The same byte-based payload builder used by Add Item reaches provider and traces.
  const pngFixture = PNG.sync.write(syntheticPng);
  for (const [bytes, mimeType] of [
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1]), 'image/jpeg'],
    [pngFixture, 'image/png'],
  ] as const) {
    const payload = classificationImagePayload(bytes.toString('base64'));
    result = await run(async () => output(wrapper), payload);
    assert.equal(result.response.status, 200);
    assert.equal(payload.imageMimeType, mimeType);
    assert.equal(result.providerMimeType, mimeType);
    const expectedProviderBytes = mimeType === 'image/png' ? flattenGarmentPngOnStudio(bytes) : bytes;
    assert.deepEqual(result.providerBytes, expectedProviderBytes);
  }
  assert.throws(
    () => classificationImagePayload(Buffer.from('unsupported format').toString('base64')),
    /Unsupported classification image format/,
  );

  result = await run(async () => output({ ...wrapper, dominantRgb: [255, 0, 0] }));
  assert.equal(result.response.status, 200, 'colour correction behavior is retained');
  assert.ok(!lines.join('\n').includes('dominantRgb corrected'));
  assert.ok(!lines.join('\n').includes('derived-hue'));
  assert.ok(!lines.join('\n').includes('derived-sat'));

  result = await run(async () => output({ ...wrapper, fabric: 'aso-oke' }));
  assert.equal(result.response.status, 200, 'unsupported textile field does not fail the garment');
  assert.equal(result.response.body.fabric, undefined, 'unsupported fabric is not invented');

  for (const [body, code] of [
    [{ candidates: [] }, 'MALFORMED_JSON'],
    [{ candidates: [{ content: { parts: [{ text: '{broken-json' }] } }] }, 'MALFORMED_JSON'],
    [{ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...wrapper, subType: 'not-real' }) }] } }] }, 'INVALID_SCHEMA'],
  ] as const) {
    result = await run(async () => ({ status: 200, data: body }));
    assert.equal(result.response.status, 502);
    assert.equal(result.response.body.error, 'classifier_malformed_response');
    assert.equal(result.traces.at(-1).outcomeCode, 'MALFORMED_RESPONSE');
    assert.equal(result.traces.at(-1).modelAttempts.at(-1).outcomeCode, code);
  }

  let calls = 0;
  result = await run(async () => {
    calls++;
    throw { isAxiosError: true, response: { status: 429, data: 'raw-secret-provider-body' } };
  });
  assert.equal(calls, 3, '429 retries the primary once then tries the fallback');
  assert.equal(result.response.status, 429);
  assert.equal(result.response.body.error, 'rate_limited');
  assert.equal(result.traces.at(-1).modelAttempts.at(-1).model, 'gemini-2.5-flash');
  assert.equal(result.traces.at(-1).attemptCount, 3);
  assert.ok(!lines.join('\n').includes('raw-secret-provider-body'));

  result = await run(async () => { throw { isAxiosError: true,
    response: { status: 503, data: 'raw-secret-provider-body' } }; });
  assert.equal(result.response.status, 502);
  assert.equal(result.response.body.error, 'classifier_upstream_failure');
  assert.equal(result.traces.at(-1).providerStatus, 503);
  assert.ok(!lines.join('\n').includes('raw-secret-provider-body'));

  result = await run(async () => { throw { code: 'ECONNABORTED', message: 'timeout' }; });
  assert.equal(result.response.status, 504);
  assert.equal(result.response.body.error, 'classifier_timeout');
  assert.equal(result.traces.at(-1).outcomeCode, 'REQUEST_TIMEOUT');

  result = await run(async () => { throw { isAxiosError: true, message: 'Network Error' }; });
  assert.equal(result.response.status, 503);
  assert.equal(result.response.body.error, 'classifier_network_failure');
  assert.equal(result.traces.at(-1).outcomeCode, 'NETWORK_ERROR');

  result = await run(async () => output({ ...wrapper, displayName: { invalid: true } }));
  assert.equal(result.response.status, 500, 'unexpected processing failure is not a garment refusal');
  assert.equal(result.response.body.error, 'classification_failed');
  assert.equal(result.traces.at(-1).outcomeCode, 'INTERNAL_ERROR');

  result = await run(async () => output({ refused: true, reason: 'Please photograph a wearable garment.' }));
  assert.equal(result.response.status, 422);
  assert.equal(result.response.body.error, 'content_guardrail');
  assert.equal(result.traces.at(-1).outcomeCode, 'CONTENT_GUARDRAIL');
  assert.ok(!lines.join('\n').includes('Please photograph a wearable garment.'));
  console.log = originalLog;
  console.log('GU-17 mocked HTTP diagnostics and failure mapping passed');
} finally {
  axios.post = originalPost;
  console.info = originalInfo;
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
}
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});