'use strict';

// Synthetic local failure only: the database adapter is replaced before any
// request and server.start() is never called.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
process.env.DATABASE_URL = 'postgres://synthetic:synthetic@127.0.0.1:1/never_connect';
process.env.JWT_SECRET = 'synthetic-rate-http-test-signing-secret';
process.env.RATE_LIMIT_STORE = 'postgres';
const { app, pool } = require('../server');

test('rate-counter failure returns 503 without authenticating or leaking database details', async t => {
  const queries = [];
  pool.query = async sql => {
    queries.push(sql);
    throw new Error('synthetic database internals must remain private');
  };
  t.after(() => pool.end());
  const response = await request(app).post('/api/auth/login')
    .send({ username: 'synthetic-person', password: 'synthetic-login-only' }).expect(503);
  assert.equal(response.body.message, '系統暫時無法處理，請稍後再試');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(queries.length > 0);
  assert.ok(queries.every(sql => sql.includes('lunch_security.rate_limits')));
  assert.doesNotMatch(JSON.stringify(response.body), /internals|password|token|postgres/i);
});
