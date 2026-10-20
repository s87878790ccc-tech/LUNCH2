require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { PostgresRateStore, pruneRateLimits } = require('./rate-store');
const { MAX_PRICE, badRequest, integer, validDate, booleanField, orderItems, inOpenWindow } = require('./validation');
const { issueToken, verifyToken, sessionMatches, databaseConnectionConfig } = require('./security');
const { currentContext, orderJSON, joinedOrders, assertReference, contentChanged, updatePayment } = require('./payments');
const { MAX_SEAT, passwordError, seatNumber, seatsFromUsers } = require('./users');

// Express 4 does not forward rejected async handlers to its error middleware.
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;
const PUBLIC_BASE_URL = 'https://lunch2.onrender.com';

function ensureJwtSecret() {
  const secret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET) : '';
  if (secret && secret !== 'change_me') {
    if (secret.length < 16) {
      console.warn('[security] JWT_SECRET is shorter than the recommended minimum of 16 characters.');
    }
    return secret;
  }
  const generated = randomString(48);
  console.warn('[security] JWT_SECRET not set or using placeholder; generated ephemeral value for this process. Set JWT_SECRET to persist.');
  return generated;
}

function randomString(length, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const bytes = crypto.randomBytes(length * 2);
  let output = '';
  for (let i = 0; i < bytes.length && output.length < length; i++) {
    output += alphabet[bytes[i] % alphabet.length];
  }
  if (output.length < length) {
    // Fallback to recursion only if necessary (should be rare due to buffer sizing)
    return output + randomString(length - output.length, alphabet);
  }
  return output;
}

function ensurePasswordFromEnv(key, { minLength, generator }) {
  const raw = process.env[key];
  if (raw && raw.length >= minLength) return { value: raw, generated: false, insecure: false };
  if (raw && raw.length < minLength) {
    console.warn(`[security] ${key} is shorter than the recommended minimum of ${minLength} characters.`);
    return { value: raw, generated: false, insecure: true };
  }
  const generatedValue = generator();
  console.warn(`[security] ${key} not set; generated ephemeral fallback for this process. Set ${key} to persist.`);
  return { value: generatedValue, generated: true, insecure: false };
}

const JWT_SECRET = ensureJwtSecret();
const ADMIN_DEFAULT_USER = process.env.ADMIN_DEFAULT_USER || 'admin';
const ADMIN_PASS_CONFIG = ensurePasswordFromEnv('ADMIN_DEFAULT_PASS', {
  minLength: 12,
  generator: () => randomString(24),
});
const SEAT_PASS_CONFIG = ensurePasswordFromEnv('SEAT_DEFAULT_PASS', {
  minLength: 6,
  generator: () => randomString(8, '0123456789'),
});

// 允許的前端網域（GitHub Pages）
const ALLOW_ORIGINS = [
  'https://s87878790ccc-tech.github.io',
  PUBLIC_BASE_URL,
  ...(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
];

// 反向代理（Render/Cloudflare 等）下要設定，否則 rate-limit 對 XFF 會警告
app.set('trust proxy', 1);

/* =========================
   Logging
   ========================= */
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_ENV = Number(process.env.MAX_UPLOAD_BYTES);
const MAX_UPLOAD_BYTES = Number.isFinite(MAX_UPLOAD_ENV) && MAX_UPLOAD_ENV > 0
  ? MAX_UPLOAD_ENV
  : 2 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].map(t => t.toLowerCase()));

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(MAX_UPLOAD_BYTES, 5 * 1024 * 1024), files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, cb) => {
    const type = (file.mimetype || '').toLowerCase();
    if (allowedImageTypes.has(type)) return cb(null, true);
    cb(new Error('僅接受 PNG/JPG/GIF/WebP 圖片')); // handled in route
  },
}).single('image');
let processingImage = false;

/* =========================
   Security / Middleware
   ========================= */
app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"], sandbox: [],
  } },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

function enforcePlainObjectBody(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (req.body === undefined || req.body === null) return next();
  if (typeof req.body === 'object' && !Array.isArray(req.body)) return next();
  return res.status(400).json({ message: 'invalid payload type' });
}

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600, // A classroom may share one public IP address.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: '請求過於頻繁，請稍後再試' },
});

function getBody(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return {};
  return req.body;
}

const USERNAME_MAX_LEN = 64;
const PASSWORD_MAX_LEN = 256;

function normalizeUsernameInput(value = '') {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u3000/g, ' ')
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48))
    .trim();
}

function normalizePasswordInput(value = '') {
  if (typeof value !== 'string') return '';
  return value.replace(/\u3000/g, ' ').trim();
}

// Normal server startup always uses the shared database. Imported isolated
// tests retain memory stores unless explicitly testing the PostgreSQL adapter.
const durableLimits = require.main === module || process.env.RATE_LIMIT_STORE === 'postgres';
function protectedRateOptions(namespace, rawKey = req => req.ip) {
  const options = {
    handler(req, res, _next, settings) {
      if (req.rateLimit.used === req.rateLimit.limit + 1) console.warn(JSON.stringify({ event: 'security.rate_limit', scope: namespace, status: 429 }));
      res.status(429).json(settings.message);
    },
  };
  if (!durableLimits) return { ...options, keyGenerator: rawKey };
  const store = new PostgresRateStore((sql, params) => pool.query(sql, params), namespace, JWT_SECRET);
  return { ...options, store, keyGenerator: req => store.key(rawKey(req)), passOnStoreError: false };
}
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'too many login attempts, please try again shortly' },
  ...protectedRateOptions('login-pair', req => `${req.ip}:${normalizeUsernameInput(getBody(req).username)}`),
  skipSuccessfulRequests: true,
});
const loginIpLimiter = rateLimit({
  ...protectedRateOptions('login-ip'),
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'too many login attempts, please try again shortly' },
});
const loginAccountLimiter = rateLimit({
  windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  skipSuccessfulRequests: true,
  ...protectedRateOptions('login-account', req => normalizeUsernameInput(getBody(req).username)),
  message: { message: 'too many login attempts, please try again shortly' },
});
const uploadLimiter = rateLimit({ ...protectedRateOptions('upload'), windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
// The old-password check is another authentication surface. Key it to the
// verified account, so changing IPs or target IDs cannot reset its allowance.
const passwordChangeLimiter = rateLimit({
  windowMs: 60_000, limit: req => req.user.role === 'admin' ? 60 : 5,
  ...protectedRateOptions('password', req => String(req.user.uid)), standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: '密碼操作過於頻繁，請一分鐘後再試' },
});
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

function normalizeTimeString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : fallback;
}

function normalizeOpenDays(value) {
  if (!Array.isArray(value)) return ['1', '2', '3', '4', '5'];
  const cleaned = value
    .map(v => String(v).trim())
    .filter(v => /^([0-6])$/.test(v));
  return cleaned.length ? cleaned : ['1', '2', '3', '4', '5'];
}

// CORS（單一乾淨版本，含預檢）
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-side/curl
    if (ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use('/api', globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(enforcePlainObjectBody);
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

for (const [key, max] of [['seat', MAX_SEAT], ['id', 2_147_483_647], ['itemId', 2_147_483_647]]) {
  app.param(key, (_req, _res, next, value) => next(
    integer(value, 1, max) ? undefined : badRequest(`無效的 ${key}`)
  ));
}
app.param('date', (_req, _res, next, value) => next(validDate(value) ? undefined : badRequest('日期格式不正確')));

// logging
morgan.token('safe-url', req => req.path);
const accessFormat = ':method :safe-url :status :response-time ms';
app.use(morgan(accessFormat, { stream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a', mode: 0o600 }) }));
app.use(morgan(accessFormat));

app.use('/uploads', (req, res, next) => {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]*\.(?:jpe?g|png|gif|webp)$/i.test(req.path)) return res.status(404).end();
  next();
}, express.static(UPLOAD_DIR, {
  dotfiles: 'deny', index: false, redirect: false,
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

/* =========================
   DB (pg)
   ========================= */
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in env');
  process.exit(1);
}
let databaseConfig;
try {
  databaseConfig = databaseConnectionConfig(DATABASE_URL, process.env.DATABASE_CA_CERT || '');
} catch (e) {
  console.error('Bad DATABASE_URL configuration');
  process.exit(1);
}
const pool = new Pool({
  ...databaseConfig,
  keepAlive: true,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
pool.on('error', err => console.error('Unexpected idle database connection error:', err.message));

async function q(sql, params = []) { const { rows } = await pool.query(sql, params); return rows; }
async function one(sql, params = []) { const { rows } = await pool.query(sql, params); return rows[0] || null; }
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Rollback failed:', rollbackError.message); }
    throw e;
  } finally { client.release(); }
}
async function t_one(c, sql, params = []) { const { rows } = await c.query(sql, params); return rows[0] || null; }
async function t_q(c, sql, params = []) { const { rows } = await c.query(sql, params); return rows; }

/* =========================
   Schema 升級（不破壞既有資料）
   ========================= */
async function ensureUsersSecuritySchema() {
  await pool.query('alter table users add column if not exists auth_version integer not null default 0');
}
async function ensureAuditLogsSchema() {
  await pool.query(`
    create table if not exists audit_logs(
      id serial primary key,
      user_id integer,
      action text,
      details jsonb,
      ip text,
      ua text,
      ts timestamptz default now()
    )
  `);
}

async function ensureSettingsSchema() {
  await pool.query(`
    create table if not exists settings(
      id integer primary key,
      active_menu_id integer,
      open_days integer[] default '{1,2,3,4,5}',
      open_start text default '07:00',
      open_end   text default '12:00'
    )
  `);
  await pool.query(`
    alter table if exists settings
      add column if not exists open_days integer[] default '{1,2,3,4,5}',
      add column if not exists open_start text default '07:00',
      add column if not exists open_end   text default '12:00',
      add column if not exists manual_locked boolean not null default false
  `);
  await pool.query(`insert into settings(id) values(1) on conflict (id) do nothing`);
  await pool.query(`
    update settings
    set open_days = coalesce(open_days, '{1,2,3,4,5}'),
        open_start = coalesce(open_start, '07:00'),
        open_end   = coalesce(open_end,   '12:00')
    where id = 1
  `);
}

async function ensureOrdersExtraColumns() {
  await pool.query(`alter table if exists orders add column if not exists internal_only boolean default false`);
  await pool.query(`alter table if exists orders add column if not exists paid boolean default false`);
}

async function ensureOrderItemsExtraColumns() {
  await pool.query(`alter table if exists order_items add column if not exists updated_at timestamptz default now()`);
  await pool.query(`alter table if exists order_items alter column updated_at set default now()`);
  await pool.query(`
    do $$
    begin
      if exists (
        select 1 from information_schema.tables where table_name = 'order_items'
      ) then
        update order_items set updated_at = coalesce(updated_at, now()) where updated_at is null;
      end if;
    end
    $$;
  `);
}

async function ensureMenuExtraColumns() {
  await pool.query(`alter table if exists menus add column if not exists note text`);
  await pool.query(`alter table if exists menus add column if not exists image_url text`);
  await pool.query(`alter table if exists menus add column if not exists image_path text`);
  await pool.query(`
    update menus
    set image_path = nullif(split_part(split_part(image_url, '/uploads/', 2), '?', 1), '')
    where image_path is null
      and coalesce(image_url, '') like '%/uploads/%'
  `);
}

async function ensurePreorderSchema() {
  // 設定
  await pool.query(`
    create table if not exists preorder_settings(
      id integer primary key,
      enabled boolean default false,
      dates text[] default '{}'
    )
  `);
  await pool.query(`insert into preorder_settings(id) values(1) on conflict(id) do nothing`);

  // 主表
  await pool.query(`
    create table if not exists preorders(
      id serial primary key,
      d date,
      seat integer not null,
      submitted boolean default false,
      internal_only boolean default false,
      paid boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )
  `);
  // date → d
  await pool.query(`
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns where table_name='preorders' and column_name='d'
      ) then
        if exists (
          select 1 from information_schema.columns where table_name='preorders' and column_name='date'
        ) then
          execute 'alter table preorders rename column "date" to d';
        else
          execute 'alter table preorders add column d date';
        end if;
      end if;
    end
    $$;
  `);
  await pool.query(`alter table preorders alter column d set not null`);
  await pool.query(`alter table preorders add column if not exists submitted boolean default false`);
  await pool.query(`alter table preorders add column if not exists internal_only boolean default false`);
  await pool.query(`alter table preorders add column if not exists paid boolean default false`);
  await pool.query(`create unique index if not exists preorders_d_seat_key on preorders(d, seat)`);

  // 明細表（統一使用 preorder_id）
  await pool.query(`
    create table if not exists preorder_items(
      id serial primary key,
      preorder_id integer references preorders(id) on delete cascade,
      name text not null,
      unit_price integer not null,
      qty integer not null
    )
  `);
  // 兼容：order_id → preorder_id
  await pool.query(`
    do $$
    begin
      if exists (
        select 1 from information_schema.columns where table_name='preorder_items' and column_name='order_id'
      ) and not exists (
        select 1 from information_schema.columns where table_name='preorder_items' and column_name='preorder_id'
      ) then
        execute 'alter table preorder_items rename column order_id to preorder_id';
      end if;

      if not exists (
        select 1 from information_schema.columns where table_name='preorder_items' and column_name='preorder_id'
      ) then
        execute 'alter table preorder_items add column preorder_id integer';
      end if;
    end
    $$;
  `);
}

/* =========================
   bootstrap（seed）
   ========================= */
async function seed() {
  const adminName = ADMIN_DEFAULT_USER;
  const adminPass = ADMIN_PASS_CONFIG.value;
  const seatPass = SEAT_PASS_CONFIG.value;

  const u = await one('select * from users where username=$1', [adminName]);
  if (!u) {
    const hash = await bcrypt.hash(adminPass, 10);
    await q(
      `insert into users(username, password_hash, role, status, created_at, updated_at)
       values ($1,$2,'admin','active',now(),now())`,
      [adminName, hash]
    );
    console.log('[seed] admin created:', adminName);
    if (ADMIN_PASS_CONFIG.generated) {
      console.warn('[seed] Admin password was generated. Configure ADMIN_DEFAULT_PASS before creating new accounts; passwords are never logged.');
    }
  } else {
    console.log('[seed] admin exists:', adminName);
    if (ADMIN_PASS_CONFIG.generated) {
      console.warn('[seed] Admin user already existed; generated fallback password was not applied. Set ADMIN_DEFAULT_PASS to rotate manually.');
    }
  }

  const hashSeat = await bcrypt.hash(seatPass, 10);
  let createdSeats = 0;
  for (let s = 1; s <= 36; s++) {
    const inserted = await one(
      `insert into users(username, password_hash, role, status, created_at, updated_at)
       values ($1,$2,'user','active',now(),now())
       on conflict (username) do nothing
       returning id`,
      [String(s), hashSeat]
    );
    if (inserted) createdSeats++;
  }
  if (createdSeats > 0) {
    console.log(`[seed] created ${createdSeats} seat accounts; passwords are never logged.`);
    if (SEAT_PASS_CONFIG.generated) {
      console.warn('[seed] Seat default password auto-generated for this run. Set SEAT_DEFAULT_PASS to persist across restarts.');
    }
  } else {
    console.log('[seed] seat users 1~36 already existed');
    if (SEAT_PASS_CONFIG.generated) {
      console.warn('[seed] Seat accounts already existed; generated fallback password was not applied. Set SEAT_DEFAULT_PASS to rotate if needed.');
    }
  }
}

/* =========================
   Auth helpers
   ========================= */
function sign(user) {
  return issueToken(user, JWT_SECRET);
}
function auth(required = true) {
  return asyncRoute(async (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return required ? res.status(401).json({ message: 'no token' }) : next();
    try {
      req.user = verifyToken(t, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'invalid token' });
    }
    const current = await one('select id, username, role, status, password_hash, auth_version from users where id=$1', [req.user.uid]);
    if (!current || current.status !== 'active' || !sessionMatches(req.user, current, JWT_SECRET)) return res.status(401).json({ message: '登入已失效，請重新登入' });
    req.authClaims = req.user;
    req.user = { uid: current.id, username: current.username, role: current.role };
    next();
  });
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' });
  next();
}

async function lockActor(req, client, adminOnly, exclusive = false) {
  const actor = await t_one(client, `select * from users where id=$1 for ${exclusive ? 'update' : 'share'}`, [req.user.uid]);
  if (!actor || actor.status !== 'active' || !sessionMatches(req.authClaims, actor, JWT_SECRET))
    throw Object.assign(new Error('登入已失效，請重新登入'), { status: 401 });
  if (adminOnly && actor.role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 });
  return actor;
}

// Hold a shared actor lock through the business commit. A password reset,
// logout, suspension, deletion or demotion either commits first (and this
// request is rejected), or waits until this already-authorized write finishes.
// Shared locks still allow different seats and administrators to work in parallel.
async function authorizedTx(req, change, adminOnly = false) {
  return tx(async client => change(client, await lockActor(req, client, adminOnly)));
}

// Serialize account-security mutations, then revalidate the caller inside the
// transaction. A request authorized before a concurrent revocation cannot
// finish with old privileges or remove the last active administrator.
async function mutateUsers(req, change, adminOnly = true) {
  return tx(async client => {
    await client.query('select pg_advisory_xact_lock(7301, 0)');
    const actor = await lockActor(req, client, adminOnly, true);
    return change(client, actor);
  });
}
function getPublicBaseUrl() {
  return PUBLIC_BASE_URL;
}
function sanitizeImageFilename(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    const err = new Error('invalid image reference');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  const resolved = path.resolve(UPLOAD_DIR, trimmed);
  if (!resolved.startsWith(UPLOAD_DIR)) {
    const err = new Error('invalid image reference');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  if (!fs.existsSync(resolved)) {
    const err = new Error('image not found');
    err.code = 'IMAGE_NOT_FOUND';
    throw err;
  }
  return trimmed;
}
function buildMenuImageMeta(req, row) {
  const filename = row?.image_path ? String(row.image_path).trim() : '';
  if (filename) {
    const safeName = encodeURIComponent(filename);
    const url = `${getPublicBaseUrl(req)}/uploads/${safeName}`;
    return { imageUrl: url, imageFilename: filename };
  }
  const fallback = row?.image_url ? String(row.image_url).trim() : '';
  return { imageUrl: fallback, imageFilename: '' };
}
async function logAction(user, action, details, req) {
  try {
    await q(
      `insert into audit_logs(user_id, action, details, ip, ua, ts)
       values ($1,$2,$3,$4,$5,now())`,
      [user?.uid || null, action, details ? JSON.stringify(details) : null, req.ip, req.headers['user-agent'] || '']
    );
  } catch (err) {
    // A failed audit insert must not report a committed order as failed and invite a duplicate retry.
    console.error('Audit log write failed:', action, err.code || 'UNKNOWN');
  }
}

// helpers
async function ensureOrder(seat, client, context) {
  // Serialize creation without assuming the legacy orders table has a unique seat index.
  await client.query('select pg_advisory_xact_lock(7201, $1::integer)', [seat]);
  const existing = await t_one(client, 'select * from orders where seat=$1 and order_date=$2 and order_batch=$3 for update', [seat, context.date, context.batch]);
  if (existing) return existing;
  return t_one(client,
    `insert into orders(seat, order_date, order_batch, submitted, internal_only, paid, created_at, updated_at)
     values ($1,$2,$3,false,false,false,now(),now()) returning *`, [seat, context.date, context.batch]);
}
async function orderContext(client = null) {
  return client ? currentContext(client, BUSINESS_TZ) : tx(c => currentContext(c, BUSINESS_TZ));
}
function userCanAccessSeat(user, seat) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return seatNumber(user.username) === seat;
}

async function getSeats() {
  return seatsFromUsers(await q('select username from users'));
}

app.get('/api/seats', auth(), asyncRoute(async (_req, res) => {
  res.json({ seats: await getSeats() });
}));

/* =========================
   時區設定（24h）
   ========================= */
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Taipei';

function zonedNowInfo(tz = BUSINESS_TZ) {
  const now = new Date();
  const [hh, mm] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit'
  }).format(now).split(':');

  const wdStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const wdMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const day = wdMap[wdStr] ?? 0;

  const nowLocal = new Intl.DateTimeFormat('zh-TW', {
    timeZone: tz, hour12: false,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).format(now);

  return { hhmm: `${hh}:${mm}`, day, nowISO: now.toISOString(), nowLocal, tz };
}

async function isOpenNow(client) {
  const s = await t_one(client, 'select open_days, open_start, open_end from settings where id=1 for share');
  return inOpenWindow(s, zonedNowInfo());
}

/* =========================
   Routes
   ========================= */
app.get('/api/health', asyncRoute(async (_req, res) => {
  await one('select 1 as connected');
  res.json({ ok: true, version: 'quick-payments-v1' });
}));

app.post('/api/uploads/images', auth(), requireAdmin, uploadLimiter, (req, res) => {
  imageUpload(req, res, async (err) => {
    if (err) {
      const maxMb = Math.round((MAX_UPLOAD_BYTES / (1024 * 1024)) * 10) / 10;
      let message = err.message || '上傳失敗';
      if (err.code === 'LIMIT_FILE_SIZE') message = `檔案過大，限制 ${maxMb} MB`;
      return res.status(400).json({ message });
    }
    if (!req.file) return res.status(400).json({ message: '請選擇圖片檔' });
    if (processingImage) return res.status(429).json({ message: '圖片處理中，請稍後重試' });
    processingImage = true;
    const fileName = `${Date.now()}-${crypto.randomUUID()}.webp`;
    let created = false;
    try {
      let encoded;
      try {
        const image = sharp(req.file.buffer, { limitInputPixels: 16_000_000, failOn: 'warning', animated: false });
        const metadata = await image.metadata();
        if (!['jpeg', 'png', 'gif', 'webp'].includes(metadata.format)) throw new Error('unsupported image');
        encoded = await image.rotate().webp({ quality: 85 }).toBuffer();
        if (encoded.length > 5 * 1024 * 1024) throw new Error('image too large');
      } catch {
        return res.status(400).json({ message: '圖片內容無效、尺寸過大或格式不支援' });
      }
      await authorizedTx(req, async () => {
        await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), encoded, { flag: 'wx', mode: 0o600 });
        created = true;
      }, true);
      const url = `${getPublicBaseUrl(req)}/uploads/${encodeURIComponent(fileName)}`;
      await logAction(req.user, 'upload.image', { filename: fileName, size: encoded.length }, req);
      res.json({ url, filename: fileName });
    } catch (e) {
      if (![401, 403].includes(e.status)) console.error('Image upload failed:', e.code || 'UNKNOWN');
      if (created) fs.unlink(path.join(UPLOAD_DIR, fileName), () => {});
      const status = [401, 403].includes(e.status) ? e.status : 500;
      res.status(status).json({ message: status === 500 ? '上傳失敗' : e.message });
    } finally {
      processingImage = false;
    }
  });
});

// Auth
app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, loginLimiter, asyncRoute(async (req, res) => {
  const body = getBody(req);
  const username = normalizeUsernameInput(body.username);
  const password = normalizePasswordInput(body.password);
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });
  if (username.length > USERNAME_MAX_LEN || password.length > PASSWORD_MAX_LEN || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'username/password too long' });
  }

  const u = await one('select * from users where username=$1', [username]);
  const ok = await bcrypt.compare(password, u?.password_hash || dummyPasswordHash);
  if (!u || u.status !== 'active' || !ok) return res.status(401).json({ message: 'invalid credentials' });

  await q('update users set last_login_at=now(), updated_at=now() where id=$1', [u.id]);

  const token = sign(u);
  await logAction({ uid: u.id }, 'login', { username }, req);
  // 統一回傳 shape（id/username/role）
  res.json({ token, user: { id: u.id, username: u.username, role: u.role } });
}));

// ✅ 統一 /auth/me 回傳 shape（修正原本只有 uid 導致前端 id 為 undefined）
app.get('/api/auth/me', auth(), asyncRoute(async (req, res) => {
  const u = req.user;
  res.json({ user: { id: u.uid, username: u.username, role: u.role } });
}));
app.post('/api/auth/logout', auth(), asyncRoute(async (req, res) => {
  await mutateUsers(req, c => c.query('update users set auth_version=auth_version+1 where id=$1', [req.user.uid]), false);
  await logAction(req.user, 'logout', { allDevices: true }, req);
  res.json({ ok: true });
}));

// Settings（admin）
app.get('/api/settings/open-window', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  res.json({
    openDays: s?.open_days || ['1','2','3','4','5'],
    openStart: s?.open_start || '07:00',
    openEnd: s?.open_end || '12:00',
  });
}));
app.put('/api/settings/open-window', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  if (!Array.isArray(body.openDays) || !body.openDays.length || body.openDays.some(d => !integer(d, 0, 6))) throw badRequest('請選擇有效的開放日');
  if (![body.openStart, body.openEnd].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw badRequest('請設定有效的開始與結束時間');
  const days = [...new Set(normalizeOpenDays(body.openDays))];
  const start = normalizeTimeString(body.openStart, '07:00');
  const end = normalizeTimeString(body.openEnd, '12:00');
  await authorizedTx(req, c => c.query('update settings set open_days=$1, open_start=$2, open_end=$3 where id=1', [days, start, end]), true);
  await logAction(req.user, 'settings.openWindow', { openDays: days, openStart: start, openEnd: end }, req);
  res.json({ ok: true });
}));

// 公開：是否在開放點餐時段
app.get('/api/open-status', asyncRoute(async (req, res) => {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  const info = zonedNowInfo();
  const openDays = (s?.open_days || []).map(Number);
  const start = s?.open_start || '07:00';
  const end   = s?.open_end   || '12:00';
  const open = inOpenWindow(s, info);
  res.json({ open, openDays: openDays.map(String), openStart: start, openEnd: end, nowISO: info.nowISO, nowLocal: info.nowLocal, tz: info.tz });
}));

// Menus
app.get('/api/menus', auth(), asyncRoute(async (req, res) => {
  const [menus, items, setting] = await Promise.all([
    q('select * from menus order by id asc'),
    q('select * from menu_items order by menu_id asc, code asc'),
    one('select active_menu_id from settings where id=1'),
  ]);
  const byMenu = new Map();
  for (const item of items) {
    if (!byMenu.has(item.menu_id)) byMenu.set(item.menu_id, []);
    byMenu.get(item.menu_id).push({ id: item.id, code: item.code, name: item.name, price: item.price });
  }
  const grouped = menus.map(m => {
    const meta = buildMenuImageMeta(req, m);
    return {
      id: m.id,
      name: m.name,
      note: m.note || '',
      imageUrl: meta.imageUrl,
      imageFilename: meta.imageFilename,
      items: byMenu.get(m.id) || [],
    };
  });
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
}));
app.post('/api/menus', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 128) return res.status(400).json({ message: 'name required' });
  const noteRaw = typeof body.note === 'string' ? body.note.trim() : '';
  const note = noteRaw ? noteRaw.slice(0, 2000) : null;
  let imageFilename = null;
  if (typeof body.imageFilename === 'string') {
    try {
      imageFilename = sanitizeImageFilename(body.imageFilename);
    } catch (err) {
      const message = err.code === 'IMAGE_NOT_FOUND'
        ? '圖片檔案不存在，請重新上傳'
        : '圖片檔案格式不正確';
      return res.status(400).json({ message });
    }
  }
  const row = await authorizedTx(req, c => t_one(c,
    'insert into menus(name, note, image_path, image_url) values ($1,$2,$3,null) returning id, name, note, image_path, image_url',
    [name, note, imageFilename]
  ), true);
  const meta = buildMenuImageMeta(req, row);
  await logAction(req.user, 'menu.create', { id: row.id, name, note, imageFilename }, req);
  res.json({ id: row.id, name: row.name, note: row.note || '', imageUrl: meta.imageUrl, imageFilename: meta.imageFilename, items: [] });
}));
app.put('/api/menus/:id', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 128) return res.status(400).json({ message: 'name required' });
  const noteRaw = typeof body.note === 'string' ? body.note.trim() : '';
  const note = noteRaw ? noteRaw.slice(0, 2000) : null;
  const hasImageField = Object.prototype.hasOwnProperty.call(body, 'imageFilename');
  let imageFilename = null;
  if (hasImageField) {
    try {
      imageFilename = sanitizeImageFilename(body.imageFilename);
    } catch (err) {
      const message = err.code === 'IMAGE_NOT_FOUND'
        ? '圖片檔案不存在，請重新上傳'
        : '圖片檔案格式不正確';
      return res.status(400).json({ message });
    }
  }
  const setParts = ['name=$1', 'note=$2'];
  const params = [name, note];
  if (hasImageField) {
    params.push(imageFilename);
    setParts.push(`image_path=$${params.length}`);
    params.push(null);
    setParts.push(`image_url=$${params.length}`);
  }
  params.push(id);
  await authorizedTx(req, c => c.query(`update menus set ${setParts.join(', ')} where id=$${params.length}`, params), true);
  const details = { id, name, note };
  if (hasImageField) details.imageFilename = imageFilename;
  await logAction(req.user, 'menu.update', details, req);
  res.json({ ok: true });
}));
app.delete('/api/menus/:id', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  await authorizedTx(req, async (c) => {
    await c.query('delete from menu_items where menu_id=$1', [id]);
    await c.query('delete from menus where id=$1', [id]);
    const s = await t_one(c, 'select active_menu_id from settings where id=1');
    if (s?.active_menu_id === id) await c.query('update settings set active_menu_id=null where id=1');
  }, true);
  await logAction(req.user, 'menu.delete', { id }, req);
  res.json({ ok: true });
}));
app.post('/api/menus/:id/items', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const menuId = Number(req.params.id);
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const price = Number(body.price);
  if (!name || name.length > 100 || !integer(body.price, 0, MAX_PRICE)) throw badRequest('請輸入 1～100 字品名及非負整數價格');
  const row = await authorizedTx(req, async c => {
    const menu = await t_one(c, 'select id from menus where id=$1 for update', [menuId]);
    if (!menu) throw Object.assign(new Error('菜單不存在'), { status: 404 });
    const max = await t_one(c, 'select coalesce(max(code),0) c from menu_items where menu_id=$1', [menuId]);
    return t_one(c,
      'insert into menu_items(menu_id, code, name, price) values ($1,$2,$3,$4) returning id, code, name, price',
      [menuId, Number(max?.c || 0) + 1, name, price]);
  }, true);
  await logAction(req.user, 'menu.item.create', { menuId, itemId: row.id, name, price }, req);
  res.json({
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
  });
}));
app.put('/api/menu-items/:itemId', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const itemId = Number(req.params.itemId);
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const price = Number(body.price);
  if (!name || name.length > 100 || !integer(body.price, 0, MAX_PRICE)) throw badRequest('請輸入 1～100 字品名及非負整數價格');
  await authorizedTx(req, c => c.query('update menu_items set name=$1, price=$2 where id=$3', [name ?? null, price, itemId]), true);
  await logAction(req.user, 'menu.item.update', { itemId, name, price }, req);
  res.json({ ok: true });
}));
app.delete('/api/menu-items/:itemId', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const itemId = Number(req.params.itemId);
  await authorizedTx(req, async c => {
    const row = await t_one(c, 'select menu_id from menu_items where id=$1', [itemId]);
    if (row) {
      await c.query('delete from menu_items where id=$1', [itemId]);
      const items = await t_q(c, 'select id from menu_items where menu_id=$1 order by code asc, id asc', [row.menu_id]);
      for (let i = 0; i < items.length; i++) {
        await c.query('update menu_items set code=$1 where id=$2', [i + 1, items[i].id]);
      }
    }
  }, true);
  await logAction(req.user, 'menu.item.delete', { itemId }, req);
  res.json({ ok: true });
}));
app.put('/api/settings/active-menu', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  if (body.menuId != null && !integer(body.menuId, 1, 2_147_483_647)) throw badRequest('無效的菜單 ID');
  const menuId = body.menuId == null ? null : Number(body.menuId);
  await authorizedTx(req, async c => {
    if (menuId !== null && !await t_one(c, 'select id from menus where id=$1', [menuId])) throw Object.assign(new Error('菜單不存在'), { status: 404 });
    await c.query('update settings set active_menu_id=$1 where id=1', [menuId ?? null]);
  }, true);
  await logAction(req.user, 'settings.activeMenu', { menuId }, req);
  res.json({ ok: true });
}));

app.get('/api/settings/manual-order', auth(), asyncRoute(async (_req, res) => {
  const setting = await one('select manual_locked from settings where id=1');
  res.json({ locked: setting?.manual_locked !== false });
}));
app.put('/api/settings/manual-order', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  if (typeof body.locked !== 'boolean') throw badRequest('locked 必須為布林值');
  await authorizedTx(req, c => c.query('update settings set manual_locked=$1 where id=1', [body.locked]), true);
  await logAction(req.user, 'settings.manualOrderLock', { locked: body.locked }, req);
  res.json({ locked: body.locked });
}));

// Manual ordering is intentional. The administrator can lock it while keeping
// ordinary catalogue ordering available. Preserve existing manual lines exactly.
async function validateManualLock(user, client, items, previousItems) {
  if (user.role === 'admin') return;
  const setting = await t_one(client, 'select manual_locked from settings where id=1 for share');
  if (setting?.manual_locked === false) return;
  const menuItems = await t_q(client, 'select mi.name, mi.price from menu_items mi join settings s on s.active_menu_id=mi.menu_id where s.id=1');
  const isCatalog = item => item.name === '內訂' && item.unitPrice === 0 && item.qty === 1 ||
    menuItems.some(menuItem => menuItem.name === item.name && menuItem.price === item.unitPrice);
  const manualLines = rows => rows.filter(row => !isCatalog(row))
    .map(row => JSON.stringify([row.name, row.unitPrice, row.qty])).sort();
  if (JSON.stringify(manualLines(items)) !== JSON.stringify(manualLines(previousItems))) {
    throw Object.assign(new Error('管理員已鎖定手動餐點，請聯絡管理員修改'), { status: 403 });
  }
}
// Orders
// One order snapshot covers the roster, including newly created numeric seats.
app.get('/api/orders', auth(), requireAdmin, asyncRoute(async (_req, res) => {
  const context = await orderContext();
  const rows = await q(`select o.*, i.id as line_id, i.name as line_name, i.unit_price as line_price, i.qty as line_qty, i.updated_at as line_updated_at
    from orders o left join order_items i on i.order_id=o.id
    where o.order_date=$1 and o.order_batch=$2 order by o.seat, i.id`, [context.date, context.batch]);
  const bySeat = joinedOrders(rows);
  const seats = [...new Set([...(await getSeats()), ...bySeat.keys()])].sort((a, b) => a - b);
  res.json({ ...context, orders: seats.map(seat => {
    const record = bySeat.get(seat);
    return orderJSON(record?.order, record?.items || [], seat, context);
  }) });
}));

app.get('/api/orders/:seat', auth(), asyncRoute(async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });
  const context = await orderContext();
  const rows = await q(`select o.*, i.id as line_id, i.name as line_name, i.unit_price as line_price, i.qty as line_qty, i.updated_at as line_updated_at
    from orders o left join order_items i on i.order_id=o.id where o.seat=$1 and o.order_date=$2 and o.order_batch=$3 order by i.id`, [seat, context.date, context.batch]);
  const record = joinedOrders(rows).get(seat);
  res.json(orderJSON(record?.order, record?.items || [], seat, context));
}));
app.put('/api/orders/:seat', auth(), asyncRoute(async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });

  const body = getBody(req);
  const finalItems = orderItems(body);
  const rawItems = body.items;
  const internalOnly = booleanField(body, 'internalOnly');
  await authorizedTx(req, async (c, actor) => {
    if (!userCanAccessSeat(actor, seat)) throw Object.assign(new Error('forbidden'), { status: 403 });
    const context = await orderContext(c);
    await c.query('select pg_advisory_xact_lock(7201, $1::integer)', [seat]);
    const existing = await t_one(c, 'select * from orders where seat=$1 and order_date=$2 and order_batch=$3 for update', [seat, context.date, context.batch]);
    assertReference(body, existing, context, false);
    if (actor.role !== 'admin' && !await isOpenNow(c)) throw Object.assign(new Error('not in open window'), { status: 403 });
    const o = existing || await ensureOrder(seat, c, context);
    const previous = await t_q(c, 'select name, unit_price, qty from order_items where order_id=$1', [o.id]);
    await validateManualLock(actor, c, finalItems, previous.map(row => ({ name: row.name, unitPrice: row.unit_price, qty: row.qty })));
    const flag = internalOnly;
    const submitted = finalItems.length > 0;

    const changed = contentChanged(o, previous, finalItems, internalOnly);
    await c.query('update orders set submitted=$1, internal_only=$2, paid=case when $4 then false else paid end, revision=revision+1, payment_updated_at=case when $4 then now() else payment_updated_at end, payment_updated_by=case when $4 then $5 else payment_updated_by end, updated_at=now() where id=$3', [
      submitted, flag, o.id, changed, req.user.uid,
    ]);
    await c.query('delete from order_items where order_id=$1', [o.id]);
    for (const it of finalItems) {
      await c.query(
        'insert into order_items(order_id, name, unit_price, qty, updated_at) values ($1,$2,$3,$4, now())',
        [o.id, String(it.name), Number(it.unitPrice), Number(it.qty)]
      );
    }
  });
  await logAction(req.user, 'order.update', { seat, internalOnly: !!internalOnly, itemsCount: rawItems.length }, req);
  res.json({ ok: true });
}));
// 訂單「已付款」切換（admin）
app.put('/api/orders/:seat/paid', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  const body = getBody(req);
  const order = await authorizedTx(req, async c => {
    const context = await orderContext(c);
    const o = await t_one(c, 'select * from orders where seat=$1 and order_date=$2 and order_batch=$3 for update', [seat, context.date, context.batch]);
    const items = o ? await t_q(c, 'select * from order_items where order_id=$1 order by id', [o.id]) : [];
    return updatePayment(c, { order: o, items, context, body, userId: req.user.uid });
  }, true);
  await logAction(req.user, 'order.paid', { seat, paid: order.paid, orderId: order.orderId, date: order.date, batch: order.batch, version: order.version }, req);
  res.json({ ok: true, order });
}));
app.delete('/api/orders/today', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const result = await authorizedTx(req, async (c) => {
    await c.query('select id from settings where id=1 for update');
    const previous = await orderContext(c);
    assertReference({ ...getBody(req), orderId: null, version: 0 }, null, previous, false);
    const next = { date: previous.date, batch: crypto.randomUUID() };
    await c.query('update settings set order_batch=$1 where id=1', [next.batch]);
    return { previous, ...next };
  }, true);
  await logAction(req.user, 'orders.purgeToday', { ...result, archived: true }, req);
  res.json({ ok: true, ...result });
}));

// Reports（僅 admin）
app.get('/api/reports/aggregate', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const context = await orderContext();
  const rows = await q(
    `select name, sum(qty)::float8 as "totalQty", sum(unit_price::bigint*qty)::float8 as "totalMoney"
     from order_items oi
     join orders o on oi.order_id=o.id
     where o.order_date=$1 and o.order_batch=$2
     group by name
     order by "totalMoney" desc, name asc`, [context.date, context.batch]
  );
  const total = rows.reduce((s, r) => s + (r.totalMoney || 0), 0);
  res.json({ items: rows, classTotal: total });
}));
app.get('/api/reports/missing', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const context = await orderContext();
  const rows = await q('select seat, submitted from orders where order_date=$1 and order_batch=$2', [context.date, context.batch]);
  const submittedSet = new Set(rows.filter(r => r.submitted).map(r => r.seat));
  const missing = (await getSeats()).filter(seat => !submittedSet.has(seat));
  res.json({ missing });
}));
// 未付款清單只計入目前日期／批次。
app.get('/api/reports/unpaid', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const context = await orderContext();
  const rows = await q(
    `select o.seat, oi.name, oi.unit_price, oi.qty
       from orders o
       left join order_items oi on oi.order_id=o.id
      where o.paid=false and o.submitted=true and o.order_date=$1 and o.order_batch=$2
      order by o.seat asc, oi.id asc`, [context.date, context.batch]
  );
  const map = new Map();
  for (const row of rows) {
    const seat = Number(row.seat);
    if (!map.has(seat)) {
      map.set(seat, { seat, subtotal: 0, items: [] });
    }
    if (row.name) {
      const item = {
        name: row.name,
        unitPrice: Number(row.unit_price),
        qty: Number(row.qty),
      };
      const entry = map.get(seat);
      entry.items.push(item);
      entry.subtotal += item.unitPrice * item.qty;
    }
  }
  const list = Array.from(map.values()).map(entry => ({
    seat: entry.seat,
    subtotal: entry.subtotal,
    items: entry.items,
  }));
  res.json({ list });
}));

/* =========================
   預訂設定 / 預訂資料 API
   ========================= */
app.get('/api/settings/preorder', auth(), asyncRoute(async (req, res) => {
  const s = await one('select enabled, dates from preorder_settings where id=1');
  res.json({ enabled: !!s?.enabled, dates: s?.dates || [] });
}));
app.put('/api/settings/preorder', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  const enabled = booleanField(body, 'enabled');
  if (!Array.isArray(body.dates) || body.dates.length > 366 || body.dates.some(d => !validDate(d))) throw badRequest('請提供有效的預訂日期，最多 366 日');
  const dates = [...new Set(body.dates)].sort();
  await authorizedTx(req, c => c.query('update preorder_settings set enabled=$1, dates=$2 where id=1', [enabled, dates]), true);
  await logAction(req.user, 'settings.preorder', { enabled, dates }, req);
  res.json({ ok: true });
}));

const toDateOrNull = validDate;

async function ensurePreorder(date, seat, client = null) {
  const d = toDateOrNull(date);
  if (!d) throw new Error('bad date');
  const execOne = client ? (sql, params) => t_one(client, sql, params) : (sql, params) => one(sql, params);
  const o = await execOne(
    `insert into preorders(d, seat, submitted, internal_only, paid, created_at, updated_at)
     values ($1,$2,false,false,false,now(),now())
     on conflict (d, seat) do update set seat=excluded.seat returning *`, [d, seat]
  );
  return o;
}
function canAccessPreSeat(user, seat){ return userCanAccessSeat(user, seat); }
async function checkPreUserAllowed(user, date, client) {
  if (user.role === 'admin') return true;
  const s = await t_one(client, 'select enabled, dates from preorder_settings where id=1 for share');
  if (!s || !s.enabled) return false;
  return (s.dates || []).includes(date);
}

app.get('/api/preorders/:date/unpaid', auth(), requireAdmin, asyncRoute(async (req, res)=>{
  const date = toDateOrNull(req.params.date);
  if (!date) return res.status(400).json({ message:'bad date' });
  const rows = await q(
    `select p.seat, pi.name, pi.unit_price, pi.qty
       from preorders p
       left join preorder_items pi on pi.preorder_id=p.id
      where p.d=$1 and p.paid=false and p.submitted=true
      order by p.seat asc, pi.id asc`,
    [date]
  );
  const map = new Map();
  for (const row of rows) {
    const seat = Number(row.seat);
    if (!map.has(seat)) {
      map.set(seat, { seat, subtotal: 0, items: [] });
    }
    if (row.name) {
      const item = {
        name: row.name,
        unitPrice: Number(row.unit_price),
        qty: Number(row.qty),
      };
      const entry = map.get(seat);
      entry.items.push(item);
      entry.subtotal += item.unitPrice * item.qty;
    }
  }
  const list = Array.from(map.values()).map(entry => ({
    seat: entry.seat,
    subtotal: entry.subtotal,
    items: entry.items,
  }));
  res.json({ list });
}));

app.get('/api/preorders/:date/:seat', auth(), asyncRoute(async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
  const date = toDateOrNull(req.params.date);
  if (!date) return res.status(400).json({ message:'bad date' });
  if (!canAccessPreSeat(req.user, seat)) return res.status(403).json({ message:'forbidden' });

  const rows = await q(`select o.*, i.id as line_id, i.name as line_name, i.unit_price as line_price, i.qty as line_qty
    from preorders o left join preorder_items i on i.preorder_id=o.id where o.d=$1 and o.seat=$2 order by i.id`, [date, seat]);
  const record = joinedOrders(rows).get(seat);
  res.json(orderJSON(record?.order, record?.items || [], seat, { date }));
}));
app.put('/api/preorders/:date/:seat', auth(), asyncRoute(async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
  const date = toDateOrNull(req.params.date);
  if (!date) return res.status(400).json({ message:'bad date' });
  if (!canAccessPreSeat(req.user, seat)) return res.status(403).json({ message:'forbidden' });

  const body = getBody(req);
  const finalItems = orderItems(body);
  const rawItems = body.items;
  const internalOnly = booleanField(body, 'internalOnly');
  await authorizedTx(req, async (c, actor)=>{
    if (!canAccessPreSeat(actor, seat)) throw Object.assign(new Error('forbidden'), { status: 403 });
    await c.query('select pg_advisory_xact_lock(7202, $1::integer)', [seat]);
    const existing = await t_one(c, 'select * from preorders where d=$1 and seat=$2 for update', [date, seat]);
    assertReference(body, existing, { date }, false);
    if (!await checkPreUserAllowed(actor, date, c)) throw Object.assign(new Error('preorder not allowed for this date'), { status: 403 });
    const o = await ensurePreorder(date, seat, c);
    const previous = await t_q(c, 'select name, unit_price, qty from preorder_items where preorder_id=$1', [o.id]);
    await validateManualLock(actor, c, finalItems, previous.map(row => ({ name: row.name, unitPrice: row.unit_price, qty: row.qty })));
    const flag = internalOnly;
    const submitted = finalItems.length > 0;

    const changed = contentChanged(o, previous, finalItems, internalOnly);
    await c.query('update preorders set submitted=$1, internal_only=$2, paid=case when $4 then false else paid end, revision=revision+1, payment_updated_at=case when $4 then now() else payment_updated_at end, payment_updated_by=case when $4 then $5 else payment_updated_by end, updated_at=now() where id=$3', [
      submitted, flag, o.id, changed, req.user.uid
    ]);
    await c.query('delete from preorder_items where preorder_id=$1', [o.id]);
    for (const it of finalItems) {
      await c.query(
        'insert into preorder_items(preorder_id, name, unit_price, qty) values ($1,$2,$3,$4)',
        [o.id, String(it.name), Number(it.unitPrice), Number(it.qty)]
      );
    }
  });

  await logAction(req.user, 'preorder.update', { date, seat, internalOnly: !!internalOnly, itemsCount: rawItems.length }, req);
  res.json({ ok: true });
}));
app.put('/api/preorders/:date/:seat/paid', auth(), requireAdmin, asyncRoute(async (req, res)=>{
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
  const date = toDateOrNull(req.params.date);
  if (!date) return res.status(400).json({ message:'bad date' });
  const body = getBody(req);
  const order = await authorizedTx(req, async c => {
    const o = await t_one(c, 'select * from preorders where d=$1 and seat=$2 for update', [date, seat]);
    const items = o ? await t_q(c, 'select * from preorder_items where preorder_id=$1 order by id', [o.id]) : [];
    return updatePayment(c, { order: o, items, context: { date }, body, userId: req.user.uid, preorder: true });
  }, true);
  await logAction(req.user, 'preorder.paid', { date, seat, paid: order.paid, orderId: order.orderId, version: order.version }, req);
  res.json({ ok:true, order });
}));


/* =========================
   Users
   ========================= */
app.post('/api/users', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  const username = normalizeUsernameInput(body.username);
  const password = normalizePasswordInput(body.password);
  const role = body.role === undefined ? 'user' : body.role;
  if (!['admin', 'user'].includes(role)) throw badRequest('角色必須為一般使用者或管理員');
  if (!username || username.length > USERNAME_MAX_LEN) throw badRequest('帳號需為 1～64 個字元');
  // Reject numeric aliases such as 01, 1e0 and 0x1: they must not create a
  // second account capable of accessing another seat's orders.
  if (Number.isFinite(Number(username)) && seatNumber(username) === null)
    throw badRequest('座號帳號請使用 1～2147483647 的整數，不可含前導零或其他數字格式');
  const error = passwordError(password, role);
  if (error) throw badRequest(error);
  const hash = await bcrypt.hash(password, 10);
  const row = await mutateUsers(req, c => t_one(c,
    `insert into users(username, password_hash, role, status, created_at, updated_at)
     values ($1,$2,$3,'active',now(),now())
     returning id, username, role, status`,
    [username, hash, role]
  ));
  if (!row) return res.status(409).json({ message: '此帳號已存在，請在使用者清單中查詢' });
  await logAction(req.user, 'user.create', { id: row.id, username, role }, req);
  res.json(row);
}));
app.get('/api/users', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const qkw = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';
  const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const page = req.query.page === undefined ? 1 : req.query.page;
  const pageSize = req.query.pageSize === undefined ? 20 : req.query.pageSize;
  const afterId = req.query.afterId;
  if (!integer(page, 1, 1_000_000) || !integer(pageSize, 5, 100)) throw badRequest('無效的分頁參數');
  if (afterId !== undefined && !integer(afterId, 0, 2_147_483_647)) throw badRequest('無效的清單游標');

  const clauses = [];
  const params = [];
  if (qkw) { params.push(`%${qkw}%`); clauses.push(`username ilike $${params.length}`); }
  if (role === 'admin' || role === 'user') { params.push(role); clauses.push(`role=$${params.length}`); }
  if (status === 'active' || status === 'disabled') { params.push(status); clauses.push(`status=$${params.length}`); }
  let where = clauses.length ? 'where ' + clauses.join(' and ') : '';

  const totalRow = await one(`select count(*)::int as c from users ${where}`, params);
  if (afterId !== undefined) {
    params.push(Number(afterId)); clauses.push(`id>$${params.length}`);
    where = 'where ' + clauses.join(' and ');
  }
  params.push(Number(pageSize), afterId === undefined ? (Number(page) - 1) * Number(pageSize) : 0);
  const rows = await q(
    `select id, username, role, status, created_at, updated_at, last_login_at
     from users
     ${where}
     order by id asc
     limit $${params.length - 1} offset $${params.length}`,
    params
  );
  res.json({ users: rows, total: totalRow.c, page, pageSize });
}));
app.put('/api/users/:id/password', auth(), passwordChangeLimiter, asyncRoute(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return res.status(400).json({ message: 'bad user id' });

  const body = getBody(req);
  const oldPassword = normalizePasswordInput(body.oldPassword);
  const newPassword = normalizePasswordInput(body.newPassword);
  const isAdmin = req.user && req.user.role === 'admin';
  const isSelf = req.user && req.user.uid === targetId;
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'forbidden' });

  const u = await one('select * from users where id=$1', [targetId]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  const error = passwordError(newPassword, u.role);
  if (error) throw badRequest(error);

  if (!isAdmin) {
    if (!oldPassword) return res.status(400).json({ message: 'oldPassword required' });
    const ok = await bcrypt.compare(oldPassword, u.password_hash);
    if (!ok) return res.status(400).json({ message: 'oldPassword incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await mutateUsers(req, async (c, actor) => {
    if (actor.role !== 'admin' && actor.id !== targetId) throw Object.assign(new Error('forbidden'), { status: 403 });
    const current = await t_one(c, 'select * from users where id=$1 for update', [targetId]);
    if (!current) throw Object.assign(new Error('user not found'), { status: 404 });
    if (current.password_hash !== u.password_hash || current.auth_version !== u.auth_version || current.role !== u.role || current.status !== u.status)
      throw Object.assign(new Error('帳號狀態或密碼已變更，請重新載入後再操作'), { status: 409 });
    const policyError = passwordError(newPassword, current.role);
    if (policyError) throw badRequest(policyError);
    await c.query('update users set password_hash=$1, auth_version=auth_version+1, updated_at=now() where id=$2', [hash, targetId]);
  }, false);
  await logAction(req.user, 'user.changePassword', { targetId, by: 'admin?' + isAdmin }, req);
  res.json({ ok: true });
}));
app.patch('/api/users/:id/status', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'bad user id' });
  const body = getBody(req);
  const status = body.status;
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ message: 'bad status' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的狀態' });

  await mutateUsers(req, async c => {
    const u = await t_one(c, 'select * from users where id=$1 for update', [id]);
    if (!u) throw Object.assign(new Error('user not found'), { status: 404 });
    if (u.role === 'admin' && u.status === 'active' && status === 'disabled') {
      const count = await t_one(c, "select count(*)::int as c from users where role='admin' and status='active'");
      if (count.c <= 1) throw badRequest('系統至少需要一位使用中的管理員');
    }
    await c.query('update users set status=$1, auth_version=auth_version+1, updated_at=now() where id=$2', [status, id]);
  });
  await logAction(req.user, 'user.status', { targetId: id, status }, req);
  res.json({ ok: true });
}));
app.patch('/api/users/:id/role', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'bad user id' });
  const body = getBody(req);
  const role = body.role;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ message: 'bad role' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的角色' });

  const u = await mutateUsers(req, async c => {
    const current = await t_one(c, 'select * from users where id=$1 for update', [id]);
    if (!current) throw Object.assign(new Error('user not found'), { status: 404 });
    if (current.role === 'admin' && current.status === 'active' && role === 'user') {
      const count = await t_one(c, "select count(*)::int as c from users where role='admin' and status='active'");
      if (count.c <= 1) throw badRequest('系統至少需要一位使用中的管理員');
    }
    await c.query('update users set role=$1, auth_version=auth_version+1, updated_at=now() where id=$2', [role, id]);
    return current;
  });
  await logAction(req.user, 'user.role', { targetId: id, from: u.role, to: role }, req);
  res.json({ ok: true });
}));
app.delete('/api/users/bulk-delete', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const body = getBody(req);
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  if (rawIds.length > 100) throw badRequest('一次最多刪除 100 位使用者');
  if (rawIds.some(id => !integer(id, 1, 2_147_483_647))) throw badRequest('bad user id in list');
  const ids = [...new Set(rawIds.map(Number))];
  if (!ids.length) return res.status(400).json({ message: 'ids required' });
  if (ids.some(id => !Number.isInteger(id))) return res.status(400).json({ message: 'bad user id in list' });
  if (ids.includes(req.user.uid)) return res.status(400).json({ message: '包含自己，無法刪除' });

  const deleted = await mutateUsers(req, async c => {
    const admins = await t_q(c, "select id from users where role='admin' and status='active'");
    if (!admins.some(admin => !ids.includes(admin.id))) throw badRequest('不能刪除所有使用中的管理員');
    const placeholders = ids.map((_id, index) => `$${index + 1}`).join(',');
    const result = await c.query(`delete from users where id in (${placeholders})`, ids);
    return result.rowCount;
  });
  await logAction(req.user, 'user.bulkDelete', { ids }, req);
  res.json({ ok: true, deleted });
}));

app.delete('/api/users/:id', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return res.status(400).json({ message: 'bad user id' });
  if (req.user && req.user.uid === targetId) return res.status(400).json({ message: '無法刪除自己' });

  const u = await mutateUsers(req, async c => {
    const current = await t_one(c, 'select * from users where id=$1 for update', [targetId]);
    if (!current) throw Object.assign(new Error('user not found'), { status: 404 });
    if (current.role === 'admin' && current.status === 'active') {
      const count = await t_one(c, "select count(*)::int as c from users where role='admin' and status='active'");
      if (count.c <= 1) throw badRequest('系統至少需要一位使用中的管理員，無法刪除');
    }
    await c.query('delete from users where id=$1', [targetId]);
    return current;
  });
  await logAction(req.user, 'user.delete', { targetId, username: u.username, role: u.role }, req);
  res.json({ ok: true });
}));


// Logs
app.get('/api/logs', auth(), requireAdmin, asyncRoute(async (req, res) => {
  const rows = await q('select * from audit_logs order by id desc limit 500');
  res.json({ logs: rows });
}));

// Serve the existing UI with real HTTP CSP / anti-framing headers. Only these
// public assets are reachable; never expose the repository or server directory.
const UI_DIR = path.join(__dirname, 'public');
const uiSecurity = helmet({
  frameguard: { action: 'deny' },
  contentSecurityPolicy: { useDefaults: false, directives: {
    defaultSrc: ["'none'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    connectSrc: ["'self'", PUBLIC_BASE_URL], imgSrc: ["'self'", PUBLIC_BASE_URL],
    baseUri: ["'none'"], objectSrc: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"],
  } },
  crossOriginEmbedderPolicy: false,
});
for (const [route, file] of [['/', 'index.html'], ['/index.html', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css']]) {
  app.get(route, uiSecurity, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(UI_DIR, file));
  });
}

app.use('/api', (_req, res) => res.status(404).json({ message: '找不到此 API' }));
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ message: '此來源不允許存取' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON 格式不正確' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: '請求內容過大' });
  if (err.code === '23505') return res.status(409).json({ message: err.constraint === 'users_username_key' ? '此帳號已存在，請在使用者清單中查詢' : '資料已存在，請重新載入後再試' });
  if (err.code === '23503') return res.status(409).json({ message: '資料仍被使用或參照不存在，請重新載入後再試' });
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('Request failed:', err.code || 'UNKNOWN');
  res.status(status).json({ message: status === 500 ? '系統暫時無法處理，請稍後再試' : err.message });
});

/* =========================
   Start
   ========================= */
async function start() {
  try {
    await one('select now()');          // test DB
    await ensureUsersSecuritySchema();
    await ensureAuditLogsSchema();      // 避免 logAction 因表不存在而失敗
    await ensureSettingsSchema();
    await ensureOrdersExtraColumns();
    await ensureOrderItemsExtraColumns();
    await ensureMenuExtraColumns();
    await ensurePreorderSchema();
    // The versioned, non-destructive migration must be applied before release.
    await q('select order_date, order_batch, revision, payment_updated_at, payment_updated_by from orders limit 0');
    await q('select revision, payment_updated_at, payment_updated_by from preorders limit 0');
    if (durableLimits) {
      await q('select bucket, hits, expires_at from lunch_security.rate_limits limit 0');
      const prune = () => pruneRateLimits((sql, params) => pool.query(sql, params))
        .catch(() => console.warn('[security] rate_counter_cleanup_failed'));
      await prune();
      setInterval(prune, 60_000).unref();
    }
    await seed();
    console.log('[tz check]', zonedNowInfo());
    return app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Startup error:', e.code || 'UNKNOWN');
    process.exit(1);
  }

}

module.exports = { app, pool, start };
if (require.main === module) {
  start().then(server => {
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      const timeout = setTimeout(() => process.exit(1), 10_000).unref();
      server.close(() => pool.end().then(() => { clearTimeout(timeout); process.exit(0); }));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });
}
