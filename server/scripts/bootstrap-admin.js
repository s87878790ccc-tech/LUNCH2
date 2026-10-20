'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { initializeAdmin } = require('../bootstrap');
const { databaseConnectionConfig } = require('../security');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: npm run bootstrap:admin -- --initialize-empty');
    console.log('Creates one administrator only when users is empty. Supply DATABASE_URL, ADMIN_DEFAULT_USER (optional), and ADMIN_DEFAULT_PASS privately. Never run as part of the server start command.');
    return;
  }
  if (args.length !== 1 || args[0] !== '--initialize-empty') {
    throw Object.assign(new Error('An explicit empty-installation flag is required.'), { code: 'BOOTSTRAP_FLAG_REQUIRED' });
  }
  const pool = new Pool({
    ...databaseConnectionConfig(process.env.DATABASE_URL || '', process.env.DATABASE_CA_CERT || ''),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    const options = { password: process.env.ADMIN_DEFAULT_PASS };
    if (process.env.ADMIN_DEFAULT_USER !== undefined) options.username = process.env.ADMIN_DEFAULT_USER;
    const result = await initializeAdmin(pool, options);
    console.log(result.created ? 'Initial administrator created; no seat accounts were created.' : 'Installation skipped: existing accounts were left unchanged.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    // Do not print errors, stacks or connection strings containing credentials.
    console.error('Administrator initialization failed:', /^BOOTSTRAP_[A-Z_]+$/.test(error.code || '') ? error.code : 'BOOTSTRAP_FAILED');
    process.exitCode = 1;
  });
}

module.exports = { main };
