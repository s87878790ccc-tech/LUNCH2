const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { newDb, DataType } = require("pg-mem");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const { issueToken, TOKEN_ISSUER, TOKEN_AUDIENCE } = require("../security");

// The app is imported without its startup function; no production database is contacted.
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/lunch_test";
process.env.JWT_SECRET = "isolated-regression-test-secret";
process.env.ADMIN_DEFAULT_PASS = "test-admin-password";
process.env.SEAT_DEFAULT_PASS = "test-user-password";
const { app, pool } = require("../server");
const db = newDb();
let backup, memoryPool, fixtureHash, admin, user;
const token = (id, role = "user", username = String(id)) =>
  issueToken({ id, role, username, password_hash: fixtureHash, auth_version: 0 }, process.env.JWT_SECRET);
const as = (r, value = admin) => r.set("Authorization", `Bearer ${value}`);
const item = { name: "雞腿飯", unitPrice: 95, qty: 2 };

before(async () => {
  // pg-mem runs these requests serially; PostgreSQL owns real advisory-lock semantics.
  db.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.integer, DataType.integer],
    returns: DataType.integer,
    implementation: () => 0,
  });
  db.public.none(`
    create table users(id serial primary key, username text unique, password_hash text, role text, status text, auth_version integer not null default 0, created_at timestamptz default now(), updated_at timestamptz default now(), last_login_at timestamptz);
    create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text, open_end text, manual_locked boolean not null default false);
    create table menus(id serial primary key, name text, note text, image_url text, image_path text);
    create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);
    create table orders(id serial primary key, seat integer unique, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
    create table order_items(id serial primary key, order_id integer references orders(id), name text, unit_price integer, qty integer, updated_at timestamptz default now());
    create table preorder_settings(id integer primary key, enabled boolean, dates text[]);
    create table preorders(id serial primary key, d date, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), unique(d,seat));
    create table preorder_items(id serial primary key, preorder_id integer references preorders(id), name text, unit_price integer, qty integer);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb, ip text, ua text, ts timestamptz default now());
    insert into settings(id,active_menu_id,open_days,open_start,open_end) values(1,null,'{0,1,2,3,4,5,6}','00:00','23:59');
    insert into preorder_settings values(1,true,'{2026-10-20}');
    insert into menus(id,name) values(1,'測試菜單');
    insert into menu_items(menu_id,code,name,price) values(1,1,'雞腿飯',95);
    update settings set active_menu_id=1 where id=1;
  `);
  const { Pool } = db.adapters.createPg();
  memoryPool = new Pool();
  pool.query = memoryPool.query.bind(memoryPool);
  pool.connect = memoryPool.connect.bind(memoryPool);
  const hash = await bcrypt.hash("test-password", 4);
  fixtureHash = hash;
  admin = token(1, "admin", "admin");
  user = token(2);
  for (const [name, role, status] of [
    ["admin", "admin", "active"],
    ["2", "user", "active"],
    ["3", "user", "active"],
    ["disabled", "user", "disabled"],
  ]) {
    await pool.query(
      "insert into users(username,password_hash,role,status) values($1,$2,$3,$4)",
      [name, hash, role, status],
    );
  }
  backup = db.backup();
});
beforeEach(() => backup.restore());
after(async () => {
  await memoryPool.end();
  await pool.end();
});

test("login normalizes fullwidth seats and returns a usable user id", async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username: " ２ ", password: "test-password" })
    .expect(200);
  assert.equal(res.body.user.id, 2);
  const me = await as(request(app).get("/api/auth/me"), res.body.token).expect(
    200,
  );
  assert.equal(me.body.user.username, "2");
});

test("empty order reads do not create rows, and cross-seat access is forbidden", async () => {
  const res = await as(request(app).get("/api/orders/2"), user).expect(200);
  assert.deepEqual(res.body.items, []);
  assert.equal(db.public.one("select count(*) as n from orders").n, 0);
  await as(request(app).get("/api/orders/3"), user).expect(403);
});

test("one admin request returns all 36 seats; normal users cannot read it", async () => {
  const res = await as(request(app).get("/api/orders")).expect(200);
  assert.equal(res.body.orders.length, 36);
  assert.equal(res.body.orders[35].seat, 36);
  await as(request(app).get("/api/orders"), user).expect(403);
});

test("saving a valid order and clearing it updates submitted and paid consistently", async () => {
  await as(request(app).put("/api/orders/2"), user)
    .send({ items: [item], internalOnly: false, paid: true })
    .expect(200);
  let res = await as(request(app).get("/api/orders/2"), user).expect(200);
  assert.equal(res.body.items[0].qty, 2);
  assert.equal(res.body.submitted, true);
  assert.equal(res.body.paid, false);
  await as(request(app).put("/api/orders/2/paid"))
    .send({ paid: true })
    .expect(200);
  await as(request(app).put("/api/orders/2"), user)
    .send({ items: [], internalOnly: false })
    .expect(200);
  res = await as(request(app).get("/api/orders/2"), user).expect(200);
  assert.equal(res.body.paid, false);
  assert.equal(res.body.submitted, false);
});

test("an invalid update cannot erase a previously valid order", async () => {
  await as(request(app).put("/api/orders/2"), user)
    .send({ items: [item] })
    .expect(200);
  for (const invalid of [
    { qty: 0 },
    { qty: 1.5 },
    { unitPrice: -1 },
    { name: "" },
  ]) {
    await as(request(app).put("/api/orders/2"), user)
      .send({ items: [{ ...item, ...invalid }] })
      .expect(400);
  }
  const res = await as(request(app).get("/api/orders/2"), user).expect(200);
  assert.equal(res.body.items[0].name, item.name);
  assert.equal(res.body.items[0].qty, item.qty);
});

test("invalid IDs, seats, dates and pagination produce JSON validation errors", async () => {
  for (const route of [
    "/api/orders/0",
    "/api/orders/37",
    "/api/orders/NaN",
    "/api/preorders/2026-02-31/2",
    "/api/preorders/2026-13-01/unpaid",
    "/api/users?page=NaN",
    "/api/users?pageSize=Infinity",
  ]) {
    const res = await as(request(app).get(route)).expect(400);
    assert.equal(typeof res.body.message, "string");
  }
  await as(request(app).put("/api/users/undefined/password"))
    .send({ newPassword: "new-password" })
    .expect(400);
});

test("the preorder unpaid route is reachable ahead of the generic seat route", async () => {
  await as(request(app).put("/api/preorders/2026-10-20/2"), user)
    .send({ items: [item] })
    .expect(200);
  const res = await as(
    request(app).get("/api/preorders/2026-10-20/unpaid"),
  ).expect(200);
  assert.equal(res.body.list[0].seat, 2);
  assert.equal(res.body.list[0].subtotal, 190);
  await as(request(app).get("/api/preorders/2026-10-20/unpaid"), user).expect(
    403,
  );
  await as(request(app).put("/api/preorders/2026-10-21/2"), user)
    .send({ items: [item] })
    .expect(403);
});

test("bulk-delete is reachable and preserves self and the remaining administrator", async () => {
  await as(request(app).delete("/api/users/bulk-delete"))
    .send({ ids: [1] })
    .expect(400);
  await as(request(app).delete("/api/users/bulk-delete"))
    .send({ ids: [3] })
    .expect(200);
  assert.equal(
    db.public.one("select count(*) as n from users where id=3").n,
    0,
  );
});

test("disabled, deleted and demoted users cannot retain privileges through an older JWT", async () => {
  await as(request(app).get("/api/auth/me"), token(4)).expect(401);
  await as(request(app).get("/api/auth/me"), token(100)).expect(401);
  await pool.query("update users set role='user' where id=1");
  await as(request(app).get("/api/orders")).expect(403);
});

test("malformed JSON and database errors return safe JSON responses with CORS headers", async () => {
  const origin = "https://s87878790ccc-tech.github.io";
  const invalid = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
  assert.equal(invalid.headers["access-control-allow-origin"], origin);
  assert.match(invalid.body.message, /JSON/);
  const query = pool.query,
    log = console.error;
  pool.query = async () => {
    throw new Error("private database failure");
  };
  console.error = () => {};
  try {
    const res = await request(app).get("/api/open-status").expect(500);
    assert.equal(res.body.message.includes("private"), false);
  } finally {
    pool.query = query;
    console.error = log;
  }
});

test("menu prices and boolean values are validated before database writes", async () => {
  await as(request(app).post("/api/menus/1/items"))
    .send({ name: "便當", price: -1 })
    .expect(400);
  await as(request(app).put("/api/orders/2/paid"))
    .send({ paid: "false" })
    .expect(400);
  await as(request(app).put("/api/settings/preorder"))
    .send({ enabled: true, dates: ["2026-02-31"] })
    .expect(400);
  await as(request(app).put("/api/settings/active-menu"))
    .send({ menuId: "NaN" })
    .expect(400);
});

test("an incorrect old password does not invalidate an otherwise active session", async () => {
  await as(request(app).put("/api/users/2/password"), user)
    .send({ oldPassword: "wrong", newPassword: "new-password" })
    .expect(400);
  await as(request(app).get("/api/auth/me"), user).expect(200);
});

test("successful logins sharing a classroom IP do not exhaust another student’s login limit", async () => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await request(app)
      .post("/api/auth/login")
      .send({ username: "2", password: "test-password" })
      .expect(200);
  }
});

test("bcrypt passwords exceeding its 72-byte input limit are rejected at creation", async () => {
  await as(request(app).post("/api/users"))
    .send({ username: "new", password: "a".repeat(73) })
    .expect(400);
  await as(request(app).put("/api/users/2/password"))
    .send({ newPassword: "字".repeat(25) })
    .expect(400);
});

test("an audit insert failure does not report an already committed order as failed", async () => {
  const query = pool.query,
    log = console.error;
  pool.query = (sql, args) =>
    /^insert into audit_logs/.test(sql.trim())
      ? Promise.reject(new Error("audit unavailable"))
      : query(sql, args);
  console.error = () => {};
  try {
    await as(request(app).put("/api/orders/2"), user)
      .send({ items: [item] })
      .expect(200);
    assert.equal(db.public.one("select count(*) as n from order_items").n, 1);
  } finally {
    pool.query = query;
    console.error = log;
  }
});

test("private menus, users, logs and orders require authentication", async () => {
  for (const route of ['/api/menus', '/api/users', '/api/logs', '/api/orders', '/api/orders/2', '/api/preorders/2026-10-20/2']) {
    await request(app).get(route).expect(401);
  }
});

test("students cannot call administrator actions or access another seat", async () => {
  const cases = [
    ['get', '/api/orders'], ['get', '/api/users'], ['get', '/api/logs'],
    ['get', '/api/orders/3'], ['get', '/api/preorders/2026-10-20/3'],
    ['post', '/api/users'], ['post', '/api/menus'], ['delete', '/api/orders/today'],
    ['put', '/api/orders/2/paid'], ['put', '/api/settings/preorder'],
    ['patch', '/api/users/2/role'], ['delete', '/api/users/bulk-delete'],
    ['post', '/api/uploads/images'],
  ];
  for (const [method, route] of cases) await as(request(app)[method](route), user).send({ role: 'admin', paid: true }).expect(403);
});

test("tampered, unsigned, expired and wrong-purpose JWTs cannot authenticate", async () => {
  const valid = jwt.decode(user);
  const signClaims = claims => jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const withoutExpiry = { ...valid };
  delete withoutExpiry.exp;
  const invalid = [
    'not-a-token', user.slice(0, -3) + 'aaa',
    jwt.sign(valid, '', { algorithm: 'none' }),
    jwt.sign(valid, process.env.JWT_SECRET, { algorithm: 'HS512' }),
    signClaims({ ...valid, exp: 1 }), signClaims({ ...valid, aud: 'another-app' }),
    signClaims({ ...valid, iss: 'another-issuer' }), signClaims(withoutExpiry),
    signClaims({ ...valid, uid: '2' }), signClaims({ ...valid, uid: 99999999999 }),
    signClaims({ ...valid, sv: 'invalid' }),
  ];
  for (const value of invalid) await as(request(app).get('/api/auth/me'), value).expect(401);
  const fakeAdmin = signClaims({ ...valid, role: 'admin', username: 'admin' });
  await as(request(app).get('/api/users'), fakeAdmin).expect(403);
});

test("JWTs and authentication responses contain no passwords or password hashes", async () => {
  const login = await request(app).post('/api/auth/login').send({ username: '2', password: 'test-password' }).expect(200);
  const claims = jwt.decode(login.body.token);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'sv', 'uid']);
  assert.equal(claims.iss, TOKEN_ISSUER);
  assert.equal(claims.aud, TOKEN_AUDIENCE);
  assert.equal(claims.exp - claims.iat, 8 * 60 * 60);
  assert.equal(JSON.stringify(login.body).includes(fixtureHash), false);
  assert.equal(JSON.stringify(login.body).includes('test-password'), false);
});

test("a password reset immediately revokes old sessions without changing another account", async () => {
  await as(request(app).put('/api/users/2/password')).send({ newPassword: 'new-local-password' }).expect(200);
  await as(request(app).get('/api/auth/me'), user).expect(401);
  await as(request(app).get('/api/auth/me')).expect(200);
  const login = await request(app).post('/api/auth/login').send({ username: '2', password: 'new-local-password' }).expect(200);
  await as(request(app).get('/api/auth/me'), login.body.token).expect(200);
});

test("database recovery password resets also revoke old sessions", async () => {
  const hash = await bcrypt.hash('recovered-local-password', 4);
  await pool.query('update users set password_hash=$1 where id=2', [hash]);
  await as(request(app).get('/api/auth/me'), user).expect(401);
});

test("logout revokes copied tokens and fresh login remains possible", async () => {
  await as(request(app).post('/api/auth/logout'), user).expect(200);
  await as(request(app).get('/api/auth/me'), user).expect(401);
  const login = await request(app).post('/api/auth/login').send({ username: '2', password: 'test-password' }).expect(200);
  await as(request(app).get('/api/auth/me'), login.body.token).expect(200);
});

test("reenabling an account does not reactivate tokens from before its suspension", async () => {
  await as(request(app).patch('/api/users/2/status')).send({ status: 'disabled' }).expect(200);
  await as(request(app).patch('/api/users/2/status')).send({ status: 'active' }).expect(200);
  await as(request(app).get('/api/auth/me'), user).expect(401);
});

test("SQL injection and disabled-account login use the same generic credential error", async () => {
  for (const username of ["' OR 1=1 --", 'disabled', 'missing-local-user']) {
    const result = await request(app).post('/api/auth/login').send({ username, password: 'test-password' }).expect(401);
    assert.deepEqual(result.body, { message: 'invalid credentials' });
  }
  await as(request(app).get('/api/auth/me')).expect(200);
});

test("locking manual ordering rejects client price tampering for orders and preorders", async () => {
  await as(request(app).put('/api/settings/manual-order')).send({ locked: true }).expect(200);
  for (const route of ['/api/orders/2', '/api/preorders/2026-10-20/2']) {
    await as(request(app).put(route), user).send({ items: [item] }).expect(200);
    for (const row of [{ ...item, unitPrice: 1 }, { ...item, name: '未列入菜單的餐點' }]) {
      await as(request(app).put(route), user).send({ items: [row] }).expect(403);
    }
    const saved = await as(request(app).get(route), user).expect(200);
    assert.equal(saved.body.items[0].unitPrice, 95);
    assert.equal(saved.body.items[0].qty, 2);
  }
  await as(request(app).put('/api/orders/3')).send({ items: [{ name: '管理員手動餐點', unitPrice: 55, qty: 1 }] }).expect(200);
});

test("manual ordering stays available until an administrator locks it", async () => {
  const manual = { name: '自行輸入的午餐', unitPrice: 88, qty: 1 };
  await as(request(app).put('/api/settings/manual-order'), user).send({ locked: true }).expect(403);
  await as(request(app).put('/api/settings/manual-order')).send({ locked: 'false' }).expect(400);
  for (const route of ['/api/orders/2', '/api/preorders/2026-10-20/2']) {
    await as(request(app).put(route), user).send({ items: [manual] }).expect(200);
  }
  await as(request(app).put('/api/settings/manual-order')).send({ locked: true }).expect(200);
  for (const route of ['/api/orders/2', '/api/preorders/2026-10-20/2']) {
    await as(request(app).put(route), user).send({ items: [{ ...manual, qty: 2 }] }).expect(403);
    await as(request(app).put(route), user).send({ items: [] }).expect(403);
    await as(request(app).put(route), user).send({ items: [manual, item] }).expect(200);
    const saved = await as(request(app).get(route), user).expect(200);
    assert.equal(saved.body.items.length, 2);
    await as(request(app).put(route)).send({ items: [{ ...manual, qty: 2 }] }).expect(200);
  }
  await as(request(app).put('/api/settings/manual-order')).send({ locked: false }).expect(200);
  await as(request(app).put('/api/orders/2'), user).send({ items: [] }).expect(200);
});

test("image uploads reject forged MIME types and oversized multipart files", async () => {
  await as(request(app).post('/api/uploads/images'))
    .attach('image', Buffer.from('<html><script>synthetic_canary()</script></html>'), { filename: 'forged.png', contentType: 'image/png' }).expect(400);
  await as(request(app).post('/api/uploads/images'))
    .attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(400);
});

test("images are rewritten to a safe format, stripped of metadata and unaffected by forwarded hosts", async t => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } }).withMetadata({ orientation: 6 }).png().toBuffer();
  const result = await as(request(app).post('/api/uploads/images'))
    .set('X-Forwarded-Host', 'attacker.invalid').set('X-Forwarded-Proto', 'http')
    .attach('image', image, { filename: 'pretend.html', contentType: 'image/png' }).expect(200);
  assert.match(result.body.url, /^https:\/\/lunch2\.onrender\.com\/uploads\/[\w-]+\.webp$/);
  const filename = result.body.filename;
  t.after(() => fs.unlink(path.join(__dirname, '../uploads', filename)));
  const decoded = await sharp(await fs.readFile(path.join(__dirname, '../uploads', filename))).metadata();
  assert.equal(decoded.format, 'webp');
  assert.equal(decoded.exif, undefined);
  assert.equal(decoded.icc, undefined);
  const download = await request(app).get('/uploads/' + filename).expect(200);
  assert.equal(download.headers['x-content-type-options'], 'nosniff');
  assert.match(download.headers['content-security-policy'], /default-src 'none'/);
});

test("configuration, source, access logs and non-image uploads are never served", async () => {
  for (const route of ['/.env', '/.git/config', '/server.js', '/logs/access.log', '/uploads/payload.html', '/uploads/..%2Fserver.js']) {
    await request(app).get(route).expect(404);
  }
});

test("CORS rejects untrusted sites and API error responses have protective headers", async () => {
  await request(app).get('/api/open-status').set('Origin', 'https://attacker.invalid').expect(403);
  const result = await request(app).get('/api/orders').expect(401);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-powered-by'], undefined);
  assert.equal(result.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(result.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test("failed login attempts are throttled without affecting normal successful logins", async () => {
  for (let attempt = 0; attempt < 5; attempt++) await request(app).post('/api/auth/login').send({ username: 'limit-local-canary', password: 'wrong-local-password' }).expect(401);
  await request(app).post('/api/auth/login').send({ username: 'limit-local-canary', password: 'wrong-local-password' }).expect(429);
  await request(app).post('/api/auth/login').send({ username: 'admin', password: 'test-password' }).expect(200);
});

test("new account and password changes reject short passwords without replacing existing credentials", async () => {
  await as(request(app).post('/api/users')).send({ username: 'new-local-user', password: 'short-local', role: 'user' }).expect(400);
  await as(request(app).put('/api/users/2/password')).send({ newPassword: 'short-local' }).expect(400);
  await as(request(app).get('/api/auth/me'), user).expect(200);
});
