# Amodka — Nigeria/Africa Market Readiness

**Phase 5B.1 | Date:** 2026-08-14  
**Launch strategy:** Nigeria/Africa → UK → Global  
**Status:** Technical assessment and compliance analysis. LEGAL REVIEW REQUIRED before launch.

---

## 1. Scope

This document covers Nigeria/Africa as the initial commercial beachhead. It distinguishes requirements that are Nigeria-specific from those that apply to UK expansion and global expansion. Amodka must remain globally capable while being demonstrably ready for Nigerian/African fashion, climate, privacy and compliance requirements.

---

## 2. Nigeria Data Protection — NDPA 2023

### 2.1 Applicable Law

**Nigeria Data Protection Act 2023 (NDPA)** — signed into law in June 2023, replacing the Nigeria Data Protection Regulation 2019 (NDPR).  
**Regulator:** Nigeria Data Protection Commission (NDPC), established by the NDPA.  
**GAID 2025:** General Application and Implementation Directive 2025 (GAID), issued by NDPC, supplements the NDPA with implementation guidance.

### 2.2 Territorial Applicability

**Assessment:** The NDPA applies to:
- Data controllers and processors established in Nigeria; AND
- Controllers or processors NOT established in Nigeria who process personal data of data subjects in Nigeria.

Amodka is not (currently) incorporated in Nigeria. However, it will target Nigerian users as its initial commercial market. The NDPA's extraterritorial reach — similar to GDPR Article 3 — means the NDPA **applies to Amodka from day one of Nigerian-user onboarding.** LEGAL REVIEW REQUIRED to confirm.

### 2.3 Controller / Processor Roles

| Entity | Role under NDPA |
|---|---|
| Amodka (operator) | **Data Controller** — determines purposes and means of processing |
| Supabase | **Data Processor** — processes on behalf of Amodka |
| Google Gemini | **Data Processor** — processes garment images for classification |
| PhotoRoom | **Data Processor** — processes garment images for background removal |
| Open-Meteo | **Service provider** — no personal data beyond IP (likely not a processor) |
| ipapi.co | **Processor / third party** — REQUIRES VERIFICATION |

### 2.4 Data Subject Rights under NDPA

| Right | NDPA basis | Current Amodka status |
|---|---|---|
| Right of access | NDPA s.34 | Partial — in-app wardrobe and profile visible; no formal export |
| Right to rectification | NDPA s.35 | ✅ In-app profile and item edit screens |
| Right to erasure | NDPA s.36 | ✅ In-app account deletion (Phase 5B fixed) |
| Right to data portability | NDPA s.37 | ❌ Not implemented |
| Right to object | NDPA s.38 | ❌ Not implemented |
| Right to restrict processing | NDPA s.39 | ❌ Not implemented |
| Right not to be subject to automated decisions | NDPA s.40 | Partially addressed — outfit scoring is not a legally significant automated decision, but review needed for subscription enforcement |

**Priority for Nigeria launch:** erasure (✅), rectification (✅), access (partial). Portability and objection are medium-priority obligations.

### 2.5 Lawful Bases for Processing (Nigeria)

Under the NDPA, processing requires a lawful basis. Key bases Amodka may rely on:

| Processing activity | Proposed lawful basis | Notes |
|---|---|---|
| Account creation (email, password) | Performance of contract | Standard |
| Profile data (body type, style goals) | Performance of contract | Core service delivery |
| Skin tone | **LEGAL REVIEW REQUIRED** | May require consent — see §9 |
| Garment photos | Performance of contract + Consent for AI processing | AI processing of images by third parties (Gemini, PhotoRoom) may need separate disclosure or consent |
| Wear history, affinity signals | Performance of contract / Legitimate interests | Recommendation improvement |
| Location data (GPS) | Consent | Device permission already required |
| IP geolocation (ipapi.co) | Legitimate interests | LEGAL REVIEW REQUIRED |
| Telemetry | Legitimate interests | Low PII risk; opaque user ID |

### 2.6 Sensitive Data under NDPA

The NDPA s.30 identifies "special categories of personal data" requiring explicit consent:
- Racial or ethnic origin
- Political opinions
- Religious or other beliefs
- Trade union membership
- Genetic data
- Biometric data for the purpose of uniquely identifying a person
- Health data
- Data concerning sex life or sexual orientation

**Skin tone assessment (Nigeria):** See §9 of this document.

**Garment photos:** Photographs may reveal religious dress (hijab, church attire, traditional dress), ethnic affiliation (Ankara prints, cultural garments), or other sensitive characteristics. **LEGAL REVIEW REQUIRED** as to whether consent is required under NDPA s.30 for this indirect inference risk.

### 2.7 Children's Data (Nigeria)

The NDPA does not set a fixed age of digital consent in the main Act, but NDPC guidance and GAID 2025 address child data protection. The NDPC's approach aligns with international standards requiring enhanced protections for children under 18.

**Current Amodka position:** No age gate, no age verification. See §8 of this document for full assessment.

### 2.8 International Transfers (Nigeria)

The NDPA Chapter 7 regulates cross-border transfers of personal data. Transfer of Nigerian data subjects' data to other countries is permitted only where:
- The destination country provides adequate protection; OR
- Appropriate safeguards are in place (binding agreements, standard contractual clauses, etc.); OR
- The data subject has consented; OR
- The transfer is necessary for the performance of a contract.

See §3 (Cross-Border Transfer Map) for the detailed transfer analysis.

### 2.9 Security Requirements (NDPA s.38)

The NDPA requires appropriate technical and organisational security measures. Amodka's current security posture:

| Requirement | Status |
|---|---|
| Access control (RLS) | ⚠️ Migration written; operator must apply |
| Private storage bucket | ⚠️ Code ready; operator must set PRIVATE |
| Encrypted transmission (HTTPS/TLS) | ✅ All API calls use HTTPS |
| Authentication with strong credentials | ✅ Supabase Auth with email/password |
| Rate limiting (brute-force protection) | ✅ Implemented (sign-in lockout, endpoint rate limits) |
| Server-only secrets | ✅ GEMINI_API_KEY, PHOTOROOM_API_KEY, SUPABASE_SECRET_KEY never in client bundle |
| Account deletion (erasure) | ✅ Fixed in Phase 5B |
| Incident response plan | ❌ Not documented |

### 2.10 Breach Management (NDPA s.40)

The NDPA requires notification of the NDPC within 72 hours of becoming aware of a personal data breach that is likely to result in risk to data subjects.

**Current status:** Amodka has no formal incident response plan or breach notification procedure. **PRE-LAUNCH: An incident response procedure must be documented.** Key elements:
- Designated contact for data breach reports
- Escalation procedure to NDPC within 72h
- Communication plan for affected data subjects
- Logging and documentation of all breaches

### 2.11 Registration / Compliance Obligations (NDPA)

Under the NDPA, data controllers processing personal data of Nigerian residents may be required to:
- Register with the NDPC (depending on scale and sensitivity of processing)
- Designate a Data Protection Officer (DPO) if processing significant volumes of data
- Maintain records of processing activities (Article 30-equivalent)

**LEGAL REVIEW REQUIRED:** Confirm with Nigerian data protection counsel whether registration with NDPC is required at launch scale, and whether a DPO designation is required.

---

## 3. Cross-Border Transfer Map

### 3.1 Transfer Flow

```
Nigerian User (data subject)
       │
       ↓ [creates account, uploads wardrobe, uses app]
Amodka Application (data controller)
       │
       ├──► Supabase (USA / EU — region TBD)
       │        Data: all user data, wardrobe images, behavioural data
       │        Transfer mechanism: REQUIRES VERIFICATION
       │        Legal basis proposed: performance of contract + appropriate safeguards
       │
       ├──► Google Gemini (USA)
       │        Data: garment photographs (image bytes only; no user identity)
       │        Transfer mechanism: REQUIRES VERIFICATION
       │        Legal basis proposed: performance of contract + processor agreement
       │
       ├──► PhotoRoom (France / EEA)
       │        Data: garment photographs (image bytes only; no user identity)
       │        Transfer mechanism: REQUIRES VERIFICATION — Nigeria → EEA adequacy not confirmed
       │        Legal basis proposed: performance of contract + processor agreement
       │
       ├──► Open-Meteo (Switzerland)
       │        Data: GPS coordinates, IP address (implicit)
       │        Transfer mechanism: REQUIRES VERIFICATION — Nigeria → Switzerland adequacy not confirmed
       │        Legal basis proposed: consent (location permission)
       │
       └──► ipapi.co (country unknown)
                Data: IP address (implicit in HTTP request)
                Transfer mechanism: REQUIRES VERIFICATION
                Legal basis proposed: legitimate interests — REQUIRES LEGAL REVIEW
```

### 3.2 Transfer Mechanism Table

| Provider | Country/Region | Data transmitted | Where data leaves Nigeria | Transfer mechanism | Mechanism verified? | Legal review |
|---|---|---|---|---|---|---|
| Supabase | USA (likely AWS us-east-1 or eu-west-1) | All personal data (auth, DB, Storage) | Yes — primary transfer | DPA + SCCs or approved instrument | ❌ Not verified | LEGAL REVIEW REQUIRED |
| Google Gemini | USA (Google LLC) | Garment images (no user identity) | Yes | Google Cloud DPA + SCCs | ❌ Not verified | LEGAL REVIEW REQUIRED |
| PhotoRoom | France (PhotoRoom SAS) | Garment images (no user identity) | Yes (EEA) | DPA + SCCs or adequacy | ❌ Not verified | LEGAL REVIEW REQUIRED |
| Open-Meteo | Switzerland | GPS coordinates (no user identity) | Yes | Unknown — free API, no DPA | ❌ Not verified | LEGAL REVIEW REQUIRED |
| ipapi.co | Unknown | IP address (implicit) | Yes | Unknown — free API, no DPA | ❌ Not verified | LEGAL REVIEW REQUIRED — consider removing |
| Apple App Store | USA | App binary; (future) payment data | Yes | Apple Developer Agreement | Subject to Apple T&Cs | Review for Nigeria compliance |
| Google Play | USA | App binary; (future) payment data | Yes | Google Play Dev Agreement | Subject to Google T&Cs | Review for Nigeria compliance |

**Critical finding:** No cross-border transfer mechanism has been verified for any processor. Under the NDPA, transfers without an appropriate mechanism are unlawful. This is a **launch blocker** unless legal counsel confirms a valid basis for each transfer.

### 3.3 Adequacy Decisions (Nigeria)

The NDPC has not published a list of countries it considers to provide adequate data protection (as of the Phase 5B.1 assessment date). Do not assume adequacy exists for any destination country. **LEGAL REVIEW REQUIRED** to determine the appropriate transfer instrument for each processor.

---

## 4. Nigeria Consumer Protection

### 4.1 Applicable Framework

**Federal Competition and Consumer Protection Commission (FCCPC)** administers the Federal Competition and Consumer Protection Act 2018 (FCCPA). The FCCPC has issued e-commerce guidelines requiring:
- Clear and prominent pricing disclosure
- Plain-language terms and conditions
- Full disclosure of subscription terms before purchase
- Accessible complaint and redress mechanisms
- No misleading marketing

**NDPC** / FCCPC may jointly regulate digital services targeting consumers.

### 4.2 Subscription Disclosures (Phase 5C+)

When the Premium subscription is introduced, Nigeria-specific requirements include:
- **Price must be displayed in Nigerian Naira (NGN)** alongside any other currency. USD-only pricing is insufficient for Nigerian consumers.
- **Auto-renewal must be prominently disclosed** before the user commits to a subscription.
- **Cancellation method must be clearly stated** — both in-app and via the Google Play / App Store subscription management screens.
- **Trial terms** (if any) must clearly state when billing begins.
- **Refund policy** must be communicated. Refunds via Apple/Google are subject to their policies. Amodka should clarify what, if any, direct refund rights exist.

### 4.3 Complaint Handling

The FCCPA requires businesses to provide accessible complaint mechanisms. Amodka must implement:
- A clearly identified support email or contact form accessible from within the app and the store listing
- A response time commitment (FCCPC guidance suggests prompt handling)
- An escalation path if the initial complaint is not resolved
- Knowledge of consumer's right to escalate to the FCCPC

### 4.4 Marketing and Communications (Nigeria)

- Marketing communications targeting Nigerian users must not be misleading
- Claims about AI capabilities (e.g. "perfect outfit recommendations") must be accurate and qualified
- Free-trial or promotional offers must clearly state eligibility, duration, and conversion terms
- App Store and Google Play metadata descriptions must be accurate and not exaggerated

### 4.5 Terms of Use — Nigeria Considerations

The Terms of Use source material (`docs/compliance/terms-source.md`) must be updated to reflect:
- Nigerian jurisdiction (if Amodka operates under Nigerian law for Nigerian users) — **LEGAL REVIEW REQUIRED**
- Plain-language writing requirement (FCCPC guidance: terms must be understandable)
- Consumer rights under FCCPA that cannot be excluded
- Complaint resolution process

---

## 5. Age / Children Assessment — Nigeria, UK, Global

### 5.1 Current Behaviour

- No age gate
- No age verification
- No minimum age stated in any published terms
- App collects appearance data (body type, skin tone, style goals) from any user who creates an account or uses the app in guest mode

### 5.2 Likely Exposure

A fashion styling app has obvious appeal to teenagers. The App Store and Google Play do not restrict access by default for general fashion apps rated "Everyone" or equivalent. Without an explicit age gate, children under any locally-relevant minimum age may create accounts.

### 5.3 Jurisdiction-by-Jurisdiction Assessment

| Jurisdiction | Minimum digital age of consent | Key regulation | Whether Amodka is "likely to be accessed by children" | Implication |
|---|---|---|---|---|
| **Nigeria** | 18 (under NDPA — children are persons under 18) | NDPA + NDPC guidance | YES — likely | Processing of children's data requires heightened protection; explicit consent of parent/guardian may be required for children under 18 |
| **UK** | 13 (Age Appropriate Design Code / UK GDPR Art 8) | ICO Children's Code | YES — fashion apps are used by teenagers | If "likely to be accessed by children under 18," the Children's Code applies; profiling (including outfit personalisation based on appearance data) is restricted without explicit consent |
| **Global (EU)** | 16 (default GDPR); lower in some member states (min 13) | GDPR Art 8 | YES — similar reasoning to UK | Similar to UK; varies by member state |

### 5.4 Implications of Profiling Children

Amodka's recommendation engine builds a personal style profile including appearance data. Under the UK Children's Code:
- Profiling of children for targeted purposes requires explicit consent from the child (if old enough) or parent/guardian
- Default settings must be the most privacy-protective
- Nudge techniques that encourage data sharing are prohibited

Under the NDPA, children's data (persons under 18) requires heightened protection.

### 5.5 Skin Tone and Appearance Data for Children

Collecting skin tone, body type, and other appearance attributes from children raises additional sensitivity concerns in all three jurisdictions. Even if these attributes are not themselves special-category data for adults, they may be treated with heightened protection when collected from minors.

### 5.6 Recommended Age Strategy

**LEGAL REVIEW REQUIRED** before implementing. Technical options:

| Option | Description | Complexity |
|---|---|---|
| A — Age gate at onboarding | Require user to confirm age ≥ 18 (or appropriate minimum) at account creation | Low — UI only |
| B — Age assurance | Collect date of birth; restrict access for underage users | Medium — data handling implications |
| C — Self-certification | User ticks "I am over 18" checkbox | Low — limited legal protection; NDPC/ICO may require more |
| D — No age gate | Accept risk; apply most-restrictive privacy defaults to all users | Not recommended if Children's Code applies |

**Recommendation:** Implement Option A (age gate at onboarding, self-declaration of 18+) as a minimum for Nigeria and UK launch. This alone may not satisfy all regulatory requirements but reduces exposure. Legal counsel to advise whether a more robust mechanism is required.

**Do not implement an age gate until the legal/product decision is made.** This document records the requirement; implementation is conditional on legal sign-off.

---

## 6. Skin Tone Data Assessment

### 6.1 How It Is Collected

- Self-declared by the user during onboarding via a multiple-choice selector
- The user selects from a predefined set of skin tone options (e.g. "fair", "light", "medium", "tan", "brown", "dark")
- Amodka does not infer skin tone from photographs
- The value is stored in Supabase `user_profiles.skin_tone`

### 6.2 Why It Is Used

- Colour-harmony recommendations: the engine uses skin tone to suggest garment colours that complement the user's complexion
- It is one input among many in the recommendation profile (alongside eye colour, hair colour, contrast level)
- It is NOT used for any purpose other than styling recommendations
- It is NOT shared with third parties in identifiable form (telemetry uses anonymised dimensions)

### 6.3 Whether It Is Inferred

- **Not inferred.** Amodka does not analyse photographs to determine skin tone
- The value is entirely self-declared
- Gemini receives only garment images — never person images; skin tone cannot be inferred from those images

### 6.4 Whether It Is Combined With Other Attributes

Yes. Skin tone is combined with body type, eye colour, hair colour, face shape, and style goals to form a complete style profile. This combination creates a richer personal profile than any single attribute.

### 6.5 Nigeria Assessment

**The NDPA s.30 lists "racial or ethnic origin" as a special category.** Whether skin tone constitutes racial or ethnic origin data under the NDPA is a legal question. Arguments on both sides:

- **For special-category:** Skin tone, when used in a profile, can correlate with racial or ethnic identity. The NDPC may interpret it as data "relating to" racial or ethnic origin. Processing without explicit consent would be unlawful.
- **Against special-category:** The user self-selects a colour category for purely aesthetic purposes. The data is not used to identify, categorise, or profile the user by race or ethnicity. A court or regulator would need to assess the specific context.

**LEGAL REVIEW REQUIRED (Nigeria):** A Nigerian data protection solicitor must advise whether explicit consent under NDPA s.30 is required for skin tone processing.

### 6.6 UK Assessment

**UK GDPR Article 9 lists "racial or ethnic origin" as a special category.** The ICO's guidance on special category data indicates that whether data "relates to" racial or ethnic origin depends on the context, purpose, and likely inferences. The same arguments apply as for Nigeria.

The ICO has noted that purely aesthetic colour references are less likely to be considered racial/ethnic data than, for example, a field that asks users to categorise themselves by racial group. A skin tone selector for fashion purposes sits in a grey area.

**LEGAL REVIEW REQUIRED (UK):** A UK data protection solicitor (GDPR-qualified) must advise before Amodka processes UK users' skin tone data at scale.

### 6.7 Interim Approach

Until legal review is complete:
- Do not advertise skin tone processing as a product feature
- Ensure the Privacy Policy (when published) accurately describes the purpose and scope of skin tone use
- Consider making skin tone input optional (users can skip it; the engine falls back to neutral recommendations)
- Do not sell, license, or share skin tone data with any third party

---

## 7. UK Expansion Considerations

When Amodka expands to UK users, in addition to Nigeria requirements already analysed:

| Requirement | Status |
|---|---|
| UK GDPR compliance | Full DPIA required (see docs/compliance/dpia-screening.md) |
| ICO registration | Required for most UK data controllers — **LEGAL REVIEW REQUIRED** |
| Children's Code compliance | Required if likely to be accessed by children |
| Cookie consent | Not applicable for native mobile app; may apply to web version |
| Privacy Policy in plain English | Required before UK launch |
| Right to portability (UK GDPR Art 20) | Not implemented |
| International transfer mechanisms | UK SCCs / IDTA for each processor |
| Age assurance | ICO Children's Code may require robust age assurance |

---

## 8. Global Expansion Considerations

When Amodka expands beyond Nigeria and UK:

| Region | Key regulation | Priority action |
|---|---|---|
| European Union | GDPR | Full GDPR compliance review; DPA with each processor; DPO if required |
| United States | CCPA (California), state-level laws | CCPA compliance for California users; assess state-by-state |
| Canada | PIPEDA / CPPA | Privacy notice and consent requirements |
| South Africa | POPIA | Registration with Information Regulator; data subject rights |
| Ghana | Data Protection Act 2012 | Registration with Data Protection Commission |
| Kenya | Data Protection Act 2019 | Registration with ODPC; cross-border transfer requirements |

**For Africa expansion beyond Nigeria:** Each jurisdiction has its own data protection law. A single Africa-wide compliance approach does not exist. Country-by-country legal review is required.

---

## 9. Pre-Launch Summary

### Nigeria Launch Blockers (Compliance)

| # | Blocker | Severity |
|---|---|---|
| NB-01 | No cross-border transfer mechanism verified for any processor | 🔴 CRITICAL |
| NB-02 | No Privacy Policy published | 🔴 CRITICAL |
| NB-03 | No Terms of Use published | 🟠 HIGH |
| NB-04 | Skin tone legal basis not confirmed (Nigeria) | 🔴 CRITICAL |
| NB-05 | No NDPC registration assessment completed | 🟠 HIGH |
| NB-06 | No incident response / breach notification procedure | 🟠 HIGH |
| NB-07 | No age gate / age assessment not legally determined | 🟠 HIGH |
| NB-08 | No data portability / right-to-object implementation | 🟡 MEDIUM |
| NB-09 | FCCPC compliance for subscription (pricing in NGN, cancellation terms) | PHASE 5C |

### Nigeria Launch Enablers (Technical — Phase 5B.1 Complete)

- ✅ Account deletion: complete storage + DB + auth cleanup
- ✅ AsyncStorage cleared on account deletion
- ✅ Signed URL architecture (private bucket ready — operator action pending)
- ✅ RLS migration written — operator action pending
- ✅ Rate limiting and brute-force protection
- ✅ Server-only secrets
- ✅ Recommendation engine: weather-aware (works for tropical climates)
