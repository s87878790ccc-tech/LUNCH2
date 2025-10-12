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

/* =========================
   Logging
   ========================= */
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/* =========================
   Security / Middleware
   ========================= */
app.use(helmet());

// CORS 改成白名單：允許 GitHub Pages 前端呼叫
const ALLOW_ORIGINS = [
  'https://s87878790ccc-tech.github.io', // 你的 GitHub Pages 網域
];
app.use(cors({
  origin(origin, cb) {
    // 同源 / 無 Origin（server-side / curl）放行
    if (!origin) return cb(null, true);
    if (ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' }) }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

/* =========================
   DB (pg) 連線
   ========================= */
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in env');
  process.exit(1);
}

// 解析 URL，移除任何 sslmode，由程式碼強制設定 SSL 行為
let pgUrl;
try {
  pgUrl = new URL(DATABASE_URL);
  if (pgUrl.searchParams.has('sslmode')) {
    pgUrl.searchParams.delete('sslmode');
  }
} catch (e) {
  console.error('Bad DATABASE_URL:', e);
  process.exit(1);
}

const pool = new Pool({
  connectionString: pgUrl.toString(),
  ssl: {
    require: true,
    rejectUnauthorized: false, // 關鍵：避免 SELF_SIGNED_CERT_IN_CHAIN
  },
  keepAlive: true,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

const nowISO = () => new Date().toISOString();

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
async function t_one(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows[0] || null;
}
async function t_q(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return rows;
}

/* =========================
   方案 A：安全升級 settings 欄位
   ========================= */
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
  await pool.query(`
    insert into settings(id) values(1)
    on conflict (id) do nothing
  `);
  await pool.query(`
    update settings
    set open_days = coalesce(open_days, '{1,2,3,4,5}'),
        open_start = coalesce(open_start, '07:00'),
        open_end   = coalesce(open_end,   '12:00')
    where id = 1
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

function sign(user) {
  return jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(required = true) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return required ? res.status(401).json({ message: 'no token' }) : next();
    try {
      req.user = jwt.verify(token, JWT_SECRET);
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
      `insert into orders(seat, submitted, internal_only, created_at, updated_at)
       values ($1,false,false,now(),now())
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
async function isOpenNow() {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  if (!s) return true;
  const openDays = (s.open_days || []).map(Number);
  const now = new Date();
  const day = now.getDay(); // 0..6 (Sun=0)
  if (!openDays.includes(day)) return false;
  const hhmm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const cur = hhmm(now);
  const start = s.open_start || '00:00';
  const end = s.open_end || '23:59';
  return start <= cur && cur <= end;
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

// Settings (admin)
app.get('/api/settings/open-window', auth(), requireAdmin, async (req, res) => {
  const s = await one('select open_days, open_start, open_end from settings where id=1');
  res.json({
    openDays: s?.open_days || ['1', '2', '3', '4', '5'],
    openStart: s?.open_start || '07:00',
    openEnd: s?.open_end || '12:00',
  });
});
app.put('/api/settings/open-window', auth(), requireAdmin, async (req, res) => {
  const { openDays, openStart, openEnd } = req.body || {};
  const days = Array.isArray(openDays) ? openDays : ['1', '2', '3', '4', '5'];
  await q('update settings set open_days=$1, open_start=$2, open_end=$3 where id=1', [days, openStart || '07:00', openEnd || '12:00']);
  await logAction(req.user, 'settings.openWindow', { openDays: days, openStart, openEnd }, req);
  res.json({ ok: true });
});

// Menus
app.get('/api/menus', auth(false), async (req, res) => {
  const menus = await q('select * from menus order by id asc');
  const items = await q('select * from menu_items order by menu_id asc, code asc');
  const setting = await one('select active_menu_id from settings where id=1');
  const grouped = menus.map(m => ({
    id: m.id, name: m.name,
    items: items.filter(x => x.menu_id === m.id).map(x => ({ id: x.id, code: x.code, name: x.name, price: x.price }))
  }));
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
});
app.post('/api/menus', auth(), requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name required' });
  const row = await one('insert into menus(name) values ($1) returning id', [name]);
  await logAction(req.user, 'menu.create', { id: row.id, name }, req);
  res.json({ id: row.id, name, items: [] });
});
app.put('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  await q('update menus set name=$1 where id=$2', [name, id]);
  await logAction(req.user, 'menu.update', { id, name }, req);
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
  const { name, price } = req.body || {};
  if (!name || price == null) return res.status(400).json({ message: 'name/price required' });
  const max = await one('select coalesce(max(code),0) c from menu_items where menu_id=$1', [menuId]);
  const row = await one(
    'insert into menu_items(menu_id, code, name, price) values ($1,$2,$3,$4) returning id, code, name, price',
    [menuId, Number(max.c) + 1, name, Number(price)]
  );
  await logAction(req.user, 'menu.item.create', { menuId, itemId: row.id, name, price }, req);
  res.json(row);
});
app.put('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { name, price } = req.body || {};
  await q('update menu_items set name=$1, price=$2 where id=$3', [name, Number(price), itemId]);
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
      `insert into orders(seat, submitted, internal_only, created_at, updated_at)
       values ($1,false,false,now(),now()) returning *`,
      [seat]
    );

    let finalItems = items;
    let flag = internalOnly ? true : false;

    if (internalOnly) {
      finalItems = [{ name: '內訂', unitPrice: 0, qty: 1 }];
    }
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

// Users
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

app.get('/', (req, res) => {
  res.type('text').send('Lunch Orders API (Supabase/PostgreSQL) is running.\nTry GET /api/menus');
});

/* =========================
   Start
   ========================= */
(async function start() {
  try {
    await one('select now()');          // test DB
    await ensureSettingsSchema();       // 先補 settings 欄位
    await seed();                       // 再 seed
    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  } catch (e) {
    console.error('Startup error:', e);
    process.exit(1);
  }
})();
