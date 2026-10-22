import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { Client } from 'pg'

// Fresh Unix-socket cluster only: never read DATABASE_URL or Supabase configuration.
const directory = mkdtempSync(join(tmpdir(), 'amodka-wardrobe-rls-'))
let started = false
const users = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
const inserted = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const report = readFileSync('docs/reports/wardrobe-items-rls-preflight.md', 'utf8')
function reviewedSql(section: string): string {
  const sql = report.split(`<!-- ${section}-sql -->`)[1]?.match(/```sql\n([\s\S]*?)```/)?.[1]
  assert.ok(sql, `${section} SQL must exist in the approval report`)
  return sql
}
const proposal = reviewedSql('proposed')
const rollback = reviewedSql('rollback')
assert.equal(readFileSync(
  'supabase/migrations/20261022130922_wardrobe_items_rls_policy_tidy_up.sql', 'utf8'
).trim(), proposal.trim(), 'Recorded migration must exactly mirror approved SQL')
// Independent snapshot of the nine live policy definitions, before proposal.
const current = `
CREATE POLICY "Users can delete own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can insert own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own wardrobe" ON public.wardrobe_items AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users manage own wardrobe items" ON public.wardrobe_items AS PERMISSIVE FOR ALL TO PUBLIC USING (auth.uid() = user_id);
`
const policySnapshot = `SELECT jsonb_agg(jsonb_build_object(
  'policyname',policyname,'cmd',cmd,'roles',roles,'permissive',permissive,
  'qual',qual,'with_check',with_check) ORDER BY policyname COLLATE "C") AS policies
  FROM pg_policies WHERE schemaname='public' AND tablename='wardrobe_items'`
const tableSnapshot = `SELECT relacl::text, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE oid='public.wardrobe_items'::regclass`
type Outcome = { count: number | null; ids: string[] } | { code: string }
type Case = { name: string; role: string; user: string; sql: string; expected: Outcome; jsonClaim?: boolean }
const denied = { code: '42501' }
const allowed = (...ids: string[]): Outcome => ({ count: ids.length, ids: ids.sort() })
let checks = 0

function cases(rlsOnly: boolean): Case[] {
  const result: Case[] = []
  for (const [index, user] of users.entries()) {
    const other = users[1 - index]
    const add = (name: string, sql: string, expected: Outcome, jsonClaim = false) =>
      result.push({ name: `${index}:${name}`, role: 'authenticated', user, sql, expected, jsonClaim })
    add('select', 'SELECT id FROM wardrobe_items ORDER BY id', allowed(user))
    add('foreign select', `SELECT id FROM wardrobe_items WHERE id='${other}'`, allowed())
    add('update', `UPDATE wardrobe_items SET label='changed' WHERE id='${user}' RETURNING id`, allowed(user))
    add('foreign update', `UPDATE wardrobe_items SET label='changed' WHERE id='${other}' RETURNING id`, allowed())
    add('broad update', "UPDATE wardrobe_items SET label='changed' RETURNING id", allowed(user))
    add('reassign owner', `UPDATE wardrobe_items SET user_id='${other}' WHERE id='${user}' RETURNING id`, denied)
    add('steal row', `UPDATE wardrobe_items SET user_id='${user}' WHERE id='${other}' RETURNING id`, allowed())
    add('delete', `DELETE FROM wardrobe_items WHERE id='${user}' RETURNING id`, allowed(user))
    add('foreign delete', `DELETE FROM wardrobe_items WHERE id='${other}' RETURNING id`, allowed())
    add('broad delete', 'DELETE FROM wardrobe_items RETURNING id', allowed(user))
    add('insert', `INSERT INTO wardrobe_items(id,user_id) VALUES('${inserted}','${user}') RETURNING id`,
      rlsOnly ? allowed(inserted) : denied)
    add('foreign insert', `INSERT INTO wardrobe_items(id,user_id) VALUES('${inserted}','${other}') RETURNING id`, denied)
    add('JSON claim fallback', 'SELECT id FROM wardrobe_items ORDER BY id', allowed(user), true)
  }
  for (const role of ['anon', 'authenticated', 'policy_probe']) {
    for (const user of role === 'anon' ? ['', users[0]] : ['']) {
      const rowIds = rlsOnly && user ? [user] : []
      const permitted = rlsOnly || role === 'authenticated'
      const commands = [
        ['select', 'SELECT id FROM wardrobe_items ORDER BY id', allowed(...rowIds)],
        ['update', "UPDATE wardrobe_items SET label='changed' RETURNING id", allowed(...rowIds)],
        ['delete', 'DELETE FROM wardrobe_items RETURNING id', allowed(...rowIds)],
        ['insert', `INSERT INTO wardrobe_items(id,user_id) VALUES('${inserted}','${users[0]}') RETURNING id`,
          rlsOnly && user ? allowed(inserted) : denied],
      ] as const
      for (const [name, sql, expected] of commands) {
        result.push({ name: `${role}:${user || 'no uid'}:${name}`, role, user, sql,
          expected: permitted ? expected : denied })
      }
    }
  }
  // An unrelated role with only PUBLIC policy membership proves we did not narrow TO PUBLIC.
  if (rlsOnly) {
    for (const entry of result.filter(c => c.role === 'authenticated' && c.user === users[0])) {
      result.push({ ...entry, role: 'policy_probe', name: `PUBLIC coverage:${entry.name}` })
    }
  }
  for (const [name, sql, expected] of [
    ['select', 'SELECT id FROM wardrobe_items ORDER BY id', allowed(...users)],
    ['update', "UPDATE wardrobe_items SET label='changed' RETURNING id", allowed(...users)],
    ['delete', 'DELETE FROM wardrobe_items RETURNING id', allowed(...users)],
    ['reassign', `UPDATE wardrobe_items SET user_id='${users[1]}' WHERE id='${users[0]}' RETURNING id`, allowed(users[0])],
    ['insert', `INSERT INTO wardrobe_items(id,user_id) VALUES('${inserted}','${users[0]}') RETURNING id`, denied],
  ] as const) {
    result.push({ name: `service bypass:${name}`, role: 'service_role', user: '', sql, expected })
  }
  return result
}

async function runCases(client: Client, rlsOnly: boolean): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const entry of cases(rlsOnly)) {
    await client.query('BEGIN')
    let outcome: Outcome
    try {
      await client.query(`SET LOCAL ROLE ${entry.role}`)
      await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true),
        set_config('request.jwt.claims',$2,true)`, [
        entry.jsonClaim ? '' : entry.user,
        entry.jsonClaim ? JSON.stringify({ sub: entry.user }) : '{}',
      ])
      try {
        const response = await client.query<{ id: string }>(entry.sql)
        outcome = { count: response.rowCount, ids: response.rows.map(row => row.id).sort() }
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== '42501') throw error
        outcome = { code: error.code }
      }
    } finally {
      await client.query('ROLLBACK')
    }
    assert.deepEqual(outcome!, entry.expected, `${rlsOnly ? 'RLS-only' : 'live grants'}: ${entry.name}`)
    outcomes.push(outcome!)
    checks++
  }
  return outcomes
}

async function main(): Promise<void> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
  execFileSync('initdb', ['-D', directory, '--auth=trust', '--no-sync'], { stdio: 'pipe' })
  execFileSync('pg_ctl', ['-D', directory, '-o', `-k ${directory} -p ${port} -c listen_addresses=''`,
    '-l', join(directory, 'server.log'), '-w', 'start'], { stdio: 'pipe' })
  started = true
  const client = new Client({ host: directory, port, user: userInfo().username, database: 'postgres' })
  await client.connect()
  try {
    await client.query(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE policy_probe NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
          (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid
      $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role, policy_probe;
      CREATE TABLE public.wardrobe_items(id uuid PRIMARY KEY, user_id uuid NOT NULL, label text);
      ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON public.wardrobe_items FROM PUBLIC, anon, authenticated, policy_probe, service_role;
      GRANT SELECT, UPDATE, DELETE ON public.wardrobe_items TO authenticated, service_role;
      INSERT INTO wardrobe_items(id,user_id) VALUES('${users[0]}','${users[0]}'),('${users[1]}','${users[1]}');
    `)
    // Repository history needs an external base schema, then supplies only four policies.
    await assert.rejects(client.query(readFileSync(
      'supabase/migrations/20260610000000_user_profiles_rls.sql', 'utf8'
    )), /relation "user_profiles" does not exist/)
    const historicalWardrobeSection = readFileSync(
      'supabase/migrations/20260814000000_rls_all_tables.sql', 'utf8'
    ).split('-- ─── wear_logs')[0]
    await client.query(historicalWardrobeSection)
    const replayPolicies = (await client.query(policySnapshot)).rows[0].policies
    assert.equal(replayPolicies.length, 4)
    const replayHash = (await client.query(
      `SELECT md5(policies::text) AS hash FROM (${policySnapshot}) snapshot`
    )).rows[0].hash
    console.log(`wardrobeItemsRls: historical four-policy snapshot=${replayHash}; strict migration correctly refuses it`)
    await assert.rejects(client.query(proposal), /policy snapshot changed/)
    await client.query('ROLLBACK')
    assert.deepEqual((await client.query(policySnapshot)).rows[0].policies, replayPolicies)
    for (const policy of replayPolicies) {
      await client.query(`DROP POLICY "${policy.policyname.replaceAll('"', '""')}" ON public.wardrobe_items`)
    }
    await client.query(current)
    const original = (await client.query(policySnapshot)).rows
    assert.equal(original[0].policies.length, 9)
    for (const rlsOnly of [false, true]) {
      if (rlsOnly) await client.query(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_items TO authenticated, anon, policy_probe')
      const table = (await client.query(tableSnapshot)).rows
      const before = await runCases(client, rlsOnly)
      // The reviewed guard must reject drift before any policy is changed.
      await client.query('CREATE POLICY "fixture drift" ON public.wardrobe_items FOR SELECT TO authenticated USING (false)')
      await assert.rejects(client.query(proposal), /policy snapshot changed/)
      await client.query('ROLLBACK')
      assert.equal((await client.query(policySnapshot)).rows[0].policies.length, 10)
      await client.query('DROP POLICY "fixture drift" ON public.wardrobe_items')

      await client.query(proposal)
      assert.deepEqual((await client.query(policySnapshot)).rows[0].policies, [{
        policyname: 'Users manage own wardrobe items', cmd: 'ALL', roles: ['public'],
        permissive: 'PERMISSIVE', qual: '(auth.uid() = user_id)', with_check: '(auth.uid() = user_id)',
      }])
      assert.deepEqual((await client.query(tableSnapshot)).rows, table, 'No ACL or RLS-flag change')
      assert.deepEqual(await runCases(client, rlsOnly), before, 'Every command result must match')
      await client.query(rollback)
      assert.deepEqual((await client.query(policySnapshot)).rows, original, 'Exact nine-policy catalog restoration')
      assert.deepEqual((await client.query(tableSnapshot)).rows, table, 'Rollback preserves ACL/RLS flags')
      assert.deepEqual(await runCases(client, rlsOnly), before, 'Rollback restores access outcomes')
    }
    console.log(`wardrobeItemsRls: ${checks} command checks passed across current/proposed/rollback; both ACL modes, exact metadata and drift guard verified`)
  } finally {
    await client.end()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  try {
    if (started) execFileSync('pg_ctl', ['-D', directory, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
