import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import axios from 'axios';
import { classifyGarment, GEMINI_PROMPT } from '../server/classify-garment';

const app = express();
app.use(express.json());
app.post('/api/classify-garment', classifyGarment);
const originalPost = axios.post;
const originalKey = process.env.GEMINI_API_KEY;
const originalInfo = console.info;
const originalLog = console.log;
const originalError = console.error;
const lines: string[] = [];
process.env.GEMINI_API_KEY = 'mock-secret-key';
console.info = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
console.log = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
console.error = (...parts: unknown[]) => { lines.push(parts.join(' ')); };

const imageBase64 = Buffer.from('synthetic gu17 test bytes').toString('base64');
const sha256 = createHash('sha256').update(Buffer.from(imageBase64, 'base64')).digest('hex');
const output = (classification: unknown) => ({
  status: 200,
  data: { modelVersion: 'gemini-2.5-flash-lite', candidates: [
    { content: { parts: [{ text: JSON.stringify(classification) }] } },
  ] },
});
const wrapper = { category: 'bottom', subType: 'wrapper', colorFamily: 'blue',
  displayName: 'Aso-oke wrapper', pattern: 'geometric', modelConfidence: 0.9 };
async function run(mock: () => Promise<unknown>) {
  lines.length = 0;
  axios.post = (async () => mock()) as typeof axios.post;
  const response = await request(app).post('/api/classify-garment')
    .send({ imageBase64, imageMimeType: 'image/png', userId: 'sensitive-user-id' });
  const traces = lines.flatMap(line => {
    try { const value = JSON.parse(line); return value.type?.startsWith('classification') ? [value] : []; }
    catch { return []; }
  });
  assert.match(response.headers['x-classification-id'], /^[\da-f-]{36}$/);
  assert.ok(traces.length > 0);
  assert.ok(traces.every(trace => trace.classificationId === response.headers['x-classification-id']));
  assert.ok(traces.every(trace => !JSON.stringify(trace).includes('sensitive-user-id')));
  assert.ok(!lines.join('\n').includes(imageBase64));
  assert.ok(!lines.join('\n').includes('mock-secret-key'));
  return { response, traces };
}

(async () => {
try {
  let result = await run(async () => output(wrapper));
  assert.equal(result.response.status, 200);
  assert.deepEqual([result.response.body.category, result.response.body.subType,
    result.response.body.pattern, result.response.body.fabric], ['bottom', 'wrapper', 'geometric', undefined]);
  assert.equal(result.traces.at(-1).imageSha256, sha256);
  assert.equal(result.traces.at(-1).imageBytes, Buffer.from(imageBase64, 'base64').length);
  assert.equal(result.traces.at(-1).mimeType, 'image/png');
  assert.equal(result.traces.at(-1).promptSha256, createHash('sha256').update(GEMINI_PROMPT).digest('hex'));
  assert.equal(result.traces.at(-1).modelVersion, 'gemini-2.5-flash-lite');
  assert.equal(result.traces.at(-1).code, 'OK');

  result = await run(async () => output({ ...wrapper, fabric: 'aso-oke' }));
  assert.equal(result.response.status, 200, 'unsupported textile field does not fail the garment');
  assert.equal(result.response.body.fabric, undefined, 'unsupported fabric is not invented');

  for (const [body, code] of [
    [{ candidates: [] }, 'MISSING_JSON'],
    [{ candidates: [{ content: { parts: [{ text: '{broken-json' }] } }] }, 'INVALID_JSON'],
    [{ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...wrapper, subType: 'not-real' }) }] } }] }, 'INVALID_SCHEMA'],
  ] as const) {
    result = await run(async () => ({ status: 200, data: body }));
    assert.equal(result.response.status, 502);
    assert.equal(result.response.body.error, 'classifier_malformed_response');
    assert.equal(result.traces.at(-1).code, code);
  }

  let calls = 0;
  result = await run(async () => {
    calls++;
    throw { isAxiosError: true, response: { status: 429, data: 'raw-secret-provider-body' } };
  });
  assert.equal(calls, 2, '429 tries both existing models');
  assert.equal(result.response.status, 429);
  assert.equal(result.response.body.error, 'rate_limited');
  assert.equal(result.traces.at(-1).modelRequested, 'gemini-2.5-flash');
  assert.equal(result.traces.at(-1).attempt, 2);
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
  assert.equal(result.traces.at(-1).code, 'REQUEST_TIMEOUT');

  result = await run(async () => { throw { isAxiosError: true, message: 'Network Error' }; });
  assert.equal(result.response.status, 503);
  assert.equal(result.response.body.error, 'classifier_network_failure');
  assert.equal(result.traces.at(-1).code, 'NETWORK_ERROR');

  result = await run(async () => output({ ...wrapper, displayName: { invalid: true } }));
  assert.equal(result.response.status, 500, 'unexpected processing failure is not a garment refusal');
  assert.equal(result.response.body.error, 'classification_failed');
  assert.equal(result.traces.at(-1).stage, 'process');
  assert.equal(result.traces.at(-1).code, 'INTERNAL_ERROR');

  result = await run(async () => output({ refused: true, reason: 'Please photograph a wearable garment.' }));
  assert.equal(result.response.status, 422);
  assert.equal(result.response.body.error, 'content_guardrail');
  assert.equal(result.traces.at(-1).code, 'CONTENT_GUARDRAIL');
  assert.ok(!lines.join('\n').includes('Please photograph a wearable garment.'));
  console.log = originalLog;
  console.log('GU-17 mocked HTTP diagnostics and failure mapping passed');
} finally {
  axios.post = originalPost;
  console.info = originalInfo;
  console.log = originalLog;
  console.error = originalError;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
}
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});