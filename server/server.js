// ====== 調整這個成你的後端 API 網址 ======
const API_BASE = 'https://lunch2.onrender.com/api';

/* =========================
   DOM 既有元素
   ========================= */
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
// 可能有/沒有（新版 index.html 才有）
const tabAllSeats = document.getElementById('tabAllSeats');

const pageOrders  = document.getElementById('pageOrders');
const pageMenus   = document.getElementById('pageMenus');
const pageReports = document.getElementById('pageReports');
const pageLogs    = document.getElementById('pageLogs');
const pageUsers   = document.getElementById('pageUsers');

const seatSelect = document.getElementById('seatSelect');
// 舊版 UI 若有這個按鈕不會報錯
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

/* =========================
   登入/登出
   ========================= */
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
    await fetchOpenStatus();     // 公開開放狀態
    await fetchPreSettings();    // 預訂開關與日期
    ensurePreorderUI();          // 注入預訂頁與預訂設定卡片
    ensureUnpaidUI();            // 注入未付款卡片
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

/* =========================
   API helper
   ========================= */
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

/* =========================
   狀態
   ========================= */
const MIN_SEAT=1, MAX_SEAT=36;
const state = {
  me: null,
  menus: [],
  activeMenuId: null,
  ordersCache: new Map(),
  owLoaded: false,        // 後台時段設定是否載入過
  bySeatData: null,       // 後台座號明細暫存

  // ⭐ 預訂
  pre: {
    settings: { enabled:false, dates:[] },
    cache: new Map(), // key: `${date}::${seat}` => {submitted, internalOnly, paid, items}
  },

  // 未付款快取
  unpaidOrders: [],
  unpaidPreorders: [],
};

function isAdmin(){ return state.me?.role === 'admin'; }
async function safeRenderAdminReports(){
  if (isAdmin()) {
    await renderAgg();
    await renderMissing();
    await renderUnpaidOrders(); // 今日訂單未付款
  }
}

function onLoginUser(user){
  state.me = user;
  whoami.textContent = `${user.username}（${user.role}）`;
  const admin = isAdmin();
  tabLogs?.classList.toggle('hidden', !admin);
  tabUsers?.classList.toggle('hidden', false);
  tabMenus?.classList.toggle('hidden', !admin);
  tabReports?.classList.toggle('hidden', !admin);
  tabAllSeats?.classList.toggle('hidden', !admin);

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

/* =========================
   開放時段（公開用）
   ========================= */
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

/* =========================
   後台：點餐時段設定（admin）
   ========================= */
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

/* =========================
   後台：座號訂單合計與明細（admin）
   ========================= */
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

/* =========================
   Admin：全部座號一覽（卡片）
   ========================= */
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
      ${o.paid ? '<span class="badge ok" title="已付款">已付款</span>' : '<span class="badge pending" title="未付款">未付款</span>'}
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
});

/* =========================
   UI 切頁
   ========================= */
function switchTab(which){
  const map = {
    orders: [tabOrders, pageOrders],
    menus:  [tabMenus, pageMenus],
    reports:[tabReports, pageReports],
    logs:   [tabLogs, pageLogs],
    users:  [tabUsers, pageUsers],
    // 可能由程式動態加入
    preorders: [document.getElementById('tabPreorders'), document.getElementById('pagePreorders')],
  };
  for (const k of Object.keys(map)){
    const pair = map[k];
    if (!pair) continue;
    const [btn, page] = pair;
    if (!btn || !page) continue;
    btn.classList.toggle('active', k===which);
    page.classList.toggle('hidden', k!==which);
  }
  if (which==='reports') {
    safeRenderAdminReports();
    if (isAdmin() && !state.owLoaded) loadOpenWindowSettings();
    if (isAdmin()) { renderPreSettingsUI(); }
  }
  if (which==='logs') { renderLogs(); }
  if (which==='users') { loadUsers(); }
  if (which==='preorders') { renderPreorder(); }
}
tabOrders.onclick = ()=>switchTab('orders');
tabMenus.onclick  = ()=>switchTab('menus');
tabReports.onclick= ()=>switchTab('reports');
tabLogs.onclick   = ()=>switchTab('logs');
tabUsers.onclick  = ()=>switchTab('users');
tabAllSeats?.addEventListener('click', ()=>{
  switchTab('orders');
  document.getElementById('adminAllSeats')?.scrollIntoView({behavior:'smooth', block:'start'});
});

/* =========================
   菜單 & 訂單 API
   ========================= */
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
async function setOrderPaid(seat, paid){
  await api(`/orders/${seat}/paid`, { method:'PUT', body: JSON.stringify({ paid }) });
}
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }
async function getUnpaidOrders(){ return api('/reports/unpaid'); }

/* =========================
   Render（一般訂單頁）
   ========================= */
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
  if (activeMenuName) activeMenuName.textContent = m ? m.name : '(未選擇)';
  const list = (m?.items||[]).map(it =>
    `<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  if (activeMenuList) activeMenuList.innerHTML = list || '(此菜單沒有項目)';
  if (menuView) menuView.innerHTML = list;
}
function renderMenuPage(){
  if (!menuSelect) return;
  menuSelect.innerHTML = state.menus.map((m,i)=>`<option value="${m.id}">${i+1}. ${m.name}</option>`).join('');
  if (state.activeMenuId) menuSelect.value = String(state.activeMenuId);
  if (!menuTableBody) return;
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

  // ⭐ 已付款（tfoot 最後一格動態顯示；admin 可改）
  const paidCell = document.querySelector('#orderTable tfoot th:last-child');
  if (paidCell) {
    if (isAdmin()) {
      paidCell.innerHTML = `
        <label class="small">
          <input type="checkbox" id="paidCheckbox" ${o.paid?'checked':''}/>
          已付款（僅 admin）
        </label>`;
    } else {
      paidCell.innerHTML = `<span class="small muted">付款狀態：${o.paid ? '已付款' : '未付款'}</span>`;
    }
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

/* =========================
   Logs
   ========================= */
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

/* =========================
   使用者頁（抓全部分頁）
   ========================= */
async function listUsersAdv({q='',role='',status='',page=1,pageSize=20}={}) {
  const p = new URLSearchParams({ q, role, status, page, pageSize });
  return api('/users?'+p.toString());
}
// 自動翻頁抓完
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
    const title = document.querySelector('#pageUsers h3');
    if (title) title.innerHTML = `使用者列表 <span class="small muted">（共 ${users.length} 筆）</span>`;
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

/* =========================
   事件（一般訂單）
   ========================= */
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

// ⭐ 已付款（admin 專用）切換
document.querySelector('#orderTable tfoot')?.addEventListener('change', async (e)=>{
  const t = e.target;
  if (t.id === 'paidCheckbox') {
    if (!isAdmin()) { t.checked = !t.checked; return; }
    const seat = Number(seatSelect.value||1);
    try{
      await setOrderPaid(seat, t.checked);
      // 同步快取
      const o = await getOrder(seat);
      o.paid = t.checked;
      state.ordersCache.set(seat, o);
      await safeRenderAdminReports();
      if (isAdmin()) await renderSeatCardInto(seat);
    }catch(err){
      alert('更新付款狀態失敗：' + err.message);
      t.checked = !t.checked;
    }
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

/* =========================
   ⭐ 預訂便當區（UI + API）
   ========================= */
// 注入「預訂」分頁 & 預訂頁內容
function ensurePreorderUI(){
  // 新增 Tab（如不存在）
  if (!document.getElementById('tabPreorders')) {
    const right = document.querySelector('.topbar .right');
    const btn = document.createElement('button');
    btn.id = 'tabPreorders';
    btn.className = 'tab';
    btn.textContent = '預訂';
    btn.addEventListener('click', ()=>switchTab('preorders'));
    right.insertBefore(btn, right.querySelector('#whoami'));
  }
  // 新增 Page（如不存在）
  if (!document.getElementById('pagePreorders')) {
    const sec = document.createElement('section');
    sec.id = 'pagePreorders';
    sec.className = 'hidden';
    sec.innerHTML = `
      <div class="card">
        <h3>預訂便當</h3>
        <div class="row">
          <label>日期 <input id="preDate" type="date"></label>
          <label>座號 <select id="preSeatSelect"></select></label>
          <button id="preLoad" class="ghost">載入</button>
        </div>

        <div class="hr"></div>

        <details open>
          <summary><strong>由菜單代號新增</strong> <span class="small muted">（輸入代號與數量）</span></summary>
          <div class="row mt8">
            <input id="preCodeInput" type="number" min="1" placeholder="代號" class="w120" />
            <input id="preQtyInput" type="number" min="1" value="1" placeholder="數量" class="w120" />
            <button id="preAddByCode" class="primary">加入</button>
          </div>
          <div id="preMenuView" class="small muted mt8"></div>
        </details>

        <details>
          <summary><strong>手動新增餐點</strong></summary>
          <div class="row mt8">
            <input id="preManualName" placeholder="品名" />
            <input id="preManualPrice" type="number" placeholder="單價" class="w140" />
            <input id="preManualQty" type="number" placeholder="數量" value="1" class="w120" />
            <button id="preAddManual" class="ghost">新增</button>
          </div>
        </details>

        <div class="row mt8">
          <label><input type="checkbox" id="preInternalOnly" /> 內訂</label>
        </div>

        <div class="hr"></div>

        <table id="preTable">
          <thead>
            <tr><th>#</th><th>品名</th><th>單價</th><th>數量</th><th>小計</th><th></th></tr>
          </thead>
          <tbody></tbody>
          <tfoot>
            <tr>
              <th colspan="4" style="text-align:right">小計</th>
              <th id="preSubtotal">0</th>
              <th id="prePaidCell"></th>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="card only-admin" id="preAdminNote">
        <div class="small muted">
          管理員可隨時調整預訂內容與「已付款」；一般使用者只能在開啟「預訂」且日期允許時操作，且無法更改「已付款」。
        </div>
      </div>
    `;
    pageOrders.insertAdjacentElement('afterend', sec);

    // 綁定事件
    document.getElementById('preLoad').addEventListener('click', renderPreorder);
    document.getElementById('preAddByCode').addEventListener('click', preAddByCode);
    document.getElementById('preAddManual').addEventListener('click', preAddManual);
    document.getElementById('preTable').addEventListener('input', preOnQtyChange);
    document.getElementById('preTable').addEventListener('click', preOnDelete);
    document.getElementById('preInternalOnly').addEventListener('change', preOnInternalToggle);
    document.getElementById('preTable').addEventListener('change', preOnPaidToggle);
  }

  // 預設把菜單清單也顯示在預訂頁
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  const list = (m?.items||[]).map(it => `<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  document.getElementById('preMenuView').innerHTML = list || '(此菜單沒有項目)';

  // 填座號下拉
  const sel = document.getElementById('preSeatSelect');
  sel.innerHTML = '';
  for(let s=MIN_SEAT; s<=MAX_SEAT; s++){
    const opt = document.createElement('option');
    opt.value=String(s); opt.textContent = `座號 ${s}`;
    sel.appendChild(opt);
  }
  // 一般使用者鎖定自己的座號
  if (!isAdmin()) {
    const n = Number(state.me?.username);
    if (Number.isInteger(n) && n>=1 && n<=36) {
      sel.value = String(n);
      sel.disabled = true;
    }
  }
  // 預設日期：今天（字串 yyyy-mm-dd）
  const dt = new Date();
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  document.getElementById('preDate').value = `${yyyy}-${mm}-${dd}`;
}

// 後台：注入「預訂設定」與「未付款清單」
function ensureUnpaidUI(){
  if (!pageReports) return;
  // 未付款清單（如果還沒加）
  if (!document.getElementById('unpaidCard')) {
    const card = document.createElement('div');
    card.className = 'card mt8';
    card.id = 'unpaidCard';
    card.innerHTML = `
      <h3>未付款清單</h3>
      <div class="small muted">以下為「今日訂單」未付款名單。</div>
      <div id="unpaidOrdersList" class="mt8"></div>

      <div class="hr"></div>
      <div class="row">
        <label>預訂日期 <input type="date" id="unpaidPreDate"></label>
        <button id="loadUnpaidPre" class="ghost">載入預訂未付款</button>
      </div>
      <div id="unpaidPreList" class="mt8"></div>
    `;
    pageReports.appendChild(card);

    document.getElementById('loadUnpaidPre').addEventListener('click', renderUnpaidPreorders);
  }
}
function renderUnpaidOrdersList(arr){
  const wrap = document.getElementById('unpaidOrdersList');
  if (!arr.length) { wrap.innerHTML = '<div class="muted">（無）</div>'; return; }
  wrap.innerHTML = arr.map(r=>{
    const items = r.items.map(i=>`${i.name}×${i.qty}( \$${i.unitPrice} )`).join('，');
    return `<div>座號 ${r.seat}：$${fmt(r.subtotal)} — ${items}</div>`;
  }).join('');
}
function renderUnpaidPreList(arr){
  const wrap = document.getElementById('unpaidPreList');
  if (!arr.length) { wrap.innerHTML = '<div class="muted">（無）</div>'; return; }
  wrap.innerHTML = arr.map(r=>{
    const items = r.items.map(i=>`${i.name}×${i.qty}( \$${i.unitPrice} )`).join('，');
    return `<div>座號 ${r.seat}：$${fmt(r.subtotal)} — ${items}</div>`;
  }).join('');
}
async function renderUnpaidOrders(){
  if (!isAdmin()) return;
  try{
    const data = await getUnpaidOrders();
    state.unpaidOrders = data.list || [];
    renderUnpaidOrdersList(state.unpaidOrders);
  }catch(e){
    document.getElementById('unpaidOrdersList').innerHTML = `<div class="muted">讀取失敗：${e.message}</div>`;
  }
}
async function renderUnpaidPreorders(){
  if (!isAdmin()) return;
  const d = document.getElementById('unpaidPreDate').value;
  if (!d) return alert('請選擇日期');
  try{
    const data = await api(`/preorders/${encodeURIComponent(d)}/unpaid`);
    state.unpaidPreorders = data.list || [];
    renderUnpaidPreList(state.unpaidPreorders);
  }catch(e){
    document.getElementById('unpaidPreList').innerHTML = `<div class="muted">讀取失敗：${e.message}</div>`;
  }
}

// API：預訂設定
async function fetchPreSettings(){
  try{
    const s = await api('/settings/preorder');
    state.pre.settings = { enabled: !!s.enabled, dates: Array.isArray(s.dates)? s.dates : [] };
  }catch{
    state.pre.settings = { enabled:false, dates:[] };
  }
}
async function savePreSettings(enabled, dates){
  await api('/settings/preorder', {
    method:'PUT',
    body: JSON.stringify({ enabled, dates })
  });
  await fetchPreSettings();
}
// 報表頁注入/渲染 預訂設定（admin 專用）
function renderPreSettingsUI(){
  if (!isAdmin() || !pageReports) return;
  let card = document.getElementById('preSettingsCard');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card mt8 only-admin';
    card.id = 'preSettingsCard';
    card.innerHTML = `
      <h3>預訂設定</h3>
      <div class="row">
        <label><input type="checkbox" id="preEnabled"> 啟用預訂（顯示預訂分頁給一般使用者）</label>
        <button id="preSave" class="primary">儲存</button>
        <button id="preReload" class="ghost">重新載入</button>
        <span id="preMsg" class="small muted"></span>
      </div>
      <div class="row mt8">
        <label>新增允許日期 <input type="date" id="preAddDate"></label>
        <button id="preAddDateBtn">加入</button>
      </div>
      <div class="small muted">允許日期清單：</div>
      <div id="preDatesWrap" class="mt8"></div>
    `;
    pageReports.appendChild(card);

    document.getElementById('preSave').addEventListener('click', async ()=>{
      const enabled = document.getElementById('preEnabled').checked;
      const dates = [...document.querySelectorAll('.pre-date-chip')].map(ch=>ch.dataset.date);
      try{
        await savePreSettings(enabled, dates);
        document.getElementById('preMsg').textContent = '已儲存';
      }catch(e){
        document.getElementById('preMsg').textContent = '失敗：' + e.message;
      }
    });
    document.getElementById('preReload').addEventListener('click', async ()=>{
      await fetchPreSettings(); drawPreDatesChips();
      document.getElementById('preEnabled').checked = !!state.pre.settings.enabled;
      document.getElementById('preMsg').textContent = '已載入';
    });
    document.getElementById('preAddDateBtn').addEventListener('click', ()=>{
      const d = document.getElementById('preAddDate').value;
      if (!d) return;
      if (!state.pre.settings.dates.includes(d)) state.pre.settings.dates.push(d);
      drawPreDatesChips();
    });
  }
  // 同步狀態
  document.getElementById('preEnabled').checked = !!state.pre.settings.enabled;
  drawPreDatesChips();

  // 一般使用者：當預訂未啟用時隱藏預訂 Tab
  const tab = document.getElementById('tabPreorders');
  if (tab) tab.classList.toggle('hidden', !isAdmin() && !state.pre.settings.enabled);
}
function drawPreDatesChips(){
  const wrap = document.getElementById('preDatesWrap');
  const arr = state.pre.settings.dates || [];
  if (!arr.length) { wrap.innerHTML = '<div class="muted small">（尚未加入）</div>'; return; }
  wrap.innerHTML = arr.map(d=>`
    <span class="pill pre-date-chip" data-date="${d}" title="點擊移除">${d} ✕</span>
  `).join(' ');
  wrap.querySelectorAll('.pre-date-chip').forEach(ch=>{
    ch.addEventListener('click', ()=>{
      const d = ch.dataset.date;
      state.pre.settings.dates = state.pre.settings.dates.filter(x=>x!==d);
      drawPreDatesChips();
    });
  });
}

// 讀寫預訂
function preKey(date, seat){ return `${date}::${seat}`; }
async function getPreorder(date, seat){
  const key = preKey(date, seat);
  if (state.pre.cache.has(key)) return state.pre.cache.get(key);
  const o = await api(`/preorders/${encodeURIComponent(date)}/${seat}`);
  state.pre.cache.set(key, o);
  return o;
}
async function savePreorder(date, seat, order){
  await api(`/preorders/${encodeURIComponent(date)}/${seat}`, { method:'PUT', body: JSON.stringify(order) });
  state.pre.cache.set(preKey(date, seat), { date, seat, ...order });
}
async function setPreorderPaid(date, seat, paid){
  await api(`/preorders/${encodeURIComponent(date)}/${seat}/paid`, { method:'PUT', body: JSON.stringify({ paid }) });
}

// 渲染預訂頁
async function renderPreorder(){
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  if (!date) return;

  // 一般使用者若預訂關閉/日期不在清單，阻擋
  if (!isAdmin()){
    if (!state.pre.settings.enabled) {
      alert('預訂功能尚未啟用');
      return;
    }
    if (!state.pre.settings.dates.includes(date)) {
      alert('此日期不在可預訂清單');
      return;
    }
  }

  const o = await getPreorder(date, seat);

  const preInternalOnly = document.getElementById('preInternalOnly');
  preInternalOnly.checked = !!o.internalOnly;

  const TBody = document.querySelector('#preTable tbody');
  const Subtotal = document.getElementById('preSubtotal');
  const PaidCell = document.getElementById('prePaidCell');

  // 內訂鎖住輸入
  const lock = !!o.internalOnly;
  document.getElementById('preCodeInput').disabled = lock;
  document.getElementById('preQtyInput').disabled = lock;
  document.getElementById('preAddByCode').disabled = lock;
  document.getElementById('preManualName').disabled = lock;
  document.getElementById('preManualPrice').disabled = lock;
  document.getElementById('preManualQty').disabled = lock;
  document.getElementById('preAddManual').disabled = lock;

  TBody.innerHTML = '';
  let subtotal = 0;
  (o.items||[]).forEach((it, idx)=>{
    const line = Number(it.unitPrice) * Number(it.qty);
    subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td><input type="number" min="1" value="${it.qty}" class="preQty w120" data-idx="${idx}" ${lock?'disabled':''}/></td>
      <td>${fmt(line)}</td>
      <td>${lock?'':`<button class="danger preDel" data-idx="${idx}">刪除</button>`}</td>
    `;
    TBody.appendChild(tr);
  });
  Subtotal.textContent = fmt(subtotal);

  // 已付款（admin 可改）
  if (isAdmin()){
    PaidCell.innerHTML = `<label class="small"><input id="prePaidCheckbox" type="checkbox" ${o.paid?'checked':''}/> 已付款（僅 admin）</label>`;
  }else{
    PaidCell.innerHTML = `<span class="small muted">付款狀態：${o.paid?'已付款':'未付款'}</span>`;
  }
}
async function preAddByCode(){
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) return alert('已為「內訂」，不可加入其他品項');
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return alert('尚未選擇菜單');
  const code = Number(document.getElementById('preCodeInput').value||0);
  const qty  = Number(document.getElementById('preQtyInput').value||1);
  const it = m.items.find(x=>x.code===code);
  if (!it) return alert('查無此代號');
  if (qty<=0) return alert('數量需 >= 1');
  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await savePreorder(date, seat, o);
  document.getElementById('preCodeInput').value='';
  document.getElementById('preQtyInput').value='1';
  await renderPreorder();
  if (isAdmin()) await renderSeatCardInto(seat); // 不一定同日，但不影響
}
async function preAddManual(){
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) return alert('已為「內訂」，不可加入其他品項');
  const name = (document.getElementById('preManualName').value||'').trim();
  const price= Number(document.getElementById('preManualPrice').value||0);
  const qty  = Number(document.getElementById('preManualQty').value||1);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  if (qty<=0) return alert('數量需 >= 1');
  o.items.push({ name, unitPrice:price, qty });
  await savePreorder(date, seat, o);
  document.getElementById('preManualName').value='';
  document.getElementById('preManualPrice').value='';
  document.getElementById('preManualQty').value='1';
  await renderPreorder();
}
async function preOnQtyChange(e){
  const t = e.target;
  if (!t.classList.contains('preQty')) return;
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) return alert('內訂狀態不可編輯數量');
  const idx = Number(t.dataset.idx);
  o.items[idx].qty = Math.max(1, Number(t.value||1));
  await savePreorder(date, seat, o);
  await renderPreorder();
}
async function preOnDelete(e){
  const t = e.target;
  if (!t.classList.contains('preDel')) return;
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  const o = await getPreorder(date, seat);
  if (o.internalOnly) return alert('內訂狀態不可刪除品項');
  const idx = Number(t.dataset.idx);
  o.items.splice(idx,1);
  await savePreorder(date, seat, o);
  await renderPreorder();
}
async function preOnInternalToggle(){
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  const o = await getPreorder(date, seat);
  if (document.getElementById('preInternalOnly').checked) {
    o.items = [{ name:'內訂', unitPrice:0, qty:1 }];
    o.internalOnly = true;
  } else {
    o.items = [];
    o.internalOnly = false;
  }
  try{
    await savePreorder(date, seat, o);
    await renderPreorder();
  }catch(e){
    alert('儲存失敗：'+e.message);
  }
}
async function preOnPaidToggle(e){
  const t = e.target;
  if (t.id !== 'prePaidCheckbox') return;
  if (!isAdmin()) { t.checked = !t.checked; return; }
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value||1);
  try{
    await setPreorderPaid(date, seat, t.checked);
  }catch(err){
    alert('更新付款狀態失敗：' + err.message);
    t.checked = !t.checked;
  }
}

/* =========================
   初始化
   ========================= */
function renderSeatsThenDefault(){
  renderSeats();
  if (!seatSelect.value) seatSelect.value = '1';
}
function renderStatic(){ renderSeatsThenDefault(); }
async function initApp(){
  await loadMenus();
  renderActiveMenu();
  renderMenuPage();
  ensurePreorderUI();          // 確保預訂頁存在
  renderPreSettingsUI();       // 報表頁顯示預訂設定（admin）
  ensureUnpaidUI();            // 報表頁顯示未付款卡片
  await renderSeatOrder();
  await safeRenderAdminReports(); // 只在 admin 才打報表 API
  if (isAdmin()) await renderAllSeatsAdmin(); // admin 一進來就載入全部座號

  // 一般使用者若未啟用預訂，就隱藏預訂 Tab
  const tab = document.getElementById('tabPreorders');
  if (tab) tab.classList.toggle('hidden', !isAdmin() && !state.pre.settings.enabled);
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
    await fetchPreSettings();
    ensurePreorderUI();
    ensureUnpaidUI();
    await initApp();
    switchTab('orders');
    showApp();
  }catch{
    showLogin();
  }
})();
