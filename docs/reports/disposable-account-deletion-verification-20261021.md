# Disposable account deletion verification

**Timestamp:** 2026-10-21 22:53 UTC  
**Environment:** Production  
**Overall result:** **NOT CLEARED** — the published-app deletion journey was not run.

The operator explicitly authorized a production-only test. No customer account
was accessed, and no disposable account was created because this workspace has
no active published deployment to operate. No account, row, object, or billing
data was changed.

## Results

| Check | Result | Evidence / limitation |
|---|---|---|
| Target project selection | Pass | The Supabase connection returned exactly one project matching the operator-provided project name. Project IDs and URLs are omitted. |
| Published app available | Fail | Replit reported no active deployment for this workspace. No publishing action was taken. |
| `service_role` SELECT and DELETE on `wardrobe_free_selections` | Pass | The required privilege query returned `true` for both privileges. |
| RLS / ACL metadata query | Partial | The provided read-only query ran through the Supabase SQL connection, not the SQL Editor. It returned 23 public tables; RLS was enabled on all, and anon/authenticated had no TRUNCATE, REFERENCES, TRIGGER, or MAINTAIN privileges. Policy counts were returned but not compared against every table's intended contract. |
| Deletion-readiness API probes | Not run | Production credentials could not be safely selected from an active published runtime, so no probe was run against an unverified workspace target. The earlier report's readiness result is not treated as evidence for this production run. |
| Guest garment migration | Not run | Requires the published app's guest-signup flow. |
| Owned objects in `wardrobe-images` and `tryon-photos` | Not run | No disposable account or objects were created. |
| Background-removal usage row | Not run | No disposable account was created and no AI-processing request was made. |
| In-app account deletion and post-delete Auth/profile/wardrobe/free-selection/usage/object checks | Not run | No account was created; the internal deletion function was not called. |
| Billing-enabled state and deletion tombstone | Not run | `REVENUECAT_BILLING_ENABLED` was not configured in the inspected Replit production environment. With no active deployment, the published runtime's billing setting could not be established; the tombstone path was not exercised. |

## Release decision

This report is not a successful account-deletion smoke test and does not clear
the release gate. Repeat the full checklist only when the already-published
production app is accessible for a new disposable account. Do not use a customer
account or call the internal deletion function as a substitute for the app flow.
