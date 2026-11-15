# RevenueCat webhook environment isolation

Server-side webhook processing requires `REVENUECAT_EXPECTED_ENVIRONMENT`.

| Runtime | Intended value |
| --- | --- |
| Development | `SANDBOX` |
| Production | `PRODUCTION` |

Only `SANDBOX` and `PRODUCTION` are accepted (surrounding whitespace and letter
case are normalised). A missing or invalid setting fails closed: after the
webhook signature is verified and its JSON is parsed, lifecycle requests
receive a retryable configuration-unavailable response and are not journaled
for entitlement processing. The configured value is never returned or logged.

RevenueCat documents `environment` as always included for subscription
lifecycle events. Every lifecycle event this application currently supports
(`INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION`,
`CANCELLATION`, `BILLING_ISSUE`, `EXPIRATION`, `REFUND`, and `REVOKE`) must
carry a valid value matching the configured value. A missing, invalid or
mismatched event environment is rejected before the event journal or
entitlement processor. Other provider lifecycle types not supported by this
application continue through the ignored-event path. The configured server
value is authoritative; the incoming payload cannot select it.

`TRANSFER` has an optional environment field in RevenueCat's event contract and
is journaled as ignored by this application. `TEMPORARY_ENTITLEMENT_GRANT` can
grant temporary access but its documented payload does not establish a store
environment or transaction identity. It is also journaled as ignored; it
cannot grant or revoke Amodka Premium. Other unsupported event types continue
through the existing ignored-event path. These event types must not be treated
as authoritative without a documented way to prove environment and ownership.

Set this server-side variable separately in each Replit environment. This code
change does not set Development or Production values, enable billing, or alter
RevenueCat dashboard settings. RevenueCat dashboard webhook environment
filters remain required as an additional isolation layer.

Provider contract reference: [RevenueCat Event Types and Fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
