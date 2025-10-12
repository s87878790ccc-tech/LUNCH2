// ====== 後端 API ======
const API_BASE = 'https://lunch2.onrender.com/api';

// ====== DOM ======
const app = document.getElementById('app');
const loginLayer = document.getElementById('loginLayer');
function initLoginLayerStyles() {
  Object.assign(loginLayer.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    display: 'none', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', zIndex: '9999'
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
const clearSeat = document.getElementById('clearSeat');
const codeInput = document.getElementById('codeInput');
const qtyInput  = document.getElementById('qtyInput');
const addByCode = document.getElementById('addByCode');
const manualName = document.getElementById('manualName');
const manualPrice = document.getElementById('manualPrice');
const manualQty = document.getElementById('manualQty');
const addManual = document.getElementById('addManual');
const internalOnly = document.getElementById('internalOnly');

const orderTableBody = document.querySelector('#orderTable tbody');
const seatSubtotal = document.getElementById('seatSubtotal');

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

// Admin: 開放時段
const owDaysWrap = document.getElementById('owDays');
const owStart = document.getElementById('owStart');
const owEnd = document.getElementById('owEnd');
const owSave = document.getElementById('owSave');
const owNow  = document.getElementById('owNow');

// ====== 基礎 Auth 與 UI ======
let token = localStorage.getItem('jwt') || null;
apiBaseHint.textContent = `API: ${API_BASE}`;

function authHeader() { return token ? { 'Authorization': 'Bearer '+token } : {}; }
function showLogin() { loginLayer.classList.remove('hidden'); loginLayer.style.display='flex'; loginLayer.style.pointerEvents='auto'; app.classList.add('hidden'); }
function showApp() { loginLayer.classList.add('hidden'); loginLayer.style.display='none'; loginLayer.style.pointerEvents='none'; app.classList.remove('hidden'); }
initLoginLayerStyles();

// 裝置偵測（手機）
const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;

// 登入/登出
loginBtn.onclick = async () => {
  loginMsg.textContent = '';
  try {
    const data = await api('/auth/login', { method:'POST', body: JSON.stringify({ username: loginUser.value.trim(), password: loginPass.value }) });
    token = data.token; localStorage.setItem('jwt', token);
    onLoginUser(data.user);
    await initApp(); switchTab('orders'); showApp();
  } catch (e) { loginMsg.textContent = '登入失敗：' + e.message; }
};
logoutBtn.onclick = () => { localStorage.removeItem('jwt'); token=null; showLogin(); };

// ====== API helper ======
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers || {}) }
  });
  const raw = await res.text();
  const ct = res.headers.get('content-type') || '';
  let data = null; if (ct.includes('application/json') && raw) { try{ data = JSON.parse(raw) }catch{} }
  if (res.status === 401) { localStorage.removeItem('jwt'); token=null; showLogin(); throw new Error(data?.message || 'unauthorized'); }
  if (!res.ok) { throw new Error(data?.message || raw || `${res.status} ${res.statusText}`); }
  return data ?? raw;
}

// ====== 狀態 ======
const MIN_SEAT=1, MAX_SEAT=36;
const state = { me:null, menus:[], activeMenuId:null, ordersCache:new Map(), openWindow:null, isOpen:false };

function onLoginUser(user){
  state.me = user;
  whoami.textContent = `${user.username}（${user.role}）`;
  const isAdmin = user.role === 'admin';
  tabLogs.classList.toggle('hidden', !isAdmin);
  tabUsers.classList.toggle('hidden', false);
  tabMenus.classList.toggle('hidden', !isAdmin);
  tabReports.classList.toggle('hidden', !isAdmin);
  document.querySelectorAll('.only-admin').forEach(el=>el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.only-user').forEach(el=>el.classList.toggle('hidden', isAdmin));

  // 一般使用者：座號固定為自己帳號（數字）
  if (!isAdmin) {
    const mySeat = parseInt(user.username,10);
    seatSelect.innerHTML = `<option value="${mySeat}">座號 ${mySeat}</option>`;
    seatSelect.disabled = true;
  } else {
    renderSeats();
  }
}

// ====== 切頁 ======
function switchTab(which){
  const map = { orders:[tabOrders,pageOrders], menus:[tabMenus,pageMenus], reports:[tabReports,pageReports], logs:[tabLogs,pageLogs], users:[tabUsers,pageUsers] };
  for (const k of Object.keys(map)){ const [btn,page] = map[k]; btn.classList.toggle('active', k===which); page.classList.toggle('hidden', k!==which); }
  if (which==='reports') { renderAgg(); renderMissing(); loadOpenWindow(); }
  if (which==='logs') { renderLogs(); }
  if (which==='users') { loadUsers(); }
}
tabOrders.onclick = ()=>switchTab('orders');
tabMenus.onclick  = ()=>switchTab('menus');
tabReports.onclick= ()=>switchTab('reports');
tabLogs.onclick   = ()=>switchTab('logs');
tabUsers.onclick  = ()=>switchTab('users');

// ====== 菜單 & 訂單 API ======
async function loadMenus(){ const data = await api('/menus'); state.menus = data.menus||[]; state.activeMenuId = data.activeMenuId ?? (state.menus[0]?.id ?? null); }
async function setActiveMenu(menuId){ await api('/settings/active-menu', { method:'PUT', body: JSON.stringify({ menuId }) }); state.activeMenuId = menuId; }
async function createMenu(name){ const m = await api('/menus', { method:'POST', body: JSON.stringify({ name })}); state.menus.push(m); }
async function renameMenuReq(id, name){ await api(`/menus/${id}`, { method:'PUT', body: JSON.stringify({ name })}); const m = state.menus.find(x=>x.id===id); if (m) m.name = name; }
async function deleteMenuReq(id){ await api(`/menus/${id}`, { method:'DELETE' }); state.menus = state.menus.filter(x=>x.id!==id); if (state.activeMenuId===id) state.activeMenuId = state.menus[0]?.id ?? null; }
async function addMenuItemReq(menuId, name, price){ const it = await api(`/menus/${menuId}/items`, { method:'POST', body: JSON.stringify({ name, price })}); const m = state.menus.find(x=>x.id===menuId); if (m) m.items.push(it); }
async function updateMenuItemReq(itemId, name, price){ await api(`/menu-items/${itemId}`, { method:'PUT', body: JSON.stringify({ name, price })}); for (const m of state.menus){ const it = m.items.find(i=>i.id===itemId); if (it) { it.name=name; it.price=Number(price); break; } } }
async function deleteMenuItemReq(itemId){ await api(`/menu-items/${itemId}`, { method:'DELETE' }); for (const m of state.menus) m.items = m.items.filter(i=>i.id!==itemId); }
async function getOrder(seat){ if (state.ordersCache.has(seat)) return state.ordersCache.get(seat); const o = await api(`/orders/${seat}`); state.ordersCache.set(seat, o); return o; }
async function saveOrder(seat, order){ await api(`/orders/${seat}`, { method:'PUT', body: JSON.stringify(order) }); state.ordersCache.set(seat, order); }
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }
// 開放時段
async function getOpenWindow(){ return api('/settings/open-window'); }
async function setOpenWindow(cfg){ return api('/settings/open-window', { method:'PUT', body: JSON.stringify(cfg) }); }

// ====== Render ======
function fmt(n){ return Number(n||0).toLocaleString('zh-Hant-TW'); }
function renderSeats(){ seatSelect.innerHTML=''; for(let s=MIN_SEAT; s<=MAX_SEAT; s++){ const opt=document.createElement('option'); opt.value=String(s); opt.textContent=`座號 ${s}`; seatSelect.appendChild(opt);} seatSelect.value=seatSelect.value||'1'; }
function renderActiveMenu() {
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  activeMenuName.textContent = m ? m.name : '(未選擇)';
  const pills = (m?.items||[]).map(it=>`<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  activeMenuList.innerHTML = pills || '(此菜單沒有項目)';
  menuView.innerHTML = pills;

  // 手機：觸控代號鍵盤
  if (isMobile) {
    // 建立一個按鈕區塊於 menuView 下方
    let pad = document.getElementById('touchPad');
    if (!pad) {
      pad = document.createElement('div'); pad.id = 'touchPad'; pad.className='touch-pad';
      menuView.parentElement.appendChild(pad);
    }
    pad.innerHTML = (m?.items||[]).map(it => `<button class="ghost tp" data-code="${it.code}">#${it.code}</button>`).join('');
    pad.onclick = (e)=>{
      const btn = e.target.closest('.tp'); if(!btn) return;
      codeInput.value = btn.dataset.code; qtyInput.value = '1';
    };
  }
}
function renderMenuPage(){
  menuSelect.innerHTML = state.menus.map((m,i)=>`<option value="${m.id}">${i+1}. ${m.name}</option>`).join('');
  if (state.activeMenuId) menuSelect.value = String(state.activeMenuId);
  menuTableBody.innerHTML = '';
  const m = state.menus.find(x=>x.id===state.activeMenuId); if (!m) return;
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
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  // 內訂 checkbox
  internalOnly.checked = !!o.internal;

  orderTableBody.innerHTML = '';
  let subtotal = 0;
  o.items.forEach((it,idx)=>{
    const line = it.unitPrice * it.qty; subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td>${o.internal ? '-' : `<input type="number" min="1" value="${it.qty}" class="qtyInput w120" data-idx="${idx}"/>`}</td>
      <td>${fmt(line)}</td>
      <td>${o.internal ? '' : `<button class="danger delBtn" data-idx="${idx}">刪除</button>`}</td>`;
    orderTableBody.appendChild(tr);
  });
  seatSubtotal.textContent = fmt(subtotal);
}
async function renderAgg(){
  const data = await getAggregate();
  aggTableBody.innerHTML = data.items.map(r=>`<tr><td>${r.name}</td><td>${fmt(r.totalQty)}</td><td>${fmt(r.totalMoney)}</td></tr>`).join('');
  classTotalEl.textContent = fmt(data.classTotal);
}
async function renderMissing(){
  const data = await getMissing();
  const arr = data.missing||[];
  missingList.textContent = arr.length ? `座號：${arr.join(', ')}` : '全部人都完成填單！';
}

// Logs（中文化）
function timeAgo(iso){ const d=new Date(iso); const diff=(Date.now()-d.getTime())/1000;
  if(diff<60) return `${Math.floor(diff)} 秒前`; if(diff<3600) return `${Math.floor(diff/60)} 分鐘前`;
  if(diff<86400) return `${Math.floor(diff/3600)} 小時前`; return `${Math.floor(diff/86400)} 天前`; }
function fmtTime(iso){ const d=new Date(iso); const s=d.toLocaleString('zh-TW',{hour12:false}); return `${s}（${timeAgo(iso)}）`; }
const ACTION_MAP = { login:'登入', 'menu.create':'建立菜單', 'menu.update':'修改菜單', 'menu.delete':'刪除菜單',
  'menu.item.create':'新增菜單品項','menu.item.update':'修改菜單品項','menu.item.delete':'刪除菜單品項',
  'settings.activeMenu':'切換啟用菜單','settings.openWindow':'設定開放時段',
  'order.update':'更新訂單','user.create':'建立使用者','user.delete':'刪除使用者','user.bulkDelete':'批次刪除使用者',
  'user.changePassword':'變更密碼','user.status':'變更狀態','user.role':'變更角色'};
function briefDetails(raw){ if(!raw) return ''; try{ const obj=typeof raw==='string'?JSON.parse(raw):raw;
  const pairs=[]; for(const [k,v] of Object.entries(obj)){ let val=v; if(typeof v==='object'&&v!==null) val=JSON.stringify(v);
  if(String(val).length>40) val=String(val).slice(0,40)+'…'; pairs.push(`${k}=${val}`);} return pairs.join('  ');}catch{return String(raw)}}
async function renderLogs(){
  logsTableBody.innerHTML = '<tr><td colspan="6">載入中…</td></tr>';
  try{
    const data = await api('/logs');
    if (!data.logs?.length) { logsTableBody.innerHTML = '<tr><td colspan="6" class="muted">目前沒有紀錄</td></tr>'; return; }
    logsTableBody.innerHTML = data.logs.map(l=>{
      const actionName = ACTION_MAP[l.action] || l.action;
      const detailsStr = briefDetails(l.details);
      const who = l.user_id ? `#${l.user_id}` : '（系統）';
      return `<tr>
        <td>${l.id}</td><td>${fmtTime(l.ts)}</td><td>${who}</td>
        <td><span class="tag">${actionName}</span></td>
        <td><div class="small" style="white-space:pre-wrap">${detailsStr}</div></td>
        <td class="small muted"><div>${l.ip||''}</div><div>${(l.ua||'').slice(0,80)}</div></td>
      </tr>`;
    }).join('');
  }catch(e){ logsTableBody.innerHTML = `<tr><td colspan="6">讀取失敗：${e.message}</td></tr>`; }
}

// ====== 使用者頁（沿用你原本的 admin 強化版本；略） ======
// 這裡保留你之前的 listUsersAdv/createUser/reset/deletion … 的實作不變（篇幅略）
// 為了簡潔，僅保留會被呼叫的 loadUsers() 入口；若你需要我再貼完整 users 管理 JS，告訴我。

async function loadUsers(){ /* 保持你前一版的 admin users 管理實作 */ }

// ====== 事件 ======
seatSelect.addEventListener('change', ()=>{ renderSeatOrder(); });
clearSeat.addEventListener('click', async ()=>{
  const seat = Number(seatSelect.value||1);
  if (!confirm(`確定清空座號 ${seat} 的訂單？`)) return;
  await saveOrder(seat, { internal:false, items:[] });
  state.ordersCache.delete(seat);
  await renderSeatOrder(); await renderAgg(); await renderMissing();
});
internalOnly.addEventListener('change', async ()=>{
  const seat = Number(seatSelect.value||1);
  if (internalOnly.checked) {
    if(!confirm('切換為「內訂」後，將移除所有品項，只記錄人數。確定？')) { internalOnly.checked=false; return; }
    await saveOrder(seat, { internal:true, items:[] });
  } else {
    // 取消內訂：恢復成一般模式（空清單，尚未提交，直到新增品項）
    await saveOrder(seat, { internal:false, items:[] });
  }
  state.ordersCache.delete(seat);
  await renderSeatOrder(); await renderAgg(); await renderMissing();
});
addByCode.addEventListener('click', async ()=>{
  const m = state.menus.find(x=>x.id===state.activeMenuId);
  if (!m) return alert('尚未選擇菜單');
  const code = Number(codeInput.value||0);
  const qty  = Number(qtyInput.value||1);
  const it = m.items.find(x=>x.code===code);
  if (!it) return alert('查無此代號');
  if (qty<=0) return alert('數量需 >= 1');
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  if (o.internal) return alert('目前為「內訂」狀態，不能新增品項');
  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await saveOrder(seat, { internal:false, items: o.items });
  codeInput.value=''; qtyInput.value='1';
  await renderSeatOrder(); await renderAgg();
});
addManual.addEventListener('click', async ()=>{
  const name = (manualName.value||'').trim();
  const price= Number(manualPrice.value||0);
  const qty  = Number(manualQty.value||1);
  if (!name) return alert('請輸入品名');
  if (price<0) return alert('價格需 >= 0');
  if (qty<=0) return alert('數量需 >= 1');
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  if (o.internal) return alert('目前為「內訂」狀態，不能新增品項');
  o.items.push({ name, unitPrice:price, qty });
  await saveOrder(seat, { internal:false, items: o.items });
  manualName.value=''; manualPrice.value=''; manualQty.value='1';
  await renderSeatOrder(); await renderAgg();
});
orderTableBody.addEventListener('input', async (e)=>{
  const t = e.target;
  if (t.classList.contains('qtyInput')) {
    const seat = Number(seatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getOrder(seat);
    o.items[idx].qty = Math.max(1, Number(t.value||1));
    await saveOrder(seat, { internal:false, items:o.items });
    await renderSeatOrder(); await renderAgg();
  }
});
orderTableBody.addEventListener('click', async (e)=>{
  const t = e.target;
  if (t.classList.contains('delBtn')) {
    const seat = Number(seatSelect.value||1);
    const idx = Number(t.dataset.idx);
    const o = await getOrder(seat);
    o.items.splice(idx,1);
    await saveOrder(seat, { internal:false, items:o.items });
    await renderSeatOrder(); await renderAgg();
  }
});

useMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); await setActiveMenu(id); renderActiveMenu(); renderMenuPage(); });
addMenu.addEventListener('click', async ()=>{ const name = menuNewName.value.trim() || `新菜單 ${state.menus.length+1}`; await createMenu(name); await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立並置於清單尾端'); });
renameMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); const name = menuNewName.value.trim(); if (!name) return alert('請輸入新名稱'); await renameMenuReq(id, name); await loadMenus(); renderActiveMenu(); renderMenuPage(); });
dupMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); const src = state.menus.find(x=>x.id===id); if (!src) return;
  await createMenu(src.name + '（副本）'); const newMenu = state.menus[state.menus.length-1];
  for (const it of src.items) await addMenuItemReq(newMenu.id, it.name, it.price);
  await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立副本'); });
delMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); if (!confirm('確定刪除此菜單？')) return; await deleteMenuReq(id); await loadMenus(); renderActiveMenu(); renderMenuPage(); });
addItem.addEventListener('click', async ()=>{ const mId = Number(menuSelect.value); const name = itemName.value.trim(); const price = Number(itemPrice.value||0);
  if (!name) return alert('請輸入品名'); if (price<0) return alert('價格需 >= 0'); await addMenuItemReq(mId, name, price);
  itemName.value=''; itemPrice.value=''; await loadMenus(); renderActiveMenu(); renderMenuPage(); });
menuTableBody.addEventListener('input', async (e)=>{ const t=e.target;
  if (t.classList.contains('nameEdit') || t.classList.contains('priceEdit')) {
    const id = Number(t.dataset.id); const tr = t.closest('tr');
    const name = tr.querySelector('.nameEdit').value; const price= Number(tr.querySelector('.priceEdit').value||0);
    await updateMenuItemReq(id, name, price); await loadMenus(); renderActiveMenu(); renderMenuPage(); renderAgg();
  }
});
menuTableBody.addEventListener('click', async (e)=>{ const t=e.target;
  if (t.classList.contains('delItem')) { const id = Number(t.dataset.id); await deleteMenuItemReq(id); await loadMenus(); renderActiveMenu(); renderMenuPage(); }
});

// Admin：開放時段
function renderDaysCheckboxes(){
  if (!owDaysWrap) return;
  owDaysWrap.innerHTML = '';
  for(let d=0; d<7; d++){
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" class="owDay" value="${d}"> ${'日一二三四五六'[d]}`;
    owDaysWrap.appendChild(lab);
  }
}
async function loadOpenWindow(){
  try{
    const data = await getOpenWindow();
    state.openWindow = data.window; state.isOpen = !!data.isOpen;
    if (owNow) owNow.textContent = state.isOpen ? '目前：開放' : '目前：關閉';
    if (state.openWindow) {
      const { days, start, end } = state.openWindow;
      if (owStart) owStart.value = start || '07:00';
      if (owEnd) owEnd.value = end || '12:00';
      document.querySelectorAll('.owDay').forEach(cb=>{
        cb.checked = Array.isArray(days) ? days.includes(Number(cb.value)) : false;
      });
    }
  }catch(e){ if (owNow) owNow.textContent = '載入失敗'; }
}
if (owSave){
  owSave.addEventListener('click', async ()=>{
    const days = [...document.querySelectorAll('.owDay')].filter(x=>x.checked).map(x=>Number(x.value));
    const start = owStart.value || '07:00'; const end = owEnd.value || '12:00';
    try{ await setOpenWindow({ timezone:'Asia/Taipei', days, start, end }); alert('已儲存'); await loadOpenWindow(); }
    catch(e){ alert('儲存失敗：'+e.message); }
  });
}

// ====== 初始化 ======
function renderStatic(){
  if (state.me?.role!=='admin') { /* seatSelect 會在 onLoginUser 設定 */ }
  else { renderSeats(); }
  renderDaysCheckboxes();
}
async function initApp(){
  await loadMenus(); renderActiveMenu(); renderMenuPage();
  await renderSeatOrder(); await renderAgg(); await renderMissing(); await loadOpenWindow();
}

// 自動登入驗證
(async function bootstrap(){
  renderStatic();
  if (!token) return showLogin();
  try{
    const me = await api('/auth/me');
    onLoginUser(me.user); await initApp(); switchTab('orders'); showApp();
  }catch{ showLogin(); }
})();
