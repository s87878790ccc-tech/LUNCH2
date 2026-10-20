'use strict';

// L2-004 regression tests: importing app does not start it. All pg calls use
// synthetic in-memory data; this file never connects to a production database.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { newDb, DataType } = require('pg-mem');
const { assertReference, businessDate } = require('../payments');
const { issueToken } = require('../security');

process.env.DATABASE_URL = 'postgres://synthetic:synthetic@127.0.0.1:1/never_connect';
process.env.JWT_SECRET = 'synthetic-order-version-regression-secret';
process.env.RATE_LIMIT_STORE = '';
const { app, pool } = require('../server');
const db = newDb();
const date = '2026-10-20';
const item = { name: '合成測試便當', unitPrice: 95, qty: 1 };
let memoryPool, backup, admin, user;
const as = (r, token = user) => r.set('Authorization', 'Bearer ' + token);
const read = async route => (await as(request(app).get(route)).expect(200)).body;
const put = (route, body, token = user) => as(request(app).put(route), token).send(body);

before(async () => {
  db.public.registerFunction({
    name: 'pg_advisory_xact_lock', args: [DataType.integer, DataType.integer],
    returns: DataType.integer, implementation: () => 0,
  });
  const today = businessDate();
  db.public.none([
    'create table users(id serial primary key, username text unique, password_hash text, role text, status text, auth_version integer not null default 0, must_change_password boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now(), last_login_at timestamptz);',
    "create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text, open_end text, manual_locked boolean not null default false, order_date text not null default '" + today + "', order_batch text not null default 'legacy');",
    'create table menus(id serial primary key, name text, note text, image_url text, image_path text);',
    'create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);',
    "create table orders(id serial primary key, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), order_date text not null default '" + today + "', order_batch text not null default 'legacy', revision integer not null default 0, payment_updated_at timestamptz, payment_updated_by integer references users(id), unique(order_date,order_batch,seat));",
    'create table order_items(id serial primary key, order_id integer references orders(id), name text, unit_price integer, qty integer, updated_at timestamptz default now());',
    'create table preorder_settings(id integer primary key, enabled boolean, dates text[]);',
    'create table preorders(id serial primary key, d date, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), revision integer not null default 0, payment_updated_at timestamptz, payment_updated_by integer references users(id), unique(d,seat));',
    'create table preorder_items(id serial primary key, preorder_id integer references preorders(id), name text, unit_price integer, qty integer);',
    'create table audit_logs(id serial primary key, user_id integer, action text, details jsonb, ip text, ua text, ts timestamptz default now());',
    "insert into settings(id,active_menu_id,open_days,open_start,open_end) values(1,1,'{0,1,2,3,4,5,6}','00:00','23:59');",
    "insert into preorder_settings values(1,true,'{2026-10-20,2026-10-21}');",
    "insert into menus(id,name) values(1,'合成測試菜單');",
    "insert into menu_items(menu_id,code,name,price) values(1,1,'合成測試便當',95);",
  ].join('\n'));
  const MemoryPool = db.adapters.createPg().Pool;
  memoryPool = new MemoryPool();
  pool.query = memoryPool.query.bind(memoryPool);
  pool.connect = memoryPool.connect.bind(memoryPool);
  const hash = await bcrypt.hash('synthetic-fixture-only', 4);
  for (const [username, role] of [['synthetic-admin', 'admin'], ['2', 'user'], ['3', 'user']])
    await pool.query('insert into users(username,password_hash,role,status) values($1,$2,$3,$4)', [username, hash, role, 'active']);
  const claims = id => ({ id, password_hash: hash, auth_version: 0 });
  admin = issueToken(claims(1), process.env.JWT_SECRET);
  user = issueToken(claims(2), process.env.JWT_SECRET);
  backup = db.backup();
});
beforeEach(() => backup.restore());
after(async () => { await memoryPool.end(); await pool.end(); });

test('L2-004: own reference fields are mandatory even for the old optional signature', () => {
  const context = { date, batch: 'synthetic-round' };
  const reference = { orderId: null, version: 0, date, batch: context.batch };
  assert.doesNotThrow(() => assertReference(reference, null, context));
  assert.throws(() => assertReference(Object.create(reference), null, context), { status: 400 });
  assert.throws(() => assertReference({}, null, context, false), { status: 400 });
  assert.doesNotThrow(() => assertReference({ ...reference, batch: null }, null, { date }));
});

for (const route of ['/api/orders/2', '/api/preorders/' + date + '/2']) {
  test('L2-004: ' + route + ' rejects every missing field without changing content', async () => {
    const current = await read(route);
    for (const key of ['orderId', 'version', 'date', 'batch']) {
      const body = { ...current, items: [item] };
      delete body[key];
      const result = await put(route, body).expect(400);
      assert.match(result.body.message, /版本.*重新載入/);
    }
    await put(route, { items: [item] }).expect(400);
    await put(route, { items: [item], date: '2000-01-01' }).expect(400);
    assert.deepEqual((await read(route)).items, []);
  });

  test('L2-004: ' + route + ' rejects invalid reference types and ranges', async () => {
    const current = await read(route);
    const malformed = [
      { version: '0' }, { version: -1 }, { version: 0.5 }, { version: true }, { version: 2_147_483_648 },
      { orderId: 0 }, { orderId: '1' }, { orderId: {} }, { orderId: 2_147_483_648 },
      { date: '2026-02-31' }, { date: 20261020 }, { batch: '' }, { batch: 1 },
      { batch: [] }, { batch: {} }, { batch: 'x'.repeat(129) },
    ];
    for (const patch of malformed) await put(route, { ...current, ...patch, items: [item] }).expect(400);
    assert.deepEqual((await read(route)).items, []);
  });

  test('L2-004: ' + route + ' accepts current updates and rejects stale/date/batch controls', async () => {
    const initial = await read(route);
    assert.equal(initial.orderId, null);
    assert.equal(initial.version, 0);
    if (route.startsWith('/api/preorders/')) assert.equal(initial.batch, null);
    await put(route, { ...initial, items: [item] }).expect(200);
    const first = await read(route);
    // Derive a valid different day from this snapshot, not the wall clock or a
    // fixed date. UTC handles leap/year boundaries; keep the upper date bound.
    const differentDay = new Date(first.date + 'T00:00:00Z');
    differentDay.setUTCDate(differentDay.getUTCDate() + (first.date === '9999-12-31' ? -1 : 1));
    for (const patch of [{ orderId: null }, { version: 0 }, { date: differentDay.toISOString().slice(0, 10) }, { batch: 'another-round' }])
      await put(route, { ...first, ...patch, items: [{ ...item, qty: 9 }] }).expect(409);
    await put(route, { ...first, items: [{ ...item, qty: 2 }] }).expect(200);
    await put(route, { ...first, items: [{ ...item, qty: 3 }] }).expect(409);
    await put(route, { items: [{ ...item, qty: 3 }] }).expect(400);
    const latest = await read(route);
    assert.equal(latest.items[0].qty, 2);
    assert.equal(latest.version, first.version + 1);
    await put(route, { ...latest, items: [] }).expect(200);
    assert.deepEqual((await read(route)).items, []);
  });
}

test('L2-004: new daily batches reject old controls and missing-reference replay', async () => {
  const route = '/api/orders/2';
  await put(route, { ...await read(route), items: [item] }).expect(200);
  const old = await read(route);
  await as(request(app).delete('/api/orders/today'), admin).send({ date: old.date, batch: old.batch }).expect(200);
  await put(route, { ...old, items: [item] }).expect(409);
  await put(route, { items: [item] }).expect(400);
  const fresh = await read(route);
  assert.notEqual(fresh.batch, old.batch);
  assert.equal(fresh.orderId, null);
  await put(route, { ...fresh, items: [item] }).expect(200);
  assert.equal((await read(route)).items.length, 1);
});

test('L2-004: seat, payment, manual-price and order-window authorization remains enforced', async () => {
  const route = '/api/orders/2';
  const current = await read(route);
  await put('/api/orders/3', { ...current, items: [item] }).expect(403);
  await put(route, { ...current, items: [item] }).expect(200);
  let saved = await read(route);
  await put(route + '/paid', { ...saved, paid: true }).expect(403);
  await put(route + '/paid', { ...saved, paid: true }, admin).expect(200);
  saved = await read(route);
  assert.equal(saved.paid, true);
  await as(request(app).put('/api/settings/manual-order'), admin).send({ locked: true }).expect(200);
  await put(route, { ...saved, items: [{ ...item, unitPrice: 1 }] }).expect(403);
  // Exclude this business day instead of assuming 00:00-00:00 is closed;
  // the policy intentionally includes that exact minute at midnight.
  const closedDay = new Date(saved.date + 'T00:00:00Z').getUTCDay();
  await as(request(app).put('/api/settings/open-window'), admin)
    .send({ openDays: [(closedDay + 1) % 7], openStart: '00:00', openEnd: '23:59' }).expect(200);
  await put(route, { ...saved, items: [item] }).expect(403);
  saved = await read(route);
  assert.equal(saved.paid, true);
  assert.equal(saved.items[0].unitPrice, 95);
});
