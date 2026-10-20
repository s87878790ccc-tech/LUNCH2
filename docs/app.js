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
const logCategoryFilter = document.getElementById('logCategoryFilter');
const logCategoryHint = document.getElementById('logCategoryHint');
let logsCache = null;

const newUserName = document.getElementById('newUserName');
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
function readToken() {
  try { localStorage.removeItem('jwt'); } catch { /* Old persistent sessions are not reused. */ }
  try { return sessionStorage.getItem('jwt') || null; } catch { return null; }
}
function storeToken(value) {
  try { localStorage.removeItem('jwt'); } catch { /* Storage may be disabled. */ }
  try { value ? sessionStorage.setItem('jwt', value) : sessionStorage.removeItem('jwt'); } catch { /* In-memory login remains available. */ }
}
let token = readToken();
let sessionEpoch = 0;
let dataRevision = 0;
if (apiBaseHint) apiBaseHint.textContent = '訂單即時儲存';

// Responsive layout is handled by CSS; only account inputs need normalization.
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
  url = safeImageUrl(url);
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
  const menuId = state.editingMenuId;
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
  const menuId = state.editingMenuId;
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

let lightboxReturnFocus = null;
function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'https:' && !url.username && !url.password &&
      [location.origin, new URL(API_BASE).origin].includes(url.origin) ? url.href : '';
  } catch { return ''; }
}
function showImageLightbox(url, alt=''){
  url = safeImageUrl(url);
  if (!url) return;
  if (!imageLightbox) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
  const img = imageLightbox.querySelector('img');
  if (img) {
    img.src = url;
    img.alt = alt || '預覽圖片';
  }
  imageLightbox.classList.remove('hidden');
  lightboxReturnFocus = document.activeElement;
  app.inert = true;
  imageLightbox.querySelector('.image-lightbox-close')?.focus();
}

function hideImageLightbox(){
  if (!imageLightbox) return;
  const img = imageLightbox.querySelector('img');
  if (img) img.src = '';
  imageLightbox.classList.add('hidden');
  app.inert = false;
  if (lightboxReturnFocus?.isConnected) lightboxReturnFocus.focus();
  lightboxReturnFocus = null;
}

if (imageLightbox){
  imageLightbox.addEventListener('click', (e)=>{
    if (e.target === imageLightbox) hideImageLightbox();
  });
  imageLightbox.querySelector('.image-lightbox-close')?.addEventListener('click', hideImageLightbox);
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && !imageLightbox.classList.contains('hidden')) hideImageLightbox();
    if (e.key === 'Tab' && !imageLightbox.classList.contains('hidden')) {
      e.preventDefault(); imageLightbox.querySelector('.image-lightbox-close')?.focus();
    }
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
  hideInitialPasswordChange();
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
  if (state.me?.mustChangePassword) return showInitialPasswordChange();
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
listen(document.getElementById('loginForm'), 'submit', async (event) => {
  event.preventDefault();
  if (loginBtn.disabled) return;
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
    storeToken(token);
    onLoginUser(data.user);
    loginPass.value = '';
    if (data.user?.mustChangePassword) { showInitialPasswordChange(); return; }
    await Promise.all([fetchOpenStatus(), fetchPreSettings()]);
    ensurePreorderUI();          // 初始化預訂頁
    ensureUnpaidUI();            // 注入未付款卡片
    await initApp();
    switchTab('orders');
    if (token) showApp();
  } catch (e) {
    loginMsg.textContent = '登入失敗：' + e.message;
  } finally {
    setLoginLoading(false);
  }
});
async function signOut() {
  if (logoutBtn.disabled) return;
  logoutBtn.disabled = true;
  try { await api('/auth/logout', { method: 'POST', timeoutMs: 8000 }); }
  catch { /* Always remove this browser's session if the connection fails. */ }
  finally { clearSession(); showLogin(); logoutBtn.disabled = false; }
}
logoutBtn.onclick = signOut;
listen(document.getElementById('initialPasswordLogout'), 'click', signOut);

/* =========================
   API helper
   ========================= */
const pendingFetches = new Map();

async function api(path, options = {}) {
  const { dedupe = true, timeoutMs = 45_000, ...requestOptions } = options;
  const method = (requestOptions.method || 'GET').toUpperCase();
  const requestToken = token;
  const epoch = sessionEpoch;
  const key = method === 'GET' && dedupe ? `${epoch}:${dataRevision}:${path}` : null;
  if (key && pendingFetches.has(key)) return structuredClone(await pendingFetches.get(key));
  const request = (async () => {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (requestOptions.signal?.aborted) controller.abort();
    else requestOptions.signal?.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { ...authHeader(), ...(requestOptions.headers || {}) };
      if (requestOptions.body && !(requestOptions.body instanceof FormData)) headers['Content-Type'] = 'application/json';
      const res = await fetch(API_BASE + path, { ...requestOptions, method, headers, signal: controller.signal });
      const raw = await res.text();
      let data = null;
      if (raw) { try { data = JSON.parse(raw); } catch { /* Handle non-JSON error responses below. */ } }
      if (epoch !== sessionEpoch) throw new Error('登入狀態已變更，請重新操作');
      if (res.status === 401 && path !== '/auth/login' && requestToken === token) {
        clearSession();
        showLogin();
      }
      if (!res.ok) {
        if (res.status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED' && state.me && requestToken === token) {
          state.me.mustChangePassword = true; showInitialPasswordChange();
        }
        const messages = {
          'invalid credentials': '帳號或密碼不正確', 'account disabled': '帳號已停用',
          'invalid token': '登入已過期，請重新登入', 'no token': '請先登入',
          'forbidden': '你沒有執行此操作的權限', 'not in open window': '目前不在點餐時段',
          'oldPassword incorrect': '目前密碼不正確',
          'preorder not allowed for this date': '此日期尚未開放預訂',
          'too many login attempts, please try again shortly': '登入嘗試過於頻繁，請稍後再試',
        };
        const message = data?.message;
        throw Object.assign(new Error(messages[message] || message || (res.status === 429 ? '操作過於頻繁，請稍後再試' : `服務暫時無法回應（${res.status}）`)), { status: res.status });
      }
      if (res.status === 204) return null;
      if (data === null) throw new Error('伺服器回傳格式不正確，請稍後重試');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        dataRevision += 1;
        state.ordersCache.clear(); state.pre.cache.clear(); allSeatsSnapshot = null;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('連線逾時，請稍後重試；送出過的資料請重新載入確認');
      if (err instanceof TypeError) throw new Error('無法連線，請檢查網路後重試');
      throw err;
    } finally {
      clearTimeout(timer);
      requestOptions.signal?.removeEventListener('abort', forwardAbort);
    }
  })();
  if (key) pendingFetches.set(key, request);
  try { return structuredClone(await request); }
  finally { if (key && pendingFetches.get(key) === request) pendingFetches.delete(key); }
}

async function uploadImageFile(file) {
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('請選擇 JPG、PNG、GIF 或 WebP 圖片');
  if (file.size > 2 * 1024 * 1024) throw new Error('圖片大小不可超過 2 MB');
  const form = new FormData();
  form.append('image', file);
  const data = await api('/uploads/images', { method: 'POST', body: form });
  if (!data?.url || !data?.filename) throw new Error('未取得上傳結果');
  return data;
}

/* =========================
   狀態
   ========================= */
const MIN_SEAT=1, MAX_SEAT=2_147_483_647;
const baseSeats = () => Array.from({ length: 36 }, (_, i) => i + 1);
const state = {
  manualLocked: true,
  seats: baseSeats(),
  me: null,
  menus: [],
  activeMenuId: null,
  editingMenuId: null,
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

let noticeTimer;
function notify(message, error = false) {
  const el = document.getElementById('appNotice');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.add('hidden'), error ? 9000 : 4000);
}
function runTask(task) { return Promise.resolve().then(task).catch(err => notify(err.message || '操作失敗，請再試一次', true)); }
function listen(element, type, handler) {
  element?.addEventListener(type, event => {
    if (type === 'submit') event.preventDefault();
    const source = event.target.closest?.('button, input, select') || element;
    const checked = source.type === 'checkbox' ? source.checked : undefined;
    const lock = type === 'submit' || (type === 'click' && source.tagName === 'BUTTON');
    if (lock && source.dataset.busy) return;
    if (lock) { source.dataset.busy = 'true'; source.setAttribute('aria-busy', 'true'); }
    runTask(() => handler(event, checked)).finally(() => {
      if (lock) { delete source.dataset.busy; source.removeAttribute('aria-busy'); }
    });
  });
}
function resetClientState() {
  sessionEpoch += 1;
  state.me = null;
  closeCredentialDialog(true);
  hideInitialPasswordChange();
  state.seats = baseSeats();
  usersView.rows = []; usersView.generation++; usersView.lastCreated = null;
  for (const id of ['createUserStatus', 'usersLoadStatus']) document.getElementById(id).textContent = '';
  for (const id of ['userSearch', 'userRoleFilter', 'userStatusFilter']) document.getElementById(id).value = '';
  state.manualLocked = true;
  state.menus = [];
  state.activeMenuId = null;
  state.editingMenuId = null;
  state.ordersCache.clear();
  state.pre.cache.clear();
  state.pre.settings = { enabled: false, dates: [] };
  state.owLoaded = false;
  state.bySeatData = null;
  state.unpaidOrders = [];
  state.unpaidPreorders = [];
  logsCache = null;
  pendingFetches.clear();
  allSeatsSnapshot = null;
  overviewOrders.clear(); overviewContext = null; paymentPending.clear(); paymentUncertain.clear();
  document.getElementById('paymentSummary').replaceChildren();
  document.getElementById('paymentContext').textContent = '';
  document.getElementById('preDate').value = '';
  for (const node of [allSeatsGrid, usersTableBody, logsTableBody, aggTableBody, bySeatTBody, orderTableBody, document.querySelector('#preTable tbody')]) node?.replaceChildren();
  for (const id of ['unpaidOrdersList', 'unpaidPreList', 'missingList', 'newAdminActorPassword']) {
    const element = document.getElementById(id);
    if (element?.tagName === 'INPUT') element.value = '';
    else if (element) element.textContent = '';
  }
}
function clearSession() {
  token = null;
  storeToken(null);
  resetClientState();
  loginPass.value = '';
  hideImageLightbox();
}
function taiwanDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function validInteger(value, min, max) {
  return value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}
function labelOrderRows(table) {
  const labels = ['序號', '品名', '單價', '數量', '小計', '操作'];
  table.querySelectorAll('tbody tr').forEach(row => [...row.cells].forEach((cell, i) => { cell.dataset.label = labels[i] || ''; }));
}
function emptyOrder(tbody, message) {
  tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${safeText(message)}</td></tr>`;
}
let allSeatsSnapshot = null;
let overviewContext = null;
const overviewOrders = new Map();
const paymentPending = new Map();
const paymentUncertain = new Set();
const paymentKey = (seat, date = null) => `${sessionEpoch}:${date || 'today'}:${seat}`;
async function loadAllOrders(force = false) {
  const revision = dataRevision;
  if (!force && allSeatsSnapshot && Date.now() - allSeatsSnapshot.at < 15_000) return structuredClone(allSeatsSnapshot.orders);
  const data = await api('/orders', { dedupe: !force });
  if (revision !== dataRevision) return loadAllOrders(true);
  allSeatsSnapshot = { at: Date.now(), orders: data.orders || [] };
  overviewContext = { date: data.date, batch: data.batch };
  for (const order of allSeatsSnapshot.orders) state.ordersCache.set(order.seat, order);
  return structuredClone(allSeatsSnapshot.orders);
}
const orderQueues = new Map();
let purgingOrders = false;
function changeOrder(seat, change, date = null) {
  if (purgingOrders) return Promise.reject(new Error('正在清空訂單，請稍候'));
  const epoch = sessionEpoch;
  const key = `${epoch}:${date || 'today'}:${seat}`;
  if (paymentPending.has(key)) return Promise.reject(new Error('付款狀態正在儲存，請稍候再編輯此座號。'));
  const previous = orderQueues.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    if (epoch !== sessionEpoch) return;
    const route = date ? `/preorders/${encodeURIComponent(date)}/${seat}` : `/orders/${seat}`;
    const order = await api(route, { dedupe: false });
    await change(order);
    if (epoch !== sessionEpoch) return;
    try {
      if (date) await savePreorder(date, seat, order);
      else await saveOrder(seat, order);
    } catch (err) {
      state.ordersCache.delete(seat);
      if (date) state.pre.cache.delete(preKey(date, seat));
      if (token) await (date ? renderPreorder() : renderSeatOrder()).catch(() => {});
      throw err;
    }
    if (epoch !== sessionEpoch) return;
    const refresh = date ? renderPreorder() : Promise.all([
      renderSeatOrder(), safeRenderAdminReports(), isAdmin() ? renderSeatCardInto(seat) : Promise.resolve(),
    ]);
    await refresh.catch(() => notify('已儲存，但畫面更新失敗，請重新載入確認', true));
  });
  orderQueues.set(key, task);
  return task.finally(() => { if (orderQueues.get(key) === task) orderQueues.delete(key); });
}

function isAdmin(){ return state.me?.role === 'admin'; }
async function safeRenderAdminReports(){
  if (!isAdmin()) return;
  const results = await Promise.allSettled([renderAgg(), renderMissing(), renderUnpaidOrders()]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) notify('部分報表讀取失敗：' + failure.reason.message, true);
}

function onLoginUser(user){
  resetClientState();
  state.me = user;
  whoami.textContent = `${user.username}（${user.role}）`;
  const admin = isAdmin();
  document.getElementById('changeMyPasswordBtn').classList.toggle('hidden', !!user.mustChangePassword);

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
  tabAllSeats?.classList.toggle('hidden', !admin);

  // 一般使用者：座號 = 帳號；鎖定座號下拉
  if (!admin) {
    const n = Number(user.username);
    if (Number.isInteger(n) && n >= MIN_SEAT && n <= MAX_SEAT) {
      seatSelect.value = String(n);
      seatSelect.disabled = true;   // 只有一般使用者才鎖
    } else {
      seatSelect.value = '';
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
  if (!admin && !validInteger(state.me?.username, MIN_SEAT, MAX_SEAT)) {
    notify('此帳號尚未對應有效座號，請聯絡管理員。', true); return false;
  }
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
    const orders = await loadAllOrders(true);
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
function paymentControlHTML(order, id, className, preorder = false) {
  const hasOrder = !!order.submitted && order.items?.length > 0;
  const key = paymentKey(order.seat, preorder ? order.date : null);
  const pending = paymentPending.has(key), uncertain = paymentUncertain.has(key);
  const checked = pending ? paymentPending.get(key).paid : hasOrder && order.paid;
  const status = pending ? '儲存中…' : uncertain ? '未確認，請重新整理' : !hasOrder ? '未訂餐' : order.paid ? '已付款' : '未付款';
  const audit = order.paymentUpdatedAt ? `最後更新：${new Date(order.paymentUpdatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}；帳號 ID ${order.paymentUpdatedBy ?? '歷史紀錄'}` : '';
  return `<label class="payment-control ${hasOrder && order.paid ? 'is-paid' : ''} ${!hasOrder ? 'is-empty' : ''}" title="${safeText(audit)}">
    <input type="checkbox" id="${id}" class="${className}" data-seat="${order.seat}" data-order-id="${order.orderId ?? ''}" data-version="${order.version ?? 0}" data-date="${safeText(order.date || '')}" data-batch="${safeText(order.batch || '')}" data-preorder="${preorder}" data-paid="${!!order.paid}"
      aria-label="${preorder ? safeText(order.date) + ' 預訂 ' : ''}${order.seat} 號已付款" ${checked ? 'checked' : ''} ${!hasOrder || pending || uncertain ? 'disabled' : ''} aria-busy="${pending}">
    <span class="payment-status" role="status">${status}</span>
  </label>`;
}

function renderPaymentSummary() {
  const rows = [...overviewOrders.values()].filter(o => o.submitted && o.items?.length);
  const paid = rows.filter(o => o.paid);
  const total = rows.reduce((sum, o) => sum + calcSubtotal(o.items), 0);
  const collected = paid.reduce((sum, o) => sum + calcSubtotal(o.items), 0);
  const values = [['已訂餐', `${rows.length} 位`], ['已付款', `${paid.length} 位`], ['未付款', `${rows.length - paid.length} 位`], ['應收', `NT$ ${fmt(total)}`], ['已收', `NT$ ${fmt(collected)}`], ['未收', `NT$ ${fmt(total - collected)}`]];
  document.getElementById('paymentSummary').innerHTML = values.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
  document.getElementById('paymentContext').textContent = overviewContext ? `訂餐日期 ${overviewContext.date} · 批次 ${overviewContext.batch === 'legacy' ? '初始批次' : String(overviewContext.batch).slice(0, 8)} · 每 15 秒同步` : '';
}

function paymentReference(input) {
  return { orderId: input.dataset.orderId ? Number(input.dataset.orderId) : null, version: Number(input.dataset.version), date: input.dataset.date, batch: input.dataset.batch || null };
}

async function paintPaymentOrder(order, preorder) {
  if (preorder) {
    state.pre.cache.set(preKey(order.date, order.seat), order);
    const visible = preorderContext();
    if (visible.date === order.date && visible.seat === order.seat) await renderPreorder();
  } else {
    state.ordersCache.set(order.seat, order);
    if (!overviewContext || overviewContext.date !== order.date || overviewContext.batch !== order.batch) {
      allSeatsSnapshot = null;
      await renderAllSeatsAdmin(true);
    } else {
      overviewOrders.set(order.seat, order);
      const card = document.getElementById(`seat-card-${order.seat}`);
      if (card) card.outerHTML = seatCardHTML(order);
      renderPaymentSummary();
    }
    if (Number(seatSelect.value) === order.seat) await renderSeatOrder();
  }
}

async function changePayment(input, requested = input.checked) {
  if (!isAdmin()) return;
  const seat = Number(input.dataset.seat), preorder = input.dataset.preorder === 'true';
  const key = paymentKey(seat, preorder ? input.dataset.date : null), epoch = sessionEpoch;
  const previous = input.dataset.paid === 'true', paid = requested, reference = paymentReference(input);
  if (paymentPending.has(key) || orderQueues.has(key) || purgingOrders || paymentUncertain.has(key)) {
    input.checked = paymentPending.get(key)?.paid ?? previous;
    return;
  }
  paymentPending.set(key, { paid });
  refreshAllSeats.disabled = true;
  for (const control of document.querySelectorAll('.payment-control input')) {
    if (Number(control.dataset.seat) === seat && control.dataset.preorder === String(preorder) && (!preorder || control.dataset.date === reference.date)) {
      control.checked = paid; control.disabled = true; control.setAttribute('aria-busy', 'true');
      control.closest('label').querySelector('.payment-status').textContent = '儲存中…';
    }
  }
  const route = preorder ? `/preorders/${encodeURIComponent(reference.date)}/${seat}` : `/orders/${seat}`;
  let latest = null, failure = null;
  try {
    const result = await api(`${route}/paid`, { method: 'PUT', body: JSON.stringify({ ...reference, paid }), timeoutMs: 15_000 });
    latest = result.order;
    if (!latest || latest.seat !== seat || latest.date !== reference.date || (latest.batch ?? null) !== reference.batch) throw new Error('付款回應無法確認，請重新整理。');
  } catch (error) {
    failure = error;
    input.checked = previous;
    if (epoch === sessionEpoch && token) {
      state.ordersCache.delete(seat); state.pre.cache.delete(preKey(reference.date, seat)); allSeatsSnapshot = null;
      try { latest = await api(route, { dedupe: false, timeoutMs: 12_000 }); }
      catch { paymentUncertain.add(key); }
    }
  } finally {
    paymentPending.delete(key);
    refreshAllSeats.disabled = paymentPending.size > 0;
  }
  if (epoch !== sessionEpoch) {
    if (failure?.status === 401) loginMsg.textContent = '登入已失效，請重新登入。';
    return;
  }
  if (latest) {
    paymentUncertain.delete(key);
    await paintPaymentOrder(latest, preorder);
  } else {
    // No authoritative response: retain the previous display and block retries
    // until a successful reload, rather than silently submitting another write.
    for (const control of document.querySelectorAll('.payment-control input')) {
      if (Number(control.dataset.seat) === seat && control.dataset.preorder === String(preorder)) {
        control.checked = previous; control.disabled = true; control.setAttribute('aria-busy', 'false');
        control.closest('label').querySelector('.payment-status').textContent = '未確認，請重新整理';
      }
    }
  }
  if (failure) notify(`${seat} 號：${failure.message}${latest ? '（已載入伺服器最新狀態）' : '（儲存結果未確認）'}`, true);
  else notify(`${seat} 號${paid ? '已標記已付款' : '已恢復未付款'}`);
  if (!pageReports.classList.contains('hidden')) await (preorder ? renderUnpaidPreorders() : renderUnpaidOrders());
}

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
      <span class="badge ${done?'ok':'pending'}">${done?'已訂餐':'未訂餐'}</span>
    </div>
    <div class="items">${detail}</div>
    <div class="row small" style="justify-content:space-between;margin-top:6px">
      <span>小計：NT$ ${subtotal.toLocaleString('zh-Hant-TW')}</span>
      ${o.internalOnly ? '<span class="badge pending" title="此座為內訂">內訂</span>' : ''}
    </div>
    ${paymentControlHTML(o, `seat-paid-${seatNum}`, 'seat-paid')}
    <div class="seat-actions">
      <label class="small">
        <input type="checkbox" class="seat-internal" data-seat="${seatNum}" ${o.internalOnly?'checked':''} ${paymentPending.has(paymentKey(o.seat)) ? 'disabled' : ''}/>
        內訂
      </label>
      <button class="seat-edit" data-seat="${seatNum}">編輯</button>
      <button class="danger seat-clear" data-seat="${seatNum}">清空</button>
    </div>
  </div>`;
}
async function renderSeatCardInto(seat){
  if (!allSeatsGrid) return;
  const revision = dataRevision;
  const o = await api(`/orders/${seat}`);
  if (revision !== dataRevision) return renderSeatCardInto(seat);
  if (overviewContext && (o.date !== overviewContext.date || o.batch !== overviewContext.batch)) {
    allSeatsSnapshot = null;
    return renderAllSeatsAdmin(true);
  }
  paymentUncertain.delete(paymentKey(seat));
  state.ordersCache.set(seat, o);
  overviewOrders.set(seat, o);
  const el = document.getElementById(`seat-card-${seat}`);
  if (el) el.outerHTML = seatCardHTML(o);
  renderPaymentSummary();
}
async function renderAllSeatsAdmin(force = false){
  if (!isAdmin() || !adminAllSeats || !allSeatsGrid) return;
  if (paymentPending.size) return;
  if (!overviewOrders.size) allSeatsGrid.innerHTML = '<div class="muted">載入中…</div>';
  let orders;
  try { orders = await loadAllOrders(force); }
  catch (error) { if (!overviewOrders.size) allSeatsGrid.innerHTML = `<div class="muted">讀取失敗：${safeText(error.message)}</div>`; throw error; }
  if (!isAdmin() || paymentPending.size) return;
  const focused = document.activeElement?.id;
  overviewOrders.clear();
  orders.forEach(o => { state.ordersCache.set(o.seat, o); overviewOrders.set(o.seat, o); paymentUncertain.delete(paymentKey(o.seat)); });
  if (allSeatsGrid.querySelectorAll('.seat-card').length !== orders.length) allSeatsGrid.innerHTML = orders.map(seatCardHTML).join('');
  else for (const o of orders) {
    const el = document.getElementById(`seat-card-${o.seat}`);
    const markup = seatCardHTML(o);
    // Keep untouched controls in place while other administrators are refreshed.
    if (el && el.dataset.paymentSnapshot !== JSON.stringify(o)) {
      el.outerHTML = markup;
      document.getElementById(`seat-card-${o.seat}`).dataset.paymentSnapshot = JSON.stringify(o);
    }
  }
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  renderPaymentSummary();
}
listen(refreshAllSeats, 'click', async () => { allSeatsSnapshot = null; await renderAllSeatsAdmin(true); });

listen(allSeatsGrid, 'click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const seat = Number(button.dataset.seat);
  if (button.classList.contains('seat-edit')) {
    seatSelect.value = String(seat);
    state.ordersCache.delete(seat);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await renderSeatOrder();
  } else if (button.classList.contains('seat-clear') && confirm(`清空座號 ${seat} 的訂單？`)) {
    await changeOrder(seat, order => { order.items = []; order.internalOnly = false; });
  }
});
listen(allSeatsGrid, 'change', async (event, requested) => {
  const input = event.target;
  if (input.classList.contains('seat-paid')) return changePayment(input, requested);
  if (!input.classList.contains('seat-internal')) return;
  const checked = input.checked;
  await changeOrder(Number(input.dataset.seat), order => {
    order.internalOnly = checked;
    order.items = checked ? [{ name: '內訂', unitPrice: 0, qty: 1 }] : [];
  });
});

/* =========================
   UI 切頁
   ========================= */
function switchTab(which){
  if (state.me?.mustChangePassword) return showInitialPasswordChange();
  if (!isAdmin() && ['menus', 'reports', 'logs'].includes(which)) return;
  if (which === 'preorders' && !isAdmin() && !state.pre.settings.enabled) return;
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
    btn.setAttribute('aria-current', k === which ? 'page' : 'false');
    page.classList.toggle('hidden', k!==which);
  }
  if (which==='reports') {
    safeRenderAdminReports();
    if (isAdmin() && !state.owLoaded) loadOpenWindowSettings();
    if (isAdmin()) { renderPreSettingsUI(); }
  }
  if (which==='logs') { runTask(() => renderLogs(true)); }
  if (which==='users') { runTask(loadUsers); }
  if (which==='preorders') { runTask(renderPreorder); }
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
  const revision = dataRevision;
  const data = await api('/menus');
  if (revision !== dataRevision) return loadMenus();
  state.menus = (data.menus || []).map(normalizeMenu);
  state.activeMenuId = data.activeMenuId ?? null;
  if (!state.menus.some(menu => menu.id === state.editingMenuId)) state.editingMenuId = state.activeMenuId ?? state.menus[0]?.id ?? null;
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
  state.editingMenuId = normalized.id;
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
  if (state.activeMenuId===id) state.activeMenuId = null;
  if (state.editingMenuId===id) state.editingMenuId = state.menus[0]?.id ?? null;
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
  if (state.ordersCache.has(seat)) return structuredClone(state.ordersCache.get(seat));
  const revision = dataRevision;
  const o = await api(`/orders/${seat}`);
  if (revision !== dataRevision) return getOrder(seat);
  paymentUncertain.delete(paymentKey(seat));
  state.ordersCache.set(seat, o);
  return structuredClone(o);
}
async function saveOrder(seat, order){
  try{
    await api(`/orders/${seat}`, { method:'PUT', body: JSON.stringify(order) });
    state.ordersCache.delete(seat);
    allSeatsSnapshot = null;
  }catch(e){
    if (e.status === 403 && String(e.message).includes('點餐時段')) {
      isOpenWindow = false;
      renderOpenBanner(null);
    }
    throw e;
  }
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

async function fetchSeats() {
  const data = await api('/seats', { cache: 'no-store' });
  if (!Array.isArray(data.seats) || data.seats.some(seat => !Number.isInteger(seat) || seat < 1 || seat > MAX_SEAT)) throw new Error('座號清單格式不正確');
  state.seats = [...new Set([...baseSeats(), ...data.seats])].sort((a, b) => a - b);
  renderSeats();
}
function renderSeats(){
  const previous = seatSelect.value;
  seatSelect.innerHTML = '';
  for(const s of state.seats){
    const opt = document.createElement('option');
    opt.value=String(s); opt.textContent = `座號 ${s}`;
    seatSelect.appendChild(opt);
  }
  seatSelect.value = !isAdmin() && state.me ? String(Number(state.me.username)) : state.seats.includes(Number(previous)) ? previous : String(state.seats[0] || '');
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
  if (state.editingMenuId) menuSelect.value = String(state.editingMenuId);
  menuSelect.disabled = state.menus.length === 0;
  const m = state.menus.find(x=>x.id===state.editingMenuId);
  if (menuNewName) {
    menuNewName.value = m?.name || '';
    menuNewName.disabled = false;
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
let orderRenderVersion = 0;
async function renderSeatOrder(){
  const version = ++orderRenderVersion;
  const seat = Number(seatSelect.value);
  if (!validInteger(seatSelect.value, MIN_SEAT, MAX_SEAT)) {
    emptyOrder(orderTableBody, '此帳號尚未對應有效座號，請聯絡管理員。');
    [codeInput, qtyInput, addByCode, manualName, manualPrice, manualQty, addManual, clearSeat, internalOnlyEl].forEach(input => { input.disabled = true; });
    seatSubtotal.textContent = '0';
    return;
  }
  let o;
  try { o = await getOrder(seat); }
  catch (error) {
    if (version === orderRenderVersion) { emptyOrder(orderTableBody, '訂單讀取失敗，請重新選擇座號或稍後重試。'); seatSubtotal.textContent = '0'; }
    throw error;
  }
  if (version !== orderRenderVersion || !state.me) return;

  // 內訂狀態反映到 UI
  if (internalOnlyEl) internalOnlyEl.checked = !!o.internalOnly;
  const lock = !!o.internalOnly || (!isAdmin() && !isOpenWindow);

  const hasLockedManual = o.items.some(manualItemLocked);
  if (internalOnlyEl) internalOnlyEl.disabled = !isAdmin() && (!isOpenWindow || hasLockedManual);
  clearSeat.disabled = !isAdmin() && (!isOpenWindow || hasLockedManual);
  // 鎖定新增/輸入區
  codeInput.disabled = lock;
  qtyInput.disabled = lock;
  addByCode.disabled = lock;
  const manualDisabled = lock || (!isAdmin() && state.manualLocked);
  manualName.disabled = manualDisabled;
  manualPrice.disabled = manualDisabled;
  manualQty.disabled = manualDisabled;
  addManual.disabled = manualDisabled;

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
    input.max = '999';
    input.step = '1';
    input.setAttribute('aria-label', `${it.name} 的數量`);
    input.value = String(qty);
    input.className = 'qtyInput w120';
    input.dataset.idx = String(idx);
    input.dataset.itemId = String(it.id ?? '');
    const itemLocked = lock || manualItemLocked(it);
    if (itemLocked) input.disabled = true;
    qtyTd.appendChild(input);
    tr.appendChild(qtyTd);

    const subtotalTd = document.createElement('td');
    subtotalTd.textContent = fmt(line);
    tr.appendChild(subtotalTd);

    const actionTd = document.createElement('td');
    if (!itemLocked) {
      const btn = document.createElement('button');
      btn.className = 'danger delBtn';
      btn.dataset.idx = String(idx);
      btn.dataset.itemId = String(it.id ?? '');
      btn.textContent = '刪除';
      actionTd.appendChild(btn);
    }
    tr.appendChild(actionTd);

    frag.appendChild(tr);
  });
  orderTableBody.replaceChildren(frag);
  if (!o.items.length) emptyOrder(orderTableBody, '尚未加入餐點，請從上方開始點餐。');
  labelOrderRows(document.getElementById('orderTable'));
  seatSubtotal.textContent = fmt(subtotal);
  if (typeof toggleSubmitted !== 'undefined' && toggleSubmitted) {
    toggleSubmitted.textContent = o.submitted ? '設為未完成' : '標記完成';
  }

  // ⭐ 已付款（tfoot 最後一格動態顯示；admin 可改）
  const paidCell = document.querySelector('#orderTable tfoot th:last-child');
  if (paidCell) {
    if (isAdmin()) {
      paidCell.innerHTML = paymentControlHTML(o, 'paidCheckbox', 'detail-paid');
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
const LOG_CATEGORY_OPTIONS = [
  { value: 'all', label: '全部分類' },
  { value: 'login', label: '登入紀錄' },
  { value: 'order-update', label: '訂單更新' },
  { value: 'order', label: '訂單與付款' },
  { value: 'preorder', label: '預訂便當' },
  { value: 'menu', label: '菜單管理' },
  { value: 'settings', label: '系統設定' },
  { value: 'upload', label: '檔案 / 圖片' },
  { value: 'user', label: '使用者管理' },
  { value: 'other', label: '其他' },
];
const LOG_CATEGORY_LABELS = Object.fromEntries(LOG_CATEGORY_OPTIONS.map(opt => [opt.value, opt.label]));

const WEEKDAY_NAMES = {
  0: '週日',
  1: '週一',
  2: '週二',
  3: '週三',
  4: '週四',
  5: '週五',
  6: '週六',
};

const LOG_DETAIL_KEY_LABELS = {
  seat: '座號',
  itemsCount: '品項數',
  internalOnly: '內訂',
  menuId: '菜單ID',
  itemId: '品項ID',
  name: '名稱',
  price: '單價',
  paid: '已付款',
  deletedItems: '刪除筆數',
  resetOrders: '已重置座號',
  enabled: '啟用狀態',
  dates: '日期',
  targetId: '目標ID',
  username: '帳號',
  role: '角色',
  status: '狀態',
  from: '原角色',
  to: '新角色',
  ids: 'ID',
  openDays: '開放日',
  openStart: '開始時間',
  openEnd: '結束時間',
  filename: '檔案',
  size: '大小',
  date: '日期',
};

function ensureObject(value){
  return value && typeof value === 'object' ? value : {};
}

function joinParts(parts, separator='；'){
  return parts
    .map(part => typeof part === 'string' ? part.trim() : part)
    .filter(part => part && String(part).trim())
    .join(separator);
}

function formatBytes(bytes){
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function boolFrom(value){
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return null;
}

function boolText(value, { yes='是', no='否' }={}){
  const result = boolFrom(value);
  if (result === null) return '';
  return result ? yes : no;
}

function formatWeekdays(days){
  if (!Array.isArray(days) || !days.length) return '';
  return days.map(d => WEEKDAY_NAMES[d] ?? String(d)).join('、');
}

function formatList(list, { limit=5, separator='、', unit='筆' }={}){
  if (!Array.isArray(list) || !list.length) return '';
  const preview = list.slice(0, limit).join(separator);
  if (list.length > limit){
    return `${preview}${separator}…（共 ${list.length}${unit}）`;
  }
  return preview;
}

function translateDetailKey(key){
  return LOG_DETAIL_KEY_LABELS[key] || key;
}

function formatDetailValue(value){
  if (Array.isArray(value)) return value.map(v => formatDetailValue(v)).join('、');
  if (value && typeof value === 'object'){
    try { return JSON.stringify(value); }
    catch { return '[物件]'; }
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return value == null ? '' : String(value);
}

function parseLogDetails(details){
  if (details == null) return { parsed: null, rawText: '' };
  if (typeof details === 'string'){
    const trimmed = details.trim();
    if (!trimmed) return { parsed: null, rawText: '' };
    try {
      const parsed = JSON.parse(trimmed);
      return { parsed, rawText: JSON.stringify(parsed, null, 2) };
    } catch {
      return { parsed: null, rawText: details };
    }
  }
  if (typeof details === 'object'){
    try {
      return { parsed: details, rawText: JSON.stringify(details, null, 2) };
    } catch {
      return { parsed: details, rawText: '' };
    }
  }
  return { parsed: null, rawText: String(details) };
}

function fallbackActionLabel(action){
  if (!action) return '其他事件';
  return action.replace(/\./g, '／');
}

const LOG_ACTION_DEFS = {
  login: {
    category: 'login',
    label: '登入系統',
    message(details){
      const data = ensureObject(details);
      const username = data.username || data.name || data.user;
      return username ? `帳號：${username}` : '帳號資訊未提供';
    },
  },
  'upload.image': {
    category: 'upload',
    label: '上傳圖片',
    message(details){
      const data = ensureObject(details);
      const filename = data.filename || data.name;
      const sizeText = formatBytes(data.size);
      return joinParts([
        filename ? `檔案：${filename}` : '',
        sizeText ? `大小：${sizeText}` : '',
      ]);
    },
  },
  'settings.openWindow': {
    category: 'settings',
    label: '更新開放時段',
    message(details){
      const data = ensureObject(details);
      const days = formatWeekdays(data.openDays);
      const timeRange = data.openStart && data.openEnd
        ? `時段：${data.openStart} - ${data.openEnd}`
        : '';
      return joinParts([
        days ? `開放日：${days}` : '',
        timeRange,
      ]);
    },
  },
  'settings.activeMenu': {
    category: 'settings',
    label: '切換菜單',
    message(details){
      const data = ensureObject(details);
      return data.menuId != null ? `切換至菜單 #${data.menuId}` : '';
    },
  },
  'settings.preorder': {
    category: 'settings',
    label: '更新預訂設定',
    message(details){
      const data = ensureObject(details);
      const enabledText = boolText(data.enabled);
      const dates = Array.isArray(data.dates) && data.dates.length
        ? `開放日期：${data.dates.join('、')}`
        : '';
      return joinParts([
        enabledText ? `啟用：${enabledText}` : '',
        dates,
      ]);
    },
  },
  'menu.create': {
    category: 'menu',
    label: '新增菜單',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.id != null ? `ID：${data.id}` : '',
        data.name ? `名稱「${data.name}」` : '',
      ]);
    },
  },
  'menu.update': {
    category: 'menu',
    label: '更新菜單',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.id != null) parts.push(`菜單 #${data.id}`);
      if ('name' in data) parts.push(data.name ? `名稱改為「${data.name}」` : '清除名稱');
      if ('note' in data) parts.push(data.note ? '更新備註' : '清除備註');
      if ('imageFilename' in data) parts.push(data.imageFilename ? `更新圖片：${data.imageFilename}` : '移除圖片');
      return joinParts(parts);
    },
  },
  'menu.delete': {
    category: 'menu',
    label: '刪除菜單',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.id != null ? `菜單 #${data.id}` : '',
        data.name ? `名稱「${data.name}」` : '',
      ]);
    },
  },
  'menu.item.create': {
    category: 'menu',
    label: '新增菜色',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.menuId != null) parts.push(`菜單 #${data.menuId}`);
      if (data.name) parts.push(`名稱「${data.name}」`);
      if (data.itemId != null) parts.push(`品項ID：${data.itemId}`);
      if (data.price != null && Number.isFinite(Number(data.price))) parts.push(`單價 ${fmt(Number(data.price))} 元`);
      return joinParts(parts);
    },
  },
  'menu.item.update': {
    category: 'menu',
    label: '更新菜色',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.itemId != null) parts.push(`品項 #${data.itemId}`);
      if ('name' in data && data.name) parts.push(`名稱改為「${data.name}」`);
      if ('price' in data && Number.isFinite(Number(data.price))) parts.push(`單價 ${fmt(Number(data.price))} 元`);
      return joinParts(parts);
    },
  },
  'menu.item.delete': {
    category: 'menu',
    label: '刪除菜色',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.itemId != null ? `品項 #${data.itemId}` : '',
        data.name ? `名稱「${data.name}」` : '',
      ]);
    },
  },
  'order.update': {
    category: 'order-update',
    label: '更新訂單',
    message(details){
      const data = ensureObject(details);
      const itemsCount = Number(data.itemsCount);
      const parts = [];
      if (data.seat != null) parts.push(`座號 ${data.seat}`);
      if (Number.isFinite(itemsCount)) parts.push(`品項 ${fmt(itemsCount)} 項`);
      const internal = boolText(data.internalOnly);
      if (internal) parts.push(`內訂：${internal}`);
      return joinParts(parts);
    },
  },
  'order.paid': {
    category: 'order',
    label: '更新付款狀態',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.seat != null) parts.push(`座號 ${data.seat}`);
      const paidText = boolText(data.paid);
      if (paidText) parts.push(`付款：${paidText}`);
      return joinParts(parts);
    },
  },
  'orders.purgeToday': {
    category: 'order',
    label: '刪除今日訂單',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (Number.isFinite(Number(data.deletedItems))) parts.push(`刪除 ${fmt(Number(data.deletedItems))} 筆項目`);
      const reset = formatList(data.resetOrders, { limit: 5, unit: '筆' });
      if (reset) parts.push(`重置座號：${reset}`);
      return joinParts(parts);
    },
  },
  'preorder.update': {
    category: 'preorder',
    label: '更新預訂訂單',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.date) parts.push(`日期 ${data.date}`);
      if (data.seat != null) parts.push(`座號 ${data.seat}`);
      if (Number.isFinite(Number(data.itemsCount))) parts.push(`品項 ${fmt(Number(data.itemsCount))} 項`);
      const internal = boolText(data.internalOnly);
      if (internal) parts.push(`內訂：${internal}`);
      return joinParts(parts);
    },
  },
  'preorder.paid': {
    category: 'preorder',
    label: '更新預訂付款',
    message(details){
      const data = ensureObject(details);
      const parts = [];
      if (data.date) parts.push(`日期 ${data.date}`);
      if (data.seat != null) parts.push(`座號 ${data.seat}`);
      const paidText = boolText(data.paid);
      if (paidText) parts.push(`付款：${paidText}`);
      return joinParts(parts);
    },
  },
  'user.create': {
    category: 'user',
    label: '新增使用者',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.username ? `帳號：${data.username}` : '',
        data.role ? `角色：${data.role}` : '',
        data.id != null ? `ID：${data.id}` : '',
      ]);
    },
  },
  'user.changePassword': {
    category: 'user',
    label: '重設使用者密碼',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.targetId != null ? `目標ID：${data.targetId}` : '',
        data.by ? `觸發來源：${data.by}` : '',
      ]);
    },
  },
  'user.status': {
    category: 'user',
    label: '調整使用者狀態',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.targetId != null ? `目標ID：${data.targetId}` : '',
        data.status ? `狀態：${data.status}` : '',
      ]);
    },
  },
  'user.role': {
    category: 'user',
    label: '調整使用者角色',
    message(details){
      const data = ensureObject(details);
      const from = data.from ? `原角色：${data.from}` : '';
      const to = data.to ? `新角色：${data.to}` : '';
      return joinParts([
        data.targetId != null ? `目標ID：${data.targetId}` : '',
        from,
        to,
      ]);
    },
  },
  'user.delete': {
    category: 'user',
    label: '刪除使用者',
    message(details){
      const data = ensureObject(details);
      return joinParts([
        data.targetId != null ? `目標ID：${data.targetId}` : '',
        data.username ? `帳號：${data.username}` : '',
      ]);
    },
  },
  'user.bulkDelete': {
    category: 'user',
    label: '批次刪除使用者',
    message(details){
      const data = ensureObject(details);
      const idsText = formatList(data.ids, { limit: 6, unit: '位' });
      if (idsText) return `使用者：${idsText}`;
      if (Array.isArray(data.ids)) return `共刪除 ${fmt(data.ids.length)} 位使用者`;
      return '';
    },
  },
};

if (logCategoryFilter){
  logCategoryFilter.replaceChildren();
  LOG_CATEGORY_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    logCategoryFilter.appendChild(option);
  });
  logCategoryFilter.value = LOG_CATEGORY_OPTIONS[0]?.value || 'all';
}

function describeLogEntry(entry){
  const { parsed, rawText } = parseLogDetails(entry.details);
  const def = LOG_ACTION_DEFS[entry.action] || null;
  const details = parsed ?? null;
  const categoryKey = def?.category || 'other';
  const categoryLabel = LOG_CATEGORY_LABELS[categoryKey] || LOG_CATEGORY_LABELS.other;
  let label = def
    ? (typeof def.label === 'function' ? def.label(details, entry) : (def.label || fallbackActionLabel(entry.action)))
    : fallbackActionLabel(entry.action);
  if (!label) label = fallbackActionLabel(entry.action);

  let message = '';
  if (def){
    const rawMessage = typeof def.message === 'function' ? def.message(details, entry) : def.message;
    if (Array.isArray(rawMessage)) message = joinParts(rawMessage);
    else if (rawMessage) message = String(rawMessage);
  }
  if (!message){
    if (details && typeof details === 'object'){
      if (Array.isArray(details)){
        message = details.map(item => formatDetailValue(item)).join('、');
      } else {
        const pairs = Object.entries(details).map(([key, value]) => `${translateDetailKey(key)}：${formatDetailValue(value)}`);
        message = joinParts(pairs);
      }
    } else if (rawText){
      message = rawText.replace(/\s+/g, ' ').trim();
      if (message.length > 120) message = `${message.slice(0, 117)}…`;
    }
  }
  if (!message) message = '（無詳細說明）';

  return {
    category: categoryKey,
    categoryLabel,
    label,
    message,
    rawDetailsText: rawText,
    details,
  };
}

async function renderLogs(forceReload=false){
  if (!logsTableBody) return;
  if (forceReload || !Array.isArray(logsCache)){
    logsTableBody.innerHTML = '<tr><td colspan="8">載入中…</td></tr>';
    if (logCategoryHint) logCategoryHint.textContent = '載入中…';
    try{
      const data = await getLogs();
      const logs = Array.isArray(data.logs) ? data.logs : [];
      logsCache = logs.map(entry => ({ entry, desc: describeLogEntry(entry) }));
    }catch(e){
      logsCache = [];
      logsTableBody.innerHTML = `<tr><td colspan="8">讀取失敗：${safeText(e.message)}</td></tr>`;
      if (logCategoryHint) logCategoryHint.textContent = '讀取失敗，請稍後再試';
      console.error(e);
      return;
    }
  }

  const totalCount = Array.isArray(logsCache) ? logsCache.length : 0;
  const categoryValue = logCategoryFilter ? logCategoryFilter.value : 'all';
  const rows = Array.isArray(logsCache)
    ? logsCache.filter(row => categoryValue === 'all' || row.desc.category === categoryValue)
    : [];

  logsTableBody.replaceChildren();
  if (!rows.length){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = totalCount ? '此分類目前沒有紀錄。' : '目前沒有任何審計紀錄。';
    tr.appendChild(td);
    logsTableBody.appendChild(tr);
  } else {
    const frag = document.createDocumentFragment();
    rows.forEach(({ entry, desc }) => {
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = entry.id == null ? '' : String(entry.id);
      tr.appendChild(idTd);

      const tsTd = document.createElement('td');
      tsTd.textContent = formatTaiwanTime(entry.ts);
      tr.appendChild(tsTd);

      const categoryTd = document.createElement('td');
      categoryTd.textContent = desc.categoryLabel;
      tr.appendChild(categoryTd);

      const labelTd = document.createElement('td');
      labelTd.textContent = desc.label;
      tr.appendChild(labelTd);

      const messageTd = document.createElement('td');
      const messageDiv = document.createElement('div');
      messageDiv.className = 'log-message';
      messageDiv.textContent = desc.message || '（無詳細說明）';
      messageTd.appendChild(messageDiv);
      if (desc.rawDetailsText){
        const detailsEl = document.createElement('details');
        detailsEl.className = 'log-details';
        const summary = document.createElement('summary');
        summary.textContent = '檢視原始資料';
        const pre = document.createElement('pre');
        pre.textContent = desc.rawDetailsText;
        detailsEl.appendChild(summary);
        detailsEl.appendChild(pre);
        messageTd.appendChild(detailsEl);
      }
      tr.appendChild(messageTd);

      const userTd = document.createElement('td');
      userTd.textContent = entry.user_id == null ? '' : `#${entry.user_id}`;
      tr.appendChild(userTd);

      const ipTd = document.createElement('td');
      ipTd.textContent = entry.ip || '';
      tr.appendChild(ipTd);

      const uaTd = document.createElement('td');
      uaTd.className = 'small muted';
      const ua = entry.ua || '';
      uaTd.textContent = ua.length > 80 ? `${ua.slice(0, 77)}…` : ua;
      tr.appendChild(uaTd);

      frag.appendChild(tr);
    });
    logsTableBody.appendChild(frag);
  }

  if (logCategoryHint){
    if (!totalCount){
      logCategoryHint.textContent = '目前沒有任何審計紀錄';
    } else {
      const label = LOG_CATEGORY_LABELS[categoryValue] || LOG_CATEGORY_LABELS.other;
      logCategoryHint.textContent = categoryValue === 'all'
        ? `顯示 ${rows.length} 筆，共 ${totalCount} 筆`
        : `${label}：顯示 ${rows.length} 筆（全部共 ${totalCount} 筆）`;
    }
  }
}

logCategoryFilter?.addEventListener('change', () => {
  renderLogs(false);
});

async function getLogs(){ return api('/logs'); }

// Credentials stay in password inputs only; never persist them with client state.
let credentialAction = null;
let credentialReturnFocus = null;
let credentialSubmitting = false;
function hideInitialPasswordChange() {
  const layer = document.getElementById('passwordChangeLayer');
  layer.classList.add('hidden'); layer.setAttribute('aria-hidden', 'true');
  document.getElementById('initialPasswordForm').reset();
  document.getElementById('initialPasswordStatus').textContent = '';
}
function showInitialPasswordChange() {
  closeCredentialDialog(true);
  loginLayer.classList.add('hidden'); loginLayer.style.display = 'none'; loginLayer.setAttribute('aria-hidden', 'true');
  app.classList.add('hidden'); app.setAttribute('aria-hidden', 'true'); app.inert = true;
  const layer = document.getElementById('passwordChangeLayer');
  layer.classList.remove('hidden'); layer.setAttribute('aria-hidden', 'false');
  document.getElementById('initialPasswordAccount').textContent = `帳號：${state.me?.username || ''}`;
  document.getElementById('initialPasswordHint').textContent = passwordHint(state.me?.role) + '新密碼不可與臨時密碼相同。';
  document.getElementById('initialNewPassword').minLength = isAdmin() ? 12 : 6;
  document.getElementById('initialPasswordStatus').textContent = '';
  requestAnimationFrame(() => document.getElementById('initialOldPassword').focus());
}
function clearCredentialInputs() {
  for (const id of ['credentialActorPassword', 'credentialNewPassword', 'credentialConfirmPassword', 'initialCredentialValue', 'newAdminActorPassword']) document.getElementById(id).value = '';
  document.getElementById('initialCredentialValue').type = 'password';
  document.getElementById('credentialReveal').textContent = '顯示臨時密碼';
  document.getElementById('credentialReveal').setAttribute('aria-pressed', 'false');
}
function closeCredentialDialog(force = false) {
  if (credentialSubmitting && !force) return;
  const dialog = document.getElementById('credentialDialog');
  clearCredentialInputs(); credentialAction = null; credentialSubmitting = false;
  document.getElementById('credentialDialogStatus').textContent = '';
  document.getElementById('credentialActionSubmit').disabled = false;
  document.getElementById('credentialClose').disabled = false;
  if (dialog.open && typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  app.inert = false;
  if (credentialReturnFocus?.isConnected && !app.classList.contains('hidden')) credentialReturnFocus.focus();
  credentialReturnFocus = null;
}
function showCredentialDialog() {
  const dialog = document.getElementById('credentialDialog');
  if (!dialog.open) {
    credentialReturnFocus = document.activeElement;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  app.inert = true;
}
function showInitialCredential(user, initialPassword) {
  clearCredentialInputs(); credentialAction = null;
  document.getElementById('credentialActionForm').classList.add('hidden');
  document.getElementById('initialCredentialPanel').classList.remove('hidden');
  document.getElementById('credentialDialogTitle').textContent = `帳號「${user.username}」的臨時密碼`;
  document.getElementById('credentialDialogDescription').textContent = '請在私密環境交付給本人。使用者首次登入只能設定個人密碼，完成後才能訂餐或管理。';
  const valid = typeof initialPassword === 'string' && initialPassword.length > 0;
  document.getElementById('initialCredentialValue').value = valid ? initialPassword : '';
  document.getElementById('credentialDialogStatus').textContent = valid ? '關閉後會清除此頁的臨時密碼。' : '未收到可確認的臨時密碼。請勿重複建立帳號；可在清單確認後重新產生。';
  showCredentialDialog(); document.getElementById('credentialClose').focus();
}
function openCredentialAction(kind, user) {
  if (!state.me || state.me.mustChangePassword) return;
  if (kind === 'self' ? user.id !== Number(state.me.id) : !isAdmin()) return;
  clearCredentialInputs();
  credentialAction = { kind, user: { id: user.id, username: user.username, role: user.role } };
  const self = kind === 'self', promote = kind === 'promote';
  document.getElementById('initialCredentialPanel').classList.add('hidden');
  document.getElementById('credentialActionForm').classList.remove('hidden');
  document.getElementById('credentialNewPasswordFields').classList.toggle('hidden', !self && !promote);
  for (const id of ['credentialNewPassword', 'credentialConfirmPassword']) document.getElementById(id).required = self || promote;
  document.getElementById('credentialNewPassword').minLength = promote || user.role === 'admin' ? 12 : 6;
  document.getElementById('credentialActorPasswordLabel').textContent = self ? '你的目前密碼' : '你的目前管理員密碼';
  document.getElementById('credentialPasswordHint').textContent = passwordHint(promote ? 'admin' : user.role);
  document.getElementById('credentialDialogTitle').textContent = `${self ? '變更我的密碼' : promote ? '升為管理員' : '產生臨時密碼'}：${user.username}`;
  document.getElementById('credentialDialogDescription').textContent = self ? '變更成功後，所有裝置須使用新密碼重新登入。' : promote ? '請先確認本人身份及升權需求。需要新的管理員密碼；完成後舊密碼與既有登入均失效。' : '請先核對本人身份。此操作會立即撤銷對方登入，產生個別臨時密碼，並要求本人設定個人密碼。';
  document.getElementById('credentialActionSubmit').textContent = promote ? '確認升為管理員' : self ? '變更密碼' : '產生個別臨時密碼';
  document.getElementById('credentialDialogStatus').textContent = '';
  showCredentialDialog(); document.getElementById('credentialActorPassword').focus();
}
listen(document.getElementById('changeMyPasswordBtn'), 'click', () => { if (state.me) openCredentialAction('self', state.me); });
listen(document.getElementById('credentialClose'), 'click', () => closeCredentialDialog());
listen(document.getElementById('credentialReveal'), 'click', () => {
  const input = document.getElementById('initialCredentialValue');
  const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password';
  document.getElementById('credentialReveal').textContent = reveal ? '隱藏臨時密碼' : '顯示臨時密碼';
  document.getElementById('credentialReveal').setAttribute('aria-pressed', String(reveal));
});
document.getElementById('credentialDialog').addEventListener('cancel', event => { event.preventDefault(); closeCredentialDialog(); });
document.getElementById('credentialDialog').addEventListener('close', clearCredentialInputs);
listen(document.getElementById('initialPasswordForm'), 'submit', async () => {
  const oldPassword = normalizePassword(document.getElementById('initialOldPassword').value);
  const newPassword = normalizePassword(document.getElementById('initialNewPassword').value);
  const confirmation = normalizePassword(document.getElementById('initialConfirmPassword').value);
  const message = document.getElementById('initialPasswordStatus');
  const error = accountPasswordError(newPassword, state.me?.role);
  if (!oldPassword || error || newPassword !== confirmation || oldPassword === newPassword) {
    message.textContent = !oldPassword ? '請輸入目前臨時密碼' : error || (newPassword !== confirmation ? '兩次新密碼不一致' : '新密碼不可與臨時密碼相同'); return;
  }
  const button = document.getElementById('initialPasswordSubmit'); button.disabled = true;
  const username = state.me?.username;
  try {
    await resetPasswordSelf(Number(state.me?.id), oldPassword, newPassword);
    clearSession(); showLogin(); loginUser.value = username || '';
    loginMsg.textContent = '個人密碼已設定，請使用新密碼重新登入。';
  } catch (error) { message.textContent = '設定失敗：' + error.message; }
  finally { button.disabled = false; }
});
listen(document.getElementById('credentialActionForm'), 'submit', async () => {
  if (!credentialAction || credentialSubmitting || !state.me || state.me.mustChangePassword) return;
  const action = credentialAction;
  if (action.kind === 'self' ? action.user.id !== Number(state.me.id) : !isAdmin()) return;
  const actorPassword = normalizePassword(document.getElementById('credentialActorPassword').value);
  const newPassword = normalizePassword(document.getElementById('credentialNewPassword').value);
  const confirmation = normalizePassword(document.getElementById('credentialConfirmPassword').value);
  const message = document.getElementById('credentialDialogStatus');
  if (!actorPassword) { message.textContent = '請輸入你的目前密碼'; return; }
  if (action.kind !== 'reset') {
    const error = accountPasswordError(newPassword, action.kind === 'promote' ? 'admin' : action.user.role);
    if (error || newPassword !== confirmation) { message.textContent = error || '兩次新密碼不一致'; return; }
  }
  credentialSubmitting = true;
  document.getElementById('credentialActionSubmit').disabled = true;
  document.getElementById('credentialClose').disabled = true;
  try {
    if (action.kind === 'reset') {
      const result = await resetPasswordAdmin(action.user.id, actorPassword);
      clearCredentialInputs(); showInitialCredential(action.user, result.initialPassword); delete result.initialPassword;
      await loadUsers();
    } else if (action.kind === 'self') {
      await resetPasswordSelf(action.user.id, actorPassword, newPassword);
      clearSession(); showLogin(); loginMsg.textContent = '密碼已更新，請使用新密碼重新登入。';
    } else {
      await api(`/users/${action.user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'admin', actorPassword, newPassword }) });
      closeCredentialDialog(true); await loadUsers(); notify('管理員角色與密碼已更新，對方須重新登入。');
    }
  } catch (error) { message.textContent = '操作失敗：' + error.message; document.getElementById('credentialActorPassword').value = ''; }
  finally {
    credentialSubmitting = false;
    document.getElementById('credentialActionSubmit').disabled = false;
    document.getElementById('credentialClose').disabled = false;
  }
});

/* =========================
   使用者頁（抓全部分頁）
   ========================= */
const usersView = { rows: [], generation: 0, lastCreated: null };
function accountPasswordError(password, role) {
  const minimum = role === 'admin' ? 12 : 6;
  if (Array.from(password).length < minimum) return `${role === 'admin' ? '管理員' : ''}密碼至少需要 ${minimum} 個字元`;
  if (new Blob([password]).size > 72) return '密碼不可超過 72 個 UTF-8 位元組';
  return '';
}
function passwordHint(role) {
  return `${role === 'admin' ? '管理員' : '一般使用者'}密碼至少需要 ${role === 'admin' ? 12 : 6} 個字元；最多 72 個 UTF-8 位元組，前後空白不列入。`;
}
function updateCreatePasswordHint() {
  const admin = newUserRole.value === 'admin';
  const input = document.getElementById('newAdminActorPassword');
  input.value = ''; input.required = admin; input.disabled = !admin;
  document.getElementById('newAdminActorPasswordFields').classList.toggle('hidden', !admin);
  document.getElementById('newUserPasswordHint').textContent = '系統會個別產生臨時密碼，僅向你顯示一次；使用者首次登入須設定自己的密碼。' + passwordHint(newUserRole.value);
}
newUserRole.addEventListener('change', updateCreatePasswordHint);
updateCreatePasswordHint();
async function listUsersAdv({q='',role='',status='',page=1,pageSize=100,afterId}={}) {
  const p = new URLSearchParams({ q, role, status, page, pageSize });
  if (afterId !== undefined) p.set('afterId', afterId);
  return api('/users?'+p.toString(), { cache: 'no-store', dedupe: false });
}
async function fetchAllUsers() {
  const all = new Map();
  let afterId = 0;
  // Never stop early using a potentially outdated count from another page.
  for (let page = 1; page <= 10000; page++) {
    const data = await listUsersAdv({ afterId });
    if (!Array.isArray(data.users) || data.users.some(u => !Number.isInteger(u.id) || typeof u.username !== 'string' || !['admin', 'user'].includes(u.role)))
      throw new Error('使用者清單回傳格式不正確');
    for (const user of data.users) all.set(user.id, user);
    if (data.users.length < 100) return [...all.values()].sort((a, b) => a.id - b.id);
    const next = data.users.at(-1).id;
    if (next <= afterId) throw new Error('使用者清單分頁無法繼續');
    afterId = next;
  }
  throw new Error('使用者清單過大，請聯絡管理員');
}
async function createUser(username, role, actorPassword){
  return api('/users', { method:'POST', body: JSON.stringify({ username, role, ...(role === 'admin' ? { actorPassword } : {}) })});
}
async function resetPasswordAdmin(userId, actorPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body: JSON.stringify({ resetTemporary: true, actorPassword })});
}
async function resetPasswordSelf(userId, oldPassword, newPassword){
  return api(`/users/${userId}/password`, { method:'PUT', body: JSON.stringify({ oldPassword, newPassword })});
}
function userMatchesFilters(user) {
  const search = normalizeUsername(document.getElementById('userSearch').value).toLocaleLowerCase();
  const role = document.getElementById('userRoleFilter').value;
  const status = document.getElementById('userStatusFilter').value;
  return user.username.toLocaleLowerCase().includes(search) && (!role || user.role === role) && (!status || user.status === status);
}
function renderUsersList() {
  const visible = usersView.rows.filter(userMatchesFilters);
  document.getElementById('usersListTitle').textContent = `使用者列表（顯示 ${visible.length}／共 ${usersView.rows.length} 筆）`;
  const fragment = document.createDocumentFragment();
  for (const u of visible) {
    const tr = document.createElement('tr');
    tr.dataset.userId = u.id;
    tr.classList.toggle('user-created', u.id === usersView.lastCreated?.id);
    for (const [label, value] of [['ID', u.id], ['帳號', u.username], ['角色', u.role === 'admin' ? '管理員' : '一般使用者'], ['狀態', u.status === 'disabled' ? '已停用' : '使用中']]) {
      const td = document.createElement('td'); td.dataset.label = label; td.textContent = String(value); tr.appendChild(td);
    }
    const action = document.createElement('td'); action.dataset.label = '操作';
    const row = document.createElement('div'); row.className = 'row user-actions';
    const self = u.id === Number(state.me?.id);
    const reset = document.createElement('button'); reset.className = self ? 'changeOwnPwd' : 'resetPwd'; reset.dataset.id = u.id;
    reset.textContent = self ? '變更我的密碼' : '產生臨時密碼'; row.appendChild(reset);
    const changeRole = document.createElement('button'); changeRole.className = 'changeRole'; changeRole.dataset.id = u.id;
    changeRole.textContent = u.role === 'admin' ? '降為一般使用者' : '升為管理員'; changeRole.disabled = self; row.appendChild(changeRole);
    const del = document.createElement('button'); del.className = 'danger delUser'; del.dataset.id = u.id; del.textContent = '刪除';
    if (self) { del.disabled = true; del.title = '不可刪除自己'; }
    row.appendChild(del);
    const hint = document.createElement('p'); hint.className = 'small muted';
    hint.textContent = u.mustChangePassword ? '等待本人設定個人密碼；目前僅能變更密碼或登出。' : '重設將撤銷既有登入，並要求本人設定新密碼。';
    action.append(row, hint); tr.appendChild(action); fragment.appendChild(tr);
  }
  if (!visible.length) {
    const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5; td.className = 'empty-state';
    td.textContent = usersView.rows.length ? '目前沒有符合篩選的帳號。' : '目前沒有使用者。'; tr.appendChild(td); fragment.appendChild(tr);
  }
  usersTableBody.replaceChildren(fragment);
  const created = usersView.lastCreated;
  if (created) {
    document.getElementById('createUserStatus').textContent = `已建立帳號「${created.username}」（ID ${created.id}）。` + (visible.some(u => u.id === created.id) ? '已在下方清單標示。' : '目前篩選條件未包含此帳號；原有篩選已保留，可調整搜尋查看。');
  }
}
async function loadUsers({ quiet = false } = {}) {
  const generation = ++usersView.generation, epoch = sessionEpoch;
  if (!isAdmin()) {
    const role = state.me?.role;
    usersTableBody.innerHTML = `<tr><td colspan="5"><div class="card only-user"><h4>變更我的密碼</h4><div class="row user-actions"><input type="password" id="selfOldPwd" autocomplete="current-password" placeholder="舊密碼" aria-label="舊密碼" /><input type="password" id="selfNewPwd" autocomplete="new-password" minlength="6" placeholder="新密碼至少需要 6 個字元" aria-label="新密碼" aria-describedby="selfPasswordHint" /><button id="selfChangeBtn">送出</button></div><p id="selfPasswordHint" class="small muted">${passwordHint(role)}</p><p id="selfPasswordStatus" role="status"></p></div></td></tr>`;
    listen(document.getElementById('selfChangeBtn'), 'click', async () => {
      const oldP = normalizePassword(document.getElementById('selfOldPwd').value), newP = normalizePassword(document.getElementById('selfNewPwd').value);
      const message = document.getElementById('selfPasswordStatus');
      const error = accountPasswordError(newP, role);
      if (error || !oldP) { message.textContent = error || '請輸入目前密碼'; return; }
      const uid = Number(state.me?.id ?? state.me?.uid);
      if (!Number.isInteger(uid)) { message.textContent = '找不到使用者 ID，請重新登入後再試一次'; return; }
      const btn = document.getElementById('selfChangeBtn'); btn.disabled = true;
      try {
        await resetPasswordSelf(uid, oldP, newP);
        clearSession(); showLogin(); loginMsg.textContent = '密碼已更新，請使用新密碼重新登入。';
      } catch (e) { message.textContent = '變更失敗：' + e.message; }
      finally { btn.disabled = false; }
    });
    return true;
  }
  const message = document.getElementById('usersLoadStatus');
  if (!quiet) message.textContent = '正在取得最新使用者清單…';
  try {
    const users = await fetchAllUsers();
    if (generation !== usersView.generation || epoch !== sessionEpoch) return false;
    usersView.rows = users; renderUsersList(); message.textContent = '已同步伺服器最新清單。'; return true;
  } catch (error) {
    if (generation === usersView.generation && epoch === sessionEpoch) {
      message.textContent = `清單更新失敗：${error.message}。請按「更新清單」重試；目前資料可能不是最新。`;
    }
    return false;
  }
}
for (const id of ['userSearch', 'userRoleFilter', 'userStatusFilter'])
  document.getElementById(id).addEventListener(id === 'userSearch' ? 'input' : 'change', renderUsersList);
listen(document.getElementById('refreshUsers'), 'click', () => loadUsers());
listen(createUserBtn, 'click', async () => {
  if (!isAdmin()) return;
  const username = normalizeUsername(newUserName.value), role = newUserRole.value;
  const actorPassword = normalizePassword(document.getElementById('newAdminActorPassword').value);
  const message = document.getElementById('createUserStatus');
  if (!username) { message.textContent = '請輸入帳號'; return; }
  if (role === 'admin' && !actorPassword) { message.textContent = '建立管理員前，請輸入你的目前管理員密碼'; return; }
  usersView.lastCreated = null; usersView.generation++;
  createUserBtn.disabled = true; createUserBtn.textContent = '建立中…'; message.textContent = '正在建立帳號…';
  try {
    const created = await createUser(username, role, actorPassword);
    if (!Number.isInteger(created?.id) || created.username !== username || created.role !== role) throw new Error('帳號建立回應無法確認，請查詢清單');
    usersView.lastCreated = { id: created.id, username: created.username, role: created.role };
    showInitialCredential(created, created.initialPassword);
    delete created.initialPassword;
    newUserName.value = '';
    const loaded = await loadUsers();
    if (!loaded || !usersView.rows.some(u => u.id === created.id)) {
      message.textContent = `帳號「${created.username}」（ID ${created.id}）已建立，但清單尚未同步，請按「更新清單」；不要重複建立。`;
    }
    try { await fetchSeats(); ensurePreorderUI(); if (loaded) await renderAllSeatsAdmin(true); }
    catch { message.textContent += ' 座號同步未完成，請稍後更新頁面。'; }
  } catch (e) {
    const uncertain = !e.status || e.status >= 500;
    if (uncertain) await loadUsers();
    message.textContent = uncertain ? `新增結果尚未確認：${e.message}。請先在清單查詢「${username}」，不要重複送出。` : `建立失敗：${e.message}`;
  } finally { document.getElementById('newAdminActorPassword').value = ''; createUserBtn.disabled = false; createUserBtn.textContent = '建立'; }
});
listen(usersTableBody, 'click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.classList.contains('resetPwd') || t.classList.contains('changeOwnPwd')) {
    const user = usersView.rows.find(u => u.id === Number(t.dataset.id));
    if (user) openCredentialAction(t.classList.contains('changeOwnPwd') ? 'self' : 'reset', user);
  }
  if (t.classList.contains('changeRole')) {
    const user = usersView.rows.find(u => u.id === Number(t.dataset.id));
    if (!user || user.id === Number(state.me?.id)) return;
    if (user.role === 'user') openCredentialAction('promote', user);
    else if (confirm('確定將這個管理員降為一般使用者？其既有登入會失效。')) {
      t.disabled = true;
      try { await api(`/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'user' }) }); await loadUsers(); notify('角色已更新，既有登入已失效。'); }
      catch (error) { notify('角色更新失敗：' + error.message, true); }
      finally { t.disabled = false; }
    }
  }
  if (t.classList.contains('delUser')) {
    const id = Number(t.dataset.id);
    if (!confirm(`確定要刪除使用者 ID=${id}？`)) return;
    t.disabled = true;
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      if (usersView.lastCreated?.id === id) { usersView.lastCreated = null; document.getElementById('createUserStatus').textContent = ''; }
      await loadUsers(); await fetchSeats(); ensurePreorderUI(); await renderAllSeatsAdmin(true);
      notify('已刪除');
    } catch (err) { notify('刪除失敗：' + err.message, true); }
    finally { t.disabled = false; }
  }
});


/* =========================
   事件（一般訂單）
   ========================= */
listen(seatSelect, 'change', async () => {
  state.ordersCache.delete(Number(seatSelect.value));
  await renderSeatOrder();
});
listen(clearSeat, 'click', async () => {
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value);
  if (!confirm(`確定清空座號 ${seat} 的訂單？`)) return;
  await changeOrder(seat, order => { order.items = []; order.internalOnly = false; });
});
listen(purgeOrdersBtn, 'click', async () => {
  if (!isAdmin()) return;
  if (orderQueues.size || paymentPending.size) return notify('仍有訂單或付款正在儲存，請稍候。', true);
  if (!confirm('確定開始新一輪訂餐？畫面將清空，舊批次訂單與付款紀錄會保留。')) return;
  purgingOrders = true;
  try {
    const context = overviewContext;
    if (!context) throw new Error('請先重新整理全部座號，再開始新一輪訂餐。');
    await api('/orders/today', { method: 'DELETE', body: JSON.stringify({ date: context.date, batch: context.batch }) });
    state.ordersCache.clear(); allSeatsSnapshot = null;
    await Promise.all([renderSeatOrder(), safeRenderAdminReports(), renderAllSeatsAdmin()]);
    notify('已開始新一輪訂餐，舊批次已保留。');
  } finally { purgingOrders = false; }
});
listen(internalOnlyEl, 'change', async () => {
  if (!guardOpenWindow()) { await renderSeatOrder(); return; }
  const seat = Number(seatSelect.value);
  const checked = internalOnlyEl.checked;
  await changeOrder(seat, order => {
    order.internalOnly = checked;
    order.items = checked ? [{ name: '內訂', unitPrice: 0, qty: 1 }] : [];
  });
});
listen(addByCode, 'click', async () => {
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value);
  const menu = state.menus.find(menu => menu.id === state.activeMenuId);
  const item = menu?.items.find(item => Number(item.code) === Number(codeInput.value));
  const qty = Number(qtyInput.value);
  if (!item) throw new Error(menu ? '查無此代號' : '尚未啟用菜單');
  if (!validInteger(qtyInput.value, 1, 999)) throw new Error('數量需為 1～999 的整數');
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可加入其他品項');
    order.items.push({ name: item.name, unitPrice: item.price, qty });
  });
  codeInput.value = ''; qtyInput.value = '1';
});
listen(addManual, 'click', async () => {
  if (!isAdmin() && state.manualLocked) throw new Error('管理員已鎖定手動餐點');
  if (!guardOpenWindow()) return;
  const seat = Number(seatSelect.value);
  const name = manualName.value.trim();
  const price = Number(manualPrice.value), qty = Number(manualQty.value);
  if (!name || name.length > 100) throw new Error('品名需為 1～100 字');
  if (!validInteger(manualPrice.value, 0, 1_000_000)) throw new Error('價格需為 0～1000000 的整數');
  if (!validInteger(manualQty.value, 1, 999)) throw new Error('數量需為 1～999 的整數');
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可加入其他品項');
    order.items.push({ name, unitPrice: price, qty });
  });
  manualName.value = ''; manualPrice.value = ''; manualQty.value = '1';
});
function findOrderItem(order, input) {
  const item = input.dataset.itemId ? order.items.find(item => String(item.id) === input.dataset.itemId) : order.items[Number(input.dataset.idx)];
  if (!item) throw new Error('此品項已變更，請重新載入訂單');
  return item;
}
listen(orderTableBody, 'change', async event => {
  const input = event.target;
  if (!input.classList.contains('qtyInput')) return;
  if (!guardOpenWindow()) return;
  if (!validInteger(input.value, 1, 999)) { await renderSeatOrder(); throw new Error('數量需為 1～999 的整數'); }
  const seat = Number(seatSelect.value), qty = Number(input.value);
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可編輯數量');
    findOrderItem(order, input).qty = qty;
  });
});
listen(orderTableBody, 'click', async event => {
  const button = event.target.closest('.delBtn');
  if (!button || !guardOpenWindow()) return;
  const seat = Number(seatSelect.value);
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可刪除品項');
    const item = findOrderItem(order, button);
    order.items.splice(order.items.indexOf(item), 1);
  });
});
listen(document.querySelector('#orderTable tfoot'), 'change', async (event, checked) => {
  const input = event.target;
  if (input.id !== 'paidCheckbox' || !isAdmin()) return;
  await changePayment(input, checked);
});


menuSelect?.addEventListener('change', ()=>{
  state.editingMenuId = Number(menuSelect.value) || null;
  renderMenuPage();
  renderActiveMenu();
});
listen(useMenu, 'click', async ()=>{
  const id = Number(menuSelect.value);
  await setActiveMenu(id);
  renderActiveMenu();
  renderMenuPage();
});
listen(addMenu, 'click', async ()=>{
  const name = menuNewName.value.trim() || `新菜單 ${state.menus.length+1}`;
  await createMenu(name);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
  alert('已建立並置於清單尾端');
});
listen(renameMenu, 'click', async ()=>{
  const id = Number(menuSelect.value);
  const name = menuNewName.value.trim();
  if (!name) return alert('請輸入新名稱');
  const note = menuNote ? menuNote.value : '';
  await saveMenuDetails(id, { name, note });
  renderActiveMenu();
  renderMenuPage();
});
listen(dupMenu, 'click', async ()=>{
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
listen(delMenu, 'click', async ()=>{
  const id = Number(menuSelect.value);
  if (!confirm('確定刪除此菜單？')) return;
  await deleteMenuReq(id);
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
});

menuImage?.addEventListener('change', handleMenuImageChange);
menuImageClear?.addEventListener('click', clearMenuImage);

listen(addItem, 'click', async ()=>{
  const mId = Number(menuSelect.value);
  const name = itemName.value.trim();
  const price = Number(itemPrice.value||0);
  if (!name) return alert('請輸入品名');
  if (!validInteger(itemPrice.value, 0, 1_000_000)) throw new Error('價格需為非負整數');
  await addMenuItemReq(mId, name, price);
  itemName.value=''; itemPrice.value='';
  await loadMenus();
  renderActiveMenu(); renderMenuPage();
});

listen(menuTableBody, 'change', async (e)=>{
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
  if (!validInteger(priceInput?.value, 0, 1_000_000)) { alert('價格需 >= 0'); renderMenuPage(); return; }
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
listen(menuTableBody, 'click', async (e)=>{
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
let preorderBound = false;
function ensurePreorderUI(){
  const page = document.getElementById('pagePreorders');
  const tab = document.getElementById('tabPreorders');
  if (!preorderBound) {
    tab.addEventListener('click', () => switchTab('preorders'));
    listen(document.getElementById('preLoad'), 'click', async () => { state.pre.cache.clear(); await renderPreorder(); });
    listen(document.getElementById('preDate'), 'change', renderPreorder);
    listen(document.getElementById('preSeatSelect'), 'change', renderPreorder);
    listen(document.getElementById('preAddByCode'), 'click', preAddByCode);
    listen(document.getElementById('preAddManual'), 'click', preAddManual);
    listen(document.getElementById('preTable'), 'change', event => event.target.id === 'prePaidCheckbox' ? preOnPaidToggle(event) : preOnQtyChange(event));
    listen(document.getElementById('preTable'), 'click', preOnDelete);
    listen(document.getElementById('preInternalOnly'), 'change', preOnInternalToggle);
    preorderBound = true;
  }
  tab.classList.toggle('hidden', !isAdmin() && !state.pre.settings.enabled);
  page.querySelectorAll('.only-admin').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  const select = document.getElementById('preSeatSelect');
  const previous = select.value;
  select.replaceChildren(...state.seats.map(seat => { const option = document.createElement('option'); option.value = String(seat); option.textContent = `座號 ${seat}`; return option; }));
  if (state.seats.includes(Number(previous))) select.value = previous;
  select.disabled = !isAdmin();
  if (!isAdmin()) select.value = String(Number(state.me?.username));
  const dateInput = document.getElementById('preDate');
  const dates = [...state.pre.settings.dates].sort();
  if (!dateInput.value || (!isAdmin() && !dates.includes(dateInput.value))) {
    dateInput.value = isAdmin() ? taiwanDate() : dates.find(date => date >= taiwanDate()) || dates[0] || '';
  }
  let hint = document.getElementById('preDateHint');
  if (!hint) {
    hint = document.createElement('p'); hint.id = 'preDateHint'; hint.className = 'small muted';
    dateInput.closest('.row').insertAdjacentElement('afterend', hint);
  }
  hint.textContent = isAdmin() ? '管理員可調整任意日期的預訂。' : dates.length ? `可預訂日期：${dates.join('、')}` : '目前尚未設定可預訂日期。';
  renderActiveMenu();
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
  ensurePreorderUI();
  if (!isAdmin() && !enabled) switchTab('orders');
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

    listen(document.getElementById('preSave'), 'click', async ()=>{
      const enabled = document.getElementById('preEnabled').checked;
      const dates = [...document.querySelectorAll('.pre-date-chip')].map(ch=>ch.dataset.date);
      try{
        await savePreSettings(enabled, dates);
        document.getElementById('preMsg').textContent = '已儲存';
      }catch(e){
        document.getElementById('preMsg').textContent = '失敗：' + e.message;
      }
    });
    listen(document.getElementById('preReload'), 'click', async ()=>{
      await fetchPreSettings(); ensurePreorderUI(); drawPreDatesChips();
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
    const chip = document.createElement('button');
    chip.type = 'button';
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
  if (state.pre.cache.has(key)) return structuredClone(state.pre.cache.get(key));
  const revision = dataRevision;
  const o = await api(`/preorders/${encodeURIComponent(date)}/${seat}`);
  if (revision !== dataRevision) return getPreorder(date, seat);
  paymentUncertain.delete(paymentKey(seat, date));
  state.pre.cache.set(key, o);
  return structuredClone(o);
}
async function savePreorder(date, seat, order){
  await api(`/preorders/${encodeURIComponent(date)}/${seat}`, { method:'PUT', body: JSON.stringify(order) });
  state.pre.cache.delete(preKey(date, seat));
}

// Render against a captured date/seat, discarding late responses after selection changes.
let preRenderVersion = 0;
function preorderContext() {
  const date = document.getElementById('preDate').value;
  const seat = Number(document.getElementById('preSeatSelect').value);
  const allowed = !!date && validInteger(seat, MIN_SEAT, MAX_SEAT) && (isAdmin() || (state.pre.settings.enabled && state.pre.settings.dates.includes(date)));
  return { date, seat, allowed };
}
async function renderPreorder() {
  const version = ++preRenderVersion;
  const epoch = sessionEpoch;
  const { date, seat, allowed } = preorderContext();
  const tbody = document.querySelector('#preTable tbody');
  const ids = ['preCodeInput', 'preQtyInput', 'preAddByCode', 'preManualName', 'preManualPrice', 'preManualQty', 'preAddManual'];
  const toggle = document.getElementById('preInternalOnly');
  toggle.disabled = !allowed;
  if (!allowed) {
    ids.forEach(id => { document.getElementById(id).disabled = true; });
    toggle.checked = false;
    emptyOrder(tbody, date ? '此日期尚未開放預訂，請選擇允許的日期。' : '請選擇可預訂日期。');
    document.getElementById('preSubtotal').textContent = '0';
    document.getElementById('prePaidCell').textContent = '';
    return;
  }
  let order;
  try { order = await getPreorder(date, seat); }
  catch (error) {
    if (version === preRenderVersion) { emptyOrder(tbody, '預訂讀取失敗，請按「載入」重試。'); document.getElementById('prePaidCell').textContent = ''; }
    throw error;
  }
  if (version !== preRenderVersion || epoch !== sessionEpoch) return;
  toggle.checked = !!order.internalOnly;
  ids.forEach(id => { document.getElementById(id).disabled = !!order.internalOnly || (!isAdmin() && state.manualLocked && /Manual/.test(id)); });
  toggle.disabled = !isAdmin() && order.items.some(manualItemLocked);
  tbody.innerHTML = order.items.map((item, index) => {
    const qty = safeNumber(item.qty, 1);
    const rowLocked = order.internalOnly || manualItemLocked(item);
    const attrs = `data-idx="${index}" data-item-id="${safeText(item.id ?? '')}"`;
    return `<tr><td>${index + 1}</td><td>${safeText(item.name)}</td><td>${fmt(item.unitPrice)}</td>
      <td><input type="number" inputmode="numeric" min="1" max="999" step="1" value="${qty}" class="preQty" ${attrs} aria-label="${safeText(item.name)} 的數量" ${rowLocked ? 'disabled' : ''}></td>
      <td>${fmt(safeNumber(item.unitPrice) * qty)}</td><td>${rowLocked ? '' : `<button class="danger preDel" ${attrs}>刪除</button>`}</td></tr>`;
  }).join('');
  if (!order.items.length) emptyOrder(tbody, '尚未加入預訂餐點。');
  labelOrderRows(document.getElementById('preTable'));
  document.getElementById('preSubtotal').textContent = fmt(calcSubtotal(order.items));
  document.getElementById('prePaidCell').innerHTML = isAdmin()
    ? paymentControlHTML(order, 'prePaidCheckbox', 'pre-paid', true)
    : `<span class="small muted">付款狀態：${order.paid ? '已付款' : '未付款'}</span>`;
}
function requirePreorderContext() {
  const context = preorderContext();
  if (!context.allowed) throw new Error('請選擇已開放預訂的日期');
  return context;
}
async function preAddByCode() {
  const { date, seat } = requirePreorderContext();
  const menu = state.menus.find(menu => menu.id === state.activeMenuId);
  const item = menu?.items.find(item => Number(item.code) === Number(document.getElementById('preCodeInput').value));
  const qtyInput = document.getElementById('preQtyInput');
  if (!item) throw new Error(menu ? '查無此代號' : '尚未啟用菜單');
  if (!validInteger(qtyInput.value, 1, 999)) throw new Error('數量需為 1～999 的整數');
  const qty = Number(qtyInput.value);
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可加入其他品項');
    order.items.push({ name: item.name, unitPrice: item.price, qty });
  }, date);
  document.getElementById('preCodeInput').value = ''; qtyInput.value = '1';
}
async function preAddManual() {
  if (!isAdmin() && state.manualLocked) throw new Error('管理員已鎖定手動餐點');
  const { date, seat } = requirePreorderContext();
  const name = document.getElementById('preManualName').value.trim();
  const priceInput = document.getElementById('preManualPrice'), qtyInput = document.getElementById('preManualQty');
  if (!name || name.length > 100) throw new Error('品名需為 1～100 字');
  if (!validInteger(priceInput.value, 0, 1_000_000)) throw new Error('價格需為 0～1000000 的整數');
  if (!validInteger(qtyInput.value, 1, 999)) throw new Error('數量需為 1～999 的整數');
  const unitPrice = Number(priceInput.value), qty = Number(qtyInput.value);
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可加入其他品項');
    order.items.push({ name, unitPrice, qty });
  }, date);
  document.getElementById('preManualName').value = ''; priceInput.value = ''; qtyInput.value = '1';
}
async function preOnQtyChange(event) {
  const input = event.target;
  if (!input.classList.contains('preQty')) return;
  const { date, seat } = requirePreorderContext();
  if (!validInteger(input.value, 1, 999)) { await renderPreorder(); throw new Error('數量需為 1～999 的整數'); }
  const qty = Number(input.value);
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可編輯數量');
    findOrderItem(order, input).qty = qty;
  }, date);
}
async function preOnDelete(event) {
  const button = event.target.closest('.preDel');
  if (!button) return;
  const { date, seat } = requirePreorderContext();
  await changeOrder(seat, order => {
    if (order.internalOnly) throw new Error('內訂狀態不可刪除品項');
    const item = findOrderItem(order, button);
    order.items.splice(order.items.indexOf(item), 1);
  }, date);
}
async function preOnInternalToggle() {
  const { date, seat } = requirePreorderContext();
  const checked = document.getElementById('preInternalOnly').checked;
  await changeOrder(seat, order => {
    order.internalOnly = checked;
    order.items = checked ? [{ name: '內訂', unitPrice: 0, qty: 1 }] : [];
  }, date);
}
async function preOnPaidToggle(event, checked) {
  const input = event.target;
  if (input.id !== 'prePaidCheckbox' || !isAdmin()) return;
  await changePayment(input, checked);
}


/* =========================
   初始化
   ========================= */
function renderSeatsThenDefault(){
  renderSeats();
  if (!seatSelect.value) seatSelect.value = '1';
}
function renderStatic(){ renderSeatsThenDefault(); }
function manualItemLocked(item) {
  if (isAdmin() || !state.manualLocked || item.name === '內訂' && Number(item.unitPrice) === 0 && Number(item.qty) === 1) return false;
  return !state.menus.find(menu => menu.id === state.activeMenuId)?.items.some(row => row.name === item.name && Number(row.price) === Number(item.unitPrice));
}
function renderManualPolicy() {
  const checkbox = document.getElementById('manualOrderLocked');
  checkbox.checked = state.manualLocked;
  const message = state.manualLocked ? '手動餐點已鎖定：僅管理員可新增或修改。' : '手動餐點開放中，可自行輸入品名、單價與數量。';
  for (const id of ['manualOrderHint', 'manualPreorderHint']) document.getElementById(id).textContent = message;
}
async function fetchManualPolicy() {
  const policy = await api('/settings/manual-order');
  state.manualLocked = policy.locked !== false;
  renderManualPolicy();
}
listen(document.getElementById('manualOrderLocked'), 'change', async () => {
  if (!isAdmin()) return;
  const checkbox = document.getElementById('manualOrderLocked');
  const locked = checkbox.checked;
  checkbox.disabled = true;
  try {
    const policy = await api('/settings/manual-order', { method: 'PUT', body: JSON.stringify({ locked }) });
    state.manualLocked = policy.locked;
    await renderSeatOrder();
    if (!document.getElementById('pagePreorders').classList.contains('hidden')) await renderPreorder();
    notify(locked ? '已鎖定手動餐點' : '已開放手動餐點');
  } finally { checkbox.disabled = false; renderManualPolicy(); }
});

async function initApp(){
  if (state.me?.mustChangePassword) return showInitialPasswordChange();
  await Promise.all([loadMenus(), fetchManualPolicy(), fetchSeats()]);
  renderActiveMenu();
  renderMenuPage();
  ensurePreorderUI();          // 確保預訂頁存在
  renderPreSettingsUI();       // 報表頁顯示預訂設定（admin）
  ensureUnpaidUI();            // 報表頁顯示未付款卡片
  await renderSeatOrder();
  await safeRenderAdminReports(); // 只在 admin 才打報表 API
  if (isAdmin()) await runTask(renderAllSeatsAdmin);

  // 一般使用者若未啟用預訂，就隱藏預訂 Tab
  const tab = document.getElementById('tabPreorders');
  if (tab) tab.classList.toggle('hidden', !isAdmin() && !state.pre.settings.enabled);
}

let refreshingView = false;
async function refreshVisibleView() {
  if (!token || !state.me || state.me.mustChangePassword || document.hidden || refreshingView || orderQueues.size || paymentPending.size || purgingOrders) return;
  if (!pageMenus.classList.contains('hidden') || !pageReports.classList.contains('hidden')) return;
  refreshingView = true;
  const epoch = sessionEpoch;
  try {
    await Promise.all([fetchOpenStatus(), fetchPreSettings(), fetchManualPolicy(), loadMenus(), fetchSeats()]);
    if (epoch !== sessionEpoch) return;
    state.ordersCache.clear(); state.pre.cache.clear(); allSeatsSnapshot = null;
    ensurePreorderUI();
    if (!pageUsers.classList.contains('hidden') && isAdmin() && !usersTableBody.querySelector('[data-busy]') && ![...usersTableBody.querySelectorAll('input')].some(input => input.value || input === document.activeElement)) await loadUsers({ quiet: true });
    renderActiveMenu();
    if (!pageOrders.classList.contains('hidden')) { await renderSeatOrder(); if (isAdmin()) await renderAllSeatsAdmin(true); }
    if (!document.getElementById('pagePreorders').classList.contains('hidden')) await renderPreorder();
  } finally { refreshingView = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) runTask(refreshVisibleView); });
setInterval(() => runTask(refreshVisibleView), 60_000);
setInterval(() => {
  if (isAdmin() && !state.me?.mustChangePassword && token && !document.hidden && !pageOrders.classList.contains('hidden') && !refreshingView && !paymentPending.size && !orderQueues.size && !purgingOrders) runTask(() => renderAllSeatsAdmin(true));
}, 15_000);

// 自動登入驗證（✅ /auth/me 現在統一回傳 { id, username, role }）
(async function bootstrap(){
  if (window.self !== window.top) {
    // GitHub Pages cannot set frame-ancestors/X-Frame-Options for this project.
    // Refuse to expose interactive controls inside any embedding document.
    const guard = document.createElement('main'); guard.className = 'card w400';
    const title = document.createElement('h1'); title.textContent = '請在獨立分頁開啟午餐系統';
    const message = document.createElement('p'); message.textContent = '為避免其他網頁誘導點擊，嵌入畫面不提供登入或管理操作。';
    const link = document.createElement('a'); link.href = new URL(location.pathname, location.origin).href;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '在獨立分頁開啟系統';
    guard.append(title, message, link); document.body.replaceChildren(guard);
    return;
  }
  renderStatic();
  if (!token) return showLogin();
  try{
    showLogin({ keepLoading: true });
    const me = await api('/auth/me');
    onLoginUser(me.user);
    if (me.user?.mustChangePassword) return showInitialPasswordChange();
    await Promise.all([fetchOpenStatus(), fetchPreSettings()]);
    ensurePreorderUI();
    ensureUnpaidUI();
    await initApp();
    switchTab('orders');
    if (token) showApp();
  }catch(error){
    loginMsg.textContent = '載入失敗：' + error.message;
    showLogin();
  }
})();
