'use strict';

// All credentials and records in this file are synthetic test fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { newDb } = require('pg-mem');
const { initializeAdmin } = require('../bootstrap');

function fixture() {
  const db = newDb();
  db.public.none(`
    create table users(id serial primary key, username text unique not null,
      password_hash text not null, role text not null, status text not null,
      auth_version integer not null default 0, must_change_password boolean not null default false,
      created_at timestamptz, updated_at timestamptz);
    create table orders(id serial primary key, seat integer, paid boolean, item text);
    create table preorders(id serial primary key, seat integer, item text);
  `);
  const { Pool } = db.adapters.createPg();
  const memoryPool = new Pool();
  let tail = Promise.resolve();
  const observed = [];
  // pg-mem does not implement PostgreSQL advisory locks. This adapter models
  // only the transaction lock; real PostgreSQL locking is a separate test.
  const pool = {
    async connect() {
      const client = await memoryPool.connect();
      let unlock;
      return {
        async query(sql, params) {
          observed.push(sql);
          if (/pg_advisory_xact_lock/.test(sql)) {
            const previous = tail;
            tail = new Promise(resolve => { unlock = resolve; });
            await previous;
            return { rows: [] };
          }
          try { return await client.query(sql, params); }
          finally {
            if (/^(COMMIT|ROLLBACK)$/.test(sql) && unlock) { unlock(); unlock = null; }
          }
        },
        release() { if (unlock) unlock(); client.release(); },
      };
    },
  };
  return { db, pool, observed, close: () => memoryPool.end() };
}

const credentials = () => ({ username: 'synthetic-install-admin', password: 'synthetic-install-only-credential' });
const fastHash = value => bcrypt.hash(value, 4);

test('bootstrap creates only one first administrator and never seat credentials', async t => {
  const f = fixture(); t.after(f.close);
  assert.deepEqual(await initializeAdmin(f.pool, credentials()), { created: true });
  const rows = f.db.public.many('select * from users');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, 'admin');
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].auth_version, 0);
  assert.equal(rows[0].must_change_password, false);
  assert.notEqual(rows[0].password_hash, credentials().password);
  assert.equal(await bcrypt.compare(credentials().password, rows[0].password_hash), true);
  assert.equal(f.db.public.one('select count(*) as n from orders').n, 0);
  assert.ok(f.observed.findIndex(sql => /pg_advisory_xact_lock/.test(sql)) < f.observed.findIndex(sql => /^select 1 from users/.test(sql)));
});

test('bootstrap on an existing system is a no-op even if configured admin is absent', async t => {
  const f = fixture(); t.after(f.close);
  f.db.public.none(`
    insert into users(username,password_hash,role,status,auth_version) values('existing-person','synthetic-existing-hash','user','disabled',9);
    insert into orders(seat,paid,item) values(2,true,'synthetic historical lunch');
    insert into preorders(seat,item) values(2,'synthetic historical preorder');
  `);
  const before = JSON.stringify({ users: f.db.public.many('select * from users'), orders: f.db.public.many('select * from orders'), preorders: f.db.public.many('select * from preorders') });
  assert.deepEqual(await initializeAdmin(f.pool, {
    hashPassword() { throw new Error('Existing installations must not generate or hash passwords.'); },
  }), { created: false });
  assert.equal(JSON.stringify({ users: f.db.public.many('select * from users'), orders: f.db.public.many('select * from orders'), preorders: f.db.public.many('select * from preorders') }), before);
});

test('bootstrap is idempotent and does not recreate a deleted seat on re-install attempts', async t => {
  const f = fixture(); t.after(f.close);
  await initializeAdmin(f.pool, { ...credentials(), hashPassword: fastHash });
  f.db.public.none(`
    insert into users(username,password_hash,role,status) values('2','synthetic-seat-hash','user','active');
    insert into orders(seat,paid,item) values(2,true,'retained lunch');
    insert into preorders(seat,item) values(2,'retained preorder');
    delete from users where username='2';
  `);
  const original = f.db.public.one('select * from users');
  for (let run = 0; run < 3; run++) {
    assert.deepEqual(await initializeAdmin(f.pool, { ...credentials(), hashPassword: fastHash }), { created: false });
    assert.equal(f.db.public.one("select count(*) as n from users where username='2'").n, 0);
    assert.deepEqual(f.db.public.one('select * from users'), original);
  }
  assert.equal(f.db.public.one('select count(*) as n from orders').n, 1);
  assert.equal(f.db.public.one('select count(*) as n from preorders').n, 1);
});

test('bootstrap validates explicit first-admin credentials and rolls back failures', async t => {
  for (const invalid of [{}, { username: 'admin', password: 'short' }, { username: '01', password: credentials().password }, { username: 'admin', password: '密'.repeat(25) }]) {
    const f = fixture(); t.after(f.close);
    await assert.rejects(initializeAdmin(f.pool, invalid), error => error.code === 'BOOTSTRAP_INVALID_CREDENTIALS');
    assert.equal(f.db.public.one('select count(*) as n from users').n, 0);
    assert.equal(f.observed.at(-1), 'ROLLBACK');
  }
  const f = fixture(); t.after(f.close);
  await assert.rejects(initializeAdmin(f.pool, { ...credentials(), hashPassword() { throw new Error('synthetic hash failure'); } }), /synthetic hash failure/);
  assert.equal(f.db.public.one('select count(*) as n from users').n, 0);
  assert.equal(f.observed.at(-1), 'ROLLBACK');
});

test('bootstrap concurrent installers use a serialized transaction in the isolated lock adapter', async t => {
  const f = fixture(); t.after(f.close);
  const results = await Promise.all([
    initializeAdmin(f.pool, { ...credentials(), hashPassword: fastHash }),
    initializeAdmin(f.pool, { username: 'other-install-admin', password: credentials().password, hashPassword: fastHash }),
  ]);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(f.db.public.one('select count(*) as n from users').n, 1);
  assert.equal(f.observed.filter(sql => /pg_advisory_xact_lock/.test(sql)).length, 2);
});

test('bootstrap normal server restarts perform no user insert, reset or deletion', async t => {
  process.env.DATABASE_URL = 'postgres://synthetic:synthetic@127.0.0.1:1/never_connect';
  process.env.JWT_SECRET = 'synthetic-bootstrap-server-import-only';
  process.env.ADMIN_DEFAULT_PASS = 'synthetic-ignored-by-server-start';
  process.env.SEAT_DEFAULT_PASS = 'synthetic-ignored-by-server-start';
  const { app, pool, start } = require('../server');
  t.after(() => pool.end());
  const originalQuery = pool.query;
  const originalListen = app.listen;
  const queries = [];
  pool.query = async sql => { queries.push(sql); return { rows: [] }; };
  const fakeListener = { syntheticOnly: true };
  app.listen = () => fakeListener;
  t.after(() => { pool.query = originalQuery; app.listen = originalListen; });
  assert.equal(await start(), fakeListener);
  assert.equal(await start(), fakeListener);
  assert.ok(queries.length > 0);
  assert.equal(queries.filter(sql => /\b(insert\s+into|update|delete\s+from)\s+(?:public\.)?users\b/i.test(sql)).length, 0);
});
