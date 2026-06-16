import { writeFileSync, chmodSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const hooksDir = join('.git', 'hooks');
const hookPath = join(hooksDir, 'pre-commit');
const MARKER = '# auracloset:pre-commit';

if (!existsSync(hooksDir)) {
  console.log('[hooks] No .git/hooks directory found — skipping.');
  process.exit(0);
}

const hookBody = `#!/bin/sh
${MARKER} — blocks commits when any test or lint check fails.
# Re-install at any time with: npm run hooks:install

echo "[pre-commit] Running tests + lint..."
node scripts/run-tests.mjs
status=$?

if [ $status -ne 0 ]; then
  echo ""
  echo "[pre-commit] Tests or lint failed. Commit blocked."
  echo "[pre-commit] Fix the failures above, then try again."
  exit 1
fi

echo "[pre-commit] Tests and lint passed."
`;

if (existsSync(hookPath)) {
  const existing = readFileSync(hookPath, 'utf8');
  if (existing.includes(MARKER)) {
    writeFileSync(hookPath, hookBody, 'utf8');
    chmodSync(hookPath, '755');
    console.log('[hooks] pre-commit hook updated at', hookPath);
  } else {
    console.log('[hooks] A custom pre-commit hook already exists at', hookPath);
    console.log('[hooks] Skipping to avoid overwriting it.');
    console.log('[hooks] To install manually, append the contents of scripts/install-hooks.mjs.');
  }
} else {
  writeFileSync(hookPath, hookBody, 'utf8');
  chmodSync(hookPath, '755');
  console.log('[hooks] pre-commit hook installed at', hookPath);
}
