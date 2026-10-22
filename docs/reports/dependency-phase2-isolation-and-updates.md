# Amodka — Dependency Phase 2 and limiter-test isolation

Date: 22 October 2026. No deployment or publication.

## Outcome

The requested limiter isolation is implemented; the final tree passed three
consecutive complete test runs. Approved Step 3 compatible leaf updates and the
conditional Step 4 hygiene pass are complete. No dependency overrides were added.
This is not a declaration that all vulnerabilities are fixed or that the app is
release-ready. In particular, the earlier Expo install did change native-bundled
Radix modules; a blanket “no mobile bundle change” confirmation would be false.

## 1. Read-only database evidence

The Supabase project list contained **Amodka** and **Amodka_Dev**. A SELECT against
Amodka_Dev returned `42P01`: `public.ratelimit_store` does not exist there.
Repository server configuration selects the original **Amodka** project (called
Production in that configuration). Only masked synthetic-key metadata was then
queried in that project. No credentials or customer records were retrieved.

The first successful SELECT filtered the fixed billing-test user key and
`198.51.100.*` deletion/OTP keys. A final SELECT expanded the documentation-IP
filter to `198.51.100.*`, `203.0.113.*`, `192.0.2.*`, plus known non-UUID fixture
user keys. Both returned the following same counters:

| Masked key pattern | Rows | Hits | Reset time (UTC) | Active |
|---|---:|---:|---|---|
| `account-delete-ip:<documentation-test-ip>` | 1 | 1 | 2026-10-22 10:53:58.600691 | yes |
| `account-delete-user:<billing-test-user>` | 1 | 1 | 2026-10-22 10:53:58.866006 | yes |

No matching `account:` OTP counter or other tested documentation-IP/fixture-user
pattern was returned. The two counters and their reset times remained unchanged
after the isolated test runs.

**What this proves:** test-owned identities had reached the primary project's
persistent store, and the inspected counters did not increase during the new
isolated runs.

**What it does not prove:** neither counter was exhausted when inspected. The
table has no creation/history columns and expired rows may have been pruned, so
the historical 429 cannot conclusively be attributed to the 5/hour user budget
versus the 60/hour deletion-IP ceiling. `billing.test.ts` called
`DELETE /api/user/delete-account`; route inspection excludes the separate
OTP-confirm `accountLimiter` from that request's middleware chain.

No SQL mutation or targeted counter deletion was executed. Existing backend
startup pruning remains unchanged; after the final workflow restart it reported
removing one expired counter. The inspected active synthetic counters survived.
Historical random fixture addresses outside documentation ranges cannot be
reliably distinguished from real addresses and were not dumped.

## 2. Isolation implementation and test inventory

`server/middleware/supabaseSecurityStore.ts` now rejects missing test clients
under `NODE_ENV=test`, before the increment/decrement/reset/preload fallback
catches or before obtaining the application's live Supabase client. Explicit
`null` means an intentionally in-memory rate-limit store. Injected fake clients
remain available for persistence-contract tests.

`server/middleware/rateLimiter.ts` checks the same boundary before default
lockout persistence and rate-limit initialisation. Synchronous lockout callers
therefore cannot hide a missing fixture behind their asynchronous logging catch.
The guard is test-only: production error fallback, budgets, windows, ordering,
response copy and headers are unchanged.

The shared test fixture has per-instance fixed-window counters and lockouts.
Tests using global test overrides either already require test mode, explicitly
set it, or now reject a wrong-mode invocation before reaching the store. Fixed
test identities are safe because their stores are fixture-local; no real store
is required by any limiter/lockout test.

### Files fixed

| Test file | Change |
|---|---|
| `billing.test.ts` | Injected fake store before route requests; replaced eight time-derived IP expressions with deterministic documentation addresses. |
| `entitlements.test.ts` | Injected fake route store; replaced random IP. The exercised entitlement GET is unthrottled, but its mounted route fixture is now isolated as well. |
| `profileEntitlementAcl.test.ts` | Injected fake route store alongside its separate disposable local PostgreSQL fixture. |
| `auth2Routes.test.ts` | Retained existing fake; added wrong-environment rejection and replaced random public-range IP generation with reserved documentation addresses. |
| `accountDeletion.test.ts` | Retained existing fake; replaced random public-range IPs with deterministic documentation addresses. |
| `classifyGarmentIntegration.test.ts` | Explicitly injected `MemoryStore` for its classifier limiter. |
| `classifyMultiItem.test.ts` | Retained existing fake; added wrong-environment rejection before mounted limiter requests. |
| `rateLimiter.test.ts` | Explicit fresh `MemoryStore` injection for all five constructed middleware instances. Explicit null/fake clients remain in adapter tests. |
| `rateLimiterSupabase.test.ts` | Retained its fake RPC/table client; added wrong-environment rejection. |
| `securityStoreIsolation.test.ts` (new) | Verifies all missing-fixture limiter/lockout paths reject; explicit memory/fake stores work and fresh fixtures reset fixed identities. |
| `helpers/securityStoreFixture.ts` (new) | Local-only fixed-window and lockout fake; rejects invocation outside test mode. |

Also inspected and retained: `accountDeletionRateLimit.test.ts`,
`aiProcessingConsent.test.ts`, `accountLockout.test.ts`,
`rateLimiterDbFallback.test.ts`, and `proxyAddrTrustProxy.test.ts`; these already
use injected fake clients, explicit memory/null clients, or injected lockout
layers. Searches covered all 123 discovered test files, mounted routes,
`supertest`, limiter constructors/helpers, forwarded-IP generation, fixed users,
and direct deletion/auth/AI requests. `gu17Diagnostics.test.ts` and
`bgRemovalMigration.test.ts` mount handler-only fixtures, not the real security
middleware; source-contract tests such as `multiItemUploadWiring.test.ts` do not
execute a limiter.

## 3. Dependency changes and audit counts

Counts are npm vulnerability **package records**, including inherited parent
records; they are not counts of independent exploitable bugs.

| Point | Critical | High | Moderate | Low | Total |
|---|---:|---:|---:|---:|---:|
| Recorded Phase 2 starting audit | 2 | 33 | 13 | 1 | 49 |
| After earlier Step 1 | 1 | 30 | 12 | 0 | 43 |
| After earlier Step 2 / before this Step 3 | 1 | 30 | 10 | 0 | 41 |
| After Step 3 | 1 | 24 | 10 | 0 | 35 |
| After Step 4 (final) | 1 | 23 | 10 | 0 | 34 |

### Per-step changes

- **Step 1 (preceding work):** Express 5.2.1 → 5.3.0; express-rate-limit
  8.5.2 → 8.7.1; Axios 1.17.0 → 1.20.0; proxy-addr 2.0.7 → 2.0.8;
  ip-address 10.2.0 → 10.7.4; follow-redirects 1.16.0 → 1.16.1.
  Parent updates were preferred. Added the trust-proxy/key regression test.
  Recorded lock diff: +93/−75 lines.
- **Step 2 (preceding work):** Expo 57.0.30 → 57.0.31, expo-location
  57.0.21 → 57.0.22, expo-router 57.0.28 → 57.0.29, expo-sharing
  57.0.23 → 57.0.24. Recorded incremental lock diff: +266/−216 lines.
  It also re-resolved extra transitive packages; see section 6 and Appendix A.
  The combined earlier Steps 1–2 lock diff is +359/−291 lines and 53
  version/add/remove records, verified from repository history.
- **Step 3:** targeted `npm update --ignore-scripts` within existing parent
  ranges, without adding transitive leaves as direct dependencies. Exactly eight
  installed records changed; lock diff +36/−26 lines; no manifest change.
- **Step 4:** `pg` 8.20.0 moved from direct dependencies to devDependencies,
  with no version change. Removed unused `http-proxy-middleware` 3.0.7 and five
  exclusive children (`@types/http-proxy`, `eventemitter3`, `http-proxy`,
  `is-plain-object`, `requires-port`). No added/version-changed installed records;
  scope metadata updated; lock diff +17/−63 lines.

| Step 3 installed record | Before | After |
|---|---|---|
| `@xmldom/xmldom` | 0.8.13 | 0.8.15 |
| root `brace-expansion` | 1.1.12 | 1.1.21 |
| `glob/node_modules/brace-expansion` | 5.0.6 | 5.0.12 |
| `http-cache-semantics` | 4.2.0 | 4.3.0 |
| `js-yaml` | 4.1.1 | 4.3.2 |
| `react-devtools-core/node_modules/ws` | 7.5.10 | 7.5.13 |
| root `ws` | 8.21.0 | 8.22.0 |
| root development `vite` | 7.3.5 | 7.3.7 |

`braces` 3.0.3 and `node-forge` 1.4.0 have no newer compatible fixed release
shown by the registry check; no downgrade or override was used.
`follow-redirects` was already 1.16.1 from Step 1.

### Conditional hygiene disposition

Source, scripts, configuration and project documentation were searched.
`http-proxy-middleware` had only its dependency declaration and historical CVE
documentation, not an active import/caller.

Drizzle packages and `db:push` were **retained**. There are no matching source
imports or schema configuration, but `TECHNICAL.md`'s stack table describes an ORM
and `docs/phase-4-report.md:501` explicitly says “Used in server ORM layer.
Retain.” This conflicts with the later deletion-readiness report's unused
finding. The requested unambiguous no-use condition is not established across
all documentation, so removal was not guessed.

`pg` is now directly dev-only in the manifest. However, retained runtime
`drizzle-orm` has an optional peer edge to it: `npm ls pg --omit=dev --all` still
includes pg, and the lock marks it `devOptional`, not purely `dev`. Therefore
moving the direct declaration does **not** prove exclusion from a production
installation.

## 4. Every remaining critical/high npm record

Underlying leaf advisories:

- **S:** `shell-quote` command injection
  [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
  and parser complexity
  [GHSA-395f-4hp3-45gv](https://github.com/advisories/GHSA-395f-4hp3-45gv).
  Installed 1.8.4; compatible 1.12.0 is available (command-injection fix ≥1.11).
  It was outside the named approved Step 3 leaf list, so was not silently added.
  Path: React Native → react-devtools-core → shell-quote; development tooling.
- **B:** `braces` stack exhaustion
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  affecting ≤3.0.3. Current/latest compatible 3.x is 3.0.3. Micromatch 4.0.8
  still depends on it; no compatible fixed leaf was available. Build/dev tooling.
- **F:** `node-forge` RSA signature verification
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv),
  affecting ≤1.4.0. Installed/latest checked is 1.4.0. Expo code-signing/CLI
  tooling; no compatible fixed release was available.

Neither S, B nor F appears among the 2,376 sources in the exported Android
release source map. This is Android bundle evidence, not proof of safety for
developer/CI tooling, every server path, or an unbuilt iOS release.

| npm record | Severity | Version(s) | Why it remains / compatible-fix status |
|---|---|---|---|
| `shell-quote` | critical | 1.8.4 | S; tooling-only in inspected path; compatible 1.12.0 exists but was not in the approved named update list. |
| `braces` | high | 3.0.3 | B; no compatible fixed 3.x. npm proposes a protected patch-package downgrade, not a leaf repair. |
| `micromatch` | high | 4.0.8 | Inherits B; no compatible fixed descendant. |
| `find-yarn-workspace-root` | high | 2.0.0 | Inherits micromatch/B; install tooling; npm proposes patch-package 6.0.7 downgrade. |
| `patch-package` | high | 8.0.1 | Inherits preceding tooling chain; protected, downgrade-only npm suggestion. |
| `node-forge` | high | 1.4.0 | F; no compatible fixed version; npm suggests Expo 44 downgrade. |
| `@expo/code-signing-certificates` | high | 0.0.6 | Inherits F. npm's `fixAvailable:true` is not evidence of a compatible fixed node-forge release. |
| `@expo/cli` | high | 57.0.32 | Inherits F and Metro/B; SDK-managed tooling; npm suggests Expo 44.0.6 downgrade. |
| `@expo/metro` | high | 56.0.2 | Inherits Metro/B; SDK-managed tooling; no proven compatible B repair. |
| `@expo/metro-config` | high | 57.0.13 | Inherits preceding chain; SDK-managed; downgrade suggestion only. |
| `expo` | high | 57.0.31 | Parent record via CLI/Metro, not a separate native leaf advisory; SDK downgrade prohibited. |
| `metro` | high | 0.84.5, 0.84.6 | Inherits file-map/micromatch/B; tooling; npm suggests RN 0.72.17 downgrade. |
| `metro-config` | high | 0.84.5, 0.84.6 | Inherited Metro cycle; no verified compatible leaf repair. |
| `metro-file-map` | high | 0.84.5, 0.84.6 | Inherits micromatch/B; npm suggests Expo downgrade. |
| `metro-transform-worker` | high | 0.84.5, 0.84.6 | Inherited Metro cycle; `fixAvailable:true` does not establish a permitted compatible B repair. |
| `@react-native/community-cli-plugin` | high | 0.86.3 | Inherits Metro/B; RN-managed tooling; downgrade-only suggestion. |
| `@react-native/metro-config` | high | 0.86.3 | Inherits Metro/B; protected RN-managed chain. |
| `@react-native/virtualized-lists` | high | 0.86.3 | Inherited RN peer cycle, not a separate list-widget advisory; RN downgrade prohibited. |
| `react-native` | high | 0.86.3 | Inherited CLI/Metro/peer chain; protected; npm suggests 0.72.17 downgrade. |
| `react-native-purchases` | high | 10.10.2 | Inherits RN chain; protected; npm suggests 8.12.0 downgrade. |
| `react-native-purchases-ui` | high | 10.10.2 | Inherits RN/purchases chain; protected; npm suggests 8.12.0 downgrade. |
| `react-native-reanimated` | high | 4.5.1 | Inherits RN/worklets chain; protected; npm suggests 4.2.2 downgrade. |
| `react-native-view-shot` | high | 5.1.0 | Inherits RN chain; protected; npm suggests 4.0.3 downgrade. |
| `react-native-worklets` | high | 0.10.1 | Inherits RN/Metro chain; protected; npm suggests 0.7.4 downgrade. |

## 5. Commands and validation results

### Final consecutive full-suite proof

All times UTC on 22 October 2026; the three runs span 72 seconds.

| Run | Start | End | Result |
|---|---|---|---|
| 1 | 10:13:55 | 10:14:22 | 123 passed, 0 failed |
| 2 | 10:14:22 | 10:14:43 | 123 passed, 0 failed |
| 3 | 10:14:43 | 10:15:07 | 123 passed, 0 failed |

An earlier isolated triple also passed 123/123 at 10:07:06–10:08:25; the final
triple above additionally includes the wrong-environment checks and hygiene.

| Gate | Step 3 | Step 4/final |
|---|---|---|
| `npm test` | 123/123 | 123/123, three consecutive times |
| `npm run typecheck` | passed | passed |
| `npm run lint` | passed | passed |
| `npx tsx __tests__/recommendation-golden-set.ts` | 35/35 | 35/35 |
| `node scripts/validate-benchmark-fixtures.mjs` | passed, including 53 frozen checksums | passed, including 53 frozen checksums |
| `node scripts/validate-africa-track-c.mjs` | passed: 100 sealed cases | passed: 100 sealed cases |
| `npx expo export --platform android --source-maps --output-dir /tmp/amodka-stepN-android` | passed | passed |
| `npx expo install --check` | previous clean check retained | dependencies up to date |
| `npm audit --json` | 35 records | 34 records |
| `git diff --check` | — | passed before final documentation |

Both exported Hermes bundles are 7.2 MB, with the same SHA-256:
`b1e007f2c1e119bb1fd753316b671718b619aa3e7200061c5fe2e609bb6e78ce`.
Builds and logs are temporary outputs, not repository/deployment assets.

An intermediate focused pass had 13/14 passing because removal of a random IP
variable left three test-only references to `ipRun`. Initial typecheck detected
the same references. They were corrected before the first successful full
triple; there are no remaining failed gates. Expected simulated dependency
failure logs remain in fallback tests. Existing react-test-renderer deprecation
warnings and Expo `NO_COLOR`/`FORCE_COLOR` warnings remain.

Both workflows were restarted once after the completed changes. Backend
initialised its existing stores and served on port 5000; a fresh frontend build
stamp and Metro readiness on 8081 were verified without an alternate-port
prompt. The signed-out mobile-width web welcome screen rendered successfully.
Its browser console retains the existing `shadow*` → `boxShadow` deprecation
and expected RevenueCat preview-mode messages.

## 6. Radix/Vaul provenance and bundle evidence

- Direct `expo-router` depends on `@radix-ui/react-slot`, `@radix-ui/react-tabs`,
  `vaul`, and `@expo/ui`; `@expo/ui` also depends on `vaul`.
- `vaul` depends on Radix Dialog, which pulls in the additional
  dialog/dismissable-layer/focus/portal/presence/primitive stack.
- Direct `expo` also reaches this tree through its CLI's Expo Router edge.
  These are not independent new direct application dependencies.
- Vaul remains version **1.1.2**. Its internal Radix stack was re-resolved.
- Neither Vaul nor the changed Vaul dialog stack appears in the Android release
  source map.
- **Included in Android:** root `@radix-ui/react-slot` **1.2.0 → 1.5.0**, and
  newly nested `@radix-ui/react-compose-refs` **1.1.5**. Expo Router's
  `build/ui/Slot.js` and `build/ui/TabTrigger.js` import the slot module.

Thus **the earlier install changed shipped Android JavaScript dependencies**.
Passing tests/export do not prove identical device behaviour. No unapproved
override, rollback, or manual lock pin was introduced to disguise this result.

## 7. Files changed, protected scope and deviations

Current corrective pass changes:

- `server/middleware/rateLimiter.ts`, `server/middleware/supabaseSecurityStore.ts`
  (test-only guards).
- The nine existing test files listed in section 2 and its two new test/helper
  files.
- `package.json`, `package-lock.json` (Step 3/4 dependency work).
- `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`, this report and the existing
  persistent-limiter test memory note/index.

Earlier Phase 2 also introduced `__tests__/proxyAddrTrustProxy.test.ts` and the
Step 1/2 dependency changes recorded above.

**Verified unchanged by this corrective pass:** production limiter logic,
limits/copy; recommendation/classifier source; all 53 frozen snapshots;
billing/RevenueCat source; consent enforcement; RLS and migrations. Protected
root dependency versions remain RN 0.86.3, purchases/UI 10.10.2, Reanimated 4.5.1,
view-shot 5.1.0, worklets 0.10.1 and patch-package 8.0.1.

**Deviations/qualifications:**

1. Earlier Step 2 resolved more than the four named direct patches. Appendix A
   lists the entire combined earlier installed-record delta, including the
   changed native-bundled Radix entries, xcode major update and **removal of
   nested `expo/node_modules/react-native-worklets` 0.10.4**. The protected root
   worklets version remains 0.10.1, but a claim that the entire protected installed
   graph was unchanged would be inaccurate. These earlier changes were not
   silently altered again in this pass.
2. Drizzle removal was withheld because the documentation conflicts; pg still
   has its optional runtime peer edge. These are conditional-hygiene limitations.
3. The remaining shell-quote critical has a compatible fix, but is outside the
   named Step 3 list. It requires a separate scope decision, not an override.
4. No `npm audit fix`, `--force`, dependency override, migration, credential
   change, purchase or publication was performed. An earlier Expo install's
   protected hook-writing failure was recovered with install scripts disabled;
   there is no final app.json change.
5. Audit scope is the root lockfile. The separate mockup sandbox dependency tree
   was not changed or audited here; its running server reports Vite 7.3.3.
   Updating root Vite to 7.3.7 does not update that separate tree.

**Not verified:** physical iOS/Android behaviour; iOS release-bundle membership;
native release installation or store purchases; full end-to-end auth/deletion
against live accounts; exploitability of every developer/CI advisory path;
the historical 429's exact budget. No release-ready claim is made while the
critical advisory and earlier unintended dependency-resolution changes remain.

## Appendix A — earlier combined Steps 1–2 installed-record delta

Paths are relative to the root `node_modules/`. This is a combined history
comparison, not a claim that all entries were intended by Step 2.

| Package path | Before | After |
|---|---|---|
| `@expo/config-plugins` | 57.0.10 | 57.0.11 |
| `@expo/metro-config/node_modules/hermes-estree` | 0.36.1 | removed |
| `@expo/metro-config/node_modules/hermes-parser` | 0.36.1 | removed |
| `@expo/ui` | 57.0.25 | 57.0.26 |
| `@radix-ui/react-focus-guards` | 1.1.3 | 1.2.0 |
| `@radix-ui/react-slot` | 1.2.0 | 1.5.0 |
| `@radix-ui/react-use-escape-keydown` | 1.1.1 | removed |
| `axios` | 1.17.0 | 1.20.0 |
| `body-parser` | 2.2.2 | 2.3.0 |
| `content-disposition` | 1.0.1 | 2.0.1 |
| `content-type` | 1.0.5 | 2.1.0 |
| `expo` | 57.0.30 | 57.0.31 |
| `expo-location` | 57.0.21 | 57.0.22 |
| `expo-modules-jsi` | 57.1.2 | 57.1.3 |
| `expo-router` | 57.0.28 | 57.0.29 |
| `expo-sharing` | 57.0.23 | 57.0.24 |
| `expo/node_modules/@expo/cli` | 57.0.31 | 57.0.32 |
| `expo/node_modules/@expo/cli/node_modules/@expo/router-server` | 57.0.13 | 57.0.14 |
| `expo/node_modules/@expo/json-file` | 11.2.1 | removed |
| `expo/node_modules/expo-modules-core` | 57.0.23 | removed |
| `expo/node_modules/react-native-worklets` | 0.10.4 | removed |
| `express` | 5.2.1 | 5.3.0 |
| `express-rate-limit` | 8.5.2 | 8.7.1 |
| `follow-redirects` | 1.16.0 | 1.16.1 |
| `iconv-lite` | 0.7.2 | 0.7.3 |
| `ip-address` | 10.2.0 | 10.7.4 |
| `media-typer` | 1.1.0 | 1.1.1 |
| `plist` | 3.1.0 | 3.1.1 |
| `proxy-addr` | 2.0.7 | 2.0.8 |
| `qs` | 6.15.2 | 6.16.1 |
| `side-channel` | 1.1.0 | 1.1.1 |
| `side-channel-list` | 1.0.0 | 1.0.1 |
| `type-is` | 2.0.1 | 2.1.0 |
| `vaul/node_modules/@radix-ui/react-dialog` | 1.1.15 | 1.3.1 |
| `vaul/node_modules/@radix-ui/react-dismissable-layer` | 1.1.11 | 1.2.1 |
| `vaul/node_modules/@radix-ui/react-focus-scope` | 1.1.7 | 1.3.1 |
| `vaul/node_modules/@radix-ui/react-portal` | 1.1.9 | 1.2.0 |
| `vaul/node_modules/@radix-ui/react-presence` | 1.1.5 | 1.1.11 |
| `vaul/node_modules/@radix-ui/react-primitive` | 2.1.3 | 2.2.0 |
| `vaul/node_modules/@radix-ui/react-slot` | 1.2.3 | removed |
| `xcode` | 3.0.1 | 4.0.0 |
| `xcode/node_modules/uuid` | 7.0.3 | removed |
| `@radix-ui/react-slot/node_modules/@radix-ui/react-compose-refs` | absent | 1.1.5 |
| `expo-modules-core` | absent | 57.0.24 |
| `plist/node_modules/@xmldom/xmldom` | absent | 0.9.12 |
| `vaul/node_modules/@radix-ui/primitive` | absent | 1.2.0 |
| `vaul/node_modules/@radix-ui/react-compose-refs` | absent | 1.1.5 |
| `vaul/node_modules/@radix-ui/react-context` | absent | 1.3.0 |
| `vaul/node_modules/@radix-ui/react-id` | absent | 1.1.4 |
| `vaul/node_modules/@radix-ui/react-use-callback-ref` | absent | 1.1.5 |
| `vaul/node_modules/@radix-ui/react-use-controllable-state` | absent | 1.3.0 |
| `vaul/node_modules/@radix-ui/react-use-effect-event` | absent | 0.0.5 |
| `vaul/node_modules/@radix-ui/react-use-layout-effect` | absent | 1.1.4 |
