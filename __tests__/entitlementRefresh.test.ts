import assert from 'node:assert/strict';
import { readCurrentEntitlement } from '../lib/entitlements';

async function main() {
  const outage = new Error('entitlement service unavailable');
  let premium = true;
  let unavailable = false;
  let reads = 0;
  let errorsReported = 0;
  const read = async () => {
    reads++;
    throw outage;
  };
  const onUnavailable = (error: unknown) => {
    assert.equal(error, outage);
    unavailable = true;
    premium = false;
    errorsReported++;
  };

  assert.equal(
    await readCurrentEntitlement(read, () => true, false, onUnavailable),
    null,
    'default refresh mode returns no entitlement when the server read fails',
  );
  assert.equal(unavailable, true, 'default refresh mode marks entitlement unavailable');
  assert.equal(premium, false, 'a failed server check clears previously premium state');
  assert.equal(reads, 1, 'refresh reads only the authoritative server entitlement');
  assert.equal(errorsReported, 1, 'current server failure is reported');

  premium = true;
  unavailable = false;
  await assert.rejects(
    readCurrentEntitlement(read, () => true, true, onUnavailable),
    error => error === outage,
    'rejectUnavailable preserves the server failure rather than confirming free access',
  );
  assert.equal(unavailable, true, 'rejectUnavailable still marks the entitlement unavailable');
  assert.equal(premium, false, 'rejectUnavailable also fails closed');
  assert.equal(reads, 2, 'rejectUnavailable does not consult another access source');

  let current = true;
  let staleUnavailableCalls = 0;
  const deferred = Promise.withResolvers<{ isPremium: boolean; expiresAt: string | null }>();
  const staleResult = readCurrentEntitlement(
    () => deferred.promise,
    () => current,
    false,
    () => staleUnavailableCalls++,
  );
  current = false;
  deferred.resolve({ isPremium: true, expiresAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(await staleResult, null, 'a superseded premium response cannot grant access');
  assert.equal(staleUnavailableCalls, 0, 'stale results cannot mutate the newer account state');

  current = false;
  await assert.rejects(
    readCurrentEntitlement(
      async () => ({ isPremium: true, expiresAt: '2099-01-01T00:00:00.000Z' }),
      () => current,
      true,
      () => assert.fail('superseded result must not update entitlement state'),
    ),
    /unavailable or superseded/,
    'rejectUnavailable rejects a superseded result',
  );

  console.log('Runtime entitlement refresh outage and superseded-request checks passed.');
}

void main();
