'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const request = require('supertest');
const { issueToken } = require('../security');
const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;

test('real PostgreSQL payment migration, locking and rollback', { skip: !databaseUrl }, async t => {
  const target = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'integration tests only allow a loopback database');
  assert.equal(target.pathname, '/lunch_payment_test', 'integration tests never use a production database');
  const real = new Pool({ connectionString: databaseUrl, ssl: false });
  process.env.DATABASE_URL = 'postgres://local-test:local-test@127.0.0.1:1/lunch_test';
  process.env.JWT_SECRET = 'isolated-postgres-integration-test-secret';
  process.env.ADMIN_DEFAULT_PASS = 'isolated-admin-bootstrap';
  process.env.SEAT_DEFAULT_PASS = 'isolated-seat-bootstrap';
  const { app, pool } = require('../server');
  pool.query = real.query.bind(real); pool.connect = real.connect.bind(real);
  t.after(async () => { await real.end(); await pool.end(); });
  await real.query(`
    drop schema if exists public cascade; create schema public;
    create table users(id serial primary key, username text unique, password_hash text, role text, status text, auth_version integer not null default 0);
    create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text, open_end text, manual_locked boolean not null default false);
    create table menus(id serial primary key, name text, note text, image_url text, image_path text);
    create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);
    create table orders(id serial primary key, seat integer unique, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamp, updated_at timestamp);
    create table order_items(id serial primary key, order_id integer references orders(id), name text, unit_price integer, qty integer, updated_at timestamptz default now());
    create table preorder_settings(id integer primary key, enabled boolean, dates text[]);
    create table preorders(id serial primary key, d text, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), unique(d,seat));
    create table preorder_items(id serial primary key, preorder_id integer references preorders(id), name text, unit_price integer, qty integer);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb, ip text, ua text, ts timestamptz default now());
    insert into settings(id,active_menu_id,open_days,open_start,open_end) values(1,1,'{0,1,2,3,4,5,6}','00:00','23:59');
    insert into preorder_settings values(1,true,'{2026-10-20,2026-10-21}');
    insert into menus(id,name) values(1,'隔離測試菜單');
    insert into menu_items(menu_id,code,name,price) values(1,1,'測試便當',95);
    alter table orders enable row level security;
    alter table preorders enable row level security;
  `);
  const hash = await bcrypt.hash('isolated-user-password', 4);
  for (const [username, role] of [['admin', 'admin'], ['admin2', 'admin'], ['2', 'user']]) {
    await real.query('insert into users(username,password_hash,role,status) values($1,$2,$3,$4)', [username, hash, role, 'active']);
  }
  const users = (await real.query('select * from users order by id')).rows;
  const tokens = users.map(user => issueToken(user, process.env.JWT_SECRET));
  const as = (req, admin = 0) => req.set('Authorization', 'Bearer ' + tokens[admin]);
  const read = async (route = '/api/orders/2') => (await as(request(app).get(route)).expect(200)).body;
  const pay = (order, paid = true, admin = 0, route = '/api/orders/2') => as(request(app).put(route + '/paid'), admin).send({ ...order, paid });
  const item = { name: '測試便當', unitPrice: 95, qty: 2 };
  await real.query('insert into orders(seat,submitted,paid,created_at,updated_at) values(2,true,true,now(),now())');
  await real.query("insert into order_items(order_id,name,unit_price,qty) values(1,'測試便當',95,2)");
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261019125241_quick_payment_context.sql'), 'utf8');

  await t.test('the additive migration preserves IDs, items, payment, RLS and is repeatable', async () => {
    await real.query(migration); await real.query(migration);
    const row = (await real.query('select * from orders where id=1')).rows[0];
    assert.equal(row.paid, true); assert.equal(row.seat, 2);
    assert.equal((await real.query('select count(*)::int as n from order_items')).rows[0].n, 1);
    assert.equal((await real.query("select count(*)::int as n from pg_class where relname in ('orders','preorders') and relrowsecurity")).rows[0].n, 2);
  });
  await t.test('administrator changes persist; students and unsigned requests are refused', async () => {
    const first = await read();
    await request(app).put('/api/orders/2/paid').send({ ...first, paid: false }).expect(401);
    await pay(first, false, 2).expect(403);
    const saved = (await pay(first, false, 1).expect(200)).body.order;
    assert.equal(saved.paymentUpdatedBy, users[1].id);
    assert.ok(saved.paymentUpdatedAt);
    assert.equal((await read()).paid, false);
  });
  await t.test('two administrators with one version produce one commit and one conflict', async () => {
    const before = await read();
    const results = await Promise.all([pay(before, true, 0), pay(before, false, 1)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const winner = results.find(result => result.status === 200).body.order;
    assert.equal((await read()).paid, winner.paid);
    assert.equal((await read()).version, before.version + 1);
  });
  await t.test('order changes reset payment and an injected write failure really rolls back', async () => {
    const paid = (await pay(await read()).expect(200)).body.order;
    await as(request(app).put('/api/orders/2')).send({ ...paid, items: [{ ...item, qty: 3 }] }).expect(200);
    assert.equal((await read()).paid, false);
    const before = (await pay(await read()).expect(200)).body.order;
    pool.connect = async () => {
      const client = await real.connect();
      return { release: () => client.release(), query: (sql, args) => /^insert into order_items/.test(sql.trim()) ? Promise.reject(new Error('isolated write failure')) : client.query(sql, args) };
    };
    try { await as(request(app).put('/api/orders/2')).send({ ...before, items: [{ ...item, qty: 4 }] }).expect(500); }
    finally { pool.connect = real.connect.bind(real); }
    const after = await read();
    assert.equal(after.version, before.version); assert.equal(after.paid, true);
    assert.equal(after.items[0].qty, 3); assert.equal(after.items[0].id, before.items[0].id);
  });
  await t.test('midnight creates a new batch, preserving prior payment records', async () => {
    const old = await read();
    await real.query("update settings set order_date='2000-01-01'");
    await real.query("update orders set order_date='2000-01-01'");
    const fresh = await read();
    assert.equal(fresh.items.length, 0); assert.equal(fresh.paid, false);
    await pay(old).expect(409);
    assert.equal((await real.query('select paid from orders where id=$1', [old.orderId])).rows[0].paid, true);
    await as(request(app).put('/api/orders/2')).send({ ...fresh, items: [item] }).expect(200);
    await pay(await read()).expect(200);
    assert.equal((await real.query('select count(*)::int as n from orders')).rows[0].n, 2);
    assert.equal((await as(request(app).get('/api/reports/aggregate')).expect(200)).body.classTotal, 190);
  });
  await t.test('starting another round archives the previous rows and rejects old controls', async () => {
    const old = await read();
    await as(request(app).delete('/api/orders/today')).send({ date: old.date, batch: old.batch }).expect(200);
    assert.equal((await read()).items.length, 0);
    await pay(old).expect(409);
    assert.equal((await real.query('select paid from orders where id=$1', [old.orderId])).rows[0].paid, true);
    assert.equal((await as(request(app).get('/api/reports/aggregate')).expect(200)).body.classTotal, 0);
  });
  await t.test('preorder dates have separate payment and concurrent version checks', async () => {
    for (const date of ['2026-10-20', '2026-10-21']) await as(request(app).put(`/api/preorders/${date}/2`)).send({ items: [item] }).expect(200);
    const route = '/api/preorders/2026-10-20/2', other = '/api/preorders/2026-10-21/2';
    const initial = await read(route);
    const race = await Promise.all([pay(initial, true, 0, route), pay(initial, false, 1, route)]);
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
    assert.equal((await read(other)).paid, false);
    await pay(await read(route), true, 0, other).expect(409);
  });
});
