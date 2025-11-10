require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL;

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

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '';
    const randomPart = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    const name = `${Date.now()}-${randomPart}${safeExt}`;
    cb(null, name);
  },
});

const imageUpload = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const type = (file.mimetype || '').toLowerCase();
    if (allowedImageTypes.has(type)) return cb(null, true);
    cb(new Error('僅接受 PNG/JPG/GIF/WebP 圖片')); // handled in route
  },
}).single('image');

/* =========================
   Security / Middleware
   ========================= */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

function enforcePlainObjectBody(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (req.body === undefined || req.body === null) return next();
  if (typeof req.body === 'object' && !Array.isArray(req.body)) return next();
  return res.status(400).json({ message: 'invalid payload type' });
}
app.use(enforcePlainObjectBody);

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use(globalLimiter);

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

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'too many login attempts, please try again shortly' },
});

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
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// logging
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' }) }));
app.use(morgan('dev'));

app.use('/uploads', express.static(UPLOAD_DIR, {
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
let pgUrl;
try {
  pgUrl = new URL(DATABASE_URL);
  if (pgUrl.searchParams.has('sslmode')) pgUrl.searchParams.delete('sslmode');
} catch (e) {
  console.error('Bad DATABASE_URL:', e);
  process.exit(1);
}
const pool = new Pool({
  connectionString: pgUrl.toString(),
  ssl: { require: true, rejectUnauthorized: false },
  keepAlive: true,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

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
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
}
async function t_one(c, sql, params = []) { const { rows } = await c.query(sql, params); return rows[0] || null; }
async function t_q(c, sql, params = []) { const { rows } = await c.query(sql, params); return rows; }

/* =========================
   Schema 升級（不破壞既有資料）
   ========================= */
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
      add column if not exists open_end   text default '12:00'
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
      console.warn(`[seed] Admin default password (auto-generated): ${adminPass}`);
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
    console.log(`[seed] seat users 1~36 ready (default pass = ${seatPass})`);
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
  return jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return required ? res.status(401).json({ message: 'no token' }) : next();
    try {
      req.user = jwt.verify(t, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ message: 'invalid token' });
    }
  };
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' });
  next();
}
function getPublicBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
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
  await q(
    `insert into audit_logs(user_id, action, details, ip, ua, ts)
     values ($1,$2,$3,$4,$5,now())`,
    [user?.uid || null, action, details ? JSON.stringify(details) : null, req.ip, req.headers['user-agent'] || '']
  );
}

// helpers
async function ensureOrder(seat) {
  let o = await one('select * from orders where seat=$1', [seat]);
  if (!o) {
    o = await one(
      `insert into orders(seat, submitted, internal_only, paid, created_at, updated_at)
       values ($1,false,false,false,now(),now())
       returning *`,
      [seat]
    );
  }
  return o;
}
function userCanAccessSeat(user, seat) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const n = Number(user.username);
  return Number.isInteger(n) && n === seat;
}

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

async function isOpenNow() {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  if (!s) return true; // 沒設定就放行
  const openDays = (s.open_days || []).map(Number); // 0(日)~6(六)
  const { hhmm, day } = zonedNowInfo();
  const start = s.open_start || '00:00';
  const end   = s.open_end   || '23:59';
  return openDays.includes(day) && start <= hhmm && hhmm <= end;
}

/* =========================
   Routes
   ========================= */
app.post('/api/uploads/images', auth(), requireAdmin, (req, res) => {
  imageUpload(req, res, async (err) => {
    if (err) {
      const maxMb = Math.round((MAX_UPLOAD_BYTES / (1024 * 1024)) * 10) / 10;
      let message = err.message || '上傳失敗';
      if (err.code === 'LIMIT_FILE_SIZE') message = `檔案過大，限制 ${maxMb} MB`;
      return res.status(400).json({ message });
    }
    if (!req.file) return res.status(400).json({ message: '請選擇圖片檔' });
    const fileName = req.file.filename;
    try {
      const url = `${getPublicBaseUrl(req)}/uploads/${encodeURIComponent(fileName)}`;
      await logAction(req.user, 'upload.image', { filename: fileName, size: req.file.size }, req);
      res.json({ url, filename: fileName });
    } catch (e) {
      console.error('Failed to log upload', e);
      fs.unlink(path.join(UPLOAD_DIR, fileName), () => {});
      res.status(500).json({ message: '上傳失敗' });
    }
  });
});

// Auth
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const body = getBody(req);
  const username = normalizeUsernameInput(body.username);
  const password = normalizePasswordInput(body.password);
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });
  if (username.length > USERNAME_MAX_LEN || password.length > PASSWORD_MAX_LEN) {
    return res.status(400).json({ message: 'username/password too long' });
  }

  const u = await one('select * from users where username=$1', [username]);
  if (!u) return res.status(401).json({ message: 'invalid credentials' });
  if (u.status !== 'active') return res.status(403).json({ message: 'account disabled' });

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ message: 'invalid credentials' });

  await q('update users set last_login_at=now(), updated_at=now() where id=$1', [u.id]);

  const token = sign(u);
  await logAction({ uid: u.id }, 'login', { username }, req);
  // 統一回傳 shape（id/username/role）
  res.json({ token, user: { id: u.id, username: u.username, role: u.role } });
});

// ✅ 統一 /auth/me 回傳 shape（修正原本只有 uid 導致前端 id 為 undefined）
app.get('/api/auth/me', auth(), async (req, res) => {
  const u = req.user;
  res.json({ user: { id: u.uid, username: u.username, role: u.role } });
});

// Settings（admin）
app.get('/api/settings/open-window', auth(), requireAdmin, async (req, res) => {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  res.json({
    openDays: s?.open_days || ['1','2','3','4','5'],
    openStart: s?.open_start || '07:00',
    openEnd: s?.open_end || '12:00',
  });
});
app.put('/api/settings/open-window', auth(), requireAdmin, async (req, res) => {
  const body = getBody(req);
  const days = normalizeOpenDays(body.openDays);
  const start = normalizeTimeString(body.openStart, '07:00');
  const end = normalizeTimeString(body.openEnd, '12:00');
  await q('update settings set open_days=$1, open_start=$2, open_end=$3 where id=1', [days, start, end]);
  await logAction(req.user, 'settings.openWindow', { openDays: days, openStart: start, openEnd: end }, req);
  res.json({ ok: true });
});

// 公開：是否在開放點餐時段
app.get('/api/open-status', async (req, res) => {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  const info = zonedNowInfo();
  const openDays = (s?.open_days || []).map(Number);
  const start = s?.open_start || '07:00';
  const end   = s?.open_end   || '12:00';
  const open = openDays.includes(info.day) && start <= info.hhmm && info.hhmm <= end;
  res.json({ open, openDays: openDays.map(String), openStart: start, openEnd: end, nowISO: info.nowISO, nowLocal: info.nowLocal, tz: info.tz });
});

// Menus
app.get('/api/menus', auth(false), async (req, res) => {
  const menus = await q('select * from menus order by id asc');
  const items = await q('select * from menu_items order by menu_id asc, code asc');
  const setting = await one('select active_menu_id from settings where id=1');
  const grouped = menus.map(m => {
    const meta = buildMenuImageMeta(req, m);
    return {
      id: m.id,
      name: m.name,
      note: m.note || '',
      imageUrl: meta.imageUrl,
      imageFilename: meta.imageFilename,
      items: items
        .filter(x => x.menu_id === m.id)
        .map(x => ({
          id: x.id,
          code: x.code,
          name: x.name,
          price: x.price,
        }))
    };
  });
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
});
app.post('/api/menus', auth(), requireAdmin, async (req, res) => {
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
  const row = await one(
    'insert into menus(name, note, image_path, image_url) values ($1,$2,$3,null) returning id, name, note, image_path, image_url',
    [name, note, imageFilename]
  );
  const meta = buildMenuImageMeta(req, row);
  await logAction(req.user, 'menu.create', { id: row.id, name, note, imageFilename }, req);
  res.json({ id: row.id, name: row.name, note: row.note || '', imageUrl: meta.imageUrl, imageFilename: meta.imageFilename, items: [] });
});
app.put('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
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
  await q(`update menus set ${setParts.join(', ')} where id=$${params.length}`, params);
  const details = { id, name, note };
  if (hasImageField) details.imageFilename = imageFilename;
  await logAction(req.user, 'menu.update', details, req);
  res.json({ ok: true });
});
app.delete('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await tx(async (c) => {
    await c.query('delete from menu_items where menu_id=$1', [id]);
    await c.query('delete from menus where id=$1', [id]);
    const s = await t_one(c, 'select active_menu_id from settings where id=1');
    if (s?.active_menu_id === id) await c.query('update settings set active_menu_id=null where id=1');
  });
  await logAction(req.user, 'menu.delete', { id }, req);
  res.json({ ok: true });
});
app.post('/api/menus/:id/items', auth(), requireAdmin, async (req, res) => {
  const menuId = Number(req.params.id);
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const price = Number(body.price);
  if (!name || name.length > 128 || Number.isNaN(price)) return res.status(400).json({ message: 'name/price required' });
  const max = await one('select coalesce(max(code),0) c from menu_items where menu_id=$1', [menuId]);
  const row = await one(
    'insert into menu_items(menu_id, code, name, price) values ($1,$2,$3,$4) returning id, code, name, price',
    [menuId, Number(max?.c || 0) + 1, name, price]
  );
  await logAction(req.user, 'menu.item.create', { menuId, itemId: row.id, name, price }, req);
  res.json({
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
  });
});
app.put('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const body = getBody(req);
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const price = Number(body.price);
  if (Number.isNaN(price)) return res.status(400).json({ message: 'price required' });
  await q('update menu_items set name=$1, price=$2 where id=$3', [name ?? null, price, itemId]);
  await logAction(req.user, 'menu.item.update', { itemId, name, price }, req);
  res.json({ ok: true });
});
app.delete('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const row = await one('select menu_id from menu_items where id=$1', [itemId]);
  if (row) {
    await tx(async (c) => {
      await c.query('delete from menu_items where id=$1', [itemId]);
      const items = await t_q(c, 'select id from menu_items where menu_id=$1 order by code asc, id asc', [row.menu_id]);
      for (let i = 0; i < items.length; i++) {
        await c.query('update menu_items set code=$1 where id=$2', [i + 1, items[i].id]);
      }
    });
  }
  await logAction(req.user, 'menu.item.delete', { itemId }, req);
  res.json({ ok: true });
});
app.put('/api/settings/active-menu', auth(), requireAdmin, async (req, res) => {
  const body = getBody(req);
  const menuId = body.menuId == null ? null : Number(body.menuId);
  await q('update settings set active_menu_id=$1 where id=1', [menuId ?? null]);
  await logAction(req.user, 'settings.activeMenu', { menuId }, req);
  res.json({ ok: true });
});

// Orders
app.get('/api/orders/:seat', auth(), async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });
  const o = await ensureOrder(seat);
  const items = await q('select * from order_items where order_id=$1 order by id asc', [o.id]);
  res.json({
    seat,
    submitted: !!o.submitted,
    internalOnly: !!o.internal_only,
    paid: !!o.paid,
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      unitPrice: i.unit_price,
      qty: i.qty,
      updatedAt: i.updated_at ? new Date(i.updated_at).toISOString() : null,
    })),
  });
});
app.put('/api/orders/:seat', auth(), async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });

  if (req.user.role !== 'admin' && !(await isOpenNow())) {
    return res.status(403).json({ message: 'not in open window' });
  }
  const body = getBody(req);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const internalOnly = !!body.internalOnly;
  await tx(async (c) => {
    const o = await t_one(c, 'select * from orders where seat=$1', [seat]) || await t_one(
      c,
      `insert into orders(seat, submitted, internal_only, paid, created_at, updated_at)
       values ($1,false,false,false,now(),now()) returning *`,
      [seat]
    );
    const sanitizedItems = rawItems
      .map(it => {
        const name = typeof it.name === 'string' ? it.name.trim().slice(0, 100) : '';
        const price = Number(it.unitPrice);
        const qtyRaw = Number(it.qty);
        const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.floor(qtyRaw)) : NaN;
        return {
          name,
          unitPrice: Number.isFinite(price) ? Math.round(price) : NaN,
          qty,
        };
      })
      .filter(it => it.name && Number.isFinite(it.unitPrice) && Number.isFinite(it.qty));
    let finalItems = sanitizedItems;
    let flag = internalOnly;
    if (internalOnly) finalItems = [{ name: '內訂', unitPrice: 0, qty: 1 }];
    const submitted = finalItems.length > 0;

    await c.query('update orders set submitted=$1, internal_only=$2, updated_at=now() where id=$3', [
      submitted, flag, o.id,
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
});
// 訂單「已付款」切換（admin）
app.put('/api/orders/:seat/paid', auth(), requireAdmin, async (req, res) => {
  const seat = Number(req.params.seat);
  if (!Number.isInteger(seat)) return res.status(400).json({ message: 'bad seat' });
  const body = getBody(req);
  const paid = !!body.paid;
  const o = await ensureOrder(seat);
  await q('update orders set paid=$1, updated_at=now() where id=$2', [paid, o.id]);
  await logAction(req.user, 'order.paid', { seat, paid }, req);
  res.json({ ok: true });
});
app.delete('/api/orders/today', auth(), requireAdmin, async (req, res) => {
  let deletedItems = 0;
  let resetOrders = 0;
  await tx(async (c) => {
    const del = await c.query('delete from order_items');
    deletedItems = del?.rowCount || 0;
    const upd = await c.query('update orders set submitted=false, internal_only=false, paid=false, updated_at=now()');
    resetOrders = upd?.rowCount || 0;
  });
  await logAction(req.user, 'orders.purgeToday', { deletedItems, resetOrders }, req);
  res.json({ ok: true, deletedItems, resetOrders });
});

// Reports（僅 admin）
app.get('/api/reports/aggregate', auth(), requireAdmin, async (req, res) => {
  const rows = await q(
    `select name, sum(qty)::int as "totalQty", sum(unit_price*qty)::int as "totalMoney"
     from order_items oi
     join orders o on oi.order_id=o.id
     group by name
     order by "totalMoney" desc, name asc`
  );
  const total = rows.reduce((s, r) => s + (r.totalMoney || 0), 0);
  res.json({ items: rows, classTotal: total });
});
app.get('/api/reports/missing', auth(), requireAdmin, async (req, res) => {
  const rows = await q('select seat, submitted from orders');
  const submittedSet = new Set(rows.filter(r => r.submitted).map(r => r.seat));
  const missing = [];
  for (let s = 1; s <= 36; s++) if (!submittedSet.has(s)) missing.push(s);
  res.json({ missing });
});
// 未付款清單（目前 orders 不分日期）
app.get('/api/reports/unpaid', auth(), requireAdmin, async (req, res) => {
  const rows = await q(
    `select o.seat, oi.name, oi.unit_price, oi.qty
       from orders o
       left join order_items oi on oi.order_id=o.id
      where o.paid=false and o.submitted=true
      order by o.seat asc, oi.id asc`
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
});

/* =========================
   預訂設定 / 預訂資料 API
   ========================= */
app.get('/api/settings/preorder', auth(), async (req, res) => {
  const s = await one('select enabled, dates from preorder_settings where id=1');
  res.json({ enabled: !!s?.enabled, dates: s?.dates || [] });
});
app.put('/api/settings/preorder', auth(), requireAdmin, async (req, res) => {
  const body = getBody(req);
  const enabled = !!body.enabled;
  const dates = Array.isArray(body.dates) ? body.dates.filter(d => typeof d === 'string') : [];
  await q('update preorder_settings set enabled=$1, dates=$2 where id=1', [enabled, dates]);
  await logAction(req.user, 'settings.preorder', { enabled, dates }, req);
  res.json({ ok: true });
});

function toDateOrNull(s){
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`; // 存 DB 用原字串，避免時區偏移
}
async function ensurePreorder(date, seat, client = null) {
  const d = toDateOrNull(date);
  if (!d) throw new Error('bad date');
  const execOne = client ? (sql, params) => t_one(client, sql, params) : (sql, params) => one(sql, params);
  const execQuery = client ? (sql, params) => client.query(sql, params) : (sql, params) => pool.query(sql, params);
  let o = await execOne('select * from preorders where d=$1 and seat=$2', [d, seat]);
  if (!o) {
    const inserted = await execQuery(
      `insert into preorders(d, seat, submitted, internal_only, paid, created_at, updated_at)
       values ($1,$2,false,false,false,now(),now())
       returning *`,
      [d, seat]
    );
    o = inserted.rows[0];
  }
  return o;
}
function canAccessPreSeat(user, seat){ return userCanAccessSeat(user, seat); }
async function checkPreUserAllowed(user, date) {
  if (user.role === 'admin') return true;
  const s = await one('select enabled, dates from preorder_settings where id=1');
  if (!s || !s.enabled) return false;
  return (s.dates || []).includes(date);
}

app.get('/api/preorders/:date/:seat', auth(), async (req, res) => {
  try{
    const seat = Number(req.params.seat);
    if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    if (!canAccessPreSeat(req.user, seat)) return res.status(403).json({ message:'forbidden' });

    const o = await ensurePreorder(date, seat);
    const items = await q('select * from preorder_items where preorder_id=$1 order by id asc', [o.id]);
    res.json({
      date, seat,
      submitted: !!o.submitted,
      internalOnly: !!o.internal_only,
      paid: !!o.paid,
      items: items.map(i => ({ id:i.id, name:i.name, unitPrice:i.unit_price, qty:i.qty }))
    });
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});
app.put('/api/preorders/:date/:seat', auth(), async (req, res) => {
  try{
    const seat = Number(req.params.seat);
    if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    if (!canAccessPreSeat(req.user, seat)) return res.status(403).json({ message:'forbidden' });

    if (req.user.role !== 'admin') {
      const allowed = await checkPreUserAllowed(req.user, date);
      if (!allowed) return res.status(403).json({ message:'preorder not allowed for this date' });
    }

    const body = getBody(req);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const internalOnly = !!body.internalOnly;
    await tx(async (c)=>{
      const o = await ensurePreorder(date, seat, c);
      const sanitizedItems = rawItems
        .map(it => {
          const name = typeof it.name === 'string' ? it.name.trim().slice(0, 100) : '';
          const price = Number(it.unitPrice);
          const qtyRaw = Number(it.qty);
          const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.floor(qtyRaw)) : NaN;
          return {
            name,
            unitPrice: Number.isFinite(price) ? Math.round(price) : NaN,
            qty,
          };
        })
        .filter(it => it.name && Number.isFinite(it.unitPrice) && Number.isFinite(it.qty));
      let finalItems = sanitizedItems;
      let flag = internalOnly;
      if (internalOnly) finalItems = [{ name:'內訂', unitPrice:0, qty:1 }];
      const submitted = finalItems.length > 0;

      await c.query('update preorders set submitted=$1, internal_only=$2, updated_at=now() where id=$3', [
        submitted, flag, o.id
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
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});
app.put('/api/preorders/:date/:seat/paid', auth(), requireAdmin, async (req, res)=>{
  try{
    const seat = Number(req.params.seat);
    if (!Number.isInteger(seat)) return res.status(400).json({ message:'bad seat' });
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    const o = await ensurePreorder(date, seat);
    const body = getBody(req);
    const paid = !!body.paid;
    await q('update preorders set paid=$1, updated_at=now() where id=$2', [paid, o.id]);
    await logAction(req.user, 'preorder.paid', { date, seat, paid }, req);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});
app.get('/api/preorders/:date/unpaid', auth(), requireAdmin, async (req, res)=>{
  try{
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
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});

/* =========================
   Users
   ========================= */
app.post('/api/users', auth(), requireAdmin, async (req, res) => {
  const body = getBody(req);
  const username = normalizeUsernameInput(body.username);
  const password = normalizePasswordInput(body.password);
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!username || username.length > USERNAME_MAX_LEN) return res.status(400).json({ message: 'bad username' });
  if (!password || password.length < 6 || password.length > PASSWORD_MAX_LEN) return res.status(400).json({ message: 'bad password' });
  const exist = await one('select 1 from users where username=$1', [username]);
  if (exist) return res.status(409).json({ message: 'username already exists' });
  const hash = await bcrypt.hash(password, 10);
  const row = await one(
    `insert into users(username, password_hash, role, status, created_at, updated_at)
     values ($1,$2,$3,'active',now(),now())
     returning id, username, role, status`,
    [username, hash, role]
  );
  await logAction(req.user, 'user.create', { id: row.id, username, role }, req);
  res.json(row);
});
app.get('/api/users', auth(), requireAdmin, async (req, res) => {
  const qkw = (req.query.q || '').trim();
  const role = (req.query.role || '').trim();
  const status = (req.query.status || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));

  const clauses = [];
  const params = [];
  if (qkw) { params.push(`%${qkw}%`); clauses.push(`username ilike $${params.length}`); }
  if (role === 'admin' || role === 'user') { params.push(role); clauses.push(`role=$${params.length}`); }
  if (status === 'active' || status === 'disabled') { params.push(status); clauses.push(`status=$${params.length}`); }
  const where = clauses.length ? 'where ' + clauses.join(' and ') : '';

  const totalRow = await one(`select count(*)::int as c from users ${where}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await q(
    `select id, username, role, status, created_at, updated_at, last_login_at
     from users
     ${where}
     order by id asc
     limit $${params.length - 1} offset $${params.length}`,
    params
  );
  res.json({ users: rows, total: totalRow.c, page, pageSize });
});
app.put('/api/users/:id/password', auth(), async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return res.status(400).json({ message: 'bad user id' });

  const body = getBody(req);
  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = normalizePasswordInput(body.newPassword);
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'newPassword too short' });
  if (newPassword.length > PASSWORD_MAX_LEN) return res.status(400).json({ message: 'newPassword too long' });

  const u = await one('select * from users where id=$1', [targetId]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  const isAdmin = req.user && req.user.role === 'admin';
  const isSelf = req.user && req.user.uid === targetId;
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'forbidden' });

  if (!isAdmin) {
    if (!oldPassword) return res.status(400).json({ message: 'oldPassword required' });
    const ok = await bcrypt.compare(oldPassword, u.password_hash);
    if (!ok) return res.status(401).json({ message: 'oldPassword incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await q('update users set password_hash=$1, updated_at=now() where id=$2', [hash, targetId]);
  await logAction(req.user, 'user.changePassword', { targetId, by: 'admin?' + isAdmin }, req);
  res.json({ ok: true });
});
app.patch('/api/users/:id/status', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'bad user id' });
  const body = getBody(req);
  const status = body.status;
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ message: 'bad status' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的狀態' });

  const u = await one('select * from users where id=$1', [id]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  await q('update users set status=$1, updated_at=now() where id=$2', [status, id]);
  await logAction(req.user, 'user.status', { targetId: id, status }, req);
  res.json({ ok: true });
});
app.patch('/api/users/:id/role', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'bad user id' });
  const body = getBody(req);
  const role = body.role;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ message: 'bad role' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的角色' });

  const u = await one('select * from users where id=$1', [id]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  if (u.role === 'admin' && role === 'user') {
    const a = await one(`select count(*)::int as c from users where role='admin'`);
    if (a.c <= 1) return res.status(400).json({ message: '系統至少需要一位管理員' });
  }

  await q('update users set role=$1, updated_at=now() where id=$2', [role, id]);
  await logAction(req.user, 'user.role', { targetId: id, from: u.role, to: role }, req);
  res.json({ ok: true });
});
app.delete('/api/users/:id', auth(), requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return res.status(400).json({ message: 'bad user id' });
  if (req.user && req.user.uid === targetId) return res.status(400).json({ message: '無法刪除自己' });

  const u = await one('select * from users where id=$1', [targetId]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  if (u.role === 'admin') {
    const a = await one(`select count(*)::int as c from users where role='admin'`);
    if (a.c <= 1) return res.status(400).json({ message: '系統至少需要一位管理員，無法刪除' });
  }

  await q('delete from users where id=$1', [targetId]);
  await logAction(req.user, 'user.delete', { targetId, username: u.username, role: u.role }, req);
  res.json({ ok: true });
});
app.delete('/api/users/bulk-delete', auth(), requireAdmin, async (req, res) => {
  const body = getBody(req);
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ message: 'ids required' });
  if (ids.some(id => !Number.isInteger(id))) return res.status(400).json({ message: 'bad user id in list' });
  if (ids.includes(req.user.uid)) return res.status(400).json({ message: '包含自己，無法刪除' });

  const admins = await q(`select id from users where role='admin'`);
  const adminIds = new Set(admins.map(x => x.id));
  const remainingAdmins = [...adminIds].filter(id => !ids.includes(id));
  if (remainingAdmins.length === 0) return res.status(400).json({ message: '不能刪除所有管理員' });

  await tx(async (c) => {
    for (const id of ids) {
      await c.query('delete from users where id=$1', [id]);
    }
  });
  await logAction(req.user, 'user.bulkDelete', { ids }, req);
  res.json({ ok: true, deleted: ids.length });
});

// Logs
app.get('/api/logs', auth(), requireAdmin, async (req, res) => {
  const rows = await q('select * from audit_logs order by id desc limit 500');
  res.json({ logs: rows });
});

// Root
app.get('/', (req, res) => {
  res.type('text').send('Lunch Orders API is running.\nTry GET /api/menus');
});

/* =========================
   Start
   ========================= */
(async function start() {
  try {
    await one('select now()');          // test DB
    await ensureAuditLogsSchema();      // 避免 logAction 因表不存在而失敗
    await ensureSettingsSchema();
    await ensureOrdersExtraColumns();
    await ensureOrderItemsExtraColumns();
    await ensureMenuExtraColumns();
    await ensurePreorderSchema();
    await seed();
    console.log('[tz check]', zonedNowInfo());
    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
