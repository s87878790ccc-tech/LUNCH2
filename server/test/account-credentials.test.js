'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { newDb, DataType } = require('pg-mem');
const { issueToken } = require('../security');
const { passwordError } = require('../users');
const { temporaryPassword } = require('../account-credentials');

// This app is never started and cannot use a real database. Every query is
// redirected to this file's synthetic pg-mem fixture before any request.
process.env.DATABASE_URL = 'postgres://synthetic:synthetic@127.0.0.1:1/credential_test';
process.env.JWT_SECRET = 'synthetic-credential-regression-secret';
process.env.RATE_LIMIT_STORE = '';
const { app, pool } = require('../server');
const db = newDb();
let memoryPool, snapshot, admin, regular, secondAdmin;
const adminPassword = 'synthetic-admin-credential';
const userPassword = 'abcdef';
const as = (req, token = admin) => req.set('Authorization', 'Bearer ' + token);
const login = (username, password) => request(app).post('/api/auth/login').send({ username, password });
const create = (username, role = 'user') => as(request(app).post('/api/users')).send({
  username, role, ...(role === 'admin' ? { actorPassword: adminPassword } : {}),
});

before(async () => {
  db.public.registerFunction({ name: 'pg_advisory_xact_lock', args: [DataType.integer, DataType.integer], returns: DataType.integer, implementation: () => 0 });
  db.public.none(`
    create table users(id serial primary key, username text unique not null, password_hash text not null,
      role text not null, status text not null, auth_version integer not null default 0,
      must_change_password boolean not null default false, created_at timestamptz default now(),
      updated_at timestamptz default now(), last_login_at timestamptz);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb,
      ip text, ua text, ts timestamptz default now());
  `);
  const { Pool } = db.adapters.createPg();
  memoryPool = new Pool();
  pool.query = memoryPool.query.bind(memoryPool);
  pool.connect = memoryPool.connect.bind(memoryPool);
  const hashes = [await bcrypt.hash(adminPassword, 4), await bcrypt.hash(userPassword, 4), await bcrypt.hash('synthetic-second-admin', 4)];
  for (const [username, role, hash] of [['auditor', 'admin', hashes[0]], ['2', 'user', hashes[1]], ['other-admin', 'admin', hashes[2]]]) {
    await pool.query("insert into users(username,password_hash,role,status) values($1,$2,$3,'active')", [username, hash, role]);
  }
  const token = (id, hash) => issueToken({ id, auth_version: 0, password_hash: hash }, process.env.JWT_SECRET);
  admin = token(1, hashes[0]); regular = token(2, hashes[1]); secondAdmin = token(3, hashes[2]);
  snapshot = db.backup();
});
beforeEach(() => { snapshot.restore(); pool.query = memoryPool.query.bind(memoryPool); pool.connect = memoryPool.connect.bind(memoryPool); });
after(async () => { await memoryPool.end(); await pool.end(); });

test('individual initial credentials are unpredictable, independently hashed and never returned by lists or audit', async () => {
  const samples = Array.from({ length: 32 }, temporaryPassword);
  assert.equal(new Set(samples).size, samples.length);
  assert.ok(samples.every(value => /^[A-Za-z0-9_-]{32}$/.test(value)), 'generated credentials use 192 bits without predictable seat input');
  await request(app).post('/api/users').send({ username: '37' }).expect(401);
  await as(request(app).post('/api/users'), regular).send({ username: '37' }).expect(403);
  await as(request(app).post('/api/users')).send({ username: '37', password: 'abcdef' }).expect(400);
  const first = await create('37').expect(200), second = await create('38').expect(200);
  assert.ok(first.body.initialPassword !== second.body.initialPassword, 'accounts must not share an initial credential');
  assert.equal(first.body.mustChangePassword, true);
  assert.match(first.headers['cache-control'], /no-store/);
  const hashes = db.public.many("select password_hash from users where username in ('37','38') order by username");
  assert.ok(hashes[0].password_hash !== hashes[1].password_hash, 'independent bcrypt hashes are stored');
  assert.ok(await bcrypt.compare(first.body.initialPassword, hashes[0].password_hash));
  const list = await as(request(app).get('/api/users?pageSize=100')).expect(200);
  const audit = JSON.stringify(db.public.many('select details from audit_logs'));
  assert.ok(!JSON.stringify(list.body).includes(first.body.initialPassword), 'list never repeats an initial credential');
  assert.ok(!audit.includes(first.body.initialPassword) && !audit.includes(second.body.initialPassword), 'audit excludes plaintext credentials');
  assert.ok(list.body.users.some(user => user.username === '37' && user.mustChangePassword));
});

test('first login is restricted until a different six-character user password is set, then copied tokens are revoked', async () => {
  const created = (await create('39').expect(200)).body;
  const firstLogin = (await login('39', created.initialPassword).expect(200)).body;
  const initialToken = firstLogin.token;
  assert.equal(firstLogin.user.mustChangePassword, true);
  const gate = await as(request(app).get('/api/orders/39'), initialToken).expect(403);
  assert.equal(gate.body.code, 'PASSWORD_CHANGE_REQUIRED');
  await as(request(app).get('/api/users'), initialToken).expect(403);
  await as(request(app).put('/api/users/2/password'), initialToken).send({ oldPassword: created.initialPassword, newPassword: 'ghijkl' }).expect(403);
  await as(request(app).get('/api/auth/me'), initialToken).expect(200);
  const change = payload => as(request(app).put(`/api/users/${created.id}/password`), initialToken).send(payload);
  await change({ newPassword: 'ghijkl' }).expect(400);
  await change({ oldPassword: created.initialPassword, newPassword: created.initialPassword }).expect(400);
  await change({ oldPassword: created.initialPassword, newPassword: 'abcde' }).expect(400);
  await change({ oldPassword: created.initialPassword, newPassword: 'ghijkl' }).expect(200);
  await as(request(app).get('/api/auth/me'), initialToken).expect(401);
  await login('39', created.initialPassword).expect(401);
  const established = (await login('39', 'ghijkl').expect(200)).body;
  assert.equal(established.user.mustChangePassword, false);
  await as(request(app).get('/api/auth/me'), established.token).expect(200);
  assert.equal(passwordError('abcdef', 'user'), '');
  assert.ok(passwordError('abcdef', 'admin'));
});

test('temporary administrators cannot use management APIs and may explicitly logout', async () => {
  await as(request(app).post('/api/users')).send({ username: 'missing-step-up', role: 'admin' }).expect(400);
  await as(request(app).post('/api/users')).send({ username: 'wrong-step-up', role: 'admin', actorPassword: 'incorrect-synthetic' }).expect(403);
  assert.equal(db.public.one("select count(*) as n from users where username in ('missing-step-up','wrong-step-up')").n, 0);
  const created = (await create('new-admin', 'admin').expect(200)).body;
  const initial = (await login('new-admin', created.initialPassword).expect(200)).body;
  assert.equal(initial.user.role, 'admin');
  await as(request(app).get('/api/users'), initial.token).expect(403);
  await as(request(app).post('/api/users'), initial.token).send({ username: 'cannot-create' }).expect(403);
  await as(request(app).post('/api/auth/logout'), initial.token).expect(200);
  await as(request(app).get('/api/auth/me'), initial.token).expect(401);
});

test('an individually authorized admin reset generates a new credential, revokes the old login, and leaves other accounts unchanged', async () => {
  const originalAdmin = db.public.one('select * from users where id=1');
  await as(request(app).put('/api/users/2/password'), regular).send({ resetTemporary: true, actorPassword: adminPassword }).expect(400);
  await as(request(app).put('/api/users/2/password')).send({ newPassword: 'shared-password' }).expect(400);
  await as(request(app).put('/api/users/2/password')).send({ resetTemporary: true, actorPassword: 'incorrect-synthetic' }).expect(403);
  const reset = await as(request(app).put('/api/users/2/password')).send({ resetTemporary: true, actorPassword: adminPassword }).expect(200);
  assert.equal(reset.body.mustChangePassword, true);
  await as(request(app).get('/api/auth/me'), regular).expect(401);
  await login('2', userPassword).expect(401);
  const temporary = (await login('2', reset.body.initialPassword).expect(200)).body;
  assert.equal(temporary.user.mustChangePassword, true);
  await as(request(app).get('/api/users'), temporary.token).expect(403);
  const unchanged = db.public.one('select * from users where id=1');
  assert.equal(unchanged.password_hash, originalAdmin.password_hash);
  assert.equal(unchanged.auth_version, originalAdmin.auth_version);
  await as(request(app).get('/api/auth/me'), secondAdmin).expect(200);
});

test('promotion requires administrator reauthentication and a different compliant password, atomically revoking ordinary sessions', async () => {
  const role = payload => as(request(app).patch('/api/users/2/role')).send(payload);
  await as(request(app).patch('/api/users/1/role'), regular).send({ role: 'admin', newPassword: 'synthetic-new-admin', actorPassword: userPassword }).expect(403);
  await role({ role: 'admin' }).expect(400);
  await role({ role: 'admin', actorPassword: adminPassword, newPassword: 'abcdef' }).expect(400);
  await role({ role: 'admin', actorPassword: 'incorrect-synthetic', newPassword: 'synthetic-new-admin' }).expect(403);
  assert.equal(db.public.one('select role from users where id=2').role, 'user');
  await role({ role: 'admin', actorPassword: adminPassword, newPassword: 'synthetic-new-admin' }).expect(200);
  await as(request(app).get('/api/auth/me'), regular).expect(401);
  await login('2', userPassword).expect(401);
  const promoted = (await login('2', 'synthetic-new-admin').expect(200)).body;
  assert.equal(promoted.user.role, 'admin');
  await as(request(app).get('/api/users'), promoted.token).expect(200);
  await as(request(app).get('/api/auth/me'), admin).expect(200);
  await as(request(app).get('/api/auth/me'), secondAdmin).expect(200);
});

test('a first-change requirement added after middleware cannot finish an already authenticated management write', async () => {
  let changed = false;
  pool.connect = async () => {
    if (!changed) {
      changed = true;
      await memoryPool.query('update users set must_change_password=true where id=1');
    }
    return memoryPool.connect();
  };
  const result = await create('transaction-blocked').expect(403);
  assert.equal(result.body.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal(db.public.one("select count(*) as n from users where username='transaction-blocked'").n, 0);
});

test('existing ordinary and administrator credentials continue working without a forced migration reset', async () => {
  const before = db.public.many('select id,password_hash,role,auth_version,must_change_password from users order by id');
  const ordinaryLogin = await login('2', userPassword).expect(200);
  const adminLogin = await login('auditor', adminPassword).expect(200);
  assert.equal(ordinaryLogin.body.user.mustChangePassword, false);
  assert.equal(adminLogin.body.user.mustChangePassword, false);
  const after = db.public.many('select id,password_hash,role,auth_version,must_change_password from users order by id');
  assert.deepEqual(after, before);
});
