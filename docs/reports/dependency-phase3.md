# Dependency Phase 3 — result and conditional runtime check

## Outcome

**Incomplete: do not treat this as a green release gate.** The approved package
cleanup is implemented, but three mounted tests fail and the production server
smoke test exits before listening. The conditional move of tsx to devDependencies
was therefore **not made**. No test files or server source were changed.

## Implemented changes

- `package.json`, `package-lock.json`: shell-quote 1.8.4 → 1.12.0, using an
  override scoped to react-devtools-core. Its available major parent upgrade
  is incompatible with the pinned React Native range, so it was not upgraded.
- Removed drizzle-orm, drizzle-zod, drizzle-kit and the unused `db:push` script.
- Added exact `esbuild: "0.27.7"` to **devDependencies**, as subsequently approved.
  This version was already installed under Vite. `npm ls esbuild --all` shows
  root 0.27.7, tsx 4.21.0 → 0.27.7 deduped, and Vite 7.3.7 → 0.27.7 deduped.
- Updated `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md` and
  `docs/phase-4-report.md` to remove stale claims that Drizzle is retained and
  record the current, non-green state.
- This report records the requested checks. Generated `server_dist/index.js`
  was removed after the smoke test; no compiled server output is retained.

## Gates

| Check | Step 1: shell-quote | Step 2: Drizzle removal + approved esbuild |
|---|---|---|
| `npm test` | 123 passed / 0 failed | 120 passed / 3 failed |
| `npm run typecheck` | Pass | Pass |
| `npm run lint` | Pass | Pass; no warnings reported |
| `npx tsx __tests__/recommendation-golden-set.ts` | Pass | 35 passed / 0 failed |
| `node scripts/validate-benchmark-fixtures.mjs` | Pass | Pass: 100 cases, 53 frozen checksums |
| `node scripts/validate-africa-track-c.mjs` | Pass | Pass: 100 sealed cases |
| `npx expo export --platform android` | Pass | Pass: Android Hermes bundle, 8.7 MB |
| `npm audit --json` | 33: 0 critical, 23 high, 10 moderate, 0 low | 30: 0 critical, 23 high, 6 moderate, 1 low |

Android exports used temporary output directories, not a publish/deploy.
Audit exits nonzero because advisories remain.

Immediately after Drizzle removal, 24 tests could not import esbuild (99 passed).
The approved direct development dependency resolved that missing-package error.
The remaining three failures are:

- `__tests__/auth2MountedUi.test.ts`
- `__tests__/canonicalWardrobeUi.test.ts`
- `__tests__/onboardingNavigation.test.ts`

Each fails while bundling virtual mock modules with bare `react` imports:
esbuild reports that the plugin did not provide a resolve directory, so it
cannot search the filesystem for React. The newer root bundler replaces the
older 0.18.20 root previously supplied by Drizzle. These are bundling failures,
not executed application assertions. No test edits or version changes were
made to address them.

## Exact deployment configuration and runtime evidence

`.replit`:

```toml
[deployment]
deploymentTarget = "cloudrun"
build = ["sh", "-c", "npm run expo:static:build && npm run server:build"]
run = ["npm", "run", "server:prod"]
```

Relevant `package.json` scripts:

```json
{
  "expo:static:build": "node scripts/build.js",
  "expo:start:static:build": "npx expo start --no-dev --minify --localhost",
  "server:build": "esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server_dist",
  "server:prod": "NODE_ENV=production node server_dist/index.js"
}
```

The configured build/run scripts do not invoke tsx. `scripts/build.js` uses Node
and the Expo static-start script. esbuild is a build-time requirement of
`server:build`; `server:prod` itself invokes Node, not a development runner.
This inspection is not proof of the platform's dependency-install policy.
The root `postinstall` also invokes development-only `patch-package`, followed
by `node scripts/install-hooks.mjs`; that is an installation-time requirement,
not a compiled-server import. The smoke install inherited the workspace PATH,
so its lifecycle success does not establish that those hooks work on a host
without development tools. Runtime independence was not established either,
because the compiled server failed before listening.

Executed the server-build portion of the configured deployment build:
`npm run server:build` passed (136,017-byte ESM output). Inspection found **no
tsx/esbuild mentions or imports** in that output. The full Expo static-build
pipeline was not executed as part of this server smoke check.

Smoke procedure:

1. Copied the current manifests/lockfile, built server output and installation
   hook files to a new `/tmp/amodka-prod-smoke.*` directory.
2. Executed **`npm ci --omit=dev`**, without skipping lifecycle scripts: exit 0.
   Its audit reported 25 production-tree records (1 low, 3 moderate, 21 high).
3. Started `node server_dist/index.js` with `NODE_ENV=production`, alternate
   `PORT=5538`, using workspace Node 22.22.0. Supabase keys were dummy values;
   a temporary fetch preloader blocked outbound service requests. This was a
   runtime-module smoke check, not live Supabase validation.
4. The process exited before listening:

   ```text
   Error: Dynamic require of "pngjs" is not supported
   ```

   The configured ESM build emits `__require("pngjs")` from the existing
   `server/garmentPng.ts` top-level CommonJS require. No application request or
   listening-state HTTP check could be completed.
5. The process was reaped and the temporary install directory removed.

This is a failed conditional precondition, even though it is unrelated to tsx.
No tsx move or bundling-source/configuration fix was made.

Final production-tree checks:

```text
npm ls pg --omit=dev --all       → (empty)
npm ls tsx --omit=dev --all      → tsx@4.21.0
npm ls esbuild --omit=dev --all  → tsx@4.21.0 → esbuild@0.27.7
```

Thus **cannot confirm tsx/esbuild absent from production**. Only the direct
esbuild declaration is development-only. The existing tsx production path
remains; the requested post-move runtime proof was not achieved.

## Remaining audit records

Final root audit: **30**, down from **34** before Phase 3.

- **23 high:** @expo/cli, @expo/code-signing-certificates, @expo/metro,
  @expo/metro-config, @react-native/community-cli-plugin,
  @react-native/metro-config, @react-native/virtualized-lists, braces, expo,
  find-yarn-workspace-root, metro, metro-config, metro-file-map,
  metro-transform-worker, micromatch, node-forge, patch-package, react-native,
  react-native-purchases, react-native-purchases-ui, react-native-reanimated,
  react-native-view-shot, react-native-worklets.
- **6 moderate:** @expo/ngrok, @humanfs/node, decode-uri-component, expo-router,
  query-string, uuid.
- **1 low:** esbuild.

These are npm vulnerability records, including propagated parent records, not
30 independent proven-exploitable application vulnerabilities. Most remaining
records are in protected Expo/RN/native/billing graphs or development tooling.
The permitted scope did not include changing those parents or adding additional
overrides. npm proposes major replacements/downgrades for several Expo/RN
records; those are not compatible SDK-57 remediation instructions. Other
available tooling updates are outside this approval. The esbuild advisory's
suggested 0.28.2 fix is outside the approved exact 0.27.7 pin. @expo/ngrok reports
no fix available. No `npm audit fix` was run.

## Lockfile and undeclared-import review

Compared with the repository state immediately before Phase 3:

- `package-lock.json`: **14,673 inserted / 13,031 deleted lines**.
- Package-entry paths: **0 added, 83 removed**; **28 version changes**.
- Version changes are shell-quote, esbuild and platform-specific esbuild binary
  packages. Removed paths are Drizzle/brocli and old/deduplicated esbuild-family
  paths. No other retained package version changed in this comparison.
- The textual lockfile diff is **not minimal**: npm installation/regeneration
  also rewrote lock metadata/order. This is disclosed rather than claimed to be
  a small line diff; no further regeneration was attempted to disguise it.

A TypeScript-AST scan of JS/TS import/export, dynamic import and require
specifiers throughout `__tests__/` and `scripts/`, excluding relative/alias
imports and Node built-ins, found **no other undeclared external package
imports**. Computed runtime module names and shell-command dependencies are
not proven by that literal-import scan.

## Deviations / limitations

- The conditional tsx move was withheld because production startup failed.
- Step 2 is not green: three mounted tests remain failing. The requested
  production absence of esbuild/tsx is not achieved.
- The lockfile textual diff is larger than the requested minimal intent.
- No test files, server source, deployment commands, protected dependency
  declarations, Recommendation Engine v3.7, frozen benchmark artifacts,
  billing logic, consent enforcement, schema or RLS were changed in this phase.
  Golden/fixture validators confirmed the frozen content.
- No device validation, live Supabase/billing validation, purchase, publication
  or deployment. Passing export/build commands do not establish server runtime
  readiness; the failed smoke test demonstrates that distinction.
