import { createSerialQueue } from '../lib/bulkClassifyCore';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    console.error(`  ✗ ${message}`);
    failures++;
  }
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

(async () => {
  console.log('\ncreateSerialQueue — isolated behavior');

  {
    const enqueue = createSerialQueue();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;

    const first = enqueue(async () => {
      started.push('first');
      maxActive = Math.max(maxActive, ++active);
      await firstGate;
      active--;
      return 'first';
    });
    const second = enqueue(async () => {
      started.push('second');
      maxActive = Math.max(maxActive, ++active);
      active--;
      return 'second';
    });

    await tick();
    assert(started.join(',') === 'first', 'strictly starts one task at a time');
    releaseFirst();
    assert((await Promise.all([first, second])).join(',') === 'first,second' && maxActive === 1,
      'preserves enqueue order without overlap');
  }

  {
    const enqueue = createSerialQueue();
    const rejected = enqueue(async () => { throw new Error('expected rejection'); });
    const recovery = enqueue(async () => 'recovered');
    await rejected.catch(() => undefined);
    assert(await recovery === 'recovered', 'later tasks run after an asynchronous rejection');
  }

  {
    const enqueue = createSerialQueue();
    const thrown = enqueue(() => { throw new Error('expected synchronous throw'); });
    const recovery = enqueue(async () => 'recovered');
    await thrown.catch(() => undefined);
    assert(await recovery === 'recovered', 'later tasks run after a synchronous throw');
  }

  {
    const enqueue = createSerialQueue();
    let secondStarted = false;
    enqueue(() => new Promise<string>(() => undefined));
    enqueue(async () => {
      secondStarted = true;
      return 'should remain queued';
    });
    await tick();
    assert(!secondStarted, 'a never-settling task blocks every later task indefinitely');
  }

  if (failures > 0) process.exitCode = 1;
})();
