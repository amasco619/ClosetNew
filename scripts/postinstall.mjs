import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// A clean production install has no patch-package binary. Do not need it when
// there are no patches; if patches exist, missing tooling or patch failure is fatal.
if (existsSync('patches') && readdirSync('patches').some(name => name.endsWith('.patch'))) {
  execFileSync('patch-package', { stdio: 'inherit' });
}
await import('./install-hooks.mjs');
