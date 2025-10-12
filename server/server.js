// server.js  ——  PostgreSQL 版
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

// ====== PG Pool ======
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render/Neon 通常不需要 ssl 設定；若你的供應商需要，可加上：
  // ssl: { rejectUnauthorized: false }
});

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}
async function q1(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
function nowISO() { return new Date().toISOString(); }

// ====== Logging ======
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ====== Middleware ======
app.use(helmet());
app.use(cors({ origin: true, credentials: true })); // 上線可改白名單
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' }) }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// ====== Schema 初始化 ======
async function initSchema() {
  await pool.query(`
  CREATE TABLE IF NOT EXISTS users(
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    last_login_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS menus(
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items(
    id SERIAL PRIMARY KEY,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    code INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings(
    id INTEGER PRIMARY KEY,
    active_menu_id INTEGER REFERENCES menus(id),
    open_window_json TEXT
  );
  INSERT INTO settings(id, active_menu_id, open_window_json)
    VALUES (1, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  CREATE TABLE IF NOT EXISTS orders(
    id SERIAL PRIMARY KEY,
    seat INTEGER NOT NULL UNIQUE,
    submitted BOOLEAN NOT NULL DEFAULT FALSE,
    internal_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items(
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs(
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    ua TEXT,
    ts TIMESTAMP NOT NULL
  );
  `);

  // 填補缺少的欄位（安全 idempotent）
  // 這裡 Postgres 若已存在會報錯，所以用 try/catch 忽略
  try { await pool.query(`ALTER TABLE orders ADD COLUMN internal_only BOOLEAN NOT NULL DEFAULT FALSE`); } catch {}
}

async function seedUsers() {
  const adminUser = process.env.ADMIN_DEFAULT_USER || 'admin';
  const adminPass = process.env.ADMIN_DEFAULT_PASS || 'admin123';
  const u = await q1(`SELECT * FROM users WHERE username=$1`, [adminUser]);
  if (!u) {
    const hash = await bcrypt.hash(adminPass, 10);
    await q(
      `INSERT INTO users(username, password_hash, role, status, created_at, updated_at)
       VALUES($1,$2,'admin','active',$3,$3)`,
      [adminUser, hash, new Date()]
    );
    console.log('[seed] admin created:', adminUser);
  }

  // 1~36 座號用戶
  const defaultPass = process.env.SEAT_DEFAULT_PASS || '123456';
  const hash = await bcrypt.hash(defaultPass, 10);
  for (let s = 1; s <= 36; s++) {
    await q(
      `INSERT INTO users(username, password_hash, role, status, created_at, updated_at)
       VALUES($1,$2,'user','active',$3,$3)
       ON CONFLICT (username) DO NOTHING`,
      [String(s), hash, new Date()]
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
    `INSERT INTO audit_logs(user_id, action, details, ip, ua, ts)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [user?.uid || null, action, details ? JSON.stringify(details) : null,
     req.ip, req.headers['user-agent'] || '', new Date()]
  );
}

// helpers
async function ensureOrder(seat) {
  let o = await q1(`SELECT * FROM orders WHERE seat=$1`, [seat]);
  if (!o) {
    o = await q1(
      `INSERT INTO orders(seat, submitted, internal_only, created_at, updated_at)
       VALUES($1,false,false,$2,$2) RETURNING *`,
      [seat, new Date()]
    );
  }
  return o;
}

// ===== Auth =====
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });

  const u = await q1(`SELECT * FROM users WHERE username=$1`, [username]);
  if (!u) return res.status(401).json({ message: 'invalid credentials' });
  if (u.status !== 'active') return res.status(403).json({ message: 'account disabled' });

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ message: 'invalid credentials' });

  await q(`UPDATE users SET last_login_at=$1, updated_at=$1 WHERE id=$2`, [new Date(), u.id]);

  const token = sign(u);
  await logAction({ uid: u.id }, 'login', { username }, req);
  res.json({ token, user: { id: u.id, username: u.username, role: u.role } });
});
app.get('/api/auth/me', auth(), (req, res) => res.json({ user: req.user }));

// ===== Menus =====
app.get('/api/menus', auth(false), async (req, res) => {
  const menus = await q(`SELECT * FROM menus ORDER BY id ASC`);
  const items = await q(`SELECT * FROM menu_items ORDER BY menu_id, code`);
  const setting = await q1(`SELECT active_menu_id FROM settings WHERE id=1`);
  const grouped = menus.map(m => ({
    id: m.id,
    name: m.name,
    items: items.filter(x => x.menu_id === m.id).map(x => ({
      id: x.id, code: x.code, name: x.name, price: x.price
    }))
  }));
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
});

app.post('/api/menus', auth(), requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name required' });
  const row = await q1(`INSERT INTO menus(name) VALUES($1) RETURNING *`, [name]);
  await logAction(req.user, 'menu.create', { id: row.id, name }, req);
  res.json({ id: row.id, name: row.name, items: [] });
});

app.put('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  await q(`UPDATE menus SET name=$1 WHERE id=$2`, [name, id]);
  await logAction(req.user, 'menu.update', { id, name }, req);
  res.json({ ok: true });
});

app.delete('/api/menus/:id', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await q(`DELETE FROM menu_items WHERE menu_id=$1`, [id]);
  await q(`DELETE FROM menus WHERE id=$1`, [id]);
  const s = await q1(`SELECT active_menu_id FROM settings WHERE id=1`);
  if (s?.active_menu_id === id) {
    await q(`UPDATE settings SET active_menu_id=NULL WHERE id=1`);
  }
  await logAction(req.user, 'menu.delete', { id }, req);
  res.json({ ok: true });
});

app.post('/api/menus/:id/items', auth(), requireAdmin, async (req, res) => {
  const menuId = Number(req.params.id);
  const { name, price } = req.body || {};
  if (!name || price == null) return res.status(400).json({ message: 'name/price required' });
  const m = await q1(`SELECT COALESCE(MAX(code),0) AS c FROM menu_items WHERE menu_id=$1`, [menuId]);
  const nextCode = Number(m?.c || 0) + 1;
  const row = await q1(
    `INSERT INTO menu_items(menu_id, code, name, price) VALUES($1,$2,$3,$4) RETURNING *`,
    [menuId, nextCode, name, Number(price)]
  );
  await logAction(req.user, 'menu.item.create', { menuId, itemId: row.id, name, price }, req);
  res.json({ id: row.id, code: row.code, name: row.name, price: row.price });
});

app.put('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { name, price } = req.body || {};
  await q(`UPDATE menu_items SET name=$1, price=$2 WHERE id=$3`, [name, Number(price), itemId]);
  await logAction(req.user, 'menu.item.update', { itemId, name, price }, req);
  res.json({ ok: true });
});

app.delete('/api/menu-items/:itemId', auth(), requireAdmin, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const row = await q1(`SELECT menu_id FROM menu_items WHERE id=$1`, [itemId]);
  if (row) {
    await q(`DELETE FROM menu_items WHERE id=$1`, [itemId]);
    // 重新連號
    const items = await q(`SELECT id FROM menu_items WHERE menu_id=$1 ORDER BY code`, [row.menu_id]);
    for (let i = 0; i < items.length; i++) {
      await q(`UPDATE menu_items SET code=$1 WHERE id=$2`, [i + 1, items[i].id]);
    }
  }
  await logAction(req.user, 'menu.item.delete', { itemId }, req);
  res.json({ ok: true });
});

app.put('/api/settings/active-menu', auth(), requireAdmin, async (req, res) => {
  const { menuId } = req.body || {};
  await q(`UPDATE settings SET active_menu_id=$1 WHERE id=1`, [menuId ?? null]);
  await logAction(req.user, 'settings.activeMenu', { menuId }, req);
  res.json({ ok: true });
});

// ===== Orders =====
app.get('/api/orders/:seat', auth(false), async (req, res) => {
  const seat = Number(req.params.seat);
  const o = await ensureOrder(seat);
  const items = await q(`SELECT * FROM order_items WHERE order_id=$1 ORDER BY id`, [o.id]);
  res.json({
    seat,
    submitted: !!o.submitted,
    internalOnly: !!o.internal_only,
    items: items.map(i => ({ id: i.id, name: i.name, unitPrice: i.unit_price, qty: i.qty }))
  });
});

app.put('/api/orders/:seat', auth(), async (req, res) => {
  const seat = Number(req.params.seat);
  const { submitted, items, internalOnly } = req.body || {};

  // 權限：user 只能改自己座號（帳號為 1~36）
  if (req.user.role !== 'admin') {
    if (String(req.user.username) !== String(seat)) {
      return res.status(403).json({ message: '只能修改自己座號的訂單' });
    }
  }

  const o = await ensureOrder(seat);
  // 若有填任何品項，就自動 submitted=true
  const willSubmit = Array.isArray(items) && items.length > 0 ? true : !!submitted;

  await q(`DELETE FROM order_items WHERE order_id=$1`, [o.id]);
  if (Array.isArray(items)) {
    for (const it of items) {
      await q(
        `INSERT INTO order_items(order_id, name, unit_price, qty) VALUES($1,$2,$3,$4)`,
        [o.id, it.name, Number(it.unitPrice), Number(it.qty)]
      );
    }
  }
  await q(
    `UPDATE orders SET submitted=$1, internal_only=$2, updated_at=$3 WHERE id=$4`,
    [willSubmit, !!internalOnly, new Date(), o.id]
  );

  await logAction(req.user, 'order.update', { seat, submitted: willSubmit, itemsCount: items?.length || 0, internalOnly: !!internalOnly }, req);
  res.json({ ok: true });
});

app.get('/api/reports/aggregate', auth(false), async (req, res) => {
  const rows = await q(`
    SELECT name, SUM(qty)::int AS "totalQty", SUM(unit_price*qty)::int AS "totalMoney"
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    GROUP BY name
    ORDER BY "totalMoney" DESC, name ASC
  `);
  const total = rows.reduce((s, r) => s + (r.totalMoney || 0), 0);
  res.json({ items: rows, classTotal: total });
});

app.get('/api/reports/missing', auth(false), async (req, res) => {
  const missing = [];
  for (let s = 1; s <= 36; s++) {
    const r = await q1(`SELECT submitted FROM orders WHERE seat=$1`, [s]);
    if (!r || !r.submitted) missing.push(s);
  }
  res.json({ missing });
});

// ===== Users =====

// 建立使用者（admin）
app.post('/api/users', auth(), requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });
  const r = (role === 'admin' || role === 'user') ? role : 'user';
  const exist = await q1(`SELECT 1 FROM users WHERE username=$1`, [username]);
  if (exist) return res.status(409).json({ message: 'username already exists' });
  const hash = await bcrypt.hash(password, 10);
  const now = new Date();
  const row = await q1(
    `INSERT INTO users(username, password_hash, role, status, created_at, updated_at)
     VALUES($1,$2,$3,'active',$4,$4) RETURNING id, username, role, status`,
    [username, hash, r, now]
  );
  await logAction(req.user, 'user.create', { id: row.id, username, role: r }, req);
  res.json(row);
});

// 列表（admin）搜尋/篩選/分頁
app.get('/api/users', auth(), requireAdmin, async (req, res) => {
  const qtxt = (req.query.q || '').trim();
  const role = (req.query.role || '').trim();
  const status = (req.query.status || '').trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));

  const wh = [];
  const params = [];
  if (qtxt) { params.push(`%${qtxt}%`); wh.push(`username ILIKE $${params.length}`); }
  if (role === 'admin' || role === 'user') { params.push(role); wh.push(`role = $${params.length}`); }
  if (status === 'active' || status === 'disabled') { params.push(status); wh.push(`status = $${params.length}`); }

  const whereSql = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
  const totalRow = await q1(`SELECT COUNT(*)::int AS c FROM users ${whereSql}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await q(
    `SELECT id, username, role, status, created_at, updated_at, last_login_at
     FROM users
     ${whereSql}
     ORDER BY id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ users: rows, total: totalRow?.c || 0, page, pageSize });
});

// 自助或 admin 變更密碼
app.put('/api/users/:id/password', auth(), async (req, res) => {
  const targetId = Number(req.params.id);
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'newPassword too short' });

  const u = await q1(`SELECT * FROM users WHERE id=$1`, [targetId]);
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
  await q(`UPDATE users SET password_hash=$1, updated_at=$2 WHERE id=$3`, [hash, new Date(), targetId]);
  await logAction(req.user, 'user.changePassword', { targetId, by: 'admin?' + isAdmin }, req);
  res.json({ ok: true });
});

// 變更狀態（admin）
app.patch('/api/users/:id/status', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'disabled'].includes(status)) return res.status(400).json({ message: 'bad status' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的狀態' });

  const u = await q1(`SELECT * FROM users WHERE id=$1`, [id]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  await q(`UPDATE users SET status=$1, updated_at=$2 WHERE id=$3`, [status, new Date(), id]);
  await logAction(req.user, 'user.status', { targetId: id, status }, req);
  res.json({ ok: true });
});

// 變更角色（admin）
app.patch('/api/users/:id/role', auth(), requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ message: 'bad role' });
  if (req.user.uid === id) return res.status(400).json({ message: '無法變更自己的角色' });

  const u = await q1(`SELECT * FROM users WHERE id=$1`, [id]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  if (u.role === 'admin' && role === 'user') {
    const adminCount = (await q1(`SELECT COUNT(*)::int AS c FROM users WHERE role='admin'`))?.c || 0;
    if (adminCount <= 1) return res.status(400).json({ message: '系統至少需要一位管理員' });
  }
  await q(`UPDATE users SET role=$1, updated_at=$2 WHERE id=$3`, [role, new Date(), id]);
  await logAction(req.user, 'user.role', { targetId: id, from: u.role, to: role }, req);
  res.json({ ok: true });
});

// 單筆刪除（admin）
app.delete('/api/users/:id', auth(), requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (req.user && req.user.uid === targetId) return res.status(400).json({ message: '無法刪除自己' });

  const u = await q1(`SELECT * FROM users WHERE id=$1`, [targetId]);
  if (!u) return res.status(404).json({ message: 'user not found' });

  if (u.role === 'admin') {
    const adminCount = (await q1(`SELECT COUNT(*)::int AS c FROM users WHERE role='admin'`))?.c || 0;
    if (adminCount <= 1) return res.status(400).json({ message: '系統至少需要一位管理員，無法刪除' });
  }
  await q(`DELETE FROM users WHERE id=$1`, [targetId]);
  await logAction(req.user, 'user.delete', { targetId, username: u.username, role: u.role }, req);
  res.json({ ok: true });
});

// 批次刪除（admin）
app.delete('/api/users/bulk-delete', auth(), requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ message: 'ids required' });
  if (ids.includes(req.user.uid)) return res.status(400).json({ message: '包含自己，無法刪除' });

  const admins = await q(`SELECT id FROM users WHERE role='admin'`);
  const adminIds = admins.map(x => x.id);
  const remainingAdmins = adminIds.filter(id => !ids.includes(id));
  if (remainingAdmins.length === 0) return res.status(400).json({ message: '不能刪除所有管理員' });

  // 真正刪除
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);

  await logAction(req.user, 'user.bulkDelete', { ids }, req);
  res.json({ ok: true, deleted: ids.length });
});

// ===== Logs =====
app.get('/api/logs', auth(), requireAdmin, async (req, res) => {
  const rows = await q(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500`);
  res.json({ logs: rows });
});

// Root
app.get('/', (req, res) => {
  res.type('text').send('Lunch Orders API is running.\nTry GET /api/menus');
});

// 啟動
(async () => {
  await initSchema();
  await seedUsers();
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
})();
