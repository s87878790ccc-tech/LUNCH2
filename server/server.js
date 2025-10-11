require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

// ====== Logging ======
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ====== Middleware ======
app.use(helmet());
app.use(cors({ origin: true, credentials: true })); // 上線後改成白名單（下方說明）
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' }) }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// ====== DB ======
const dbPath = process.env.DB_PATH || path.join(__dirname, 'lunch.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS menus(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS menu_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL,
  code INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(
  id INTEGER PRIMARY KEY CHECK (id=1),
  active_menu_id INTEGER
);
INSERT OR IGNORE INTO settings(id, active_menu_id) VALUES(1, NULL);

CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seat INTEGER NOT NULL UNIQUE,
  submitted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  ua TEXT,
  ts TEXT NOT NULL
);
`);

// seed admin
(function seedAdmin(){
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(process.env.ADMIN_DEFAULT_USER || 'admin');
  if (!u) {
    const hash = bcrypt.hashSync(process.env.ADMIN_DEFAULT_PASS || 'admin123', 10);
    db.prepare('INSERT INTO users(username, password_hash, role) VALUES(?,?,?)')
      .run(process.env.ADMIN_DEFAULT_USER || 'admin', hash, 'admin');
    console.log('[seed] admin created:', process.env.ADMIN_DEFAULT_USER || 'admin');
  }
})();

function nowISO(){ return new Date().toISOString(); }
function sign(user){ return jwt.sign({ uid:user.id, username:user.username, role:user.role }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(required=true){
  return (req,res,next)=>{
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return required ? res.status(401).json({message:'no token'}) : next();
    try{
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    }catch(e){ return res.status(401).json({message:'invalid token'}); }
  };
}
function requireAdmin(req,res,next){
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' });
  next();
}
function logAction(user, action, details, req){
  db.prepare(`INSERT INTO audit_logs(user_id, action, details, ip, ua, ts)
              VALUES(?,?,?,?,?,?)`)
    .run(user?.uid || null, action, details ? JSON.stringify(details) : null,
         req.ip, req.headers['user-agent'] || '', nowISO());
}

// helpers
function ensureOrder(seat){
  let o = db.prepare('SELECT * FROM orders WHERE seat=?').get(seat);
  if (!o) {
    db.prepare('INSERT INTO orders(seat, submitted, created_at, updated_at) VALUES(?,?,?,?)')
      .run(seat, 0, nowISO(), nowISO());
    o = db.prepare('SELECT * FROM orders WHERE seat=?').get(seat);
  }
  return o;
}

// ===== Auth =====
app.post('/api/auth/login', (req,res)=>{
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({message:'username/password required'});
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return res.status(401).json({message:'invalid credentials'});
  if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({message:'invalid credentials'});
  const token = sign(u);
  logAction({uid:u.id}, 'login', {username}, req);
  res.json({ token, user: { id:u.id, username:u.username, role:u.role } });
});
app.get('/api/auth/me', auth(), (req,res)=> res.json({ user:req.user }));

// ===== Menus =====
app.get('/api/menus', auth(false), (req,res)=>{
  const menus = db.prepare('SELECT * FROM menus').all();
  const items = db.prepare('SELECT * FROM menu_items ORDER BY menu_id, code').all();
  const setting = db.prepare('SELECT active_menu_id FROM settings WHERE id=1').get();
  const grouped = menus.map(m=>({
    id:m.id, name:m.name,
    items: items.filter(x=>x.menu_id===m.id).map(x=>({id:x.id, code:x.code, name:x.name, price:x.price}))
  }));
  res.json({ menus: grouped, activeMenuId: setting?.active_menu_id ?? null });
});
app.post('/api/menus', auth(), requireAdmin, (req,res)=>{
  const { name } = req.body || {};
  if (!name) return res.status(400).json({message:'name required'});
  const info = db.prepare('INSERT INTO menus(name) VALUES(?)').run(name);
  logAction(req.user, 'menu.create', {id:info.lastInsertRowid, name}, req);
  res.json({ id: info.lastInsertRowid, name, items: [] });
});
app.put('/api/menus/:id', auth(), requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const { name } = req.body || {};
  db.prepare('UPDATE menus SET name=? WHERE id=?').run(name, id);
  logAction(req.user, 'menu.update', {id, name}, req);
  res.json({ ok:true });
});
app.delete('/api/menus/:id', auth(), requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const tx = db.transaction(()=>{
    db.prepare('DELETE FROM menu_items WHERE menu_id=?').run(id);
    db.prepare('DELETE FROM menus WHERE id=?').run(id);
    const s = db.prepare('SELECT active_menu_id FROM settings WHERE id=1').get();
    if (s?.active_menu_id === id) db.prepare('UPDATE settings SET active_menu_id=NULL WHERE id=1').run();
  });
  tx();
  logAction(req.user, 'menu.delete', {id}, req);
  res.json({ ok:true });
});
app.post('/api/menus/:id/items', auth(), requireAdmin, (req,res)=>{
  const menuId = Number(req.params.id);
  const { name, price } = req.body || {};
  if (!name || price==null) return res.status(400).json({message:'name/price required'});
  const max = db.prepare('SELECT COALESCE(MAX(code),0) AS c FROM menu_items WHERE menu_id=?').get(menuId).c;
  const info = db.prepare('INSERT INTO menu_items(menu_id, code, name, price) VALUES(?,?,?,?)')
                 .run(menuId, max+1, name, Number(price));
  logAction(req.user, 'menu.item.create', {menuId, itemId:info.lastInsertRowid, name, price}, req);
  res.json({ id:info.lastInsertRowid, code:max+1, name, price:Number(price) });
});
app.put('/api/menu-items/:itemId', auth(), requireAdmin, (req,res)=>{
  const itemId = Number(req.params.itemId);
  const { name, price } = req.body || {};
  db.prepare('UPDATE menu_items SET name=?, price=? WHERE id=?').run(name, Number(price), itemId);
  logAction(req.user, 'menu.item.update', {itemId, name, price}, req);
  res.json({ ok:true });
});
app.delete('/api/menu-items/:itemId', auth(), requireAdmin, (req,res)=>{
  const itemId = Number(req.params.itemId);
  const row = db.prepare('SELECT menu_id FROM menu_items WHERE id=?').get(itemId);
  if (row) {
    const tx = db.transaction(()=>{
      db.prepare('DELETE FROM menu_items WHERE id=?').run(itemId);
      const items = db.prepare('SELECT id FROM menu_items WHERE menu_id=? ORDER BY code').all(row.menu_id);
      items.forEach((it, idx)=> db.prepare('UPDATE menu_items SET code=? WHERE id=?').run(idx+1, it.id));
    });
    tx();
  }
  logAction(req.user, 'menu.item.delete', {itemId}, req);
  res.json({ ok:true });
});
app.put('/api/settings/active-menu', auth(), requireAdmin, (req,res)=>{
  const { menuId } = req.body || {};
  db.prepare('UPDATE settings SET active_menu_id=? WHERE id=1').run(menuId ?? null);
  logAction(req.user, 'settings.activeMenu', {menuId}, req);
  res.json({ ok:true });
});

// ===== Orders =====
function ensureOrder(seat){
  let o = db.prepare('SELECT * FROM orders WHERE seat=?').get(seat);
  if (!o) {
    db.prepare('INSERT INTO orders(seat, submitted, created_at, updated_at) VALUES(?,?,?,?)')
      .run(seat, 0, nowISO(), nowISO());
    o = db.prepare('SELECT * FROM orders WHERE seat=?').get(seat);
  }
  return o;
}
app.get('/api/orders/:seat', auth(false), (req,res)=>{
  const seat = Number(req.params.seat);
  const o = ensureOrder(seat);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  res.json({ seat, submitted: !!o.submitted, items: items.map(i=>({id:i.id,name:i.name,unitPrice:i.unit_price,qty:i.qty})) });
});
app.put('/api/orders/:seat', auth(), (req,res)=>{
  const seat = Number(req.params.seat);
  const { submitted, items } = req.body || {};
  const tx = db.transaction(()=>{
    const o = ensureOrder(seat);
    db.prepare('UPDATE orders SET submitted=?, updated_at=? WHERE id=?')
      .run(submitted?1:0, nowISO(), o.id);
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(o.id);
    (items||[]).forEach(it=>{
      db.prepare('INSERT INTO order_items(order_id, name, unit_price, qty) VALUES(?,?,?,?)')
        .run(o.id, it.name, Number(it.unitPrice), Number(it.qty));
    });
  });
  tx();
  logAction(req.user, 'order.update', {seat, submitted, itemsCount: items?.length||0}, req);
  res.json({ ok:true });
});
app.get('/api/reports/aggregate', auth(false), (req,res)=>{
  const rows = db.prepare(`
    SELECT name, SUM(qty) AS totalQty, SUM(unit_price*qty) AS totalMoney
    FROM order_items oi
    JOIN orders o ON oi.order_id=o.id
    GROUP BY name
    ORDER BY totalMoney DESC, name ASC
  `).all();
  const total = rows.reduce((s,r)=>s + (r.totalMoney||0), 0);
  res.json({ items: rows, classTotal: total });
});
app.get('/api/reports/missing', auth(false), (req,res)=>{
  const missing = [];
  for(let s=1;s<=36;s++){
    const r = db.prepare('SELECT submitted FROM orders WHERE seat=?').get(s);
    if (!r || !r.submitted) missing.push(s);
  }
  res.json({ missing });
});

// ===== Users (admin) =====
app.post('/api/users', auth(), requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username/password required' });
  const r = (role === 'admin' || role === 'user') ? role : 'user';
  const exists = db.prepare('SELECT 1 FROM users WHERE username=?').get(username);
  if (exists) return res.status(409).json({ message: 'username already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users(username, password_hash, role) VALUES(?,?,?)')
                 .run(username, hash, r);
  logAction(req.user, 'user.create', { id: info.lastInsertRowid, username, role:r }, req);
  res.json({ id: info.lastInsertRowid, username, role:r });
});
app.get('/api/users', auth(), requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, role FROM users ORDER BY id ASC').all();
  res.json({ users: rows });
});
app.put('/api/users/:id/password', auth(), (req, res) => {
  const targetId = Number(req.params.id);
  const { oldPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'newPassword too short' });

  const u = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);
  if (!u) return res.status(404).json({ message: 'user not found' });

  const isAdmin = req.user && req.user.role === 'admin';
  const isSelf  = req.user && req.user.uid === targetId;
  if (!isAdmin && !isSelf) return res.status(403).json({ message: 'forbidden' });

  if (!isAdmin) {
    if (!oldPassword) return res.status(400).json({ message: 'oldPassword required' });
    if (!bcrypt.compareSync(oldPassword, u.password_hash)) return res.status(401).json({ message: 'oldPassword incorrect' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, targetId);
  logAction(req.user, 'user.changePassword', { targetId, by:'admin?'+isAdmin }, req);
  res.json({ ok:true });
});

// ===== Logs (admin) =====
app.get('/api/logs', auth(), requireAdmin, (req,res)=>{
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all();
  res.json({ logs: rows });
});

app.listen(PORT, ()=> console.log(`API listening on http://localhost:${PORT}`));
