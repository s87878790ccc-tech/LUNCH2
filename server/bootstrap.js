'use strict';

const bcrypt = require('bcrypt');
const { passwordError, seatNumber } = require('./users');

// Installation is an explicit operator action. The application startup path
// never calls this helper, so a restart cannot recreate deliberately deleted
// accounts. The same advisory lock is used by account-security mutations.
async function initializeAdmin(pool, { username = 'admin', password, hashPassword = bcrypt.hash } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('select pg_advisory_xact_lock(7301, 0)');
    const { rows } = await client.query('select 1 from users limit 1');
    if (rows.length) {
      await client.query('COMMIT');
      return { created: false };
    }

    // Match login normalization so the newly installed account is usable.
    const name = typeof username === 'string' ? username.replace(/\u3000/g, ' ')
      .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFF10 + 48)).trim() : '';
    const secret = typeof password === 'string' ? password.replace(/\u3000/g, ' ').trim() : '';
    if (!name || name.length > 64 || (Number.isFinite(Number(name)) && seatNumber(name) === null) ||
        !secret || passwordError(secret, 'admin')) {
      throw Object.assign(new Error('First installation requires an administrator name and a valid administrator password.'), {
        code: 'BOOTSTRAP_INVALID_CREDENTIALS',
      });
    }
    const hash = await hashPassword(secret, 10);
    await client.query(
      `insert into users(username, password_hash, role, status, created_at, updated_at)
       values ($1,$2,'admin','active',now(),now())`,
      [name, hash],
    );
    await client.query('COMMIT');
    return { created: true };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure without logging secrets. */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initializeAdmin };
