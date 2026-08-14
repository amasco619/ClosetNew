# Amodka — Phase 5C Payment Architecture Requirements

**Phase 5B.1 | Date:** 2026-08-14  
**Status:** Requirements document for Phase 5C implementation. No payments implemented.  
**Launch strategy context:** Nigeria/Africa → UK → Global

---

## 1. Scope

This document captures the payment architecture requirements that Phase 5C must implement. It incorporates:
- Nigeria-first launch considerations (NGN pricing, local payment methods)
- UK and global expansion requirements
- App Store and Google Play billing integration
- Server-authoritative premium status (Phase 5B findings R-05 and R-06)
- Subscription lifecycle (free trial, grace period, cancellation, refunds)

---

## 2. Currency and Pricing

### 2.1 Nigeria Launch

- **NGN (Nigerian Naira)** must be the primary displayed currency for Nigerian users
- App Store and Google Play both support NGN pricing tiers
- USD pricing may be shown alongside NGN but NGN must be prominent
- FCCPC requires full price disclosure; no hidden fees or unclear billing cycles
- Price must be displayed before any payment commitment

### 2.2 UK Expansion

- **GBP** for UK users via App Store and Google Play country pricing
- VAT/tax must be handled by the app stores (they are the merchant of record for IAP)

### 2.3 Global

- Use App Store and Google Play automatic currency localisation
- Prices set in a base currency (USD or GBP) with store-calculated local equivalents
- For Nigeria: set explicit NGN price tiers in App Store Connect and Google Play Console

---

## 3. App Store Billing (Apple IAP)

### 3.1 Product Type

- Auto-renewable subscription (Apple StoreKit 2 recommended)
- Product ID: `com.amodka.premium.monthly` and `com.amodka.premium.annual`

### 3.2 Implementation Requirements

- Use StoreKit 2 (`Product.purchase()`) on iOS 15+; StoreKit 1 fallback for older
- Receipt verification: server-side only via Apple App Store Server API
  - Never verify receipts client-side
  - Server endpoint: `POST /api/subscription/verify-apple`
  - Payload: `{userId, transactionId, originalTransactionId}`
- Premium status update: only via verified receipt → server writes `app_metadata.premium = true` via Supabase admin client
- Handle: purchase, restore, cancellation, expiry, grace period, refund (via App Store Server Notifications v2)

### 3.3 Subscription Lifecycle

| Event | Required action |
|---|---|
| `SUBSCRIBED` | Server sets premium = true |
| `DID_RENEW` | Server confirms premium = true |
| `EXPIRED` | Server sets premium = false (after grace period) |
| `GRACE_PERIOD_EXPIRED` | Server sets premium = false |
| `REFUND` | Server sets premium = false |
| `REVOKE` (Family Sharing) | Server sets premium = false |

### 3.4 Sign in with Apple

Apple requires Sign in with Apple if any third-party OAuth (e.g. Google) is offered. Once Google OAuth is implemented (Phase 5C+), Sign in with Apple becomes mandatory.

---

## 4. Google Play Billing

### 4.1 Product Type

- Auto-renewing subscription
- Product ID: `com.amodka.premium.monthly` and `com.amodka.premium.annual`

### 4.2 Implementation Requirements

- Use Google Play Billing Library 6+ (billing:6.x)
- Purchase token verification: server-side via Google Play Developer API
  - Server endpoint: `POST /api/subscription/verify-google`
  - Payload: `{userId, purchaseToken, productId}`
- Premium status update: only via verified purchase token
- Handle: Real-time Developer Notifications (RTDN) via Pub/Sub
  - Subscribe to: `SUBSCRIPTION_PURCHASED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_CANCELED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_ON_HOLD`, `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_REVOKED`

### 4.3 Grace Period

- Google Play default grace period: 3 days
- Amodka must not revoke premium during the grace period
- Server must check subscription state via Google Play API when in grace period

---

## 5. Server-Authoritative Premium Status (Priority: R-05, R-06 from Phase 5B)

This is the most critical architectural requirement from the Phase 5B audit.

### 5.1 Current Broken State (Phase 5C must fix)

- `/api/user/upgrade-premium` can be called with a valid JWT and no payment — it sets premium=true without any receipt
- Client-side premium gates (item count, outfit quota) can be bypassed by manipulating React state or AsyncStorage
- These are R-05 and R-06 critical findings

### 5.2 Required Architecture

```
Client                          Server                         App Store / Play
  │                               │                                │
  │ ── purchaseProduct() ────────►│                                │
  │                               │ ── verify receipt/token ──────►│
  │                               │ ◄── valid response ────────────│
  │                               │
  │                               │ ── supabaseAdmin.auth.admin    │
  │                               │    .updateUserById(userId,     │
  │                               │    { app_metadata:             │
  │                               │      { premium: true } })      │
  │                               │
  │ ◄── { premium: true } ───────│
  │
  │ [client refreshes session to get new JWT with premium claim]
```

**Rules:**
- `/api/user/upgrade-premium` MUST verify a valid payment receipt before writing premium=true
- No code path should allow premium=true without receipt verification
- Client-side premium gates are UX only — they never enforce financial limits
- All quota enforcement (item count, recommendation quota, AI call quota) must be enforced server-side

### 5.3 Quota Enforcement Server-Side

| Feature | Free tier | Premium tier | Enforcement location |
|---|---|---|---|
| Wardrobe items | 30 | Unlimited | SERVER (add-item endpoint) |
| Outfits per scenario per day | 2 | 4 | SERVER (recommendation endpoint) |
| AI classification calls | TBD per day | TBD per day | SERVER (classify-garment endpoint) |
| Background removal | 0 (guest), 1 (free), unlimited (premium) | Already server-enforced ✅ | SERVER |

---

## 6. Grace Periods and Cancellation

### 6.1 Apple App Store

- Apple manages auto-renewal and grace period
- Cancelled subscription: user retains access until end of billing period
- Amodka must not revoke access at cancellation — only at expiry
- Refunds: Apple decides; Amodka receives `REFUND` notification and must revoke

### 6.2 Google Play

- Google manages grace period (3 days by default for payment failures)
- Cancelled subscription: user retains access until end of billing period
- `SUBSCRIPTION_ON_HOLD`: payment failed, grace period active — do not revoke
- `SUBSCRIPTION_EXPIRED`: revoke after end of billing period

### 6.3 Cancellation UX

- Users cancel via App Store or Google Play subscription management
- Amodka in-app UI should link to the appropriate platform subscription management screen
- A "Manage subscription" deep link must be provided:
  - Apple: `itms-apps://apps.apple.com/account/subscriptions`
  - Google Play: `https://play.google.com/store/account/subscriptions`
- Nigeria-specific: Users may need guidance that subscription management is via the app store, not Amodka directly

---

## 7. Refund Policy

- Refunds are managed by Apple (App Store) and Google (Play Store) — Amodka does not process refunds directly
- If a refund is issued, Amodka receives a notification and must revoke premium status
- For NGN-priced subscriptions: same mechanism; the store handles currency conversion

---

## 8. Webhook / Server Notification Handling

### 8.1 Apple App Store Server Notifications v2

- Register endpoint in App Store Connect: `POST /api/webhooks/apple`
- Authenticate notification JWS signature (Apple root certificate)
- Idempotent processing: deduplicate by `originalTransactionId`

### 8.2 Google Play RTDN (Real-Time Developer Notifications)

- Register a Google Cloud Pub/Sub topic in the Play Console
- Server subscribes to Pub/Sub push endpoint: `POST /api/webhooks/google`
- Authenticate by verifying the Pub/Sub push token
- Idempotent processing: deduplicate by `purchaseToken`

---

## 9. Phase 5B Security Fixes — Payment Context (R-06, R-07)

| Finding | Fix required in Phase 5C |
|---|---|
| R-06: upgrade-premium endpoint not payment-gated | Require valid Apple/Google receipt before setting premium |
| R-07: Gemini/PhotoRoom unlimited API calls | Add per-user daily quotas enforced server-side; enforce by JWT premium claim |
| R-05: Client-side premium bypass | Move all quota enforcement to server; client-side gates are UX only |

---

## 10. Testing Requirements (Phase 5C)

- Apple sandbox environment: all subscription events tested end-to-end
- Google Play test accounts: all subscription events tested end-to-end
- Security tests: attempt to call `/api/user/upgrade-premium` without a valid receipt — must return 403
- Security tests: attempt to exceed free-tier item count without premium JWT — server must reject
- Cross-currency tests: NGN purchase flow via Nigerian Apple/Google accounts
