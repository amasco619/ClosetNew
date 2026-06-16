/**
 * Sync check: every imageKey referenced in blueprintSlots.ts must resolve
 * to a real entry in the SAMPLE_IMAGES map inside wardrobeBlueprint.ts.
 *
 * wardrobeBlueprint.ts cannot be imported in Node/tsx because it calls
 * require() on PNG assets. Instead this test reads the file as text and
 * extracts SAMPLE_IMAGES keys with a regex — no mocking, no assets.
 *
 * What is verified:
 *   1. IMAGE KEY COVERAGE
 *      Every imageKey value used by any slot in STYLE_BLUEPRINT_SLOTS exists
 *      as a key in SAMPLE_IMAGES.  Catches the silent fallback to white_tee.
 *
 *   2. NO ORPHANED IMAGE KEYS
 *      Every key declared in SAMPLE_IMAGES is referenced by at least one slot.
 *      Catches dead entries that inflate the bundle without being used.
 *
 *   3. STYLE GOALS PARITY
 *      The six style goals in blueprintSlots.ts STYLE_GOALS match the six keys
 *      that STYLE_BLUEPRINT_SLOTS exposes.  Verifies the goal list stays in
 *      sync with the data map.
 *
 * Run: `npx tsx __tests__/blueprint-image-sync.test.ts`
 * Exits non-zero on any failed assertion.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { STYLE_BLUEPRINT_SLOTS, STYLE_GOALS } from '../constants/blueprintSlots';

// ── Assertion harness ─────────────────────────────────────────────────────────

let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ── Parse SAMPLE_IMAGES keys from wardrobeBlueprint.ts ───────────────────────

const blueprintSrc = readFileSync(
  join(__dirname, '..', 'constants', 'wardrobeBlueprint.ts'),
  'utf8',
);

/**
 * Extracts the set of key identifiers inside the SAMPLE_IMAGES constant.
 * The block looks like:
 *   const SAMPLE_IMAGES: Record<string, ImageSourcePropType> = {
 *     white_tee: require(...),
 *     cream_sweater: require(...),
 *     ...
 *   };
 * We capture everything between the opening brace and the matching closing
 * brace, then pull out the identifier before each colon.
 */
function parseSampleImageKeys(src: string): Set<string> {
  const blockMatch = src.match(
    /const\s+SAMPLE_IMAGES\s*:[^=]+=\s*\{([\s\S]*?)\};\s*\n/,
  );

  if (!blockMatch) {
    throw new Error(
      'Could not locate SAMPLE_IMAGES block in wardrobeBlueprint.ts. ' +
      'Has the constant been renamed or restructured?',
    );
  }

  const block = blockMatch[1];
  const keys = new Set<string>();
  // Match lines of the form:  identifier_name:   require(...)
  const lineRe = /^\s{2}(\w+)\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    keys.add(m[1]);
  }

  if (keys.size === 0) {
    throw new Error(
      'Parsed 0 keys from SAMPLE_IMAGES — regex may be out of sync with the ' +
      'file format. Check wardrobeBlueprint.ts for formatting changes.',
    );
  }

  return keys;
}

const sampleImageKeys = parseSampleImageKeys(blueprintSrc);

console.log(
  `\nParsed ${sampleImageKeys.size} SAMPLE_IMAGES keys from wardrobeBlueprint.ts`,
);

// ── Collect all imageKeys used across every blueprint goal ────────────────────

const usedImageKeys = new Set<string>();

for (const goal of STYLE_GOALS) {
  for (const slot of STYLE_BLUEPRINT_SLOTS[goal]) {
    usedImageKeys.add(slot.imageKey);
  }
}

console.log(
  `Found ${usedImageKeys.size} distinct imageKey values across all blueprints`,
);

// ── 1. IMAGE KEY COVERAGE ─────────────────────────────────────────────────────

console.log('\n1. Every slot imageKey resolves to a SAMPLE_IMAGES entry');

const missingKeys: string[] = [];

for (const goal of STYLE_GOALS) {
  const slots = STYLE_BLUEPRINT_SLOTS[goal];
  const missing = slots
    .filter(s => !sampleImageKeys.has(s.imageKey))
    .map(s => `${s.id} → "${s.imageKey}"`);

  assert(
    missing.length === 0,
    `${goal}: all ${slots.length} slots have a valid imageKey` +
    (missing.length > 0 ? `\n    missing: ${missing.join(', ')}` : ''),
  );

  missingKeys.push(...missing);
}

if (missingKeys.length > 0) {
  console.error(
    `\n  Keys missing from SAMPLE_IMAGES (would silently fall back to white_tee):\n` +
    missingKeys.map(k => `    ${k}`).join('\n'),
  );
}

// ── 2. NO ORPHANED IMAGE KEYS ─────────────────────────────────────────────────

console.log('\n2. Every SAMPLE_IMAGES key is referenced by at least one slot');

const orphaned = [...sampleImageKeys].filter(k => !usedImageKeys.has(k));

assert(
  orphaned.length === 0,
  `All ${sampleImageKeys.size} SAMPLE_IMAGES keys are referenced by at least one slot` +
  (orphaned.length > 0 ? `\n    orphaned: ${orphaned.join(', ')}` : ''),
);

if (orphaned.length > 0) {
  console.warn(
    `\n  Orphaned SAMPLE_IMAGES keys (unused, inflating the bundle):\n` +
    orphaned.map(k => `    ${k}`).join('\n'),
  );
}

// ── 3. STYLE GOALS PARITY ─────────────────────────────────────────────────────

console.log('\n3. STYLE_GOALS matches STYLE_BLUEPRINT_SLOTS keys');

const slotKeys = Object.keys(STYLE_BLUEPRINT_SLOTS);

assert(
  STYLE_GOALS.length === slotKeys.length,
  `STYLE_GOALS (${STYLE_GOALS.length}) and STYLE_BLUEPRINT_SLOTS (${slotKeys.length}) have the same count`,
);

for (const goal of STYLE_GOALS) {
  assert(
    goal in STYLE_BLUEPRINT_SLOTS,
    `STYLE_GOALS entry "${goal}" exists as a key in STYLE_BLUEPRINT_SLOTS`,
  );
}

for (const key of slotKeys) {
  assert(
    STYLE_GOALS.includes(key as never),
    `STYLE_BLUEPRINT_SLOTS key "${key}" is listed in STYLE_GOALS`,
  );
}

// ── 4. PARSER SELF-CHECK ──────────────────────────────────────────────────────

console.log('\n4. Parser sanity — known keys present in parsed set');

const knownKeys = ['white_tee', 'camel_coat', 'black_heels', 'gold_necklace'];
for (const k of knownKeys) {
  assert(
    sampleImageKeys.has(k),
    `Parsed set contains known key "${k}" (parser is working correctly)`,
  );
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll blueprint-image-sync tests passed.');
}
