'use strict';
const { expect } = require('@playwright/test');
async function fixture(page, origin = 'https://127.0.0.1:4173', options = {}) {
  const date = '2026-10-19', batch = 'isolated-browser-batch';
  const empty = seat => ({ seat, orderId: seat, version: 0, date, batch, submitted: false, internalOnly: false, paid: false, items: [] });
  const model = { users: [{ id: 1, username: 'admin', role: 'admin', status: 'active' }, ...Array.from({ length: 36 }, (_, n) => ({ id: n+2, username: String(n+1), role: 'user', status: 'active' }))], creates: 0, fail: false, writes: 0, orders: Array.from({ length: 36 }, (_, i) => empty(i + 1)) };
  model.orders[0] = { ...empty(1), submitted: true, items: [{ id: 1, name: '測試雞腿飯', unitPrice: 95, qty: 2 }] };
  model.orders[1] = { ...empty(2), submitted: true, paid: true, items: [{ id: 2, name: '測試排骨飯', unitPrice: 100, qty: 1 }] };
  const user = { id: options.role === 'user' ? 3 : 1, username: options.role === 'user' ? '2' : 'admin', role: options.role || 'admin', mustChangePassword: !!options.mustChangePassword };
  model.initialPassword = 'isolated-browser-initial-credential';
  model.user = user;
  model.calls = [];
  const cors = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== 'https://lunch2.onrender.com') return route.abort();
    const method = request.method(), path = url.pathname.replace(/^\/api/, '');
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = request.postData() ? request.postDataJSON() : {};
    model.calls.push({ path, method, body });
    if (user.mustChangePassword && !['/auth/login', '/auth/me', '/auth/logout', `/users/${user.id}/password`].includes(path))
      return route.fulfill({ status: 403, json: { message: '請先修改初始密碼', code: 'PASSWORD_CHANGE_REQUIRED' }, headers: cors });
    let response;
    if (path === '/auth/login') response = { user, token: 'isolated-browser-token' };
    else if (path === '/auth/me') response = { user };
    else if (path === '/auth/logout') response = { ok: true };
    else if (/^\/users\/\d+\/password$/.test(path) && method === 'PUT') {
      if (body.resetTemporary) {
        if (!body.actorPassword) return route.fulfill({ status: 400, json: { message: '請輸入管理員密碼' }, headers: cors });
        response = { ok: true, initialPassword: 'isolated-browser-reset-credential', mustChangePassword: true };
      } else {
        const minimum = user.role === 'admin' ? 12 : 6;
        if (!body.oldPassword || Array.from(body.newPassword || '').length < minimum)
          return route.fulfill({ status: 400, json: { message: `密碼至少需要 ${minimum} 個字元` }, headers: cors });
        if (user.mustChangePassword && body.oldPassword !== model.initialPassword)
          return route.fulfill({ status: 400, json: { message: 'oldPassword incorrect' }, headers: cors });
        user.mustChangePassword = false; response = { ok: true };
      }
    }
    else if (path === '/seats') response = { seats: [...new Set([...Array.from({ length: 36 }, (_, i) => i+1), ...model.users.map(u => Number(u.username)).filter(n => Number.isInteger(n) && n > 0)])] };
    else if (path === '/open-status') response = { open: true };
    else if (path === '/settings/preorder') response = { enabled: true, dates: ['2026-10-20'] };
    else if (path === '/settings/manual-order') response = { locked: false };
    else if (path === '/menus') response = { menus: [{ id: 1, name: '隔離測試菜單', note: '', items: [{ id: 1, code: 1, name: '測試雞腿飯', price: 95 }] }], activeMenuId: 1 };
    else if (path === '/users' && method === 'GET') {
      if (model.userListFail) return route.fulfill({ status: 500, json: { message: '隔離測試：清單暫時無法取得' }, headers: cors });
      const pageNo = Number(url.searchParams.get('page') || 1);
      response = { users: url.searchParams.has('afterId') ? model.users.filter(u => u.id > Number(url.searchParams.get('afterId'))).slice(0,100) : model.users.slice((pageNo-1)*100,pageNo*100), total: model.users.length };
    } else if (path === '/users' && method === 'POST') {
      model.creates++;
      if (model.createGate) await model.createGate;
      if (model.createFail) return route.fulfill({ status: 400, json: { message: '隔離測試：帳號資料不符規定' }, headers: cors });
      if (model.users.some(u => u.username === body.username)) return route.fulfill({ status: 409, json: { message: '此帳號已存在' }, headers: cors });
      if ('password' in body) return route.fulfill({ status: 400, json: { message: '初始密碼由伺服器產生' }, headers: cors });
      const record = { id: Math.max(...model.users.map(u => u.id))+1, username: body.username, role: body.role, status: 'active', mustChangePassword: true };
      model.users.push(record);
      model.lastInitialPassword = `isolated-browser-unique-${record.id}`;
      response = { ...record, initialPassword: model.lastInitialPassword };
      const seat = Number(body.username);
      if (Number.isInteger(seat) && seat > 0 && !model.orders.some(o => o.seat === seat)) model.orders.push(empty(seat));
      if (model.failListAfterCreate) model.userListFail = true;
    } else if (path === '/orders') response = { date, batch, orders: model.orders };
    else if (/^\/orders\/\d+(?:\/paid)?$/.test(path)) {
      const seat = Number(path.split('/')[2]), order = model.orders.find(o => o.seat === seat);
      if (method === 'PUT') {
        model.writes++;
        if (model.fail) return route.fulfill({ status: 500, json: { message: '隔離測試：付款儲存失敗' }, headers: cors });
        if (body.version !== order.version || body.orderId !== order.orderId || body.date !== date || body.batch !== batch)
          return route.fulfill({ status: 409, json: { message: '訂單已變更' }, headers: cors });
        order.paid = body.paid; order.version++;
        response = { ok: true, order };
      } else response = order;
    } else if (path === '/reports/aggregate') response = { items: [], classTotal: 290 };
    else if (path === '/reports/missing') response = { missing: [] };
    else if (path === '/reports/unpaid') response = { list: [] };
    else if (path === '/logs') response = { logs: [] };
    else if (path === '/settings/open-window') response = { openDays: [1,2,3,4,5], openStart: '07:00', openEnd: '12:00' };
    else return route.fulfill({ status: 500, json: { message: 'Unmocked isolated route: ' + path }, headers: cors });
    return route.fulfill({ json: structuredClone(response), headers: cors });
  });
  await page.goto(origin + '/');
  await page.locator('#loginUser').fill(user.username);
  await page.locator('#loginPass').fill(user.mustChangePassword ? model.initialPassword : 'isolated-browser-password');
  await page.getByRole('button', { name: '登入', exact: true }).click();
  if (user.mustChangePassword) await expect(page.locator('#passwordChangeLayer')).toBeVisible();
  else if (user.role === 'admin') {
    await expect(page.locator('#adminAllSeats')).toBeVisible();
    await expect(page.locator('#allSeatsGrid .seat-card')).toHaveCount(36);
  } else await expect(page.locator('#app')).toBeVisible();
  return model;
}

module.exports = { fixture };
