# Vendor-neutral reliability observability

The application currently reports reliability events as structured JSON to
stdout/stderr through `shared/observability.ts`. This is a small foundation for
future collection, not a crash-monitoring platform: it provides no durable
retention, dashboard, alerting, or external delivery.

Reports contain only allowlisted metadata: category, stable code, operation,
dependency, route, HTTP status, retryability, request ID, duration, and safe
error type. They must never contain passwords, tokens, authorization headers,
sessions, signed URLs, image/base64 data, raw upstream payloads, email,
precise location, profile objects, secrets, credentials, or database
connection information.

Server requests receive a bounded correlation ID. Use the response
`x-request-id` or JSON `requestId` to locate the matching structured server
events. Request and upstream bodies are deliberately not logged.

Current retention and access are the hosting platform's stdout/stderr
policies; they have not been independently configured or verified here.
Operators must establish retention, access control, and alerting before
relying on these events for production incident response. A future external
provider may consume the same redacted envelope, subject to a separate
privacy, package, and deployment decision.