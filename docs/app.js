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
const tabPreorder= document.getElementById('tabPreorder');
const tabMenus   = document.getElementById('tabMenus');
const tabReports = document.getElementById('tabReports');
const tabLogs    = document.getElementById('tabLogs');
const tabUsers   = document.getElementById('tabUsers');
const tabAllSeats= document.getElementById('tabAllSeats');

const pageOrders  = document.getElementById('pageOrders');
const pagePreorder= document.getElementById('pagePreorder');
const pageMenus   = document.getElementById('pageMenus');
const pageReports = document.getElementById('pageReports');
const pageLogs    = document.getElementById('pageLogs');
const pageUsers   = document.getElementById('pageUsers');

const seatSelect = document.getElementById('seatSelect');
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
const paidEl = document.getElementById('paid');

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
const unpaidList = document.getElementById('unpaidList');

const logsTableBody = document.querySelector('#logsTable tbody');

const newUserName = document.getElementById('newUserName');
const newUserPass = document.getElementById('newUserPass');
const newUserRole = document.getElementById('newUserRole');
const createUserBtn = document.getElementById('createUserBtn');
const usersTableBody = document.getElementById('usersTableBody');

// Admin：全部座號一覽（DOM）
const adminAllSeats = document.getElementById('adminAllSeats');
const allSeatsGrid = document.getElementById('allSeatsGrid');
const refreshAllSeats = document.getElementById('refreshAllSeats');

// 開放時段狀態
let isOpenWindow = true;
const closedBanner = document.getElementById('closedBanner');

// 後台：點餐時段設定（DOM）
const owDayInputs = Array.from(document.querySelectorAll('input[name="owDay"]'));
const owStart = document.getElementById('owStart');
const owEnd = document.getElementById('owEnd');
const owSave = document.getElementById('owSave');
const owReload = document.getElementById('owReload');
const owMsg = document.getElementById('owMsg');

// 後台：座號明細（DOM）
const bySeatTBody = document.getElementById('bySeatTBody');
const loadBySeatBtn = document.getElementById('loadBySeat');
const loadBySeatMsg = document.getElementById('loadBySeatMsg');

// ⭐ 預訂便當（DOM）
const preDateSelect = document.getElementById('preDateSelect');
const preSeatSelect = document.getElementById('preSeatSelect');
const preInternalOnlyEl = document.getElementById('preInternalOnly');
const prePaidEl = document.getElementById('prePaid');
const preCodeInput = document.getElementById('preCodeInput');
const preQtyInput  = document.getElementById('preQtyInput');
const preAddByCode = document.getElementById('preAddByCode');
const preManualName = document.getElementById('preManualName');
const preManualPrice = document.getElementById('preManualPrice');
const preManualQty = document.getElementById('preManualQty');
const preAddManual = document.getElementById('preAddManual');
const preOrderTbody = document.getElementById('preOrderTbody');
const preSeatSubtotal = document.getElementById('preSeatSubtotal');

// ⭐ 預訂設定（DOM）
const preEnabledEl = document.getElementById('preEnabled');
const preAddDateEl = document.getElementById('preAddDate');
const preAddDateBtn = document.getElementById('preAddDateBtn');
const preSaveDatesBtn = document.getElementById('preSaveDates');
const preReloadBtn = document.getElementById('preReload');
const preDatesList = document.getElementById('preDatesList');
const preSettingsMsg = document.getElementById('preSettingsMsg');

// ⭐ 預訂未付款（DOM）
const unpaidPreDateSelect = document.getElementById('unpaidPreDateSelect');
const unpaidPreList = document.getElementById('unpaidPreList');
const reloadUnpaidPre = document.getElementById('reloadUnpaidPre');

// ====== 基礎：Auth 狀態與 UI（必須在 bootstrap 之前）======
let token = localStorage.getItem('jwt') || null;
apiBaseHint.textContent = `API: ${API_BASE}`;

// 手機偵測 & 帳密正規化
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
    await fetchOpenStatus();
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
  owLoaded: false,
  bySeatData: null,

  // ⭐ 預訂設定
  preorderEnabled: false,
  preorderDates: [],

  // 預訂暫存
  preOrdersCache: new Map(), // key: `${date}-${seat}`
};

function isAdmin(){ return state.me?.role === 'admin'; }
async function safeRenderAdminReports(){
  if (isAdmin()) {
    await renderAgg();
    await renderMissing();
    await renderUnpaid(); // 今日未付款
    await initUnpaidPreDateSelect();
    await renderUnpaidPre(); // 預設第一個日期
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
  tabAllSeats?.classList.toggle('hidden', !admin);

  // 只有 admin 永遠看到「預訂」；一般使用者需預訂開啟才顯示（initApp 會更新一次）
  tabPreorder?.classList.toggle('hidden', !admin);

  document.querySelectorAll('.only-admin')
    .forEach(el => el.classList.toggle('hidden', !admin));
  document.querySelectorAll('.only-user')
    .forEach(el => el.classList.toggle('hidden', admin));

  // ✅ 非 admin 禁用已付款勾勾（訂單 + 預訂）
  if (paidEl) paidEl.disabled = !admin;
  if (prePaidEl) prePaidEl.disabled = !admin;

  adminAllSeats?.classList.toggle('hidden', !admin);
  if (admin) renderAllSeatsAdmin();

  // 一般使用者：座號 = 帳號；鎖定座號下拉（訂單與預訂兩邊）
  if (!admin) {
    const n = Number(user.username);
    if (Number.isInteger(n) && n>=1 && n<=36) {
      seatSelect.value = String(n);
      seatSelect.disabled = true;

      preSeatSelect.value = String(n);
      preSeatSelect.disabled = true;
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
    isOpenWindow = true;
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
      <span>
        ${o.paid ? '<span class="badge paid">已付款</span>' : ''}
        <span class="badge ${done?'ok':'pending'}">${done?'完成':'未完成'}</span>
      </span>
    </div>
    <div class="items">${detail}</div>
    <div class="row small" style="justify-content:space-between;margin-top:6px">
      <span>小計：$${subtotal.toLocaleString('zh-Hant-TW')}</span>
      ${o.internalOnly ? '<span class="badge pending" title="此座為內訂">內訂</span>' : ''}
    </div>
    <div class="seat-actions">
      <label class="small"><input type="checkbox" class="seat-internal" data-seat="${o.seat}" ${o.internalOnly?'checked':''}/> 內訂</label>
      <label class="small"><input type="checkbox" class="seat-paid" data-seat="${o.seat}" ${o.paid?'checked':''}/> 已付</label>
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
    await saveOrder(seat, { submitted:false, items:[], internalOnly:false, paid:false });
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
  if (t.classList.contains('seat-paid')) {
    const seat = Number(t.dataset.seat);
    try{
      await setOrderPaid(seat, t.checked);
      await renderSeatCardInto(seat);
      if (Number(seatSelect.value) === seat) await renderSeatOrder();
      await renderUnpaid();
    }catch(err){ alert('設定失敗：'+err.message); }
  }
});

// ====== UI 切頁 ======
function switchTab(which){
  const map = {
    orders: [tabOrders, pageOrders],
    preorder:[tabPreorder, pagePreorder],
    menus:  [tabMenus, pageMenus],
    reports:[tabReports, pageReports],
    logs:   [tabLogs, pageLogs],
    users:  [tabUsers, pageUsers],
  };
  for (const k of Object.keys(map)){
    const [btn, page] = map[k];
    btn?.classList.toggle('active', k===which);
    page?.classList.toggle('hidden', k!==which);
  }
  if (which==='reports') {
    safeRenderAdminReports();
    if (isAdmin() && !state.owLoaded) loadOpenWindowSettings();
  }
  if (which==='logs') { renderLogs(); }
  if (which==='users') { loadUsers(); }
}
tabOrders.onclick   = ()=>switchTab('orders');
tabPreorder.onclick = ()=>switchTab('preorder');
tabMenus.onclick    = ()=>switchTab('menus');
tabReports.onclick  = ()=>switchTab('reports');
tabLogs.onclick     = ()=>switchTab('logs');
tabUsers.onclick    = ()=>switchTab('users');
tabAllSeats?.addEventListener('click', ()=>{
  switchTab('orders');
  setTimeout(()=> adminAllSeats?.scrollIntoView({ behavior:'smooth', block:'start' }), 0);
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
// ⭐ 只改付款（admin；不受時段限制）
async function setOrderPaid(seat, paid){
  await api(`/orders/${seat}/paid`, { method:'PUT', body: JSON.stringify({ paid: !!paid }) });
}
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }
async function getUnpaid(){ return api('/reports/unpaid'); }

// ⭐ 預訂 API
async function loadPreSettings(){
  const s = await api('/settings/preorder', { method:'GET' });
  state.preorderEnabled = !!s.enabled;
  state.preorderDates = (s.dates||[]).map(d=>String(d));
}
async function savePreSettings(){
  const body = { enabled: preEnabledEl.checked, dates: state.preorderDates };
  await api('/settings/preorder', { method:'PUT', body: JSON.stringify(body) });
}
async function getPreorder(date, seat){
  const key = `${date}-${seat}`;
  if (state.preOrdersCache.has(key)) return state.preOrdersCache.get(key);
  const o = await api(`/preorders/${date}/${seat}`);
  state.preOrdersCache.set(key, o);
  return o;
}
async function savePreorder(date, seat, payload){
  await api(`/preorders/${date}/${seat}`, { method:'PUT', body: JSON.stringify(payload) });
  state.preOrdersCache.set(`${date}-${seat}`, payload);
}
async function setPreorderPaid(date, seat, paid){
  await api(`/preorders/${date}/${seat}/paid`, { method:'PUT', body: JSON.stringify({ paid: !!paid }) });
}
async function getPreUnpaid(date){ return api(`/preorders/${date}/unpaid`); }

// ====== Render（畫面）=====
function fmt(n){ return Number(n||0).toLocaleString('zh-Hant-TW'); }
function renderSeats(selectEl){
  selectEl.innerHTML = '';
  for(let s=MIN_SEAT; s<=MAX_SEAT; s++){
    const opt = document.createElement('option');
    opt.value=String(s); opt.textContent = `座號 ${s}`;
    selectEl.appendChild(opt);
  }
  selectEl.value = selectEl.value || '1';
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

  internalOnlyEl.checked = !!o.internalOnly;
  paidEl.checked = !!o.paid;
  // 再次保險：非 admin 一律禁用
  paidEl.disabled = !isAdmin();

  const lock = !!o.internalOnly;

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
async function renderUnpaid(){
  if (!unpaidList) return;
  unpaidList.textContent = '載入中…';
  try{
    const data = await getUnpaid();
    if (!data.list.length) { unpaidList.textContent = '全數已付款 🎉'; return; }
    unpaidList.innerHTML = data.list.map(r=>{
      const detail = r.items.length
        ? r.items.map(it=>`${it.name}×${it.qty}（$${it.unitPrice}）`).join('，')
        : '—';
      return `座號 ${r.seat}：$${fmt(r.subtotal)}　<span class="small">${detail}</span>`;
    }).join('<br>');
  }catch(e){
    unpaidList.textContent = '讀取失敗：' + e.message;
  }
}

// ⭐ 預訂渲染
function renderPreDateSelect(){
  preDateSelect.innerHTML = state.preorderDates.map(d=> `<option value="${d}">${d}</option>`).join('');
  unpaidPreDateSelect.innerHTML = preDateSelect.innerHTML;
}
function renderPreDatesList(){
  preDatesList.innerHTML = (state.preorderDates||[]).map(d=>`
    <span class="pill" data-date="${d}" style="display:inline-flex;align-items:center;gap:6px;margin:4px 6px 0 0">
      ${d} <button class="danger small removeDate" data-date="${d}" style="padding:2px 6px">移除</button>
    </span>
  `).join('') || '<span class="small muted">（尚無日期）</span>';
}
async function renderPreorder(){
  const date = preDateSelect.value;
  const seat = Number(preSeatSelect.value||1);
  const o = await getPreorder(date, seat);

  preInternalOnlyEl.checked = !!o.internalOnly;
  prePaidEl.checked = !!o.paid;
  prePaidEl.disabled = !isAdmin(); // 再次保險
  const lock = !!o.internalOnly;

  preCodeInput.disabled = lock;
  preQtyInput.disabled = lock;
  preAddByCode.disabled = lock;
  preManualName.disabled = lock;
  preManualPrice.disabled = lock;
  preManualQty.disabled = lock;
  preAddManual.disabled = lock;

  preOrderTbody.innerHTML = '';
  let subtotal = 0;
  (o.items||[]).forEach((it,idx)=>{
    const line = it.unitPrice * it.qty; subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td>
        <input type="number" min="1" value="${it.qty}"
               class="preQtyInput w120" data-idx="${idx}" ${lock?'disabled':''}/>
      </td>
      <td>${fmt(line)}</td>
      <td>${lock ? '' : `<button class="danger preDelBtn" data-idx="${idx}">刪除</button>`}</td>`;
    preOrderTbody.appendChild(tr);
  });
  preSeatSubtotal.textContent = fmt(subtotal);
}
async function initUnpaidPreDateSelect(){
  renderPreDateSelect();
  if (!unpaidPreDateSelect.value && state.preorderDates.length) {
    unpaidPreDateSelect.value = state.preorderDates[0];
  }
}
async function renderUnpaidPre(){
  if (!unpaidPreList) return;
  const date = unpaidPreDateSelect.value;
  unpaidPreList.textContent = '載入中…';
  try{
    const data = await getPreUnpaid(date);
    if (!data.list.length) { unpaidPreList.textContent = '全數已付款 🎉'; return; }
    unpaidPreList.innerHTML = data.list.map(r=>{
      const detail = r.items.length
        ? r.items.map(it=>`${it.name}×${it.qty}（$${it.unitPrice}）`).join('，')
        : '—';
      return `座號 ${r.seat}：$${fmt(r.subtotal)}　<span class="small">${detail}</span>`;
    }).join('<br>');
  }catch(e){
    unpaidPreList.textContent = '讀取失敗：' + e.message;
  }
}

// Logs
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
async function fetchAllUsers() {
  const pageSize = 100;
  let page = 1;
  let all = [];
  while (true) {
    const data = await listUsersAdv({ page, pageSize });
    const chunk = data.users || [];
    all = all.concat(chunk);
    if (typeof data.total === 'number' && all.length >= data.total) break;
    if (chunk.length < pageSize) break;
    page += 1;
  }
  return all;
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
    const users = await fetchAllUsers();
    const title = document.querySelector('#pageUsers .card.mt8 h3');
    if (title) {
      title.innerHTML = `使用者列表 <span class="small muted">（共 ${users.length} 筆）</span>`;
    }
    usersTableBody.innerHTML = users.map(u=>`
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

// ====== 菜單表格：編輯/刪除 ======
menuTableBody.addEventListener('change', async (e)=>{
  const t = e.target;
  if (t.classList.contains('nameEdit') || t.classList.contains('priceEdit')) {
    const id = Number(t.dataset.id);
    const tr = t.closest('tr');
    if (!tr) return;
    const name = tr.querySelector(`.nameEdit[data-id="${id}"]`)?.value?.trim() ?? '';
    const priceVal = tr.querySelector(`.priceEdit[data-id="${id}"]`)?.value ?? '0';
    const price = Number(priceVal);
    if (!name) return alert('品名不可空白');
    if (Number.isNaN(price) || price < 0) return alert('價格需為 >= 0 的數字');
    try{
      await updateMenuItemReq(id, name, price);
      renderMenuPage();
      renderActiveMenu();
    }catch(err){
      alert('更新失敗：'+err.message);
    }
  }
});
menuTableBody.addEventListener('click', async (e)=>{
  const t = e.target;
  if (t.classList.contains('delItem')) {
    const id = Number(t.dataset.id);
    if (!confirm('確定刪除此項目？')) return;
    try{
      await deleteMenuItemReq(id);
      await loadMenus();
      renderMenuPage();
      renderActiveMenu();
    }catch(err){
      alert('刪除失敗：'+err.message);
    }
  }
});

// ====== 訂單事件 ======
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
  await saveOrder(seat, { submitted:false, items:[], internalOnly:false, paid:false });
  state.ordersCache.delete(seat);
  await renderSeatOrder();
  await safeRenderAdminReports();
  if (isAdmin()) await renderSeatCardInto(seat);
});

// 內訂勾選（單座）
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
// ⭐ 已付款（單座）— 僅 admin；不受時段限制
paidEl?.addEventListener('change', async ()=>{
  if (!isAdmin()) {
    alert('僅管理員可變更付款狀態');
    paidEl.checked = !paidEl.checked; // 還原
    return;
  }
  const seat = Number(seatSelect.value||1);
  try{
    await setOrderPaid(seat, paidEl.checked);
    await renderSeatOrder();
    if (isAdmin()) {
      await renderSeatCardInto(seat);
      await renderUnpaid();
    }
  }catch(e){ alert('設定失敗：'+e.message); }
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
  if (qty<=0) return alert('數量需 >= 1');
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

// ====== ⭐ 預訂事件 ======
preDateSelect?.addEventListener('change', ()=>{ renderPreorder(); });
preSeatSelect?.addEventListener('change', ()=>{ renderPreorder(); });

// 內訂（預訂）
preInternalOnlyEl?.addEventListener('change', async ()=>{
  const date = preDateSelect.value;
  const seat = Number(preSeatSelect.value||1);
  const o = await getPreorder(date, seat);
  if (preInternalOnlyEl.checked) {
    o.items = [{ name:'內訂', unitPrice:0, qty:1 }];
    o.internalOnly = true;
  } else {
    o.items = [];
    o.internalOnly = false;
  }
  try{
    await savePreorder(date, seat, o);
    await renderPreorder();
    if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
  }catch(e){ alert('儲存失敗：'+e.message); }
});
// 已付款（預訂）— 僅 admin；不受時段限制
prePaidEl?.addEventListener('change', async ()=>{
  if (!isAdmin()) {
    alert('僅管理員可變更付款狀態');
    prePaidEl.checked = !prePaidEl.checked;
    return;
  }
  const date = preDateSelect.value;
  const seat = Number(preSeatSelect.value||1);
  try{
    await setPreorderPaid(date, seat, prePaidEl.checked);
    await renderPreorder();
    if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
  }catch(e){ alert('設定失敗：'+e.message); }
});

preAddByCode?.addEventListener('click', async ()=>{
  const date = preDateSelect.value;
  const seat = Number(preSeatSelect.value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) { alert('已為「內訂」，不可加入其他品項'); return; }
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return alert('尚未選擇菜單');
  const code = Number(preCodeInput.value||0);
  const qty  = Number(preQtyInput.value||1);
  const it = m.items.find(x=>x.code===code);
  if (!it) return alert('查無此代號');
  if (qty<=0) return alert('數量需 >= 1');
  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await savePreorder(date, seat, o);
  preCodeInput.value=''; preQtyInput.value='1';
  await renderPreorder();
  if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
});
preAddManual?.addEventListener('click', async ()=>{
  const date = preDateSelect.value;
  const seat = Number(preSeatSelect.value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) { alert('已為「內訂」，不可加入其他品項'); return; }
  const name = (preManualName.value||'').trim();
  const price= Number(preManualPrice.value||0);
  const qty  = Number(preManualQty.value||1);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  if (qty<=0) return alert('數量需 >= 1');
  o.items.push({ name, unitPrice:price, qty });
  await savePreorder(date, seat, o);
  preManualName.value=''; preManualPrice.value=''; preManualQty.value='1';
  await renderPreorder();
  if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
});
preOrderTbody.addEventListener('input', async (e)=>{
  const t = e.target;
  if (t.classList.contains('preQtyInput')) {
    const date = preDateSelect.value;
    const seat = Number(preSeatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getPreorder(date, seat);
    if (o.internalOnly) { alert('內訂狀態不可編輯數量'); return; }
    o.items[idx].qty = Math.max(1, Number(t.value||1));
    await savePreorder(date, seat, o);
    await renderPreorder();
    if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
  }
});
preOrderTbody.addEventListener('click', async (e)=>{
  const t = e.target;
  if (t.classList.contains('preDelBtn')) {
    const date = preDateSelect.value;
    const seat = Number(preSeatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getPreorder(date, seat);
    if (o.internalOnly) { alert('內訂狀態不可刪除品項'); return; }
    o.items.splice(idx,1);
    await savePreorder(date, seat, o);
    await renderPreorder();
    if (isAdmin() && unpaidPreDateSelect.value===date) await renderUnpaidPre();
  }
});

// ⭐ 預訂設定事件
preAddDateBtn?.addEventListener('click', ()=>{
  const d = preAddDateEl.value;
  if (!d) return;
  if (!state.preorderDates.includes(d)) state.preorderDates.push(d);
  state.preorderDates.sort();
  renderPreDateSelect();
  renderPreDatesList();
});
preDatesList?.addEventListener('click', (e)=>{
  const t = e.target;
  if (t.classList.contains('removeDate')) {
    const d = t.dataset.date;
    state.preorderDates = state.preorderDates.filter(x=>x!==d);
    renderPreDateSelect();
    renderPreDatesList();
  }
});
preSaveDatesBtn?.addEventListener('click', async ()=>{
  try{
    await savePreSettings();
    preSettingsMsg.textContent = '已儲存';
    renderPreDateSelect();
    await initUnpaidPreDateSelect();
  }catch(e){ preSettingsMsg.textContent = '儲存失敗：'+e.message; }
});
preReloadBtn?.addEventListener('click', async ()=>{
  try{
    await loadPreSettings();
    preEnabledEl.checked = state.preorderEnabled;
    renderPreDateSelect();
    renderPreDatesList();
    preSettingsMsg.textContent = '已載入';
    await initUnpaidPreDateSelect();
  }catch(e){ preSettingsMsg.textContent = '讀取失敗：'+e.message; }
});
reloadUnpaidPre?.addEventListener('click', renderUnpaidPre);
unpaidPreDateSelect?.addEventListener('change', renderUnpaidPre);

// ====== 初始化 ======
function renderSeatsThenDefault(){
  renderSeats(seatSelect);
  renderSeats(preSeatSelect);
  if (!seatSelect.value) seatSelect.value = '1';
  if (!preSeatSelect.value) preSeatSelect.value = '1';
}
function renderStatic(){ renderSeatsThenDefault(); }
async function initApp(){
  await loadMenus();
  renderActiveMenu();
  renderMenuPage();

  // 載入預訂設定
  await loadPreSettings();
  preEnabledEl && (preEnabledEl.checked = state.preorderEnabled);
  renderPreDateSelect();
  renderPreDatesList();

  // 一般使用者看不見預訂（若關閉）
  if (!isAdmin()) tabPreorder.classList.toggle('hidden', !state.preorderEnabled);

  // 訂單 & 預訂初次渲染
  await renderSeatOrder();
  if (state.preorderDates.length) preDateSelect.value = state.preorderDates[0];
  await renderPreorder();

  await safeRenderAdminReports();
  if (isAdmin()) await renderAllSeatsAdmin();
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
