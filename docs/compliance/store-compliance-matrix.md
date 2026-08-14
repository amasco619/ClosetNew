# Amodka — App Store Compliance Matrix

**Phase 5B | Date:** 2026-08-14  
**Status:** Pre-submission assessment. Nothing has been submitted to either store.

---

## Apple App Store

| Requirement | Status | Notes |
|---|---|---|
| **Privacy Policy URL** | ❌ Not ready | URL must be published before submission. Policy source material exists (this phase); legal drafting required. |
| **App Privacy questionnaire (privacy nutrition labels)** | ❌ Not ready | Must be completed in App Store Connect before submission. Requires completed data inventory (this phase). Key categories: photos, usage data, diagnostics, user content. |
| **Account deletion (in-app)** | ✅ Implemented | In-app delete account route exists in profile screen. Phase 5B fix ensures storage + DB cleanup. |
| **Account deletion (external URL)** | ❌ Not implemented | Apple requires a web-based deletion URL. Must be added before submission. |
| **Sign in with Apple** | ❌ Not implemented | Required if any third-party OAuth login is offered. If Google OAuth is implemented in Phase 5C, Sign in with Apple becomes mandatory. PHASE 5C. |
| **In-App Purchases (IAP)** | ❌ Not implemented | Will be required for Premium subscription. PHASE 5C. |
| **Subscription disclosure** | ❌ Not applicable yet | Subscription terms must be disclosed in paywall and App Store metadata. PHASE 5C. |
| **Age rating** | ❌ Not assessed | Must complete Apple's age rating questionnaire. Fashion app likely 4+ or 9+ unless content warrants otherwise. **LEGAL/BUSINESS DECISION REQUIRED.** |
| **Permissions (camera)** | ✅ Declared | `expo-image-picker` camera permission declared in app.json. Purpose string must be user-readable and accurate. |
| **Permissions (photo library)** | ✅ Declared | `expo-image-picker` photo library permission declared. Purpose string must be accurate. |
| **Permissions (location)** | ✅ Declared | `expo-location` foreground permission declared. `locationAlwaysAndWhenInUsePermission` declared — REVIEW: app only uses foreground; always-permission string should be removed or confirmed unused. |
| **Bundle ID** | ✅ Set | `com.amodka` — matches all internal identifiers. Apple Developer Portal App ID must be created/transferred. |
| **App Store metadata** | ❌ Not ready | Screenshots, description, keywords, support URL, marketing URL. BUSINESS DECISION. |
| **Review compliance** | ❌ Not assessed | App must not use private APIs, must function without mock data, must handle permission denials gracefully. Recommend full Apple HIG compliance review before submission. |

---

## Google Play Store

| Requirement | Status | Notes |
|---|---|---|
| **Privacy Policy URL** | ❌ Not ready | Required in Play Console. Same policy as App Store — legal drafting required. |
| **Data Safety section** | ❌ Not ready | Must be completed in Play Console. Requires completed data inventory (this phase). Categories include: photos and videos, personal info, app activity, location (approximate). |
| **Account deletion (in-app)** | ✅ Implemented | In-app route exists. Phase 5B fixes cleanup. |
| **Account deletion (external web URL)** | ❌ Not implemented | Google Play **requires** a web URL for account and data deletion for apps that allow account creation. This is a **launch blocker** for Google Play submission. Must be implemented as a simple web page or form before submission. |
| **Play Billing** | ❌ Not implemented | Required for Premium subscription. PHASE 5C. |
| **Permissions (camera)** | ✅ Declared via Expo | Used for garment photo capture. Declared in app.json. |
| **Permissions (photo library / media)** | ✅ Declared via Expo | Declared in app.json. |
| **Permissions (location — foreground)** | ✅ Declared | Used for weather context. `locationWhenInUsePermission` declared. |
| **Package name** | ✅ Set | `com.amodka` — matches all internal identifiers. New Google Play listing required under this package name. |
| **Content rating** | ❌ Not assessed | Must complete Play's IARC questionnaire. Likely "Everyone" or "Everyone 10+" — **BUSINESS/LEGAL decision on whether any content restriction applies.** |
| **Target audience** | ❌ Not assessed | Must declare target audience age. If targeting under-13, significant additional requirements apply. **LEGAL REVIEW REQUIRED.** |
| **App metadata** | ❌ Not ready | Screenshots, description, feature graphic, contact details. BUSINESS DECISION. |
| **AI-generated content disclosure** | ❌ Review needed | Google Play requires disclosure of AI-generated content that could be mistaken for real. Outfit recommendations are AI-generated but clearly presented as app suggestions. Solicitor to advise. |

---

## Summary — Launch Blockers

| Blocker | Platform | Phase |
|---|---|---|
| Published Privacy Policy at a URL | Both | PRE-LAUNCH |
| External account/data deletion URL | Google Play | PRE-LAUNCH |
| App Privacy questionnaire / Data Safety section completed | Both | PRE-LAUNCH |
| Age rating / content rating decided and submitted | Both | PRE-LAUNCH |
| Sign in with Apple (if any OAuth is offered) | Apple | PHASE 5C |
| IAP / Play Billing for Premium | Both | PHASE 5C |
| Apple Developer Portal — Bundle ID `com.amodka` | Apple | PHASE 5C (native build) |
| Google Play Console — package `com.amodka` | Google | PHASE 5C (native build) |
| Review `locationAlwaysAndWhenInUsePermission` — remove if unused | Apple | PRE-LAUNCH |
