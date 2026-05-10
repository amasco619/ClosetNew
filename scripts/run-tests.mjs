import { readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const testDir = '__tests__';
const files = readdirSync(testDir)
  .filter(f => f.endsWith('.test.ts'))
  .sort();

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

let passed = 0;
let failed = 0;

for (const file of files) {
  const filePath = join(testDir, file);
  console.log(`\nRunning ${filePath} ...`);
  try {
    execSync(`npx tsx ${filePath}`, { stdio: 'inherit' });
    passed++;
  } catch {
    failed++;
  }
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) process.exit(1);
