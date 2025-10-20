require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const DATABASE_URL = process.env.DATABASE_URL;

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

/* =========================
   Security / Middleware
   ========================= */
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

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

// rate limit
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

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

async function ensureMenuExtraColumns() {
  await pool.query(`alter table if exists menus add column if not exists note text`);
  await pool.query(`alter table if exists menu_items add column if not exists image_url text`);
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
  // 兼容：若曾有 order_id，把它改名為 preorder_id；若兩者都不存在就補上 preorder_id
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
  const adminName = process.env.ADMIN_DEFAULT_USER || 'admin';
  const adminPass = process.env.ADMIN_DEFAULT_PASS || 'admin123';
  const seatPass = process.env.SEAT_DEFAULT_PASS || '123456';

  const u = await one('select * from users where username=$1', [adminName]);
  if (!u) {
    const hash = await bcrypt.hash(adminPass, 10);
    await q(
      `insert into users(username, password_hash, role, status, created_at, updated_at)
       values ($1,$2,'admin','active',now(),now())`,
      [adminName, hash]
    );
    console.log('[seed] admin created:', adminName);
  }

  const hashSeat = await bcrypt.hash(seatPass, 10);
  for (let s = 1; s <= 36; s++) {
    await q(
      `insert into users(username, password_hash, role, status, created_at, updated_at)
       values ($1,$2,'user','active',now(),now())
       on conflict (username) do nothing`,
      [String(s), hashSeat]
    );
  }
  console.log('[seed] seat users 1~36 ready (default pass = 123456)');
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
// Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });

  const u = await one('select * from users where username=$1', [username]);
  if (!u) return res.status(401).json({ message: 'invalid credentials' });
  if (u.status !== 'active') return res.status(403).json({ message: 'account disabled' });

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ message: 'invalid credentials' });

  await q('update users set last_login_at=now(), updated_at=now() where id=$1', [u.id]);

  const token = sign(u);
  await logAction({ uid: u.id }, 'login', { username }, req);
  res.json({ token, user: { id: u.id, username: u.username, role: u.role } });
});
app.get('/api/auth/me', auth(), async (req, res) => {
  res.json({ user: req.user });
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
  const { openDays, openStart, openEnd } = req.body || {};
  const days = Array.isArray(openDays) ? openDays : ['1','2','3','4','5'];
  await q('update settings set open_days=$1, open_start=$2, open_end=$3 where id=1', [days, openStart || '07:00', openEnd || '12:00']);
  await logAction(req.user, 'settings.openWindow', { openDays: days, openStart, openEnd }, req);
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
  const grouped = menus.map(m => ({
    id: m.id,
    name: m.name,
    note: m.note || '',
    items: items
      .filter(x => x.menu_id === m.id)
      .map(x => ({
        id: x.id,
        code: x.code,
        name: x.name,
        price: x.price,
        imageUrl: x.image_url || '',
      }))
  }));
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
});
app.post('/api/menus', auth(), requireAdmin, async (req, res) => {
  const { name, note } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name required' });
  const row = await one('insert into menus(name, note) values ($1,$2) returning id, name, note', [name, note ?? null]);
  await logAction(req.user, 'menu.create', { id: row.id, name, note }, req);
  res.json({ id: row.id, name: row.name, note: row.note || '', items: [] });
});
app.put('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, note } = req.body || {};
  await q('update menus set name=$1, note=$2 where id=$3', [name, note ?? null, id]);
  await logAction(req.user, 'menu.update', { id, name, note }, req);
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
  const { name, price, imageUrl } = req.body || {};
  if (!name || price == null) return res.status(400).json({ message: 'name/price required' });
  const max = await one('select coalesce(max(code),0) c from menu_items where menu_id=$1', [menuId]);
  const row = await one(
    'insert into menu_items(menu_id, code, name, price, image_url) values ($1,$2,$3,$4,$5) returning id, code, name, price, image_url',
    [menuId, Number(max.c) + 1, name, Number(price), imageUrl ? String(imageUrl) : null]
  );
  await logAction(req.user, 'menu.item.create', { menuId, itemId: row.id, name, price, imageUrl }, req);
  res.json({
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
    imageUrl: row.image_url || '',
  });
});
app.put('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { name, price, imageUrl } = req.body || {};
  await q('update menu_items set name=$1, price=$2, image_url=$3 where id=$4', [name, Number(price), imageUrl ? String(imageUrl) : null, itemId]);
  await logAction(req.user, 'menu.item.update', { itemId, name, price, imageUrl }, req);
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
  const { menuId } = req.body || {};
  await q('update settings set active_menu_id=$1 where id=1', [menuId ?? null]);
  await logAction(req.user, 'settings.activeMenu', { menuId }, req);
  res.json({ ok: true });
});

// Orders
app.get('/api/orders/:seat', auth(), async (req, res) => {
  const seat = Number(req.params.seat);
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });
  const o = await ensureOrder(seat);
  const items = await q('select * from order_items where order_id=$1 order by id asc', [o.id]);
  res.json({
    seat,
    submitted: !!o.submitted,
    internalOnly: !!o.internal_only,
    paid: !!o.paid,
    items: items.map(i => ({ id: i.id, name: i.name, unitPrice: i.unit_price, qty: i.qty })),
  });
});
app.put('/api/orders/:seat', auth(), async (req, res) => {
  const seat = Number(req.params.seat);
  if (!userCanAccessSeat(req.user, seat)) return res.status(403).json({ message: 'forbidden' });

  if (req.user.role !== 'admin' && !(await isOpenNow())) {
    return res.status(403).json({ message: 'not in open window' });
  }
  const { items = [], internalOnly = false } = req.body || {};
  await tx(async (c) => {
    const o = await t_one(c, 'select * from orders where seat=$1', [seat]) || await t_one(
      c,
      `insert into orders(seat, submitted, internal_only, paid, created_at, updated_at)
       values ($1,false,false,false,now(),now()) returning *`,
      [seat]
    );
    let finalItems = items;
    let flag = !!internalOnly;
    if (internalOnly) finalItems = [{ name: '內訂', unitPrice: 0, qty: 1 }];
    const submitted = finalItems.length > 0;

    await c.query('update orders set submitted=$1, internal_only=$2, updated_at=now() where id=$3', [
      submitted, flag, o.id,
    ]);
    await c.query('delete from order_items where order_id=$1', [o.id]);
    for (const it of finalItems) {
      await c.query(
        'insert into order_items(order_id, name, unit_price, qty) values ($1,$2,$3,$4)',
        [o.id, String(it.name), Number(it.unitPrice), Number(it.qty)]
      );
    }
  });
  await logAction(req.user, 'order.update', { seat, internalOnly: !!internalOnly, itemsCount: (items || []).length }, req);
  res.json({ ok: true });
});
// 訂單「已付款」切換（admin）
app.put('/api/orders/:seat/paid', auth(), requireAdmin, async (req, res) => {
  const seat = Number(req.params.seat);
  const { paid } = req.body || {};
  const o = await ensureOrder(seat);
  await q('update orders set paid=$1, updated_at=now() where id=$2', [!!paid, o.id]);
  await logAction(req.user, 'order.paid', { seat, paid: !!paid }, req);
  res.json({ ok: true });
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
  const os = await q('select * from orders where paid=false and submitted=true order by seat asc');
  const list = [];
  for (const o of os) {
    const items = await q('select name, unit_price, qty from order_items where order_id=$1 order by id asc', [o.id]);
    const subtotal = items.reduce((s, it)=> s + Number(it.unit_price)*Number(it.qty), 0);
    list.push({ seat: o.seat, subtotal, items: items.map(i=>({ name:i.name, unitPrice:i.unit_price, qty:i.qty })) });
  }
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
  const { enabled=false, dates=[] } = req.body || {};
  await q('update preorder_settings set enabled=$1, dates=$2 where id=1', [!!enabled, Array.isArray(dates)? dates : []]);
  await logAction(req.user, 'settings.preorder', { enabled: !!enabled, dates }, req);
  res.json({ ok: true });
});

function toDateOrNull(s){
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`; // 存 DB 用原字串，避免時區偏移
}
async function ensurePreorder(date, seat){
  const d = toDateOrNull(date);
  if (!d) throw new Error('bad date');
  let o = await one('select * from preorders where d=$1 and seat=$2', [d, seat]);
  if (!o) {
    o = await one(
      `insert into preorders(d, seat, submitted, internal_only, paid, created_at, updated_at)
       values ($1,$2,false,false,false,now(),now())
       returning *`,
      [d, seat]
    );
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
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    if (!canAccessPreSeat(req.user, seat)) return res.status(403).json({ message:'forbidden' });

    if (req.user.role !== 'admin') {
      const allowed = await checkPreUserAllowed(req.user, date);
      if (!allowed) return res.status(403).json({ message:'preorder not allowed for this date' });
    }

    const { items = [], internalOnly = false } = req.body || {};
    await tx(async (c)=>{
      const o = await ensurePreorder(date, seat);
      let finalItems = items;
      let flag = !!internalOnly;
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

    await logAction(req.user, 'preorder.update', { date, seat, internalOnly: !!internalOnly, itemsCount: (items||[]).length }, req);
    res.json({ ok: true });
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});
app.put('/api/preorders/:date/:seat/paid', auth(), requireAdmin, async (req, res)=>{
  try{
    const seat = Number(req.params.seat);
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    const o = await ensurePreorder(date, seat);
    const { paid } = req.body || {};
    await q('update preorders set paid=$1, updated_at=now() where id=$2', [!!paid, o.id]);
    await logAction(req.user, 'preorder.paid', { date, seat, paid: !!paid }, req);
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});
app.get('/api/preorders/:date/unpaid', auth(), requireAdmin, async (req, res)=>{
  try{
    const date = toDateOrNull(req.params.date);
    if (!date) return res.status(400).json({ message:'bad date' });
    const os = await q('select * from preorders where d=$1 and paid=false and submitted=true order by seat asc', [date]);
    const list = [];
    for (const o of os) {
      const items = await q('select name, unit_price, qty from preorder_items where preorder_id=$1 order by id asc', [o.id]);
      const subtotal = items.reduce((s, it)=> s + Number(it.unit_price)*Number(it.qty), 0);
      list.push({ seat: o.seat, subtotal, items: items.map(i=>({ name:i.name, unitPrice:i.unit_price, qty:i.qty })) });
    }
    res.json({ list });
  }catch(e){
    res.status(500).json({ message:String(e.message||e) });
  }
});

/* =========================
   Users
   ========================= */
app.post('/api/users', auth(), requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });
  const r = (role === 'admin' || role === 'user') ? role : 'user';
  const exist = await one('select 1 from users where username=$1', [username]);
  if (exist) return res.status(409).json({ message: 'username already exists' });
  const hash = await bcrypt.hash(password, 10);
  const row = await one(
    `insert into users(username, password_hash, role, status, created_at, updated_at)
     values ($1,$2,$3,'active',now(),now())
     returning id, username, role, status`,
    [username, hash, r]
  );
  await logAction(req.user, 'user.create', { id: row.id, username, role: r }, req);
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
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'newPassword too short' });

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
  const { status } = req.body || {};
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
  const { role } = req.body || {};
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
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ message: 'ids required' });
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
