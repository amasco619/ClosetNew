import axios from "axios";
import { deflateSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildGeminiGenerationRequest, getClassifierModelOrder } =
  require("../server/classifierReliability.ts");

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createProbeImage() {
  const width = 16;
  const height = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x++) {
      const pixel = 1 + x * 4;
      row[pixel] = 232;
      row[pixel + 1] = 226;
      row[pixel + 2] = 214;
      row[pixel + 3] = 255;
    }
    rows.push(row);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND"),
  ]).toString("base64");
}

function providerErrorCode(error) {
  const status = error?.response?.status;
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_ERROR";
  if (Number.isInteger(status) && status >= 500) return "PROVIDER_SERVER_ERROR";
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "REQUEST_TIMEOUT";
  return Number.isInteger(status) ? "PROVIDER_HTTP_ERROR" : "NETWORK_ERROR";
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required; its value is never printed.");

  const imageBase64 = createProbeImage();
  const models = getClassifierModelOrder();
  let failed = false;

  for (const model of models) {
    const startedAt = performance.now();
    try {
      const request = buildGeminiGenerationRequest({
        model,
        apiKey,
        baseRequestBody: {
          contents: [{
            role: "user",
            parts: [
              { text: 'This is a synthetic test image. Return only {"probe":"ok"} as JSON.' },
              { inlineData: { mimeType: "image/png", data: imageBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        },
        maxOutputTokens: 32,
        timeout: 8_500,
        signal: AbortSignal.timeout(8_500),
      });
      const response = await axios.post(request.url, request.body, request.config);
      const text = response.data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text ?? "")
        .join("");
      let validJson = false;
      try {
        validJson = JSON.parse(text)?.probe === "ok";
      } catch {
        // The result line reports a failed validity check without exposing provider text.
      }
      const ok = response.status === 200 && validJson;
      failed ||= !ok;
      console.log(JSON.stringify({
        model,
        status: response.status,
        latencyMs: Math.round(performance.now() - startedAt),
        validJson,
        modelVersion: response.data?.modelVersion ?? null,
      }));
    } catch (error) {
      failed = true;
      console.log(JSON.stringify({
        model,
        status: error?.response?.status ?? null,
        errorCode: providerErrorCode(error),
        latencyMs: Math.round(performance.now() - startedAt),
      }));
    }
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message ?? "Gemini generation probe failed.");
  process.exitCode = 1;
});
