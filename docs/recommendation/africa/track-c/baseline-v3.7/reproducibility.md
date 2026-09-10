# Reproducibility

- Benchmark: `1.0.0-frozen`
- Engine: `3.7`
- Commit: `8fd970d6a0267096bac89ebb5d38673b2d340bc2`
- Execution date: 2026-09-10 (Africa/Lagos)
- Runtime: Node v22.22.0; npm 10.9.4
- Raw outputs: 100 case files plus `summary.json`, sealed by `RAW-SHA256SUMS`
- Full hashes/configuration: `execution-manifest.json`
- Runner: `scripts/run-africa-benchmark.ts`
- Evaluator: `scripts/evaluate-africa-benchmark.ts`

GU classification used the unchanged production handler with `gemini-flash-lite-latest`, fallback `gemini-2.5-flash` on 429, and temperature 0.1. The mutable `latest` alias means future GU reruns may not be byte-identical even with identical images.
