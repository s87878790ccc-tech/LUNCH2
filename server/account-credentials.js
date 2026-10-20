'use strict';

const crypto = require('node:crypto');

// Per-account 192-bit credentials. They are returned once to an authenticated
// administrator; only independent bcrypt hashes are persisted by the caller.
function temporaryPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function passwordChangeRequired() {
  return Object.assign(new Error('請先變更初始密碼，再使用訂餐與管理功能。'), {
    status: 403, code: 'PASSWORD_CHANGE_REQUIRED',
  });
}

function isCredentialRecoveryRequest(req, userId) {
  return (req.method === 'GET' && req.path === '/api/auth/me') ||
    (req.method === 'POST' && req.path === '/api/auth/logout') ||
    (req.method === 'PUT' && req.route?.path === '/api/users/:id/password' && Number(req.params.id) === userId);
}

module.exports = { temporaryPassword, passwordChangeRequired, isCredentialRecoveryRequest };
