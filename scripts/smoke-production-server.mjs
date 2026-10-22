import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'amodka-production-smoke-'));
let child;
let childExit;
let stderr = '';
const cleanPath = (process.env.PATH ?? '').split(path.delimiter)
  .filter(entry => !entry.includes('node_modules')).join(path.delimiter);
const installEnv = { ...process.env, PATH: cleanPath };

function run(args, cwd, env = process.env) {
  const result = spawnSync('npm', args, { cwd, env, stdio: 'inherit', timeout: 300_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `npm ${args.join(' ')} failed`);
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

try {
  // Same server compiler/flags as .replit's deployment build. Only output location
  // changes, so the smoke test never overwrites an existing server_dist directory.
  run(['run', 'server:build', '--', `--outdir=${path.join(temporary, 'server_dist')}`], root);
  for (const file of ['package.json', 'package-lock.json', 'app.json',
    'scripts/postinstall.mjs', 'scripts/install-hooks.mjs', 'server/templates/landing-page.html']) {
    cpSync(path.join(root, file), path.join(temporary, file), { recursive: true });
  }
  if (existsSync(path.join(root, 'patches'))) {
    cpSync(path.join(root, 'patches'), path.join(temporary, 'patches'), { recursive: true });
  }
  // No --ignore-scripts and no workspace node_modules/.bin on PATH.
  run(['ci', '--omit=dev'], temporary, installEnv);

  // Inherit workspace configuration without printing it, but prevent startup's
  // cache-pruning/store probes from reaching Supabase or any other live service.
  const guard = path.join(temporary, 'offline-smoke.cjs');
  writeFileSync(guard, `
globalThis.fetch = async () => new Response('{}', {status: 503, headers: {'content-type': 'application/json'}});
const blocked = () => { throw new Error('Outbound requests disabled by production smoke test'); };
require('node:http').request = blocked;
require('node:https').request = blocked;
`);
  const port = await availablePort();
  child = spawn(process.execPath, ['server_dist/index.js'], {
    cwd: temporary,
    env: { ...installEnv, NODE_ENV: 'production', PORT: String(port), NODE_OPTIONS: `--require=${guard}` },
    // Provider/configuration errors must never expose workspace secrets in logs.
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-16_384); });
  childExit = new Promise(resolve => {
    child.once('error', () => resolve('spawn error'));
    child.once('exit', (code, signal) => resolve(`exit ${code ?? signal}`));
  });
  let stopped;
  childExit.then(result => { stopped = result; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const missing = stderr.match(/Cannot find (?:package|module) ['"]([@\w./-]+)['"]/);
    assert.equal(stopped, undefined,
      `Compiled server stopped before responding (${stopped})${missing ? `; missing module ${missing[1]}` : ''}`);
    let response;
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/user/entitlements`, {
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      await delay(200);
      continue;
    }
    assert.equal(response.status, 401, 'Unauthenticated route must reject without calling a provider');
    assert.deepEqual(await response.json(), { error: 'authentication_required' });
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    ready = true;
    break;
  }
  assert.ok(ready, 'Compiled server did not respond within 20 seconds');
  console.log(`[production smoke] PASS: compiled Node server, alternate port ${port}, HTTP 401 authentication_required`);
  console.log('[production smoke] Production dependencies only; live service requests blocked.');
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([childExit, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await childExit;
    }
  }
  rmSync(temporary, { recursive: true, force: true });
  console.log('[production smoke] Temporary install and process cleaned up.');
}
