import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20261031184917_add_textile_identity_validation.sql',
  'utf8',
);
const values = [
  'george', 'hollandais', 'akwete', 'aso-oke', 'adire', 'brocade', 'lace',
  'lace-swiss-voile', 'lace-cord', 'lace-french', 'lace-guipure', 'lace-beaded',
];

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.valid_wardrobe_recommendation_semantics\(value jsonb\)/);
assert.match(migration, /'textileIdentity'/);
assert.match(migration, /WHEN 'textileIdentity' THEN ARRAY\[/);
for (const value of values) assert.ok(migration.includes(`'${value}'`), `migration allows ${value}`);
assert.equal(migration.includes('atampa'), false);

console.log('Textile identity migration contains the approved values only.');
