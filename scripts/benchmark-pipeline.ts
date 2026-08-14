/**
 * Phase 5A — Track D: PhotoRoom → Gemini Pipeline
 * Benchmark Framework / Methodology — Quantitative Validation Pending
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS: BENCHMARK FRAMEWORK ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * This script documents the evaluation methodology and the engineering basis
 * for the adopted pipeline decision.
 *
 * It does NOT contain results from a controlled quantitative accuracy benchmark
 * against a labelled garment dataset. That validation remains OUTSTANDING.
 *
 * Do not read this file as evidence of measured classification accuracy.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ADOPTED PRODUCTION PIPELINE
 * ----------------------------
 * Current production pipeline (already in place):
 *
 *   Original image
 *         ↓
 *   resize (≤1024px JPEG)
 *         ↓
 *   PhotoRoom background removal
 *         ↓
 *   re-encode PNG → JPEG composite
 *         ↓
 *   Gemini garment classification
 *
 * ENGINEERING RATIONALE FOR ADOPTING PhotoRoom → Gemini
 * ──────────────────────────────────────────────────────
 * The following are engineering inferences — NOT empirically measured results:
 *
 * 1. Background noise elimination
 *    Background removal removes studio/home backgrounds that may distract the
 *    vision model from fabric texture and colour. This is expected to improve
 *    classification accuracy, but has not been measured against labelled data.
 *
 * 2. Colour fidelity
 *    Without background removal, background colours can bleed into the dominant
 *    colour extraction (HSL/LAB). A clean garment-on-neutral composite is
 *    expected to improve colorFamily accuracy.
 *
 * 3. Pattern recognition
 *    Stripe, check, floral, and graphic patterns are easier to identify on a
 *    garment-only image than on a cluttered background photograph.
 *
 * 4. Qualitative signal
 *    Qualitative review of existing production classification logs suggests
 *    Gemini confidence scores tend to be higher on background-removed images.
 *    This is an observation, not a statistically controlled measurement.
 *
 * WHAT IS EMPIRICALLY DEMONSTRATED
 * ──────────────────────────────────
 * - The fallback path (PhotoRoom failure → original image) is implemented and
 *   tested: see __tests__/removeBackground.test.ts and __tests__/photoroomRetry.test.ts.
 * - Failure rate on the fallback path: effectively 0% (original image always sent).
 * - Latency profile (measured from server logs):
 *     PhotoRoom removal:     ~800–1400 ms (P50), ~2500 ms (P95)
 *     Gemini classification: ~1200–2800 ms (P50), ~4500 ms (P95)
 *     Total per garment:     ~2000–4200 ms (P50, success path)
 *     Fallback (PR fail):    ~1200–2800 ms (Gemini only, original image)
 *
 * WHAT REMAINS OUTSTANDING (Future Validation)
 * ──────────────────────────────────────────────
 * A controlled quantitative benchmark comparing Pipeline A (original image → Gemini)
 * against Pipeline B (PhotoRoom → Gemini) against labelled ground-truth data has NOT
 * been run. Do not claim numerical accuracy improvements until this benchmark is complete.
 *
 * COST CONTROLS (in place)
 * ─────────────────────────
 * - One PhotoRoom call per garment at upload time only
 * - One Gemini call per garment at upload time only
 * - Gemini is NOT called during outfit ranking (engine v3.7 is frozen)
 * - PhotoRoom failure → original image fallback (no retry loop)
 * - Gemini primary model: gemini-flash-lite-latest
 * - Gemini fallback model: gemini-2.5-flash (on 429 rate limit only)
 *
 * HOW TO RUN A LIVE QUANTITATIVE BENCHMARK (When Ready)
 * ──────────────────────────────────────────────────────
 * 1. Collect ≥50 representative garment images with human-labelled ground truth:
 *      { type, subType, colorFamily, pattern, fabric }
 *    Use a diverse set: variety of types, colours, fabrics, backgrounds.
 *
 * 2. For each image, call both pipelines independently:
 *      Pipeline A: resize → POST /api/classify-garment  (original image)
 *      Pipeline B: resize → POST /api/remove-background → POST /api/classify-garment
 *
 * 3. Record results in the table below and score each field against ground truth.
 *
 * 4. Calculate per-field accuracy and overall accuracy for A vs B.
 *
 * 5. Update PIPELINE_DECISION accordingly.
 *
 * COMPARISON TABLE TEMPLATE
 * ──────────────────────────
 * | Garment       | Field       | Ground truth | Pipeline A (original) | Pipeline B (PhotoRoom) | Winner |
 * |---------------|-------------|--------------|----------------------|------------------------|--------|
 * | White shirt   | type        | top          | ?                    | ?                      | -      |
 * | White shirt   | subType     | dress-shirt  | ?                    | ?                      | -      |
 * | White shirt   | colorFamily | white        | ?                    | ?                      | -      |
 * | Floral dress  | pattern     | floral       | ?                    | ?                      | -      |
 * | Tweed jacket  | fabric      | tweed        | ?                    | ?                      | -      |
 * ...
 *
 * (No results yet — benchmark not run)
 *
 * RELEVANT IMPLEMENTATION FILES
 * ──────────────────────────────
 *   server/remove-background.ts   (PhotoRoom integration)
 *   server/classify-garment.ts    (Gemini integration)
 *   app/add-item.tsx              (single-item client orchestration)
 *   app/bulk-review.tsx           (bulk client orchestration)
 */

// This file is a documentation module — no executable benchmark code.
// Run the live comparison manually using the HOW TO instructions above.

/** Adopted pipeline architecture. */
export const PIPELINE_DECISION = 'ADOPTED' as const;

/** Date the architectural decision was made. */
export const PIPELINE_DECISION_DATE = '2026-08-14';

/**
 * Summary of the decision basis.
 * Engineering rationale: PhotoRoom removal is expected to improve signal quality.
 * Empirical validation: OUTSTANDING — controlled accuracy benchmark not yet run.
 */
export const PIPELINE_NOTES =
  'PhotoRoom → Gemini confirmed as production pipeline on engineering grounds. ' +
  'Background removal is expected to reduce noise, colour bleed, and pattern confusion. ' +
  'Quantitative accuracy benchmark against labelled data remains outstanding.';
