'use strict';

// Synthetic data only. Destructive fixture setup is permitted exclusively for
// this exact loopback test database, never an operator/production connection.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { initializeAdmin } = require('../bootstrap');
const { issueToken } = require('../security');
const { businessDate } = require('../payments');

test('real PostgreSQL: security migration, explicit bootstrap and concurrent versioned writes', {
  skip: !process.env.PAYMENT_TEST_DATABASE_URL,
}, async t => {
  const url = new URL(process.env.PAYMENT_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'loopback database required');
  assert.equal(url.pathname, '/lunch_payment_test', 'dedicated destructive-fixture database required');
  const real = new Pool({ connectionString: url.toString(), ssl: false });
  process.env.DATABASE_URL = 'postgres://synthetic:synthetic@127.0.0.1:1/never_connect';
  process.env.JWT_SECRET = 'synthetic-real-pg-security-regression';
  process.env.PORT = '0';
  process.env.RATE_LIMIT_STORE = '';
  const { app, pool, start } = require('../server');
  pool.query = real.query.bind(real);
  pool.connect = real.connect.bind(real);
  t.after(async () => { await real.end(); await pool.end(); });
  await real.query(`
    drop schema if exists public cascade; create schema public;
    create table users(id serial primary key, username text unique not null, password_hash text not null,
      role text not null, status text not null, auth_version integer not null default 0,
      created_at timestamptz default now(), updated_at timestamptz default now(), last_login_at timestamptz);
    create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text,
      open_end text, manual_locked boolean not null default false);
    create table menus(id serial primary key, name text, note text, image_url text, image_path text);
    create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);
    create table orders(id serial primary key, seat integer unique, submitted boolean default false,
      internal_only boolean default false, paid boolean default false, created_at timestamptz, updated_at timestamptz);
    create table order_items(id serial primary key, order_id integer references orders(id), name text,
      unit_price integer, qty integer, updated_at timestamptz default now());
    create table preorder_settings(id integer primary key, enabled boolean, dates text[]);
    create table preorders(id serial primary key, d date, seat integer, submitted boolean default false,
      internal_only boolean default false, paid boolean default false, created_at timestamptz default now(),
      updated_at timestamptz default now(), unique(d,seat));
    create table preorder_items(id serial primary key, preorder_id integer references preorders(id),
      name text, unit_price integer, qty integer);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb,
      ip text, ua text, ts timestamptz default now());
    do $$ begin
      if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    alter table users enable row level security;
    revoke all on users from public, anon, authenticated;
    insert into settings(id,active_menu_id,open_days,open_start,open_end)
      values(1,1,'{0,1,2,3,4,5,6}','00:00','23:59');
    insert into menus(id,name) values(1,'synthetic isolated menu');
    insert into menu_items(menu_id,code,name,price) values(1,1,'synthetic lunch',95);
  `);
  const migration = fs.readFileSync(path.join(__dirname,
    '../../supabase/migrations/20261020071803_individual_initial_credentials.sql'), 'utf8');
  const legacyHash = await bcrypt.hash('synthetic-legacy-credential', 4);
  await real.query("insert into users(username,password_hash,role,status,auth_version) values('legacy',$1,'user','active',9)", [legacyHash]);

  await t.test('additive migration preserves legacy credentials, sessions, RLS and grants on repeated application', async () => {
    const access = async () => (await real.query(`select relrowsecurity, relacl::text as acl,
      has_table_privilege('anon','users','select') as anon_read,
      has_table_privilege('authenticated','users','update') as authenticated_write
      from pg_class where oid='public.users'::regclass`)).rows[0];
    const before = await access();
    await real.query(migration); await real.query(migration);
    const user = (await real.query("select * from users where username='legacy'")).rows[0];
    assert.equal(user.password_hash, legacyHash);
    assert.equal(user.auth_version, 9);
    assert.equal(user.role, 'user');
    assert.equal(user.must_change_password, false);
    assert.deepEqual(await access(), before);
    assert.equal(before.anon_read, false); assert.equal(before.authenticated_write, false);
  });
  await real.query('truncate users restart identity');

  await t.test('two first-install operators serialize and create one administrator without seat passwords', async () => {
    const results = await Promise.all([
      initializeAdmin(real, { username: 'synthetic-admin', password: 'synthetic-install-one-credential', hashPassword: value => bcrypt.hash(value, 4) }),
      initializeAdmin(real, { username: 'synthetic-admin-two', password: 'synthetic-install-two-credential', hashPassword: value => bcrypt.hash(value, 4) }),
    ]);
    assert.equal(results.filter(result => result.created).length, 1);
    const rows = (await real.query('select * from users')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].role, 'admin');
    assert.equal(rows[0].must_change_password, false);
  });
  await real.query(fs.readFileSync(path.join(__dirname,
    '../../supabase/migrations/20261019125241_quick_payment_context.sql'), 'utf8'));
  const today = businessDate();
  await real.query('insert into preorder_settings values(1,true,$1)', [[today]]);
  await real.query("insert into users(username,password_hash,role,status) values('2',$1,'user','active')", [legacyHash]);
  const admin = (await real.query("select * from users where role='admin'")).rows[0];
  const student = (await real.query("select * from users where username='2'")).rows[0];
  const adminToken = issueToken(admin, process.env.JWT_SECRET);
  const studentToken = issueToken(student, process.env.JWT_SECRET);
  const as = (req, token = studentToken) => req.set('Authorization', 'Bearer ' + token);
  const item = { name: 'synthetic lunch', unitPrice: 95, qty: 1 };

  async function raceAtSeatLock(route, lockNumber) {
    const snapshot = (await as(request(app).get(route)).expect(200)).body;
    let arrivals = 0, release, reject;
    const gate = new Promise((resolve, fail) => { release = resolve; reject = fail; });
    const timeout = setTimeout(() => reject(new Error('Both synthetic writes did not reach the transaction lock')), 5000);
    pool.connect = async () => {
      const client = await real.connect(); let waited = false;
      return { release: () => client.release(), async query(sql, params) {
        if (!waited && String(sql).includes(`pg_advisory_xact_lock(${lockNumber},`)) {
          waited = true; arrivals++; if (arrivals === 2) release(); await gate;
        }
        return client.query(sql, params);
      } };
    };
    try {
      const results = await Promise.all([
        as(request(app).put(route)).send({ ...snapshot, items: [item] }),
        as(request(app).put(route)).send({ ...snapshot, items: [{ ...item, qty: 2 }] }),
      ]);
      assert.equal(arrivals, 2, 'both transactions reached the real PostgreSQL lock concurrently');
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const current = (await as(request(app).get(route)).expect(200)).body;
      assert.equal(current.version, snapshot.version + 1);
      assert.equal(current.items.length, 1);
      await as(request(app).put(route)).send({ items: [item] }).expect(400);
    } finally {
      clearTimeout(timeout); pool.connect = real.connect.bind(real);
    }
  }
  await t.test('two daily writes with the same reference produce one commit and one conflict under real locks', () =>
    raceAtSeatLock('/api/orders/2', 7201));
  await t.test('two preorder writes with the same reference produce one commit and one conflict under real locks', () =>
    raceAtSeatLock(`/api/preorders/${today}/2`, 7202));

  await t.test('deleted seats stay deleted through repeated normal starts and explicit initializer retries; history is retained', async () => {
    const retained = (await real.query('select count(*)::int as n from orders')).rows[0].n;
    const retainedPreorders = (await real.query('select count(*)::int as n from preorders')).rows[0].n;
    await as(request(app).delete(`/api/users/${student.id}`), adminToken).expect(200);
    for (let restart = 0; restart < 2; restart++) {
      const listener = await start();
      await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
      assert.deepEqual(await initializeAdmin(real, { username: 'another-installer' }), { created: false });
    }
    assert.equal((await real.query("select count(*)::int as n from users where username='2'")).rows[0].n, 0);
    assert.equal((await real.query('select count(*)::int as n from orders')).rows[0].n, retained);
    assert.equal((await real.query('select count(*)::int as n from preorders')).rows[0].n, retainedPreorders);
    await as(request(app).get('/api/auth/me')).expect(401);
  });
});
