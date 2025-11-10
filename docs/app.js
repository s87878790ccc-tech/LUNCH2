// ====== 調整這個成你的後端 API 網址 ======
const API_BASE = 'https://lunch2.onrender.com/api';

/* =========================
   DOM 既有元素
   ========================= */
const app = document.getElementById('app');
const loginLayer = document.getElementById('loginLayer');
function initLoginLayerStyles() {
  if (!loginLayer) return;
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
const loginLoading = document.getElementById('loginLoading');
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
const purgeOrdersBtn = document.getElementById('purgeOrdersBtn');
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
const activeMenuNote = document.getElementById('activeMenuNote');
const activeMenuList = document.getElementById('activeMenuList');
const menuView = document.getElementById('menuView');

const menuSelect = document.getElementById('menuSelect');
const useMenu = document.getElementById('useMenu');
const addMenu = document.getElementById('addMenu');
const menuNewName = document.getElementById('menuNewName');
const renameMenu = document.getElementById('renameMenu');
const dupMenu = document.getElementById('dupMenu');
const delMenu = document.getElementById('delMenu');
const menuNote = document.getElementById('menuNote');
const menuImage = document.getElementById('menuImage');
const menuImageClear = document.getElementById('menuImageClear');
const menuImagePreview = document.getElementById('menuImagePreview');
const menuImageStatus = document.getElementById('menuImageStatus');
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

const imageLightbox = document.getElementById('imageLightbox');

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
if (apiBaseHint) apiBaseHint.textContent = `API: ${API_BASE}`;

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

function escapeHtml(str=''){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function noteToHtml(note=''){
  return escapeHtml(note).replace(/\r?\n/g,'<br>');
}

function safeText(value) {
  return escapeHtml(value == null ? '' : String(value));
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const taiwanTimeFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatTaiwanTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const formatted = taiwanTimeFormatter.format(d);
  return formatted
    .replace(/[\u200E\u200F]/g, '')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildImageThumb(url='', alt=''){
  const safeUrl = escapeHtml(url || '');
  const safeAlt = escapeHtml(alt || '');
  if (!url) return '<div class="menu-thumb placeholder">無圖片</div>';
  return `<button type="button" class="menu-thumb-btn" data-url="${safeUrl}" data-alt="${safeAlt}" title="點擊放大">` +
    `<img src="${safeUrl}" alt="${safeAlt}" class="menu-thumb" loading="lazy"/></button>`;
}
function normalizeMenu(menu = {}) {
  const items = Array.isArray(menu.items)
    ? menu.items.map(it => ({ id: it.id, code: it.code, name: it.name, price: it.price }))
    : [];
  return {
    ...menu,
    note: typeof menu.note === 'string' ? menu.note : '',
    imageUrl: typeof menu.imageUrl === 'string' ? menu.imageUrl : '',
    imageFilename: typeof menu.imageFilename === 'string' ? menu.imageFilename : '',
    items,
  };
}

function updateMenuImagePreview(url='', name=''){
  if (menuImagePreview) menuImagePreview.innerHTML = buildImageThumb(url, name);
  if (menuImageClear) {
    const shouldHide = !url;
    menuImageClear.classList.toggle('hidden', shouldHide);
    menuImageClear.disabled = shouldHide || menuImage?.disabled;
  }
}

async function handleMenuImageChange(){
  if (!menuImage || menuImage.disabled) return;
  const file = menuImage.files?.[0];
  if (!file) {
    if (menuImageStatus) menuImageStatus.textContent = '';
    return;
  }
  const menuId = state.activeMenuId;
  const menu = state.menus.find(x => x.id === menuId);
  if (!menu) { menuImage.value = ''; return; }
  if (menuImageStatus) menuImageStatus.textContent = '上傳中...';
  try {
    const { url, filename } = await uploadImageFile(file);
    await saveMenuDetails(menu.id, { name: menu.name || '', note: menu.note || '', imageFilename: filename, imageUrl: url });
    updateMenuImagePreview(url, menu.name || '');
    if (menuImageStatus) {
      menuImageStatus.textContent = '已更新圖片';
      setTimeout(()=>{ if (menuImageStatus.textContent === '已更新圖片') menuImageStatus.textContent=''; }, 2000);
    }
    renderActiveMenu();
  } catch (err) {
    console.error(err);
    alert('上傳失敗：' + err.message);
    if (menuImageStatus) menuImageStatus.textContent = '';
  } finally {
    menuImage.value = '';
    renderMenuPage();
  }
}

async function clearMenuImage(e){
  if (e) e.preventDefault();
  const menuId = state.activeMenuId;
  const menu = state.menus.find(x => x.id === menuId);
  if (!menu) return;
  try {
    await saveMenuDetails(menu.id, { name: menu.name || '', note: menu.note || '', imageFilename: '', imageUrl: '' });
    updateMenuImagePreview('', menu.name || '');
    if (menuImageStatus) {
      menuImageStatus.textContent = '已移除圖片';
      setTimeout(()=>{ if (menuImageStatus.textContent === '已移除圖片') menuImageStatus.textContent=''; }, 2000);
    }
    if (menuImage) menuImage.value = '';
    renderActiveMenu();
    renderMenuPage();
  } catch (err) {
    alert('移除圖片失敗：' + err.message);
  }
}

function showImageLightbox(url, alt=''){
  if (!url) return;
  if (!imageLightbox) { window.open(url, '_blank'); return; }
  const img = imageLightbox.querySelector('img');
  if (img) {
    img.src = url;
    img.alt = alt || '預覽圖片';
  }
  imageLightbox.classList.remove('hidden');
}

function hideImageLightbox(){
  if (!imageLightbox) return;
  const img = imageLightbox.querySelector('img');
  if (img) img.src = '';
  imageLightbox.classList.add('hidden');
}

if (imageLightbox){
  imageLightbox.addEventListener('click', (e)=>{
    if (e.target === imageLightbox) hideImageLightbox();
  });
  imageLightbox.querySelector('.image-lightbox-close')?.addEventListener('click', hideImageLightbox);
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && !imageLightbox.classList.contains('hidden')) hideImageLightbox();
  });
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.menu-thumb-btn');
  if (!btn) return;
  e.preventDefault();
  const url = btn.dataset.url;
  if (!url) return;
  const alt = btn.dataset.alt || '';
  showImageLightbox(url, alt);
});

function authHeader() {
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}
function showLogin(options = {}) {
  const { keepLoading = false } = options;
  if (!loginLayer || !app) return;
  setLoginLoading(!!keepLoading);
  loginLayer.classList.remove('hidden');
  loginLayer.style.display = 'flex';
  loginLayer.style.pointerEvents = 'auto';
  loginLayer.setAttribute('aria-hidden', 'false');
  app.classList.add('hidden');
  app.style.filter = 'none';
  app.setAttribute('aria-hidden', 'true');
  if (!keepLoading && loginUser) {
    requestAnimationFrame(() => loginUser.focus());
  }
}
function showApp() {
  if (!loginLayer || !app) return;
  loginLayer.classList.add('hidden');
  loginLayer.style.display = 'none';
  loginLayer.style.pointerEvents = 'none';
  loginLayer.setAttribute('aria-hidden', 'true');
  app.classList.remove('hidden');
  app.style.filter = 'none';
  app.setAttribute('aria-hidden', 'false');
}
function setLoginLoading(isLoading){
  if (!loginLoading) return;
  loginLoading.classList.toggle('hidden', !isLoading);
  loginLoading.setAttribute('aria-hidden', String(!isLoading));
  loginLoading.setAttribute('aria-busy', String(!!isLoading));
  [loginUser, loginPass, loginBtn].forEach((el)=>{
    if (el) el.disabled = !!isLoading;
  });
}
initLoginLayerStyles();
showLogin({ keepLoading: !!token });

/* =========================
   登入/登出
   ========================= */
loginBtn.onclick = async () => {
  loginMsg.textContent = '';
  setLoginLoading(true);
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
  } finally {
    setLoginLoading(false);
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
const pendingFetches = new Map();

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const dedupeKey = method === 'GET' && options.dedupe !== false ? `${method}:${path}` : null;
  if (dedupeKey && pendingFetches.has(dedupeKey)) {
    return pendingFetches.get(dedupeKey);
  }

  const exec = (async () => {
    let fetchOptions = { ...options, method };
    const headers = { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) };
    // Avoid setting Content-Type when uploading FormData
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }
    fetchOptions = { ...fetchOptions, headers };

    const res = await fetch(API_BASE + path, fetchOptions);
    const raw = await res.text();
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim();
    let data = null;
    if (ct === 'application/json' && raw) {
      try { data = JSON.parse(raw); } catch {}
    }

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
  })();

  if (!dedupeKey) return exec;
  pendingFetches.set(dedupeKey, exec);
  try {
    return await exec;
  } finally {
    pendingFetches.delete(dedupeKey);
  }
}

async function uploadImageFile(file){
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(API_BASE + '/uploads/images', {
    method: 'POST',
    headers: { ...authHeader() },
    body: form,
  });
  const raw = await res.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch {} }

  if (res.status === 401) {
    localStorage.removeItem('jwt'); token = null;
    showLogin();
    throw new Error(data?.message || 'unauthorized');
  }
  if (!res.ok) {
    const msg = data?.message || raw || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  if (!data?.url || !data?.filename) throw new Error('未取得上傳結果');
  return { url: data.url, filename: data.filename };
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
  state.me = user; // 預期 { id, username, role }
  whoami.textContent = `${user.username}（${user.role}）`;
  const admin = isAdmin();

  // 顯示/隱藏各頁籤
  tabLogs.classList.toggle('hidden', !admin);
  tabUsers.classList.toggle('hidden', false);
  tabMenus.classList.toggle('hidden', !admin);
  tabReports.classList.toggle('hidden', !admin);

  document.querySelectorAll('.only-admin')
    .forEach(el => el.classList.toggle('hidden', !admin));
  document.querySelectorAll('.only-user')
    .forEach(el => el.classList.toggle('hidden', admin));

  // ✅ 先解鎖座號下拉，確保 admin 一定可以切換
  if (seatSelect) seatSelect.disabled = false;

  // Admin 顯示「全部座號一覽」
  adminAllSeats?.classList.toggle('hidden', !admin);
  if (admin) renderAllSeatsAdmin();

  // 一般使用者：座號 = 帳號；鎖定座號下拉
  if (!admin) {
    const n = Number(user.username);
    if (Number.isInteger(n) && n >= MIN_SEAT && n <= MAX_SEAT) {
      seatSelect.value = String(n);
      seatSelect.disabled = true;   // 只有一般使用者才鎖
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
    closedBanner.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = '目前不在點餐時段';
    const info = document.createElement('div');
    info.className = 'small';
    info.textContent = `開放時段：週${(data.openDays||[]).join('、')}，${data.openStart}~${data.openEnd}（現在：${nowStr}）`;
    closedBanner.appendChild(title);
    closedBanner.appendChild(info);
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
    bySeatTBody.replaceChildren();
    const frag = document.createDocumentFragment();
    state.bySeatData.forEach(r => {
      const tr = document.createElement('tr');

      const seatTd = document.createElement('td');
      seatTd.textContent = String(r.seat);
      tr.appendChild(seatTd);

      const statusTd = document.createElement('td');
      statusTd.textContent = seatStatusText(r);
      tr.appendChild(statusTd);

      const subtotalTd = document.createElement('td');
      subtotalTd.textContent = r.subtotal.toLocaleString('zh-Hant-TW');
      tr.appendChild(subtotalTd);

      const detailTd = document.createElement('td');
      if (r.items.length) {
        detailTd.textContent = r.items
          .map(it => `${it.name}×${safeNumber(it.qty)}（$${fmt(it.unitPrice)}）`)
          .join('，');
      } else {
        const span = document.createElement('span');
        span.className = 'muted small';
        span.textContent = '—';
        detailTd.appendChild(span);
      }
      tr.appendChild(detailTd);

      frag.appendChild(tr);
    });
    bySeatTBody.appendChild(frag);
    loadBySeatMsg.textContent = `完成（共 ${state.bySeatData.filter(x=>x.subtotal>0).length} 人有填單）`;
  }catch(e){
    bySeatTBody.innerHTML = `<tr><td colspan="4">讀取失敗：${safeText(e.message)}</td></tr>`;
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
    ? o.items.map(it=>`${safeText(it.name)}×${safeNumber(it.qty)}（$${fmt(it.unitPrice)}）`).join('，')
    : '<span class="muted small">—</span>';
  const seatNum = safeNumber(o.seat);
  return `
  <div class="seat-card" id="seat-card-${seatNum}">
    <div class="hdr">
      <strong>座號 ${seatNum}</strong>
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
        <input type="checkbox" class="seat-internal" data-seat="${seatNum}" ${o.internalOnly?'checked':''}/>
        內訂
      </label>
      <button class="seat-edit" data-seat="${seatNum}">編輯</button>
      <button class="danger seat-clear" data-seat="${seatNum}">清空</button>
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
  const prevActive = state.activeMenuId;
  state.menus = (data.menus || []).map(normalizeMenu);
  const serverActive = data.activeMenuId ?? null;
  const keep = prevActive && state.menus.some(m => m.id === prevActive) ? prevActive : null;
  state.activeMenuId = keep ?? serverActive ?? (state.menus[0]?.id ?? null);
}
async function setActiveMenu(menuId){
  await api('/settings/active-menu', { method:'PUT', body: JSON.stringify({ menuId }) });
  state.activeMenuId = menuId;
}
async function createMenu(name, note='', imageFilename=''){
  const payload = { name, note };
  if (typeof imageFilename === 'string' && imageFilename.trim()) {
    payload.imageFilename = imageFilename.trim();
  }
  const m = await api('/menus', { method:'POST', body: JSON.stringify(payload) });
  const normalized = normalizeMenu(m);
  state.menus.push(normalized);
  state.activeMenuId = normalized.id;
}
async function saveMenuDetails(id, { name, note='', imageFilename, imageUrl }){
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const noteRaw = typeof note === 'string' ? note : '';
  const cleanNote = noteRaw ? noteRaw.slice(0, 2000) : '';
  const payload = { name: cleanName, note: cleanNote };
  let imageFieldSent = false;
  let cleanFilename = '';
  if (typeof imageFilename === 'string') {
    cleanFilename = imageFilename.trim();
    payload.imageFilename = cleanFilename;
    imageFieldSent = true;
  }
  await api(`/menus/${id}`, { method:'PUT', body: JSON.stringify(payload) });
  const m = state.menus.find(x=>x.id===id);
  if (m) {
    m.name = cleanName;
    m.note = cleanNote;
    if (imageFieldSent) {
      m.imageFilename = cleanFilename;
      if (cleanFilename) {
        if (typeof imageUrl === 'string' && imageUrl) {
          m.imageUrl = imageUrl;
        }
      } else {
        m.imageUrl = '';
      }
    }
  }
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
    state.ordersCache.delete(seat);
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

function buildMenuPreview(menu, { compact=false } = {}){
  if (!menu) return '<div class="muted small">(尚未選擇菜單)</div>';
  const parts = [];
  const safeMenuName = menu?.name || '';
  if (menu.imageUrl) {
    parts.push(`<div class="menu-preview-cover">${buildImageThumb(menu.imageUrl, safeMenuName)}</div>`);
  }
  const items = Array.isArray(menu.items) ? menu.items : [];
  if (!items.length) {
    parts.push('<div class="muted small">(此菜單沒有項目)</div>');
  } else {
    const listClass = compact ? 'menu-preview-list compact' : 'menu-preview-list';
    const body = items.map(it => {
      const safeName = escapeHtml(it.name || '');
      const safeCode = escapeHtml(String(it.code ?? ''));
      const codeLabel = safeCode ? `#${safeCode} ` : '';
      const imgHtml = it.imageUrl ? buildImageThumb(it.imageUrl, it.name || '') : '';
      return `
      <div class="menu-preview-item">
        ${imgHtml}
        <div class="menu-preview-text">
          <div class="menu-preview-name">${codeLabel}${safeName}</div>
          <div class="menu-preview-price">$${fmt(it.price)}</div>
        </div>
      </div>`;
    }).join('');
    parts.push(`<div class="${listClass}">${body}</div>`);
  }
  const cls = compact ? 'menu-preview-host compact' : 'menu-preview-host';
  return `<div class="${cls}">${parts.join('')}</div>`;
}

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
  const rawNote = m?.note ?? '';
  const hasNote = rawNote.trim().length > 0;
  if (activeMenuNote) {
    if (hasNote) {
      activeMenuNote.innerHTML = noteToHtml(rawNote);
      activeMenuNote.classList.remove('hidden');
    } else {
      activeMenuNote.innerHTML = '';
      activeMenuNote.classList.add('hidden');
    }
  }
  if (activeMenuList) activeMenuList.innerHTML = buildMenuPreview(m);
  const compactNote = hasNote ? `<div class="menu-note-block compact">${noteToHtml(rawNote)}</div>` : '';
  const compactList = buildMenuPreview(m, { compact:true });
  if (menuView) menuView.innerHTML = compactNote + compactList;
  const preMenuViewEl = document.getElementById('preMenuView');
  if (preMenuViewEl) preMenuViewEl.innerHTML = compactNote + compactList;
}
function renderMenuPage(){
  if (!menuSelect) return;
  menuSelect.innerHTML = state.menus
    .map((m,i)=>`<option value="${m.id}">${i+1}. ${escapeHtml(m.name)}</option>`)
    .join('');
  if (state.activeMenuId) menuSelect.value = String(state.activeMenuId);
  menuSelect.disabled = state.menus.length === 0;
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (menuNewName) {
    menuNewName.value = m?.name || '';
    menuNewName.disabled = !m;
  }
  if (menuNote) {
    menuNote.value = m?.note || '';
    menuNote.disabled = !m;
  }
  if (menuImage) menuImage.disabled = !m;
  if (menuImageStatus && !m) menuImageStatus.textContent = '';
  updateMenuImagePreview(m?.imageUrl || '', m?.name || '');
  if (useMenu) useMenu.disabled = !m;
  if (renameMenu) renameMenu.disabled = !m;
  if (dupMenu) dupMenu.disabled = !m;
  if (delMenu) delMenu.disabled = !m;
  if (itemName) itemName.disabled = !m;
  if (itemPrice) itemPrice.disabled = !m;
  if (addItem) addItem.disabled = !m;
  if (!menuTableBody) return;
  menuTableBody.innerHTML = '';
  if (!m) return;
  m.items.forEach((it)=>{
    const tr = document.createElement('tr');
    const safeName = escapeHtml(it.name || '');
    const safePrice = escapeHtml(String(it.price ?? ''));
    tr.innerHTML = `
      <td>${it.code}</td>
      <td><input class="nameEdit" data-id="${it.id}" value="${safeName}" /></td>
      <td><input class="priceEdit w140" data-id="${it.id}" type="number" value="${safePrice}" /></td>
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

  let subtotal = 0;
  const frag = document.createDocumentFragment();
  o.items.forEach((it,idx)=>{
    const qty = safeNumber(it.qty, 1);
    const unitPrice = safeNumber(it.unitPrice, 0);
    const line = unitPrice * qty;
    subtotal += line;

    const tr = document.createElement('tr');

    const idxTd = document.createElement('td');
    idxTd.textContent = String(idx + 1);
    tr.appendChild(idxTd);

    const nameTd = document.createElement('td');
    const nameDiv = document.createElement('div');
    nameDiv.textContent = it.name;
    nameTd.appendChild(nameDiv);
    const updatedLabel = formatTaiwanTime(it.updatedAt);
    if (updatedLabel) {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'small muted item-note-time';
      noteDiv.textContent = `備註修改時間：${updatedLabel}`;
      nameTd.appendChild(noteDiv);
    }
    tr.appendChild(nameTd);

    const priceTd = document.createElement('td');
    priceTd.textContent = fmt(unitPrice);
    tr.appendChild(priceTd);

    const qtyTd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.value = String(qty);
    input.className = 'qtyInput w120';
    input.dataset.idx = String(idx);
    if (lock) input.disabled = true;
    qtyTd.appendChild(input);
    tr.appendChild(qtyTd);

    const subtotalTd = document.createElement('td');
    subtotalTd.textContent = fmt(line);
    tr.appendChild(subtotalTd);

    const actionTd = document.createElement('td');
    if (!lock) {
      const btn = document.createElement('button');
      btn.className = 'danger delBtn';
      btn.dataset.idx = String(idx);
      btn.textContent = '刪除';
      actionTd.appendChild(btn);
    }
    tr.appendChild(actionTd);

    frag.appendChild(tr);
  });
  orderTableBody.replaceChildren(frag);
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
  aggTableBody.replaceChildren();
  const frag = document.createDocumentFragment();
  data.items.forEach(r => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = r.name;
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    qtyTd.textContent = fmt(r.totalQty);
    tr.appendChild(qtyTd);

    const moneyTd = document.createElement('td');
    moneyTd.textContent = fmt(r.totalMoney);
    tr.appendChild(moneyTd);

    frag.appendChild(tr);
  });
  aggTableBody.appendChild(frag);
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
    logsTableBody.replaceChildren();
    const frag = document.createDocumentFragment();
    const logs = Array.isArray(data.logs) ? data.logs : [];
    logs.forEach(l => {
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = l.id == null ? '' : String(l.id);
      tr.appendChild(idTd);

      const ts = l.ts ? new Date(l.ts) : null;
      const tsTd = document.createElement('td');
      tsTd.textContent = ts ? ts.toLocaleString('zh-TW',{hour12:false}) : '';
      tr.appendChild(tsTd);

      const userTd = document.createElement('td');
      userTd.textContent = l.user_id == null ? '' : String(l.user_id);
      tr.appendChild(userTd);

      const actionTd = document.createElement('td');
      actionTd.textContent = l.action || '';
      tr.appendChild(actionTd);

      const detailsTd = document.createElement('td');
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = '0';
      let details = l.details;
      try {
        if (details) details = JSON.stringify(JSON.parse(details), null, 2);
      } catch {}
      pre.textContent = details || '';
      detailsTd.appendChild(pre);
      tr.appendChild(detailsTd);

      const ipTd = document.createElement('td');
      ipTd.textContent = l.ip || '';
      tr.appendChild(ipTd);

      const uaTd = document.createElement('td');
      uaTd.className = 'small muted';
      uaTd.textContent = (l.ua || '').slice(0,80);
      tr.appendChild(uaTd);

      frag.appendChild(tr);
    });
    logsTableBody.appendChild(frag);
  }catch(e){
    logsTableBody.innerHTML = `<tr><td colspan="7">讀取失敗：${safeText(e.message)}</td></tr>`;
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

  // 讀表頭實際欄位數，讓 colspan 跟著對
  const headCols = document.querySelector('#pageUsers thead tr')?.children.length || 4;

  if (!admin) {
    usersTableBody.innerHTML = `
      <tr>
        <td colspan="${headCols}">
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

      // ✅ 兼容 id/uid；仍拿不到則請使用者重新登入（避免 /users/undefined/password）
      const uid = Number(state.me?.id ?? state.me?.uid);
      if (!Number.isInteger(uid)) { alert('找不到使用者 ID，請重新登入後再試一次'); return; }

      try{
        await resetPasswordSelf(uid, oldP, newP);
        alert('已更新');
      }catch(e){
        alert('失敗：'+e.message);
      }
    };
    return;
  }

  usersTableBody.innerHTML = `<tr><td colspan="${headCols}">載入中…</td></tr>`;
  try{
    // 一次抓完全部頁次
    const users = await fetchAllUsers();

    // 顯示總筆數
    const title = document.querySelector('#pageUsers h3');
    if (title) {
      title.textContent = '使用者列表 ';
      const span = document.createElement('span');
      span.className = 'small muted';
      span.textContent = `（共 ${users.length} 筆）`;
      title.appendChild(span);
    }

    usersTableBody.replaceChildren();
    const frag = document.createDocumentFragment();
    users.forEach(u => {
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = String(u.id);
      idTd.dataset.label = 'ID';
      tr.appendChild(idTd);

      const usernameTd = document.createElement('td');
      usernameTd.textContent = u.username;
      usernameTd.dataset.label = '帳號';
      tr.appendChild(usernameTd);

      const roleTd = document.createElement('td');
      roleTd.textContent = u.role;
      roleTd.dataset.label = '角色';
      tr.appendChild(roleTd);

      const actionTd = document.createElement('td');
      actionTd.dataset.label = '操作';
      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';
      rowDiv.style.gap = '6px';
      rowDiv.style.flexWrap = 'wrap';
      rowDiv.style.alignItems = 'center';

      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = '新密碼(>=6)';
      input.id = `reset_${u.id}`;
      rowDiv.appendChild(input);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'resetPwd';
      resetBtn.dataset.id = String(u.id);
      resetBtn.textContent = '重設';
      rowDiv.appendChild(resetBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'danger delUser';
      delBtn.dataset.id = String(u.id);
      delBtn.textContent = '刪除';
      if (u.id === state.me.id) {
        delBtn.disabled = true;
        delBtn.title = '不可刪除自己';
      }
      rowDiv.appendChild(delBtn);

      actionTd.appendChild(rowDiv);
      tr.appendChild(actionTd);

      frag.appendChild(tr);
    });
    usersTableBody.appendChild(frag);
  }catch(e){
    usersTableBody.innerHTML = `<tr><td colspan="${headCols}">失敗：${safeText(e.message)}</td></tr>`;
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
  const t = e.target;

  // 重設密碼（admin）
  if (t.classList.contains('resetPwd')) {
    const id = Number(t.dataset.id);
    const input = document.getElementById(`reset_${id}`);
    const pwd = input?.value || '';
    if (!pwd || pwd.length < 6) return alert('新密碼至少 6 碼');
    try{
      await resetPasswordAdmin(id, pwd);
      input.value = '';
      alert('已重設');
    }catch(err){
      alert('重設失敗：' + err.message);
    }
  }

  // 刪除使用者（admin）
  if (t.classList.contains('delUser')) {
    const id = Number(t.dataset.id);
    if (!confirm(`確定要刪除使用者 ID=${id}？`)) return;
    try{
      await api(`/users/${id}`, { method: 'DELETE' });
      await loadUsers(); // 重新載入列表
      alert('已刪除');
    }catch(err){
      // 後端會保護：不可刪自己、至少保留一名管理員
      alert('刪除失敗：' + err.message);
    }
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

purgeOrdersBtn?.addEventListener('click', async ()=>{
  if (!isAdmin()) return alert('僅限管理員可操作');
  if (!confirm('確定要刪除今日全部訂單？此動作無法復原。')) return;
  if (!confirm('再次確認：真的要刪除今日全部訂單嗎？')) return;
  const originalLabel = purgeOrdersBtn.textContent;
  purgeOrdersBtn.disabled = true;
  purgeOrdersBtn.textContent = '刪除中…';
  try {
    await api('/orders/today', { method: 'DELETE' });
    state.ordersCache.clear();
    await renderSeatOrder();
    await safeRenderAdminReports();
    if (isAdmin()) await renderAllSeatsAdmin();
    alert('已刪除今日全部訂單');
  } catch (err) {
    alert('刪除失敗：' + err.message);
  } finally {
    purgeOrdersBtn.disabled = false;
    purgeOrdersBtn.textContent = originalLabel;
  }
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

menuSelect?.addEventListener('change', ()=>{
  state.activeMenuId = Number(menuSelect.value) || null;
  renderMenuPage();
  renderActiveMenu();
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
  const note = menuNote ? menuNote.value : '';
  await saveMenuDetails(id, { name, note });
  renderActiveMenu();
  renderMenuPage();
});
dupMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  const src = state.menus.find(x=>x.id===id);
  if (!src) return;
  await createMenu(src.name + '（副本）', src.note || '', src.imageFilename || '');
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

menuImage?.addEventListener('change', handleMenuImageChange);
menuImageClear?.addEventListener('click', clearMenuImage);

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

menuTableBody?.addEventListener('change', async (e)=>{
  const t = e.target;
  if (!t.classList.contains('nameEdit') && !t.classList.contains('priceEdit')) return;
  const tr = t.closest('tr');
  if (!tr) return;
  const id = Number(t.dataset.id || tr.querySelector('.nameEdit')?.dataset.id || tr.querySelector('.priceEdit')?.dataset.id);
  if (!id) return;
  const nameInput = tr.querySelector('.nameEdit');
  const priceInput = tr.querySelector('.priceEdit');
  const name = nameInput?.value?.trim() || '';
  const price = Number(priceInput?.value || 0);
  if (!name) { alert('品名不可為空'); renderMenuPage(); return; }
  if (!Number.isFinite(price) || price < 0) { alert('價格需 >= 0'); renderMenuPage(); return; }
  try{
    await updateMenuItemReq(id, name, price);
    await loadMenus();
    renderActiveMenu();
    renderMenuPage();
  }catch(err){
    alert('更新失敗：' + err.message);
    renderMenuPage();
  }
});
menuTableBody?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.delItem');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!id) return;
  if (!confirm('確定刪除此項目？')) return;
  try{
    await deleteMenuItemReq(id);
    await loadMenus();
    renderActiveMenu();
    renderMenuPage();
  }catch(err){
    alert('刪除失敗：' + err.message);
    renderMenuPage();
  }
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
          <div id="preMenuView" class="menu-preview-host compact mt8"></div>
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
  const preMenuView = document.getElementById('preMenuView');
  if (preMenuView) {
    const note = m?.note ?? '';
    const noteHtml = note.trim() ? `<div class="menu-note-block compact">${noteToHtml(note)}</div>` : '';
    preMenuView.innerHTML = noteHtml + buildMenuPreview(m, { compact:true });
  }

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
  wrap.replaceChildren();
  const frag = document.createDocumentFragment();
  arr.forEach(r => {
    const div = document.createElement('div');
    const seat = safeNumber(r.seat);
    const subtotal = fmt(r.subtotal);
    const items = (r.items || []).map(i => `${i.name}×${safeNumber(i.qty)}( $${fmt(i.unitPrice)} )`).join('，');
    div.textContent = `座號 ${seat}：$${subtotal} — ${items}`;
    frag.appendChild(div);
  });
  wrap.appendChild(frag);
}
function renderUnpaidPreList(arr){
  const wrap = document.getElementById('unpaidPreList');
  if (!arr.length) { wrap.innerHTML = '<div class="muted">（無）</div>'; return; }
  wrap.replaceChildren();
  const frag = document.createDocumentFragment();
  arr.forEach(r => {
    const div = document.createElement('div');
    const seat = safeNumber(r.seat);
    const subtotal = fmt(r.subtotal);
    const items = (r.items || []).map(i => `${i.name}×${safeNumber(i.qty)}( $${fmt(i.unitPrice)} )`).join('，');
    div.textContent = `座號 ${seat}：$${subtotal} — ${items}`;
    frag.appendChild(div);
  });
  wrap.appendChild(frag);
}
async function renderUnpaidOrders(){
  if (!isAdmin()) return;
  try{
    const data = await getUnpaidOrders();
    state.unpaidOrders = data.list || [];
    renderUnpaidOrdersList(state.unpaidOrders);
  }catch(e){
    document.getElementById('unpaidOrdersList').innerHTML = `<div class="muted">讀取失敗：${safeText(e.message)}</div>`;
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
    document.getElementById('unpaidPreList').innerHTML = `<div class="muted">讀取失敗：${safeText(e.message)}</div>`;
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
  wrap.replaceChildren();
  const frag = document.createDocumentFragment();
  arr.forEach(d => {
    const chip = document.createElement('span');
    chip.className = 'pill pre-date-chip';
    chip.dataset.date = d;
    chip.title = '點擊移除';
    chip.textContent = `${d} ✕`;
    chip.addEventListener('click', ()=>{
      state.pre.settings.dates = state.pre.settings.dates.filter(x=>x!==d);
      drawPreDatesChips();
    });
    frag.appendChild(chip);
  });
  wrap.appendChild(frag);
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

// 自動登入驗證（✅ /auth/me 現在統一回傳 { id, username, role }）
(async function bootstrap(){
  renderStatic();
  if (!token) return showLogin();
  try{
    showLogin({ keepLoading: true });
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
