# Amodka — Privacy Policy Source Material

**Phase 5B.1 | Date:** 2026-08-14  
**Launch strategy:** Nigeria/Africa → UK → Global  
**Status:** Verified factual source document. NOT polished legal copy.  
**Purpose:** Every statement here is traceable to the actual implementation. This document provides the verified factual information that a solicitor/copywriter will use to draft the published Privacy Policy.

---

## IMPORTANT NOTICE

This document does not constitute Amodka's Privacy Policy.  
It is factual source material for subsequent legal drafting.  
Do not publish this document to users.  
All sections marked **TBD** or **LEGAL REVIEW REQUIRED** require business/legal input before the Privacy Policy is published.

---

## 1. Who Operates Amodka

**TBD — BUSINESS/LEGAL INPUT REQUIRED**

- Legal entity name: TBD
- Jurisdiction of incorporation: TBD
- Registered address: TBD
- ICO registration number (UK): TBD (required if UK-based data controller)
- NDPC registration (Nigeria): TBD (required — LEGAL REVIEW REQUIRED)
- Data controller contact email: TBD
- DPO contact (if required): TBD

The Privacy Policy must be published in a version that covers:
1. **Nigeria (primary launch):** References NDPA 2023 and NDPC; NGN-based contact; NDPC as competent supervisory authority
2. **UK (expansion):** References UK GDPR and Data Protection Act 2018; ICO as supervisory authority; must note that data transfers to non-UK countries require appropriate safeguards
3. **Global:** References applicable law per user jurisdiction

---

## 2. What Data Is Collected and Why

### 2.1 Account and Identity Data

| Data | Why collected | Proposed lawful basis |
|---|---|---|
| Email address | Authentication, account recovery | Performance of contract |
| Password (Supabase hashes server-side; Amodka never sees cleartext) | Authentication | Performance of contract |
| Display name | Personalised greeting | Performance of contract |

### 2.2 Personal Style Profile

Collected during onboarding; editable in profile settings:

| Data | Why collected | Proposed lawful basis |
|---|---|---|
| Body type | Outfit personalisation | Performance of contract / Legitimate interests — TBD |
| Height band | Outfit personalisation | As above |
| Skin tone | Colour-harmony recommendations | **LEGAL REVIEW REQUIRED** — may require explicit consent if classified as racial/ethnic data under NDPA s.30 / UK GDPR Art 9 |
| Eye colour | Colour-harmony recommendations | Performance of contract / Legitimate interests — TBD |
| Hair colour | Colour-harmony recommendations | As above |
| Face shape | Styling recommendations | As above |
| Style goals | Recommendation engine | As above |
| Lifestyle preferences | Recommendation engine | As above |
| Industry / life phase | Contextual recommendations | As above |
| Contrast level | Colour-pairing recommendations | As above |
| Metal preference | Accessory matching | As above |

### 2.3 Wardrobe Content

| Data | Why collected | Proposed lawful basis |
|---|---|---|
| Garment photographs | AI classification; wardrobe management | Performance of contract |
| AI-derived garment metadata | Outfit recommendations | Performance of contract |
| Wear history | Freshness scoring; wear-count display | Performance of contract / Legitimate interests |
| User reactions (love / not today / worn) | Recommendation personalisation | Performance of contract |

### 2.4 Location Data

| Data | Why collected | Proposed lawful basis |
|---|---|---|
| GPS coordinates (foreground permission; Nigeria: Lagos, Abuja) | Weather-aware outfit recommendations | Consent (device permission prompt) |
| IP-derived approximate location (fallback when GPS unavailable) | Weather fallback | Legitimate interests — **LEGAL REVIEW REQUIRED** |

**Note:** Coordinates are used only to fetch weather data and then discarded from server memory. A 6-hour on-device cache is maintained in AsyncStorage.

### 2.5 Technical Data

| Data | Why collected | Proposed lawful basis |
|---|---|---|
| IP address | Rate limiting; implicit in all internet traffic | Legitimate interests |
| Session tokens | Authentication | Performance of contract |
| App usage telemetry (structured JSON, no PII; opaque user ID only) | Service quality monitoring | Legitimate interests |

---

## 3. Third Parties Who Receive Personal Data

### 3.1 Supabase (Supabase Inc., USA)

**What they receive:** All user account data, profile data, wardrobe metadata, wear logs, affinity signals, and garment images.  
**Why:** Infrastructure and database provider.  
**DPA status:** REQUIRES CONTRACT VERIFICATION — Supabase publishes a DPA.  
**Cross-border transfer (Nigeria):** Data leaves Nigeria to US/EU servers. Transfer mechanism: LEGAL REVIEW REQUIRED — likely Standard Contractual Clauses or approved instrument.

### 3.2 Google Gemini (Google LLC, USA)

**What they receive:** Garment photograph (base64 encoded) and a text classification prompt. No user identity, name, or profile data is included in the request.  
**Why:** AI garment classification.  
**AI training retention:** REQUIRES VERIFICATION with Google — enterprise API controls may differ from consumer Gemini behaviour.  
**DPA status:** REQUIRES CONTRACT VERIFICATION.  
**Cross-border transfer (Nigeria):** Data leaves Nigeria to Google's US infrastructure. Transfer mechanism: LEGAL REVIEW REQUIRED.

### 3.3 PhotoRoom (PhotoRoom SAS, France / EEA)

**What they receive:** Garment photograph (image bytes). No user identity.  
**Why:** Background removal to improve AI classification accuracy.  
**AI training retention:** REQUIRES VERIFICATION with PhotoRoom.  
**DPA status:** REQUIRES CONTRACT VERIFICATION.  
**Cross-border transfer (Nigeria):** Data leaves Nigeria to France. Transfer mechanism: LEGAL REVIEW REQUIRED (Nigeria → France / EEA adequacy not confirmed).

### 3.4 Open-Meteo (Switzerland)

**What they receive:** Geographic coordinates and weather parameters. No user identity.  
**Why:** Weather data for outfit recommendations.  
**DPA status:** Likely not required (keyless, free service) — LEGAL REVIEW REQUIRED.  
**Cross-border transfer (Nigeria):** Coordinates leave Nigeria to Open-Meteo's infrastructure. Transfer mechanism: LEGAL REVIEW REQUIRED.

### 3.5 ipapi.co

**What they receive:** Device IP address (implicit in HTTP request) for approximate geolocation.  
**Why:** Location fallback when GPS is unavailable.  
**DPA status:** REQUIRES VERIFICATION. If not contractually coverable, this call should be removed.  
**Cross-border transfer (Nigeria):** IP address leaves Nigeria. Destination country: unknown — REQUIRES VERIFICATION.

### 3.6 Apple App Store / Google Play (Phase 5C+)

Not yet implemented. App distribution only at this stage. Will receive payment metadata at Phase 5C.

---

## 4. Where Data Is Stored

- **Primary database and authentication:** Supabase (cloud-hosted — region REQUIRES VERIFICATION with Supabase account settings)
- **Garment images:** Supabase Storage (`wardrobe-images` bucket) — currently PUBLIC; operator must set to PRIVATE before user onboarding
- **On-device local cache:** AsyncStorage (encrypted where the OS provides it; not transmitted to Amodka servers)
- **Server environment:** Replit (development); production hosting TBD

---

## 5. Retention

All retention periods are provisional. **BUSINESS/LEGAL DECISION REQUIRED** for every category.

| Data | Proposed retention | Notes |
|---|---|---|
| Account credentials | Until account deletion + backup window | NDPA and UK GDPR right to erasure applies |
| Style profile | Until account deletion | Core service; no retention beyond service life |
| Garment photos | Until item/account deletion | Account deletion now explicitly removes Storage objects |
| Wear logs | Until account deletion | TBD — earlier purge at fixed interval possible |
| Affinity signals | 90-day active window (read-time); DB rows not yet purged | DB purge job needed |
| Telemetry logs | TBD — 30/90 days suggested | Server stdout only; no external aggregator currently |
| Rate-limit counters | Per-window TTL (minutes) | Auto-expire |
| Backups (Supabase PITR) | Per Supabase retention policy | **LEGAL REVIEW REQUIRED** — whether PITR backups must be purged on erasure request |

---

## 6. User Rights

Under NDPA 2023 (Nigeria) and UK GDPR (UK), users have the following rights:

| Right | Nigeria (NDPA) | UK (UK GDPR) | Current Amodka status |
|---|---|---|---|
| Right of access | s.34 | Art 15 | Partial — in-app wardrobe and profile visible; formal export not implemented |
| Right to rectification | s.35 | Art 16 | ✅ In-app profile and item edit screens |
| Right to erasure | s.36 | Art 17 | ✅ In-app account deletion (Phase 5B fixed — Storage + DB + auth) |
| Right to data portability | s.37 | Art 20 | ❌ Not implemented — pre-launch or post-launch priority |
| Right to object | s.38 | Art 21 | ❌ Not implemented |
| Right to restrict processing | s.39 | Art 18 | ❌ Not implemented |

**Supervisory authority (Nigeria):** Nigeria Data Protection Commission (NDPC)  
**Supervisory authority (UK):** Information Commissioner's Office (ICO, ico.org.uk)

---

## 7. International Transfers

**Nigeria:** Data is transferred to Supabase (USA/EU), Google (USA), PhotoRoom (France), Open-Meteo (Switzerland), ipapi.co (unknown). Under NDPA Chapter 7, each transfer requires an appropriate mechanism. No mechanism has been verified for any processor. **LEGAL REVIEW REQUIRED — launch blocker.**

**UK:** Same processors. UK GDPR Chapter V requires UK-approved SCCs (International Data Transfer Agreements, IDTAs) or adequacy decisions. US-based processors (Google, Supabase via AWS) require UK-approved SCCs. **LEGAL REVIEW REQUIRED.**

---

## 8. AI Processing

Garment photographs are processed by:
1. **Google Gemini** — to classify garment type, colour, fabric, fit, and other attributes
2. **PhotoRoom** — to remove the image background before classification (optional path)

Users must be informed clearly in the Privacy Policy that their garment photographs are processed by external AI services.

**Mandatory disclosure:** Whether inputs to Gemini or PhotoRoom may be used for model training — **REQUIRES VERIFICATION with each provider before publishing.**

---

## 9. Children

**LEGAL REVIEW REQUIRED** — see `docs/compliance/nigeria-market-readiness.md §8` for full assessment.

Nigeria: NDPA treats persons under 18 as children requiring heightened protection.  
UK: ICO Children's Code applies if Amodka is likely to be accessed by users under 18.

Current status: No age gate exists. This is a pre-launch legal decision.

---

## 10. Nigeria-Specific Disclosures

The Privacy Policy version for Nigerian users must specifically reference:
- Nigeria Data Protection Act 2023 as the applicable data protection law
- The NDPC as the supervisory authority
- Contact details for data subject rights requests
- The right to lodge a complaint with the NDPC
- Cross-border transfer mechanisms (once verified)
- Whether Amodka is registered with the NDPC (TBD)

---

## 11. Cookies and Tracking

- No advertising SDKs implemented
- No third-party analytics SDK (no Amplitude, Firebase Analytics, Mixpanel, etc.)
- Supabase uses device-native session storage (SecureStore on iOS/Android) — not browser cookies
- No advertising identifiers (IDFA/GAID) accessed

---

## 12. Subscription Data (Phase 5C+)

When payments are implemented, the following will be added:
- Subscription plan, start/end dates, transaction IDs (stored server-side, not in plain DB)
- Payment is processed by Apple App Store / Google Play — Amodka does not process payment card data
- Nigerian pricing in NGN as required by FCCPC
- Cancellation and refund policy

---

## 13. Changes from Phase 5B Source Material

This document supersedes the Phase 5B `privacy-policy-source.md`. Key additions:
- Nigeria/Africa-first launch context throughout
- NDPA 2023 references added to all relevant sections
- Nigeria-specific third-party transfer analysis
- NDPC as supervisory authority added
- Age/children section updated with Nigeria-specific age of protection (under 18)
- Cross-border transfer section updated with Nigeria mapping
