const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'lunch-orders-api';
const TOKEN_AUDIENCE = 'lunch-orders-ui';
const tokenOptions = { algorithm: 'HS256', issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, expiresIn: '8h' };

// A keyed tag invalidates sessions after any password reset, including recovery
// performed directly in the database. Neither the password nor its bcrypt hash
// is placed in the publicly decodable JWT payload.
function sessionTag(user, secret) {
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify([user.id, user.auth_version || 0, user.password_hash]))
    .digest('base64url');
}

function issueToken(user, secret) {
  return jwt.sign({ uid: user.id, sv: sessionTag(user, secret) }, secret, tokenOptions);
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) throw new Error('invalid token');
  const claims = jwt.verify(token, secret, {
    algorithms: ['HS256'], issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, maxAge: '8h',
  });
  if (!Number.isInteger(claims.uid) || claims.uid < 1 || claims.uid > 2_147_483_647 ||
      !Number.isInteger(claims.exp) || !/^[\w-]{43}$/.test(claims.sv || '')) throw new Error('invalid token');
  return claims;
}

function sessionMatches(claims, user, secret) {
  const actual = Buffer.from(claims.sv || '');
  const expected = Buffer.from(sessionTag(user, secret));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function databaseConnectionConfig(value, ca = '') {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('invalid database protocol');
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslpassword', 'sslnegotiation', 'uselibpqcompat']) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca.trim() ? { ca: ca.replace(/\\n/g, '\n') } : {}) },
  };
}

module.exports = { issueToken, verifyToken, sessionMatches, databaseConnectionConfig, TOKEN_ISSUER, TOKEN_AUDIENCE };
