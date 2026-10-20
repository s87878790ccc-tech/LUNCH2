'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PostgresRateStore } = require('../rate-store');

test('durable authentication counter fails closed with safe 503 on database outage', async () => {
  const store = new PostgresRateStore(async () => { throw new Error('secret-database-connection-details'); }, 'login', 'synthetic-secret', () => 0);
  store.init({ windowMs: 60000 });
  await assert.rejects(store.increment(store.key('synthetic-account')), err => err.status === 503 && !err.message.includes('secret-database'));
  // A failed decrement retains its hit and must not cause an unhandled rejection.
  await assert.doesNotReject(store.decrement(store.key('synthetic-account')));
});

test('opaque counter keys separate limiter scopes and windows without storing identities', () => {
  let now = 0;
  const a = new PostgresRateStore(null, 'login-account', 'synthetic-secret', () => now);
  const b = new PostgresRateStore(null, 'password', 'synthetic-secret', () => now);
  a.init({ windowMs:60000 }); b.init({ windowMs:60000 });
  const key = a.key('synthetic-account');
  assert.notEqual(key, b.key('synthetic-account'));
  assert.match(key, /^0:[a-f0-9]{64}$/);
  now = 60000;
  assert.notEqual(key, a.key('synthetic-account'));
});
