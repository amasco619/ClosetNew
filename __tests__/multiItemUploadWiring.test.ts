import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const picker = readFileSync('app/add-item.tsx', 'utf8');
const review = readFileSync('app/multi-item-review.tsx', 'utf8');
const client = readFileSync('lib/query-client.ts', 'utf8');
const routes = readFileSync('server/routes.ts', 'utf8');

assert.match(picker, /if \(multiplePieces\)[\s\S]*?pathname: '\/multi-item-review'/);
assert.match(picker, /selectionLimit: multiplePieces \|\| replaceItemId \? 1 : 10/);
assert.match(review, /getAiProcessingPreference\(\)/);
assert.match(review, /authenticatedApiRequest\('POST', '\/api\/classify-garments'/);
assert.match(review, /constructMultiItemDraft\(/);
assert.match(review, /selected\.length < 2/);
assert.match(review, /dialog\.confirm\(\{\s*title: 'Confirm the selected pieces',[\s\S]*?selectedPieces\.length[\s\S]*?label[\s\S]*?confirmLabel: 'Confirm and save'/);
assert.match(review, /addWardrobeGroupItems\(/);
assert.match(review, /runSaveAll\(/);
assert.match(client, /CLASSIFICATION_REQUEST_TIMEOUT_MS = 45_000/);
assert.match(client, /route === "\/api\/classify-garment" \|\| route === "\/api\/classify-garments"/);
assert.match(routes, /app\.post\("\/api\/classify-garments", aiLimiter, requireAuth, requireAiProcessingConsent, withAiLimit\(classifyMultiItem\)\)/);

console.log('Multi-item picker, confirmation, atomic save and provider-boundary wiring passed.');