# Amodka — Privacy Policy Source Material

**Phase 5B | Date:** 2026-08-14  
**Status:** Verified factual source document. NOT polished legal copy.  
**Purpose:** This document provides the verified factual information that a solicitor/copywriter will use to draft the published Privacy Policy.  
**Critical:** Every statement here is traceable to the actual implementation. Unknowns are marked TBD.

---

## IMPORTANT NOTICE

This document does not constitute Amodka's Privacy Policy.  
It is factual source material for subsequent legal drafting.  
Do not publish this document to users.  
All sections marked **TBD** require business/legal input before the Privacy Policy is published.

---

## 1. Who Operates Amodka

**TBD — BUSINESS/LEGAL INPUT REQUIRED**

- Legal entity name: TBD
- Registered address: TBD
- ICO registration number: TBD (required if UK-based data controller processing personal data)
- Data controller contact email: TBD
- DPO contact (if required): TBD

---

## 2. What Data Is Collected and Why

### 2.1 Account and Identity Data

| Data | Why collected | Legal basis (proposed) |
|---|---|---|
| Email address | Authentication, account recovery | Performance of contract |
| Password (server-side hashed by Supabase) | Authentication | Performance of contract |
| Display name | Personalised greeting | Performance of contract |

### 2.2 Personal Style Profile

Collected during onboarding and editable in profile settings:

| Data | Why collected | Legal basis (proposed) |
|---|---|---|
| Body type | Outfit personalisation | Performance of contract / Legitimate interests — TBD legal review |
| Height band | Outfit personalisation | As above |
| Skin tone | Colour-harmony recommendations | **LEGAL REVIEW REQUIRED** — may require explicit consent if classified as special-category |
| Eye colour | Colour-harmony recommendations | Performance of contract / Legitimate interests — TBD |
| Hair colour | Colour-harmony recommendations | As above |
| Face shape | Styling recommendations | As above |
| Style goals | Recommendation engine | As above |
| Lifestyle preferences | Recommendation engine | As above |
| Industry / life phase | Contextual recommendations | As above |

### 2.3 Wardrobe Content

| Data | Why collected | Legal basis (proposed) |
|---|---|---|
| Garment photographs | Basis for AI classification and wardrobe management | Performance of contract |
| AI-derived garment metadata (category, colour, fabric, fit, etc.) | Outfit recommendations | Performance of contract |
| Wear history | Freshness scoring; wear-count display | Performance of contract / Legitimate interests |
| User reactions (love / not today / worn) | Recommendation personalisation | Performance of contract |

### 2.4 Location Data

| Data | Why collected | Legal basis (proposed) |
|---|---|---|
| GPS coordinates (foreground, on permission) | Weather-aware outfit recommendations | Consent (device permission prompt) |
| IP-derived approximate location (fallback) | Weather-aware outfit recommendations when GPS not available | Legitimate interests — TBD legal review |

**Note:** Coordinates are not stored server-side. They are used only to fetch weather and then discarded from server memory. A 6-hour cache is stored on the device.

### 2.5 Technical Data

| Data | Why collected | Legal basis (proposed) |
|---|---|---|
| IP address | Rate limiting, authentication | Legitimate interests |
| Session tokens | Authentication | Performance of contract |
| App usage telemetry (structured JSON, no PII) | Service quality monitoring | Legitimate interests |

---

## 3. Where Data Is Stored

- **Primary database and authentication:** Supabase — cloud-hosted, region TBD (REQUIRES VERIFICATION — likely AWS us-east-1 or eu-west-1; confirm with Supabase account settings)
- **Garment images:** Supabase Storage (`wardrobe-images` bucket)
- **Device local cache:** React Native AsyncStorage (on-device only, not transmitted to Amodka servers)
- **Server environment:** Replit (development); production hosting TBD

---

## 4. Third Parties Who Receive Personal Data

### 4.1 Supabase (Supabase Inc., USA)

**What they receive:** All user account data, profile data, wardrobe metadata, wear logs, affinity signals, and garment images.  
**Why:** Infrastructure and database provider.  
**Data Processing Agreement:** REQUIRES CONTRACT VERIFICATION — Supabase publishes a DPA; confirm it is in place.  
**International transfers:** Supabase uses AWS. Data may be processed in the United States. UK GDPR transfer mechanism required: TBD — likely Standard Contractual Clauses (SCCs) / IDTA.

### 4.2 Google Gemini (Google LLC, USA)

**What they receive:** Garment photograph (base64 encoded) and a text classification prompt. No user identity or profile data is included in the request.  
**Why:** AI garment classification (category, colour, fabric, fit, etc.).  
**Retention by Google:** REQUIRES VERIFICATION — Google's Gemini API terms must be reviewed to confirm whether inputs are retained and whether they may be used for model training. Enterprise API settings may differ from consumer behaviour.  
**Data Processing Agreement:** REQUIRES CONTRACT VERIFICATION — Google Cloud services typically offer a DPA; confirm it covers Gemini API usage.  
**International transfers:** Google LLC is US-based. UK GDPR transfer mechanism required.

### 4.3 PhotoRoom (PhotoRoom SAS, France)

**What they receive:** Garment photograph (image bytes) for background removal. No user identity.  
**Why:** Background removal to improve AI classification accuracy.  
**Retention by PhotoRoom:** REQUIRES VERIFICATION — PhotoRoom API privacy policy must be reviewed.  
**Data Processing Agreement:** REQUIRES CONTRACT VERIFICATION.  
**International transfers:** PhotoRoom is incorporated in France (EEA). Data may be adequate under UK-EEA transfer mechanisms — TBD legal review.

### 4.4 Open-Meteo (Open-Meteo, Switzerland)

**What they receive:** Geographic coordinates and a list of weather parameters. No user identity.  
**Why:** Weather data for outfit recommendations.  
**Retention:** Unknown — REQUIRES VERIFICATION.  
**DPA:** Likely not required for a keyless free API with no personal account, but LEGAL REVIEW REQUIRED.

### 4.5 ipapi.co

**What they receive:** Device IP address (implicit in HTTP request) for approximate geolocation.  
**Why:** Location fallback when GPS unavailable.  
**Retention:** Unknown — REQUIRES VERIFICATION.  
**DPA:** REQUIRES VERIFICATION.  
**Note:** This is a convenience feature, not required for core functionality. If contractual/legal compliance cannot be established, this call should be removed.

### 4.6 Apple (Phase 5C+)

Not yet implemented. Will receive app binary and, at Phase 5C, payment data for subscription processing.

### 4.7 Google Play (Phase 5C+)

Not yet implemented. Will receive app binary and, at Phase 5C, payment data.

---

## 5. Retention

All proposed retention periods are provisional. **BUSINESS/LEGAL DECISION REQUIRED** for every category.

| Data | Proposed retention | Rationale |
|---|---|---|
| Account data (email, name, premium status) | Until account deletion + 30 days (backup window) | Core service delivery |
| Style profile | Until account deletion + 30 days | Core service delivery |
| Garment photos (Storage) | Until item or account deletion | User content; no reason to retain after deletion |
| Garment metadata (DB) | Until item or account deletion | User content |
| Wear logs | Until account deletion — TBD whether earlier purge is appropriate | Service functionality |
| Affinity signals | 90-day active window for engine; DB rows — TBD | Engine design choice |
| Telemetry logs | TBD — 30/90 days suggested | Operational monitoring |
| Rate-limit counters | Per-window TTL (minutes) | Security |
| Lockout records | 15 minutes per window | Security |
| Backups | TBD — BUSINESS/LEGAL decision required | Data protection; recovery |

---

## 6. User Rights

Under UK GDPR, users have the following rights (confirmed implementable in current architecture):

| Right | Current implementation |
|---|---|
| Right to access | Partial — wardrobe and profile data visible in app; full export not yet implemented |
| Right to rectification | Yes — profile edit screen; item edit screen |
| Right to erasure | Yes — in-app account deletion (Phase 5B fixed to delete storage + DB records) |
| Right to data portability | Not implemented — **PRE-LAUNCH or post-launch** |
| Right to object | Not implemented — **PRE-LAUNCH** |
| Right to restrict processing | Not implemented — **PRE-LAUNCH** |
| Automated decision-making objection | Not applicable (no decisions with significant legal effects) — review when subscription enforcement added |

---

## 7. International Transfers

Data is transferred to: Supabase (likely US/EU), Google Gemini (US), PhotoRoom (France/EEA), Open-Meteo (Switzerland), ipapi.co (unknown).

UK GDPR Chapter V requires appropriate safeguards for international transfers. **LEGAL REVIEW REQUIRED** to confirm:
- Adequacy decisions or SCCs/IDTA for each processor
- Whether UK–EU adequacy decision covers EEA-hosted processors
- Whether Supabase's DPA includes adequate transfer mechanisms for UK data

---

## 8. Cookies / SDKs / Tracking

**No advertising SDKs or tracking pixels are currently implemented.**  
**No third-party analytics SDK is currently implemented** (no Amplitude, Firebase Analytics, Mixpanel, etc.).  
Supabase uses session storage (web) or SecureStore (native) for authentication tokens.  
No cookies are set by the Amodka app itself in the native mobile context.

---

## 9. AI Processing

Garment photographs are processed by:
1. Google Gemini — to classify garment type, colour, fabric, fit, and other attributes
2. PhotoRoom — to remove the image background before classification (optional path)

Users should be informed that their photographs are processed by these AI services. The Privacy Policy must describe this clearly.

**Disclosure required:** Whether inputs to Gemini or PhotoRoom may be used for model training — **REQUIRES VERIFICATION with each provider.**

---

## 10. Contact Details

**TBD — BUSINESS/LEGAL INPUT REQUIRED**  
- Data controller contact: TBD  
- DPO (if required): TBD  
- ICO complaints: users have the right to complain to the Information Commissioner's Office (ico.org.uk)

---

## 11. Children

**TBD — LEGAL REVIEW REQUIRED**  
Amodka does not currently collect age information or implement an age gate. Whether Amodka is "likely to be accessed by children" under the ICO's Children's Code must be determined by legal review before launch. If applicable, significant additional safeguards are required.

---

## 12. Subscription Data (Phase 5C+)

Not yet applicable. When payments are implemented, subscription data (plan, start/end dates, transaction IDs) and payment processor data will be added to this document.
