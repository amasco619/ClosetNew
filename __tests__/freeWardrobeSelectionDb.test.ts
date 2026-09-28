import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

// Disposable local PostgreSQL only; this test never reads application config or Supabase credentials.
const dir = mkdtempSync(join(tmpdir(), 'amodka-wardrobe-cap-'))
const username = userInfo().username
let started = false

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no local port')
  return new Promise((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve(address.port)))
}

async function main(): Promise<void> {
  const port = await freePort()
  execFileSync('initdb', ['-D', dir, '--auth=trust', '--no-sync'], { stdio: 'pipe' })
  execFileSync('pg_ctl', [
    '-D', dir, '-o', `-k ${dir} -p ${port} -c listen_addresses=''`,
    '-l', join(dir, 'server.log'), '-w', 'start',
  ], { stdio: 'pipe' })
  started = true

  const admin = new Client({ host: dir, port, user: username, database: 'postgres' })
  await admin.connect()
  try {
    await admin.query(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.user_profiles (
        id uuid PRIMARY KEY,
        premium boolean DEFAULT false,
        premium_expires_at timestamptz
      );
      CREATE TABLE public.wardrobe_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
        garment_type text NOT NULL,
        sub_type text,
        color_family text,
        description text,
        occasion text[],
        image_url text,
        cleaned_image_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, id)
      );
      ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "wardrobe read own" ON public.wardrobe_items
        FOR SELECT TO authenticated USING (auth.uid() = user_id);
      CREATE POLICY "wardrobe insert own" ON public.wardrobe_items
        FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "wardrobe update own" ON public.wardrobe_items
        FOR UPDATE TO authenticated USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "wardrobe delete own" ON public.wardrobe_items
        FOR DELETE TO authenticated USING (auth.uid() = user_id);
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_items TO authenticated;
      GRANT INSERT (garment_type) ON public.wardrobe_items TO PUBLIC;
    `)

    const freeId = randomUUID()
    const bobId = randomUUID()
    const expiredId = randomUUID()
    const premiumId = randomUUID()
    await admin.query(
      `INSERT INTO public.user_profiles (id, premium, premium_expires_at)
       VALUES ($1, false, NULL), ($2, false, NULL),
         ($3, true, now() - interval '1 second'),
         ($4, true, now() + interval '1 year')`,
      [freeId, bobId, expiredId, premiumId],
    )
    for (const [userId, itemCount] of [[freeId, 28], [expiredId, 35], [premiumId, 1999]] as const) {
      await admin.query(
        `INSERT INTO public.wardrobe_items (user_id, garment_type)
         SELECT $1, 'top' FROM generate_series(1, $2)`,
        [userId, itemCount],
      )
    }

    const migration = readFileSync(
      'supabase/migrations/20260928000000_free_wardrobe_selection.sql',
      'utf8',
    )
    // An effective inherited INSERT grant must abort rather than survive unnoticed.
    await admin.query(`
      CREATE ROLE wardrobe_insert_parent NOLOGIN;
      GRANT INSERT (user_id) ON public.wardrobe_items TO wardrobe_insert_parent;
      GRANT wardrobe_insert_parent TO authenticated;
    `)
    await admin.query('BEGIN')
    try {
      await assert.rejects(admin.query(migration), /Authenticated wardrobe INSERT privilege remains/)
    } finally {
      await admin.query('ROLLBACK')
      await admin.query('REVOKE wardrobe_insert_parent FROM authenticated')
    }
    await admin.query('BEGIN')
    try {
      await admin.query(migration)
      await admin.query('COMMIT')
    } catch (error) {
      await admin.query('ROLLBACK')
      throw error
    }

    const grants = await admin.query(`
      SELECT has_table_privilege('authenticated','public.wardrobe_items','INSERT') AS table_insert,
        has_column_privilege('authenticated','public.wardrobe_items','id','INSERT') AS id_insert,
        has_column_privilege('authenticated','public.wardrobe_items','user_id','INSERT') AS user_insert,
        has_column_privilege('authenticated','public.wardrobe_items','garment_type','INSERT') AS type_insert,
        has_column_privilege('anon','public.wardrobe_items','garment_type','INSERT') AS anon_type_insert,
        has_table_privilege('authenticated','public.wardrobe_items','SELECT') AS can_select,
        has_table_privilege('authenticated','public.wardrobe_items','UPDATE') AS can_update,
        has_table_privilege('authenticated','public.wardrobe_items','DELETE') AS can_delete
    `)
    assert.deepEqual(grants.rows[0], {
      table_insert: false,
      id_insert: false,
      user_insert: false,
      type_insert: false,
      anon_type_insert: false,
      can_select: true,
      can_update: true,
      can_delete: true,
    })

    async function as<T>(
      userId: string,
      action: (client: Client) => Promise<T>,
    ): Promise<T> {
      const client = new Client({ host: dir, port, user: username, database: 'postgres' })
      await client.connect()
      try {
        await client.query('SET ROLE authenticated')
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId])
        return await action(client)
      } finally {
        await client.end()
      }
    }
    async function expectCode(action: Promise<unknown>, code: string, message?: string): Promise<void> {
      try {
        await action
        assert.fail(`expected PostgreSQL error ${code}`)
      } catch (error) {
        assert.equal((error as { code?: string }).code, code)
        if (message) assert.equal((error as { message?: string }).message, message)
      }
    }
    async function insertMany(client: Client, items: unknown[]): Promise<string[]> {
      const result = await client.query(
        'SELECT public.insert_wardrobe_items($1::jsonb) AS ids',
        [JSON.stringify(items)],
      )
      return result.rows[0].ids
    }
    const item = (garmentType = 'top') => ({ garment_type: garmentType })
    const freeInitialIds = (await admin.query(
      'SELECT id FROM public.wardrobe_items WHERE user_id=$1 ORDER BY created_at, id',
      [freeId],
    )).rows.map(row => row.id as string)

    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1', [freeId],
    )).rows[0].count, '28', 'small Free wardrobe is backfilled in full')
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1', [expiredId],
    )).rows[0].count, '0', 'larger expired-Premium wardrobe is not silently selected')

    await as(freeId, async db => {
      await expectCode(
        db.query('INSERT INTO public.wardrobe_items (user_id, garment_type) VALUES ($1, $2)', [freeId, 'top']),
        '42501',
      )
    })

    const [firstBatch, secondBatch] = await Promise.all([
      as(freeId, db => insertMany(db, [item()])),
      as(freeId, db => insertMany(db, [item()])),
    ])
    assert.equal(firstBatch.length + secondBatch.length, 2)
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1', [freeId],
    )).rows[0].count, '30', 'concurrent Free inserts serialize at exactly 30 selected rows')

    const freeItems = (await admin.query(
      'SELECT id FROM public.wardrobe_items WHERE user_id=$1 ORDER BY created_at, id',
      [freeId],
    )).rows.map(row => row.id as string)
    await as(freeId, async db => {
      await db.query('SELECT public.set_free_wardrobe_selection($1::uuid[])', [freeItems.slice(0, 29)])
      const before = await db.query(
        'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [freeId],
      )
      await expectCode(
        insertMany(db, [item(), item()]).then(() => undefined),
        'P0001',
        'WARDROBE_CAPACITY_REACHED',
      )
      assert.equal((await db.query(
        'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [freeId],
      )).rows[0].count, before.rows[0].count, 'rejected batch inserts no partial rows')
    })

    const expiredInitialCount = Number((await admin.query(
      'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [expiredId],
    )).rows[0].count)
    await as(expiredId, async db => {
      const inserted = await db.query(
        'SELECT public.insert_wardrobe_item($1::jsonb) AS id',
        [JSON.stringify(item())],
      )
      assert.match(inserted.rows[0].id, /^[0-9a-f-]{36}$/i)
      const count = await db.query(
        'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [expiredId],
      )
      assert.equal(Number(count.rows[0].count), expiredInitialCount + 1,
        'expired Premium follows Free selection rules without deleting retained items')
    })
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1', [expiredId],
    )).rows[0].count, '1', 'expired Premium insertion auto-selects the new item')

    const rollbackBatchId = randomUUID()
    const expiredCountBeforeInvalid = (await admin.query(
      'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [expiredId],
    )).rows[0].count
    await as(expiredId, async db => {
      await expectCode(
        insertMany(db, [
          { id: rollbackBatchId, garment_type: 'top' },
          { id: rollbackBatchId, garment_type: 'bottom' },
        ]).then(() => undefined),
        '23505',
      )
      await expectCode(
        insertMany(db, [item(), { garment_type: 5 }]).then(() => undefined),
        '22023',
      )
    })
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [expiredId],
    )).rows[0].count, expiredCountBeforeInvalid, 'invalid batches leave no partial wardrobe rows')

    const premiumBefore = (await admin.query(
      'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [premiumId],
    )).rows[0].count
    await as(premiumId, async db => {
      assert.equal((await insertMany(db, [item()])).length, 1)
      await expectCode(
        insertMany(db, [item()]).then(() => undefined),
        'P0001',
        'WARDROBE_CAPACITY_REACHED',
      )
    })
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_items WHERE user_id=$1', [premiumId],
    )).rows[0].count, String(Number(premiumBefore) + 1), 'Premium can reach 2,000 but not exceed it')
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1', [premiumId],
    )).rows[0].count, '0', 'Premium inserts do not enter the Free selection')

    const aliceSelection = (await as(freeId, db => db.query(
      'SELECT item_id FROM public.wardrobe_free_selections ORDER BY item_id',
    ))).rows.map(row => row.item_id as string)
    assert.equal(aliceSelection.length, 29)
    await as(bobId, async db => {
      assert.equal((await db.query('SELECT item_id FROM public.wardrobe_free_selections')).rowCount, 0,
        'selection SELECT RLS hides other users')
      await expectCode(
        db.query('SELECT public.set_free_wardrobe_selection($1::uuid[])', [[aliceSelection[0]]]),
        '42501',
      )
    })
    const deletedId = aliceSelection[0]
    await as(freeId, async db => {
      assert.equal((await db.query(
        'DELETE FROM public.wardrobe_items WHERE id=$1', [deletedId],
      )).rowCount, 1)
    })
    assert.equal((await admin.query(
      'SELECT count(*) FROM public.wardrobe_free_selections WHERE user_id=$1 AND item_id=$2',
      [freeId, deletedId],
    )).rows[0].count, '0', 'deleting an owned wardrobe item cascades its selection')

    console.log('Free wardrobe local PostgreSQL migration, ACL, capacity, atomicity and RLS checks passed')
  } finally {
    await admin.end()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  if (started) execFileSync('pg_ctl', ['-D', dir, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' })
  rmSync(dir, { recursive: true, force: true })
})