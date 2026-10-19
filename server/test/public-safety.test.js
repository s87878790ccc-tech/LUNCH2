const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { databaseConnectionConfig } = require('../security');
const { Client } = require('pg');

test('publication guard rejects tracked environment files without displaying their contents', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lunch-public-safety-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, '.env.production'), 'ONLY_LOCAL_TEST_CANARY=do-not-display-this-content');
  execFileSync('git', ['add', '.env.production'], { cwd: root });
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/check-public-safety.js'), root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.env\.production/);
  assert.doesNotMatch(result.stderr, /do-not-display-this-content/);
});

test('database connections verify certificates even when the URL requests weaker SSL options', () => {
  const config = databaseConnectionConfig('postgres://local-test:local-test@localhost/example?ssl=0&sslmode=disable&sslrootcert=unexpected&uselibpqcompat=true&sslnegotiation=direct');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
  assert.equal(new URL(config.connectionString).searchParams.has('sslrootcert'), false);
  assert.equal(new URL(config.connectionString).searchParams.has('uselibpqcompat'), false);
  const client = new Client(config);
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
});

test('publication guard catches weak hardcoded authentication defaults that entropy scanners can miss', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lunch-default-safety-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, 'server.js'), "const secret = process.env.JWT_SECRET || 'local-only-weak-canary';");
  execFileSync('git', ['add', 'server.js'], { cwd: root });
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/check-public-safety.js'), root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /server\.js:1/);
  assert.doesNotMatch(result.stderr, /local-only-weak-canary/);
});
