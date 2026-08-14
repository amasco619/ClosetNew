# Amodka — Business Risk Register

**Phase 5B.1 | Date:** 2026-08-14  
**Launch strategy:** Nigeria/Africa → UK → Global  
**Status:** Updated edition incorporating Phase 5B.1 Nigeria/Africa findings.

---

## Severity Scale

- 🔴 **CRITICAL** — major data breach / material financial loss / store rejection / serious legal exposure / irreversible data loss
- 🟠 **HIGH** — significant user harm / meaningful financial leakage / privacy incident / significant operational disruption
- 🟡 **MEDIUM** — needs fixing before or soon after launch
- 🟢 **LOW** — backlog / monitoring

---

## Risk Categories

MONEY · DATA · SECURITY · LEGAL/REGULATORY · PLATFORM · REPUTATION · RELIABILITY · OPERATIONAL

---

## Phase 5B.1 Changes

New risks added: NB-01 through NB-05 (Nigeria-specific).  
R-04 upgraded to ✅ FIXED (account deletion). R-18 upgraded to ✅ FIXED (AsyncStorage clear).  
R-17 upgraded to ✅ FIXED (signed URL cold-start).  
All pre-existing risks retained with updated status.

---

## Risk Register

### NIGERIA-SPECIFIC RISKS (Phase 5B.1)

| # | Finding | Category | Severity | Current protection | Action | Phase |
|---|---|---|---|---|---|---|
| NB-01 | **No cross-border transfer mechanism verified for any processor (Nigeria NDPA)** — NDPA Chapter 7 requires appropriate safeguards for transfers of Nigerian data to other countries. No mechanism documented for Supabase, Google, PhotoRoom, Open-Meteo, or ipapi.co. | LEGAL/REGULATORY | 🔴 CRITICAL | None | LEGAL REVIEW REQUIRED — identify and document transfer mechanism for each processor before Nigerian user onboarding | PRE-LAUNCH |
| NB-02 | **No NDPC registration / compliance assessment** — the NDPA may require registration with the Nigeria Data Protection Commission before processing Nigerian users' data at scale. | LEGAL/REGULATORY | 🟠 HIGH | None | Engage Nigerian data protection counsel to determine registration obligation | PRE-LAUNCH |
| NB-03 | **No incident response / breach notification procedure (Nigeria: 72h NDPC notification)** — the NDPA requires notification to the NDPC within 72 hours of a reportable breach. No formal procedure exists. | LEGAL/REGULATORY · OPERATIONAL | 🟠 HIGH | None — server logging only | Document incident response procedure; designate breach notification contact; prepare NDPC notification template | PRE-LAUNCH |
| NB-04 | **Skin tone legal basis not confirmed under NDPA s.30** — whether skin tone constitutes racial/ethnic origin data under the NDPA requires Nigerian legal advice. Processing without the correct basis is unlawful. | LEGAL/REGULATORY | 🔴 CRITICAL | Self-declared; purpose is aesthetic | LEGAL REVIEW REQUIRED — Nigerian data protection counsel must advise before Nigerian user onboarding | PRE-LAUNCH |
| NB-05 | **No age gate — NDPA treats under-18 as children requiring special protection** — no minimum age is declared or enforced. Children may create accounts and submit appearance data. | LEGAL/REGULATORY | 🟠 HIGH | None | LEGAL REVIEW REQUIRED — determine minimum age and implement appropriate age assurance before Nigerian user onboarding | PRE-LAUNCH |

---

### CRITICAL TECHNICAL RISKS

| # | Finding | Category | Severity | Current protection | Status / Action | Phase |
|---|---|---|---|---|---|---|
| R-01 | **wardrobe-images bucket is PUBLIC** — any person with a storage URL can access any user's garment photos. Phase 5B adds signed-URL code and RLS migration SQL. The operator must still set the bucket to PRIVATE. | DATA · SECURITY · LEGAL | 🔴 CRITICAL | Phase 5B: signed-URL code + RLS migration written. Phase 5B.1: legacy URL migration script created (`scripts/migrate-legacy-storage-urls.ts`). | ⚠️ OPERATOR ACTION REQUIRED — see §Operator Actions. Do NOT set private until legacy migration is run and confirmed. | OPERATOR ACTION |
| R-02 | **Legacy public URLs in DB** — existing rows store full public URLs. Will break when bucket goes private without DB migration. | DATA · RELIABILITY | 🟠 HIGH | Phase 5B.1: migration script written and dry-run ready. | ✅ Migration script ready — must be run and confirmed before bucket goes private. | OPERATOR ACTION |
| R-03 | **RLS not yet applied to application tables** — migration SQL is written but not applied to the Supabase project. | DATA · SECURITY · LEGAL | 🔴 CRITICAL | Phase 5B: migration SQL written and verified. | ⚠️ OPERATOR ACTION REQUIRED — apply migration. Verified SQL correct per Phase 5B.1 review. | OPERATOR ACTION |
| R-04 | **Account deletion gap — Storage + DB not cleaned** | DATA · LEGAL | 🔴 CRITICAL | Phase 5B: server route now explicitly deletes Storage + DB + auth. Phase 5B.1: AsyncStorage also cleared on device. | ✅ FIXED — Phase 5B.1 | — |
| R-05 | **Premium bypass via client-side manipulation** — item count and quota caps enforced client-side only. | MONEY · SECURITY | 🔴 CRITICAL | Server enforces background removal quota. | PHASE 5C — server-authoritative enforcement required. See `docs/compliance/phase5c-payment-architecture.md §5`. | PHASE 5C |
| R-06 | **Premium upgrade endpoint not payment-gated** — `/api/user/upgrade-premium` can be called with valid JWT and no payment. | MONEY · SECURITY | 🔴 CRITICAL | Rate limited (5/hour); auth required. | PHASE 5C — require verified Apple/Google receipt. | PHASE 5C |
| R-07 | **Gemini/PhotoRoom unlimited API calls under rate limit** — motivated user can cycle calls indefinitely. | MONEY · SECURITY | 🟠 HIGH | Per-minute rate limiting. | PHASE 5C — add per-user daily quota server-side. | PHASE 5C |
| R-08 | **Skin tone data — legal basis unconfirmed (UK GDPR)** — may be racial/ethnic origin data under Art 9. | LEGAL/REGULATORY | 🔴 CRITICAL | Self-declared aesthetic purpose. | LEGAL REVIEW REQUIRED (UK + Nigeria). See NB-04 for Nigeria-specific finding. | PRE-LAUNCH |
| R-09 | **No DPIA conducted** — Phase 5B DPIA screening identified multiple high-risk criteria. | LEGAL/REGULATORY | 🔴 CRITICAL | DPIA screening completed (`docs/compliance/dpia-screening.md`). | Commission full DPIA with qualified DPO/solicitor before processing real users at scale. | PRE-LAUNCH |
| R-10 | **No Privacy Policy published** | LEGAL/REGULATORY · PLATFORM | 🔴 CRITICAL | Source material updated for Nigeria-first (this phase). | Commission legal drafting; publish at a stable URL; reference in app and store listings. | PRE-LAUNCH |
| R-11 | **No Terms of Use published** | LEGAL/REGULATORY · PLATFORM | 🟠 HIGH | Source material updated for Nigeria-first (this phase). | Commission legal drafting; publish. | PRE-LAUNCH |
| R-12 | **No age gate** — children may create accounts and submit appearance data. | LEGAL/REGULATORY | 🟠 HIGH | None. | LEGAL REVIEW REQUIRED (Nigeria + UK). See NB-05. | PRE-LAUNCH |
| R-13 | **International data transfers undocumented** — no UK GDPR Chapter V mechanism verified. | LEGAL/REGULATORY | 🟠 HIGH | None documented. | LEGAL REVIEW REQUIRED (UK expansion). NB-01 covers Nigeria. | UK EXPANSION |
| R-14 | **No external account deletion URL** — required by Google Play (and Apple, if applicable) for apps allowing account creation. | PLATFORM | 🟠 HIGH | In-app deletion route exists. | Implement web-based deletion page. **Google Play launch blocker.** | PRE-LAUNCH |

---

### MEDIUM RISKS

| # | Finding | Category | Severity | Status |
|---|---|---|---|---|
| R-15 | **tryon-photos bucket privacy** — bucket may be public; try-on photos contain images of people (higher sensitivity). Phase 5B.1 audit: `uploadTryonPhoto` is UNUSED by any app screen. Bucket exists for schema completeness and future Virtual Try-On feature. | DATA · SECURITY | 🟡 MEDIUM | Phase 5B.1 recommendation: disable the bucket entirely until Virtual Try-On is implemented. If left active, set to PRIVATE. Phase 5B.1 updated `uploadTryonPhoto` to return storage path, not public URL. Operator action: set bucket to PRIVATE or disable. |
| R-16 | **ipapi.co — no DPA / terms verification** — free fallback geolocation; IP address transmitted; terms not verified. | LEGAL/REGULATORY | 🟡 MEDIUM | Options: (a) verify ipapi.co privacy terms and add to processor list; (b) remove call and fail gracefully when GPS unavailable. Option (b) recommended as simpler. |
| R-17 | **Signed URL cold-start** — expired signed URLs on app restart from AsyncStorage cache. | RELIABILITY | 🟡 MEDIUM | ✅ FIXED Phase 5B.1: (1) AsyncStorage now saves storage paths, not signed URLs; (2) cold-start resolution pass in loadData(); (3) AppState foreground refresh added. |
| R-18 | **AsyncStorage not cleared on account deletion** | DATA | 🟡 MEDIUM | ✅ FIXED Phase 5B.1: `AsyncStorage.multiRemove` added to profile.tsx delete flow after successful server deletion. All user-owned keys cleared. |
| R-19 | **No data portability / export** — UK GDPR Art 20 and NDPA s.37 right to data portability. | LEGAL/REGULATORY | 🟡 MEDIUM | Not implemented. Post-launch or pre-launch depending on regulatory timeline. |
| R-22 | **Always-on location permission string in app.json** — `locationAlwaysAndWhenInUsePermission` declared but app only uses foreground. | PLATFORM | 🟡 MEDIUM | Remove before App Store submission. |
| R-23 | **classifyErr.reason exposed in user-visible alert** | REPUTATION | 🟢 LOW | Audit classifier rejection strings to confirm no internal identifiers. |

---

### LOW RISKS

| # | Finding | Category | Severity | Status |
|---|---|---|---|---|
| R-20 | **Affinity signals — 90-day filter at read time but no DB purge** — DB rows older than 90 days accumulate indefinitely. | DATA | 🟢 LOW | Add periodic cleanup job post-launch. |
| R-21 | **No error-tracking / crash reporting** — no Sentry, Bugsnag, or equivalent. Production errors only visible in server stdout. | OPERATIONAL | 🟢 LOW | Add error tracking post-launch (Phase 5C+). |
| NN-01 | **FCCPC consumer protection compliance for subscription (Nigeria)** — when Premium is implemented, NGN pricing, plain-language terms, and complaint mechanism are required. | LEGAL/REGULATORY | 🟢 LOW (deferred to Phase 5C) | Addressed in Phase 5C payment architecture (`docs/compliance/phase5c-payment-architecture.md §2`). |
| NN-02 | **Nigerian fashion taxonomy gaps** — `lace` fabric and `traditional-event` occasion tag not yet added to schema. These are non-breaking additions. | PRODUCT | 🟢 LOW | Add as taxonomy-only changes (no engine modification) when Nigeria launch is imminent. |
| NN-03 | **Gemini classification accuracy for Nigerian garments unverified** — no test dataset of labelled Nigerian garment images exists. | PRODUCT | 🟢 LOW | Create test dataset pre-launch; validate with human stylist. See `docs/recommendation/nigeria-fashion-readiness.md §6.3`. |

---

## Counts by Severity (Phase 5B.1)

| Severity | Count | Fixed this phase |
|---|---|---|
| 🔴 CRITICAL | 9 (R-01, R-03, R-05, R-06, R-08, R-09, R-10, NB-01, NB-04) | R-04 ✅ |
| 🟠 HIGH | 6 (R-07, R-11, R-12, R-13, R-14, NB-02, NB-03, NB-05) | — |
| 🟡 MEDIUM | 5 (R-15, R-16, R-19, R-22, R-23) | R-17 ✅, R-18 ✅ |
| 🟢 LOW | 5 (R-20, R-21, R-23, NN-01, NN-02, NN-03) | — |
