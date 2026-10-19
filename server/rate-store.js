'use strict';
const crypto = require('node:crypto');

// Fixed windows are included in the opaque key so a late successful response
// cannot decrement the next window's counter. Never persist an IP/username.
class PostgresRateStore {
  constructor(query, namespace, secret, clock = Date.now) {
    this.query = query;
    this.prefix = `lunch:${namespace}:`;
    this.secret = secret;
    this.clock = clock;
    this.localKeys = false;
  }
  init({ windowMs }) { this.windowMs = windowMs; }
  key(raw) {
    const window = Math.floor(this.clock() / this.windowMs);
    return `${window}:${crypto.createHmac('sha256', this.secret).update(this.prefix).update(String(raw)).digest('hex')}`;
  }
  async increment(key) {
    const end = (Number(key.split(':')[0]) + 1) * this.windowMs;
    if (!Number.isSafeInteger(end)) throw new Error('Invalid rate window');
    let rows;
    try {
      ({ rows } = await this.query(`insert into lunch_security.rate_limits(bucket, hits, expires_at)
      values ($1, 1, $2) on conflict (bucket) do update
      set hits=least(lunch_security.rate_limits.hits+1,2147483647)
      returning hits`, [this.prefix + key, new Date(end)]));
    } catch {
      throw Object.assign(new Error('安全驗證暫時無法使用，請稍後再試'), { status: 503 });
    }
    return { totalHits: Number(rows[0].hits), resetTime: new Date(end) };
  }
  async decrement(key) {
    // express-rate-limit calls this after a successful response, outside its
    // async middleware. Catch failures here to avoid an unhandled rejection;
    // retaining a hit is conservative and never permits extra login attempts.
    try {
      await this.query('update lunch_security.rate_limits set hits=greatest(hits-1,0) where bucket=$1', [this.prefix + key]);
    } catch { console.warn('[security] rate_counter_decrement_failed'); }
  }
  async resetKey(key) {
    await this.query('delete from lunch_security.rate_limits where bucket=$1', [this.prefix + key]);
  }
}
async function pruneRateLimits(query) {
  // Indexed, bounded batches; no scan/deletion of business data.
  return query(`delete from lunch_security.rate_limits where bucket in
    (select bucket from lunch_security.rate_limits where expires_at < now() order by expires_at limit 1000)`);
}
module.exports = { PostgresRateStore, pruneRateLimits };
