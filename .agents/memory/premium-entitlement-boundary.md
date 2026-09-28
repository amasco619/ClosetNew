---
name: Premium entitlement boundary
description: The access-control rule for premium features and RevenueCat provider reconciliation.
---

Premium access is authoritative only when resolved by the server for the authenticated user: before billing activation this uses the existing protected profile projection and future expiry; after billing activation it aggregates durable, store-identified subscription state. The mobile app must fail closed to free access whenever that read fails. Do not add a client-callable entitlement grant endpoint.

**Why:** Local storage and token claims can outlive a subscription or be modified on-device, so neither may grant paid access. RevenueCat's legacy customer snapshot lacks the store's original transaction identity: turning a snapshot into a new subscription can transfer a purchase across accounts or keep access after a refund.

**How to apply:** Use the shared server entitlement resolver for premium-gated server work (including PhotoRoom quota bypass). Only verified webhook transactions establish a new grant. Provider snapshots may revoke, or recover a uniquely matching grant previously deactivated by a snapshot, but must never create an independent grant. Update the mobile app from the authenticated entitlement read rather than persisted premium state.