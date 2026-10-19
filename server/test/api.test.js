const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { newDb, DataType } = require("pg-mem");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// The app is imported without its startup function; no production database is contacted.
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:1/lunch_test";
process.env.JWT_SECRET = "isolated-regression-test-secret";
process.env.ADMIN_DEFAULT_PASS = "test-admin-password";
process.env.SEAT_DEFAULT_PASS = "test-user-password";
const { app, pool } = require("../server");
const db = newDb();
let backup, memoryPool;
const token = (id, role = "user", username = String(id)) =>
  jwt.sign({ uid: id, role, username }, process.env.JWT_SECRET);
const admin = token(1, "admin", "admin");
const user = token(2);
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
    create table users(id serial primary key, username text unique, password_hash text, role text, status text, created_at timestamptz default now(), updated_at timestamptz default now(), last_login_at timestamptz);
    create table settings(id integer primary key, active_menu_id integer, open_days integer[], open_start text, open_end text);
    create table menus(id serial primary key, name text, note text, image_url text, image_path text);
    create table menu_items(id serial primary key, menu_id integer references menus(id), code integer, name text, price integer);
    create table orders(id serial primary key, seat integer unique, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now());
    create table order_items(id serial primary key, order_id integer references orders(id), name text, unit_price integer, qty integer, updated_at timestamptz default now());
    create table preorder_settings(id integer primary key, enabled boolean, dates text[]);
    create table preorders(id serial primary key, d date, seat integer, submitted boolean default false, internal_only boolean default false, paid boolean default false, created_at timestamptz default now(), updated_at timestamptz default now(), unique(d,seat));
    create table preorder_items(id serial primary key, preorder_id integer references preorders(id), name text, unit_price integer, qty integer);
    create table audit_logs(id serial primary key, user_id integer, action text, details jsonb, ip text, ua text, ts timestamptz default now());
    insert into settings values(1,null,'{0,1,2,3,4,5,6}','00:00','23:59');
    insert into preorder_settings values(1,true,'{2026-10-20}');
  `);
  const { Pool } = db.adapters.createPg();
  memoryPool = new Pool();
  pool.query = memoryPool.query.bind(memoryPool);
  pool.connect = memoryPool.connect.bind(memoryPool);
  const hash = await bcrypt.hash("test-password", 4);
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
