---
name: tsx MJS-to-TypeScript imports
description: How .mjs scripts can reuse TypeScript modules in this repository when running under tsx.
---

When a `.mjs` script is launched with `npx tsx`, static named ESM imports from TypeScript source may fail because the imported module is handled through the CommonJS path. In this setup, `createRequire(import.meta.url)` followed by `require("../server/module.ts")` loaded the same source successfully; the generated request builder can then be shared rather than reimplemented in JavaScript.

**Why:** Node/tsx ESM loader attempts produced missing named exports or a require-cycle error, while `createRequire` worked without changing package module settings or adding dependencies.

**How to apply:** For `.mjs` scripts that must reuse server TypeScript modules under `tsx`, prefer `createRequire` when a named ESM import fails. Verify with the exact production invocation before making broader loader or package changes.
