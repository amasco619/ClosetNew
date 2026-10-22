# Production server startup and remaining dependency gates

## Result

**The bounded runtime/test fixes pass.** Both clean production-only smoke runs
passed (before and after the conditional tsx move). Full suite: **123 passed,
0 failed**. No publication/deployment was performed.

## Read-only diagnosis and history

- Reproduced the original failure with **full workspace node_modules**:
  `npm run server:build`, then
  `NODE_ENV=production PORT=5538 node server_dist/index.js`.
  Node 22.22.0 exited 1 before listening with
  `Dynamic require of "pngjs" is not supported`.
- Git introduces `server/garmentPng.ts`, including its pngjs require, in
  `f900c18ba27d168c133cc32e2dbff39124d8018e`, **2026-10-16 21:17:56 UTC**.
  The later artifact commit `c37ebbb` (**2026-10-22 11:19:41 UTC**) contains
  `__require("pngjs")` and `__require("p-limit")`. This proves a later compiled
  artifact existed, not that it successfully started.
- The previous report records a failed production-only startup attempt.
  No earlier successful compiled-server startup was established. Current
  deployment metadata reports no active deployment; the scoped deployment-log
  search since introduction returned no logs. This does **not** prove no
  publishing/start attempt ever occurred: historical runtime evidence is absent.
- Scanned all server TypeScript sources for require calls, dynamic imports,
  `__dirname`, `__filename` and JSON imports. The other incompatible construct
  was top-level `require("p-limit")` in `server/routes.ts`.
  No filename globals, JSON module imports or computed requires were found.
  The remaining dynamic imports are literal `node:crypto`, `./supabase` and
  `../supabase`, which are valid/bundled normally. Reading JSON with fs and
  `JSON.parse` is not an ESM JSON-import problem.

## Fixes and unchanged behavior

- `server/garmentPng.ts`: default import of the CommonJS pngjs export; a local
  `server/pngjs.d.ts` shim preserves the existing structural codec typing.
  PNG decoding, bounds, crop, margin and matte arithmetic are unchanged.
- `server/routes.ts`: default p-limit import; the five-slot concurrency pool
  and handlers are unchanged. No banner/global require hack.
- The first isolated startup attempt exposed that p-limit was **not declared**
  and was absent from the production dependency tree, despite being present
  through development tooling. Declared the **same installed 3.1.0** as a runtime
  dependency. No package version upgrade was necessary.
- A clean production install must not borrow `patch-package` from the
  workspace PATH. `scripts/postinstall.mjs` checks for patch files before
  invoking it, then runs the existing hook installer. The current patches
  directory is empty. If patches exist, missing tooling or patch failures are
  still fatal; install scripts are not globally disabled.
- Added PNG unit cases for unchanged input bytes, entirely transparent input,
  opaque no-op behavior, truncated/invalid PNGs and zero/oversized dimensions.
  Existing crop, alpha, matte and MIME assertions remain.

## Three test failures: cause and repair

The last passing pre-cleanup root bundler was **esbuild 0.18.20**, supplied
transitively by Drizzle. Direct imports resolved that root package, not Vite's
separate newer copy. Removing Drizzle removed that accidental test dependency.
The approved direct **0.27.7** restored the package but exposed three virtual
mock loaders without filesystem resolution context. Their source contains bare
React imports; the bundler reported no resolve directory even with
`packages: "external"`.

`__tests__/helpers/virtualMockModule.ts` supplies the shared `resolveDir` in
`onLoad` results. It is used by auth2MountedUi, canonicalWardrobeUi and
onboardingNavigation. No esbuild downgrade, advisory-exposing pin, external
provider call or mock behavioral change was used.

AST comparison with the pre-change files confirms all existing assertion calls
are identical: **28 + 25 + 12 = 65**. No assertion was deleted or weakened.
Focused PNG + three mounted files: **4 passed / 0 failed**.

## Production smoke test

New mandatory command:

```sh
node scripts/smoke-production-server.mjs
```

Deployment remains unchanged:

```text
build: npm run expo:static:build && npm run server:build
run:   npm run server:prod
server:build: esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server_dist
server:prod: NODE_ENV=production node server_dist/index.js
```

The smoke invokes the exact server compiler script/flags, appending only an
outdir override into its clean temporary directory. It copies the built output,
manifests, postinstall scripts and required runtime template/app metadata.
It executes **`npm ci --omit=dev` with lifecycle scripts enabled** and removes
workspace node_modules binary paths from PATH. It starts the built server with
native Node, production mode and an ephemeral alternate port.

Workspace configuration is inherited without printing secret values. A temporary
child-only network guard prevents startup Supabase/cache-pruning requests from
reaching any live service. The local unauthenticated request must return:

```text
GET /api/user/entitlements
401
{"error":"authentication_required"}
X-Content-Type-Options: nosniff
```

Evidence:

| Stage | Result |
|---|---|
| Before tsx move | PASS, port 42733, expected 401 JSON/header |
| After tsx move | PASS, port 42037, expected 401 JSON/header |
| Cleanup | Child terminated/reaped and temporary install removed on both passes |
| `npm ls tsx --omit=dev --all` | `(empty)` |
| `npm ls esbuild --omit=dev --all` | `(empty)` |
| `npm ls pg --omit=dev --all` | `(empty)` |
| `npm ls p-limit --omit=dev --all` | `p-limit@3.1.0` |

No successful check depends on a workspace tsx/esbuild runner in the compiled
server process. The smoke builds the **server portion** of deployment, not the
full Expo Go static asset pipeline. It is documented as mandatory in
`docs/release-checklist-deletion.md` and `TECHNICAL.md`.

## Final gates

| Command | Result |
|---|---|
| `npm test` | 123 passed / 0 failed |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no lint warnings |
| `npx tsx __tests__/recommendation-golden-set.ts` | 35 passed / 0 failed |
| `node scripts/validate-benchmark-fixtures.mjs` | Pass: 100 cases, all 53 frozen checksums |
| `node scripts/validate-africa-track-c.mjs` | Pass: 100 sealed cases |
| `npx expo export --platform android --output-dir /tmp/amodka-esm-android` | Pass |
| `npm audit --json` | Exit 1: 30 records; 0 critical, 23 high, 6 moderate, 1 low |
| `git diff --check` | Pass |

Audit totals are unchanged from the preceding phase. Remaining records are in
protected Expo/RN/native/billing graphs and tooling outside this scope; the low
esbuild advisory remains in development only. No `npm audit fix` was run.
The development backend restarted cleanly and listened on 5000; its startup
store probes reported zero expired rows pruned. Landing-page capture rendered
correctly. Existing frontend logs contain the web `shadow*` deprecation; the
capture also logged an unspecified resource 404. These were not investigated or
changed in this server/dependency task.

## Record-level lockfile comparison

Compared with this follow-up's starting lockfile: **no added/removed package
records and zero package-version changes**. The textual delta is **34 inserted /
4 deleted lines**. Root metadata declares p-limit directly and moves tsx to
devDependencies. These 33 existing records change only runtime/development
classification (optional platform entries remain optional):

| Package record (`node_modules/`) | Before version | After version | Classification |
|---|---|---|---|
| @esbuild/aix-ppc64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/android-arm | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/android-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/android-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/darwin-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/darwin-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/freebsd-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/freebsd-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-arm | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-ia32 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-loong64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-mips64el | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-ppc64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-riscv64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-s390x | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/linux-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/netbsd-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/netbsd-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/openbsd-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/openbsd-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/openharmony-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/sunos-x64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/win32-arm64 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/win32-ia32 | 0.27.7 | 0.27.7 | prod → dev |
| @esbuild/win32-x64 | 0.27.7 | 0.27.7 | prod → dev |
| esbuild | 0.27.7 | 0.27.7 | prod → dev |
| fsevents | 2.3.3 | 2.3.3 | prod → dev |
| get-tsconfig | 4.13.0 | 4.13.0 | prod → dev |
| p-limit | 3.1.0 | 3.1.0 | dev → prod |
| resolve-pkg-maps | 1.0.0 | 1.0.0 | prod → dev |
| tsx | 4.21.0 | 4.21.0 | prod → dev |
| yocto-queue | 0.1.0 | 0.1.0 | dev → prod |

## Files changed

- `server/garmentPng.ts`, `server/pngjs.d.ts`, `server/routes.ts`
- `__tests__/garmentPng.test.ts`, `__tests__/helpers/virtualMockModule.ts`
- `__tests__/auth2MountedUi.test.ts`, `__tests__/canonicalWardrobeUi.test.ts`,
  `__tests__/onboardingNavigation.test.ts`
- `scripts/smoke-production-server.mjs`, `scripts/postinstall.mjs`
- `package.json`, `package-lock.json`
- `TECHNICAL.md`, `AMODKA-PROJECT-STATUS.md`,
  `docs/release-checklist-deletion.md`, `docs/reports/dependency-phase3.md`,
  this report.

## Deviations and what is not verified live

- Two necessary packaging repairs beyond the PNG import: declaring the already
  used p-limit runtime dependency, and avoiding invocation of absent development
  patch tooling when no patches exist. Neither changes application behavior.
- No build banner, esbuild downgrade, protected package version change,
  weakened/deleted assertion, engine/frozen artifact change, billing/consent
  logic change, RLS change or migration. The only routes-file change is its
  p-limit import.
- The smoke intentionally blocks external services and validates server
  packaging/startup plus the unauthenticated boundary only. It does not verify
  live Supabase permission/readiness, successful authenticated requests, AI
  providers, subscriptions, purchases or published deployment behavior.
- No physical-device test, complete Expo Go static packaging run, historical
  proof of every production start, or publish/deploy. The prior phase's larger
  lockfile rewrite is preserved historically, not silently rewritten here.
