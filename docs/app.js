// ====== 調整這個成你的後端 API 網址 ======
const API_BASE = 'https://lunch2.onrender.com/api';

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
const tabAllSeats = document.getElementById('tabAllSeats'); // ✅ 新增

const pageOrders  = document.getElementById('pageOrders');
const pageMenus   = document.getElementById('pageMenus');
const pageReports = document.getElementById('pageReports');
const pageLogs    = document.getElementById('pageLogs');
const pageUsers   = document.getElementById('pageUsers');

const seatSelect = document.getElementById('seatSelect');
// 保留相容：舊版 UI 若有這個按鈕不會報錯
const toggleSubmitted = document.getElementById('toggleSubmitted');

const clearSeat = document.getElementById('clearSeat');
const codeInput = document.getElementById('codeInput');
const qtyInput  = document.getElementById('qtyInput');
const addByCode = document.getElementById('addByCode');
const manualName = document.getElementById('manualName');
const manualPrice = document.getElementById('manualPrice');
const manualQty = document.getElementById('manualQty');
const addManual = document.getElementById('addManual');
const orderTableBody = document.querySelector('#orderTable tbody');
const seatSubtotal = document.getElementById('seatSubtotal');

const internalOnlyEl = document.getElementById('internalOnly');

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

const newUserName = document.getElementById('newUserName');
const newUserPass = document.getElementById('newUserPass');
const newUserRole = document.getElementById('newUserRole');
const createUserBtn = document.getElementById('createUserBtn');
const usersTableBody = document.getElementById('usersTableBody');

// ====== 開放時段狀態（新增）======
let isOpenWindow = true;
const closedBanner = document.getElementById('closedBanner');

// ====== 後台：點餐時段設定（DOM）======
const owDayInputs = Array.from(document.querySelectorAll('input[name="owDay"]'));
const owStart = document.getElementById('owStart');
const owEnd = document.getElementById('owEnd');
const owSave = document.getElementById('owSave');
const owReload = document.getElementById('owReload');
const owMsg = document.getElementById('owMsg');

// ====== 後台：座號明細（DOM）======
const bySeatTBody = document.getElementById('bySeatTBody');
const loadBySeatBtn = document.getElementById('loadBySeat');
const loadBySeatMsg = document.getElementById('loadBySeatMsg');

// ====== Admin：全部座號一覽（DOM）======
const adminAllSeats = document.getElementById('adminAllSeats');
const allSeatsGrid = document.getElementById('allSeatsGrid');
const refreshAllSeats = document.getElementById('refreshAllSeats');

// ====== 基礎：Auth 狀態與 UI（必須在 bootstrap 之前）======
let token = localStorage.getItem('jwt') || null;
apiBaseHint.textContent = `API: ${API_BASE}`;

// === 手機偵測 & 帳密正規化 ===
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
function applyMobileUI(){
  if(!isMobile) return;
  document.body.classList.add('mobile');
}
function normalizeUsername(u=''){
  u = u.replace(/\u3000/g,' ')
       .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFF10+48));
  return u.trim();
}
function normalizePassword(p=''){
  return String(p).replace(/\u3000/g,' ').trim();
}

function authHeader() {
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}
function showLogin() {
  loginLayer.classList.remove('hidden');
  loginLayer.style.display = 'flex';
  loginLayer.style.pointerEvents = 'auto';
  app.classList.add('hidden');
  app.style.filter = 'none';
}
function showApp() {
  loginLayer.classList.add('hidden');
  loginLayer.style.display = 'none';
  loginLayer.style.pointerEvents = 'none';
  app.classList.remove('hidden');
  app.style.filter = 'none';
}
initLoginLayerStyles();

// 登入/登出
loginBtn.onclick = async () => {
  loginMsg.textContent = '';
  try {
    const username = normalizeUsername(loginUser.value.trim());
    const password = normalizePassword(loginPass.value);
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    token = data.token;
    localStorage.setItem('jwt', token);
    onLoginUser(data.user);
    applyMobileUI();
    await fetchOpenStatus();     // 取得開放狀態（公開）
    await initApp();
    switchTab('orders');
    showApp();
  } catch (e) {
    loginMsg.textContent = '登入失敗：' + e.message;
  }
};
logoutBtn.onclick = () => {
  localStorage.removeItem('jwt');
  token = null;
  showLogin();
};

// ====== Auth / API ======
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) }
  });
  const raw = await res.text();
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json') && raw) { try { data = JSON.parse(raw); } catch {} }

  if (res.status === 401) {
    localStorage.removeItem('jwt'); token = null;
    showLogin();
    throw new Error(data?.message || 'unauthorized');
  }
  if (!res.ok) {
    const msg = data?.message || raw || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data ?? raw;
}

// ====== 狀態 ======
const MIN_SEAT=1, MAX_SEAT=36;
const state = {
  me: null,
  menus: [],
  activeMenuId: null,
  ordersCache: new Map(),
  owLoaded: false,        // 後台時段設定是否載入過
  bySeatData: null,       // 後台座號明細暫存
};

function isAdmin(){ return state.me?.role === 'admin'; }
async function safeRenderAdminReports(){
  if (isAdmin()) {
    await renderAgg();
    await renderMissing();
  }
}

function onLoginUser(user){
  state.me = user;
  whoami.textContent = `${user.username}（${user.role}）`;
  const admin = isAdmin();
  tabLogs.classList.toggle('hidden', !admin);
  tabUsers.classList.toggle('hidden', false);
  tabMenus.classList.toggle('hidden', !admin);
  tabReports.classList.toggle('hidden', !admin);
  tabAllSeats?.classList.toggle('hidden', !admin); // ✅ 新增：只有 admin 看得到

  document.querySelectorAll('.only-admin')
    .forEach(el => el.classList.toggle('hidden', !admin));
  document.querySelectorAll('.only-user')
    .forEach(el => el.classList.toggle('hidden', admin));

  // Admin 顯示「全部座號一覽」
  adminAllSeats?.classList.toggle('hidden', !admin);
  if (admin) renderAllSeatsAdmin();

  // 一般使用者：座號 = 帳號；鎖定座號下拉
  if (!admin) {
    const n = Number(user.username);
    if (Number.isInteger(n) && n>=1 && n<=36) {
      seatSelect.value = String(n);
      seatSelect.disabled = true;
    }
  }
}

// ====== 開放時段（公開給前端顯示）======
async function fetchOpenStatus(){
  try{
    const data = await api('/open-status', { method:'GET' });
    isOpenWindow = !!data.open;
    renderOpenBanner(data);
  }catch{
    isOpenWindow = true; // 失敗不擋操作（後端仍會擋）
    renderOpenBanner(null);
  }
}

function renderOpenBanner(data){
  const admin = state.me?.role === 'admin';
  const show = !admin && !isOpenWindow;
  if (!closedBanner) return;
  closedBanner.classList.toggle('hidden', !show);
  if (show && data){
    const nowStr = data.nowLocal || new Date(data.nowISO || Date.now()).toLocaleString('zh-TW',{hour12:false});
    closedBanner.innerHTML = `
      <strong>目前不在點餐時段</strong>
      <div class="small">開放時段：週${(data.openDays||[]).join('、')}，${data.openStart}~${data.openEnd}（現在：${nowStr}）</div>
    `;
  }
}

function guardOpenWindow(){
  const admin = isAdmin();
  if (!admin && !isOpenWindow) {
    alert('目前不在點餐時段，暫不開放修改訂單。');
    return false;
  }
  return true;
}

// ====== 後台：點餐時段設定（admin）======
async function loadOpenWindowSettings(){
  if (!owStart || !owEnd || !owDayInputs.length) return;
  try{
    const s = await api('/settings/open-window', { method:'GET' });
    const days = (s.openDays || []).map(String);
    owDayInputs.forEach(cb => cb.checked = days.includes(String(cb.value)));
    owStart.value = s.openStart || '07:00';
    owEnd.value   = s.openEnd   || '12:00';
    owMsg.textContent = '已載入';
    state.owLoaded = true;
  }catch(e){
    owMsg.textContent = '讀取失敗：' + e.message;
  }
}
async function saveOpenWindowSettings(){
  if (!owStart || !owEnd || !owDayInputs.length) return;
  const days = owDayInputs.filter(cb=>cb.checked).map(cb=>Number(cb.value));
  if (!days.length) { alert('請至少勾選一個開放日'); return; }
  if (!owStart.value || !owEnd.value) { alert('請設定開始/結束時間'); return; }
  try{
    await api('/settings/open-window', {
      method:'PUT',
      body: JSON.stringify({ openDays: days, openStart: owStart.value, openEnd: owEnd.value })
    });
    owMsg.textContent = '已儲存';
    await fetchOpenStatus();
  }catch(e){
    owMsg.textContent = '儲存失敗：' + e.message;
  }
}
owReload?.addEventListener('click', loadOpenWindowSettings);
owSave?.addEventListener('click', saveOpenWindowSettings);

// ====== 後台：座號訂單合計與明細（admin）======
function calcSubtotal(items){
  return (items||[]).reduce((s,it)=> s + Number(it.unitPrice||0) * Number(it.qty||0), 0);
}
function seatStatusText(order){
  return (order.items && order.items.length>0) ? '完成' : '未完成';
}
async function loadBySeatReport(){
  if (!bySeatTBody) return;
  loadBySeatMsg.textContent = '載入中…';
  bySeatTBody.innerHTML = `<tr><td colspan="4">載入中…</td></tr>`;
  try{
    const seats = Array.from({length:MAX_SEAT}, (_,i)=>i+1);
    const orders = await Promise.all(seats.map(seat => api(`/orders/${seat}`)));
    state.bySeatData = orders.map(o => ({
      seat: o.seat,
      submitted: !!o.submitted,
      subtotal: calcSubtotal(o.items||[]),
      items: o.items||[]
    }));
    bySeatTBody.innerHTML = state.bySeatData.map(r=>{
      const detail = r.items.length
        ? r.items.map(it=>`${it.name}×${it.qty}（$${it.unitPrice}）`).join('，')
        : '<span class="muted small">—</span>';
      return `<tr>
        <td>${r.seat}</td>
        <td>${seatStatusText(r)}</td>
        <td>${r.subtotal.toLocaleString('zh-Hant-TW')}</td>
        <td>${detail}</td>
      </tr>`;
    }).join('');
    loadBySeatMsg.textContent = `完成（共 ${state.bySeatData.filter(x=>x.subtotal>0).length} 人有填單）`;
  }catch(e){
    bySeatTBody.innerHTML = `<tr><td colspan="4">讀取失敗：${e.message}</td></tr>`;
    loadBySeatMsg.textContent = '讀取失敗';
  }
}
loadBySeatBtn?.addEventListener('click', loadBySeatReport);

// ====== Admin：全部座號一覽（卡片）======
function seatCardHTML(o){
  const subtotal = calcSubtotal(o.items||[]);
  const done = (o.items && o.items.length>0);
  const detail = o.items.length
    ? o.items.map(it=>`${it.name}×${it.qty}（$${it.unitPrice}）`).join('，')
    : '<span class="muted small">—</span>';
  return `
  <div class="seat-card" id="seat-card-${o.seat}">
    <div class="hdr">
      <strong>座號 ${o.seat}</strong>
      <span class="badge ${done?'ok':'pending'}">${done?'完成':'未完成'}</span>
    </div>
    <div class="items">${detail}</div>
    <div class="row small" style="justify-content:space-between;margin-top:6px">
      <span>小計：$${subtotal.toLocaleString('zh-Hant-TW')}</span>
      ${o.internalOnly ? '<span class="badge pending" title="此座為內訂">內訂</span>' : ''}
    </div>
    <div class="seat-actions">
      <label class="small">
        <input type="checkbox" class="seat-internal" data-seat="${o.seat}" ${o.internalOnly?'checked':''}/>
        內訂
      </label>
      <button class="seat-edit" data-seat="${o.seat}">編輯</button>
      <button class="danger seat-clear" data-seat="${o.seat}">清空</button>
    </div>
  </div>`;
}
async function renderSeatCardInto(seat){
  if (!allSeatsGrid) return;
  const o = await api(`/orders/${seat}`);
  state.ordersCache.set(seat, o);
  const el = document.getElementById(`seat-card-${seat}`);
  if (el) el.outerHTML = seatCardHTML(o);
}
async function renderAllSeatsAdmin(){
  if (!isAdmin() || !adminAllSeats || !allSeatsGrid) return;
  const seats = Array.from({length:MAX_SEAT}, (_,i)=>i+1);
  allSeatsGrid.innerHTML = '<div class="muted">載入中…</div>';
  const orders = await Promise.all(seats.map(seat => api(`/orders/${seat}`)));
  orders.forEach(o => state.ordersCache.set(o.seat, o));
  allSeatsGrid.innerHTML = orders.map(o => seatCardHTML(o)).join('');
}
refreshAllSeats?.addEventListener('click', renderAllSeatsAdmin);

allSeatsGrid?.addEventListener('click', async (e)=>{
  const t = e.target;
  if (t.classList.contains('seat-edit')) {
    const seat = Number(t.dataset.seat);
    seatSelect.value = String(seat);
    window.scrollTo({top:0, behavior:'smooth'});
    await renderSeatOrder();
  }
  if (t.classList.contains('seat-clear')) {
    const seat = Number(t.dataset.seat);
    if (!confirm(`清空座號 ${seat} 的訂單？`)) return;
    await saveOrder(seat, { submitted:false, items:[], internalOnly:false });
    state.ordersCache.delete(seat);
    await renderSeatCardInto(seat);
    await safeRenderAdminReports();
  }
});
allSeatsGrid?.addEventListener('change', async (e)=>{
  const t = e.target;
  if (t.classList.contains('seat-internal')) {
    const seat = Number(t.dataset.seat);
    const o = await getOrder(seat);
    if (t.checked) {
      o.items = [{ name:'內訂', unitPrice:0, qty:1 }];
      o.internalOnly = true;
    } else {
      o.items = [];
      o.internalOnly = false;
    }
    await saveOrder(seat, o);
    await renderSeatCardInto(seat);
    await safeRenderAdminReports();
  }
});

// ====== UI 切頁 ======
function switchTab(which){
  const map = {
    orders: [tabOrders, pageOrders],
    menus:  [tabMenus, pageMenus],
    reports:[tabReports, pageReports],
    logs:   [tabLogs, pageLogs],
    users:  [tabUsers, pageUsers],
  };
  for (const k of Object.keys(map)){
    const [btn, page] = map[k];
    btn.classList.toggle('active', k===which);
    page.classList.toggle('hidden', k!==which);
  }
  if (which==='reports') {
    safeRenderAdminReports(); // 只在 admin 時觸發報表
    if (isAdmin() && !state.owLoaded) loadOpenWindowSettings();
  }
  if (which==='logs') { renderLogs(); }
  if (which==='users') { loadUsers(); }
}
tabOrders.onclick = ()=>switchTab('orders');
tabMenus.onclick  = ()=>switchTab('menus');
tabReports.onclick= ()=>switchTab('reports');
tabLogs.onclick   = ()=>switchTab('logs');
tabUsers.onclick  = ()=>switchTab('users');

// ✅ 新增：一鍵捲到全部座號
tabAllSeats?.addEventListener('click', () => {
  switchTab('orders');
  setTimeout(() => {
    document.getElementById('adminAllSeats')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
});

// ====== 菜單 & 訂單 API ======
async function loadMenus(){
  const data = await api('/menus');
  state.menus = data.menus || [];
  state.activeMenuId = data.activeMenuId ?? (state.menus[0]?.id ?? null);
}
async function setActiveMenu(menuId){
  await api('/settings/active-menu', { method:'PUT', body: JSON.stringify({ menuId }) });
  state.activeMenuId = menuId;
}
async function createMenu(name){
  const m = await api('/menus', { method:'POST', body: JSON.stringify({ name })});
  state.menus.push(m);
}
async function renameMenuReq(id, name){
  await api(`/menus/${id}`, { method:'PUT', body: JSON.stringify({ name })});
  const m = state.menus.find(x=>x.id===id); if (m) m.name = name;
}
async function deleteMenuReq(id){
  await api(`/menus/${id}`, { method:'DELETE' });
  state.menus = state.menus.filter(x=>x.id!==id);
  if (state.activeMenuId===id) state.activeMenuId = state.menus[0]?.id ?? null;
}
async function addMenuItemReq(menuId, name, price){
  const it = await api(`/menus/${menuId}/items`, { method:'POST', body: JSON.stringify({ name, price })});
  const m = state.menus.find(x=>x.id===menuId);
  if (m) m.items.push(it);
}
async function updateMenuItemReq(itemId, name, price){
  await api(`/menu-items/${itemId}`, { method:'PUT', body: JSON.stringify({ name, price })});
  for (const m of state.menus) {
    const it = m.items.find(i=>i.id===itemId);
    if (it) { it.name=name; it.price=Number(price); break; }
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
  try{
    await api(`/orders/${seat}`, { method:'PUT', body: JSON.stringify(order) });
    state.ordersCache.set(seat, order);
  }catch(e){
    if (String(e.message).includes('not in open window')) {
      if (closedBanner) closedBanner.classList.remove('hidden');
      alert('目前非開放點餐時段');
    }
    throw e;
  }
}
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }

// ====== Render（畫面）=====
function fmt(n){ return Number(n||0).toLocaleString('zh-Hant-TW'); }
function renderSeats(){
  seatSelect.innerHTML = '';
  for(let s=MIN_SEAT; s<=MAX_SEAT; s++){
    const opt = document.createElement('option');
    opt.value=String(s); opt.textContent = `座號 ${s}`;
    seatSelect.appendChild(opt);
  }
  seatSelect.value = seatSelect.value || '1';
}
function renderActiveMenu() {
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  activeMenuName.textContent = m ? m.name : '(未選擇)';
  const list = (m?.items||[]).map(it =>
    `<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  activeMenuList.innerHTML = list || '(此菜單沒有項目)';
  menuView.innerHTML = list;
}
function renderMenuPage(){
  menuSelect.innerHTML = state.menus.map((m,i)=>`<option value="${m.id}">${i+1}. ${m.name}</option>`).join('');
  if (state.activeMenuId) menuSelect.value = String(state.activeMenuId);
  menuTableBody.innerHTML = '';
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return;
  m.items.forEach((it)=>{
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
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);

  // 內訂狀態反映到 UI
  if (internalOnlyEl) internalOnlyEl.checked = !!o.internalOnly;
  const lock = !!o.internalOnly;

  // 鎖定新增/輸入區
  codeInput.disabled = lock;
  qtyInput.disabled = lock;
  addByCode.disabled = lock;
  manualName.disabled = lock;
  manualPrice.disabled = lock;
  manualQty.disabled = lock;
  addManual.disabled = lock;

  orderTableBody.innerHTML = '';
  let subtotal = 0;
  o.items.forEach((it,idx)=>{
    const line = it.unitPrice * it.qty; subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td>
        <input type="number" min="1" value="${it.qty}"
               class="qtyInput w120" data-idx="${idx}" ${lock?'disabled':''}/>
      </td>
      <td>${fmt(line)}</td>
      <td>${lock ? '' : `<button class="danger delBtn" data-idx="${idx}">刪除</button>`}</td>`;
    orderTableBody.appendChild(tr);
  });
  seatSubtotal.textContent = fmt(subtotal);
  if (typeof toggleSubmitted !== 'undefined' && toggleSubmitted) {
    toggleSubmitted.textContent = o.submitted ? '設為未完成' : '標記完成';
  }
}
async function renderAgg(){
  const data = await getAggregate();
  aggTableBody.innerHTML = data.items.map(r=>
    `<tr><td>${r.name}</td><td>${fmt(r.totalQty)}</td><td>${fmt(r.totalMoney)}</td></tr>`).join('');
  classTotalEl.textContent = fmt(data.classTotal);
}
async function renderMissing(){
  const data = await getMissing();
  const arr = data.missing||[];
  missingList.textContent = arr.length ? `座號：${arr.join(', ')}` : '全部人都完成填單！';
}

// Logs（簡化渲染）
async function renderLogs(){
  logsTableBody.innerHTML = '<tr><td colspan="7">載入中…</td></tr>';
  try{
    const data = await getLogs();
    logsTableBody.innerHTML = data.logs.map(l=>{
      let details = l.details;
      try{ if(details) details = JSON.stringify(JSON.parse(details), null, 2) }catch{}
      const ts = l.ts ? new Date(l.ts) : null;
      const tsStr = ts ? ts.toLocaleString('zh-TW',{hour12:false}) : '';
      return `<tr>
        <td>${l.id}</td>
        <td>${tsStr}</td>
        <td>${l.user_id ?? ''}</td>
        <td>${l.action}</td>
        <td><pre style="white-space:pre-wrap;margin:0">${details||''}</pre></td>
        <td>${l.ip||''}</td>
        <td class="small muted">${(l.ua||'').slice(0,80)}</td>
      </tr>`;
    }).join('');
  }catch(e){
    logsTableBody.innerHTML = `<tr><td colspan="7">讀取失敗：${e.message}</td></tr>`;
  }
}
async function getLogs(){ return api('/logs'); }

// ====== 使用者頁 ======
async function listUsersAdv({q='',role='',status='',page=1,pageSize=20}={}) {
  const p = new URLSearchParams({ q, role, status, page, pageSize });
  return api('/users?'+p.toString());
}
async function createUser(username, password, role){
  return api('/users', { method:'POST', body: JSON.stringify({ username, password, role })});
}
async function resetPasswordAdmin(userId, newPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body: JSON.stringify({ newPassword })});
}
async function resetPasswordSelf(userId, oldPassword, newPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body: JSON.stringify({ oldPassword, newPassword })});
}

async function loadUsers(){
  const admin = isAdmin();
  if (!admin) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="card only-user">
            <h4>變更我的密碼</h4>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input type="password" id="selfOldPwd" placeholder="舊密碼" />
              <input type="password" id="selfNewPwd" placeholder="新密碼(>=6)" />
              <button id="selfChangeBtn">送出</button>
            </div>
          </div>
        </td>
      </tr>
    `;
    const btn = document.getElementById('selfChangeBtn');
    btn.onclick = async ()=>{
      const oldP = document.getElementById('selfOldPwd').value;
      const newP = document.getElementById('selfNewPwd').value;
      if (!newP || newP.length<6) return alert('新密碼至少 6 碼');
      try{ await resetPasswordSelf(state.me.id, oldP, newP); alert('已更新'); }
      catch(e){ alert('失敗：'+e.message); }
    };
    return;
  }

  usersTableBody.innerHTML = '<tr><td colspan="4">載入中…</td></tr>';
  try{
    const data = await listUsersAdv();
    usersTableBody.innerHTML = data.users.map(u=>`
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          <input type="password" placeholder="新密碼(>=6)" id="reset_${u.id}" />
          <button class="resetPwd" data-id="${u.id}">重設</button>
        </td>
      </tr>
    `).join('');
  }catch(e){
    usersTableBody.innerHTML = `<tr><td colspan="4">失敗：${e.message}</td></tr>`;
  }
}

// 使用者事件
createUserBtn?.addEventListener('click', async ()=>{
  const username = newUserName.value.trim();
  const password = newUserPass.value;
  const role     = newUserRole.value;
  if (!username || !password || password.length<6) return alert('請填帳號與密碼(>=6)');
  try{
    await createUser(username, password, role);
    newUserName.value=''; newUserPass.value='';
    await loadUsers();
    alert('已建立');
  }catch(e){ alert('建立失敗：'+e.message); }
});
usersTableBody.addEventListener('click', async (e)=>{
  const t=e.target;
  if (t.classList.contains('resetPwd')) {
    const id = Number(t.dataset.id);
    const input = document.getElementById(`reset_${id}`);
    const pwd = input.value;
    if (!pwd || pwd.length<6) return alert('新密碼至少 6 碼');
    try{
      await resetPasswordAdmin(id, pwd);
      input.value=''; alert('已重設');
    }catch(err){ alert('重設失敗：'+err.message); }
  }
});

// ====== 事件 ======
seatSelect.addEventListener('change', ()=>{ renderSeatOrder(); });

if (typeof toggleSubmitted !== 'undefined' && toggleSubmitted) {
  toggleSubmitted.addEventListener('click', async ()=>{
    if (!guardOpenWindow()) return;
    const seat = Number(seatSelect.value||1);
    const o = await getOrder(seat);
    o.submitted = !o.submitted;
    await saveOrder(seat, o);
    await renderSeatOrder();
    await safeRenderAdminReports();
    if (isAdmin()) await renderSeatCardInto(seat);
  });
}

clearSeat.addEventListener('click', async ()=>{
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value||1);
  if (!confirm(`確定清空座號 ${seat} 的訂單？`)) return;
  await saveOrder(seat, { submitted:false, items:[] });
  state.ordersCache.delete(seat);
  await renderSeatOrder();
  await safeRenderAdminReports();
  if (isAdmin()) await renderSeatCardInto(seat);
});

// 內訂勾選
internalOnlyEl?.addEventListener('change', async ()=>{
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  if (internalOnlyEl.checked) {
    o.items = [{ name:'內訂', unitPrice:0, qty:1 }];
    o.internalOnly = true;
  } else {
    o.items = [];
    o.internalOnly = false;
  }
  try{
    await saveOrder(seat, o);
    await renderSeatOrder();
    await safeRenderAdminReports();
    if (isAdmin()) await renderSeatCardInto(seat);
  }catch(e){
    alert('儲存失敗：'+e.message);
  }
});

addByCode.addEventListener('click', async ()=>{
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) { alert('已為「內訂」，不可加入其他品項'); return; }
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return alert('尚未選擇菜單');
  const code = Number(codeInput.value||0);
  const qty  = Number(qtyInput.value||1);
  const it = m.items.find(x=>x.code===code);
  if (!it) return alert('查無此代號');
  if (qty<=0) return alert('數量需 >= 1');
  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await saveOrder(seat, o);
  codeInput.value=''; qtyInput.value='1';
  await renderSeatOrder();
  await safeRenderAdminReports();
  if (isAdmin()) await renderSeatCardInto(seat);
});
addManual.addEventListener('click', async ()=>{
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  if (o.internalOnly) { alert('已為「內訂」，不可加入其他品項'); return; }
  const name = (manualName.value||'').trim();
  const price= Number(manualPrice.value||0);
  const qty  = Number(manualQty.value||1);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  o.items.push({ name, unitPrice:price, qty });
  await saveOrder(seat, o);
  manualName.value=''; manualPrice.value=''; manualQty.value='1';
  await renderSeatOrder();
  await safeRenderAdminReports();
  if (isAdmin()) await renderSeatCardInto(seat);
});
orderTableBody.addEventListener('input', async (e)=>{
  if (!guardOpenWindow()) return;
  const t = e.target;
  if (t.classList.contains('qtyInput')) {
    const seat = Number(seatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getOrder(seat);
    if (o.internalOnly) { alert('內訂狀態不可編輯數量'); return; }
    o.items[idx].qty = Math.max(1, Number(t.value||1));
    await saveOrder(seat, o);
    await renderSeatOrder();
    await safeRenderAdminReports();
    if (isAdmin()) await renderSeatCardInto(seat);
  }
});
orderTableBody.addEventListener('click', async (e)=>{
  if (!guardOpenWindow()) return;
  const t = e.target;
  if (t.classList.contains('delBtn')) {
    const seat = Number(seatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getOrder(seat);
    if (o.internalOnly) { alert('內訂狀態不可刪除品項'); return; }
    o.items.splice(idx,1);
    await saveOrder(seat, o);
    await renderSeatOrder();
    await safeRenderAdminReports();
    if (isAdmin()) await renderSeatCardInto(seat);
  }
});
useMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  await setActiveMenu(id);
  renderActiveMenu();
  renderMenuPage();
});
addMenu.addEventListener('click', async ()=>{
  const name = menuNewName.value.trim() || `新菜單 ${state.menus.length+1}`;
  await createMenu(name);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
  alert('已建立並置於清單尾端');
});
renameMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  const name = menuNewName.value.trim();
  if (!name) return alert('請輸入新名稱');
  await renameMenuReq(id, name);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
});
dupMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  const src = state.menus.find(x=>x.id===id);
  if (!src) return;
  await createMenu(src.name + '（副本）');
  const newMenu = state.menus[state.menus.length-1];
  for (const it of src.items) await addMenuItemReq(newMenu.id, it.name, it.price);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
  alert('已建立副本');
});
delMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  if (!confirm('確定刪除此菜單？')) return;
  await deleteMenuReq(id);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
});
addItem.addEventListener('click', async ()=>{
  const mId = Number(menuSelect.value);
  const name = itemName.value.trim();
  const price = Number(itemPrice.value||0);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  await addMenuItemReq(mId, name, price);
  itemName.value=''; itemPrice.value='';
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
});

// ====== 初始化 ======
function renderSeatsThenDefault(){
  renderSeats();
  if (!seatSelect.value) seatSelect.value = '1';
}
function renderStatic(){ renderSeatsThenDefault(); }
async function initApp(){
  await loadMenus();
  renderActiveMenu();
  renderMenuPage();
  await renderSeatOrder();
  await safeRenderAdminReports(); // 只在 admin 才打報表 API
  if (isAdmin()) await renderAllSeatsAdmin(); // admin 一進來就載入全部座號
}

// 自動登入驗證
(async function bootstrap(){
  renderStatic();
  if (!token) return showLogin();
  try{
    const me = await api('/auth/me');
    onLoginUser(me.user);
    applyMobileUI();
    await fetchOpenStatus();
    await initApp();
    switchTab('orders');
    showApp();
  }catch{
    showLogin();
  }
})();
