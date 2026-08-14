# Amodka — DPIA Screening Assessment

**Phase 5B | Date:** 2026-08-14  
**Standard:** ICO DPIA guidance (UK GDPR Article 35 + Schedule 1 DPA 2018)  
**Status:** Preliminary technical assessment. LEGAL REVIEW REQUIRED before finalisation.

---

## Purpose

This document performs an initial DPIA screening assessment to determine whether a full Data Protection Impact Assessment is required before Amodka processes personal data at scale. The ICO's nine criteria for "high risk" processing are assessed below.

This is a technical assessment. It does not constitute legal advice. The conclusion must be reviewed by a qualified data protection solicitor or DPO before launch.

---

## Criterion 1 — Evaluation or scoring (profiling)

**Applies: YES**

Amodka builds a persistent personal profile for each user including: body type, height band, skin tone, eye colour, hair colour, face shape, style goals, lifestyle preferences, industry, and life phase. This profile is used to personalise outfit recommendations via a deterministic recommendation engine.

The engine creates a scored ranking of garment combinations based on individual characteristics. While this is not automated decision-making with legal or similarly significant effects (it recommends clothes, not credit or employment), it constitutes profiling under UK GDPR Article 4(4) — "automatic processing of personal data to evaluate personal aspects relating to a natural person."

Additionally: garment wear history, affinity signals (love/not today/worn reactions), and rotation cursors accumulate over time to create a behavioural profile of clothing preferences and daily habits.

**Risk level:** Medium. The processing is persistent, accumulates over time, and combines multiple personal dimensions. Mitigation: the profile is used solely to recommend clothing; no automated decisions with significant effects are made; users can delete all data.

---

## Criterion 2 — Automated decision-making with legal or similar significant effects

**Applies: MARGINALLY / NOT CURRENTLY**

The recommendation engine makes outfit suggestions. It does not make decisions that produce legal effects or significantly affect users' interests in a legal sense. Recommendations can be ignored, dismissed, or overridden.

Premium gating: automated enforcement of item/outfit quotas based on subscription status could be considered automated decision-making in a commercial sense. The impact is limited — free-tier users can access fewer items, not denied service entirely. Phase 5C must review this.

**Risk level:** Low — currently. **Phase 5C note:** subscription enforcement via server-side claims should be reviewed when payments are implemented.

---

## Criterion 3 — Systematic monitoring

**Applies: PARTIALLY**

Amodka logs every recommendation request to server stdout telemetry: occasion, wardrobe size, weather context, body type, style goal, user_id (opaque). The recommendation engine also records user reactions (love, not_today, worn) and wear history.

This constitutes systematic monitoring of clothing behaviour and lifestyle patterns, though the volume is currently limited (no external analytics SDK, no real-time tracking beyond recommendation events).

**Risk level:** Low-to-medium. The telemetry does not currently leave the server environment, and fields are dimensionalised (not raw profile data). **If a third-party analytics SDK is added in future, this criterion escalates.**

---

## Criterion 4 — Sensitive data or data of a highly personal nature

**Applies: POTENTIALLY**

Categories of data requiring assessment:

- **Skin tone** — the ICO notes that racial or ethnic origin is a special-category data element under UK GDPR Article 9. Skin tone, when inferred or used in a racial context, could constitute such data. When self-disclosed for aesthetic purposes (colour-harmony recommendations), it is less clearly special-category. **LEGAL REVIEW REQUIRED** — a data protection solicitor must advise whether Amodka's specific use of skin tone requires explicit consent under Article 9(2)(a).

- **Body type, height** — physical characteristic data. Not special-category under UK GDPR in isolation; no health data is collected. Lower risk.

- **Garment photos** — may reveal personal characteristics (religious dress, cultural dress, disability-related clothing, maternity clothing). These could indirectly reveal special-category information. **LEGAL REVIEW REQUIRED.**

- **Wear history / behavioural data** — reveals lifestyle patterns. Not special-category, but warrants consideration.

**Risk level:** Medium-to-HIGH for skin tone and garment photos specifically. **Full DPIA section required for these processing activities.**

---

## Criterion 5 — Data processed on a large scale

**Applies: NOT CURRENTLY**

Amodka is pre-launch. Current scale is development/testing accounts only. The ICO notes that "large scale" typically means a significant number of data subjects, a large volume of data, a wide geographical area, or a long duration of processing.

**Risk level:** Low — currently. This criterion must be re-evaluated at launch and at subsequent scale milestones (e.g. 5,000 users, 50,000 users).

---

## Criterion 6 — Matching or combining datasets

**Applies: YES**

Amodka combines:
- Self-disclosed profile data (body type, skin tone, style goals)
- Garment metadata (AI-derived from uploaded photos)
- Behavioural data (wear logs, affinity signals)
- Location-derived data (weather context from GPS/IP)

These are combined to generate a personal style profile and outfit recommendations. This constitutes data combination across multiple sources.

Additionally: ipapi.co derives approximate location from IP address; this is combined with Open-Meteo weather data to infer the user's location.

**Risk level:** Medium. The combination is functional (recommendation-focused) rather than surveillance-oriented, but the depth of profile created warrants careful documentation.

---

## Criterion 7 — Vulnerable data subjects

**Applies: POTENTIALLY**

Amodka does not currently collect age information or implement an age gate. A fashion app could be accessed by persons under 18. The ICO's Children's Code (Age Appropriate Design Code) applies to services "likely to be accessed by children."

**LEGAL REVIEW REQUIRED:** A solicitor must advise whether Amodka is likely to be accessed by children under the ICO's code, and if so, what additional protections are required. This is a launch blocker if the product is available on general app stores without an age gate.

**Risk level:** HIGH if no age gate / age-assurance mechanism exists at launch.

---

## Criterion 8 — Innovative use or new technological application

**Applies: YES**

Amodka uses:
- AI image classification (Google Gemini) applied to personal photographs
- AI background removal (PhotoRoom) applied to personal photographs
- IP-based geolocation (ipapi.co) for location inference

AI applied to personal photographs is explicitly identified by the ICO as an area warranting careful consideration. The use of image AI to derive personal characteristics (style, potentially body type or skin tone) from photos is a novel and evolving area.

**Risk level:** Medium-to-HIGH. The AI processing of personal photographs is an area where ICO guidance is actively developing.

---

## Criterion 9 — Data transfer or prevention of data subjects from exercising their rights

**Applies: PARTIALLY**

Data is transferred to: Supabase (hosted in part on AWS infrastructure; region TBD — REQUIRES VERIFICATION), Google (Gemini API — US-based), PhotoRoom (France-based company; servers TBD — REQUIRES VERIFICATION), ipapi.co (TBD — REQUIRES VERIFICATION).

International transfers of UK personal data to countries outside the UK/EEA require either an adequacy decision, SCCs, or a IDTA (UK-specific). US-based services (Google) require UK-approved SCCs or an equivalent transfer mechanism.

**Risk level:** HIGH — international data transfers without documented transfer mechanisms constitute a significant compliance gap.

---

## Screening Conclusion

**Based on criteria 1, 4, 6, 7, 8, and 9:**

> ⚠️ **DPIA RECOMMENDED / LIKELY REQUIRED — LEGAL REVIEW REQUIRED BEFORE LAUNCH**

The processing involves profiling, AI processing of personal photographs, potential sensitive-category data (skin tone), data combination across multiple sources, possible processing of children's data, and international data transfers. While not all nine criteria are conclusively met at current scale, the ICO guidance indicates that a DPIA should be conducted when in doubt, particularly for novel technologies and sensitive data.

This conclusion must be reviewed by a qualified data protection solicitor or DPO. The DPIA, if required, must be completed before Amodka processes personal data of real users at scale.

---

## Items Requiring Immediate Legal Review Before Launch

1. Whether skin-tone data constitutes special-category data requiring Article 9(2) explicit consent
2. Whether garment photographs, which may reveal protected characteristics, require explicit consent
3. Whether Amodka is likely to be accessed by children (Children's Code applicability)
4. International transfer mechanisms for Supabase, Google Gemini, PhotoRoom, and ipapi.co
5. Whether a full DPIA is mandatory (recommendation: assume yes pending legal review)
6. Lawful basis for each processing activity (likely: contractual necessity, legitimate interests, and/or consent)
