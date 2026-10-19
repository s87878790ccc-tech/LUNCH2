'use strict';

const MAX_SEAT = 2_147_483_647;
const BASE_SEATS = Array.from({ length: 36 }, (_, i) => i + 1);

// Ordinary accounts use six Unicode characters; privileged accounts retain
// the existing twelve-character policy. bcrypt accepts at most 72 UTF-8 bytes.
function passwordError(password, role) {
  const minimum = role === 'admin' ? 12 : 6;
  if (Array.from(password).length < minimum)
    return `${role === 'admin' ? '管理員' : ''}密碼至少需要 ${minimum} 個字元`;
  if (Buffer.byteLength(password, 'utf8') > 72)
    return '密碼不可超過 72 個 UTF-8 位元組';
  return '';
}

function seatNumber(username) {
  if (typeof username !== 'string' || !/^[1-9]\d*$/.test(username)) return null;
  const n = Number(username);
  return Number.isSafeInteger(n) && n <= MAX_SEAT ? n : null;
}

function seatsFromUsers(users) {
  return [...new Set([...BASE_SEATS, ...users.map(u => seatNumber(u.username)).filter(n => n !== null)])].sort((a, b) => a - b);
}

module.exports = { MAX_SEAT, passwordError, seatNumber, seatsFromUsers };
