# Account deletion — published release checklist

Use a **disposable** account in the published app. Never use an existing
customer's account. Do not print or copy credentials into a report.

## 0. Mandatory pre-publish production-server smoke test

Before publishing, run from the configured workspace:

```sh
node scripts/smoke-production-server.mjs
```

This must pass. It invokes the same server compiler script/flags as deployment
(with output redirected to its temporary directory), runs `npm ci --omit=dev`
without borrowing workspace binaries or skipping install scripts, and starts
the compiled server with Node on an alternate port. It requires the expected
401 `authentication_required` JSON and security header from an unauthenticated
API request, then removes the process and temporary installation.

Workspace configuration is inherited without printing secrets. Outbound service
requests are blocked so startup pruning cannot touch live data. This verifies
packaging/startup, **not** Supabase readiness, billing, the full Expo static
packaging pipeline, or the published deletion journey below. Do not bypass a
failed smoke test or treat it as a substitute for those checks.

## 1. Confirm environment and readiness

In the published environment, confirm the required secret names exist without
displaying their values:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `REVENUECAT_BILLING_ENABLED`

Run from the project workspace against the intended Supabase project:

```sh
node scripts/check-deletion-readiness.mjs
```

The script's scoped DELETE probes filter by newly generated, unused UUIDs and
must report zero affected rows. It checks service-role SELECT/DELETE access for
every owner-scoped deletion table, the two safe no-op rate-limit RPCs, and
publishable-key SELECT denial on all server-only billing, background-removal,
rate-limit, and lockout tables. Any failed or inconclusive check blocks release.

Run the SQL printed by the script in the Supabase SQL Editor. Confirm RLS is
enabled where required, policy counts match the table's intended contract, and
`anon` / `authenticated` have no unexpected TRUNCATE, REFERENCES, TRIGGER, or
MAINTAIN privileges. Also check the exact service-role grant:

```sql
SELECT
  has_table_privilege('service_role', 'public.wardrobe_free_selections', 'SELECT') AS service_select,
  has_table_privilege('service_role', 'public.wardrobe_free_selections', 'DELETE') AS service_delete;
```

Both results must be `true` on **every** Supabase project used by the release,
including staging and production. Live DDL must always have a matching
repository migration file. Every new migration creating a public table must
first `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated`, then grant only
what the feature needs. The outstanding `supabase_admin` default-privilege
change remains a separate operator action documented in `TECHNICAL.md` §29;
do not treat the per-table migration rule as a substitute for it.

## 2. Prepare the disposable account

1. Open the published app as a guest and add at least one garment.
2. Create a **new** disposable account through guest sign-up (not sign-in to an
   existing account) and confirm the guest garment was migrated and is visible
   as owned wardrobe data.
3. Confirm the account has an owned object in `wardrobe-images` and an owned
   object in `tryon-photos`. Use only a supported test flow or an authorised
   disposable fixture; if the second bucket cannot be populated safely, record
   that check as **not run** rather than using a customer's data.
4. On a free disposable account, complete one background-removal request with
   the user's explicit AI-processing choice. Confirm a `bg_removal_usage` row
   exists for this disposable user's ID before deletion.
5. Record the disposable user's UUID, wardrobe item IDs, and storage object
   paths in the operator's secure test notes. Do not put these identifiers in
   this repository or the release report.

## 3. Delete through the app and verify

1. Use the app's **Delete account** action. Do not call the server's internal
   deletion function or manually delete rows before this check.
2. Confirm the app reports success and signs the disposable user out.
3. In Supabase Auth and the SQL Editor, verify that the Auth user,
   `user_profiles` row, all `wardrobe_items` rows, all
   `wardrobe_free_selections` rows, and the user's `bg_removal_usage` row are
   absent.
4. Verify the recorded owned objects are absent from **both** `wardrobe-images`
   and `tryon-photos`.
5. If `REVENUECAT_BILLING_ENABLED` is `true`, verify the established deletion
   tombstone remains and the billing account is marked deleted, active
   subscriptions are deactivated, and the deleted user cannot retain or regain
   Premium. If billing is disabled, record that the tombstone path was not
   exercised.
6. Stop and mark the check **failed** if any Auth, row, or object remains, or
   if the app reports success before cleanup is complete. Do not repeat deletion
   against a real account.

## 4. Record evidence

Record only environment (staging/production), timestamp, pass/fail per step,
sanitised readiness output, the manual SQL result, and billing-enabled state.
Do not include secret values, customer identifiers, emails, photo paths, or
provider error messages. This manual published-app check has not been performed
by the code change that added this checklist.
