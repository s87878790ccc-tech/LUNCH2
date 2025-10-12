// ====== 調整這個成你的後端 API 網址 ======
const API_BASE = 'https://lunch2.onrender.com/api';

// ====== 手機/桌機偵測 ======
(function detectDevice(){
  const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 640px)').matches;
  if (isMobile) document.body.classList.add('mobile');
})();

// ====== DOM ======
const app = document.getElementById('app');
const loginLayer = document.getElementById('loginLayer');
function initLoginLayerStyles() {
  Object.assign(loginLayer.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: '9999'
  });
}
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginBtn  = document.getElementById('loginBtn');
const loginMsg  = document.getElementById('loginMsg');
const whoami = document.getElementById('whoami');
const logoutBtn = document.getElementById('logoutBtn');
const apiBaseHint = document.getElementById('apiBaseHint');

const tabOrders  = document.getElementById('tabOrders');
const tabMenus   = document.getElementById('tabMenus');
const tabReports = document.getElementById('tabReports');
const tabLogs    = document.getElementById('tabLogs');
const tabUsers   = document.getElementById('tabUsers');

const pageOrders  = document.getElementById('pageOrders');
const pageMenus   = document.getElementById('pageMenus');
const pageReports = document.getElementById('pageReports');
const pageLogs    = document.getElementById('pageLogs');
const pageUsers   = document.getElementById('pageUsers');

const seatSelect = document.getElementById('seatSelect');
// toggleSubmitted 已不使用
const clearSeat = document.getElementById('clearSeat');
const codeInput = document.getElementById('codeInput');
const qtyInput  = document.getElementById('qtyInput');
const addByCode = document.getElementById('addByCode');
const qtyMinus  = document.getElementById('qtyMinus');
const qtyPlus   = document.getElementById('qtyPlus');

const manualName = document.getElementById('manualName');
const manualPrice = document.getElementById('manualPrice');
const manualQty = document.getElementById('manualQty');
const addManual = document.getElementById('addManual');
const orderTableBody = document.querySelector('#orderTable tbody');
const seatSubtotal = document.getElementById('seatSubtotal');

const internalOnlyChk = document.getElementById('internalOnly');

const activeMenuName = document.getElementById('activeMenuName');
const activeMenuList = document.getElementById('activeMenuList');
const menuView = document.getElementById('menuView');

const menuSelect = document.getElementById('menuSelect');
const useMenu = document.getElementById('useMenu');
const addMenu = document.getElementById('addMenu');
const menuNewName = document.getElementById('menuNewName');
const renameMenu = document.getElementById('renameMenu');
const dupMenu = document.getElementById('dupMenu');
const delMenu = document.getElementById('delMenu');
const itemName = document.getElementById('itemName');
const itemPrice = document.getElementById('itemPrice');
const addItem = document.getElementById('addItem');
const menuTableBody = document.querySelector('#menuTable tbody');

const aggTableBody = document.querySelector('#aggTable tbody');
const classTotalEl = document.getElementById('classTotal');
const missingList = document.getElementById('missingList');

const logsTableBody = document.querySelector('#logsTable tbody');

// Settings: open window
const openStart = document.getElementById('openStart');
const openEnd = document.getElementById('openEnd');
const saveOpenWindow = document.getElementById('saveOpenWindow');

const newUserName = document.getElementById('newUserName');
const newUserPass = document.getElementById('newUserPass');
const newUserRole = document.getElementById('newUserRole');
const createUserBtn = document.getElementById('createUserBtn');
const usersTableBody = document.getElementById('usersTableBody');

// ====== 綁定工具 ======
function on(el, ev, handler){ if(el) el.addEventListener(ev, handler); }

// ====== Auth 狀態與 UI ======
let token = localStorage.getItem('jwt') || null;
apiBaseHint && (apiBaseHint.textContent = `API: ${API_BASE}`);

function authHeader(){ return token ? { 'Authorization': 'Bearer ' + token } : {}; }
function showLogin(){
  loginLayer.classList.remove('hidden');
  loginLayer.style.display = 'flex';
  loginLayer.style.pointerEvents = 'auto';
  app.classList.add('hidden');
  app.style.filter = 'none';
}
function showApp(){
  loginLayer.classList.add('hidden');
  loginLayer.style.display = 'none';
  loginLayer.style.pointerEvents = 'none';
  app.classList.remove('hidden');
  app.style.filter = 'none';
}
initLoginLayerStyles();

// 登入/登出
on(loginBtn,'click', async ()=>{
  loginMsg && (loginMsg.textContent = '');
  try{
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: loginUser.value.trim(), password: loginPass.value })
    });
    token = data.token;
    localStorage.setItem('jwt', token);
    onLoginUser(data.user);
    await initApp();
    switchTab('orders');
    showApp();
  }catch(e){
    if (loginMsg) loginMsg.textContent = '登入失敗：' + e.message;
  }
});
on(logoutBtn,'click', ()=>{
  localStorage.removeItem('jwt'); token = null; showLogin();
});

// ====== API ======
async function api(path, options = {}){
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) }
  });
  const raw = await res.text();
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json') && raw) { try{ data = JSON.parse(raw); }catch{} }
  if (res.status === 401) {
    localStorage.removeItem('jwt'); token = null; showLogin();
    throw new Error(data?.message || 'unauthorized');
  }
  if (!res.ok) { throw new Error(data?.message || raw || `${res.status} ${res.statusText}`); }
  return data ?? raw;
}

// ====== 狀態 ======
const MIN_SEAT=1, MAX_SEAT=36;
const state = {
  me:null,
  menus:[],
  activeMenuId:null,
  ordersCache:new Map(), // seat -> {submitted, internalOnly, items[]}
  openWindow:{ openDays:["1","2","3","4","5"], openStart:"07:00", openEnd:"12:00" }
};

function onLoginUser(user){
  state.me = user;
  if (whoami) whoami.textContent = `${user.username}（${user.role}）`;
  const isAdmin = user.role === 'admin';
  tabMenus && tabMenus.classList.toggle('hidden', !isAdmin);
  tabReports && tabReports.classList.toggle('hidden', !isAdmin);
  tabLogs && tabLogs.classList.toggle('hidden', !isAdmin);
  tabUsers && tabUsers.classList.toggle('hidden', false);

  document.querySelectorAll('.only-admin').forEach(el=>el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.only-user').forEach(el=>el.classList.toggle('hidden', isAdmin));
}

// ====== 切頁 ======
function switchTab(which){
  const map = {
    orders:[tabOrders, pageOrders],
    menus:[tabMenus, pageMenus],
    reports:[tabReports, pageReports],
    logs:[tabLogs, pageLogs],
    users:[tabUsers, pageUsers]
  };
  for (const k of Object.keys(map)){
    const [btn,page] = map[k];
    if (btn) btn.classList.toggle('active', k===which);
    if (page) page.classList.toggle('hidden', k!==which);
  }
  if (which==='reports'){ renderAgg(); renderMissing(); loadOpenWindow(); }
  if (which==='logs'){ renderLogs(); }
  if (which==='users'){ loadUsers(); }
}
on(tabOrders,'click', ()=>switchTab('orders'));
on(tabMenus,'click', ()=>switchTab('menus'));
on(tabReports,'click', ()=>switchTab('reports'));
on(tabLogs,'click', ()=>switchTab('logs'));
on(tabUsers,'click', ()=>switchTab('users'));

// ====== 菜單 & 訂單 API ======
async function loadMenus(){
  const data = await api('/menus');
  state.menus = data.menus || [];
  state.activeMenuId = data.activeMenuId ?? (state.menus[0]?.id ?? null);
}
async function setActiveMenu(menuId){
  await api('/settings/active-menu', { method:'PUT', body:JSON.stringify({menuId}) });
  state.activeMenuId = menuId;
}
async function createMenu(name){
  const m = await api('/menus', { method:'POST', body:JSON.stringify({name}) });
  state.menus.push(m);
}
async function renameMenuReq(id,name){
  await api(`/menus/${id}`, { method:'PUT', body:JSON.stringify({name}) });
  const m = state.menus.find(x=>x.id===id); if (m) m.name = name;
}
async function deleteMenuReq(id){
  await api(`/menus/${id}`, { method:'DELETE' });
  state.menus = state.menus.filter(x=>x.id!==id);
  if (state.activeMenuId===id) state.activeMenuId = state.menus[0]?.id ?? null;
}
async function addMenuItemReq(menuId,name,price){
  const it = await api(`/menus/${menuId}/items`, { method:'POST', body:JSON.stringify({name,price}) });
  const m = state.menus.find(x=>x.id===menuId); if (m) m.items.push(it);
}
async function updateMenuItemReq(itemId,name,price){
  await api(`/menu-items/${itemId}`, { method:'PUT', body:JSON.stringify({name,price}) });
  for (const m of state.menus){
    const it = m.items.find(i=>i.id===itemId);
    if (it){ it.name=name; it.price=Number(price); break; }
  }
}
async function deleteMenuItemReq(itemId){
  await api(`/menu-items/${itemId}`, { method:'DELETE' });
  for (const m of state.menus) m.items = m.items.filter(i=>i.id!==itemId);
}

async function getOrder(seat){
  if (state.ordersCache.has(seat)) return state.ordersCache.get(seat);
  const o = await api(`/orders/${seat}`);
  state.ordersCache.set(seat, o);
  return o;
}
async function saveOrder(seat, order){
  // order: { internalOnly:boolean, items:[{name,unitPrice,qty}] }
  await api(`/orders/${seat}`, { method:'PUT', body:JSON.stringify(order) });
  state.ordersCache.set(seat, order);
}

// Reports
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }

// Settings (open window, admin)
async function loadOpenWindow(){
  if (state.me?.role!=='admin') return;
  const s = await api('/settings/open-window');
  state.openWindow = s;
  // render
  const setChecked = (v, on) => {
    const box = document.querySelector(`.openDay[value="${v}"]`);
    if (box) box.checked = on;
  };
  ['0','1','2','3','4','5','6'].forEach(v => setChecked(v, s.openDays.includes(v)));
  if (openStart) openStart.value = s.openStart || '07:00';
  if (openEnd) openEnd.value = s.openEnd || '12:00';
}
on(saveOpenWindow,'click', async ()=>{
  const days = [...document.querySelectorAll('.openDay')].filter(x=>x.checked).map(x=>x.value);
  try{
    await api('/settings/open-window', { method:'PUT', body:JSON.stringify({
      openDays: days, openStart: openStart.value || '07:00', openEnd: openEnd.value || '12:00'
    })});
    alert('已儲存開放時段');
  }catch(e){ alert('儲存失敗：'+e.message); }
});

// ====== Render ======
function fmt(n){ return Number(n||0).toLocaleString('zh-Hant-TW'); }

function renderSeats(){
  if (!seatSelect) return;
  seatSelect.innerHTML = '';
  for (let s=MIN_SEAT; s<=MAX_SEAT; s++){
    const opt = document.createElement('option');
    opt.value = String(s); opt.textContent = `座號 ${s}`;
    seatSelect.appendChild(opt);
  }
  // 鎖定一般使用者座號
  if (state.me?.role === 'user') {
    const n = Number(state.me.username);
    if (Number.isInteger(n) && n >= MIN_SEAT && n <= MAX_SEAT) {
      seatSelect.value = String(n);
      seatSelect.disabled = true;
    }
  } else {
    seatSelect.value = seatSelect.value || '1';
    seatSelect.disabled = false;
  }
}

function renderActiveMenu(){
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (activeMenuName) activeMenuName.textContent = m ? m.name : '(未選擇)';
  const list = (m?.items||[]).map(it => `<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  if (activeMenuList) activeMenuList.innerHTML = list || '(此菜單沒有項目)';
  if (menuView) menuView.innerHTML = list || '';
}

function renderMenuPage(){
  if (!menuSelect) return;
  menuSelect.innerHTML = state.menus.map((m,i)=>`<option value="${m.id}">${i+1}. ${m.name}</option>`).join('');
  if (state.activeMenuId) menuSelect.value = String(state.activeMenuId);
  if (!menuTableBody) return;
  menuTableBody.innerHTML = '';
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return;
  m.items.forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.code}</td>
      <td><input class="nameEdit" data-id="${it.id}" value="${it.name}" /></td>
      <td><input class="priceEdit w140" data-id="${it.id}" type="number" value="${it.price}" /></td>
      <td><button class="danger delItem" data-id="${it.id}">刪除</button></td>`;
    menuTableBody.appendChild(tr);
  });
}

async function renderSeatOrder(){
  if (!orderTableBody) return;
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat); // {submitted, internalOnly, items[]}
  orderTableBody.innerHTML = '';
  let subtotal = 0;

  // 內訂：關閉加購面板
  if (internalOnlyChk) internalOnlyChk.checked = !!o.internalOnly;
  const lock = !!o.internalOnly;
  document.getElementById('byCodeBox')?.setAttribute('open', lock ? null : 'open');
  document.getElementById('manualBox')?.setAttribute('open', lock ? null : 'open');
  document.getElementById('byCodeBox')?.classList.toggle('hidden', lock);
  document.getElementById('manualBox')?.classList.toggle('hidden', lock);

  o.items.forEach((it, idx) => {
    const line = it.unitPrice * it.qty; subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td>${lock ? it.qty : `<input type="number" min="1" value="${it.qty}" class="qtyInput w120" data-idx="${idx}"/>`}</td>
      <td>${fmt(line)}</td>
      <td>${lock ? '' : `<button class="danger delBtn" data-idx="${idx}">刪除</button>`}</td>`;
    orderTableBody.appendChild(tr);
  });
  if (seatSubtotal) seatSubtotal.textContent = fmt(subtotal);
}

async function renderAgg(){
  if (!aggTableBody || !classTotalEl) return;
  const data = await getAggregate();
  aggTableBody.innerHTML = data.items.map(r => `<tr><td>${r.name}</td><td>${fmt(r.totalQty)}</td><td>${fmt(r.totalMoney)}</td></tr>`).join('');
  classTotalEl.textContent = fmt(data.classTotal);
}
async function renderMissing(){
  if (!missingList) return;
  const data = await getMissing();
  const arr = data.missing||[];
  missingList.textContent = arr.length ? `座號：${arr.join(', ')}` : '全部人都完成填單！';
}

// Logs
function timeAgo(iso){
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime())/1000;
  if (diff < 60) return `${Math.floor(diff)} 秒前`;
  if (diff < 3600) return `${Math.floor(diff/60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff/3600)} 小時前`;
  return `${Math.floor(diff/86400)} 天前`;
}
function fmtTime(iso){
  const d = new Date(iso);
  const s = d.toLocaleString('zh-TW',{hour12:false});
  return `${s}（${timeAgo(iso)}）`;
}
const ACTION_MAP = {
  'login':'登入','menu.create':'建立菜單','menu.update':'修改菜單','menu.delete':'刪除菜單',
  'menu.item.create':'新增菜單品項','menu.item.update':'修改菜單品項','menu.item.delete':'刪除菜單品項',
  'settings.activeMenu':'切換啟用菜單','settings.openWindow':'調整開放時段',
  'order.update':'更新訂單',
  'user.create':'建立使用者','user.delete':'刪除使用者','user.bulkDelete':'批次刪除使用者',
  'user.changePassword':'變更密碼','user.status':'變更狀態','user.role':'變更角色'
};
function briefDetails(raw){
  if (!raw) return '';
  try{
    const obj = typeof raw==='string' ? JSON.parse(raw) : raw;
    const out = [];
    for (const [k,v] of Object.entries(obj)) {
      let val = v;
      if (typeof v === 'object' && v !== null) val = JSON.stringify(v);
      val = String(val); if (val.length>40) val = val.slice(0,40)+'…';
      out.push(`${k}=${val}`);
    }
    return out.join('  ');
  }catch{ return String(raw); }
}
async function renderLogs(){
  if (!logsTableBody) return;
  logsTableBody.innerHTML = '<tr><td colspan="6">載入中…</td></tr>';
  try{
    const data = await getLogs();
    if (!data.logs?.length) {
      logsTableBody.innerHTML = '<tr><td colspan="6" class="muted">目前沒有紀錄</td></tr>';
      return;
    }
    logsTableBody.innerHTML = data.logs.map(l => {
      const action = ACTION_MAP[l.action] || l.action;
      const who = l.user_id ? `#${l.user_id}` : '（系統）';
      return `<tr>
        <td>${l.id}</td>
        <td>${fmtTime(l.ts)}</td>
        <td>${who}</td>
        <td><span class="pill">${action}</span></td>
        <td class="small" style="white-space:pre-wrap">${briefDetails(l.details)}</td>
        <td class="small muted">
          <div>${l.ip||''}</div>
          <div>${(l.ua||'').slice(0,80)}</div>
        </td>
      </tr>`;
    }).join('');
  }catch(e){
    logsTableBody.innerHTML = `<tr><td colspan="6">讀取失敗：${e.message}</td></tr>`;
  }
}

// ====== Users（admin / user 自助）======
const usersView = { q:'', role:'', status:'', page:1, pageSize:20, rows:[], total:0 };
async function listUsersAdv({q='',role='',status='',page=1,pageSize=20}={}) {
  const p = new URLSearchParams({ q, role, status, page, pageSize });
  return api('/users?'+p.toString());
}
async function createUser(username, password, role){
  return api('/users', { method:'POST', body:JSON.stringify({username,password,role}) });
}
async function resetPasswordAdmin(userId, newPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body:JSON.stringify({ newPassword }) });
}
async function resetPasswordSelf(userId, oldPassword, newPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body:JSON.stringify({ oldPassword, newPassword }) });
}
async function setUserStatus(userId, status){
  return api(`/users/${userId}/status`, { method:'PATCH', body:JSON.stringify({ status }) });
}
async function setUserRole(userId, role){
  return api(`/users/${userId}/role`, { method:'PATCH', body:JSON.stringify({ role }) });
}
async function deleteUser(userId){
  return api(`/users/${userId}`, { method:'DELETE' });
}
async function bulkDelete(ids){
  return api('/users/bulk-delete', { method:'DELETE', body:JSON.stringify({ ids }) });
}

function renderUsersAdminTable(){
  if (!usersTableBody) return;
  usersTableBody.innerHTML = usersView.rows.map(u=>`
    <tr>
      <td class="only-admin"><input type="checkbox" class="pickUser" data-id="${u.id}"></td>
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td class="only-admin">
        <select class="roleSel" data-id="${u.id}">
          <option value="user" ${u.role==='user'?'selected':''}>user</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>admin</option>
        </select>
      </td>
      <td class="only-admin">
        <select class="statusSel" data-id="${u.id}">
          <option value="active" ${u.status==='active'?'selected':''}>啟用</option>
          <option value="disabled" ${u.status==='disabled'?'selected':''}>停用</option>
        </select>
      </td>
      <td class="only-admin small">${u.last_login_at?new Date(u.last_login_at).toLocaleString('zh-TW',{hour12:false}):'-'}</td>
      <td class="only-admin small">${u.created_at?new Date(u.created_at).toLocaleString('zh-TW',{hour12:false}):'-'}</td>
      <td>
        <input type="password" placeholder="新密碼(>=6)" id="reset_${u.id}">
        <button class="resetPwd" data-id="${u.id}">重設</button>
      </td>
      <td class="only-admin">
        <button class="danger delUser" data-id="${u.id}" data-name="${u.username}" data-role="${u.role}">刪除</button>
      </td>
    </tr>
  `).join('');
  const pages = Math.max(1, Math.ceil(usersView.total / usersView.pageSize));
  const pager = document.getElementById('usersPager');
  if (pager){
    pager.innerHTML = `
      <button id="pgPrev" ${usersView.page<=1?'disabled':''}>上一頁</button>
      <span>第 ${usersView.page} / ${pages} 頁（共 ${usersView.total} 筆）</span>
      <button id="pgNext" ${usersView.page>=pages?'disabled':''}>下一頁</button>
    `;
    on(document.getElementById('pgPrev'),'click', ()=>{ if(usersView.page>1){ usersView.page--; loadUsers(); } });
    on(document.getElementById('pgNext'),'click', ()=>{ if(usersView.page<pages){ usersView.page++; loadUsers(); } });
  }
}
async function loadUsers(){
  if (!usersTableBody) return;
  const isAdmin = state.me?.role==='admin';
  if (!isAdmin){
    usersTableBody.innerHTML = `
      <tr><td colspan="9">
        <div class="card">
          <h4>變更我的密碼</h4>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="password" id="selfOldPwd" placeholder="舊密碼">
            <input type="password" id="selfNewPwd" placeholder="新密碼(>=6)">
            <button id="selfChangeBtn">送出</button>
          </div>
        </div>
      </td></tr>`;
    on(document.getElementById('selfChangeBtn'),'click', async ()=>{
      const oldP = document.getElementById('selfOldPwd')?.value||'';
      const newP = document.getElementById('selfNewPwd')?.value||'';
      if (!newP || newP.length<6) return alert('新密碼至少 6 碼');
      try{ await resetPasswordSelf(state.me.id, oldP, newP); alert('已更新'); }
      catch(e){ alert('失敗：'+e.message); }
    });
    return;
  }
  // admin list
  usersTableBody.innerHTML = '<tr><td colspan="9">載入中…</td></tr>';
  try{
    const resp = await listUsersAdv(usersView);
    usersView.rows = resp.users||[]; usersView.total = Number(resp.total||0);
    renderUsersAdminTable();
  }catch(e){
    usersTableBody.innerHTML = `<tr><td colspan="9">失敗：${e.message}</td></tr>`;
  }
}
on(usersTableBody,'click', async (e)=>{
  const t=e.target;
  if (t.classList.contains('resetPwd')){
    const id = Number(t.dataset.id);
    const input = document.getElementById(`reset_${id}`);
    const pwd = input?.value||'';
    if (!pwd || pwd.length<6) return alert('新密碼至少 6 碼');
    try{ await resetPasswordAdmin(id, pwd); if(input) input.value=''; alert('已重設'); loadUsers(); }
    catch(err){ alert('重設失敗：'+err.message); }
  }
  if (t.classList.contains('delUser')){
    const id = Number(t.dataset.id);
    const name = t.dataset.name||'';
    if (!confirm(`確定刪除使用者「${name}」？`)) return;
    try{ await deleteUser(id); await loadUsers(); alert('已刪除'); }
    catch(err){ alert('刪除失敗：'+err.message); }
  }
});
on(usersTableBody,'change', async (e)=>{
  const t=e.target;
  if (t.classList.contains('roleSel')){
    try{ await setUserRole(Number(t.dataset.id), t.value); alert('角色已更新'); }
    catch(err){ alert('更新角色失敗：'+err.message); loadUsers(); }
  }
  if (t.classList.contains('statusSel')){
    try{ await setUserStatus(Number(t.dataset.id), t.value); alert('狀態已更新'); }
    catch(err){ alert('更新狀態失敗：'+err.message); loadUsers(); }
  }
});
on(document,'change',(e)=>{
  if (e.target && e.target.id==='pickAll'){
    const checked = e.target.checked;
    document.querySelectorAll('.pickUser').forEach(cb=>cb.checked=checked);
  }
});

// ====== 事件：訂單 ======
on(seatSelect,'change', ()=>{ renderSeatOrder(); });

on(qtyMinus,'click', ()=>{
  if (!qtyInput) return;
  qtyInput.value = String(Math.max(1, Number(qtyInput.value||1)-1));
});
on(qtyPlus,'click', ()=>{
  if (!qtyInput) return;
  qtyInput.value = String(Math.max(1, Number(qtyInput.value||1)+1));
});

on(clearSeat,'click', async ()=>{
  const seat = Number(seatSelect?.value||1);
  if (!confirm(`確定清空座號 ${seat} 的訂單？`)) return;
  await saveOrder(seat, { internalOnly:false, items:[] });
  state.ordersCache.delete(seat);
  await renderSeatOrder();
  if (state.me?.role==='admin'){ await renderAgg(); await renderMissing(); }
});

on(internalOnlyChk,'change', async ()=>{
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat);
  const want = !!internalOnlyChk.checked;
  if (want){
    // 改成內訂 → 直接存（後端會強制成單筆內訂）
    await saveOrder(seat, { internalOnly:true, items:[] });
  }else{
    // 取消內訂 → 保持原 items（目前為空）
    await saveOrder(seat, { internalOnly:false, items:o.items||[] });
  }
  state.ordersCache.delete(seat);
  await renderSeatOrder();
  if (state.me?.role==='admin'){ await renderAgg(); await renderMissing(); }
});

on(addByCode,'click', async ()=>{
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return alert('尚未選擇菜單');
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) return alert('目前為「內訂」，不可新增其它品項');

  const code = Number(codeInput?.value||0);
  const qty  = Number(qtyInput?.value||1);
  const it = m.items.find(x=>x.code===code);
  if (!it) return alert('查無此代號');
  if (qty<=0) return alert('數量需 >= 1');

  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await saveOrder(seat, { internalOnly:false, items:o.items });
  if (codeInput) codeInput.value=''; if (qtyInput) qtyInput.value='1';
  await renderSeatOrder();
  if (state.me?.role==='admin'){ await renderAgg(); }
});

on(addManual,'click', async ()=>{
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) return alert('目前為「內訂」，不可新增其它品項');

  const name = (manualName?.value||'').trim();
  const price= Number(manualPrice?.value||0);
  const qty  = Number(manualQty?.value||1);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  if (qty<=0) return alert('數量需 >= 1');

  o.items.push({ name, unitPrice:price, qty });
  await saveOrder(seat, { internalOnly:false, items:o.items });
  if (manualName) manualName.value=''; if (manualPrice) manualPrice.value=''; if (manualQty) manualQty.value='1';
  await renderSeatOrder();
  if (state.me?.role==='admin'){ await renderAgg(); }
});

on(orderTableBody,'input', async (e)=>{
  const t=e.target;
  if (!t.classList.contains('qtyInput')) return;
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) return; // 內訂下不可調整
  const idx = Number(t.dataset.idx);
  o.items[idx].qty = Math.max(1, Number(t.value||1));
  await saveOrder(seat, { internalOnly:false, items:o.items });
  await renderSeatOrder(); if (state.me?.role==='admin'){ await renderAgg(); }
});
on(orderTableBody,'click', async (e)=>{
  const t=e.target;
  if (!t.classList.contains('delBtn')) return;
  const seat = Number(seatSelect?.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) return;
  const idx = Number(t.dataset.idx);
  o.items.splice(idx,1);
  await saveOrder(seat, { internalOnly:false, items:o.items });
  await renderSeatOrder(); if (state.me?.role==='admin'){ await renderAgg(); }
});

// 菜單按鈕
on(useMenu,'click', async ()=>{
  const id = Number(menuSelect?.value);
  await setActiveMenu(id);
  renderActiveMenu(); renderMenuPage();
});
on(addMenu,'click', async ()=>{
  const name = (menuNewName?.value||'').trim() || `新菜單 ${state.menus.length+1}`;
  await createMenu(name); await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立並置於清單尾端');
});
on(renameMenu,'click', async ()=>{
  const id = Number(menuSelect?.value);
  const name = (menuNewName?.value||'').trim(); if (!name) return alert('請輸入新名稱');
  await renameMenuReq(id, name); await loadMenus(); renderActiveMenu(); renderMenuPage();
});
on(dupMenu,'click', async ()=>{
  const id = Number(menuSelect?.value);
  const src = state.menus.find(x=>x.id===id); if (!src) return;
  await createMenu(src.name + '（副本）');
  const newMenu = state.menus[state.menus.length-1];
  for (const it of src.items) await addMenuItemReq(newMenu.id, it.name, it.price);
  await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立副本');
});
on(delMenu,'click', async ()=>{
  const id = Number(menuSelect?.value);
  if (!confirm('確定刪除此菜單？')) return;
  await deleteMenuReq(id); await loadMenus(); renderActiveMenu(); renderMenuPage();
});
on(menuTableBody,'input', async (e)=>{
  const t=e.target;
  if (!(t.classList.contains('nameEdit') || t.classList.contains('priceEdit'))) return;
  const id = Number(t.dataset.id);
  const tr = t.closest('tr');
  const name = tr.querySelector('.nameEdit').value;
  const price= Number(tr.querySelector('.priceEdit').value||0);
  await updateMenuItemReq(id, name, price);
  await loadMenus(); renderActiveMenu(); renderMenuPage();
  if (state.me?.role==='admin'){ await renderAgg(); }
});
on(menuTableBody,'click', async (e)=>{
  const t=e.target;
  if (!t.classList.contains('delItem')) return;
  await deleteMenuItemReq(Number(t.dataset.id));
  await loadMenus(); renderActiveMenu(); renderMenuPage();
});

// ====== 初始化 ======
function renderSeatsThenDefault(){ renderSeats(); if (seatSelect && !seatSelect.value) seatSelect.value='1'; }
function renderStatic(){ renderSeatsThenDefault(); }
async function initApp(){
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
  await renderSeatOrder();
  if (state.me?.role==='admin'){ await renderAgg(); await renderMissing(); await loadOpenWindow(); }
}

// 自動登入驗證
(async function bootstrap(){
  renderStatic();
  if (!token) return showLogin();
  try{
    const me = await api('/auth/me');
    onLoginUser(me.user);
    await initApp();
    switchTab('orders');
    showApp();
  }catch{
    showLogin();
  }
})();
