'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { newDb, DataType } = require('pg-mem');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const { issueToken } = require('../security');
const { businessDate } = require('../payments');

// Synthetic accounts only. Importing app does not call start(), seed(), or a
// real database; all queries are replaced before any HTTP request is made.
process.env.DATABASE_URL = 'postgres://local-test:local-test@127.0.0.1:1/lunch_test';
process.env.JWT_SECRET = 'isolated-security-assessment-secret';
process.env.ADMIN_DEFAULT_PASS = 'isolated-bootstrap-admin';
process.env.SEAT_DEFAULT_PASS = 'isolated-bootstrap-seat';
const { app, pool } = require('../server');
const db = newDb();
let memoryPool, backup, credentials;
const item = { name: '隔離測試餐點', unitPrice: 95, qty: 1 };
const as = (req, id = 1) => req.set('Authorization', 'Bearer ' + credentials[id]);
const date = '2026-10-20';
const orderBody = { items: [item] };
const referenceFor = async (route, body, id = 1) => {
  const current = (await as(request(app).get(route), id).expect(200)).body;
  const { orderId, version, date, batch } = current;
  return { orderId, version, date, batch, ...body };
};

const adminCases = [
  ['get', '/api/settings/open-window'],
  ['put', '/api/settings/open-window', { openDays: ['1'], openStart: '00:00', openEnd: '23:59' }],
  ['post', '/api/uploads/images'],
  ['post', '/api/menus', { name: '隔離新增菜單' }],
  ['put', '/api/menus/1', { name: '隔離變更菜單' }],
  ['delete', '/api/menus/1'],
  ['post', '/api/menus/1/items', { name: '隔離新增品項', price: 50 }],
  ['put', '/api/menu-items/1', { name: '隔離變更品項', price: 50 }],
  ['delete', '/api/menu-items/1'],
  ['put', '/api/settings/active-menu', { menuId: null }],
  ['put', '/api/settings/manual-order', { locked: true }],
  ['get', '/api/orders'],
  ['put', '/api/orders/2/paid', { paid: true }],
  ['delete', '/api/orders/today'],
  ['get', '/api/reports/aggregate'], ['get', '/api/reports/missing'], ['get', '/api/reports/unpaid'],
  ['put', '/api/settings/preorder', { enabled: false, dates: [] }],
  ['get', `/api/preorders/${date}/unpaid`],
  ['put', `/api/preorders/${date}/2/paid`, { paid: true }],
  ['post', '/api/users', { username: 'isolated-canary' }],
  ['get', '/api/users'],
  ['put', '/api/users/3/password', { resetTemporary: true, actorPassword: 'isolated-known-password' }],
  ['patch', '/api/users/3/status', { status: 'disabled' }],
  ['patch', '/api/users/3/role', { role: 'admin', newPassword: 'isolated-promoted-password', actorPassword: 'isolated-known-password' }],
  ['delete', '/api/users/bulk-delete', { ids: [3] }],
  ['delete', '/api/users/3'],
  ['get', '/api/logs'],
];

before(async () => {
  db.public.registerFunction({ name: 'pg_advisory_xact_lock', args: [DataType.integer, DataType.integer], returns: DataType.integer, implementation: () => 0 });
  db.public.registerEquivalentType({ name: 'float8', equivalentTo: DataType.float, isValid: () => true });
  db.public.none(`
    create table users(id serial primary key, username text unique, password_hash text, role text, status text, auth_version integer not null default 0, must_change_password boolean not null default false, created_at timestamptz default now(), updated_at timestamptz default now(), last_login_at timestamptz);
    create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text, open_end text, manual_locked boolean not null default false, order_date text, order_batch text);
    create table menus(id serial primary key, name text, note text, image_url text, image_path text);
    create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);
    create table orders(id serial primary key, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), order_date text, order_batch text, revision integer not null default 0, payment_updated_at timestamptz, payment_updated_by integer references users(id), unique(order_date,order_batch,seat));
    create table order_items(id serial primary key, order_id integer references orders(id), name text, unit_price integer, qty integer, updated_at timestamptz default now());
    create table preorder_settings(id integer primary key, enabled boolean, dates text[]);
    create table preorders(id serial primary key, d date, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), revision integer not null default 0, payment_updated_at timestamptz, payment_updated_by integer references users(id), unique(d,seat));
    create table preorder_items(id serial primary key, preorder_id integer references preorders(id), name text, unit_price integer, qty integer);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb, ip text, ua text, ts timestamptz default now());
    insert into settings values(1,1,'{0,1,2,3,4,5,6}','00:00','23:59',false,'${businessDate()}','isolated-batch');
    insert into preorder_settings values(1,true,'{${date}}');
    insert into menus(name) values('隔離測試菜單');
    insert into menu_items(menu_id,code,name,price) values(1,1,'隔離測試餐點',95);
  `);
  const { Pool } = db.adapters.createPg(); memoryPool = new Pool();
  pool.query = memoryPool.query.bind(memoryPool); pool.connect = memoryPool.connect.bind(memoryPool);
  const hash = await bcrypt.hash('isolated-known-password', 4);
  for (const [username, role] of [['admin', 'admin'], ['2', 'user'], ['3', 'user'], ['named-user', 'user'], ['admin2', 'admin']]) {
    await pool.query("insert into users(username,password_hash,role,status) values($1,$2,$3,'active')", [username, hash, role]);
  }
  credentials = Object.fromEntries((await pool.query('select * from users')).rows.map(u => [u.id, issueToken(u, process.env.JWT_SECRET)]));
  backup = db.backup();
});
beforeEach(async () => {
  backup.restore();
  // The imported app uses in-memory limiters. Isolate their state between
  // cases while retaining every limiter invocation within each test.
  const route = app._router.stack.find(layer => layer.route?.path === '/api/users/:id/password')?.route;
  for (const layer of route?.stack || []) if (typeof layer.handle.resetKey === 'function')
    for (const id of ['1', '2', '3', '4', '5']) await layer.handle.resetKey(id);
});
after(async () => { await memoryPool.end(); await pool.end(); });

test('assessment: every actual protected route rejects anonymous and cookie-only requests', async () => {
  const extra = [['get', '/api/auth/me'], ['post', '/api/auth/logout'], ['get', '/api/seats'], ['get', '/api/menus'], ['get', '/api/settings/manual-order'], ['get', '/api/settings/preorder'], ['get', '/api/orders/2'], ['put', '/api/orders/2', orderBody], ['get', `/api/preorders/${date}/2`], ['put', `/api/preorders/${date}/2`, orderBody]];
  const covered = new Set([...adminCases, ...extra].map(([method, url]) => method.toUpperCase() + ' ' + url.replace(/2026-10-20/g, ':date').replace(/\/2(?=\/|$)/g, '/:seat').replace(/\/3(?=\/|$)/g, '/:id')));
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const actual = [...source.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)', auth\(\)/g)];
  for (const [method, url, body] of [...adminCases, ...extra]) {
    await request(app)[method](url).set('Cookie', 'jwt=' + credentials[1]).send(body).expect(401);
  }
  // Ensure a newly introduced route cannot silently fall outside this matrix.
  const normalize = route => route.replace(/:itemId/g, '1').replace(/:id/g, '1');
  const normalizedCovered = new Set([...covered].map(normalize));
  for (const [, method, route] of actual) assert.ok(normalizedCovered.has(normalize(method.toUpperCase() + ' ' + route)), route);
});

test('assessment: a student cannot call any administrator or other-account action', async () => {
  for (const [method, url, body] of adminCases) await as(request(app)[method](url), 2).send(body).expect(403);
});

test('assessment: cross-seat and named-user BOLA attempts do not change orders or payment', async () => {
  for (const route of ['/api/orders/3', `/api/preorders/${date}/3`]) {
    for (const id of [2, 4]) {
      await as(request(app).get(route), id).expect(403);
      await as(request(app).put(route), id).send(orderBody).expect(403);
    }
  }
  for (const route of ['/api/orders/2', `/api/preorders/${date}/2`]) {
    await as(request(app).put(route), 2).send({ ...await referenceFor(route, orderBody, 2), seat: 3, userId: 1, role: 'admin', paid: true, paymentUpdatedBy: 1, submitted: true }).expect(200);
    const saved = (await as(request(app).get(route), 2).expect(200)).body;
    assert.equal(saved.seat, 2); assert.equal(saved.paid, false);
    assert.equal(saved.items[0].unitPrice, 95);
  }
  assert.equal(db.public.one('select count(*) n from orders where seat=3').n, 0);
  assert.equal(db.public.one('select count(*) n from preorders where seat=3').n, 0);
});

test('assessment: revocation between authentication and business writes is enforced', async t => {
  const writeCases = adminCases.filter(([method, url]) => !['get'].includes(method) && !url.startsWith('/api/users') && url !== '/api/uploads/images');
  writeCases.push(['put', '/api/orders/3', orderBody], ['put', `/api/preorders/${date}/3`, orderBody]);
  for (const [method, url, supplied] of writeCases) await t.test(method + ' ' + url, async () => {
    backup.restore();
    await as(request(app).put('/api/orders/2')).send(await referenceFor('/api/orders/2', orderBody)).expect(200);
    await as(request(app).put(`/api/preorders/${date}/2`)).send(await referenceFor(`/api/preorders/${date}/2`, orderBody)).expect(200);
    let body = supplied;
    if (url.endsWith('/paid')) body = { ...(await as(request(app).get(url.slice(0, -5))).expect(200)).body, paid: true };
    if (url === '/api/orders/today') body = (await as(request(app).get('/api/orders/2')).expect(200)).body;
    const query = pool.query;
    let revoked = false;
    pool.query = async (sql, args) => {
      const result = await query(sql, args);
      if (!revoked && sql.startsWith('select id, username, role, status, password_hash, auth_version') && args[0] === 5) {
        revoked = true;
        await query("update users set role='user',auth_version=auth_version+1 where id=5");
      }
      return result;
    };
    try {
      const result = await as(request(app)[method](url), 5).send(body);
      assert.ok([401, 403].includes(result.status), `revoked caller returned ${result.status}`);
    } finally { pool.query = query; }
  });
});

test('assessment: closing the order window after authentication prevents a pending student write', async () => {
  const currentBody = await referenceFor('/api/orders/2', orderBody, 2);
  const query = pool.query; let closed = false;
  pool.query = async (sql, args) => {
    const result = await query(sql, args);
    // Reproduce a settings change after the old, pre-transaction check. The
    // repaired code reads and holds this setting only inside the transaction.
    if (!closed && sql === 'select open_days, open_start, open_end from settings where id=1') {
      closed = true; await query("update settings set open_days='{}' where id=1");
    }
    return result;
  };
  const connect = pool.connect;
  pool.connect = async () => {
    if (!closed) { closed = true; await query("update settings set open_days='{}' where id=1"); }
    return connect();
  };
  try {
    await as(request(app).put('/api/orders/2'), 2).send(currentBody).expect(403);
    assert.equal(db.public.one('select count(*) n from orders').n, 0);
  } finally { pool.query = query; pool.connect = connect; }
});

test('assessment: disabling preorders after authentication prevents a pending student write', async () => {
  const currentBody = await referenceFor(`/api/preorders/${date}/2`, orderBody, 2);
  const query = pool.query; let closed = false;
  pool.query = async (sql, args) => {
    const result = await query(sql, args);
    if (!closed && sql === 'select enabled, dates from preorder_settings where id=1') {
      closed = true; await query('update preorder_settings set enabled=false where id=1');
    }
    return result;
  };
  const connect = pool.connect;
  pool.connect = async () => {
    if (!closed) { closed = true; await query('update preorder_settings set enabled=false where id=1'); }
    return connect();
  };
  try {
    await as(request(app).put(`/api/preorders/${date}/2`), 2).send(currentBody).expect(403);
    assert.equal(db.public.one('select count(*) n from preorders').n, 0);
  } finally { pool.query = query; pool.connect = connect; }
});

test('assessment: password-operation throttling uses the verified caller and preserves credentials', async () => {
  const before = db.public.one('select password_hash,auth_version from users where id=4');
  // A fixed known old password and invalid NEW password exercise the counter;
  // no candidate old passwords are generated or searched.
  for (let n = 0; n < 5; n++) await as(request(app).put('/api/users/4/password'), 4)
    .set('X-Forwarded-For', `192.0.2.${n + 1}`).send({ oldPassword: 'isolated-known-password', newPassword: 'short' }).expect(400);
  const rejected = await as(request(app).put('/api/users/4/password'), 4)
    .set('X-Forwarded-For', '198.51.100.1').send({ oldPassword: 'isolated-known-password', newPassword: 'abcdef' }).expect(429);
  assert.match(rejected.body.message, /一分鐘/);
  assert.ok(Number(rejected.headers['retry-after']) > 0);
  assert.deepEqual(db.public.one('select password_hash,auth_version from users where id=4'), before);
  await as(request(app).get('/api/auth/me'), 4).expect(200);
  await as(request(app).put('/api/users/3/password')).send({ resetTemporary: true, actorPassword: 'isolated-known-password' }).expect(200);
});

test('assessment: SQL metacharacters remain literal across account, menu, item and order writes', async () => {
  const literal = "probe'); DROP TABLE users; --";
  const created = (await as(request(app).post('/api/users')).send({ username: literal }).expect(200)).body;
  const found = (await as(request(app).get('/api/users').query({ q: literal })).expect(200)).body;
  assert.equal(found.users.length, 1); assert.equal(found.users[0].id, created.id);
  const menu = (await as(request(app).post('/api/menus')).send({ name: literal }).expect(200)).body;
  await as(request(app).post(`/api/menus/${menu.id}/items`)).send({ name: literal, price: 95 }).expect(200);
  const menus = (await as(request(app).get('/api/menus')).expect(200)).body.menus;
  assert.equal(menus.find(m => m.id === menu.id).items[0].name, literal);
  for (const route of ['/api/orders/2', `/api/preorders/${date}/2`]) {
    await as(request(app).put(route), 2).send(await referenceFor(route, { items: [{ ...item, name: literal }] }, 2)).expect(200);
    assert.equal((await as(request(app).get(route), 2).expect(200)).body.items[0].name, literal);
  }
  assert.equal(db.public.one('select count(*) n from users').n, 6);
});

test('assessment: JSON prototype and constructor fields cannot escalate a caller or set payment', async () => {
  const body = JSON.parse('{"__proto__":{"role":"admin"},"constructor":{"prototype":{"role":"admin"}},"role":"admin","paid":true,"items":[]}');
  body.items = [item];
  await as(request(app).put('/api/orders/2'), 2).send({ ...await referenceFor('/api/orders/2', {}, 2), ...body }).expect(200);
  const saved = (await as(request(app).get('/api/orders/2'), 2).expect(200)).body;
  assert.equal(saved.paid, false); assert.equal({}.role, undefined);
  await as(request(app).post('/api/users'), 2).send({ username: 'polluted-canary', password: 'abcdef' }).expect(403);
  assert.equal(db.public.one('select role from users where id=2').role, 'user');
});

test('assessment: a revoked image uploader cannot persist a file', async () => {
  const directory = path.join(__dirname, '../uploads');
  const beforeFiles = fs.readdirSync(directory).sort();
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  const query = pool.query; let revoked = false;
  pool.query = async (sql, args) => {
    const result = await query(sql, args);
    if (!revoked && sql.startsWith('select id, username, role, status, password_hash, auth_version') && args[0] === 5) {
      revoked = true; await query("update users set role='user',auth_version=auth_version+1 where id=5");
    }
    return result;
  };
  try {
    await as(request(app).post('/api/uploads/images'), 5).attach('image', image, { filename: 'isolated.png', contentType: 'image/png' }).expect(401);
    assert.deepEqual(fs.readdirSync(directory).sort(), beforeFiles);
  } finally { pool.query = query; }
});

test('assessment: a student session revoked during a request cannot commit an order', async t => {
  for (const change of ["status='disabled'", 'auth_version=auth_version+1']) await t.test(change, async () => {
    backup.restore(); const query = pool.query; let revoked = false;
    pool.query = async (sql, args) => {
      const result = await query(sql, args);
      if (!revoked && sql.startsWith('select id, username, role, status, password_hash, auth_version') && args[0] === 2) {
        revoked = true; await query(`update users set ${change} where id=2`);
      }
      return result;
    };
    try {
      await as(request(app).put('/api/orders/2'), 2).send(orderBody).expect(401);
      assert.equal(db.public.one('select count(*) n from orders').n, 0);
    } finally { pool.query = query; }
  });
});
