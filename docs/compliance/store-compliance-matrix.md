# Amodka — App Store Compliance Matrix

**Phase 5B.1 | Date:** 2026-08-14  
**Launch strategy:** Nigeria/Africa → UK → Global  
**Status:** Pre-submission assessment. Nothing has been submitted to either store.

---

## Apple App Store

| Requirement | Status | Notes |
|---|---|---|
| **Privacy Policy URL** | ❌ Not ready | URL must be published before submission. Policy source material updated (this phase) to reflect Nigeria-first launch. Legal drafting required. |
| **App Privacy questionnaire (privacy nutrition labels)** | ❌ Not ready | Must be completed in App Store Connect before submission. Key categories: photos and videos, personal info (name, email, body type, skin tone), usage data (wear history), location (precise and coarse). |
| **Account deletion (in-app)** | ✅ Implemented | In-app delete account route exists in profile screen. Phase 5B fixed storage + DB cleanup. Phase 5B.1 adds AsyncStorage clear after successful server deletion. |
| **Account deletion (external web URL)** | ❌ Not implemented | Apple requires a web-based deletion URL. Must be added before App Store submission. **Launch blocker.** |
| **Sign in with Apple** | ❌ Not implemented | Required if any third-party OAuth login is offered. If Google OAuth is implemented in Phase 5C, Sign in with Apple becomes mandatory. PHASE 5C. |
| **In-App Purchases (IAP)** | ❌ Not implemented | Required for Premium subscription. PHASE 5C. Phase 5C payment architecture documented in `docs/compliance/phase5c-payment-architecture.md`. |
| **NGN pricing in App Store Connect** | ❌ Not set | Nigeria launch requires explicit NGN pricing tiers in App Store Connect (PHASE 5C when IAP is implemented). |
| **Subscription disclosure** | ❌ Not applicable yet | Subscription terms must be disclosed in paywall and App Store metadata. PHASE 5C. Must include NGN pricing and auto-renewal disclosure. |
| **Age rating** | ❌ Not assessed | Must complete Apple's age rating questionnaire. Fashion app likely 4+ or 9+ unless content warrants otherwise. **LEGAL/BUSINESS DECISION REQUIRED.** |
| **Permissions (camera)** | ✅ Declared | `expo-image-picker` camera permission declared in app.json. Purpose string must be user-readable and accurate. |
| **Permissions (photo library)** | ✅ Declared | `expo-image-picker` photo library permission declared. Purpose string must be accurate. |
| **Permissions (location)** | ⚠️ Review needed | `expo-location` foreground permission declared. `locationAlwaysAndWhenInUsePermission` string is declared — **REVIEW: app only uses foreground location; always-permission string should be removed or confirmed unused before submission.** |
| **Bundle ID** | ✅ Set | `com.amodka` — matches all internal identifiers. Apple Developer Portal App ID must be created under this bundle ID. |
| **App Store metadata** | ❌ Not ready | Screenshots, description, keywords, support URL, marketing URL. BUSINESS DECISION. Nigeria-first positioning to be reflected. |
| **Nigeria App Store availability** | ❌ Not configured | App Store Connect allows per-country distribution. Nigeria App Store availability must be enabled. |
| **Review compliance** | ❌ Not assessed | App must not use private APIs, must handle permission denials gracefully, must function on current iOS versions. |

---

## Google Play Store

| Requirement | Status | Notes |
|---|---|---|
| **Privacy Policy URL** | ❌ Not ready | Required in Play Console before publishing. Same policy as App Store — legal drafting required. |
| **Data Safety section** | ❌ Not ready | Must be completed in Play Console. Categories: photos and videos, personal info (name, email, physical attributes), app activity (wear logs, affinity), location (approximate). |
| **Account deletion (in-app)** | ✅ Implemented | In-app route exists. Phase 5B fixed cleanup. Phase 5B.1 adds AsyncStorage clear. |
| **Account deletion (external web URL)** | ❌ Not implemented | Google Play **requires** a web-based URL for account and data deletion for apps that allow account creation. **Launch blocker for Google Play.** |
| **Play Billing** | ❌ Not implemented | Required for Premium subscription. PHASE 5C. NGN pricing must be configured in Play Console. |
| **NGN pricing in Play Console** | ❌ Not set | Nigeria launch requires NGN pricing tiers configured in Google Play Console (PHASE 5C). |
| **Permissions (camera)** | ✅ Declared via Expo | Used for garment photo capture. Declared in app.json. |
| **Permissions (photo library / media)** | ✅ Declared via Expo | Declared in app.json. |
| **Permissions (location — foreground)** | ✅ Declared | `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` via expo-location. Used for weather context. |
| **Package name** | ✅ Set | `com.amodka` — new Google Play listing required under this package name. |
| **Content rating** | ❌ Not assessed | Must complete IARC questionnaire. Likely "Everyone" — **BUSINESS/LEGAL decision required.** |
| **Target audience** | ❌ Not assessed | Must declare target audience. If any children under 13 could use the app, significant additional requirements apply. **LEGAL REVIEW REQUIRED.** |
| **App metadata** | ❌ Not ready | Screenshots (including Nigerian fashion examples), description, feature graphic. BUSINESS DECISION. |
| **Nigeria Play Store availability** | ❌ Not configured | Play Console allows per-country distribution. Nigeria must be enabled. Google Play is widely used in Nigeria. |
| **AI-generated content disclosure** | ❌ Review needed | Google Play requires disclosure of AI-generated content. Outfit recommendations are AI-assisted. Solicitor to advise on disclosure wording. |

---

## Nigeria-Specific Store Considerations

| Consideration | Notes |
|---|---|
| **Google Play market penetration in Nigeria** | Google Play is dominant in Nigeria (Android market share ~80%+). App Store secondary. Prioritise Google Play readiness. |
| **App size and data usage** | Nigerian mobile users are sensitive to app data usage. App should function efficiently on limited data plans. No specific compliance requirement but important for adoption. |
| **Payment method availability** | Apple Pay and Google Pay are available in Nigeria but card penetration varies. App Store and Google Play both support airtime billing in Nigeria — consider enabling. PHASE 5C. |
| **Flutterwave / Paystack (alternative)** | Some Nigeria-first apps use local payment processors alongside app store billing. This adds complexity and bypasses Apple/Google revenue share for web sales. PHASE 5C+ decision. |
| **Low-bandwidth consideration** | Garment image upload and AI classification require reasonable network connection. The app should degrade gracefully on slow connections. |

---

## Summary — Launch Blockers

| Blocker | Platform | Phase |
|---|---|---|
| Published Privacy Policy at a URL (Nigeria-aware) | Both | **PRE-LAUNCH** |
| External account/data deletion URL | Both | **PRE-LAUNCH** |
| App Privacy questionnaire / Data Safety section completed | Both | **PRE-LAUNCH** |
| Age rating / content rating decided and submitted | Both | **PRE-LAUNCH** |
| Nigeria App Store and Play Store availability enabled | Both | **PRE-LAUNCH** |
| Review unused `locationAlwaysAndWhenInUsePermission` | Apple | **PRE-LAUNCH** |
| Sign in with Apple (if any OAuth offered) | Apple | PHASE 5C |
| IAP / Play Billing for Premium + NGN pricing | Both | PHASE 5C |
| Apple Developer Portal — Bundle ID `com.amodka` created | Apple | PHASE 5C (native build) |
| Google Play Console — package `com.amodka` listing created | Google | PHASE 5C (native build) |
| Nigeria-specific Play Store payment methods (airtime billing) | Google | PHASE 5C+ |
