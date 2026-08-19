---
name: Premium entitlement boundary
description: The access-control rule for premium features and future payment integration.
---

Premium access is authoritative only when resolved by the server from the authenticated user's profile and a future `premium_expires_at` value. The mobile app must fail closed to free access whenever that read fails. Do not add a client-callable entitlement grant endpoint.

**Why:** Local storage and token claims can outlive a subscription or be modified on-device, so neither may grant paid access. A public upgrade route would permit entitlement escalation without verified payment.

**How to apply:** Use the shared server entitlement resolver for premium-gated server work (including PhotoRoom quota bypass). Keep future payment-provider writes behind the server-only verified-entitlement boundary; update the mobile app from the authenticated entitlement read rather than persisted premium state.