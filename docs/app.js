// ====== 調整這個成你的後端 API 網址 ======
const API_BASE = 'https://lunch2.onrender.com/api';

// ====== DOM ======
const app = document.getElementById('app');
const loginLayer = document.getElementById('loginLayer');
// 讓登入層成為全畫面遮罩 + 置中容器
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

// ====== 基礎：Auth 狀態與 UI（必須在 bootstrap 之前）======
let token = localStorage.getItem('jwt') || null;
apiBaseHint.textContent = `API: ${API_BASE}`;

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

// 登入/登出事件
loginBtn.onclick = async () => {
  loginMsg.textContent = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: loginUser.value.trim(),
        password: loginPass.value
      })
    });
    token = data.token;
    localStorage.setItem('jwt', token);
    onLoginUser(data.user);
    await initApp();
    switchTab('orders');
    showApp();
  } catch (e) {
    loginMsg.textContent = '登入失敗：' + e.message;
  }
};
logoutBtn.onclick = () => {
  localStorage.removeItem('jwt'); token = null; showLogin();
};

createUserBtn?.addEventListener('click', async () => {
  if (!state.me || state.me.role !== 'admin') {
    alert('權限不足：只有管理員可以建立新帳號');
    return;
  }
  const username = newUserName.value.trim();
  const password = newUserPass.value;
  const role     = newUserRole.value;
  if (!username || !password || password.length < 6) {
    alert('請填帳號與密碼(>=6)');
    return;
  }
  try {
    await createUser(username, password, role);
    newUserName.value = ''; newUserPass.value = '';
    await loadUsers();
    alert('已建立');
  } catch (e) {
    alert('建立失敗：' + e.message);
  }
});

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
  if (res.status === 401) { localStorage.removeItem('jwt'); token = null; showLogin(); throw new Error(data?.message || 'unauthorized'); }
  if (!res.ok) { const msg = data?.message || raw || `${res.status} ${res.statusText}`; throw new Error(msg); }
  return data ?? raw;
}

// ====== 狀態 ======
const MIN_SEAT=1, MAX_SEAT=36;
const state = { me:null, menus:[], activeMenuId:null, ordersCache:new Map() };

function onLoginUser(user){
  state.me = user;
  whoami.textContent = `${user.username}（${user.role}）`;
  const isAdmin = user.role === 'admin';

  // Tab 顯示
  tabOrders.classList.toggle('hidden', false);
  tabUsers.classList.toggle('hidden', false);
  tabMenus.classList.toggle('hidden', !isAdmin);
  tabReports.classList.toggle('hidden', !isAdmin);
  tabLogs.classList.toggle('hidden', !isAdmin);

  // 區塊顯示：標上 .only-admin / .only-user 的區塊，就會自動切換
  document.querySelectorAll('.only-admin')
    .forEach(el => el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.only-user')
    .forEach(el => el.classList.toggle('hidden', isAdmin));
}


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
  if (which==='reports') { ensureInspectorUI(); renderAgg(); renderMissing(); }
  if (which==='logs') { renderLogs(); }
  if (which==='users') { loadUsers(); }
}
tabOrders.onclick = ()=>switchTab('orders');
tabMenus.onclick  = ()=>switchTab('menus');
tabReports.onclick= ()=>switchTab('reports');
tabLogs.onclick   = ()=>switchTab('logs');
tabUsers.onclick  = ()=>switchTab('users');

// ====== 菜單 & 訂單 API ======
async function loadMenus(){
  const data = await api('/menus');
  state.menus = data.menus || [];
  state.activeMenuId = data.activeMenuId ?? (state.menus[0]?.id ?? null);
}
async function setActiveMenu(menuId){ await api('/settings/active-menu', { method:'PUT', body: JSON.stringify({ menuId }) }); state.activeMenuId = menuId; }
async function createMenu(name){ const m = await api('/menus', { method:'POST', body: JSON.stringify({ name })}); state.menus.push(m); }
async function renameMenuReq(id, name){ await api(`/menus/${id}`, { method:'PUT', body: JSON.stringify({ name })}); const m = state.menus.find(x=>x.id===id); if (m) m.name = name; }
async function deleteMenuReq(id){ await api(`/menus/${id}`, { method:'DELETE' }); state.menus = state.menus.filter(x=>x.id!==id); if (state.activeMenuId===id) state.activeMenuId = state.menus[0]?.id ?? null; }
async function addMenuItemReq(menuId, name, price){ const it = await api(`/menus/${menuId}/items`, { method:'POST', body: JSON.stringify({ name, price })}); const m = state.menus.find(x=>x.id===menuId); if (m) m.items.push(it); }
async function updateMenuItemReq(itemId, name, price){ await api(`/menu-items/${itemId}`, { method:'PUT', body: JSON.stringify({ name, price })}); for (const m of state.menus) { const it = m.items.find(i=>i.id===itemId); if (it) { it.name=name; it.price=Number(price); break; } } }
async function deleteMenuItemReq(itemId){ await api(`/menu-items/${itemId}`, { method:'DELETE' }); for (const m of state.menus) m.items = m.items.filter(i=>i.id!==itemId); }
async function getOrder(seat){ if (state.ordersCache.has(seat)) return state.ordersCache.get(seat); const o = await api(`/orders/${seat}`); state.ordersCache.set(seat, o); return o; }
async function saveOrder(seat, order){ await api(`/orders/${seat}`, { method:'PUT', body: JSON.stringify(order) }); state.ordersCache.set(seat, order); }
async function getAggregate(){ return api('/reports/aggregate'); }
async function getMissing(){ return api('/reports/missing'); }

// ====== Logs & Users（admin/user）=====
async function getLogs(){ return api('/logs'); }
async function listUsers(){ return api('/users'); }
async function createUser(username, password, role){ return api('/users', { method:'POST', body: JSON.stringify({ username, password, role })}); }
// 支援一般用戶帶 oldPassword
async function resetPassword(userId, newPassword, oldPassword){
  return api(`/users/${userId}/password`, {
    method:'PUT',
    body: JSON.stringify(oldPassword ? { oldPassword, newPassword } : { newPassword })
  });
}

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
  const list = (m?.items||[]).map(it => `<span class="pill" title="${it.name}">#${it.code} ${it.name} $${it.price}</span>`).join(' ');
  activeMenuList.innerHTML = list || '(此菜單沒有項目)'; menuView.innerHTML = list;
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
  orderTableBody.innerHTML = '';
  let subtotal = 0;
  o.items.forEach((it,idx)=>{
    const line = it.unitPrice * it.qty; subtotal += line;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${it.name}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td><input type="number" min="1" value="${it.qty}" class="qtyInput w120" data-idx="${idx}"/></td>
      <td>${fmt(line)}</td>
      <td><button class="danger delBtn" data-idx="${idx}">刪除</button></td>`;
    orderTableBody.appendChild(tr);
  });
  seatSubtotal.textContent = fmt(subtotal);
  toggleSubmitted.textContent = o.submitted ? '設為未完成' : '標記完成';
}
async function renderAgg(){
  const data = await getAggregate();
  aggTableBody.innerHTML = data.items.map(r=> `<tr><td>${r.name}</td><td>${fmt(r.totalQty)}</td><td>${fmt(r.totalMoney)}</td></tr>`).join('');
  classTotalEl.textContent = fmt(data.classTotal);
}
async function renderMissing(){
  const data = await getMissing();
  const arr = data.missing||[];
  missingList.textContent = arr.length ? `座號：${arr.join(', ')}` : '全部人都完成填單！';
}
async function renderLogs(){
  logsTableBody.innerHTML = '<tr><td colspan="7">載入中…</td></tr>';
  try{
    const data = await getLogs();
    logsTableBody.innerHTML = data.logs.map(l=>{
      let details = l.details;
      try{ if(details) details = JSON.stringify(JSON.parse(details), null, 2) }catch{}
      return `<tr>
        <td>${l.id}</td>
        <td>${l.ts}</td>
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

// ====== 後台：單一座號檢視（僅 admin）======
let inspectWrap = null;
function ensureInspectorUI() {
  if (state.me?.role !== 'admin') { if (inspectWrap) inspectWrap.innerHTML = ''; return; }
  if (!inspectWrap) { inspectWrap = document.createElement('div'); inspectWrap.id = 'inspectWrap'; pageReports.prepend(inspectWrap); }
  inspectWrap.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex;gap:8px;align-items:center;">
        <strong>單一座號檢視</strong>
        <label>座號 <input id="inspectSeat" type="number" min="1" max="36" value="1" class="w120"/></label>
        <button id="inspectBtn">查看</button>
      </div>
      <div style="margin-top:8px;">
        <table class="table small">
          <thead><tr><th>#</th><th>品名</th><th>單價</th><th>數量</th><th>小計</th></tr></thead>
          <tbody id="inspectTable"><tr><td colspan="5" class="muted">請輸入座號後查看</td></tr></tbody>
        </table>
        <div style="text-align:right;padding:6px 0;">小計：<span id="inspectSubtotal">0</span></div>
      </div>
    </div>`;
  document.getElementById('inspectBtn').onclick = () => renderInspect();
}
async function renderInspect() {
  const seat = Number(document.getElementById('inspectSeat').value || 1);
  try {
    const o = await getOrder(seat);
    const tbody = document.getElementById('inspectTable');
    let subtotal = 0;
    if (!o.items.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">此座號目前沒有品項</td></tr>';
    } else {
      tbody.innerHTML = o.items.map((it, i) => {
        const line = it.unitPrice * it.qty; subtotal += line;
        return `<tr>
          <td>${i+1}</td><td>${it.name}</td><td>${fmt(it.unitPrice)}</td><td>${fmt(it.qty)}</td><td>${fmt(line)}</td>
        </tr>`;
      }).join('');
    }
    document.getElementById('inspectSubtotal').textContent = fmt(subtotal);
  } catch(e) {
    document.getElementById('inspectTable').innerHTML = `<tr><td colspan="5">讀取失敗：${e.message}</td></tr>`;
    document.getElementById('inspectSubtotal').textContent = '0';
  }
}

// ====== Users（依角色渲染）======
async function loadUsers(){
  const isAdmin = state.me?.role === 'admin';
  if (!isAdmin) {
    // 一般用戶：只允許改自己的密碼（需舊密碼）
    usersTableBody.innerHTML = `
      <tr>
        <td>${state.me.id ?? ''}</td>
        <td>${state.me.username}</td>
        <td>${state.me.role}</td>
        <td>
          <input type="password" placeholder="舊密碼" id="old_${state.me.uid||state.me.id||'me'}" />
          <input type="password" placeholder="新密碼(>=6)" id="new_${state.me.uid||state.me.id||'me'}" />
          <button id="selfResetBtn">變更</button>
        </td>
      </tr>`;
    const btn = document.getElementById('selfResetBtn');
    btn.onclick = async () => {
      const oid = state.me.uid || state.me.id;
      const oldPwd = document.getElementById(`old_${oid}`).value;
      const newPwd = document.getElementById(`new_${oid}`).value;
      if (!oldPwd || !newPwd || newPwd.length < 6) return alert('請輸入舊密碼與新密碼(>=6)');
      try { await resetPassword(oid, newPwd, oldPwd); alert('已更新密碼，請重新登入'); logoutBtn.click(); }
      catch(e){ alert('變更失敗：'+e.message); }
    };
    return;
  }

  // 管理員：使用者清單 + 重設密碼
  usersTableBody.innerHTML = '<tr><td colspan="4">載入中…</td></tr>';
  try{
    const data = await listUsers();
    usersTableBody.innerHTML = data.users.map(u=>`
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          <input type="password" placeholder="新密碼(>=6)" id="reset_${u.id}" />
          <button class="resetPwd" data-id="${u.id}">重設</button>
        </td>
      </tr>`).join('');
  }catch(e){
    usersTableBody.innerHTML = `<tr><td colspan="4">失敗：${e.message}</td></tr>`;
  }
}
usersTableBody.addEventListener('click', async (e)=>{
  const t=e.target;
  if (t.classList.contains('resetPwd')) {
    const id = Number(t.dataset.id);
    const input = document.getElementById(`reset_${id}`);
    const pwd = input.value;
    if (!pwd || pwd.length<6) return alert('新密碼至少 6 碼');
    try{ await resetPassword(id, pwd); input.value=''; alert('已重設'); }
    catch(err){ alert('重設失敗：'+err.message); }
  }
});

// ====== 事件 ======
seatSelect.addEventListener('change', ()=>{ renderSeatOrder(); });

toggleSubmitted.addEventListener('click', async ()=>{
  const seat = Number(seatSelect.value||1);
  const o = await getOrder(seat);
  o.submitted = !o.submitted;
  await saveOrder(seat, o);
  await renderSeatOrder(); await renderMissing();
});
clearSeat.addEventListener('click', async ()=>{
  const seat = Number(seatSelect.value||1);
  if (!confirm(`確定清空座號 ${seat} 的訂單？`)) return;
  await saveOrder(seat, { submitted:false, items:[] });
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
  o.items.push({ name: it.name, unitPrice: it.price, qty });
  await saveOrder(seat, o);
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
  o.items.push({ name, unitPrice:price, qty });
  await saveOrder(seat, o);
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
    await saveOrder(seat, o);
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
    await saveOrder(seat, o);
    await renderSeatOrder(); await renderAgg();
  }
});
useMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); await setActiveMenu(id); renderActiveMenu(); renderMenuPage(); });
addMenu.addEventListener('click', async ()=>{ const name = menuNewName.value.trim() || `新菜單 ${state.menus.length+1}`; await createMenu(name); await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立並置於清單尾端'); });
renameMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); const name = menuNewName.value.trim(); if (!name) return alert('請輸入新名稱'); await renameMenuReq(id, name); await loadMenus(); renderActiveMenu(); renderMenuPage(); });
dupMenu.addEventListener('click', async ()=>{
  const id = Number(menuSelect.value);
  const src = state.menus.find(x=>x.id===id); if (!src) return;
  await createMenu(src.name + '（副本）');
  const newMenu = state.menus[state.menus.length-1];
  for (const it of src.items) await addMenuItemReq(newMenu.id, it.name, it.price);
  await loadMenus(); renderActiveMenu(); renderMenuPage(); alert('已建立副本');
});
delMenu.addEventListener('click', async ()=>{ const id = Number(menuSelect.value); if (!confirm('確定刪除此菜單？')) return; await deleteMenuReq(id); await loadMenus(); renderActiveMenu(); renderMenuPage(); });
menuTableBody.addEventListener('input', async (e)=>{
  const t=e.target;
  if (t.classList.contains('nameEdit') || t.classList.contains('priceEdit')) {
    const id = Number(t.dataset.id);
    const tr = t.closest('tr');
    const name = tr.querySelector('.nameEdit').value;
    const price= Number(tr.querySelector('.priceEdit').value||0);
    await updateMenuItemReq(id, name, price);
    await loadMenus(); renderActiveMenu(); renderMenuPage(); renderAgg();
  }
});
menuTableBody.addEventListener('click', async (e)=>{
  const t=e.target;
  if (t.classList.contains('delItem')) {
    const id = Number(t.dataset.id);
    await deleteMenuItemReq(id);
    await loadMenus(); renderActiveMenu(); renderMenuPage();
  }
});

// ====== 初始化 ======
function renderSeatsThenDefault(){ renderSeats(); if (!seatSelect.value) seatSelect.value = '1'; }
function renderStatic(){ renderSeatsThenDefault(); }
async function initApp(){ await loadMenus(); renderActiveMenu(); renderMenuPage(); await renderSeatOrder(); if (state.me?.role==='admin'){ await renderAgg(); await renderMissing(); } }

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
